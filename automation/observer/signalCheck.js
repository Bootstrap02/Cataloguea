// Runs the rules of engagement over the record book and the odds database, and sends the new signals.
//   * evaluated after each completed season, after each completed odds cycle, and once at start
//   * a signal is sent ONCE; again only when it grows (one more season missed) or its stake changes
//   * `send(signals)` returns the keys that were delivered; the others stay unsent and are retried at the next check
const fs = require('node:fs');
const path = require('node:path');
const { readMatches } = require('./charts');
const { buildPercentileTable, signalsFrom, tableToCsv, decideToSend, describe } = require('./rulesEngine');

function loadRules(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { return fallback; } };

async function runSignalCheck({ leagues, dir, rulesFile, send, log = () => {} }) {
  const rules = loadRules(rulesFile);
  const sentFile = path.join(dir, 'signals-sent.json');
  let sent = readJson(sentFile, {});
  const all = [];
  for (const league of leagues) {
    const folder = path.join(dir, league.key);
    const state = readJson(path.join(folder, 'state.json'), null);
    if (!state) continue;
    const { createOddsStore } = require('./oddsStore');
    const oddsRecords = createOddsStore({ dir, league }).latestCompleteRecords();
    if (!oddsRecords.length) { log(`  [signals ${league.key}] no complete odds cycle yet: no percentiles, so no signals.`); continue; }
    const rows = buildPercentileTable({ league, matches: readMatches(path.join(folder, 'matches.ndjson')), state, oddsRecords, rules });
    // the table itself, for you to open: every team x every stake option
    fs.writeFileSync(path.join(folder, 'percentile-table.csv'), tableToCsv(rows));
    fs.writeFileSync(path.join(folder, 'percentile-table.json'), `${JSON.stringify({ league: league.key, builtAt: new Date().toISOString(), rules: { multiplier: rules.multiplier }, rows }, null, 2)}\n`);
    all.push(...signalsFrom(rows));
  }
  const { toSend, next } = decideToSend(all, sent);
  const delivered = toSend.length ? new Set(await send(toSend.map((item) => item.signal), rules)) : new Set();
  const kept = { ...next };
  for (const { key, signal } of toSend) {
    if (!delivered.has(`${signal.league}|${signal.team}|${signal.optionId}`)) { if (sent[key]) kept[key] = sent[key]; else delete kept[key]; }
  }
  fs.writeFileSync(sentFile, `${JSON.stringify(kept, null, 2)}\n`);
  log(`  [signals] ${all.length} rule(s) met right now, ${toSend.length} new or grown, ${delivered.size} delivered.`);
  for (const { signal } of toSend) for (const line of describe(signal)) log(`      ${line}`);
  return { met: all.length, sent: delivered.size };
}

// Delivers signals to the backend (/betking/signal): one email + one Telegram message each, never twice for the same id.
async function sendToBackend({ url, key, project, signals, log = () => {}, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const delivered = [];
  for (const signal of signals) {
    const event = { eventId: `sig|${signal.league}|${signal.team}|${signal.optionId}|${signal.missed}|${signal.stake}`, project, occurredAt: new Date().toISOString(), signal };
    for (const wait of [0, 3000, 8000]) {
      if (wait) await sleep(wait);
      try {
        const response = await fetchImpl(`${String(url).replace(/\/+$/, '')}/betking/signal`, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-sync-key': key } : {}) }, body: JSON.stringify(event) });
        if (response.status === 200) { delivered.push(`${signal.league}|${signal.team}|${signal.optionId}`); break; }
        if (response.status >= 400 && response.status < 500 && response.status !== 429) { log(`  signal ${signal.team}: refused (${response.status}).`); break; }
      } catch (error) { /* try again */ }
    }
  }
  return delivered;
}

module.exports = { runSignalCheck, sendToBackend, loadRules };
