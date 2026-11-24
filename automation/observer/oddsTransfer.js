// The two halves of the hand-over through the shared database (the backend):
//   createOddsUploader  (the ODDS COLLECTOR) waits until a cycle is FINISHED, then sends all its rounds and tells the backend
//                       the cycle is complete; the backend then OVERWRITES what it had. The odds stay on this computer
//                       meanwhile, so a restart loses nothing. If the upload fails it is retried at the next look
//                       and carries on from the rounds already sent.
//   pullLatestOdds      (the RESULTS RECORDER) asks for the newest complete cycle and keeps it locally.
// Both talk to /betking/odds/* with the sync key; a sleeping free-tier backend gets up to 75 seconds to wake.
const DEFAULT_DELAYS = [0, 3000, 8000];

const { teamOptionOdds } = require('./rulesEngine');

function createHttp({ url, key, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), timeoutMs = 75000, delaysMs = DEFAULT_DELAYS }) {
  const base = String(url).replace(/\/+$/, '');
  return async function request(method, pathName, body) {
    let last = { status: 0, body: { message: 'no answer' } };
    for (const wait of delaysMs) {
      if (wait) await sleep(wait);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${base}${pathName}`, {
          method, headers: { 'content-type': 'application/json', ...(key ? { 'x-sync-key': key } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
        });
        let parsed = null;
        try { parsed = await response.json(); } catch (error) { parsed = null; }
        last = { status: response.status, body: parsed };
        if (response.status < 500 && response.status !== 429) return last;   // answered: retrying will not change a 4xx
      } catch (error) {
        last = { status: 0, body: { message: error.name === 'AbortError' ? 'the server did not answer in time' : error.message } };
      } finally { clearTimeout(timer); }
    }
    return last;
  };
}

// ---------- the collector's side ----------
function fixturesByWeek(records) {
  const weeks = new Map();
  const fixtures = new Map();
  for (const record of records) {
    const fixtureKey = `${record.week}|${record.home}|${record.away}`;
    let fixture = fixtures.get(fixtureKey);
    if (!fixture) {
      fixture = { home: record.home, away: record.away, odds: {} };
      fixtures.set(fixtureKey, fixture);
      (weeks.get(record.week) || weeks.set(record.week, []).get(record.week)).push(fixture);
    }
    (fixture.odds[record.group] || (fixture.odds[record.group] = {}))[record.sel] = record.odd;
  }
  return weeks;
}

function createOddsUploader({ url, key, league, store, log = () => {}, fetchImpl, sleep, batch = 8 }) {
  const request = createHttp({ url, key, fetchImpl, sleep });
  async function sync() {
    const state = store.loadState();
    const progress = { ...(state.uploadProgress || {}) };
    const info = state.cycleInfo || {};
    let sentAny = false;
    for (const cycleId of store.cycleIds().slice(-3)) {
      const entry = progress[cycleId] || { weeks: [], completeSent: false };
      if (entry.completeSent) continue;
      if (!info[cycleId]) continue;   // still collecting: nothing is sent before the cycle is finished
      const byWeek = fixturesByWeek(store.readCycle(cycleId));
      const todo = [...byWeek.keys()].filter((week) => !entry.weeks.includes(week)).sort((a, b) => a - b);
      for (let i = 0; i < todo.length; i += batch) {
        const part = todo.slice(i, i + batch);
        const answer = await request('POST', '/betking/odds/weeks', { league: league.key, cycleId, weeks: part.map((week) => ({ week, fixtures: byWeek.get(week) })) });
        if (answer.status !== 200) { log(`  [upload ${league.key}] not uploaded (${answer.status} ${answer.body?.message || ''}); it will be tried again at the next visit.`); progress[cycleId] = entry; store.saveState({ ...store.loadState(), uploadProgress: progress }); return { ok: false }; }
        entry.weeks.push(...part);
        sentAny = true;
      }
      progress[cycleId] = entry;
      const finished = info[cycleId];
      if (finished && finished.recorded.every((week) => entry.weeks.includes(week))) {
        // the table the owner looks at: every team and every stake option with its odds, week by week
        const table = teamOptionOdds(store.readCycle(cycleId));
        const answer = await request('POST', '/betking/odds/complete', { league: league.key, cycleId, weeks: finished.recorded, missing: finished.missing || [], partial: Boolean(finished.partial), table });
        if (answer.status === 200) { entry.completeSent = true; log(`  [upload ${league.key}] cycle ${cycleId.slice(0, 16)} uploaded and marked COMPLETE (${finished.recorded.length} rounds).`); }
        else log(`  [upload ${league.key}] could not mark the cycle complete (${answer.status} ${answer.body?.message || ''}); it will be tried again.`);
      }
    }
    store.saveState({ ...store.loadState(), uploadProgress: progress });
    return { ok: true, sentAny };
  }
  return { sync };
}

// ---------- the recorder's side ----------
function weeksToRecords(cycleId, weeks) {
  const records = [];
  for (const item of weeks) {
    for (const fixture of item.fixtures) {
      for (const [group, selections] of Object.entries(fixture.odds || {})) {
        for (const [sel, odd] of Object.entries(selections)) records.push({ week: item.week, home: fixture.home, away: fixture.away, group, sel, odd });
      }
    }
  }
  return records.map((record) => ({ cycle: cycleId, ...record }));
}

async function pullLatestOdds({ url, key, league, store, log = () => {}, fetchImpl, sleep, keep = 3 }) {
  const request = createHttp({ url, key, fetchImpl, sleep });
  const state = store.loadState();
  const have = state.pulledCycleId ? `&have=${encodeURIComponent(state.pulledCycleId)}` : '';
  const answer = await request('GET', `/betking/odds/latest?league=${league.key}${have}`);
  if (answer.status !== 200) { log(`  [odds ${league.key}] could not ask the database (${answer.status} ${answer.body?.message || ''}).`); return { changed: false, ok: false }; }
  const body = answer.body || {};
  if (body.none || body.unchanged) return { changed: false, ok: true };
  const records = weeksToRecords(body.cycleId, body.weeks || []);
  const added = store.importCycle(body.cycleId, records);
  if (added) {
    if (body.table) { try { require('node:fs').writeFileSync(require('node:path').join(store.folder, 'odds-table.json'), `${JSON.stringify({ cycleId: body.cycleId, table: body.table })}\n`); } catch (error) { /* the table is a convenience copy */ } }
    const keepIds = store.loadState().completeCycles.slice(-keep);
    store.prune(keepIds);
    log(`  [odds ${league.key}] NEW odds cycle received from the database: ${body.weeks.length} rounds${body.partial ? ` (missing ${body.missing.join(', ')})` : ''}.`);
  }
  return { changed: added, ok: true, cycleId: body.cycleId };
}

module.exports = { createOddsUploader, pullLatestOdds, createHttp, fixturesByWeek, weeksToRecords };
