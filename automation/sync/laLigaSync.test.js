const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSyncClient, createSyncManager, hashState, stableStringify } = require('./laLigaSync');
const { createFileIo, loadSyncConfig, saveSyncConfig, getDeviceId, ensureGitignored } = require('./syncFiles');

const stateWith = (bank, extra = {}) => ({ winners: ['BAR', 'RMA'], bases: { BAR: 5000, RMA: 5000 }, smallDeficits: { BAR: 0, RMA: 0 }, privateDef: { ATM: 70 }, bigDef: {}, brokenTarget: {}, bank, ...extra });

// a pretend server with the same rules as the real one
function fakeServer() {
  const server = { doc: null, history: [], down: false, key: 'k' };
  const fetchImpl = async (url, options) => {
    if (server.down) throw new Error('network down');
    if (options.headers['x-sync-key'] !== server.key) return { status: 401, json: async () => ({ message: 'Wrong or missing sync key.' }) };
    const pathName = url.replace(/^https?:\/\/[^/]+/, '');
    if (options.method === 'GET' && pathName === '/betking') {
      return { status: 200, json: async () => (server.doc ? { exists: true, ...server.doc, summary: {} } : { exists: false }) };
    }
    if (options.method === 'PUT' && pathName === '/betking') {
      const body = JSON.parse(options.body);
      if (!server.doc) { server.doc = { version: 1, state: body.state, deviceId: body.deviceId, reason: body.reason }; return { status: 200, json: async () => ({ ok: true, version: 1 }) }; }
      if (body.baseVersion !== server.doc.version && !body.force) return { status: 409, json: async () => ({ message: 'Another device saved a newer state.', serverVersion: server.doc.version, serverDeviceId: server.doc.deviceId, serverReason: server.doc.reason }) };
      server.history.push(server.doc);
      server.doc = { version: server.doc.version + 1, state: body.state, deviceId: body.deviceId, reason: body.reason };
      return { status: 200, json: async () => ({ ok: true, version: server.doc.version }) };
    }
    const history = /^\/betking\/history\/(\d+)/.exec(pathName);
    if (history) {
      const row = server.history.find((item) => item.version === Number(history[1]));
      return row ? { status: 200, json: async () => row } : { status: 404, json: async () => ({ message: 'none' }) };
    }
    return { status: 404, json: async () => ({}) };
  };
  return { server, fetchImpl };
}

// a device: its own state file, sync note and backups (in memory)
function device(name, server) {
  const files = { state: null, meta: null, backups: [] };
  const io = {
    readState: () => (files.state ? JSON.parse(JSON.stringify(files.state)) : null),
    writeState: (state) => { files.state = JSON.parse(JSON.stringify(state)); },
    readMeta: () => files.meta,
    writeMeta: (meta) => { files.meta = meta; },
    backupState: (label) => { files.backups.push(label); },
  };
  const client = createSyncClient({ url: 'https://example.test', key: server.key, deviceId: name, fetchImpl: server.fetchImpl });
  const manager = createSyncManager({ client, io, deviceId: name });
  return { files, io, manager };
}

test('the first device sends its state; a second, empty device pulls it and carries on', async () => {
  const fake = fakeServer();
  fake.server.fetchImpl = fake.fetchImpl;
  const laptop = device('laptop', fake.server);
  laptop.io.writeState(stateWith(10));
  assert.equal((await laptop.manager.startup()).status, 'pushed');
  const phone = device('phone', fake.server);
  const outcome = await phone.manager.startup();
  assert.equal(outcome.status, 'pulled');
  assert.deepEqual(phone.files.state, stateWith(10));
  assert.equal(phone.files.meta.version, 1);
});

test('a push builds on the last seen version: the second push works, a stale device is refused and nothing is overwritten', async () => {
  const fake = fakeServer();
  fake.server.fetchImpl = fake.fetchImpl;
  const laptop = device('laptop', fake.server);
  const phone = device('phone', fake.server);
  laptop.io.writeState(stateWith(1));
  await laptop.manager.startup();
  await phone.manager.startup();
  laptop.io.writeState(stateWith(2));
  assert.equal((await laptop.manager.push({ reason: 'round' })).version, 2);
  phone.io.writeState(stateWith(99));
  const refused = await phone.manager.push({ reason: 'round' });
  assert.equal(refused.conflict, true);
  assert.equal(fake.server.doc.state.bank, 2, 'the server still holds the laptop\'s state');
});

test('at start, a newer server state is pulled in when this device has no unsent changes (the old state is backed up)', async () => {
  const fake = fakeServer();
  fake.server.fetchImpl = fake.fetchImpl;
  const laptop = device('laptop', fake.server);
  const phone = device('phone', fake.server);
  laptop.io.writeState(stateWith(1));
  await laptop.manager.startup();
  await phone.manager.startup();
  laptop.io.writeState(stateWith(5));
  await laptop.manager.push({ reason: 'six-nil-win' });
  const outcome = await phone.manager.startup();
  assert.equal(outcome.status, 'pulled');
  assert.equal(phone.files.state.bank, 5);
  assert.deepEqual(phone.files.backups, ['before-pull']);
});

