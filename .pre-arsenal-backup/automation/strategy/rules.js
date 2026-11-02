const { STRATEGY_BET_TYPES } = require('./canonicalBetTypes');
const { canSelectOdd } = require('./marketFirstSequence');
const {
  LIVERPOOL_SIDE,
  ORIENTED_SELECTIONS,
  determineLiverpoolSide,
  resolveOrientedSelection,
  toLiverpoolScore,
} = require('./liverpoolPerspective');

// RULE-001 (Stage 27): a final stake qualifies when it is AT LEAST 10.
// Stakes below 10 are skipped. 10 itself qualifies. Earlier stages used a
// strict "greater than 10" comparison; the user's latest instruction replaces it.
const MINIMUM_STAKE = 10;

const STAKE_QUALIFICATION = Object.freeze({
  QUALIFIES: 'QUALIFIES',
  SKIPPED_BELOW_MINIMUM: 'SKIPPED_BELOW_MINIMUM',
  INVALID_STAKE: 'INVALID_STAKE',
});

const SETTLEMENT_OUTCOMES = Object.freeze({
  WON: 'WON',
  LOST: 'LOST',
  PENDING_RESULT: 'PENDING_RESULT',
  RESULT_UNVERIFIED: 'RESULT_UNVERIFIED',
  UNRESOLVED_MARKET: 'UNRESOLVED_MARKET',
  AMBIGUOUS_FIXTURE: 'AMBIGUOUS_FIXTURE',
  SKIPPED_BELOW_MINIMUM: 'SKIPPED_BELOW_MINIMUM',
  NOT_PLACED: 'NOT_PLACED',
});

// RULE-005 (Stage 28, confirmed by the user): an option skipped for a stake below
// the minimum is not played, receives no outcome mark, and is therefore treated
// by the strategy's own settlement as non-winning (a loss of its stake), even if
// its condition would have been met.
const SKIPPED_OPTION_TREATMENT = 'NON_WINNING_IN_STRATEGY_SETTLEMENT';

function resolveSkippedOptionTreatment(stakeQualification) {
  const skipped = stakeQualification === STAKE_QUALIFICATION.SKIPPED_BELOW_MINIMUM;
  return {
    receivesMarks: !skipped,
    treatment: skipped ? SKIPPED_OPTION_TREATMENT : null,
    reason: skipped
      ? 'Option was skipped (stake below the minimum): it is not evaluated for marks and the strategy settles it as non-winning.'
      : 'Option is stake-eligible and is evaluated normally.',
  };
}

// RULE-007: the slip must hold exactly the one selection being prepared. It must be empty
// before an odd is selected (the recording shows a second outcome of the same fixture and
// market REPLACES the first, and several selections would form one combined bet), and it
// must hold exactly one selection afterwards. Another person's selections are never cleared.
function evaluateSlipIsolation({ phase, slipCount }) {
  if (!Number.isInteger(slipCount) || slipCount < 0) {
    return { allowed: false, reason: 'The number of selections in the slip is unknown.' };
  }
  if (phase === 'BEFORE_SELECTING') {
    return slipCount === 0
      ? { allowed: true, reason: 'The slip is empty.' }
      : { allowed: false, reason: `The slip already holds ${slipCount} selection(s); clear it yourself first.` };
  }
  if (phase === 'AFTER_SELECTING') {
    return slipCount === 1
      ? { allowed: true, reason: 'The slip holds exactly one selection.' }
      : { allowed: false, reason: `Expected exactly 1 selection in the slip, saw ${slipCount}.` };
  }
  return { allowed: false, reason: `Unknown slip phase ${phase}.` };
}

const STRATEGY_KEYS = Object.freeze([
  'winner',
  'oneX',
  'twoX',
  'x2',
  'tg0',
  'tg6',
  'ht12',
  'ht21',
  'ht30',
  'ft40',
  'ft41',
]);

