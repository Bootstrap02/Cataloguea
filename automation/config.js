const ALLOWED_ENVIRONMENTS = new Set(['local', 'test']);
const path = require('node:path');

const DEFAULTS = Object.freeze({
  environment: 'local',
  browserHeadless: false,
  browserChannel: 'chrome',
  browserLaunchTimeoutMs: 15000,
  pageTimeoutMs: 5000,
  navigationTimeoutMs: 10000,
  navigationWaitTimeoutMs: 500,
  conditionTimeoutMs: 5000,
  manualLoginTimeoutMs: 120000,
  actionTimeoutMs: 1000,
  recoveryMaxAttempts: 3,
  recoveryBaseDelayMs: 100,
  liveSiteEnabled: false,
});

function parsePositiveInteger(environment, key, fallback, { maximum = 120000 } = {}) {
  const raw = environment[key];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new TypeError(`${key} must be a positive integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${key} must be between 1 and ${maximum}.`);
  }
  return value;
}

function parseBoolean(environment, key, fallback) {
  const raw = environment[key];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new TypeError(`${key} must be "true" or "false".`);
}

function createAutomationConfig(environment = process.env) {
  const selectedEnvironment = environment.AUTOMATION_ENVIRONMENT || DEFAULTS.environment;
  if (!ALLOWED_ENVIRONMENTS.has(selectedEnvironment)) {
    throw new Error(
      `AUTOMATION_ENVIRONMENT "${selectedEnvironment}" is not allowed; use local or test.`,
    );
  }

  const browserChannel = environment.AUTOMATION_BROWSER_CHANNEL || DEFAULTS.browserChannel;
  if (browserChannel !== 'chrome' && browserChannel !== 'chromium') {
    throw new Error('AUTOMATION_BROWSER_CHANNEL must be "chrome" or "chromium".');
  }

  const betkingProfileDir = environment.AUTOMATION_BETKING_PROFILE_DIR || null;
  if (betkingProfileDir && !path.isAbsolute(betkingProfileDir)) {
    throw new TypeError('AUTOMATION_BETKING_PROFILE_DIR must be an absolute path.');
  }

  return Object.freeze({
    environment: selectedEnvironment,
    browserHeadless: parseBoolean(
      environment,
      'AUTOMATION_BROWSER_HEADLESS',
      DEFAULTS.browserHeadless,
    ),
    browserChannel,
    betkingProfileDir,
    browserLaunchTimeoutMs: parsePositiveInteger(
      environment,
      'AUTOMATION_BROWSER_LAUNCH_TIMEOUT_MS',
      DEFAULTS.browserLaunchTimeoutMs,
    ),
    pageTimeoutMs: parsePositiveInteger(
      environment,
      'AUTOMATION_PAGE_TIMEOUT_MS',
      DEFAULTS.pageTimeoutMs,
    ),
    navigationTimeoutMs: parsePositiveInteger(
      environment,
      'AUTOMATION_NAVIGATION_TIMEOUT_MS',
      DEFAULTS.navigationTimeoutMs,
    ),
    navigationWaitTimeoutMs: parsePositiveInteger(
      environment,
      'AUTOMATION_NAVIGATION_WAIT_TIMEOUT_MS',
      DEFAULTS.navigationWaitTimeoutMs,
    ),
    conditionTimeoutMs: parsePositiveInteger(
      environment,
      'AUTOMATION_CONDITION_TIMEOUT_MS',
      DEFAULTS.conditionTimeoutMs,
    ),
    manualLoginTimeoutMs: parsePositiveInteger(
      environment,
      'AUTOMATION_BETKING_MANUAL_LOGIN_TIMEOUT_MS',
      DEFAULTS.manualLoginTimeoutMs,
    ),
    actionTimeoutMs: parsePositiveInteger(
      environment,
      'AUTOMATION_ACTION_TIMEOUT_MS',
      DEFAULTS.actionTimeoutMs,
    ),
    recoveryMaxAttempts: parsePositiveInteger(
      environment,
      'AUTOMATION_RECOVERY_MAX_ATTEMPTS',
      DEFAULTS.recoveryMaxAttempts,
      { maximum: 10 },
    ),
    recoveryBaseDelayMs: parsePositiveInteger(
      environment,
      'AUTOMATION_RECOVERY_BASE_DELAY_MS',
      DEFAULTS.recoveryBaseDelayMs,
    ),
    liveSiteEnabled: false,
  });
}

module.exports = { ALLOWED_ENVIRONMENTS, DEFAULTS, createAutomationConfig };
