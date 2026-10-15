const test = require('node:test');
const assert = require('node:assert/strict');
const {
  POLLING_DEFAULTS,
  SETTLEMENT_OUTCOMES,
  createResultPoller,
  determineSettlementOutcome,
  createSettlementReporter,
} = require('./resultPoller');

const FIXTURE_IDENTITY_CONFIDENCE = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  AMBIGUOUS: 'AMBIGUOUS',
};

function createMockFixture() {
  return {
    scheduled: { fixtureId: 'matchup-statistics-button-LIV-MNU', home: 'LIV', away: 'MNU', roundName: 'Week 33' },
    live: { fixtureId: 'matchup-statistics-button-LIV-MNU', home: 'LIV', away: 'MNU', roundName: 'Week 33' },
    results: { fixtureId: 'matchup-statistics-button-LIV-MNU', home: 'LIV', away: 'MNU', roundName: 'Week 33' },
  };
}

function createMockResultsSnapshot(fixtures) {
  return { results: fixtures };
}

test('createResultPoller requires readResultsPage', () => {
  assert.throws(() => createResultPoller({ getExpectedFixture: () => {}, getActionOperationId: () => {} }),
    /readResultsPage function is required/);
});

test('createResultPoller requires getExpectedFixture', () => {
  assert.throws(() => createResultPoller({ readResultsPage: async () => {}, getActionOperationId: () => {} }),
    /getExpectedFixture function is required/);
});

test('createResultPoller requires getActionOperationId', () => {
  assert.throws(() => createResultPoller({ readResultsPage: async () => {}, getExpectedFixture: () => {} }),
    /getActionOperationId function is required/);
});

test('pollOnce returns RESULTS_NOT_FOUND when no results array', async () => {
  const poller = createResultPoller({
    readResultsPage: async () => ({}),
    getExpectedFixture: () => createMockFixture(),
    getActionOperationId: () => 'op-123',
  });
  const result = await poller.pollOnce();
  assert.equal(result.status, 'RESULTS_NOT_FOUND');
});

test('pollOnce returns RESULTS_NOT_FOUND when no matching fixture', async () => {
  const poller = createResultPoller({
    readResultsPage: async () => createMockResultsSnapshot([
      { fixture: { home: 'ARS', away: 'CHE' }, status: 'FINISHED', fullTime: { home: 2, away: 1 } },
    ]),
    getExpectedFixture: () => createMockFixture(),
    getActionOperationId: () => 'op-123',
  });
  const result = await poller.pollOnce();
  assert.equal(result.status, 'RESULTS_NOT_FOUND');
});

test('pollOnce returns RESULTS_AMBIGUOUS when multiple matches', async () => {
  const poller = createResultPoller({
    readResultsPage: async () => createMockResultsSnapshot([
      { fixture: { home: 'LIV', away: 'MNU' }, status: 'FINISHED', fullTime: { home: 2, away: 1 } },
      { fixture: { home: 'LIV', away: 'MNU' }, status: 'FINISHED', fullTime: { home: 2, away: 1 } },
    ]),
    getExpectedFixture: () => createMockFixture(),
    getActionOperationId: () => 'op-123',
  });
  const result = await poller.pollOnce();
  assert.equal(result.status, 'RESULTS_AMBIGUOUS');
});

test('pollOnce returns RESULTS_MISMATCH when status not FINISHED', async () => {
  const poller = createResultPoller({
    readResultsPage: async () => createMockResultsSnapshot([
      { fixture: { home: 'LIV', away: 'MNU' }, status: 'LIVE', fullTime: { home: 2, away: 1 } },
    ]),
    getExpectedFixture: () => createMockFixture(),
    getActionOperationId: () => 'op-123',
  });
  const result = await poller.pollOnce();
  assert.equal(result.status, 'RESULTS_MISMATCH');
  assert.ok(result.reason?.includes('RESULT_NOT_COMPLETE'));
});

