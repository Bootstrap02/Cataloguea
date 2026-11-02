// The La Liga run: Barcelona and Real Madrid 6-0 winners protected by the HT/FT options of the 20 teams.
//   node laliga-run.js                    one round, DRY: reads the odds, shows the plan, places nothing
//   (an unsettled round left over from an earlier run is set aside automatically; --halt-on-open refuses instead)
//   node laliga-run.js --resume           settle a round left open (placed but never settled) from the results, then carry on
//   AUTOMATION_ALLOW_REAL_MONEY=yes node laliga-run.js --rounds 3      three real rounds
//   AUTOMATION_ALLOW_REAL_MONEY=yes node laliga-run.js --forever       round after round until you press Ctrl-C
// Strategy state: automation/artifacts/laliga-state.json (fresh at 10000: 5000 for each winner).
// No stake cap unless you set AUTOMATION_MAX_STAKE. Ctrl-C finishes the bet in hand, then stops.

process.env.AUTOMATION_MODE = 'betking-live';
const fs = require('node:fs');
const path = require('node:path');
const { createBetKingLiveConfig } = require('./automation/betkingLiveConfig');
const { createMarketFlow } = require('./automation/sportsbook/betkingMarketFlow');
const { createLaLigaPorts } = require('./automation/sportsbook/laLigaPorts');
const { createLaLigaController } = require('./automation/laLigaController');
const { createFileStore } = require('./automation/laLigaStore');

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
  const stateFile = path.join(__dirname, 'automation', 'artifacts', process.argv.includes('--trial') ? 'laliga-state.trial.json' : 'laliga-state.json');
  const runDir = path.join(__dirname, 'automation', 'artifacts', 'laliga-runs', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(runDir, { recursive: true });

  if (config.allowRealMoney && !(config.autoConfirm || process.argv.includes('--auto-confirm'))) {
    console.error('Real bets need --auto-confirm (there are too many bets to confirm one by one). Example:\n  AUTOMATION_ALLOW_REAL_MONEY=yes node laliga-run.js --auto-confirm --forever');
    process.exit(1);
  }
  const store = createFileStore({ file: stateFile, baseStake });
  console.log(`La Liga run (${config.allowRealMoney ? 'REAL MONEY: bets WILL be placed' : 'DRY: nothing will be placed'}; stake cap: ${Number.isFinite(config.maxStake) ? `N${config.maxStake}` : 'none'}).`);
  console.log(`${store.existed ? 'Continuing the strategy state' : 'No strategy state yet; starting fresh at base stake ' + baseStake} (${stateFile}). Evidence: ${runDir}`);

  // The window: 1280x800 by default; AUTOMATION_VIEWPORT=420x900 gives the phone-sized page the first La Liga run used.
  const viewportMatch = /^(\d{3,4})x(\d{3,4})$/.exec(process.env.AUTOMATION_VIEWPORT || '');
  const viewport = viewportMatch ? { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) } : { width: 1280, height: 800 };
  const { chromium } = require('playwright');
  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false, channel: config.browserChannel, timeout: config.browserLaunchTimeoutMs, viewport, slowMo: config.slowMoMs,
  });
  const page = context.pages()[0] || await context.newPage();
  const flow = createMarketFlow({ page, config });
  const ports = createLaLigaPorts({ page, flow, runDir, targetUrl: config.targetUrl });
  const controller = createLaLigaController({
    ports, store, log: (line) => console.log(line),
    config: { haltOnOpen: process.argv.includes('--halt-on-open'), allowRealMoney: config.allowRealMoney, baseStake, matchSeconds: config.matchSeconds, liveIntervalMs: config.liveTrackIntervalMs },
  });
  let interrupts = 0;
  process.on('SIGINT', () => {
    interrupts += 1;
    if (interrupts > 1) process.exit(130);
    console.log('\nStop requested: finishing the current step safely (press Ctrl-C again to quit at once).');
    controller.stop();
  });

  let exitCode = 0;
  try {
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('[data-testid="league-round"]', { timeout: 20000 }).catch(() => {});
    await flow.clearOverlays().catch(() => {});
    const outcome = await controller.run({ forever, maxRounds, resumeOpen: process.argv.includes('--resume') });
    console.log(`\nRun finished: ${outcome.status}${outcome.code ? ` (${outcome.code})` : ''}${outcome.reason ? `\n${outcome.reason}` : ''}`);
    if (outcome.status === 'HALTED') exitCode = 2;
  } catch (error) {
    console.error(`\nSTOPPED by an error: ${error.message}`);
    await ports.captureEvidence('error');
    exitCode = 1;
  } finally {
    await context.close();
  }
  process.exit(exitCode);
}

main();
