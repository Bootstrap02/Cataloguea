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
    manualLoginMaxAttempts: readInteger(environment, 'AUTOMATION_MANUAL_LOGIN_MAX_ATTEMPTS', 3, { maximum: 20 }),
    // Bet-slip population is opt-in. Submission is never performed by this code.
    populateBetSlip: environment.AUTOMATION_POPULATE_BET_SLIP === 'true',
  });
}

module.exports = { DEFAULT_TARGET_URL, createBetKingLiveConfig };