test('pollOnce returns INCOMPLETE_SCORE when FT score missing', async () => {
  const poller = createResultPoller({
    readResultsPage: async () => createMockResultsSnapshot([
      { fixture: { home: 'LIV', away: 'MNU' }, status: 'FINISHED', fullTime: { home: 2 } },
    ]),
    getExpectedFixture: () => createMockFixture(),
    getActionOperationId: () => 'op-123',
  });
  const result = await poller.pollOnce();
  assert.equal(result.status, 'INCOMPLETE_SCORE');
});

test('pollOnce returns INCOMPLETE_SCORE when HT score incomplete', async () => {
  const poller = createResultPoller({
    readResultsPage: async () => createMockResultsSnapshot([
      { fixture: { home: 'LIV', away: 'MNU' }, status: 'FINISHED', fullTime: { home: 2, away: 1 }, halfTime: { home: 1 } },
    ]),
    getExpectedFixture: () => createMockFixture(),
    getActionOperationId: () => 'op-123',
  });
  const result = await poller.pollOnce();
  assert.equal(result.status, 'INCOMPLETE_SCORE');
});

test('pollOnce returns verified result when complete', async () => {
  const poller = createResultPoller({
    readResultsPage: async () => createMockResultsSnapshot([
      { fixture: { home: 'LIV', away: 'MNU', fixtureId: 'matchup-statistics-button-LIV-MNU' }, status: 'FINISHED', fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } },
    ]),
    getExpectedFixture: () => createMockFixture(),
    getActionOperationId: () => 'op-123',
  });
  const result = await poller.pollOnce();
  assert.equal(result.status, 'verified');
  assert.ok(result.resultId);
  assert.equal(result.result.fullTime.home, 2);
  assert.equal(result.result.fullTime.away, 1);
  assert.ok(result.halfTimeProvided);
});

test('pollOnce detects CONFLICTING_RESULT when the same poller later sees a different score', async () => {
  let entry = {
    fixture: { home: 'LIV', away: 'MNU', fixtureId: 'matchup-statistics-button-LIV-MNU' },
    status: 'FINISHED',
    fullTime: { home: 2, away: 1 },
    halfTime: { home: 1, away: 0 },
  };
  const poller = createResultPoller({
    readResultsPage: async () => createMockResultsSnapshot([entry]),
    getExpectedFixture: () => createMockFixture(),
    getActionOperationId: () => 'op-123',
  });
  const first = await poller.pollOnce();
  assert.equal(first.status, 'verified');
  entry = { ...entry, fullTime: { home: 3, away: 1 }, halfTime: { home: 2, away: 0 } };
  const second = await poller.pollOnce();
  assert.equal(second.status, 'CONFLICTING_RESULT');
});

test('pollOnce ignores results entries from a different round', async () => {
  const poller = createResultPoller({
    readResultsPage: async () => createMockResultsSnapshot([
      {
        fixture: { home: 'LIV', away: 'MNU', fixtureId: 'matchup-statistics-button-LIV-MNU', roundName: 'Week 32' },
        status: 'FINISHED',
        fullTime: { home: 2, away: 1 },
        halfTime: { home: 1, away: 0 },
      },
    ]),
    getExpectedFixture: () => createMockFixture(),
    getActionOperationId: () => 'op-123',
  });
  const result = await poller.pollOnce();
  assert.equal(result.status, 'RESULTS_NOT_FOUND');
});

test('pollOnce accepts a results entry for the expected round', async () => {
  const poller = createResultPoller({
    readResultsPage: async () => createMockResultsSnapshot([
      {
        fixture: { home: 'LIV', away: 'MNU', fixtureId: 'matchup-statistics-button-LIV-MNU', roundName: '33' },
        status: 'FINISHED',
        fullTime: { home: 2, away: 1 },
        halfTime: { home: 1, away: 0 },
      },
    ]),
    getExpectedFixture: () => createMockFixture(),
    getActionOperationId: () => 'op-123',
  });
  assert.equal((await poller.pollOnce()).status, 'verified');
});

