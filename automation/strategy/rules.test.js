const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MINIMUM_STAKE,
  STAKE_QUALIFICATION,
  SETTLEMENT_OUTCOMES,
  STRATEGY_KEYS,
  evaluateMinimumStake,
  mergeNormalAndBigDeficitStakes,
  evaluateResultAgainstStrategy,
  getStrategyKeySemantics,
  createRuleRegistry,
  ruleRegistry,
} = require('./rules');

test('MINIMUM_STAKE is 10', () => {
  assert.equal(MINIMUM_STAKE, 10);
});

test('STAKE_QUALIFICATION has correct statuses', () => {
  assert.deepEqual(Object.keys(STAKE_QUALIFICATION).sort(), [
    'INVALID_STAKE',
    'QUALIFIES',
    'SKIPPED_BELOW_MINIMUM',
  ]);
});

test('SETTLEMENT_OUTCOMES has all expected statuses', () => {
  const expected = [
    'AMBIGUOUS_FIXTURE',
    'LOST',
    'PENDING_RESULT',
    'RESULT_UNVERIFIED',
    'SKIPPED_BELOW_MINIMUM',
    'UNRESOLVED_MARKET',
    'WON',
  ];
  assert.deepEqual(Object.keys(SETTLEMENT_OUTCOMES).sort(), expected);
});

test('STRATEGY_KEYS contains all 11 keys', () => {
  assert.equal(STRATEGY_KEYS.length, 11);
  assert.deepEqual(STRATEGY_KEYS, [
    'winner', 'oneX', 'twoX', 'x2', 'tg0', 'tg6',
    'ht12', 'ht21', 'ht30', 'ft40', 'ft41',
  ]);
});

test('evaluateMinimumStake returns INVALID_STAKE for missing/negative/non-finite', () => {
  assert.deepEqual(evaluateMinimumStake(null), { status: 'INVALID_STAKE', reason: 'Invalid or missing stake amount.' });
  assert.deepEqual(evaluateMinimumStake(undefined), { status: 'INVALID_STAKE', reason: 'Invalid or missing stake amount.' });
  assert.deepEqual(evaluateMinimumStake(-5), { status: 'INVALID_STAKE', reason: 'Invalid or missing stake amount.' });
  assert.deepEqual(evaluateMinimumStake(NaN), { status: 'INVALID_STAKE', reason: 'Invalid or missing stake amount.' });
  assert.deepEqual(evaluateMinimumStake(Infinity), { status: 'INVALID_STAKE', reason: 'Invalid or missing stake amount.' });
  assert.deepEqual(evaluateMinimumStake('10'), { status: 'INVALID_STAKE', reason: 'Invalid or missing stake amount.' });
});

test('evaluateMinimumStake returns SKIPPED_BELOW_MINIMUM for stakes <= 10', () => {
  assert.deepEqual(evaluateMinimumStake(5), { status: 'SKIPPED_BELOW_MINIMUM', reason: 'Stake 5 is not greater than the minimum of 10.' });
  assert.deepEqual(evaluateMinimumStake(9), { status: 'SKIPPED_BELOW_MINIMUM', reason: 'Stake 9 is not greater than the minimum of 10.' });
  assert.deepEqual(evaluateMinimumStake(10), { status: 'SKIPPED_BELOW_MINIMUM', reason: 'Stake 10 is not greater than the minimum of 10.' });
});

test('evaluateMinimumStake returns QUALIFIES for stakes > 10', () => {
  assert.deepEqual(evaluateMinimumStake(15), { status: 'QUALIFIES', reason: 'Stake 15 exceeds minimum 10.' });
  assert.deepEqual(evaluateMinimumStake(100), { status: 'QUALIFIES', reason: 'Stake 100 exceeds minimum 10.' });
});

test('mergeNormalAndBigDeficitStakes combines correctly', () => {
  assert.deepEqual(mergeNormalAndBigDeficitStakes(15, 50), { normal: 15, big: 50, combined: 65 });
  assert.deepEqual(mergeNormalAndBigDeficitStakes(15, 7), { normal: 15, big: 7, combined: 22 });
  assert.deepEqual(mergeNormalAndBigDeficitStakes(7, 0), { normal: 7, big: 0, combined: 7 });
  assert.deepEqual(mergeNormalAndBigDeficitStakes(0, 15), { normal: 0, big: 15, combined: 15 });
});

test('mergeNormalAndBigDeficitStakes handles invalid inputs as 0', () => {
  assert.deepEqual(mergeNormalAndBigDeficitStakes(null, 10), { normal: 0, big: 10, combined: 10 });
  assert.deepEqual(mergeNormalAndBigDeficitStakes(-5, 10), { normal: 0, big: 10, combined: 10 });
  assert.deepEqual(mergeNormalAndBigDeficitStakes(5, NaN), { normal: 5, big: 0, combined: 5 });
});

test('getStrategyKeySemantics returns semantics for all 11 keys', () => {
  for (const key of STRATEGY_KEYS) {
    const semantics = getStrategyKeySemantics(key);
    assert.ok(semantics, `Missing semantics for ${key}`);
    assert.ok(semantics.canonicalId);
    assert.ok(semantics.strategyLabel);
    assert.ok(semantics.meaning);
  }
});

test('getStrategyKeySemantics returns null for unknown key', () => {
  assert.equal(getStrategyKeySemantics('unknown'), null);
});

test('evaluateResultAgainstStrategy returns UNRESOLVED_MARKET for unknown key', () => {
  const result = { status: 'verified', halfTime: { home: 1, away: 0 }, fullTime: { home: 2, away: 1 } };
  const outcome = evaluateResultAgainstStrategy(result, 'unknown');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET);
});

