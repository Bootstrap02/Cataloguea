const { ASSET_KEYS } = require('./catalogueaAdapter');

const UNRESOLVED_MARKET = 'UNRESOLVED_MARKET';

const STRATEGY_BET_TYPES = Object.freeze([
  {
    canonicalId: 'SCORE_6_0',
    strategyKey: 'winner',
    strategyLabel: '6–0',
    phase: 'UNSPECIFIED',
    condition: { scoreLabel: '6-0', scoreOrder: 'UNRESOLVED' },
    meaning: 'The separate winner odds field funds the UI 6–0 stake; score orientation is not defined by the strategy source.',
  },
  {
    canonicalId: 'DOUBLE_CHANCE_1X',
    strategyKey: 'oneX',
    strategyLabel: '1X',
    phase: 'UNSPECIFIED',
    condition: { label: '1X' },
    meaning: 'The strategy UI label is 1X; the strategy code does not define settlement semantics for this label.',
  },
  {
    canonicalId: 'STRATEGY_2X',
    strategyKey: 'twoX',
    strategyLabel: '2X',
    phase: 'UNSPECIFIED',
    condition: { label: '2X' },
    meaning: 'The strategy UI label is 2X. It is preserved literally and is not treated as an alias for X2.',
  },
  {
    canonicalId: 'DOUBLE_CHANCE_X2',
    strategyKey: 'x2',
    strategyLabel: 'X2',
    phase: 'UNSPECIFIED',
    condition: { label: 'X2' },
    meaning: 'The strategy UI label is X2; the strategy code does not define settlement semantics for this label.',
  },
  {
    canonicalId: 'TOTAL_GOALS_0',
    strategyKey: 'tg0',
    strategyLabel: 'TG0',
    phase: 'UNSPECIFIED',
    condition: { label: 'TG0' },
    meaning: 'The strategy UI category is TG0; whether this means exactly zero or a goals-market line is not encoded in the strategy source.',
  },
  {
    canonicalId: 'TOTAL_GOALS_6',
    strategyKey: 'tg6',
    strategyLabel: 'TG6',
    phase: 'UNSPECIFIED',
    condition: { label: 'TG6' },
    meaning: 'The strategy UI category is TG6; whether this means exactly six or a goals-market line is not encoded in the strategy source.',
  },
  {
    canonicalId: 'HT_SCORE_1_2',
    strategyKey: 'ht12',
    strategyLabel: 'HT12',
    phase: 'HALF_TIME',
    condition: { home: 1, away: 2 },
    meaning: 'Half-time score 1-2, preserving home-away score order.',
  },
  {
    canonicalId: 'HT_SCORE_2_1',
    strategyKey: 'ht21',
    strategyLabel: 'HT21',
    phase: 'HALF_TIME',
    condition: { home: 2, away: 1 },
    meaning: 'Half-time score 2-1, preserving home-away score order.',
  },
  {
    canonicalId: 'HT_SCORE_3_0',
    strategyKey: 'ht30',
    strategyLabel: 'HT30',
    phase: 'HALF_TIME',
    condition: { home: 3, away: 0 },
    meaning: 'Half-time score 3-0, preserving home-away score order.',
  },
  {
    canonicalId: 'FT_SCORE_4_0',
    strategyKey: 'ft40',
    strategyLabel: 'FT40',
    phase: 'FULL_TIME',
    condition: { home: 4, away: 0 },
    meaning: 'Full-time score 4-0, preserving home-away score order.',
  },
  {
    canonicalId: 'FT_SCORE_4_1',
    strategyKey: 'ft41',
    strategyLabel: 'FT41',
    phase: 'FULL_TIME',
    condition: { home: 4, away: 1 },
    meaning: 'Full-time score 4-1, preserving home-away score order.',
  },
].map((betType) => Object.freeze({
  ...betType,
  condition: Object.freeze(betType.condition),
  aliases: Object.freeze([betType.strategyKey, betType.strategyLabel, betType.canonicalId]),
  betKing: Object.freeze({
    status: UNRESOLVED_MARKET,
    market: null,
    selection: null,
    aliases: Object.freeze([]),
  }),
})));

const OBSERVED_BETKING_MARKET_CONTRACT = Object.freeze({
  marketName: '1X2',
  marketNameSelector: '[data-testid="selected-market-name"]',
  selectionNames: Object.freeze(['1', 'X', '2']),
  selectionNameSelector: '[data-testid="selection-name"]',
  fixtureIdPattern: 'matchup-statistics-button-<HOME>-<AWAY>',
  fixtureIdExample: 'matchup-statistics-button-LIV-COV',
  oddsSelector: '[data-testid="match-odd-value"]',
  observation: 'Public scheduled fixture market observed; no strategy asset mapping is implied.',
});

const OBSERVED_BETKING_MARKET_LABELS = Object.freeze([
  '1X2',
  'Double Chance',
  'O/U 2.5',
  'GG/NG',
  'Correct Score',
]);

function normalizeAlias(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function resolveCanonicalBetType(alias) {
  const normalizedAlias = normalizeAlias(alias);
  if (!normalizedAlias) return null;

  const matches = STRATEGY_BET_TYPES.filter((betType) => (
    betType.aliases.some((candidate) => normalizeAlias(candidate) === normalizedAlias)
  ));
  if (matches.length > 1) {
    throw new Error(`Strategy bet-type alias "${alias}" is ambiguous.`);
  }
  return matches[0] || null;
}

if (STRATEGY_BET_TYPES.filter(({ strategyKey }) => strategyKey !== 'winner').length !== ASSET_KEYS.length) {
  throw new Error('Canonical strategy bet types do not match Cataloguea strategy asset keys.');
}

module.exports = {
  OBSERVED_BETKING_MARKET_CONTRACT,
  OBSERVED_BETKING_MARKET_LABELS,
  STRATEGY_BET_TYPES,
  UNRESOLVED_MARKET,
  resolveCanonicalBetType,
};
