const { STRATEGY_BET_TYPES } = require('./canonicalBetTypes');
const {
  LIVERPOOL_SIDE,
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
// Semantics:
//   oneX  (user rule) WON iff HT_LIV > HT_OPP AND FT_LIV = FT_OPP
//   twoX  (user rule) WON iff HT_LIV < HT_OPP AND FT_LIV = FT_OPP
//   ht12/ht21/ht30/ft40/ft41  exact score in home-away order; ASSUMED from the
//        key label by an earlier stage, flagged as such in the result.
//   winner, x2, tg0, tg6  UNRESOLVED_MARKET - no settlement condition is defined.
function evaluateResultAgainstStrategy(verifiedResult, strategyKey, context = {}) {
  const semantics = getStrategyKeySemantics(strategyKey);
  if (!semantics) {
    return {
      outcome: SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET,
      reason: `Unknown strategy key: ${strategyKey}`,
      resolved: false,
    };
  }
  if (!semantics.resolved) {
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

  const needsHalfTime = semantics.phase === 'HALF_TIME' || semantics.phase === 'HALF_TIME_AND_FULL_TIME';
  if (needsHalfTime && htScore === null) {
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

  if (semantics.perspective === 'LIVERPOOL') {
    const side = resolveLiverpoolSide(context);
    if (side === null) {
      return {
        outcome: SETTLEMENT_OUTCOMES.AMBIGUOUS_FIXTURE,
        reason: `Liverpool home/away position is not established; ${strategyKey} cannot be evaluated.`,
        ...base,
      };
    }
    const ht = toLiverpoolScore(htScore, side);
    const ft = toLiverpoolScore(ftScore, side);
    const perspective = {
      side,
      htLiverpool: ht.liverpool,
      htOpponent: ht.opponent,
      ftLiverpool: ft.liverpool,
      ftOpponent: ft.opponent,
    };

    let won;
    if (strategyKey === 'oneX') {
      won = ht.liverpool > ht.opponent && ft.liverpool === ft.opponent;
    } else if (strategyKey === 'twoX') {
      won = ht.liverpool < ht.opponent && ft.liverpool === ft.opponent;
    } else {
      return {
        outcome: SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET,
        reason: `No Liverpool-relative settlement condition is implemented for ${strategyKey}.`,
        ...base,
      };
    }
    return {
      outcome: won ? SETTLEMENT_OUTCOMES.WON : SETTLEMENT_OUTCOMES.LOST,
      reason: won ? 'Liverpool-relative condition satisfied.' : 'Liverpool-relative condition not satisfied.',
      liverpoolPerspective: perspective,
      ...base,
    };
  }

  // Score-label keys (ASSUMED semantics, home-away order).
  let won;
  switch (strategyKey) {
    case 'ht12': won = htScore.home === 1 && htScore.away === 2; break;
    case 'ht21': won = htScore.home === 2 && htScore.away === 1; break;
    case 'ht30': won = htScore.home === 3 && htScore.away === 0; break;
    case 'ft40': won = ftScore.home === 4 && ftScore.away === 0; break;
    case 'ft41': won = ftScore.home === 4 && ftScore.away === 1; break;
    default:
      return {
        outcome: SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET,
        reason: `Unhandled strategy key: ${strategyKey}`,
        resolved: false,
      };
  }
  return {
    outcome: won ? SETTLEMENT_OUTCOMES.WON : SETTLEMENT_OUTCOMES.LOST,
    reason: won ? 'Score matches selection criteria.' : 'Score does not match selection criteria.',
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
    description: 'Evaluates a verified result (separate HT and FT scores) against one strategy option using its defined semantics. oneX: Liverpool leads at HT and FT is a draw. twoX: Liverpool trails at HT and FT is a draw. Returns WON, LOST, PENDING_RESULT, RESULT_UNVERIFIED, UNRESOLVED_MARKET, or AMBIGUOUS_FIXTURE.',
    parameters: { strategyKeys: STRATEGY_KEYS },
    evaluate: (verifiedResult, strategyKey, context) => (
      evaluateResultAgainstStrategy(verifiedResult, strategyKey, context)
    ),
  });

  registerRule('RULE-004', {
    name: 'Liverpool Home/Away Orientation',
    description: 'For x2 the intended selection is X2 when Liverpool is the home team and X1 when Liverpool is the away team. Only the selection label is oriented; the settlement condition remains unresolved.',
    parameters: { orientedKeys: ['x2'] },
    evaluate: (strategyKey, liverpoolSide) => resolveOrientedSelection(strategyKey, liverpoolSide),
  });

  registerRule('RULE-005', {
    name: 'Skipped Options Settle As Non-Winning',
    description: 'An option skipped because its final stake is below NGN 10 receives no outcome mark and is settled by the strategy as non-winning, even if its condition would have been met.',
    parameters: { treatment: SKIPPED_OPTION_TREATMENT },
    evaluate: (stakeQualification) => resolveSkippedOptionTreatment(stakeQualification),
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
