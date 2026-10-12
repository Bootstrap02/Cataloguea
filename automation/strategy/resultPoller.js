const { RESULT_STATUSES } = require('../result/liveResultObserver');
const { createResultId } = require('../result/resultIdentity');
const { createCrossViewFixtureIdentity, calculateIdentityMatch, FIXTURE_IDENTITY_CONFIDENCE } = require('./fixtureIdentity');

const POLLING_DEFAULTS = Object.freeze({
  initialDelayMs: 30000,
  intervalMs: 15000,
  maxAttempts: 40,
  timeoutMs: 600000,
  staleAfterMs: 90000,
  minConfidence: FIXTURE_IDENTITY_CONFIDENCE.MEDIUM,
});

const SETTLEMENT_OUTCOMES = Object.freeze({
  WON: 'WON',
  LOST: 'LOST',
  PENDING_RESULT: 'PENDING_RESULT',
  UNRESOLVED_MARKET: 'UNRESOLVED_MARKET',
  AMBIGUOUS_FIXTURE: 'AMBIGUOUS_FIXTURE',
  RESULT_UNVERIFIED: 'RESULT_UNVERIFIED',
  SKIPPED_BELOW_MINIMUM: 'SKIPPED_BELOW_MINIMUM',
});

function parseTimestamp(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return isNaN(ms) ? null : ms;
}

function isCompleteScore(score) {
  return score && Number.isSafeInteger(score.home) && score.home >= 0
    && Number.isSafeInteger(score.away) && score.away >= 0;
}

function scoresEqual(a, b) {
  return a.home === b.home && a.away === b.away;
}

function createResultPoller({
  readResultsPage,
  getExpectedFixture,
  getActionOperationId,
  config = {},
} = {}) {
  if (typeof readResultsPage !== 'function') {
    throw new TypeError('A readResultsPage function is required.');
  }
  if (typeof getExpectedFixture !== 'function') {
    throw new TypeError('A getExpectedFixture function is required.');
  }
  if (typeof getActionOperationId !== 'function') {
    throw new TypeError('A getActionOperationId function is required.');
  }

  const cfg = { ...POLLING_DEFAULTS, ...config };
  let pollState = {
    attempt: 0,
    startedAt: null,
    lastResult: null,
    verifiedResult: null,
    settled: false,
    resultId: null,
  };

  async function pollOnce() {
    pollState.attempt += 1;
    const attemptStart = Date.now();

    try {
      const resultsSnapshot = await readResultsPage();
      const expectedFixture = getExpectedFixture();
      const actionOperationId = getActionOperationId();

      if (!resultsSnapshot || !resultsSnapshot.results || !Array.isArray(resultsSnapshot.results)) {
        return { status: RESULT_STATUSES.RESULTS_NOT_FOUND, attempt: pollState.attempt, timestamp: attemptStart };
      }

      const crossViewIdentity = createCrossViewFixtureIdentity(
        expectedFixture.scheduled,
        expectedFixture.live,
        expectedFixture.results
      );

      const matches = resultsSnapshot.results
        .map((entry) => ({
          entry,
          match: entry.fixture ? calculateIdentityMatch(crossViewIdentity, entry.fixture) : null,
        }))
        .filter(({ match }) => match?.matched)
        .sort((a, b) => b.match.score - a.match.score);

      if (matches.length === 0) {
        return { status: RESULT_STATUSES.RESULTS_NOT_FOUND, attempt: pollState.attempt, timestamp: attemptStart };
      }

      if (matches.length > 1) {
        return { status: RESULT_STATUSES.RESULTS_AMBIGUOUS, attempt: pollState.attempt, timestamp: attemptStart };
      }

      const { entry, match } = matches[0];
      if (match.confidence < cfg.minConfidence) {
        return { status: RESULT_STATUSES.AMBIGUOUS_FIXTURE, attempt: pollState.attempt, timestamp: attemptStart };
      }

      const status = String(entry.status ?? '').toUpperCase();
      if (!['FINISHED', 'COMPLETED'].includes(status)) {
        return { status: RESULT_STATUSES.RESULTS_MISMATCH, reason: 'RESULT_NOT_COMPLETE', attempt: pollState.attempt, timestamp: attemptStart };
      }

      const ftScore = entry.fullTime || entry.score || {};
      if (!isCompleteScore(ftScore)) {
        return { status: RESULT_STATUSES.INCOMPLETE_SCORE, attempt: pollState.attempt, timestamp: attemptStart };
      }

      const htScore = entry.halfTime || entry.htScore;
      if (htScore && !isCompleteScore(htScore)) {
        return { status: RESULT_STATUSES.INCOMPLETE_SCORE, attempt: pollState.attempt, timestamp: attemptStart };
      }

      const normalizedResult = {
        status: 'verified',
        fixture: { ...entry.fixture },
        result: { homeScore: ftScore.home, awayScore: ftScore.away },
        fullTime: { home: ftScore.home, away: ftScore.away, verified: true },
        halfTime: htScore && isCompleteScore(htScore) ? { home: htScore.home, away: htScore.away, verified: true } : null,
        timestamp: entry.timestamp || new Date().toISOString(),
        source: 'betking-results-page',
      };

      const resultId = createResultId(normalizedResult, actionOperationId);

      if (pollState.resultId && pollState.resultId !== resultId) {
        return { status: RESULT_STATUSES.CONFLICTING_RESULT, attempt: pollState.attempt, timestamp: attemptStart };
      }

      const duplicate = pollState.resultId === resultId;
      pollState.resultId = resultId;
      pollState.lastResult = normalizedResult;
      pollState.verifiedResult = { ...normalizedResult, resultId, duplicate, verifiedAt: new Date().toISOString() };

      return {
        status: 'verified',
        attempt: pollState.attempt,
        timestamp: attemptStart,
        result: normalizedResult,
        resultId,
        duplicate,
        halfTimeProvided: !!normalizedResult.halfTime,
      };

    } catch (error) {
      return { status: RESULT_STATUSES.INVALID_STATUS, reason: error.message, attempt: pollState.attempt, timestamp: attemptStart };
    }
  }

  async function startPolling({ onProgress } = {}) {
    if (pollState.startedAt) {
      throw new Error('Polling already started.');
    }
    pollState.startedAt = Date.now();
    pollState.attempt = 0;

    if (cfg.initialDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, cfg.initialDelayMs));
    }

    while (pollState.attempt < cfg.maxAttempts) {
      const elapsed = Date.now() - pollState.startedAt;
      if (elapsed > cfg.timeoutMs) {
        break;
      }

      const result = await pollOnce();

      if (onProgress) {
        onProgress({ ...result, elapsed, pollState: { ...pollState } });
      }

      if (result.status === 'verified') {
        return result;
      }

      if ([RESULT_STATUSES.CONFLICTING_RESULT, RESULT_STATUSES.AMBIGUOUS_FIXTURE].includes(result.status)) {
        break;
      }

      if (pollState.attempt < cfg.maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, cfg.intervalMs));
      }
    }

    return { status: RESULT_STATUSES.RESULTS_NOT_FOUND, attempt: pollState.attempt, timeout: true };
  }

  function getState() {
    return { ...pollState };
  }

  function reset() {
    pollState = {
      attempt: 0,
      startedAt: null,
      lastResult: null,
      verifiedResult: null,
      settled: false,
      resultId: null,
    };
  }

  return Object.freeze({
    startPolling,
    getState,
    reset,
    POLLING_DEFAULTS: cfg,
  });
}

