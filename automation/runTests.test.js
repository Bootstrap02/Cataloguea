const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { RETIRED_SIMULATION_TESTS, selectTestFiles } = require('./runTests');

test('the retired sample-page tests are never selected', () => {
  const selected = selectTestFiles(__dirname);
  for (const retired of RETIRED_SIMULATION_TESTS) {
    assert.ok(!selected.includes(path.join(__dirname, retired)), `${retired} must not run`);
  }
});

test('real-site and strategy tests are still selected', () => {
  const selected = selectTestFiles(__dirname).map((file) => path.relative(__dirname, file));
  assert.ok(selected.includes(path.join('strategy', 'rules.test.js')));
  assert.ok(selected.includes('betkingController.test.js'));
  assert.ok(selected.includes('stateMachine.test.js'));
});
