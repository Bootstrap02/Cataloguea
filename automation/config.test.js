const test = require('node:test');
const assert = require('node:assert/strict');
const { createAutomationConfig } = require('./config');

test('automation config defaults to visible local-only browser operation', () => {
  const config = createAutomationConfig({});
  assert.equal(config.environment, 'local');
  assert.equal(config.browserHeadless, false);
  assert.equal(config.browserChannel, 'chrome');
  assert.equal(config.recoveryMaxAttempts, 3);
  assert.equal(config.liveSiteEnabled, false);
});

test('automation config accepts bounded local overrides', () => {
  const config = createAutomationConfig({
    AUTOMATION_ENVIRONMENT: 'test',
    AUTOMATION_BROWSER_HEADLESS: 'true',
    AUTOMATION_BROWSER_CHANNEL: 'chromium',
    AUTOMATION_ACTION_TIMEOUT_MS: '2500',
    AUTOMATION_RECOVERY_MAX_ATTEMPTS: '5',
    AUTOMATION_RECOVERY_BASE_DELAY_MS: '250',
  });
  assert.equal(config.environment, 'test');
  assert.equal(config.browserHeadless, true);
  assert.equal(config.browserChannel, 'chromium');
  assert.equal(config.actionTimeoutMs, 2500);
  assert.equal(config.recoveryMaxAttempts, 5);
  assert.equal(config.liveSiteEnabled, false);
});

test('automation config rejects non-local environments, malformed values, and unbounded retries', () => {
  assert.throws(
    () => createAutomationConfig({ AUTOMATION_ENVIRONMENT: 'production' }),
    /not allowed/,
  );
  assert.throws(
    () => createAutomationConfig({ AUTOMATION_BROWSER_HEADLESS: 'yes' }),
    /must be "true" or "false"/,
  );
  assert.throws(
    () => createAutomationConfig({ AUTOMATION_ACTION_TIMEOUT_MS: '-1' }),
    /positive integer/,
  );
  assert.throws(
    () => createAutomationConfig({ AUTOMATION_RECOVERY_MAX_ATTEMPTS: '11' }),
    /between 1 and 10/,
  );
});
