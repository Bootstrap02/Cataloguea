const test = require('node:test');
const assert = require('node:assert/strict');
const { createStrategyDecisionAdapter } = require('./strategy/strategyDecisionAdapter');
const { ASSET_KEYS } = require('./strategy/catalogueaAdapter');

const createMockSnapshot = (overrides = {}) => {
  const defaultState = {
    baseStake: 10000,
    deficit: 0,
    smallDeficit: 0,
    privateDef: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    bigDef: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    brokenTarget: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    clicked: new Set(),
    winners: new Set(),
    bigWinners: new Set(),
    winnerStake: 0,
    recommendedAction: 'await_fixture_submission',
    observedAt: new Date().toISOString(),
    fixture: null,
  };
  return { ...defaultState, ...overrides };
};

test('strategy decision adapter rejects when no fixture is submitted', () => {
  const snapshot = createMockSnapshot();
  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: () => snapshot,
  });
  const result = adapter.getCurrentInstructions();
  assert.equal(result.status, 'FIXTURE_NOT_SUBMITTED');
  assert.equal(result.instructions.length, 0);
  assert.ok(result.reason.includes('No active fixture'));
});

test('strategy decision adapter calculates stakes for all assets when fixture is submitted', () => {
  const fixture = {
    id: 'arsmnu',
    home: 'ars',
    away: 'mnu',
    winner: 325,
    oneX: 14.7,
    twoX: 14.7,
    x2: 14.6,
    tg0: 15.1,
    tg6: 16.9,
    ht12: 22.4,
    ht21: 13.4,
    ht30: 26.2,
    ft40: 35.8,
    ft41: 30,
  };
  const snapshot = createMockSnapshot({
    fixture,
    recommendedAction: 'manual_result_entry',
  });
  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: () => snapshot,
  });
  const result = adapter.getCurrentInstructions();
  assert.equal(result.status, 'OK');
  assert.equal(result.fixture.id, 'arsmnu');
  assert.equal(result.instructions.length, 11); // winner + 10 assets
  assert.equal(result.instructions[0].strategyKey, 'winner');
  assert.ok(result.instructions[0].stake >= 10); // winner stake minimum is 10
});

test('strategy decision adapter marks stakes below minimum as SKIPPED_BELOW_MINIMUM', () => {
  // Create a state where stakes will be between 1 and 9
  // The fixture structure matches Scores.js: winner, oneX, etc. are direct properties
  // stake = round((smallDeficit) / (odd - 1))
  // With baseStake=1000, deficit=0 -> winnerStake=max(round(1000/325), 10) = 10 -> smallDeficit=10
  // To get stake between 1-9: need smallDeficit / (odd-1) to be 1-9
  // e.g., odd=3 -> 10/(3-1)=5 (below 10), odd=2.5 -> 10/1.5=6.67->7, odd=2.2 -> 10/1.2=8.33->8
  const fixture = {
    id: 'arsmnu',
    home: 'ars',
    away: 'mnu',
    winner: 325,
    oneX: 3.0,
    twoX: 3.0,
    x2: 3.0,
    tg0: 3.0,
    tg6: 3.0,
    ht12: 3.0,
    ht21: 3.0,
    ht30: 3.0,
    ft40: 3.0,
    ft41: 3.0,
  };
  const snapshot = createMockSnapshot({
    fixture,
    baseStake: 1000,
    deficit: 0,
    smallDeficit: 0,
    privateDef: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    bigDef: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    brokenTarget: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    recommendedAction: 'manual_result_entry',
  });
  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: () => snapshot,
  });
  const result = adapter.getCurrentInstructions();
  assert.equal(result.status, 'OK');
  // With odds=3.0 and smallDeficit=10, stakes = round(10/2) = 5 (below minimum 10)
  const skipped = result.instructions.filter((i) => i.status === 'SKIPPED_BELOW_MINIMUM');
  assert.ok(skipped.length > 0, 'Should have some skipped instructions');
  skipped.forEach((instr) => {
    assert.ok(instr.stake < 10, `Stake ${instr.stake} should be below minimum`);
    assert.ok(instr.reason.includes('below the minimum'));
  });
});

test('strategy decision adapter marks NO_STAKE_CALCULATED when stake is zero', () => {
  // Use a state where all deficits and private defs are zero and odds are very high
  const fixture = {
    id: 'arsmnu',
    home: 'ars',
    away: 'mnu',
    winner: 325,
    oneX: 1000, // Very high odds
    twoX: 1000,
    x2: 1000,
    tg0: 1000,
    tg6: 1000,
    ht12: 1000,
    ht21: 1000,
    ht30: 1000,
    ft40: 1000,
    ft41: 1000,
  };
  const snapshot = createMockSnapshot({
    fixture,
    baseStake: 1000,
    deficit: 0,
    smallDeficit: 0,
    privateDef: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    bigDef: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    brokenTarget: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    recommendedAction: 'manual_result_entry',
  });
  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: () => snapshot,
  });
  const result = adapter.getCurrentInstructions();
  assert.equal(result.status, 'OK');
  const noStake = result.instructions.filter((i) => i.status === 'NO_STAKE_CALCULATED');
  // With very high odds and zero deficits, stakes should be 0
  // The formula: Math.round((0 + 0 + 0) / (odd - 1)) = 0
  assert.ok(noStake.length > 0, 'Should have some NO_STAKE_CALCULATED instructions');
  noStake.forEach((instr) => {
    assert.equal(instr.stake, 0);
  });
});

