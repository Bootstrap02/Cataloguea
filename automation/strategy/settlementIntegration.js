// Settlement integration: connects a verified result to the EXISTING strategy
// settlement, exactly once.
//
// Responsibilities here are orchestration only:
//   1. evaluate every stake-eligible option (rules.js) and stop if any is undecidable
//   2. return already_settled when a receipt for this result identity exists
//   3. refuse to settle when the strategy changed since the plan (stale decisions)
//   4. hand the evaluated marks to the strategy port, which calls the strategy's
//      own settlement; nothing about stakes or deficits is computed here
//   5. verify the receipt was persisted before the week may advance
//
// Not implemented here: reading the real BetKing result (see liveResultObserver /
// resultPoller) and any wager acceptance.

const { createResultId } = require('../result/resultIdentity');
const { evaluateOptionsForResult, createStakeFingerprint, planNextWeek } = require('./operationalWorkflow');

const SETTLEMENT_STATUS = Object.freeze({
  SETTLED: 'SETTLED',
  ALREADY_SETTLED: 'ALREADY_SETTLED',
  NOT_READY: 'NOT_READY',
  STALE_STRATEGY_STATE: 'STALE_STRATEGY_STATE',
  SETTLEMENT_UNKNOWN: 'SETTLEMENT_UNKNOWN',
  INVALID_INPUT: 'INVALID_INPUT',
});

function isCompleteScore(score) {
  return Boolean(score)
    && Number.isSafeInteger(score.home) && score.home >= 0
    && Number.isSafeInteger(score.away) && score.away >= 0;
}

// Deterministic per processed fixture instance: derived from persisted plan data,
// so a restart reproduces the same operation id and cannot settle twice. The
// plan's observation time distinguishes the same week in a later season.
function createOperationId({ week, fixtureId, planObservedAt } = {}) {
  if (!Number.isInteger(week) || typeof fixtureId !== 'string' || fixtureId.length === 0
    || typeof planObservedAt !== 'string' || planObservedAt.length === 0) {
    throw new Error('week, fixtureId, and planObservedAt are required to create an operation id.');
  }
  return `settle:wk${week}:${fixtureId}:${planObservedAt}`;
}

function buildNormalizedResult({ strategyFixture, verifiedResult, source, timestamp } = {}) {
  if (!strategyFixture?.id) {
    throw new Error('The strategy fixture is required to build a normalized result.');
  }
  if (verifiedResult?.status !== 'verified' || !isCompleteScore(verifiedResult.fullTime)) {
    throw new Error('A verified result with a complete full-time score is required.');
  }
  const result = {
    homeScore: verifiedResult.fullTime.home,
    awayScore: verifiedResult.fullTime.away,
  };
  // Half time is kept as separate evidence, never merged into the score fields.
  if (isCompleteScore(verifiedResult.halfTime)) {
    result.halfTime = { home: verifiedResult.halfTime.home, away: verifiedResult.halfTime.away };
  }
  return {
    status: 'verified',
    fixture: { id: strategyFixture.id, home: strategyFixture.home, away: strategyFixture.away },
    result,
    source: source ?? 'UNSPECIFIED',
    timestamp: timestamp ?? new Date().toISOString(),
  };
}

function findReceipt(snapshot, resultId) {
  const receipts = Array.isArray(snapshot?.automationSettlements) ? snapshot.automationSettlements : [];
  return receipts.some((receipt) => (
    typeof receipt === 'string' ? receipt === resultId : receipt?.resultId === resultId
  ));
}