function determineSettlementOutcome(verifiedResult, instruction) {
  const { strategyKey, betKingMappingStatus } = instruction;

  if (betKingMappingStatus === 'UNRESOLVED_MARKET') {
    return { outcome: SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET, reason: 'No verified BetKing market mapping' };
  }

  if (instruction.status === 'SKIPPED_BELOW_MINIMUM') {
    return { outcome: SETTLEMENT_OUTCOMES.SKIPPED_BELOW_MINIMUM, reason: instruction.reason };
  }

  if (!verifiedResult || verifiedResult.status !== 'verified') {
    return { outcome: SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED, reason: 'Result not verified' };
  }

  if (!verifiedResult.halfTime || !verifiedResult.fullTime) {
    return { outcome: SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED, reason: 'Missing HT or FT score' };
  }

  const htHome = verifiedResult.halfTime.home;
  const htAway = verifiedResult.halfTime.away;
  const ftHome = verifiedResult.fullTime.home;
  const ftAway = verifiedResult.fullTime.away;

  const key = strategyKey;

  let won = false;
  switch (key) {
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
      return { outcome: SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET, reason: `Unknown strategy key: ${key}` };
  }

  return {
    outcome: won ? SETTLEMENT_OUTCOMES.WON : SETTLEMENT_OUTCOMES.LOST,
    reason: won ? 'Score matches selection criteria' : 'Score does not match selection criteria',
    htScore: { home: htHome, away: htAway },
    ftScore: { home: ftHome, away: ftAway },
  };
}

function createSettlementReporter({
  getInstructions,
  getVerifiedResult,
  getActionOperationId,
} = {}) {
  if (typeof getInstructions !== 'function') throw new TypeError('getInstructions required');
  if (typeof getVerifiedResult !== 'function') throw new TypeError('getVerifiedResult required');
  if (typeof getActionOperationId !== 'function') throw new TypeError('getActionOperationId required');

  function reportAll() {
    const instructions = getInstructions();
    const verifiedResult = getVerifiedResult();
    const actionOperationId = getActionOperationId();

    return instructions.map((instruction) => {
      const outcome = determineSettlementOutcome(verifiedResult, instruction);
      return {
        strategyKey: instruction.strategyKey,
        strategyLabel: instruction.strategyLabel,
        canonicalId: instruction.canonicalId,
        stake: instruction.stake,
        normalStake: instruction.normalStake,
        bigDeficitStake: instruction.bigDeficitStake,
        odds: instruction.odds,
        betKingMarket: instruction.betKingMarket,
        betKingSelection: instruction.betKingSelection,
        minimumStakeStatus: instruction.status,
        minimumStakeReason: instruction.reason,
        betKingMappingStatus: instruction.betKingMappingStatus,
        fixture: instruction.fixture,
        htScore: outcome.htScore ?? null,
        ftScore: outcome.ftScore ?? null,
        outcome: outcome.outcome,
        reason: outcome.reason,
        actionOperationId,
        resultId: verifiedResult?.resultId ?? null,
      };
    });
  }

  return Object.freeze({ reportAll });
}

module.exports = {
  POLLING_DEFAULTS,
  SETTLEMENT_OUTCOMES,
  createResultPoller,
  determineSettlementOutcome,
  createSettlementReporter,
};