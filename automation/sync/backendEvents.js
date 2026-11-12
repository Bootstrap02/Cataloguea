// Things the automation tells the backend besides the strategy state:
//   * a 6-0 win  -> the backend emails you the full details of the game (POST /betking/win)
//   * remote commands -> you ask the RUNNING automation to save or pause from anywhere (phone, another server):
//       curl -X POST <backend>/betking/command -H "x-sync-key: <key>" -H "content-type: application/json" -d '{"action":"save"}'
//     The automation asks the backend for waiting commands every few seconds (so no port has to be opened on your computer).
// Every failure is logged and never stops the run.

function createEventsClient({ url, key, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  const base = String(url).replace(/\/+$/, '');
  async function request(method, pathName, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${base}${pathName}`, {
        method,
        headers: { 'content-type': 'application/json', ...(key ? { 'x-sync-key': key } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      let json = null;
      try { json = await response.json(); } catch (error) { json = null; }
      return { status: response.status, body: json };
    } catch (error) {
      return { status: 0, body: { message: `cannot reach the server (${error.name === 'AbortError' ? 'timed out' : error.message})` } };
    } finally { clearTimeout(timer); }
  }
  return {
    sendWin: (event) => request('POST', '/betking/win', event),
    getCommand: () => request('GET', '/betking/command'),
    ackCommand: (id) => request('DELETE', `/betking/command?id=${encodeURIComponent(id)}`),
  };
}

// One event per winning team (one email each). The eventId is the same on every retry, so the backend never sends it twice.
function buildWinEvents({ round, rows, state, savedVersion = null, saveError = null, now = () => new Date() }) {
  const settled = Array.isArray(state?.settledRounds) ? state.settledRounds.length : 0;
  return rows.filter((row) => row.kind === 'winner' && row.won && row.result?.ft).map((row) => ({
    eventId: `${round?.name || 'round'}|${row.code}|n${settled}`,
    occurredAt: now().toISOString(),
    round: { name: round?.name ?? null, number: round?.number ?? null },
    savedVersion,
    saveError,
    win: {
      code: row.code, side: row.side, home: row.fixture.home, away: row.fixture.away,
      ft: { home: row.result.ft.home, away: row.result.ft.away },
      ht: row.result.ht ? { home: row.result.ht.home, away: row.result.ht.away } : null,
      stake: row.stake, odds: row.odds, returns: Math.round(row.stake * row.odds),
    },
  }));
}

async function emailWins({ client, events, log = () => {}, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), delaysMs = [0, 3000, 8000, 20000] }) {
  const outcomes = [];
  for (const event of events) {
    let done = false;
    let last = '';
    for (const wait of delaysMs) {
      if (wait) await sleep(wait);
      const response = await client.sendWin(event);
      if (response.status === 200 && response.body?.ok) {
        const b = response.body;
        log(b.sent ? `  Email sent: ${event.win.code} 6-0 at ${event.win.home} v ${event.win.away}.` : `  Email not needed: ${b.duplicate ? 'already sent before' : b.message || 'filtered'}.`);
        done = true; break;
      }
      last = `${response.status}${response.body?.message ? ` ${response.body.message}` : ''}`;
      if (response.status >= 400 && response.status < 500 && response.status !== 429) break;   // retrying will not help
    }
    if (!done) log(`  EMAIL NOT SENT for ${event.win.code} (${last}). Check the 6-0 yourself; the state is still saved.`);
    outcomes.push({ eventId: event.eventId, sent: done });
  }
  return outcomes;
}

// Watches for a command from the backend and runs it. `actions` = { save: async () => ..., pause: async () => ... }.
function startCommandPoller({ client, actions, log = () => {}, intervalMs = 10000, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
  let busy = false;
  let lastDone = null;
  let lastProblem = '';
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const response = await client.getCommand();
      if (response.status !== 200) {
        const problem = `${response.status}${response.body?.message ? ` ${response.body.message}` : ''}`;
        if (problem !== lastProblem) { log(`  Remote commands: cannot check (${problem}).`); lastProblem = problem; }
        return;
      }
      lastProblem = '';
      const command = response.body;
      if (!command?.pending || command.id === lastDone) return;
      const action = actions[command.action];
      if (!action) { log(`  Remote command "${command.action}" is not known here; ignored.`); lastDone = command.id; await client.ackCommand(command.id); return; }
      log(`  Remote command received: ${command.action}.`);
      let result;
      try { result = await action(); } catch (error) { result = { ok: false, message: error.message }; }
      log(`  Remote ${command.action}: ${result?.message || (result?.ok ? 'done' : 'failed')}`);
      lastDone = command.id;
      await client.ackCommand(command.id);   // acknowledged even if it failed, so it never repeats by itself: send it again to retry
    } finally { busy = false; }
  }
  const timer = setIntervalFn(tick, intervalMs);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return { tick, stop: () => clearIntervalFn(timer) };
}

module.exports = { createEventsClient, buildWinEvents, emailWins, startCommandPoller };
