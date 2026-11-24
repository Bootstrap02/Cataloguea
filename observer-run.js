// CATALOGUEA RESULTS RECORDER. It records the results of the four BetKing virtual leagues and turns them into signals.
// It never bets, never types, never logs in. It does NOT take odds (that is the other project, the odds collector).
//
//   node observer-run.js                      all four leagues, round after round, until you press Ctrl-C
//   node observer-run.js --once               one visit to every league, then stop (a quick check)
//   node observer-run.js --league epl,laliga  only some leagues (epl, laliga, seriea, bundesliga)
//   node observer-run.js --account second     use another saved browser profile (default: "observer", never logged in)
//   node observer-run.js --headless           no browser window (OBSERVER_HEADLESS=yes does the same)
//   node observer-run.js --no-sync            no backend: no notices, no odds from the database, no signals
//
// What it does:
//  1. Every 25 minutes (Bundesliga every 12) it opens each league's Results window (the last 10 rounds = 30 minutes of
//     play, Bundesliga 15) and records the rounds it has not recorded yet. A visit that fails is retried within 2 minutes,
//     because the window only remembers 30 minutes.
//  2. At start, and then every 30 minutes (so also at 12 a.m. every day), it asks the shared database (the backend) for the
//     odds the collector has completed, and keeps them in its own local odds state. A new cycle replaces the old one.
//  2b. Every day it checks the age of the records: when they span more than 183 days (about 6 months) the OLDEST 30 days are
//     removed (so about once a month). The newest records are never touched.
//  3. After each completed season, and after each new odds cycle, it applies the rules of engagement
//     (automation/observer/rules-of-engagement/rules.json) and sends new signals (email + Telegram) through the backend.
// Records: automation/artifacts/observer/<league>/  (matches.ndjson, state.json, odds.ndjson)   Log: observer.log

process.env.AUTOMATION_MODE = 'betking-live';
const fs = require('node:fs');
const path = require('node:path');
const { createBetKingLiveConfig } = require('./automation/betkingLiveConfig');
const { resolveLeagues } = require('./automation/observer/leagues');
const { createObserverStore } = require('./automation/observer/observerStore');
const { createResultsWindow } = require('./automation/observer/resultsWindow');
const { createVisitSchedule } = require('./automation/observer/visitSchedule');
const { createOddsStore } = require('./automation/observer/oddsStore');
const { pullLatestOdds } = require('./automation/observer/oddsTransfer');
const { pruneObserverRecords } = require('./automation/observer/retention');
const { runSignalCheck, sendToBackend } = require('./automation/observer/signalCheck');
const { argValue, sleep, lagosClock, createLog, loadBackend, createAnnouncer, launchBrowser, listUrlFor } = require('./automation/observer/runtime');

const ODDS_PULL_EVERY_MIN = Number(process.env.OBSERVER_ODDS_PULL_MIN) || 30;
const RETRY_AFTER_FAILURE_MS = 2 * 60 * 1000;

