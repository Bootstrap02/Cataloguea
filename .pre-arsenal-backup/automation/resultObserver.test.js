const test = require('node:test');
const assert = require('node:assert/strict');
const { observeResult, verifyResult } = require('./result/resultObserver');

const expectedFixture = { id: 'livmnu', home: 'liv', away: 'mnu' };

function mockPage(values) {
  return {
    getByLabel(label) {
      return {
        isVisible: async () => true,
        innerText: async () => values[label],
      };
    },
  };
}

test('observes a pending result without inventing a score', async () => {
  const observation = await observeResult(mockPage({
    'Result status': 'pending',
    'Result fixture': 'livmnu',
    'Result home team': 'liv',
    'Result away team': 'mnu',
  }), { clock: () => '2026-10-06T12:00:00.000Z' });

  assert.deepEqual(verifyResult(observation, expectedFixture), {
    fixture: expectedFixture,
    status: 'pending',
    result: null,
    timestamp: '2026-10-06T12:00:00.000Z',
    source: 'local_simulated_sportsbook',
  });
});

test('observes and verifies a complete result from semantic fields', async () => {
  const observation = await observeResult(mockPage({
    'Result status': 'complete',
    'Result fixture': 'livmnu',
    'Result home team': 'liv',
    'Result away team': 'mnu',
    'Result home score': '2',
    'Result away score': '1',
  }), { clock: () => '2026-10-06T12:00:00.000Z' });

  assert.deepEqual(verifyResult(observation, expectedFixture), {
    fixture: expectedFixture,
    status: 'verified',
    result: { homeScore: 2, awayScore: 1 },
    timestamp: '2026-10-06T12:00:00.000Z',
    source: 'local_simulated_sportsbook',
  });
});

test('rejects a result associated with a different fixture', () => {
  assert.throws(() => verifyResult({
    fixture: { id: 'livche', home: 'liv', away: 'che' },
    status: 'complete',
    result: { homeScore: '2', awayScore: '1' },
  }, expectedFixture), /Result fixture mismatch/);
});

test('rejects an incomplete score rather than guessing', () => {
  assert.throws(() => verifyResult({
    fixture: expectedFixture,
    status: 'complete',
    result: { homeScore: '2', awayScore: '' },
  }, expectedFixture), /missing or ambiguous scores/);
});

test('rejects unknown result states', () => {
  assert.throws(() => verifyResult({
    fixture: expectedFixture,
    status: 'maybe',
    result: null,
  }, expectedFixture), /Result is not complete/);
});
