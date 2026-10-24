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
    'NOT_PLACED',
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

test('evaluateMinimumStake returns SKIPPED_BELOW_MINIMUM for stakes below 10', () => {
  assert.deepEqual(evaluateMinimumStake(3), { status: 'SKIPPED_BELOW_MINIMUM', reason: 'Stake 3 is below the minimum of 10.' });
  assert.deepEqual(evaluateMinimumStake(8), { status: 'SKIPPED_BELOW_MINIMUM', reason: 'Stake 8 is below the minimum of 10.' });
  assert.deepEqual(evaluateMinimumStake(9.99), { status: 'SKIPPED_BELOW_MINIMUM', reason: 'Stake 9.99 is below the minimum of 10.' });
});

test('evaluateMinimumStake returns QUALIFIES for stakes of 10 or more (10 itself qualifies)', () => {
  assert.deepEqual(evaluateMinimumStake(10), { status: 'QUALIFIES', reason: 'Stake 10 meets the minimum of 10.' });
  assert.deepEqual(evaluateMinimumStake(11), { status: 'QUALIFIES', reason: 'Stake 11 meets the minimum of 10.' });
  assert.deepEqual(evaluateMinimumStake(50), { status: 'QUALIFIES', reason: 'Stake 50 meets the minimum of 10.' });
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

test('every one of the 11 strategy keys now has a defined win condition', () => {
  for (const key of ['winner', 'oneX', 'twoX', 'x2', 'tg0', 'tg6', 'ht12', 'ht21', 'ht30', 'ft40', 'ft41']) {
    const semantics = getStrategyKeySemantics(key);
    assert.equal(semantics.resolved, true, `${key} should be resolved`);
    assert.equal(semantics.semanticsStatus, 'OWNER_DEFINED', `${key} should be owner defined`);
  }
});

test('winner wins only when Liverpool wins 6-0, at home or away', () => {
  const home = { status: 'verified', halfTime: { home: 3, away: 0 }, fullTime: { home: 6, away: 0 } };
  const away = { status: 'verified', halfTime: { home: 0, away: 3 }, fullTime: { home: 0, away: 6 } };
  assert.equal(evaluateResultAgainstStrategy(home, 'winner', { liverpoolSide: 'HOME' }).outcome, SETTLEMENT_OUTCOMES.WON);
  assert.equal(evaluateResultAgainstStrategy(away, 'winner', { liverpoolSide: 'AWAY' }).outcome, SETTLEMENT_OUTCOMES.WON);
  assert.equal(evaluateResultAgainstStrategy(away, 'winner', { liverpoolSide: 'HOME' }).outcome, SETTLEMENT_OUTCOMES.LOST);
  const fiveNil = { status: 'verified', halfTime: { home: 2, away: 0 }, fullTime: { home: 5, away: 0 } };
  assert.equal(evaluateResultAgainstStrategy(fiveNil, 'winner', { liverpoolSide: 'HOME' }).outcome, SETTLEMENT_OUTCOMES.LOST);
});

test('x2 wins when half time is level and Liverpool then loses', () => {
  const homeLoss = { status: 'verified', halfTime: { home: 0, away: 0 }, fullTime: { home: 0, away: 1 } };
  const awayLoss = { status: 'verified', halfTime: { home: 1, away: 1 }, fullTime: { home: 2, away: 1 } };
  assert.equal(evaluateResultAgainstStrategy(homeLoss, 'x2', { liverpoolSide: 'HOME' }).outcome, SETTLEMENT_OUTCOMES.WON);
  assert.equal(evaluateResultAgainstStrategy(awayLoss, 'x2', { liverpoolSide: 'AWAY' }).outcome, SETTLEMENT_OUTCOMES.WON);
  const ledAtHalfTime = { status: 'verified', halfTime: { home: 1, away: 0 }, fullTime: { home: 1, away: 2 } };
  assert.equal(evaluateResultAgainstStrategy(ledAtHalfTime, 'x2', { liverpoolSide: 'HOME' }).outcome, SETTLEMENT_OUTCOMES.LOST);
  const drew = { status: 'verified', halfTime: { home: 0, away: 0 }, fullTime: { home: 1, away: 1 } };
  assert.equal(evaluateResultAgainstStrategy(drew, 'x2', { liverpoolSide: 'HOME' }).outcome, SETTLEMENT_OUTCOMES.LOST);
});

test('tg0 and tg6 are exact total goals and do not depend on which side Liverpool is', () => {
  const goalless = { status: 'verified', halfTime: { home: 0, away: 0 }, fullTime: { home: 0, away: 0 } };
  const sixGoals = { status: 'verified', halfTime: { home: 3, away: 1 }, fullTime: { home: 4, away: 2 } };
  const sevenGoals = { status: 'verified', halfTime: { home: 3, away: 1 }, fullTime: { home: 5, away: 2 } };
  assert.equal(evaluateResultAgainstStrategy(goalless, 'tg0').outcome, SETTLEMENT_OUTCOMES.WON);
  assert.equal(evaluateResultAgainstStrategy(sixGoals, 'tg6').outcome, SETTLEMENT_OUTCOMES.WON);
  assert.equal(evaluateResultAgainstStrategy(sixGoals, 'tg6', { liverpoolSide: 'AWAY' }).outcome, SETTLEMENT_OUTCOMES.WON);
  assert.equal(evaluateResultAgainstStrategy(sevenGoals, 'tg6').outcome, SETTLEMENT_OUTCOMES.LOST);
  assert.equal(evaluateResultAgainstStrategy(sixGoals, 'tg0').outcome, SETTLEMENT_OUTCOMES.LOST);
});

test('the half-time and correct-score options are read from Liverpool\'s side when she is away', () => {
  // Away at half time Liverpool leads 2-1: the site shows it as 1-2 (home-away).
  const result = { status: 'verified', halfTime: { home: 1, away: 2 }, fullTime: { home: 2, away: 4 } };
  assert.equal(evaluateResultAgainstStrategy(result, 'ht21', { liverpoolSide: 'AWAY' }).outcome, SETTLEMENT_OUTCOMES.WON);
  assert.equal(evaluateResultAgainstStrategy(result, 'ht12', { liverpoolSide: 'AWAY' }).outcome, SETTLEMENT_OUTCOMES.LOST);
  const thirty = { status: 'verified', halfTime: { home: 0, away: 3 }, fullTime: { home: 0, away: 4 } };
  assert.equal(evaluateResultAgainstStrategy(thirty, 'ht30', { liverpoolSide: 'AWAY' }).outcome, SETTLEMENT_OUTCOMES.WON);
  assert.equal(evaluateResultAgainstStrategy(thirty, 'ft40', { liverpoolSide: 'AWAY' }).outcome, SETTLEMENT_OUTCOMES.WON);
  const fourOne = { status: 'verified', halfTime: { home: 0, away: 2 }, fullTime: { home: 1, away: 4 } };
  assert.equal(evaluateResultAgainstStrategy(fourOne, 'ft41', { liverpoolSide: 'AWAY' }).outcome, SETTLEMENT_OUTCOMES.WON);
  assert.equal(evaluateResultAgainstStrategy(fourOne, 'ft41', { liverpoolSide: 'HOME' }).outcome, SETTLEMENT_OUTCOMES.LOST);
});

test('a key with no Liverpool side is ambiguous (except total goals)', () => {
  const result = { status: 'verified', halfTime: { home: 3, away: 0 }, fullTime: { home: 6, away: 0 } };
  assert.equal(evaluateResultAgainstStrategy(result, 'winner').outcome, SETTLEMENT_OUTCOMES.AMBIGUOUS_FIXTURE);
  assert.equal(evaluateResultAgainstStrategy(result, 'ht30').outcome, SETTLEMENT_OUTCOMES.AMBIGUOUS_FIXTURE);
});

test('evaluateResultAgainstStrategy returns RESULT_UNVERIFIED when result not verified', () => {
  const result = { status: 'observing', halfTime: { home: 1, away: 0 }, fullTime: { home: 2, away: 1 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12', { liverpoolSide: 'HOME' });
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED);
});

test('evaluateResultAgainstStrategy returns RESULT_UNVERIFIED when fullTime missing', () => {
  const result = { status: 'verified', halfTime: { home: 1, away: 0 }, fullTime: null };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12', { liverpoolSide: 'HOME' });
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED);
});

test('evaluateResultAgainstStrategy returns RESULT_UNVERIFIED when fullTime invalid', () => {
  const result = { status: 'verified', halfTime: { home: 1, away: 0 }, fullTime: { home: 2 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12', { liverpoolSide: 'HOME' });
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED);
});

test('evaluateResultAgainstStrategy returns RESULT_UNVERIFIED when HT required but missing', () => {
  const result = { status: 'verified', halfTime: null, fullTime: { home: 2, away: 1 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12', { liverpoolSide: 'HOME' });
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED);
});

test('evaluateResultAgainstStrategy WON for ht12 with HT 1-2', () => {
  const result = { status: 'verified', halfTime: { home: 1, away: 2 }, fullTime: { home: 2, away: 3 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12', { liverpoolSide: 'HOME' });
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('evaluateResultAgainstStrategy LOST for ht12 with different HT', () => {
  const result = { status: 'verified', halfTime: { home: 2, away: 1 }, fullTime: { home: 3, away: 2 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12', { liverpoolSide: 'HOME' });
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.LOST);
});

test('evaluateResultAgainstStrategy WON for ht21 with HT 2-1', () => {
  const result = { status: 'verified', halfTime: { home: 2, away: 1 }, fullTime: { home: 3, away: 2 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht21', { liverpoolSide: 'HOME' });
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('evaluateResultAgainstStrategy WON for ht30 with HT 3-0', () => {
  const result = { status: 'verified', halfTime: { home: 3, away: 0 }, fullTime: { home: 4, away: 1 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht30', { liverpoolSide: 'HOME' });
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('evaluateResultAgainstStrategy WON for ft40 with FT 4-0', () => {
  const result = { status: 'verified', halfTime: { home: 2, away: 0 }, fullTime: { home: 4, away: 0 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ft40', { liverpoolSide: 'HOME' });
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('evaluateResultAgainstStrategy WON for ft41 with FT 4-1', () => {
  const result = { status: 'verified', halfTime: { home: 2, away: 0 }, fullTime: { home: 4, away: 1 } };
  const outcome = evaluateResultAgainstStrategy(result, 'ft41', { liverpoolSide: 'HOME' });
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('ruleRegistry has all seven rules', () => {
  assert.ok(ruleRegistry.hasRule('RULE-001'));
  assert.ok(ruleRegistry.hasRule('RULE-002'));
  assert.ok(ruleRegistry.hasRule('RULE-003'));
  assert.ok(ruleRegistry.hasRule('RULE-004'));
  assert.ok(ruleRegistry.hasRule('RULE-005'));
  assert.ok(ruleRegistry.hasRule('RULE-006'));
  assert.ok(ruleRegistry.hasRule('RULE-007'));
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

test('RULE-002 evaluate qualifies when combined is at least 10', () => {
  const rule2 = ruleRegistry.getRule('RULE-002');
  const result = rule2.evaluate(0, 15);
  assert.equal(result.combined, 15);
  assert.equal(result.qualification, STAKE_QUALIFICATION.QUALIFIES);
});

test('RULE-003 evaluate delegates to evaluateResultAgainstStrategy', () => {
  const rule3 = ruleRegistry.getRule('RULE-003');
  const result = { status: 'verified', halfTime: { home: 1, away: 2 }, fullTime: { home: 2, away: 3 } };
  const outcome = rule3.evaluate(result, 'ht12', { liverpoolSide: 'HOME' });
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('createRuleRegistry creates independent registry', () => {
  const newRegistry = createRuleRegistry();
  assert.ok(newRegistry.hasRule('RULE-001'));
  assert.ok(newRegistry.hasRule('RULE-002'));
  assert.ok(newRegistry.hasRule('RULE-003'));
  newRegistry.registerRule('RULE-099', { name: 'Test', description: 'Test', parameters: {}, evaluate: () => {} });
  assert.ok(newRegistry.hasRule('RULE-099'));
  assert.ok(!ruleRegistry.hasRule('RULE-099'));
});

test('ruleRegistry getAllRules returns all rules', () => {
  const all = ruleRegistry.getAllRules();
  assert.equal(all.length, 7);
});

test('evaluateResultAgainstStrategy handles verified flag correctly', () => {
  const result = { status: 'verified', halfTime: { home: 1, away: 2, verified: true }, fullTime: { home: 2, away: 3, verified: true } };
  const outcome = evaluateResultAgainstStrategy(result, 'ht12', { liverpoolSide: 'HOME' });
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
  assert.ok(outcome.resolved);
  assert.deepEqual(outcome.htScore, { home: 1, away: 2 });
  assert.deepEqual(outcome.ftScore, { home: 2, away: 3 });
});

test('RULE-002 merges components that are each below 10 before applying the minimum', () => {
  const rule2 = ruleRegistry.getRule('RULE-002');
  const result = rule2.evaluate(7, 6);
  assert.equal(result.combined, 13);
  assert.equal(result.qualification, STAKE_QUALIFICATION.QUALIFIES);
});

test('RULE-002 combines a normal 150 and big-deficit 1050 into one 1200 amount', () => {
  const merged = mergeNormalAndBigDeficitStakes(150, 1050);
  assert.deepEqual(merged, { normal: 150, big: 1050, combined: 1200 });
});

const LIV_HOME = { liverpoolSide: 'HOME' };
const LIV_AWAY = { liverpoolSide: 'AWAY' };
const verified = (halfTime, fullTime) => ({ status: 'verified', halfTime, fullTime });

test('oneX WON when Liverpool (home) leads at HT and FT is a draw', () => {
  const outcome = evaluateResultAgainstStrategy(verified({ home: 1, away: 0 }, { home: 1, away: 1 }), 'oneX', LIV_HOME);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
  assert.deepEqual(outcome.liverpoolPerspective, {
    side: 'HOME', htLiverpool: 1, htOpponent: 0, ftLiverpool: 1, ftOpponent: 1,
  });
});

test('oneX WON for Liverpool away leading 0-2 at HT with a 2-2 draw', () => {
  const outcome = evaluateResultAgainstStrategy(verified({ home: 0, away: 2 }, { home: 2, away: 2 }), 'oneX', LIV_AWAY);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('oneX accepts other qualifying scorelines (2-1 and 3-0 HT, 3-3 FT)', () => {
  assert.equal(evaluateResultAgainstStrategy(verified({ home: 2, away: 1 }, { home: 3, away: 3 }), 'oneX', LIV_HOME).outcome, SETTLEMENT_OUTCOMES.WON);
  assert.equal(evaluateResultAgainstStrategy(verified({ home: 3, away: 0 }, { home: 3, away: 3 }), 'oneX', LIV_HOME).outcome, SETTLEMENT_OUTCOMES.WON);
});

test('oneX LOST when full time is not a draw even if Liverpool led at HT', () => {
  const outcome = evaluateResultAgainstStrategy(verified({ home: 1, away: 0 }, { home: 2, away: 1 }), 'oneX', LIV_HOME);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.LOST);
});

test('oneX LOST when HT is level or Liverpool trails, even with an FT draw', () => {
  assert.equal(evaluateResultAgainstStrategy(verified({ home: 0, away: 0 }, { home: 1, away: 1 }), 'oneX', LIV_HOME).outcome, SETTLEMENT_OUTCOMES.LOST);
  assert.equal(evaluateResultAgainstStrategy(verified({ home: 0, away: 1 }, { home: 1, away: 1 }), 'oneX', LIV_HOME).outcome, SETTLEMENT_OUTCOMES.LOST);
});

test('oneX is evaluated from Liverpool perspective, not home/away', () => {
  // Home team leads at HT, but Liverpool is away, so Liverpool trails.
  const outcome = evaluateResultAgainstStrategy(verified({ home: 1, away: 0 }, { home: 1, away: 1 }), 'oneX', LIV_AWAY);
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.LOST);
});

test('twoX WON when Liverpool trails at HT and FT is a draw', () => {
  assert.equal(evaluateResultAgainstStrategy(verified({ home: 0, away: 1 }, { home: 1, away: 1 }), 'twoX', LIV_HOME).outcome, SETTLEMENT_OUTCOMES.WON);
  assert.equal(evaluateResultAgainstStrategy(verified({ home: 2, away: 0 }, { home: 2, away: 2 }), 'twoX', LIV_AWAY).outcome, SETTLEMENT_OUTCOMES.WON);
  assert.equal(evaluateResultAgainstStrategy(verified({ home: 1, away: 2 }, { home: 3, away: 3 }), 'twoX', LIV_HOME).outcome, SETTLEMENT_OUTCOMES.WON);
});

test('twoX LOST when Liverpool leads at HT or FT is not a draw', () => {
  assert.equal(evaluateResultAgainstStrategy(verified({ home: 1, away: 0 }, { home: 1, away: 1 }), 'twoX', LIV_HOME).outcome, SETTLEMENT_OUTCOMES.LOST);
  assert.equal(evaluateResultAgainstStrategy(verified({ home: 0, away: 1 }, { home: 0, away: 2 }), 'twoX', LIV_HOME).outcome, SETTLEMENT_OUTCOMES.LOST);
});

test('oneX and twoX are never evaluated from the final score alone', () => {
  const noHalfTime = verified(null, { home: 1, away: 1 });
  assert.equal(evaluateResultAgainstStrategy(noHalfTime, 'oneX', LIV_HOME).outcome, SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED);
  assert.equal(evaluateResultAgainstStrategy(noHalfTime, 'twoX', LIV_HOME).outcome, SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED);
});

test('oneX/twoX stay unresolved when the full-time score is missing', () => {
  const noFullTime = verified({ home: 1, away: 0 }, null);
  assert.equal(evaluateResultAgainstStrategy(noFullTime, 'oneX', LIV_HOME).outcome, SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED);
});

test('oneX is AMBIGUOUS_FIXTURE when Liverpool home/away position is unknown', () => {
  const outcome = evaluateResultAgainstStrategy(verified({ home: 1, away: 0 }, { home: 1, away: 1 }), 'oneX');
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.AMBIGUOUS_FIXTURE);
});

test('Liverpool side can be derived from a fixture', () => {
  const outcome = evaluateResultAgainstStrategy(
    verified({ home: 0, away: 1 }, { home: 1, away: 1 }),
    'oneX',
    { fixture: { home: 'mnu', away: 'liv' } },
  );
  assert.equal(outcome.outcome, SETTLEMENT_OUTCOMES.WON);
});

test('RULE-004 orients each option by Liverpool home/away position', () => {
  const rule4 = ruleRegistry.getRule('RULE-004');
  assert.equal(rule4.evaluate('x2', 'HOME').selection, 'X/2');
  assert.equal(rule4.evaluate('x2', 'AWAY').selection, 'X/1');
  assert.equal(rule4.evaluate('oneX', 'HOME').selection, '1/X');
  assert.equal(rule4.evaluate('oneX', 'AWAY').selection, '2/X');
  assert.equal(rule4.evaluate('twoX', 'AWAY').selection, '1/X');
  assert.equal(rule4.evaluate('winner', 'AWAY').selection, '0-6');
  assert.equal(rule4.evaluate('ft41', 'AWAY').selection, '1-4');
  assert.equal(rule4.evaluate('ht30', 'AWAY').selection, '0-3');
  assert.equal(rule4.evaluate('x2', null).selection, null);
  assert.equal(rule4.evaluate('tg0', 'HOME').oriented, false);
});

test('RULE-005 treats skipped options as non-winning and gives them no marks', () => {
  const rule5 = ruleRegistry.getRule('RULE-005');
  const skipped = rule5.evaluate('SKIPPED_BELOW_MINIMUM');
  assert.equal(skipped.receivesMarks, false);
  assert.equal(skipped.treatment, 'NON_WINNING_IN_STRATEGY_SETTLEMENT');
  const eligible = rule5.evaluate('QUALIFIES');
  assert.equal(eligible.receivesMarks, true);
  assert.equal(eligible.treatment, null);
});


test('RULE-006 refuses to select an odd before category, selection, fixture, and odds are verified', () => {
  const { createOptionPipeline } = require('./marketFirstSequence');
  const rule6 = ruleRegistry.getRule('RULE-006');
  const pipeline = createOptionPipeline({ strategyKey: 'oneX' });
  assert.equal(rule6.evaluate(pipeline).allowed, false);
  assert.equal(rule6.evaluate(null).allowed, false);
});

test('RULE-007 requires an empty slip before selecting and exactly one selection after', () => {
  const rule7 = ruleRegistry.getRule('RULE-007');
  assert.equal(rule7.evaluate({ phase: 'BEFORE_SELECTING', slipCount: 0 }).allowed, true);
  assert.equal(rule7.evaluate({ phase: 'BEFORE_SELECTING', slipCount: 2 }).allowed, false);
  assert.equal(rule7.evaluate({ phase: 'AFTER_SELECTING', slipCount: 1 }).allowed, true);
  assert.equal(rule7.evaluate({ phase: 'AFTER_SELECTING', slipCount: 2 }).allowed, false);
  assert.equal(rule7.evaluate({ phase: 'AFTER_SELECTING', slipCount: null }).allowed, false);
});
