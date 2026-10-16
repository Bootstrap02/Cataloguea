const { ASSET_KEYS } = require('./catalogueaAdapter');

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
    phase: 'UNSPECIFIED',
    semanticsStatus: SEMANTICS_STATUS.UNRESOLVED,
    condition: { scoreLabel: '6-0', scoreOrder: 'UNRESOLVED' },
    meaning: 'The separate winner odds field funds the UI 6\u20130 stake; the user calls it the 6\u20130 option, but whether it is an exact score, a margin, and from whose perspective is not defined by the strategy source.',
  },
  {
    canonicalId: 'STRATEGY_1X',
    legacyCanonicalIds: ['DOUBLE_CHANCE_1X'],
    strategyKey: 'oneX',
    strategyLabel: '1X',
    phase: 'HALF_TIME_AND_FULL_TIME',
    perspective: 'LIVERPOOL',
    semanticsStatus: SEMANTICS_STATUS.USER_SPECIFIED,
    condition: { halfTime: 'LIVERPOOL_LEADS', fullTime: 'DRAW' },
    meaning: 'Strategy-specific (NOT the conventional Double Chance 1X). Wins when Liverpool leads at half time AND the full-time score is a draw: HT_LIV > HT_OPP AND FT_LIV = FT_OPP.',
  },
  {
    canonicalId: 'STRATEGY_2X',
    strategyKey: 'twoX',
    strategyLabel: '2X',
    phase: 'HALF_TIME_AND_FULL_TIME',
    perspective: 'LIVERPOOL',
    semanticsStatus: SEMANTICS_STATUS.USER_SPECIFIED,
    condition: { halfTime: 'LIVERPOOL_TRAILS', fullTime: 'DRAW' },
    meaning: 'Strategy-specific reverse of oneX; not an alias for X2. Wins when Liverpool trails at half time AND the full-time score is a draw: HT_LIV < HT_OPP AND FT_LIV = FT_OPP.',
  },
  {
    canonicalId: 'DOUBLE_CHANCE_X2',
    strategyKey: 'x2',
    strategyLabel: 'X2',
    phase: 'UNSPECIFIED',
    perspective: 'LIVERPOOL',
    semanticsStatus: SEMANTICS_STATUS.ORIENTATION_ONLY,
    condition: { label: 'X2' },
    orientation: { LIVERPOOL_HOME: 'X2', LIVERPOOL_AWAY: 'X1' },
    meaning: 'Selection depends on Liverpool position: Liverpool home -> X2, Liverpool away -> X1 (user rule). The settlement condition for X2/X1 is not specified and stays unresolved; no separate x1 strategy key exists.',
  },
  {
    canonicalId: 'TOTAL_GOALS_0',
    strategyKey: 'tg0',
    strategyLabel: 'TG0',
    phase: 'UNSPECIFIED',
    semanticsStatus: SEMANTICS_STATUS.UNRESOLVED,
    condition: { label: 'TG0' },
    meaning: 'The strategy UI category is TG0; whether this means exactly zero or a goals-market line is not encoded in the strategy source.',
  },
  {
    canonicalId: 'TOTAL_GOALS_6',
    strategyKey: 'tg6',
    strategyLabel: 'TG6',
    phase: 'UNSPECIFIED',
    semanticsStatus: SEMANTICS_STATUS.UNRESOLVED,
    condition: { label: 'TG6' },
    meaning: 'The strategy UI category is TG6; whether this means exactly six or a goals-market line is not encoded in the strategy source.',
  },
  {
    canonicalId: 'HT_SCORE_1_2',
    strategyKey: 'ht12',
    strategyLabel: 'HT12',
    phase: 'HALF_TIME',
    semanticsStatus: SEMANTICS_STATUS.ASSUMED_FROM_LABEL,
    condition: { home: 1, away: 2 },
    meaning: 'ASSUMED from the label (not defined in strategy source): half-time score 1-2 in home-away order. Whether it is Liverpool-relative is unconfirmed.',
  },
  {
    canonicalId: 'HT_SCORE_2_1',
    strategyKey: 'ht21',
    strategyLabel: 'HT21',
    phase: 'HALF_TIME',
    semanticsStatus: SEMANTICS_STATUS.ASSUMED_FROM_LABEL,
    condition: { home: 2, away: 1 },
    meaning: 'ASSUMED from the label (not defined in strategy source): half-time score 2-1 in home-away order. Whether it is Liverpool-relative is unconfirmed.',
  },
  {
    canonicalId: 'HT_SCORE_3_0',
    strategyKey: 'ht30',
    strategyLabel: 'HT30',
    phase: 'HALF_TIME',
    semanticsStatus: SEMANTICS_STATUS.ASSUMED_FROM_LABEL,
    condition: { home: 3, away: 0 },
    meaning: 'ASSUMED from the label (not defined in strategy source): half-time score 3-0 in home-away order. Whether it is Liverpool-relative is unconfirmed.',
  },
  {
    canonicalId: 'FT_SCORE_4_0',
    strategyKey: 'ft40',
    strategyLabel: 'FT40',
    phase: 'FULL_TIME',
    semanticsStatus: SEMANTICS_STATUS.ASSUMED_FROM_LABEL,
    condition: { home: 4, away: 0 },
    meaning: 'ASSUMED from the label (not defined in strategy source): full-time score 4-0 in home-away order. Whether it is Liverpool-relative is unconfirmed.',
  },
  {
    canonicalId: 'FT_SCORE_4_1',
    strategyKey: 'ft41',
    strategyLabel: 'FT41',
    phase: 'FULL_TIME',
    semanticsStatus: SEMANTICS_STATUS.ASSUMED_FROM_LABEL,
    condition: { home: 4, away: 1 },
    meaning: 'ASSUMED from the label (not defined in strategy source): full-time score 4-1 in home-away order. Whether it is Liverpool-relative is unconfirmed.',
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
  FROM_VIDEO_UNVERIFIED: 'PROPOSED_FROM_VIDEO_UNVERIFIED_IN_DOM',
  NEEDS_OWNER_CONFIRMATION: 'PROPOSED_NEEDS_OWNER_CONFIRMATION',
  CATEGORY_CANDIDATE: 'CATEGORY_CANDIDATE_SELECTION_UNRESOLVED',
});