function isValidStake(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidScoreValue(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isCompleteScore(score) {
  return Boolean(score) && isValidScoreValue(score.home) && isValidScoreValue(score.away);
}

function evaluateMinimumStake(totalStake) {
  if (!isValidStake(totalStake)) {
    return { status: STAKE_QUALIFICATION.INVALID_STAKE, reason: 'Invalid or missing stake amount.' };
  }
  if (totalStake < MINIMUM_STAKE) {
    return {
      status: STAKE_QUALIFICATION.SKIPPED_BELOW_MINIMUM,
      reason: `Stake ${totalStake} is below the minimum of ${MINIMUM_STAKE}.`,
    };
  }
  return {
    status: STAKE_QUALIFICATION.QUALIFIES,
    reason: `Stake ${totalStake} meets the minimum of ${MINIMUM_STAKE}.`,
  };
}

// Combines the normal stake and the big-deficit stake of ONE option. The
// components come from the existing strategy (gameStakes / bigStakes); this
// function never invents or re-derives them, and never merges across options.
function mergeNormalAndBigDeficitStakes(normalStake, bigDeficitStake) {
  const normal = isValidStake(normalStake) ? normalStake : 0;
  const big = isValidStake(bigDeficitStake) ? bigDeficitStake : 0;
  return {
    normal,
    big,
    combined: normal + big,
  };
}

function getStrategyKeySemantics(strategyKey) {
  const betType = STRATEGY_BET_TYPES.find((bt) => bt.strategyKey === strategyKey);
  if (!betType) return null;
  return {
    canonicalId: betType.canonicalId,
    strategyLabel: betType.strategyLabel,
    phase: betType.phase,
    condition: betType.condition,
    meaning: betType.meaning,
    perspective: betType.perspective ?? null,
    semanticsStatus: betType.semanticsStatus,
    orientation: betType.orientation ?? null,
    resolved: betType.phase !== 'UNSPECIFIED' && betType.condition !== undefined,
  };
}

function resolveLiverpoolSide(context = {}) {
  if (context.liverpoolSide === LIVERPOOL_SIDE.HOME || context.liverpoolSide === LIVERPOOL_SIDE.AWAY) {
    return context.liverpoolSide;
  }
  if (context.fixture) {
    return determineLiverpoolSide(context.fixture).side;
  }
  return null;
}

// Evaluates one verified result against one strategy option.
//
// verifiedResult: { status: 'verified', halfTime: {home, away}, fullTime: {home, away} }
//   (home/away are the website's scores; never a single generic score field)
// context:        { liverpoolSide: 'HOME'|'AWAY' } or { fixture: {home, away} }
//
// EVERY option is defined from LIVERPOOL's side (owner definitions, Oct 17 2026):
//   winner  FT_LIV = 6 and FT_OPP = 0
//   oneX    HT_LIV > HT_OPP and FT_LIV = FT_OPP
//   twoX    HT_LIV < HT_OPP and FT_LIV = FT_OPP
//   x2      HT_LIV = HT_OPP and FT_LIV < FT_OPP
//   tg0     FT_LIV + FT_OPP = 0          tg6   FT_LIV + FT_OPP = 6
//   ht12    HT_LIV = 1 and HT_OPP = 2    ht21  HT_LIV = 2 and HT_OPP = 1    ht30  HT_LIV = 3 and HT_OPP = 0
//   ft40    FT_LIV = 4 and FT_OPP = 0    ft41  FT_LIV = 4 and FT_OPP = 1
const NEEDS_HALF_TIME = Object.freeze(['oneX', 'twoX', 'x2', 'ht12', 'ht21', 'ht30']);
const SIDE_INDEPENDENT = Object.freeze(['tg0', 'tg6']);

const LIVERPOOL_CONDITIONS = Object.freeze({
  winner: ({ ft }) => ft.liverpool === 6 && ft.opponent === 0,
  oneX: ({ ht, ft }) => ht.liverpool > ht.opponent && ft.liverpool === ft.opponent,
  twoX: ({ ht, ft }) => ht.liverpool < ht.opponent && ft.liverpool === ft.opponent,
  x2: ({ ht, ft }) => ht.liverpool === ht.opponent && ft.liverpool < ft.opponent,
  tg0: ({ ft }) => ft.liverpool + ft.opponent === 0,
  tg6: ({ ft }) => ft.liverpool + ft.opponent === 6,
  ht12: ({ ht }) => ht.liverpool === 1 && ht.opponent === 2,
  ht21: ({ ht }) => ht.liverpool === 2 && ht.opponent === 1,
  ht30: ({ ht }) => ht.liverpool === 3 && ht.opponent === 0,
  ft40: ({ ft }) => ft.liverpool === 4 && ft.opponent === 0,
  ft41: ({ ft }) => ft.liverpool === 4 && ft.opponent === 1,
});

function evaluateResultAgainstStrategy(verifiedResult, strategyKey, context = {}) {
  const semantics = getStrategyKeySemantics(strategyKey);
  if (!semantics) {
    return {
      outcome: SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET,
      reason: `Unknown strategy key: ${strategyKey}`,
      resolved: false,
    };
  }
  if (!semantics.resolved || !LIVERPOOL_CONDITIONS[strategyKey]) {
    return {
      outcome: SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET,
      reason: `Strategy semantics not resolved for ${strategyKey} (${semantics.semanticsStatus}): ${semantics.meaning}`,
      resolved: false,
      semanticsStatus: semantics.semanticsStatus,
    };
  }
  if (!verifiedResult || verifiedResult.status !== 'verified') {
    return {
      outcome: SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED,
      reason: 'Result not verified or missing.',
      resolved: true,
    };
  }

  const { halfTime, fullTime } = verifiedResult;
  if (!isCompleteScore(fullTime)) {
    return {
      outcome: SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED,
      reason: 'Full-time score missing or invalid.',
      resolved: true,
    };
  }
  const htScore = isCompleteScore(halfTime) ? { home: halfTime.home, away: halfTime.away } : null;
  const ftScore = { home: fullTime.home, away: fullTime.away };

  if (NEEDS_HALF_TIME.includes(strategyKey) && htScore === null) {
    return {
      outcome: SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED,
      reason: 'Half-time score required for this strategy but not available.',
      resolved: true,
    };
  }

  const base = {
    resolved: true,
    semanticsStatus: semantics.semanticsStatus,
    htScore,
    ftScore,
  };

  const side = resolveLiverpoolSide(context);
  if (side === null && !SIDE_INDEPENDENT.includes(strategyKey)) {
    return {
      outcome: SETTLEMENT_OUTCOMES.AMBIGUOUS_FIXTURE,
      reason: `Liverpool home/away position is not established; ${strategyKey} cannot be evaluated.`,
      ...base,
    };
  }

  // Total-goals options do not depend on Liverpool's side; the score is used as given.
  const ft = side ? toLiverpoolScore(ftScore, side) : { liverpool: ftScore.home, opponent: ftScore.away };
  const ht = side && htScore ? toLiverpoolScore(htScore, side) : null;
  const won = LIVERPOOL_CONDITIONS[strategyKey]({ ht, ft });

  return {
    outcome: won ? SETTLEMENT_OUTCOMES.WON : SETTLEMENT_OUTCOMES.LOST,
    reason: won ? 'Liverpool-relative condition satisfied.' : 'Liverpool-relative condition not satisfied.',
    ...(side ? {
      liverpoolPerspective: {
        side,
        htLiverpool: ht ? ht.liverpool : null,
        htOpponent: ht ? ht.opponent : null,
        ftLiverpool: ft.liverpool,
        ftOpponent: ft.opponent,
      },
    } : {}),
    ...base,
  };
}

function createRuleRegistry() {
  const rules = new Map();

  function registerRule(ruleId, rule) {
    if (rules.has(ruleId)) {
      throw new Error(`Rule ${ruleId} already registered.`);
    }
    rules.set(ruleId, Object.freeze({
      id: ruleId,
      name: rule.name,
      description: rule.description,
      parameters: Object.freeze({ ...rule.parameters }),
      evaluate: rule.evaluate,
    }));
  }

  function getRule(ruleId) {
    return rules.get(ruleId) || null;
  }

  function getAllRules() {
    return Array.from(rules.values());
  }

  function hasRule(ruleId) {
    return rules.has(ruleId);
  }

  registerRule('RULE-001', {
    name: 'Minimum Stake',
    description: 'A final stake qualifies when it is at least NGN 10. Stakes below NGN 10 are skipped; NGN 10 itself qualifies. Stakes are never rounded up to qualify.',
    parameters: { minimumStake: MINIMUM_STAKE },
    evaluate: (totalStake) => evaluateMinimumStake(totalStake),
  });

  registerRule('RULE-002', {
    name: 'Merge Normal and Big-Deficit Stakes',
    description: 'Combines the normal stake and the big-deficit stake of the same option into a single amount, then applies the minimum-stake filter to the combined amount. Never merges across options.',
    parameters: { minimumStake: MINIMUM_STAKE },
    evaluate: (normalStake, bigDeficitStake) => {
      const merged = mergeNormalAndBigDeficitStakes(normalStake, bigDeficitStake);
      const qualification = evaluateMinimumStake(merged.combined);
      return {
        ...merged,
        qualification: qualification.status,
        qualificationReason: qualification.reason,
      };
    },
  });

  registerRule('RULE-003', {
    name: 'Evaluate Results Against Strategy Options',
    description: 'Evaluates a verified result (separate HT and FT scores) against one strategy option, always from Liverpool\'s side. winner: Liverpool wins 6-0. oneX: Liverpool leads at HT and FT is a draw. twoX: Liverpool trails at HT and FT is a draw. x2: HT level and Liverpool loses. tg0/tg6: exactly 0 or 6 total goals. ht12/ht21/ht30: Liverpool-opponent half-time score. ft40/ft41: Liverpool-opponent full-time score. Returns WON, LOST, RESULT_UNVERIFIED, UNRESOLVED_MARKET, or AMBIGUOUS_FIXTURE.',
    parameters: { strategyKeys: STRATEGY_KEYS },
    evaluate: (verifiedResult, strategyKey, context) => (
      evaluateResultAgainstStrategy(verifiedResult, strategyKey, context)
    ),
  });

  registerRule('RULE-004', {
    name: 'Liverpool Home/Away Orientation',
    description: 'Selections depend on Liverpool\'s position (marketMappings.js): oneX is 1/X at home and 2/X away, twoX 2/X and 1/X, x2 X/2 and X/1, winner 6-0 and 0-6, and so on. Total-goals options do not depend on the side.',
    parameters: { orientedKeys: Object.keys(ORIENTED_SELECTIONS) },
    evaluate: (strategyKey, liverpoolSide) => resolveOrientedSelection(strategyKey, liverpoolSide),
  });

  registerRule('RULE-005', {
    name: 'Skipped Options Settle As Non-Winning',
    description: 'An option skipped because its final stake is below NGN 10 receives no outcome mark and is settled by the strategy as non-winning, even if its condition would have been met.',
    parameters: { treatment: SKIPPED_OPTION_TREATMENT },
    evaluate: (stakeQualification) => resolveSkippedOptionTreatment(stakeQualification),
  });

  registerRule('RULE-006', {
    name: 'Market-First Navigation',
    description: 'An odd may be selected only after the correct market category is open, the exact selection has been identified for the confirmed fixture, and its odds are verified (stage ODDS_VERIFIED). Category, selection, and stake are separate operations; every option uses its own verified category and selection.',
    parameters: { gateStage: 'ODDS_VERIFIED' },
    evaluate: (pipeline) => canSelectOdd(pipeline),
  });

  registerRule('RULE-007', {
    name: 'One Selection Per Slip',
    description: 'The slip must be empty before an odd is selected and hold exactly one selection afterwards. Options sharing a fixture and market are prepared one at a time because a second outcome replaces the first.',
    parameters: {},
    evaluate: (input) => evaluateSlipIsolation(input),
  });

  return Object.freeze({
    registerRule,
    getRule,
    getAllRules,
    hasRule,
    MINIMUM_STAKE,
    STAKE_QUALIFICATION,
    SETTLEMENT_OUTCOMES,
    STRATEGY_KEYS,
    evaluateMinimumStake,
    mergeNormalAndBigDeficitStakes,
    evaluateResultAgainstStrategy,
    getStrategyKeySemantics,
  });
}

const ruleRegistry = createRuleRegistry();

module.exports = {
  evaluateSlipIsolation,
  SKIPPED_OPTION_TREATMENT,
  resolveSkippedOptionTreatment,
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
};
