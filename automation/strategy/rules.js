const { STRATEGY_BET_TYPES } = require('./canonicalBetTypes');

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

function evaluateMinimumStake(totalStake) {
  if (!isValidStake(totalStake)) {
    return { status: STAKE_QUALIFICATION.INVALID_STAKE, reason: 'Invalid or missing stake amount.' };
  }
  if (totalStake <= MINIMUM_STAKE) {
    return {
      status: STAKE_QUALIFICATION.SKIPPED_BELOW_MINIMUM,
      reason: `Stake ${totalStake} is not greater than the minimum of ${MINIMUM_STAKE}.`,
    };
  }
  return {
    status: STAKE_QUALIFICATION.QUALIFIES,
    reason: `Stake ${totalStake} exceeds minimum ${MINIMUM_STAKE}.`,
  };
}

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
    resolved: betType.phase !== 'UNSPECIFIED' && betType.condition !== undefined,
  };
}

function evaluateResultAgainstStrategy(verifiedResult, strategyKey) {
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
      reason: `Strategy semantics not resolved for ${strategyKey} (${semantics.meaning})`,
      resolved: false,
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
  if (!fullTime || !isValidStake(fullTime.home) || !isValidStake(fullTime.away)) {
    return {
      outcome: SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED,
      reason: 'Full-time score missing or invalid.',
      resolved: true,
    };
  }
  const ftHome = fullTime.home;
  const ftAway = fullTime.away;
  let htHome = null;
  let htAway = null;
  if (halfTime && isValidStake(halfTime.home) && isValidStake(halfTime.away)) {
    htHome = halfTime.home;
    htAway = halfTime.away;
  }
  const phase = semantics.phase;
  const condition = semantics.condition;
  let won = false;
  switch (strategyKey) {
    case 'winner':
      won = ftHome === 6 && ftAway === 0;
      break;
    case 'oneX':
      won = ftHome >= ftAway;
      break;
    case 'twoX':
      won = ftAway >= ftHome;
      break;
    case 'x2':
      won = ftAway >= ftHome;
      break;
    case 'tg0':
      won = ftHome === 0 && ftAway === 0;
      break;
    case 'tg6':
      won = ftHome + ftAway === 6;
      break;
    case 'ht12':
      won = htHome === 1 && htAway === 2;
      break;
    case 'ht21':
      won = htHome === 2 && htAway === 1;
      break;
    case 'ht30':
      won = htHome === 3 && htAway === 0;
      break;
    case 'ft40':
      won = ftHome === 4 && ftAway === 0;
      break;
    case 'ft41':
      won = ftHome === 4 && ftAway === 1;
      break;
    default:
      return {
        outcome: SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET,
        reason: `Unhandled strategy key: ${strategyKey}`,
        resolved: false,
      };
  }
  if (phase === 'HALF_TIME' && (htHome === null || htAway === null)) {
    return {
      outcome: SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED,
      reason: 'Half-time score required for this strategy but not available.',
      resolved: true,
    };
  }
  return {
    outcome: won ? SETTLEMENT_OUTCOMES.WON : SETTLEMENT_OUTCOMES.LOST,
    reason: won ? 'Score matches selection criteria.' : 'Score does not match selection criteria.',
    resolved: true,
    htScore: htHome !== null ? { home: htHome, away: htAway } : null,
    ftScore: { home: ftHome, away: ftAway },
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
    description: 'Enforces that a combined stake must be strictly greater than NGN 10 to qualify for placement.',
    parameters: { minimumStake: MINIMUM_STAKE },
    evaluate: (totalStake) => evaluateMinimumStake(totalStake),
  });

  registerRule('RULE-002', {
    name: 'Merge Normal and Big-Deficit Stakes',
    description: 'Combines normal stake and big-deficit stake for the same asset into a single instruction, then applies the minimum-stake filter to the combined amount.',
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
    description: 'Evaluates a verified result (with separate HT and FT scores) against each strategy option using its verified semantics. Returns WON, LOST, PENDING_RESULT, RESULT_UNVERIFIED, UNRESOLVED_MARKET, or AMBIGUOUS_FIXTURE.',
    parameters: { strategyKeys: STRATEGY_KEYS },
    evaluate: (verifiedResult, strategyKey) => evaluateResultAgainstStrategy(verifiedResult, strategyKey),
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