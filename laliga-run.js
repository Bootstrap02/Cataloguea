// The La Liga run: Barcelona and Real Madrid 6-0 winners protected by the HT/FT options of the 20 teams.
//
//   node laliga-run.js                      one round, DRY: reads the odds, shows the plan, places nothing
//   AUTOMATION_ALLOW_REAL_MONEY=yes node laliga-run.js --auto-confirm --forever     real bets, round after round
//   ... --rounds 3        three real rounds         --resume     settle a round left open, then carry on
//   ... --account second  use another saved BetKing login (its own browser profile)
//   ... --start-paused    start, log in / check, and wait for Continue (used on a server)
//   ... --resume-open    if a round with bets was left unsettled (crash, power cut), settle it first, then carry on
//   ... --no-sync         do not talk to the backend this time
// (npm run laliga:play does the real-money one for you; see README-LALIGA.md)
//
// WHILE IT RUNS you control it with single keys in this terminal, or with the buttons on the control page
// (http://localhost:4545): Pause (after the round in hand; the state is sent to the server), Continue (the newest
// state is fetched from the server first), Stop (after the round in hand), Send, Get.
// Strategy state: automation/artifacts/laliga-state.json. No stake cap unless you set AUTOMATION_MAX_STAKE.

process.env.AUTOMATION_MODE = 'betking-live';
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { createBetKingLiveConfig } = require('./automation/betkingLiveConfig');
const { createMarketFlow } = require('./automation/sportsbook/betkingMarketFlow');
const { createLaLigaPorts } = require('./automation/sportsbook/laLigaPorts');
const { createLaLigaController } = require('./automation/laLigaController');
const { createFileStore } = require('./automation/laLigaStore');
const { celebrate } = require('./automation/notify');
const { createSyncClient, createSyncManager } = require('./automation/sync/laLigaSync');
const { createFileIo, loadSyncConfig, getDeviceId, defaultPaths } = require('./automation/sync/syncFiles');
const { createControlPanel, keyAction } = require('./automation/control/controlPanel');
const { createEventsClient, buildWinEvents, emailWins, startCommandPoller } = require('./automation/sync/backendEvents');

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const config = createBetKingLiveConfig(process.env);
  const forever = process.argv.includes('--forever');
  const resumeOnly = process.argv.includes('--resume') && !forever && !argValue('--rounds');
  const maxRounds = resumeOnly ? 0 : Number(argValue('--rounds') || 1);
  const baseStake = Number(process.env.AUTOMATION_BASE_STAKE) || 10000;
  const trial = process.argv.includes('--trial');
  const account = (argValue('--account') || '').replace(/[^a-z0-9_-]/gi, '');
  const paths = defaultPaths(__dirname, trial);
  const runDir = path.join(paths.artifacts, 'laliga-runs', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(runDir, { recursive: true });

  // everything printed is also kept (the last 400 lines) for the control page
  const logLines = [];
  const log = (line) => {
    console.log(line);
    for (const part of String(line).split('\n')) logLines.push(part);
    if (logLines.length > 400) logLines.splice(0, logLines.length - 400);
  };

  if (config.allowRealMoney && !(config.autoConfirm || process.argv.includes('--auto-confirm'))) {
    console.error('Real bets need --auto-confirm (there are too many bets to confirm one by one). Example:\n  AUTOMATION_ALLOW_REAL_MONEY=yes node laliga-run.js --auto-confirm --forever');
    process.exit(1);
  }

  // ---- keep the strategy memory in step with the server (so any device can carry on) -----------------------------
  const syncConfig = loadSyncConfig({ env: process.env, file: paths.configFile });
  const syncOn = syncConfig.configured && syncConfig.mode !== 'off' && !trial && !process.argv.includes('--no-sync');
  let syncManager = null;
  // the 6-0 email and the remote save/pause commands go through the same backend address and key
  const eventsClient = syncOn ? createEventsClient({ url: syncConfig.url, key: syncConfig.key }) : null;
  if (syncOn) {
    const deviceId = getDeviceId(paths.deviceFile);
    syncManager = createSyncManager({ client: createSyncClient({ url: syncConfig.url, key: syncConfig.key, deviceId }), io: createFileIo(paths), log, deviceId });
    let start = await syncManager.startup();
    // Before any money is involved, a dropped connection (or a sleeping free-tier server, which can take up to a minute
    // to wake) is retried every 5 seconds instead of ending the start. LALIGA_SYNC_WAIT_MS changes the 30 seconds.
    const syncWaitMs = Number(process.env.LALIGA_SYNC_WAIT_MS ?? 30000);
    const syncGiveUpAt = Date.now() + syncWaitMs;
    for (let attempt = 2; start.status === 'unreachable' && Date.now() < syncGiveUpAt; attempt += 1) {
      log(`Sync: cannot reach the server (${start.message || 'no answer'}). Trying again in 5 seconds (attempt ${attempt}, up to ${Math.round(syncWaitMs / 1000)}s in all).`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      start = await syncManager.startup();
    }
    if (start.status === 'pulled') log(`Sync: ${start.note || 'the newest strategy state was fetched from the server'} (version ${start.version}). Carrying on from it.`);
    else if (start.status === 'pushed') log(`Sync: ${start.note} (version ${start.version}).`);
    else if (start.status === 'ok') log(`Sync: this device is up to date${start.version ? ` (version ${start.version})` : ''}.`);
    else {
      console.error(`\nSync: ${start.status === 'conflict' ? 'CONFLICT. ' : start.status === 'unreachable' ? 'cannot reach the server. ' : 'problem. '}${start.message || ''}`);
      if (start.status === 'conflict') console.error('  Use the server\'s version:   npm run laliga:pull\n  Use this device\'s version:  npm run laliga:push -- --force\nThen start again.');
      else console.error('  Fix the connection, or start without syncing:  add --no-sync (only if you are sure this device has the newest state).');
      process.exit(2);
    }
  } else {
    log(`Sync: ${process.argv.includes('--no-sync') ? 'switched off for this run' : 'not set up (npm run laliga:sync-setup to turn it on)'}.`);
  }

  const store = createFileStore({ file: paths.stateFile, baseStake });
  log(`La Liga run (${config.allowRealMoney ? 'REAL MONEY: bets WILL be placed' : 'DRY: nothing will be placed'}; stake cap: ${Number.isFinite(config.maxStake) ? `N${config.maxStake}` : 'none'}).`);
  log(`${store.existed ? 'Continuing the strategy state' : 'No strategy state yet; starting fresh at base stake ' + baseStake} (${paths.stateFile}). Evidence: ${runDir}`);

  // ---- the browser (each --account has its own saved login) -------------------------------------------------------
  const viewportMatch = /^(\d{3,4})x(\d{3,4})$/.exec(process.env.AUTOMATION_VIEWPORT || '');
  const viewport = viewportMatch ? { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) } : { width: 1280, height: 800 };
  const profileDir = account ? `${config.profileDir}-${account}` : config.profileDir;
  log(`Browser login profile: ${account ? `"${account}"` : 'main'} (${profileDir}). To use another BetKing account: Pause, log out and in inside the browser window, Continue; or start with --account <name>.`);
  const { chromium } = require('playwright');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false, channel: config.browserChannel, timeout: config.browserLaunchTimeoutMs, viewport, slowMo: config.slowMoMs,
  });
  const page = context.pages()[0] || await context.newPage();
  const flow = createMarketFlow({ page, config });
  const ports = createLaLigaPorts({ page, flow, runDir, targetUrl: config.targetUrl });

  const controller = createLaLigaController({
    ports, store, log,
    hooks: {
      // the moment a 6-0 is known: a tone, a pop-up and a banner
      onSixNil: async ({ rows }) => {
        await celebrate({ title: '6-0 WIN!', lines: rows.map((row) => `${row.code} ${row.side === 'HOME' ? '6-0' : '0-6'} at ${row.fixture.home} v ${row.fixture.away}: N${row.stake} @ ${row.odds} returns N${Math.round(row.stake * row.odds)}`) });
      },
      // after the round is settled and saved: send the newest strategy state to the server
      onSettled: async ({ sixNil, round, evaluation, state }) => {
        let savedVersion = null;
        let saveError = null;
        if (syncManager && !(syncConfig.mode === 'win' && !sixNil)) {
          const sent = await syncManager.push({ reason: sixNil ? 'six-nil-win' : 'round' });
          if (sent.ok) { savedVersion = sent.version; log(`  Sync: strategy state sent to the server (version ${sent.version}).`); }
          else { saveError = sent.conflict ? 'another device saved a newer state' : sent.error; log(`  Sync: NOT sent (${saveError}). It is sent again after the next round, or use Send.`); }
        }
        // a 6-0: the backend emails you the full details (and says whether the state is saved), after the save above
        if (sixNil && eventsClient) {
          const events = buildWinEvents({ round, rows: evaluation.rows, state, savedVersion, saveError });
          await emailWins({ client: eventsClient, events, log });
        }
      },
      // Pause: everything is sent to the server first, so a new device or a new account can carry on from it
      onPaused: async () => {
        if (!syncManager) return;
        if (!syncManager.unsent()) { log('  Sync: the server already has everything.'); return; }
        const sent = await syncManager.push({ reason: 'pause' });
        log(sent.ok ? `  Sync: everything sent to the server (version ${sent.version}).` : `  Sync: NOT sent (${sent.conflict ? 'another device saved a newer state' : sent.error}).`);
      },
      // Continue: the newest state is fetched from the server first (if another device played in between)
      onResumed: async () => {
        if (!syncManager) return;
        const start = await syncManager.startup();
        if (start.status === 'pulled') { store.reload(); log(`  Sync: a newer state was fetched from the server (version ${start.version}). Carrying on from it.`); }
        else if (start.status === 'pushed') log('  Sync: this device\'s changes were sent to the server.');
        else if (start.status !== 'ok') {
          log(`  Sync: ${start.status}${start.message ? `: ${start.message}` : ''}. Staying paused. Use "Get from server" or "Send to server", then Continue.`);
          controller.pause();
        }
      },
    },
    config: { haltOnOpen: process.argv.includes('--halt-on-open'), allowRealMoney: config.allowRealMoney, baseStake, matchSeconds: config.matchSeconds, liveIntervalMs: config.liveTrackIntervalMs },
  });
  if (process.argv.includes('--start-paused')) controller.pause();

  // ---- the controls: terminal keys and the control page ------------------------------------------------------------
  const actions = {
    pause: async () => { controller.pause(); return { ok: true, message: 'Pausing: the round in hand is finished and settled first, then nothing new is placed.' }; },
    resume: async () => { controller.unpause(); return { ok: true, message: 'Continuing.' }; },
    stop: async () => { controller.stop(); return { ok: true, message: 'Stopping after the round in hand.' }; },
    'stop-now': async () => { controller.abort(); return { ok: true, message: 'Stopping now (a round with bets placed stays open).' }; },
    push: async () => {
      if (!syncManager) return { ok: false, message: 'Sync is not set up (npm run laliga:sync-setup).' };
      const sent = await syncManager.push({ reason: 'manual' });
      return { ok: sent.ok, message: sent.ok ? `Sent to the server (version ${sent.version}).` : `Not sent: ${sent.conflict ? 'another device saved a newer state (use laliga:pull, or push --force)' : sent.error}` };
    },
    pull: async () => {
      if (!syncManager) return { ok: false, message: 'Sync is not set up (npm run laliga:sync-setup).' };
      if (controller.status().state !== 'paused') return { ok: false, message: 'Pause first, and wait until it says "paused".' };
      const pulled = await syncManager.pull();
      if (pulled.ok) store.reload();
      return { ok: pulled.ok, message: pulled.ok ? `Fetched version ${pulled.version} from the server.` : `Not fetched: ${pulled.error}` };
    },
    help: async () => { log(HELP); return { ok: true, message: 'Keys are listed in the terminal.' }; },
  };
  const HELP = 'Keys:  p = pause after this round   c = continue   s = stop after this round   x = stop now   u = send state to the server   d = get state from the server (when paused)';

  // ---- SAVE = BETTING ON HOLD ---------------------------------------------------------------------------------------
  // Whenever you save (key u, the Send button, a remote save, npm), no new bet is placed until the server has answered,
  // so the state that is saved is the state at rest. A failed save is tried once more after 10 seconds (still on hold).
  let saveInFlight = null;
  const rawPush = actions.push;
  actions.push = async () => {
    while (saveInFlight) await saveInFlight;
    let release;
    saveInFlight = new Promise((resolve) => { release = resolve; });
    log('  Save: no new bets are placed until the server answers.');
    try {
      const withLimit = () => Promise.race([rawPush(), new Promise((resolve) => setTimeout(() => resolve({ ok: false, message: 'Not sent: the server did not answer in 30 seconds.' }), 30000))]);
      let result = await withLimit();
      if (!result.ok && !/newer state|not set up/i.test(result.message)) {
        log(`  Save did not go through (${result.message}). Trying once more in 10 seconds; betting stays on hold.`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
        result = await withLimit();
      }
      log(result.ok ? '  Save finished: betting continues.' : '  Save FAILED: betting continues anyway. Fix the connection and press u again.');
      return result;
    } finally { saveInFlight = null; release(); }
  };
  const rawPlaceBet = ports.placeBet;
  ports.placeBet = async (arg) => {
    if (saveInFlight) { log('  Waiting for the save to finish before placing the next bet.'); while (saveInFlight) await saveInFlight; }
    return rawPlaceBet(arg);
  };

  // ---- PAGE STUCK = RELOAD AND TRY AGAIN ------------------------------------------------------------------------------
  // A read that fails (slow API, slow page, a blip) waits up to 10 seconds for the network, reloads the La Liga page and
  // reads again, up to twice. Only the page reloads; the run's plan, round and record stay. Placing bets has its own
  // version of this inside the ports (it never clicks PLACE BET twice without checking the balance first).
  for (const name of ['readUpcomingRound', 'readWinnerOdds', 'readTeamOdds', 'readResultsWindow']) {
    const raw = ports[name];
    if (typeof raw !== 'function') continue;
    ports[name] = async (...args) => {
      for (let attempt = 1; ; attempt += 1) {
        try { return await raw(...args); } catch (error) {
          if (attempt >= 3 || /log ?in|sign-?in/i.test(error.message)) throw error;
          log(`  ${name} hit a problem (${String(error.message).split('\n')[0]}). Reloading the page and trying again (${attempt}/2).`);
          await ports.reloadLiga().catch((reloadError) => log(`  Reload problem: ${String(reloadError.message).split('\n')[0]}`));
        }
      }
    };
  }

  // Remote save / pause: you send a command to the backend from anywhere, and this run carries it out within seconds.
  let commandPoller = null;
  if (eventsClient && process.env.LALIGA_REMOTE !== 'off') {
    commandPoller = startCommandPoller({
      client: eventsClient, log,
      actions: { save: actions.push, pause: actions.pause },
    });
    log('Remote commands: on (save and pause can be sent from the backend).');
  }

  const panelOption = String(process.env.AUTOMATION_PANEL_PORT ?? '4545').toLowerCase();
  let panel = null;
  if (panelOption !== 'off') {
    panel = createControlPanel({
      controller, actions, getLog: () => logLines, port: Number(panelOption) || 4545,
      extras: async () => ({
        account: account || 'main',
        sync: syncManager ? syncConfig.mode : 'off',
        balance: controller.status().state === 'paused' ? await ports.readBalance().catch(() => null) : null,
      }),
    });
    try { const port = await panel.start(); log(`Control page: http://localhost:${port}  (buttons: Pause, Continue, Stop, Send, Get)`); }
    catch (error) { log(`(The control page could not start: ${error.message}. The keys below still work.)`); panel = null; }
  }
  log(HELP);

  let interrupts = 0;
  const interrupt = () => {
    interrupts += 1;
    if (interrupts === 1) { log('\nStop requested: the round in hand is finished and settled first (Ctrl-C again to stop at once).'); controller.stop(); }
    else if (interrupts === 2) { log('\nStopping now.'); controller.abort(); }
    else process.exit(130);
  };
  // `systemctl stop` (SIGTERM) asks for the same safe stop as the first Ctrl-C
  process.on('SIGTERM', () => { log('\nStop requested (SIGTERM): the round in hand is finished and settled first.'); controller.stop(); });
  process.on('SIGINT', interrupt);
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', async (text, key) => {
      if (key && key.ctrl && key.name === 'c') return interrupt();
      const action = keyAction(text);
      if (!action || !actions[action]) return undefined;
      try { const result = await actions[action](); if (action !== 'help') log(`> ${result.message}`); } catch (error) { log(`> ${error.message}`); }
      return undefined;
    });
  }

  let exitCode = 0;
  try {
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('[data-testid="league-round"]', { timeout: 20000 }).catch(() => {});
    await flow.clearOverlays().catch(() => {});
    const outcome = await controller.run({ forever, maxRounds, resumeOpen: process.argv.includes('--resume'), resumeIfOpen: process.argv.includes('--resume-open') });
    log(`\nRun finished: ${outcome.status}${outcome.code ? ` (${outcome.code})` : ''}${outcome.reason ? `\n${outcome.reason}` : ''}`);
    if (outcome.status === 'HALTED') exitCode = 2;
  } catch (error) {
    console.error(`\nSTOPPED by an error: ${error.message}`);
    await ports.captureEvidence('error');
    exitCode = 1;
  } finally {
    if (process.stdin.isTTY) { try { process.stdin.setRawMode(false); } catch (error) { /* closing anyway */ } }
    if (commandPoller) commandPoller.stop();
    if (panel) await panel.stop().catch(() => {});
    await context.close();
  }
  process.exit(exitCode);
}

main();