test('strategy decision adapter preserves stake amounts without rounding them up', () => {
  const fixture = {
    id: 'arsmnu',
    home: 'ars',
    away: 'mnu',
    winner: 325,
    oneX: 14.7,
    twoX: 14.7,
    x2: 14.6,
    tg0: 15.1,
    tg6: 16.9,
    ht12: 22.4,
    ht21: 13.4,
    ht30: 26.2,
    ft40: 35.8,
    ft41: 30,
  };
  const snapshot = createMockSnapshot({
    fixture,
    recommendedAction: 'manual_result_entry',
  });
  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: () => snapshot,
  });
  const result = adapter.getCurrentInstructions();
  assert.equal(result.status, 'OK');
  // Stakes should be exact calculated values, not rounded up to minimum
  result.instructions.forEach((instr) => {
    if (instr.status === 'SKIPPED_BELOW_MINIMUM') {
      assert.ok(instr.stake < 10, `Skipped stake ${instr.stake} should be preserved as-is`);
      assert.ok(instr.stake >= 0);
    }
  });
});

test('strategy decision adapter includes all 11 strategy keys in output', () => {
  const fixture = {
    id: 'arsmnu',
    home: 'ars',
    away: 'mnu',
    winner: 325,
    oneX: 14.7,
    twoX: 14.7,
    x2: 14.6,
    tg0: 15.1,
    tg6: 16.9,
    ht12: 22.4,
    ht21: 13.4,
    ht30: 26.2,
    ft40: 35.8,
    ft41: 30,
  };
  const snapshot = createMockSnapshot({
    fixture,
    recommendedAction: 'manual_result_entry',
  });
  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: () => snapshot,
  });
  const result = adapter.getCurrentInstructions();
  assert.equal(result.status, 'OK');
  const keys = result.instructions.map((i) => i.strategyKey);
  assert.deepEqual(keys.sort(), ['winner', ...ASSET_KEYS].sort());
});

test('strategy decision adapter does not mutate the strategy snapshot', () => {
  const fixture = {
    id: 'arsmnu',
    home: 'ars',
    away: 'mnu',
    winner: 325,
    oneX: 14.7,
    twoX: 14.7,
    x2: 14.6,
    tg0: 15.1,
    tg6: 16.9,
    ht12: 22.4,
    ht21: 13.4,
    ht30: 26.2,
    ft40: 35.8,
    ft41: 30,
  };
  const snapshot = createMockSnapshot({
    fixture,
    recommendedAction: 'manual_result_entry',
  });
  // Deep clone for comparison, converting Sets to arrays
  const cloneForCompare = (obj) => JSON.parse(JSON.stringify(obj, (key, value) => 
    value instanceof Set ? Array.from(value) : value
  ));
  const originalSnapshot = cloneForCompare(snapshot);
  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: () => snapshot,
  });
  adapter.getCurrentInstructions();
  const afterSnapshot = cloneForCompare(snapshot);
  assert.deepEqual(afterSnapshot, originalSnapshot);
});

test('strategy decision adapter reports NO_STAKE_CALCULATED for assets with zero stake', () => {
  // Use a state where all deficits and private defs are zero and odds are high
  const fixture = {
    id: 'arsmnu',
    home: 'ars',
    away: 'mnu',
    winner: 325,
    oneX: 1000, // Very high odds
    twoX: 1000,
    x2: 1000,
    tg0: 1000,
    tg6: 1000,
    ht12: 1000,
    ht21: 1000,
    ht30: 1000,
    ft40: 1000,
    ft41: 1000,
  };
  const snapshot = createMockSnapshot({
    fixture,
    baseStake: 1000,
    deficit: 0,
    smallDeficit: 0,
    privateDef: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    bigDef: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    brokenTarget: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    recommendedAction: 'manual_result_entry',
  });
  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: () => snapshot,
  });
  const result = adapter.getCurrentInstructions();
  assert.equal(result.status, 'OK');
  const noStake = result.instructions.filter((i) => i.status === 'NO_STAKE_CALCULATED');
  // With very high odds and zero deficits, stakes should be 0 or 1 (rounded)
  // The formula: Math.round((0 + 0 + 0) / (odd - 1)) = 0
  // But there's a minimum of 0 in the formula, so some may be 0
  noStake.forEach((instr) => {
    assert.equal(instr.stake, 0);
  });
});