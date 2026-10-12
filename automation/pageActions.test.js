const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clickElement,
  fillInput,
  readInputValue,
  readVisibleText,
} = require('./browser/pageActions');

test('browser actions use configured timeouts and allow explicit per-call overrides', async () => {
  const previousTimeout = process.env.AUTOMATION_ACTION_TIMEOUT_MS;
  process.env.AUTOMATION_ACTION_TIMEOUT_MS = '2400';
  const calls = [];
  const locator = {
    isVisible: async () => true,
    innerText: async (options) => { calls.push(['innerText', options]); return 'visible'; },
    click: async (options) => calls.push(['click', options]),
    fill: async (value, options) => calls.push(['fill', value, options]),
    inputValue: async (options) => { calls.push(['inputValue', options]); return 'value'; },
  };

  try {
    await clickElement(locator);
    await fillInput(locator, 'value');
    assert.equal(await readInputValue(locator), 'value');
    assert.equal(await readVisibleText(locator), 'visible');
    await clickElement(locator, { timeout: 300 });
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.AUTOMATION_ACTION_TIMEOUT_MS;
    } else {
      process.env.AUTOMATION_ACTION_TIMEOUT_MS = previousTimeout;
    }
  }

  assert.deepEqual(calls, [
    ['click', { timeout: 2400 }],
    ['fill', 'value', { timeout: 2400 }],
    ['inputValue', { timeout: 2400 }],
    ['innerText', { timeout: 2400 }],
    ['click', { timeout: 300 }],
  ]);
});