test('startPolling waits initial delay and polls until verified', async () => {
  let pollCount = 0;
  const poller = createResultPoller({
    readResultsPage: async () => {
      pollCount++;
      if (pollCount < 3) return createMockResultsSnapshot([]);
      return createMockResultsSnapshot([
        { fixture: { home: 'LIV', away: 'MNU', fixtureId: 'matchup-statistics-button-LIV-MNU' }, status: 'FINISHED', fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } },
      ]);
    },
    getExpectedFixture: () => createMockFixture(),
    getActionOperationId: () => 'op-123',
    config: { initialDelayMs: 10, intervalMs: 10, maxAttempts: 10, timeoutMs: 1000 },
  });
  const result = await poller.startPolling();
  assert.equal(result.status, 'verified');
  assert.ok(pollCount >= 3);
});

test('startPolling times out after maxAttempts', async () => {
  const poller = createResultPoller({
    readResultsPage: async () => createMockResultsSnapshot([]),
    getExpectedFixture: () => createMockFixture(),
    getActionOperationId: () => 'op-123',
    config: { initialDelayMs: 10, intervalMs: 10, maxAttempts: 3, timeoutMs: 1000 },
  });
  const result = await poller.startPolling();
  assert.equal(result.status, 'RESULTS_NOT_FOUND');
  assert.equal(result.timeout, true);
});

test('determineSettlementOutcome returns UNRESOLVED_MARKET for unmapped bet', () => {
  const instruction = { strategyKey: 'oneX', betKingMappingStatus: 'UNRESOLVED_MARKET' };
  const result = { status: 'verified', fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET);
});

test('determineSettlementOutcome returns SKIPPED_BELOW_MINIMUM', () => {
  const instruction = { strategyKey: 'oneX', status: 'SKIPPED_BELOW_MINIMUM', reason: 'Stake 5 below minimum 10' };
  const result = { status: 'verified', fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.SKIPPED_BELOW_MINIMUM);
});

