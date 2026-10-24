// Configuration for the REAL BetKing run. This is deliberately separate from
// config.js, whose environments are local/test only (liveSiteEnabled stays false
// there). Real-site mode must be requested explicitly and is never the fallback
// of the simulation, nor is the simulation a fallback of this mode.

const os = require('node:os');
const path = require('node:path');
const { createAutomationConfig } = require('./config');

const DEFAULT_TARGET_URL = 'https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league';
const HOME_DIR = path.join(os.homedir(), '.cataloguea');

function readInteger(environment, key, fallback, { minimum = 1, maximum = 3_600_000 } = {}) {
  const raw = environment[key];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new TypeError(`${key} must be a positive integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${key} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

const PIPELINE_THROUGH = Object.freeze(['identify', 'select', 'slip', 'place']);

function readPipelineThrough(environment) {
  const raw = environment.AUTOMATION_PIPELINE_THROUGH;
  if (raw === undefined || raw === '') return 'identify';
  if (!PIPELINE_THROUGH.includes(raw)) {
    throw new TypeError(`AUTOMATION_PIPELINE_THROUGH must be one of: ${PIPELINE_THROUGH.join(', ')}.`);
  }
  return raw;
}

function readAbsolutePath(environment, key, fallback) {
  const raw = environment[key];
  if (raw === undefined || raw === '') return fallback;
  if (!path.isAbsolute(raw)) throw new TypeError(`${key} must be an absolute path.`);
  return raw;
}

function createBetKingLiveConfig(environment = process.env) {
  if (environment.AUTOMATION_MODE !== 'betking-live') {
    throw new Error(
      'The real BetKing run must be requested explicitly: set AUTOMATION_MODE=betking-live. '
      + 'The local simulation is never used as a substitute.',
    );
  }
  // Reuses the validated browser/timeouts/recovery settings of the shared config.
  const base = createAutomationConfig(environment);

  return Object.freeze({
    ...base,
    mode: 'betking-live',
    liveSiteEnabled: true,
    // Always visible: manual sign-in and human review of the instructions need it.
    browserHeadless: false,
    targetUrl: environment.AUTOMATION_BETKING_URL || DEFAULT_TARGET_URL,
    profileDir: base.betkingProfileDir || path.join(HOME_DIR, 'betking-profile'),
    catalogueaUrl: environment.AUTOMATION_CATALOGUEA_URL || 'http://localhost:3000',
    selectorsFile: readAbsolutePath(environment, 'AUTOMATION_BETKING_SELECTORS_FILE', path.join(HOME_DIR, 'betking-selectors.json')),
    mappingsFile: readAbsolutePath(environment, 'AUTOMATION_BETKING_MAPPINGS_FILE', path.join(HOME_DIR, 'betking-market-mappings.json')),
    runsDir: readAbsolutePath(environment, 'AUTOMATION_BETKING_RUNS_DIR', path.join(__dirname, 'artifacts', 'betking-runs')),
    liveIntervalMs: readInteger(environment, 'AUTOMATION_LIVE_INTERVAL_MS', 1000),
    matchWaitTimeoutMs: readInteger(environment, 'AUTOMATION_MATCH_WAIT_TIMEOUT_MS', 600_000),
    resultsInitialDelayMs: readInteger(environment, 'AUTOMATION_RESULTS_INITIAL_DELAY_MS', 30_000),
    resultsIntervalMs: readInteger(environment, 'AUTOMATION_RESULTS_INTERVAL_MS', 15_000),
    resultsMaxAttempts: readInteger(environment, 'AUTOMATION_RESULTS_MAX_ATTEMPTS', 40, { maximum: 500 }),
    resultsCrossCheckAttempts: readInteger(environment, 'AUTOMATION_RESULTS_CROSSCHECK_ATTEMPTS', 3, { maximum: 50 }),
    pollIntervalMs: readInteger(environment, 'AUTOMATION_POLL_INTERVAL_MS', 2000),
    loginWaitTimeoutMs: readInteger(environment, 'AUTOMATION_LOGIN_WAIT_TIMEOUT_MS', 900_000),
    strategyWaitTimeoutMs: readInteger(environment, 'AUTOMATION_STRATEGY_WAIT_TIMEOUT_MS', 900_000),
    manualLoginMaxAttempts: readInteger(environment, 'AUTOMATION_MANUAL_LOGIN_MAX_ATTEMPTS', 3, { maximum: 20 }),
    // Feed the identified Arsenal fixture to the strategy automatically (set AUTOMATION_FEED_STRATEGY=false to type it into Cataloguea yourself).
    feedStrategy: environment.AUTOMATION_FEED_STRATEGY !== 'false',
    // 'headless' (default): the strategy runs inside this program from src/Scores.js and a state file;
    // no strategy tab is opened. 'page' keeps the old behaviour (a Cataloguea tab on npm start).
    strategyMode: environment.AUTOMATION_STRATEGY_MODE === 'page' ? 'page' : 'headless',
    strategyStateFile: readAbsolutePath(environment, 'AUTOMATION_STRATEGY_STATE_FILE', path.join(__dirname, 'artifacts', 'strategy-state.json')),
    baseStake: readInteger(environment, 'AUTOMATION_BASE_STAKE', 10000, { maximum: 100_000_000 }),
    // Milliseconds between browser actions so you can watch every click (0 = full speed).
    slowMoMs: readInteger(environment, 'AUTOMATION_SLOW_MO_MS', 150, { minimum: 0, maximum: 5000 }),
    progressFile: readAbsolutePath(environment, 'AUTOMATION_BETKING_PROGRESS_FILE', path.join(HOME_DIR, 'betking-progress.json')),
    marketWaitTimeoutMs: readInteger(environment, 'AUTOMATION_MARKET_WAIT_MS', 4000),
    // How far the market-first pipeline may go. identify = open category, find selection and
    // odds, read only (never clicks an odd). select = also add the odd to the slip.
    // slip = also open the slip, enter the stake, and verify it, then stop awaiting your
    // authorization. Submission is never performed by this code.
    pipelineThrough: readPipelineThrough(environment),
    // Real money. 'place' submits wagers only when ALL of these hold: AUTOMATION_ALLOW_REAL_MONEY=yes,
    // the stake is within AUTOMATION_MAX_STAKE, and each bet is confirmed (typed) or --auto-confirm is set.
    allowRealMoney: environment.AUTOMATION_ALLOW_REAL_MONEY === 'yes',
    maxStake: readInteger(environment, 'AUTOMATION_MAX_STAKE', 1000, { maximum: 10_000_000 }),
    autoConfirm: environment.AUTOMATION_AUTO_CONFIRM === 'true',
    placeObserveMs: readInteger(environment, 'AUTOMATION_PLACE_OBSERVE_MS', 8000),
  });
}

module.exports = { DEFAULT_TARGET_URL, PIPELINE_THROUGH, createBetKingLiveConfig };
