const test = require('node:test');
const assert = require('node:assert/strict');
const { ASSET_KEYS, adaptCatalogueaState } = require('./strategy/catalogueaAdapter');

const timestamp = '2026-10-06T18:00:00.000Z';

function strategySnapshot(overrides = {}) {
  return {
    fixture: null,
    gameStakes: Object.fromEntries(ASSET_KEYS.map((key) => [key, 0])),
    bigStakes: {},
    winnerStake: 0,
    winners: new Set(),
    bigWinners: new Set(),
    baseStake: 10000,
    deficit: 0,
    smallDeficit: 0,
    shadow: 0,
    bank: 0,
    observedAt: timestamp,
    ...overrides,
  };
}

test('reports no active fixture without proposing a betting action', () => {
  const instruction = adaptCatalogueaState(strategySnapshot());

  assert.equal(instruction.fixture, null);
  assert.deepEqual(instruction.assets, ASSET_KEYS.map((key) => ({
    key,
    stake: 0,
    bigDeficitStake: 0,
  })));
  assert.equal(instruction.strategyState.status, 'no_active_fixture');
  assert.equal(instruction.strategyState.resultState, 'not_observed');
  assert.equal(instruction.strategyState.settlementReady, false);
  assert.equal(instruction.recommendedAction, 'await_fixture_submission');
  assert.equal(instruction.observedAt, timestamp);
});

test('distinguishes a submitted fixture from calculated stake output', () => {
  const instruction = adaptCatalogueaState(strategySnapshot({
    fixture: { id: 'arsmnu', home: 'ars', away: 'mnu', winner: 325 },
  }));

  assert.deepEqual(instruction.fixture, {
    id: 'arsmnu',
    home: 'ars',
    away: 'mnu',
    odds: { winner: 325 },
  });
  assert.equal(instruction.strategyState.status, 'fixture_submitted');
  assert.equal(instruction.recommendedAction, 'await_strategy_stakes');
});

test('passes through precomputed multi-asset stakes without calculating them', () => {
  const instruction = adaptCatalogueaState(strategySnapshot({
    fixture: {
      id: 'arsmnu',
      home: 'ars',
      away: 'mnu',
      winner: 325,
      oneX: 14.7,
      twoX: 14.7,
      x2: 14.6,
    },
    winnerStake: 31,
    gameStakes: { oneX: 2, twoX: 2, x2: 2 },
    bigStakes: { x2: 4 },
  }));

  assert.deepEqual(instruction.assets, [
    { key: 'oneX', stake: 2, bigDeficitStake: 0 },
    { key: 'twoX', stake: 2, bigDeficitStake: 0 },
    { key: 'x2', stake: 2, bigDeficitStake: 4 },
  ]);
  assert.equal(instruction.winnerStake, 31);
  assert.equal(instruction.strategyState.status, 'stakes_available');
  assert.equal(instruction.recommendedAction, 'manual_result_entry');
  assert.equal(instruction.strategyState.resultState, 'not_observed');
  assert.equal(instruction.strategyState.settlementReady, false);
});

test('translates a real post-submit strategy-shaped snapshot without recalculating stakes', () => {
  const snapshot = strategySnapshot({
    fixture: {
      id: 'arsmnu',
      home: 'ars',
      away: 'mnu',
      winner: 325,
      oneX: 14.7,
      x2: 14.6,
    },
    winnerStake: 31,
    gameStakes: { oneX: 217, x2: 233 },
    bigStakes: { x2: 19 },
    privateDef: { oneX: 12, x2: 18 },
    bigDef: { x2: 400 },
    brokenTarget: { oneX: 9, x2: 27 },
    winners: new Set(),
    bigWinners: new Set(),
    clicked: new Set(),
  });
  const instruction = adaptCatalogueaState(snapshot, { clock: () => timestamp });

  assert.deepEqual(instruction.assets, [
    { key: 'oneX', stake: 217, bigDeficitStake: 0 },
    { key: 'x2', stake: 233, bigDeficitStake: 19 },
  ]);
  assert.equal(instruction.winnerStake, 31);
  assert.deepEqual(instruction.fixture.odds, { winner: 325, oneX: 14.7, x2: 14.6 });
  assert.deepEqual(snapshot.gameStakes, { oneX: 217, x2: 233 });
  assert.deepEqual(snapshot.bigStakes, { x2: 19 });
});

test('reports manual marks without claiming an observed match result', () => {
  const instruction = adaptCatalogueaState(strategySnapshot({
    fixture: { id: 'arsmnu', home: 'ars', away: 'mnu' },
    gameStakes: { oneX: 2 },
    winners: new Set(['oneX']),
  }));

  assert.equal(instruction.strategyState.status, 'manual_result_marked');
  assert.equal(instruction.strategyState.resultState, 'manual_selection_recorded');
  assert.equal(instruction.strategyState.settlementReady, true);
  assert.deepEqual(instruction.strategyState.manualWinnerMarks, ['oneX']);
  assert.equal(instruction.recommendedAction, 'manual_settlement_available');
});

test('rejects malformed or incomplete state instead of inventing defaults', () => {
  assert.throws(
    () => adaptCatalogueaState({ fixture: null }),
    /gameStakes.*must be an object/,
  );
  assert.throws(
    () => adaptCatalogueaState(strategySnapshot({ fixture: { id: 'bad', home: 'ars' } })),
    /fixture\.away/,
  );
  assert.throws(
    () => adaptCatalogueaState(strategySnapshot({ gameStakes: { unknown: 1 } })),
    /unknown asset/,
  );
  assert.throws(
    () => adaptCatalogueaState(strategySnapshot({ bank: Number.NaN })),
    /bank.*finite non-negative number/,
  );
});

test('does not mutate the supplied strategy snapshot', () => {
  const snapshot = strategySnapshot({
    fixture: { id: 'arsmnu', home: 'ars', away: 'mnu', winner: 325 },
    gameStakes: { oneX: 2 },
    winners: new Set(['oneX']),
  });
  const originalSnapshot = {
    ...snapshot,
    fixture: { ...snapshot.fixture },
    gameStakes: { ...snapshot.gameStakes },
    winners: new Set(snapshot.winners),
  };

  const instruction = adaptCatalogueaState(snapshot, { clock: () => timestamp });
  instruction.assets[0].stake = 999;
  instruction.strategyState.financialState.bank = 999;

  assert.deepEqual(snapshot, originalSnapshot);
});
