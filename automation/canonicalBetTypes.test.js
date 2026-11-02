const test = require('node:test');
const assert = require('node:assert/strict');
const { ASSET_KEYS } = require('./strategy/catalogueaAdapter');
const {
  OBSERVED_BETKING_MARKET_CONTRACT,
  OBSERVED_BETKING_MARKET_LABELS,
  STRATEGY_BET_TYPES,
  UNRESOLVED_MARKET,
  resolveCanonicalBetType,
} = require('./strategy/canonicalBetTypes');

test('canonical strategy keys reflect the real odds and asset keys without reinterpreting them', () => {
  assert.deepEqual(
    STRATEGY_BET_TYPES
      .filter(({ strategyKey }) => strategyKey !== 'winner')
      .map(({ strategyKey }) => strategyKey),
    ASSET_KEYS,
  );
  assert.deepEqual(
    STRATEGY_BET_TYPES.map(({ strategyKey }) => strategyKey),
    ['winner', ...ASSET_KEYS],
  );
  assert.equal(resolveCanonicalBetType('ht21').canonicalId, 'HT_SCORE_2_1');
  assert.deepEqual(resolveCanonicalBetType('ht21').condition, { home: 2, away: 1 });
  assert.equal(resolveCanonicalBetType('ft41').canonicalId, 'FT_SCORE_4_1');
});

test('strategy, canonical, and BetKing names remain separate and unresolved markets are explicit', () => {
  assert.equal(resolveCanonicalBetType('2X').strategyKey, 'twoX');
  assert.equal(resolveCanonicalBetType('X2').strategyKey, 'x2');
  assert.notEqual(resolveCanonicalBetType('2X').canonicalId, resolveCanonicalBetType('X2').canonicalId);
  assert.ok(STRATEGY_BET_TYPES.every(({ betKing }) => (
    betKing.status === UNRESOLVED_MARKET
    && betKing.market === null
    && betKing.selection === null
  )));
});

test('records observed BetKing market and selection identifiers without claiming a strategy mapping', () => {
  assert.equal(OBSERVED_BETKING_MARKET_CONTRACT.marketName, '1X2');
  assert.deepEqual(OBSERVED_BETKING_MARKET_CONTRACT.selectionNames, ['1', 'X', '2']);
  assert.equal(
    OBSERVED_BETKING_MARKET_CONTRACT.fixtureIdExample,
    'matchup-statistics-button-ARS-COV',
  );
  assert.ok(OBSERVED_BETKING_MARKET_LABELS.includes('Correct Score'));
  assert.ok(OBSERVED_BETKING_MARKET_LABELS.includes('Double Chance'));
});
