const { ASSET_KEYS } = require('./catalogueaAdapter');
const { OWNER_MAPPINGS } = require('./marketMappings');

const UNRESOLVED_MARKET = 'UNRESOLVED_MARKET';

// semanticsStatus vocabulary:
//   USER_SPECIFIED       - win condition supplied explicitly by the user (Stage 27).
//   ORIENTATION_ONLY     - only the Liverpool home/away selection label is
//                          specified; the settlement condition is not.
//   ASSUMED_FROM_LABEL   - condition inferred from the key/label by an earlier
//                          stage; NOT defined in the strategy source and not yet
//                          confirmed by the user (home-away order, and whether it
//                          is Liverpool-relative, are unconfirmed).
//   UNRESOLVED           - meaning not established anywhere.
const SEMANTICS_STATUS = Object.freeze({
  // Owner defined the win condition and its market (Oct 17 statement and slip screenshots).
  OWNER_DEFINED: 'OWNER_DEFINED',
  USER_SPECIFIED: 'USER_SPECIFIED',
  ORIENTATION_ONLY: 'ORIENTATION_ONLY',
  ASSUMED_FROM_LABEL: 'ASSUMED_FROM_LABEL',
  UNRESOLVED: 'UNRESOLVED',
});

const STRATEGY_BET_TYPES = Object.freeze([
  {
    canonicalId: 'SCORE_6_0',
    strategyKey: 'winner',
    strategyLabel: '6\u20130',
    phase: 'FULL_TIME',
    semanticsStatus: SEMANTICS_STATUS.OWNER_DEFINED,
    condition: { liverpoolGoals: 6, opponentGoals: 0, scoreLabel: '6-0' },
    meaning: 'Wins when Liverpool wins 6-0 at full time (FT_LIV = 6 and FT_OPP = 0). BetKing: Correct Score 6-0 when Liverpool is home, 0-6 when away.',
    perspective: 'LIVERPOOL',
  },
  {
    canonicalId: 'STRATEGY_1X',
    legacyCanonicalIds: ['DOUBLE_CHANCE_1X'],
    strategyKey: 'oneX',
    strategyLabel: '1X',
    phase: 'HALF_TIME_AND_FULL_TIME',
    perspective: 'LIVERPOOL',
    semanticsStatus: SEMANTICS_STATUS.OWNER_DEFINED,
    condition: { halfTime: 'LIVERPOOL_LEADS', fullTime: 'DRAW' },
    meaning: 'Strategy-specific (NOT the conventional Double Chance 1X). Wins when Liverpool leads at half time AND the full-time score is a draw: HT_LIV > HT_OPP AND FT_LIV = FT_OPP. BetKing: HT/FT 1/X when Liverpool is home, 2/X when away.',
  },
  {
    canonicalId: 'STRATEGY_2X',
    strategyKey: 'twoX',
    strategyLabel: '2X',
    phase: 'HALF_TIME_AND_FULL_TIME',
    perspective: 'LIVERPOOL',
    semanticsStatus: SEMANTICS_STATUS.OWNER_DEFINED,
    condition: { halfTime: 'LIVERPOOL_TRAILS', fullTime: 'DRAW' },
    meaning: 'Strategy-specific reverse of oneX. Wins when Liverpool trails at half time AND the full-time score is a draw: HT_LIV < HT_OPP AND FT_LIV = FT_OPP. BetKing: HT/FT 2/X when Liverpool is home, 1/X when away.',
  },
  {
    canonicalId: 'DOUBLE_CHANCE_X2',
    strategyKey: 'x2',
    strategyLabel: 'X2',
    phase: 'HALF_TIME_AND_FULL_TIME',
    perspective: 'LIVERPOOL',
    semanticsStatus: SEMANTICS_STATUS.OWNER_DEFINED,
    condition: { halfTime: 'DRAW', fullTime: 'LIVERPOOL_LOSES' },
    meaning: 'Wins when the half-time score is level and Liverpool then loses: HT_LIV = HT_OPP AND FT_LIV < FT_OPP. BetKing: HT/FT X/2 when Liverpool is home, X/1 when away (not Double Chance).',
  },
  {
    canonicalId: 'TOTAL_GOALS_0',
    strategyKey: 'tg0',
    strategyLabel: 'TG0',
    phase: 'FULL_TIME',
    semanticsStatus: SEMANTICS_STATUS.OWNER_DEFINED,
    condition: { totalGoals: 0 },
    meaning: 'Wins when the match has no goals at full time (FT_LIV + FT_OPP = 0). BetKing: Total Goals 0.',
    perspective: 'LIVERPOOL',
  },
  {
    canonicalId: 'TOTAL_GOALS_6',
    strategyKey: 'tg6',
    strategyLabel: 'TG6',
    phase: 'FULL_TIME',
    semanticsStatus: SEMANTICS_STATUS.OWNER_DEFINED,
    condition: { totalGoals: 6 },
    meaning: 'Wins when the match has exactly six goals at full time (FT_LIV + FT_OPP = 6). BetKing: Total Goals 6 (the catalogue checks that the label means exactly six).',
    perspective: 'LIVERPOOL',
  },
  {
    canonicalId: 'HT_SCORE_1_2',
    strategyKey: 'ht12',
    strategyLabel: 'HT12',
    phase: 'HALF_TIME',
    semanticsStatus: SEMANTICS_STATUS.OWNER_DEFINED,
    condition: { home: 1, away: 2 },
    meaning: 'Wins when the half-time score is Liverpool 1, opponent 2 (HT_LIV = 1 and HT_OPP = 2). BetKing: HT Correct Score 1-2 when Liverpool is home, 2-1 when away. The condition field is written Liverpool-opponent.',
    perspective: 'LIVERPOOL',
  },
  {
    canonicalId: 'HT_SCORE_2_1',
    strategyKey: 'ht21',
    strategyLabel: 'HT21',
    phase: 'HALF_TIME',
    semanticsStatus: SEMANTICS_STATUS.OWNER_DEFINED,
    condition: { home: 2, away: 1 },
    meaning: 'Wins when the half-time score is Liverpool 2, opponent 1 (HT_LIV = 2 and HT_OPP = 1). BetKing: HT Correct Score 2-1 when Liverpool is home, 1-2 when away. The condition field is written Liverpool-opponent.',
    perspective: 'LIVERPOOL',
  },
  {
    canonicalId: 'HT_SCORE_3_0',
    strategyKey: 'ht30',
    strategyLabel: 'HT30',
    phase: 'HALF_TIME',
    semanticsStatus: SEMANTICS_STATUS.OWNER_DEFINED,
    condition: { home: 3, away: 0 },
    meaning: 'Wins when the half-time score is Liverpool 3, opponent 0 (HT_LIV = 3 and HT_OPP = 0). BetKing: HT Correct Score 3-0 when Liverpool is home, 0-3 when away. The condition field is written Liverpool-opponent.',
    perspective: 'LIVERPOOL',
  },
  {
    canonicalId: 'FT_SCORE_4_0',
    strategyKey: 'ft40',
    strategyLabel: 'FT40',
    phase: 'FULL_TIME',
    semanticsStatus: SEMANTICS_STATUS.OWNER_DEFINED,
    condition: { home: 4, away: 0 },
    meaning: 'Wins when Liverpool wins 4-0 at full time (FT_LIV = 4 and FT_OPP = 0). BetKing: Correct Score 4-0 when Liverpool is home, 0-4 when away. The condition field is written Liverpool-opponent.',
    perspective: 'LIVERPOOL',
  },
  {
    canonicalId: 'FT_SCORE_4_1',
    strategyKey: 'ft41',
    strategyLabel: 'FT41',
    phase: 'FULL_TIME',
    semanticsStatus: SEMANTICS_STATUS.OWNER_DEFINED,
    condition: { home: 4, away: 1 },
    meaning: 'Wins when Liverpool wins 4-1 at full time (FT_LIV = 4 and FT_OPP = 1). BetKing: Correct Score 4-1 when Liverpool is home, 1-4 when away. The condition field is written Liverpool-opponent.',
    perspective: 'LIVERPOOL',
  },
].map((betType) => Object.freeze({
  ...betType,
  condition: Object.freeze(betType.condition),
  orientation: betType.orientation ? Object.freeze({ ...betType.orientation }) : undefined,
  legacyCanonicalIds: Object.freeze([...(betType.legacyCanonicalIds || [])]),
  aliases: Object.freeze([
    betType.strategyKey,
    betType.strategyLabel,
    betType.canonicalId,
    ...(betType.legacyCanonicalIds || []),
  ]),
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

// ---- Market proposals from the owner's screen recording (Oct 15, 2026) -----------------
//
// EVIDENCE LEVEL: VISIBLE IN VIDEO ONLY. None of this has been verified against the DOM, and
// none of it makes a mapping VERIFIED. A mapping becomes usable only when the owner records it
// as VERIFIED, with evidence, in the mappings file (see betking-market-mappings.example.json).
//
// What the recording shows: the mobile Virtuals page; a "More Markets" panel listing the
// categories below; the HT/FT category with, for each fixture, a 3x3 grid of selections
// labelled 1/1 1/X 1/2 X/1 X/X X/2 2/1 2/X 2/2 (for LIV - AST: 3.01 13.30 58.10 7.32 5.94
// 12.40 35.40 13.30 6.19); the slip showing "HT/FT - 1/X".
const OBSERVED_BETKING_MARKET_CATEGORIES = Object.freeze([
  'Favourites', 'Popular', 'Over/Under', 'Home Goals', 'Away Goals', '1X2 & GG/NG',
  '1X2 & O/U 1.5', '1X2 & O/U 2.5', 'HT/FT', 'Half Time', 'Total Goals', 'Correct Score',
]);

const OBSERVED_HTFT_SELECTIONS = Object.freeze([
  '1/1', '1/X', '1/2', 'X/1', 'X/X', 'X/2', '2/1', '2/X', '2/2',
]);

const PROPOSAL_STATUS = Object.freeze({
  OWNER_CONFIRMED: 'OWNER_CONFIRMED',
  FROM_VIDEO_UNVERIFIED: 'PROPOSED_FROM_VIDEO_UNVERIFIED_IN_DOM',
  NEEDS_OWNER_CONFIRMATION: 'PROPOSED_NEEDS_OWNER_CONFIRMATION',
  CATEGORY_CANDIDATE: 'CATEGORY_CANDIDATE_SELECTION_UNRESOLVED',
});

// HT/FT symbols are written from the HOME team's side: first symbol = half-time result, second =
// full-time result (1 home, X draw, 2 away). Every option is defined from Liverpool's side, so the
// selection depends on whether Liverpool is home or away. The table lives in marketMappings.js.
const MARKET_PROPOSALS = Object.freeze(Object.fromEntries(
  Object.entries(OWNER_MAPPINGS).map(([key, mapping]) => [key, Object.freeze({
    status: PROPOSAL_STATUS.OWNER_CONFIRMED,
    category: mapping.category,
    market: mapping.market,
    ...(mapping.selectionBySide ? { selectionBySide: mapping.selectionBySide } : { selection: mapping.selection }),
    basis: mapping.evidence,
  })]),
));

// Returns the proposal for a key, with the selection oriented for Liverpool's position when
// the proposal is orientation dependent. Never returns a VERIFIED status.
function getMarketProposal(strategyKey, liverpoolSide = null) {
  const proposal = MARKET_PROPOSALS[strategyKey];
  if (!proposal) return null;
  return {
    status: proposal.status,
    category: proposal.category,
    market: proposal.market,
    selection: proposal.selectionBySide ? (proposal.selectionBySide[liverpoolSide] ?? null) : (proposal.selection ?? null),
    basis: proposal.basis,
  };
}

module.exports = {
  MARKET_PROPOSALS,
  OBSERVED_BETKING_MARKET_CATEGORIES,
  OBSERVED_HTFT_SELECTIONS,
  PROPOSAL_STATUS,
  getMarketProposal,
  SEMANTICS_STATUS,
  OBSERVED_BETKING_MARKET_CONTRACT,
  OBSERVED_BETKING_MARKET_LABELS,
  STRATEGY_BET_TYPES,
  UNRESOLVED_MARKET,
  resolveCanonicalBetType,
};
