const { RESULT_STATUSES } = require('../result/liveResultObserver');
const { createResultId } = require('../result/resultIdentity');
const { evaluateResultAgainstStrategy } = require('./rules');
const { determineArsenalSide } = require('./arsenalPerspective');
const { parseWeek } = require('./seasonWeek');
const { createCrossViewFixtureIdentity, calculateIdentityMatch, FIXTURE_IDENTITY_CONFIDENCE } = require('./fixtureIdentity');

const POLLING_DEFAULTS = Object.freeze({
  initialDelayMs: 30000,
  intervalMs: 15000,
  maxAttempts: 40,
  timeoutMs: 600000,
  staleAfterMs: 90000,
  // LOW = exact home/away team match. Duplicate matches are rejected as ambiguous and
  // rounds are cross-checked below; the real-site controller passes MEDIUM or higher.
  minConfidence: FIXTURE_IDENTITY_CONFIDENCE.LOW,
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

// Confidence levels must be compared by rank, not alphabetically ('HIGH' < 'MEDIUM'
// as strings, which wrongly rejected HIGH-confidence matches).
const CONFIDENCE_RANK = Object.freeze({
  [FIXTURE_IDENTITY_CONFIDENCE.AMBIGUOUS]: 0,
  [FIXTURE_IDENTITY_CONFIDENCE.LOW]: 1,
  [FIXTURE_IDENTITY_CONFIDENCE.MEDIUM]: 2,
  [FIXTURE_IDENTITY_CONFIDENCE.HIGH]: 3,
});

function meetsConfidence(actual, minimum) {
  return (CONFIDENCE_RANK[actual] ?? -1) >= (CONFIDENCE_RANK[minimum] ?? Number.MAX_SAFE_INTEGER);
}

function normalizeRoundLabel(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// A results entry from a different round must never be accepted for this fixture.
// Compared only when both sides expose a round; week numbers win over raw text.
function roundsCompatible(entryFixture, crossView) {
  const scheduled = crossView?.sources?.scheduled;
  const expected = [scheduled?.roundId, scheduled?.roundName].map(normalizeRoundLabel).filter(Boolean);
  const observed = [entryFixture?.roundId, entryFixture?.roundName].map(normalizeRoundLabel).filter(Boolean);
  if (expected.length === 0 || observed.length === 0) return true;
  const expectedWeeks = expected.map(parseWeek).filter((week) => week !== null);
  const observedWeeks = observed.map(parseWeek).filter((week) => week !== null);
  if (expectedWeeks.length > 0 && observedWeeks.length > 0) {
    return observedWeeks.some((week) => expectedWeeks.includes(week));
  }
  return observed.some((label) => expected.includes(label));
}

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
          match: entry.fixture && roundsCompatible(entry.fixture, crossViewIdentity)
            ? calculateIdentityMatch(crossViewIdentity, entry.fixture)
            : null,
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
      if (!meetsConfidence(match.confidence, cfg.minConfidence)) {
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
        fixture: { ...entry.fixture, id: entry.fixture.id ?? entry.fixture.fixtureId },
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
    pollOnce,
    startPolling,
    getState,
    reset,
    POLLING_DEFAULTS: cfg,
  });
}

function determineSettlementOutcome(verifiedResult, instruction) {
  const { strategyKey, betKingMappingStatus } = instruction;

  // RULE-005: an option skipped for a stake below the minimum was not played, so
  // this is reported before (and regardless of) its market mapping status.
  if (instruction.status === 'SKIPPED_BELOW_MINIMUM') {
    return { outcome: SETTLEMENT_OUTCOMES.SKIPPED_BELOW_MINIMUM, reason: instruction.reason };
  }

  if (betKingMappingStatus === 'UNRESOLVED_MARKET') {
    return { outcome: SETTLEMENT_OUTCOMES.UNRESOLVED_MARKET, reason: 'No verified BetKing market mapping' };
  }

  if (!verifiedResult || verifiedResult.status !== 'verified') {
    return { outcome: SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED, reason: 'Result not verified' };
  }

  // Strategy semantics live in rules.js (single definition). Nothing about what a
  // strategy option means is decided here.
  const arsenalSide = instruction.arsenalSide
    ?? determineArsenalSide(instruction.fixture).side;
  const evaluation = evaluateResultAgainstStrategy(verifiedResult, strategyKey, { arsenalSide });

  const outcome = { outcome: evaluation.outcome, reason: evaluation.reason };
  if (evaluation.htScore !== undefined) outcome.htScore = evaluation.htScore;
  if (evaluation.ftScore !== undefined) outcome.ftScore = evaluation.ftScore;
  return outcome;
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