test('evaluateResultAgainstStrategy returns UNRESOLVED_MARKET for unresolved semantics (winner, oneX, twoX, x2, tg0, tg6)', () => {
  const result = { status: 'verified', halfTime: { home: 1, away: 0 }, fullTime: { home: 2, away: 1 } };
  for (const key of ['winner', 'oneX', 'twoX', 'x2', 'tg0', 'tg6']) {
    const outcome = evaluateResultAgainstStrategy(result, key);
    assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET, `Key ${key} should be unresolved`);
  }
});

test('evaluateResultAgainstStrategy returns RESULT_UNVERIFIED when result not verified', () => {
  const result = { status: 'observing', halfTime: { home: 1, away: 0 }, fullTime: { home: 2, away: 1 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED);
});

test('evaluateResultAgainstStrategy returns RESULT_UNVERIFIED when fullTime missing', () => {
  const result = { status: 'verified', halfTime: { home: 1, away: 0 }, fullTime: null };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED);
});

test('evaluateResultAgainstStrategy returns RESULT_UNVERIFIED when fullTime invalid', () => {
  const result = { status: 'verified', halfTime: { home: 1, away: 0 }, fullTime: { home: 2 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED);
});

test('evaluateResultAgainstStrategy returns RESULT_UNVERIFIED when HT required but missing', () => {
  const result = { status: 'verified', halfTime: null, fullTime: { home: 2, away: 1 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED);
});

test('evaluateResultAgainstStrategy WON for ht12 with HT 1-2', () => {
  const result = { status: 'verified', halfTime: { home: 1, away: 2 }, fullTime: { home: 2, away: 3 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('evaluateResultAgainstStrategy LOST for ht12 with different HT', () => {
  const result = { status: 'verified', halfTime: { home: 2, away: 1 }, fullTime: { home: 3, away: 2 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.LOST);
});

test('evaluateResultAgainstStrategy WON for ht21 with HT 2-1', () => {
  const result = { status: 'verified', halfTime: { home: 2, away: 1 }, fullTime: { home: 3, away: 2 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht21');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('evaluateResultAgainstStrategy WON for ht30 with HT 3-0', () => {
  const result = { status: 'verified', halfTime: { home: 3, away: 0 }, fullTime: { home: 4, away: 1 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht30');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('evaluateResultAgainstStrategy WON for ft40 with FT 4-0', () => {
  const result = { status: 'verified', halfTime: { home: 2, away: 0 }, fullTime: { home: 4, away: 0 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ft40');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('evaluateResultAgainstStrategy WON for ft41 with FT 4-1', () => {
  const result = { status: 'verified', halfTime: { home: 2, away: 0 }, fullTime: { home: 4, away: 1 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ft41');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('ruleRegistry has all three rules', () => {
  assert.ok(ruleRegistry.hasRule('RULE-001'));
  assert.ok(ruleRegistry.hasRule('RULE-002'));
  assert.ok(ruleRegistry.hasRule('RULE-003'));
});

test('ruleRegistry rules have correct structure', () => {
  const rule1 = ruleRegistry.getRule('RULE-001');
  assert.equal(rule1.id, 'RULE-001');
  assert.equal(rule1.name, 'Minimum Stake');
  assert.ok(typeof rule1.evaluate === 'function');
  assert.ok(rule1.parameters);
  assert.equal(rule1.parameters.minimumStake, 10);
});

test('RULE-001 evaluate matches evaluateMinimumStake', () => {
  const rule1 = ruleRegistry.getRule('RULE-001');
  assert.deepEqual(rule1.evaluate(5), evaluateMinimumStake(5));
  assert.deepEqual(rule1.evaluate(15), evaluateMinimumStake(15));
});

test('RULE-002 evaluate merges and applies minimum', () => {
  const rule2 = ruleRegistry.getRule('RULE-002');
  const result = rule2.evaluate(7, 0);
  assert.equal(result.combined, 7);
  assert.equal(result.qualification, STAKE_QUALIFICATION.SKIPPED_BELOW_MINIMUM);
});

test('RULE-002 evaluate qualifies when combined > 10', () => {
  const rule2 = ruleRegistry.getRule('RULE-002');
  const result = rule2.evaluate(0, 15);
  assert.equal(result.combined, 15);
  assert.equal(result.qualification, STAKE_QUALIFICATION.QUALIFIES);
});

test('RULE-003 evaluate delegates to evaluateResultAgainstStrategy', () => {
  const rule3 = ruleRegistry.getRule('RULE-003');
  const result = { status: 'verified', halfTime: { home: 1, away: 2 }, fullTime: { home: 2, away: 3 } };
  const outcome = rule3.evaluate(result, 'ht12');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('createRuleRegistry creates independent registry', () => {
  const newRegistry = createRuleRegistry();
  assert.ok(newRegistry.hasRule('RULE-001'));
  assert.ok(newRegistry.hasRule('RULE-002'));
  assert.ok(newRegistry.hasRule('RULE-003'));
  newRegistry.registerRule('RULE-004', { name: 'Test', description: 'Test', parameters: {}, evaluate: () => {} });
  assert.ok(newRegistry.hasRule('RULE-004'));
  assert.ok(!ruleRegistry.hasRule('RULE-004'));
});

test('ruleRegistry getAllRules returns all rules', () => {
  const all = ruleRegistry.getAllRules();
  assert.equal(all.length, 3);
});

test('evaluateResultAgainstStrategy handles verified flag correctly', () => {
  const result = { status: 'verified', halfTime: { home: 1, away: 2, verified: true }, fullTime: { home: 2, away: 3, verified: true } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
  assert.ok(outcome.resolved);
  assert.deepEqual(outcome.htScore, { home: 1, away: 2 });
  assert.deepEqual(outcome.ftScore, { home: 2, away: 3 });
});