async function main() {
  const argv = process.argv;
  const config = createBetKingLiveConfig(process.env);
  const once = argv.includes('--once');
  const account = (argValue(argv, '--account') || 'observer').replace(/[^a-z0-9_-]/gi, '');
  const headless = argv.includes('--headless') || process.env.OBSERVER_HEADLESS === 'yes';
  const leagues = resolveLeagues(argValue(argv, '--league') || process.env.OBSERVER_LEAGUES);
  if (!leagues.length) { console.error('No such league. Use: epl, laliga, seriea, bundesliga'); process.exit(1); }

  const dir = path.join(__dirname, 'automation', 'artifacts', 'observer');
  const evidenceDir = path.join(dir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const log = createLog(dir);
  const projectName = process.env.LALIGA_PROJECT_NAME || 'Cataloguea Results Recorder';
  const backend = loadBackend(__dirname, argv);
  const announce = createAnnouncer({ backend, projectName, account, log });

  const { context, profileDir } = await launchBrowser({ config, account, headless });
  const page = context.pages()[0] || await context.newPage();
  const listUrl = listUrlFor(config);
  const saveEvidence = async (name, text) => { try { fs.writeFileSync(path.join(evidenceDir, `${name}.txt`), `${text}\n`); } catch (error) { /* evidence only */ } };
  const reader = createResultsWindow({ page, log, listUrl, evidence: saveEvidence });
  const stores = Object.fromEntries(leagues.map((league) => [league.key, createObserverStore({ dir, league })]));
  const oddsStores = Object.fromEntries(leagues.map((league) => [league.key, createOddsStore({ dir, league })]));
  const schedule = createVisitSchedule(leagues);
  const pullSchedule = createVisitSchedule(leagues.map((league) => ({ ...league, everyMin: ODDS_PULL_EVERY_MIN })));
  const pruneSchedule = createVisitSchedule(leagues.map((league) => ({ ...league, everyMin: 24 * 60 })));   // checked once a day
  const failures = Object.fromEntries(leagues.map((league) => [league.key, 0]));

  let stopping = false;
  process.on('SIGINT', () => { if (stopping) process.exit(130); stopping = true; log('\nStop requested: the visit in hand is finished first (Ctrl-C again to stop at once).'); });

  const waitOnline = async (maxMs) => {
    const until = Date.now() + maxMs;
    while (Date.now() < until) {
      if (await page.evaluate(() => navigator.onLine).catch(() => false)) return true;
      await sleep(500);
    }
    return false;
  };

  // ---- the rules of engagement: new signals go to the backend (email + Telegram) ----
  const rulesFile = path.join(__dirname, 'automation', 'observer', 'rules-of-engagement', 'rules.json');
  async function checkSignals(why) {
    try {
      log(`  [signals] checking the rules of engagement (${why}).`);
      await runSignalCheck({
        leagues, dir, rulesFile, log,
        send: async (signals) => {
          if (!backend) { log('  [signals] signals found, but no backend is set up (npm run laliga:sync-setup), so they were not sent.'); return []; }
          return sendToBackend({ url: backend.url, key: backend.key, project: projectName, signals, log });
        },
      });
    } catch (error) { log(`  [signals] check failed: ${String(error.message).split('\n')[0]}`); }
  }

  function report(league, cards, result) {
    const weeks = cards.map((card) => card.week);
    const shown = weeks.length ? `Week ${Math.min(...weeks)}-${Math.max(...weeks)}` : 'none';
    const state = result.state;
    const season = state.seasons[state.season] || {};
    for (const event of result.events) {
      if (event.type === 'season-started') log(`  [${league.key}] NEW SEASON ${event.season} began (first week seen: ${event.firstWeek}${event.partial ? ', so the first weeks of it were missed' : ''}).`);
      if (event.type === 'season-complete') log(`  [${league.key}] Season ${event.season} is COMPLETE (week ${league.weeks} recorded${(season.gaps || []).length ? `, but ${season.gaps.length} week(s) were missed, so it will not count for streaks` : ''}).`);
      if (event.type === 'gap') log(`  [${league.key}] GAP: Week ${event.from}${event.to > event.from ? `-${event.to}` : ''} of season ${event.season} was never seen (the window only keeps the last 10 rounds). That season can no longer count as a season without a result.`);
    }
    const newWeeks = result.events.filter((event) => event.type === 'week').map((event) => event.week);
    log(`  [${league.key}] ${lagosClock()} window showed ${cards.length} round(s) (${shown}). ${newWeeks.length ? `Recorded NEW: Week ${newWeeks.join(', ')} (${result.matches} matches).` : 'Nothing new.'} Season ${state.season}: ${season.weeks || 0} week(s) kept, last = Week ${state.lastWeek} of ${league.weeks}.`);
  }

  async function visit(league) {
    for (let attempt = 1; attempt <= 3 && !stopping; attempt += 1) {
      try {
        const { cards } = await reader.readCards(league);
        if (!cards.some((card) => card.complete)) throw new Error('the Results window showed no finished round');
        const ingested = stores[league.key].ingest(cards);
        report(league, cards, ingested);
        failures[league.key] = 0;
        if (ingested.events.some((event) => event.type === 'season-complete')) await checkSignals(`${league.key}: a season is complete`);
        return true;
      } catch (error) {
        log(`  [${league.key}] problem: ${String(error.message).split('\n')[0]}. Waiting for the network (up to 10 seconds), reloading the page, trying again (${attempt}/3).`);
        try {
          const bodyText = (await page.evaluate(() => document.body.innerText || '').catch(() => '')).slice(0, 3000);
          await saveEvidence(`failed-${league.key}`, `${error.message}\n---- page text ----\n${bodyText}`);
          await page.screenshot({ path: path.join(evidenceDir, `failed-${league.key}.png`) }).catch(() => {});
        } catch (ignored) { /* evidence only */ }
        await waitOnline(10000);
        await reader.closeWindow().catch(() => {});
        await reader.reloadList().catch(() => {});
      }
    }
    failures[league.key] += 1;
    log(`  [${league.key}] NO RECORD this time (${failures[league.key]} visit(s) in a row). Trying again in 2 minutes: the window only keeps the last ${10 * league.roundMin} minutes.`);
    return false;
  }

  // the record book does not grow for ever: older than 183 days -> the oldest 30 days go
  async function pruneRecords(league) {
    try {
      const result = await pruneObserverRecords({ dir, league });
      if (result.pruned > 0) log(`  [${league.key}] RETENTION: the records spanned ${result.spanDays} days (limit 183). Removed the oldest 30 days (${result.pruned} matches, up to ${result.cutoff.slice(0, 10)}). Kept ${result.kept}.`);
    } catch (error) { log(`  [${league.key}] retention check failed: ${String(error.message).split('\n')[0]}`); }
  }

  async function pullOdds(league) {
    if (!backend) return;
    try {
      const result = await pullLatestOdds({ url: backend.url, key: backend.key, league, store: oddsStores[league.key], log });
      if (result.changed) await checkSignals(`${league.key}: new odds cycle`);
    } catch (error) { log(`  [odds ${league.key}] could not pull odds: ${String(error.message).split('\n')[0]}`); }
  }

  log(`Results recorder started (${profileDir}). ${leagues.map((league) => `${league.key} every ${league.everyMin} min`).join(', ')}. Records: ${dir}`);
  await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((error) => log(`First page load problem: ${error.message}. The visits will reload it.`));
  await sleep(2500);
  void announce('started', { message: `Recording ${leagues.map((league) => league.key).join(', ')}.` });
  void checkSignals('start');

  const endNote = { status: 'STOPPED', message: '' };
  try {
    while (!stopping) {
      const due = schedule.due();
      if (due.length) {
        const league = due[0];
        const startedAt = Date.now();
        await page.bringToFront().catch(() => {});
        const ok = await visit(league);
        if (ok) schedule.done(league, startedAt); else schedule.retry(league, RETRY_AFTER_FAILURE_MS);
        continue;
      }
      const pruneDue = pruneSchedule.due();
      if (pruneDue.length) {
        const league = pruneDue[0];
        const startedAt = Date.now();
        await pruneRecords(league);
        pruneSchedule.done(league, startedAt);
        continue;
      }
      const pullDue = backend ? pullSchedule.due() : [];
      if (pullDue.length) {
        const league = pullDue[0];
        const startedAt = Date.now();
        await pullOdds(league);
        pullSchedule.done(league, startedAt);
        continue;
      }
      if (once) break;
      const soonest = Math.min(schedule.soonest(), pruneSchedule.soonest(), backend ? pullSchedule.soonest() : Infinity);
      await sleep(Math.min(5000, Math.max(500, soonest - Date.now())));
    }
  } catch (error) {
    Object.assign(endNote, { status: 'ERROR', message: error.message });
    console.error(`\nSTOPPED by an error: ${error.message}`);
  } finally {
    await context.close().catch(() => {});
    log(once ? 'Done: one visit to every league.' : 'Results recorder stopped.');
    await announce('ended', { status: endNote.status, message: endNote.message }).catch(() => {});
  }
  process.exit(endNote.status === 'ERROR' ? 1 : 0);
}

main().catch((error) => { console.error(`Results recorder could not start: ${error.message}`); process.exit(1); });