test('when both devices changed, the start stops with a conflict instead of choosing', async () => {
  const fake = fakeServer();
  fake.server.fetchImpl = fake.fetchImpl;
  const laptop = device('laptop', fake.server);
  const phone = device('phone', fake.server);
  laptop.io.writeState(stateWith(1));
  await laptop.manager.startup();
  await phone.manager.startup();
  laptop.io.writeState(stateWith(5));
  await laptop.manager.push({ reason: 'round' });
  phone.io.writeState(stateWith(7));      // the phone played on without syncing
  const outcome = await phone.manager.startup();
  assert.equal(outcome.status, 'conflict');
  assert.equal(phone.files.state.bank, 7, 'nothing was overwritten');
  const forced = await phone.manager.push({ reason: 'manual', force: true });
  assert.equal(forced.ok, true);
  assert.equal(fake.server.doc.state.bank, 7);
});

test('unsent changes from the last session are sent at the next start (catch-up)', async () => {
  const fake = fakeServer();
  fake.server.fetchImpl = fake.fetchImpl;
  const laptop = device('laptop', fake.server);
  laptop.io.writeState(stateWith(1));
  await laptop.manager.startup();
  laptop.io.writeState(stateWith(4));     // played a round, the push failed or the app was closed
  const outcome = await laptop.manager.startup();
  assert.equal(outcome.status, 'pushed');
  assert.equal(fake.server.doc.state.bank, 4);
});

test('a local state that was never synced while the server has another is a conflict; the wrong key and a dead network are reported plainly', async () => {
  const fake = fakeServer();
  fake.server.fetchImpl = fake.fetchImpl;
  const laptop = device('laptop', fake.server);
  laptop.io.writeState(stateWith(1));
  await laptop.manager.startup();
  const phone = device('phone', fake.server);
  phone.io.writeState(stateWith(8));      // an old, never-synced file on the phone
  assert.equal((await phone.manager.startup()).status, 'conflict');
  const wrong = device('thief', fake.server);
  wrong.manager = createSyncManager({ client: createSyncClient({ url: 'https://example.test', key: 'nope', deviceId: 'x', fetchImpl: fake.fetchImpl }), io: wrong.io });
  const bad = await wrong.manager.startup();
  assert.equal(bad.status, 'error');
  assert.match(bad.message, /sync key/);
  fake.server.down = true;
  assert.equal((await phone.manager.startup()).status, 'unreachable');
});

test('an older version can be restored from the history, and counts as a local change to send', async () => {
  const fake = fakeServer();
  fake.server.fetchImpl = fake.fetchImpl;
  const laptop = device('laptop', fake.server);
  laptop.io.writeState(stateWith(1));
  await laptop.manager.startup();
  laptop.io.writeState(stateWith(2));
  await laptop.manager.push({ reason: 'round' });
  const restored = await laptop.manager.pull({ version: 1 });
  assert.equal(restored.ok, true);
  assert.equal(laptop.files.state.bank, 1);
  const status = await laptop.manager.status();
  assert.equal(status.local.changedSinceSync, true);
});

test('the state hash does not depend on key order', () => {
  assert.equal(hashState({ a: 1, b: { c: 2, d: [3, { e: 4, f: 5 }] } }), hashState({ b: { d: [3, { f: 5, e: 4 }], c: 2 }, a: 1 }));
  assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test('settings come from the environment or laliga-sync.json, the device name is kept, and the settings file is kept out of GitHub', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-'));
  const file = path.join(dir, 'laliga-sync.json');
  assert.equal(loadSyncConfig({ env: {}, file }).configured, false);
  saveSyncConfig(file, { url: 'https://x.vercel.app', key: 'secret', mode: 'win' });
  const config = loadSyncConfig({ env: {}, file });
  assert.deepEqual([config.configured, config.url, config.mode], [true, 'https://x.vercel.app', 'win']);
  assert.equal(loadSyncConfig({ env: { LALIGA_SYNC: 'off' }, file }).mode, 'off');
  assert.equal(loadSyncConfig({ env: { LALIGA_SYNC: 'nonsense' }, file }).mode, 'round');
  const deviceFile = path.join(dir, 'device.json');
  assert.equal(getDeviceId(deviceFile), getDeviceId(deviceFile));
  saveSyncConfig(file, { url: 'https://only-an-address.example', key: '', mode: 'round' });
  assert.equal(loadSyncConfig({ env: {}, file }).configured, true, 'the address alone is enough');
  assert.equal(ensureGitignored(dir, 'laliga-sync.json'), true);
  assert.equal(ensureGitignored(dir, 'laliga-sync.json'), false);
  const io = createFileIo({ stateFile: path.join(dir, 's.json'), metaFile: path.join(dir, 'm.json'), backupDir: path.join(dir, 'b') });
  io.writeState({ a: 1 });
  assert.ok(io.backupState('x').includes('laliga-state-x-'));
  assert.deepEqual(io.readState(), { a: 1 });
});

test('a device knows whether it has changes the server has not seen', async () => {
  const fake = fakeServer();
  fake.server.fetchImpl = fake.fetchImpl;
  const laptop = device('laptop', fake.server);
  laptop.io.writeState(stateWith(1));
  assert.equal(laptop.manager.unsent(), true);
  await laptop.manager.startup();
  assert.equal(laptop.manager.unsent(), false);
  laptop.io.writeState(stateWith(2));
  assert.equal(laptop.manager.unsent(), true);
});

test('with no key set on the client the header is simply not sent (an open backend accepts it)', async () => {
  let seen = null;
  const client = createSyncClient({ url: 'https://example.test', key: '', deviceId: 'x', fetchImpl: async (url, options) => { seen = options.headers; return { status: 200, json: async () => ({ exists: false }) }; } });
  await client.getState();
  assert.equal('x-sync-key' in seen, false);
});