test('determineSettlementOutcome returns RESULT_UNVERIFIED when result not verified', () => {
  const instruction = { strategyKey: 'oneX', betKingMappingStatus: 'MATCHED' };
  const result = { status: 'observing', fullTime: { home: 2, away: 1 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED);
});

test('determineSettlementOutcome keeps winner (6-0) unresolved because its semantics are undefined', () => {
  const instruction = { strategyKey: 'winner', betKingMappingStatus: 'MATCHED' };
  const result = { status: 'verified', fullTime: { home: 6, away: 0 }, halfTime: { home: 3, away: 0 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET);
});

test('determineSettlementOutcome WON for oneX (Liverpool leads at HT, FT draw)', () => {
  const instruction = { strategyKey: 'oneX', betKingMappingStatus: 'MATCHED', liverpoolSide: 'HOME' };
  const result = { status: 'verified', fullTime: { home: 1, away: 1 }, halfTime: { home: 1, away: 0 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
  assert.deepEqual(outcome.htScore, { home: 1, away: 0 });
  assert.deepEqual(outcome.ftScore, { home: 1, away: 1 });
});

test('determineSettlementOutcome LOST for oneX (FT not a draw)', () => {
  const instruction = { strategyKey: 'oneX', betKingMappingStatus: 'MATCHED', liverpoolSide: 'HOME' };
  const result = { status: 'verified', fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.LOST);
});

test('determineSettlementOutcome derives Liverpool side from the instruction fixture', () => {
  const instruction = { strategyKey: 'twoX', betKingMappingStatus: 'MATCHED', fixture: { home: 'mnu', away: 'liv' } };
  const result = { status: 'verified', fullTime: { home: 2, away: 2 }, halfTime: { home: 2, away: 0 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('determineSettlementOutcome is AMBIGUOUS_FIXTURE for oneX when Liverpool side is unknown', () => {
  const instruction = { strategyKey: 'oneX', betKingMappingStatus: 'MATCHED' };
  const result = { status: 'verified', fullTime: { home: 1, away: 1 }, halfTime: { home: 1, away: 0 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.AMBIGUOUS_FIXTURE);
});

test('determineSettlementOutcome keeps x2, tg0, and tg6 unresolved (no settlement condition defined)', () => {
  const result = { status: 'verified', fullTime: { home: 1, away: 2 }, halfTime: { home: 0, away: 1 } };
  for (const strategyKey of ['x2', 'tg0', 'tg6']) {
    const outcome = determineSettlementOutcome(result, { strategyKey, betKingMappingStatus: 'MATCHED' });
    assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET, strategyKey);
  }
});

test('determineSettlementOutcome WON for ht12 (HT 1-2)', () => {
  const instruction = { strategyKey: 'ht12', betKingMappingStatus: 'MATCHED' };
  const result = { status: 'verified', fullTime: { home: 2, away: 3 }, halfTime: { home: 1, away: 2 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('determineSettlementOutcome WON for ht21 (HT 2-1)', () => {
  const instruction = { strategyKey: 'ht21', betKingMappingStatus: 'MATCHED' };
  const result = { status: 'verified', fullTime: { home: 3, away: 2 }, halfTime: { home: 2, away: 1 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('determineSettlementOutcome WON for ht30 (HT 3-0)', () => {
  const instruction = { strategyKey: 'ht30', betKingMappingStatus: 'MATCHED' };
  const result = { status: 'verified', fullTime: { home: 4, away: 1 }, halfTime: { home: 3, away: 0 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('determineSettlementOutcome WON for ft40 (FT 4-0)', () => {
  const instruction = { strategyKey: 'ft40', betKingMappingStatus: 'MATCHED' };
  const result = { status: 'verified', fullTime: { home: 4, away: 0 }, halfTime: { home: 2, away: 0 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('determineSettlementOutcome WON for ft41 (FT 4-1)', () => {
  const instruction = { strategyKey: 'ft41', betKingMappingStatus: 'MATCHED' };
  const result = { status: 'verified', fullTime: { home: 4, away: 1 }, halfTime: { home: 2, away: 0 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('determineSettlementOutcome returns UNRESOLVED_MARKET for unknown key', () => {
  const instruction = { strategyKey: 'unknown', betKingMappingStatus: 'MATCHED' };
  const result = { status: 'verified', fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } };
  const outcome = determineSettlementOutcome(result, instruction);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET);
});

test('createSettlementReporter reports all instructions with outcomes', () => {
  const instructions = [
    { strategyKey: 'winner', strategyLabel: '6-0', canonicalId: 'SCORE_6_0', stake: 31, betKingMappingStatus: 'UNRESOLVED_MARKET', status: 'QUALIFYING' },
    { strategyKey: 'oneX', strategyLabel: '1X', canonicalId: 'DOUBLE_CHANCE_1X', stake: 5, betKingMappingStatus: 'UNRESOLVED_MARKET', status: 'SKIPPED_BELOW_MINIMUM', reason: 'Below minimum' },
  ];
  const verifiedResult = { status: 'verified', fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 }, resultId: 'result-123' };
  
  const reporter = createSettlementReporter({
    getInstructions: () => instructions,
    getVerifiedResult: () => verifiedResult,
    getActionOperationId: () => 'op-456',
  });
  
  const report = reporter.reportAll();
  assert.equal(report.length, 2);
  assert.equal(report[0].outcome, SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET);
  assert.equal(report[1].outcome, SETTLEMENT_OUTCOMES.SKIPPED_BELOW_MINIMUM);
  assert.equal(report[0].actionOperationId, 'op-456');
  assert.equal(report[0].resultId, 'result-123');
});