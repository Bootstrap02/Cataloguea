// Keeping the strategy memory on the server, so any device can carry on where another stopped.
//
// Rules (the server holds ONE state with a version number):
//  * a push builds on the version this device last saw; if another device saved since, the server refuses (conflict)
//    and nothing is overwritten;
//  * at every start the server is asked first: if it holds a newer state and this device has no unsent changes, the
//    newer state is pulled in (a backup of the old one is kept); if both changed, it stops and tells you;
//  * pushes happen after every settled round (and at once on a 6-0 win), or by hand.

const crypto = require('node:crypto');

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

const hashState = (state) => crypto.createHash('sha256').update(stableStringify(state)).digest('hex');

const API_PATH = '/betking';

function createSyncClient({ url, key, deviceId, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  const base = String(url).replace(/\/+$/, '');
  async function request(method, pathName, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${base}${pathName}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-sync-key': key },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      let json = null;
      try { json = await response.json(); } catch (error) { json = null; }
      return { status: response.status, body: json };
    } catch (error) {
      const err = new Error(`cannot reach the server (${error.name === 'AbortError' ? 'timed out' : error.message})`);
      err.unreachable = true;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    // the BetKing API of your backend (the existing /betking route, now holding the La Liga strategy state)
    getState: () => request('GET', API_PATH),
    putState: (payload) => request('PUT', API_PATH, { ...payload, deviceId }),
    listHistory: (limit = 20) => request('GET', `${API_PATH}/history?limit=${limit}`),
    getHistoryState: (version) => request('GET', `${API_PATH}/history/${version}`),
  };
}

const problemOf = (response) => (response.status === 401 ? 'the sync key is wrong' : response.status === 503 ? 'the server has no LALIGA_SYNC_KEY set up' : `server answered ${response.status}${response.body?.message ? `: ${response.body.message}` : ''}`);

// io: { readState(), writeState(state), readMeta(), writeMeta(meta), backupState(label) }
function createSyncManager({ client, io, log = () => {}, deviceId = 'this-device', now = () => new Date().toISOString() }) {
  async function push({ reason = 'manual', force = false } = {}) {
    const state = io.readState();
    if (!state) return { ok: false, error: 'there is no local strategy state to send' };
    const meta = io.readMeta();
    let response;
    try {
      response = await client.putState({ state, baseVersion: meta?.version ?? 0, reason, force });
    } catch (error) {
      return { ok: false, unreachable: true, error: error.message };
    }
    if (response.status === 200 && response.body?.ok) {
      io.writeMeta({ version: response.body.version, hash: hashState(state), deviceId, syncedAt: now() });
      return { ok: true, version: response.body.version };
    }
    if (response.status === 409) return { ok: false, conflict: true, serverVersion: response.body?.serverVersion, serverDeviceId: response.body?.serverDeviceId, serverReason: response.body?.serverReason, error: response.body?.message };
    return { ok: false, error: problemOf(response) };
  }

  async function pull({ version = null } = {}) {
    let current;
    try { current = await client.getState(); } catch (error) { return { ok: false, unreachable: true, error: error.message }; }
    if (current.status !== 200) return { ok: false, error: problemOf(current) };
    if (!current.body.exists) return { ok: false, error: 'the server has no saved state yet' };
    let state = current.body.state;
    if (version !== null) {
      let old;
      try { old = await client.getHistoryState(version); } catch (error) { return { ok: false, unreachable: true, error: error.message }; }
      if (old.status !== 200) return { ok: false, error: problemOf(old) };
      state = old.body.state;
    }
    const hadLocal = Boolean(io.readState());
    if (hadLocal) io.backupState('before-pull');
    io.writeState(state);
    // the meta describes the SERVER's current state; a restored older version therefore counts as a local change
    io.writeMeta({ version: current.body.version, hash: hashState(current.body.state), deviceId, syncedAt: now() });
    return { ok: true, version: current.body.version, restoredVersion: version, summary: current.body.summary, backedUp: hadLocal };
  }

  // Called once at every start, before the strategy state is loaded.
  async function startup() {
    let remote;
    try { remote = await client.getState(); } catch (error) { return { status: 'unreachable', message: error.message }; }
    if (remote.status !== 200) return { status: 'error', message: problemOf(remote) };
    const local = io.readState();
    const meta = io.readMeta();
    if (!remote.body.exists) {
      if (!local) return { status: 'ok', note: 'nothing saved on the server yet' };
      const sent = await push({ reason: 'first-sync' });
      return sent.ok ? { status: 'pushed', version: sent.version, note: 'the server had nothing: this device\'s state was sent' } : { status: sent.unreachable ? 'unreachable' : 'error', message: sent.error };
    }
    const server = remote.body;
    if (!local) {
      const pulled = await pull();
      return pulled.ok ? { status: 'pulled', version: pulled.version, summary: pulled.summary } : { status: 'error', message: pulled.error };
    }
    const localChanged = !meta || hashState(local) !== meta.hash;
    const conflict = (why) => ({ status: 'conflict', message: why, serverVersion: server.version, serverDeviceId: server.deviceId, serverReason: server.reason, updatedAt: server.updatedAt });
    if (!meta) return conflict('This device has a strategy state that was never synced, and the server also has one.');
    if (meta.version === server.version) {
      if (!localChanged) return { status: 'ok', version: server.version };
      const sent = await push({ reason: 'catch-up' });
      return sent.ok ? { status: 'pushed', version: sent.version, note: 'changes from the last session were sent' } : (sent.conflict ? conflict(sent.error) : { status: 'error', message: sent.error });
    }
    if (server.version > meta.version) {
      if (localChanged) return conflict('Another device saved a newer state, and this device also has changes that were never sent.');
      const pulled = await pull();
      return pulled.ok ? { status: 'pulled', version: pulled.version, summary: pulled.summary, note: `the server had a newer state (from ${server.deviceId || 'another device'}, ${server.reason || 'sync'})` } : { status: 'error', message: pulled.error };
    }
    return conflict('The server holds an OLDER version than this device last saw (was the server reset?).');
  }

  async function status() {
    const local = io.readState();
    const meta = io.readMeta();
    let server = null;
    let error = null;
    try {
      const response = await client.getState();
      if (response.status === 200) server = response.body; else error = problemOf(response);
    } catch (caught) { error = caught.message; }
    return {
      local: local ? { hash: hashState(local), changedSinceSync: !meta || hashState(local) !== meta.hash, openRound: Boolean(local.open), settledRounds: (local.settledRounds || []).length } : null,
      meta, server, error,
      inSync: Boolean(local && meta && server?.exists && meta.version === server.version && hashState(local) === meta.hash),
    };
  }

  return { push, pull, startup, status };
}

module.exports = { createSyncClient, createSyncManager, hashState, stableStringify };
