// The OBSERVER: records the results of the four BetKing virtual leagues. It never bets and never logs in or types anything.
//
//   node observer-run.js                      all four leagues, round after round, until you press Ctrl-C
//   node observer-run.js --once               one visit to every league, then stop (a quick check)
//   node observer-run.js --league epl,laliga  only some leagues (epl, laliga, seriea, bundesliga)
//   node observer-run.js --account second     use another saved browser profile
//   node observer-run.js --headless           no browser window (OBSERVER_HEADLESS=yes does the same)
//   node observer-run.js --no-sync            no started/ended notices
//
// Every visit opens the league's Results window (it shows the last 10 rounds), records only the weeks after where it
// stopped, and closes it. EPL, La Liga and Serie A are visited every 25 minutes, the Bundesliga every 12.
// The record book: automation/artifacts/observer/<league>/matches.ndjson and state.json; the log: observer.log.

process.env.AUTOMATION_MODE = 'betking-live';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBetKingLiveConfig } = require('./automation/betkingLiveConfig');
const { resolveLeagues } = require('./automation/observer/leagues');
const { createObserverStore } = require('./automation/observer/observerStore');
const { createResultsWindow } = require('./automation/observer/resultsWindow');
const { createVisitSchedule } = require('./automation/observer/visitSchedule');

const argValue = (name) => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1]; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lagosClock = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const DEFAULT_LIST_URL = 'https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-liga';

async function main() {
  const config = createBetKingLiveConfig(process.env);
  const once = process.argv.includes('--once');
  const account = (argValue('--account') || '').replace(/[^a-z0-9_-]/gi, '');
  const headless = process.argv.includes('--headless') || process.env.OBSERVER_HEADLESS === 'yes';
  const leagues = resolveLeagues(argValue('--league') || process.env.OBSERVER_LEAGUES);
  if (!leagues.length) { console.error('No such league. Use: epl, laliga, seriea, bundesliga'); process.exit(1); }

  const dir = path.join(__dirname, 'automation', 'artifacts', 'observer');
  const evidenceDir = path.join(dir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const logFile = path.join(dir, 'observer.log');
  const log = (line) => { console.log(line); try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${String(line).replace(/\n/g, ' / ')}\n`); } catch (error) { /* the screen has it */ } };

  // started / ended notices (email + Telegram) when the backend is set up for them; otherwise silently skipped
  const projectName = process.env.LALIGA_PROJECT_NAME || 'Cataloguea Observer';
  let announce = async () => false;
  try {
    const { createEventsClient, announceLifecycle } = require('./automation/sync/backendEvents');
    const { loadSyncConfig, defaultPaths } = require('./automation/sync/syncFiles');
    const syncConfig = loadSyncConfig({ env: process.env, file: defaultPaths(__dirname).configFile });
    if (syncConfig.configured && typeof announceLifecycle === 'function' && !process.argv.includes('--no-sync')) {
      const client = createEventsClient({ url: syncConfig.url, key: syncConfig.key });
      announce = (kind, detail) => announceLifecycle({
        client, log,
        event: { eventId: `${projectName}|${account || 'main'}|${kind}|${Date.now()}`, project: projectName, event: kind, occurredAt: new Date().toISOString(), account: { name: account || 'main', device: os.hostname() }, detail },
      });
    }
  } catch (error) { /* no notices */ }

  const viewport = { width: 1280, height: 800 };
  const profileDir = account ? `${config.profileDir}-${account}` : config.profileDir;
  const { chromium } = require('playwright');
  const context = await chromium.launchPersistentContext(profileDir, { headless, channel: config.browserChannel, timeout: config.browserLaunchTimeoutMs, viewport });
  const page = context.pages()[0] || await context.newPage();
  const listUrl = /\/leagues\/[^/?#]+/.test(config.targetUrl || '') ? config.targetUrl : DEFAULT_LIST_URL;

  const saveEvidence = async (name, text) => { try { fs.writeFileSync(path.join(evidenceDir, `${name}.txt`), `${text}\n`); } catch (error) { /* evidence only */ } };
  const reader = createResultsWindow({ page, log, listUrl, evidence: saveEvidence });
  const stores = Object.fromEntries(leagues.map((league) => [league.key, createObserverStore({ dir, league })]));
  const schedule = createVisitSchedule(leagues);
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

  function report(league, cards, result) {
    const weeks = cards.map((card) => card.week);
    const shown = weeks.length ? `Week ${Math.min(...weeks)}-${Math.max(...weeks)}` : 'none';
    const state = result.state;
    const season = state.seasons[state.season] || {};
    for (const event of result.events) {
      if (event.type === 'season-started') log(`  [${league.key}] NEW SEASON ${event.season} began (first week seen: ${event.firstWeek}${event.partial ? ', so the first weeks of it were missed' : ''}).`);
      if (event.type === 'season-complete') log(`  [${league.key}] Season ${event.season} is COMPLETE (week ${league.weeks} recorded).`);
    }
    const newWeeks = result.events.filter((event) => event.type === 'week').map((event) => event.week);
    log(`  [${league.key}] ${lagosClock()} window showed ${cards.length} round(s) (${shown}). ${newWeeks.length ? `Recorded NEW: Week ${newWeeks.join(', ')} (${result.matches} matches).` : 'Nothing new.'} Season ${state.season}: ${season.weeks || 0} week(s) kept, last = Week ${state.lastWeek} of ${league.weeks}.`);
  }

  async function visit(league) {
    for (let attempt = 1; attempt <= 3 && !stopping; attempt += 1) {
      try {
        const { cards } = await reader.readCards(league);
        const complete = cards.filter((card) => card.complete);
        if (!complete.length) throw new Error('the Results window showed no finished round');
        report(league, cards, stores[league.key].ingest(cards));
        failures[league.key] = 0;
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
    log(`  [${league.key}] NO RECORD this time (${failures[league.key]} visit(s) in a row). It tries again at the next visit.`);
    return false;
  }

  log(`Observer started (${profileDir}). ${leagues.map((league) => `${league.key} every ${league.everyMin} min`).join(', ')}. Records: ${dir}`);
  await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((error) => log(`First page load problem: ${error.message}. The visits will reload it.`));
  await sleep(2500);
  void announce('started', { message: `Recording ${leagues.map((league) => league.key).join(', ')}.` });

  let endNote = { status: 'STOPPED', message: '' };
  try {
    while (!stopping) {
      const due = schedule.due();
      if (!due.length) {
        if (once) break;
        await sleep(Math.min(5000, Math.max(500, schedule.soonest() - Date.now())));
        continue;
      }
      const league = due[0];
      const startedAt = Date.now();
      await visit(league);
      schedule.done(league, startedAt);
    }
  } catch (error) {
    endNote = { status: 'ERROR', message: error.message };
    console.error(`\nSTOPPED by an error: ${error.message}`);
  } finally {
    await context.close().catch(() => {});
    log(once ? 'Done: one visit to every league.' : 'Observer stopped.');
    await announce('ended', { status: endNote.status, message: endNote.message }).catch(() => {});
  }
  process.exit(endNote.status === 'ERROR' ? 1 : 0);
}

main().catch((error) => { console.error(`Observer could not start: ${error.message}`); process.exit(1); });