// HT/FT symbols are written from the HOME team's side: first symbol = half-time result,
// second = full-time result (1 = home, X = draw, 2 = away).
const MARKET_PROPOSALS = Object.freeze({
  oneX: Object.freeze({
    status: PROPOSAL_STATUS.FROM_VIDEO_UNVERIFIED,
    category: 'HT/FT',
    selectionBySide: Object.freeze({ HOME: '1/X', AWAY: '2/X' }),
    basis: 'oneX = Liverpool leads at half time and the match is drawn. Liverpool home: HT home lead, FT draw = 1/X. Liverpool away: HT away lead, FT draw = 2/X.',
  }),
  twoX: Object.freeze({
    status: PROPOSAL_STATUS.FROM_VIDEO_UNVERIFIED,
    category: 'HT/FT',
    selectionBySide: Object.freeze({ HOME: '2/X', AWAY: '1/X' }),
    basis: 'twoX = Liverpool trails at half time and the match is drawn. Liverpool home: HT away lead, FT draw = 2/X. Liverpool away: HT home lead, FT draw = 1/X.',
  }),
  x2: Object.freeze({
    status: PROPOSAL_STATUS.NEEDS_OWNER_CONFIRMATION,
    category: 'HT/FT',
    selectionBySide: Object.freeze({ HOME: 'X/2', AWAY: 'X/1' }),
    basis: 'Reading of the owner rule "Liverpool home -> X2, away -> X1" in HT/FT notation: half-time draw, then the OPPONENT wins. The owner has not confirmed this reading, and the x2 settlement condition is still undefined, so it must not be used until confirmed.',
  }),
  winner: Object.freeze({ status: PROPOSAL_STATUS.CATEGORY_CANDIDATE, category: 'Correct Score', basis: 'Category exists in the recording; the winner (6-0) condition and the exact selection are not defined.' }),
  tg0: Object.freeze({ status: PROPOSAL_STATUS.CATEGORY_CANDIDATE, category: 'Total Goals', basis: 'Category exists in the recording; contents not shown.' }),
  tg6: Object.freeze({ status: PROPOSAL_STATUS.CATEGORY_CANDIDATE, category: 'Total Goals', basis: 'Category exists in the recording; contents not shown.' }),
  ht12: Object.freeze({ status: PROPOSAL_STATUS.CATEGORY_CANDIDATE, category: 'Half Time', basis: 'Category exists in the recording; contents not shown; the key meaning is itself an assumption.' }),
  ht21: Object.freeze({ status: PROPOSAL_STATUS.CATEGORY_CANDIDATE, category: 'Half Time', basis: 'Category exists in the recording; contents not shown; the key meaning is itself an assumption.' }),
  ht30: Object.freeze({ status: PROPOSAL_STATUS.CATEGORY_CANDIDATE, category: 'Half Time', basis: 'Category exists in the recording; contents not shown; the key meaning is itself an assumption.' }),
  ft40: Object.freeze({ status: PROPOSAL_STATUS.CATEGORY_CANDIDATE, category: 'Correct Score', basis: 'Category exists in the recording; contents not shown; the key meaning is itself an assumption.' }),
  ft41: Object.freeze({ status: PROPOSAL_STATUS.CATEGORY_CANDIDATE, category: 'Correct Score', basis: 'Category exists in the recording; contents not shown; the key meaning is itself an assumption.' }),
});

// Returns the proposal for a key, with the selection oriented for Liverpool's position when
// the proposal is orientation dependent. Never returns a VERIFIED status.
function getMarketProposal(strategyKey, liverpoolSide = null) {
  const proposal = MARKET_PROPOSALS[strategyKey];
  if (!proposal) return null;
  return {
    status: proposal.status,
    category: proposal.category,
    selection: proposal.selectionBySide ? (proposal.selectionBySide[liverpoolSide] ?? null) : null,
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