async function settlePlannedFixture({
  plan,
  verifiedResult,
  strategyPort,
  getCurrentInstructions,
  actionOperationId,
  source,
  timestamp,
} = {}) {
  if (!plan?.strategyFixture || !Array.isArray(plan.eligible)) {
    return { status: SETTLEMENT_STATUS.INVALID_INPUT, reason: 'An operational plan with a strategy fixture is required.' };
  }
  if (typeof strategyPort?.settleVerifiedResult !== 'function' || typeof strategyPort?.getStrategySnapshot !== 'function') {
    return { status: SETTLEMENT_STATUS.INVALID_INPUT, reason: 'A strategy port is required.' };
  }
  if (typeof getCurrentInstructions !== 'function') {
    return { status: SETTLEMENT_STATUS.INVALID_INPUT, reason: 'getCurrentInstructions is required for the stale-state check.' };
  }
  const operationId = actionOperationId ?? createOperationId({
    week: plan.week,
    fixtureId: plan.strategyFixture.id,
    planObservedAt: plan.observedAt,
  });

  // 1. Evaluate. Undecidable options block settlement; nothing is guessed.
  const evaluation = evaluateOptionsForResult({ plan, verifiedResult });
  if (!evaluation.settlementReadiness.ready) {
    return {
      status: SETTLEMENT_STATUS.NOT_READY,
      blockers: evaluation.settlementReadiness.blockers,
      evaluation,
    };
  }

  const normalizedResult = buildNormalizedResult({
    strategyFixture: plan.strategyFixture,
    verifiedResult,
    source,
    timestamp,
  });
  const resultId = createResultId(normalizedResult, operationId);

  // 2. Duplicate check comes BEFORE the stale check: once settled, the strategy
  //    has legitimately moved on and would otherwise look stale.
  if (findReceipt(await strategyPort.getStrategySnapshot(), resultId)) {
    return {
      status: SETTLEMENT_STATUS.ALREADY_SETTLED,
      resultId,
      persistenceVerified: true,
      evaluation,
      next: planNextWeek({ currentWeek: plan.week, settlementApplied: true, persistenceVerified: true }),
    };
  }

  // 3. Stale check: decisions must still match the strategy's current stakes.
  const fresh = await getCurrentInstructions();
  const freshFingerprint = fresh?.status === 'OK'
    ? createStakeFingerprint(
      fresh.fixture?.id ?? null,
      fresh.instructions.map((instruction) => ({
        strategyKey: instruction.strategyKey,
        normal: instruction.normalStake,
        big: instruction.bigDeficitStake,
      })),
    )
    : null;
  if (freshFingerprint !== plan.stakeFingerprint) {
    return {
      status: SETTLEMENT_STATUS.STALE_STRATEGY_STATE,
      reason: 'The strategy changed after these decisions were calculated; recalculate before settling.',
      expectedFingerprint: plan.stakeFingerprint,
      currentFingerprint: freshFingerprint,
    };
  }

  // 4. Settle through the strategy's own function.
  let settlement;
  try {
    settlement = await strategyPort.settleVerifiedResult({
      normalizedResult,
      actionOperationId: operationId,
      marks: evaluation.proposedStrategyMarks,
    });
  } catch (error) {
    // The outcome is unknown unless a receipt proves it was applied.
    if (findReceipt(await strategyPort.getStrategySnapshot(), resultId)) {
      return {
        status: SETTLEMENT_STATUS.ALREADY_SETTLED,
        resultId,
        recoveredAfterError: true,
        persistenceVerified: true,
        evaluation,
        next: planNextWeek({ currentWeek: plan.week, settlementApplied: true, persistenceVerified: true }),
      };
    }
    return {
      status: SETTLEMENT_STATUS.SETTLEMENT_UNKNOWN,
      reason: error?.message ?? String(error),
      resultId,
      next: planNextWeek({ currentWeek: plan.week }),
    };
  }

  // 5. Verify persistence before anything may advance.
  const persistenceVerified = findReceipt(await strategyPort.getStrategySnapshot(), resultId);
  const alreadySettled = settlement?.status === 'already_settled';
  return {
    status: alreadySettled ? SETTLEMENT_STATUS.ALREADY_SETTLED : SETTLEMENT_STATUS.SETTLED,
    resultId,
    persistenceVerified,
    evaluation,
    next: planNextWeek({ currentWeek: plan.week, settlementApplied: true, persistenceVerified }),
  };
}

module.exports = {
  SETTLEMENT_STATUS,
  buildNormalizedResult,
  createOperationId,
  findReceipt,
  settlePlannedFixture,
};
