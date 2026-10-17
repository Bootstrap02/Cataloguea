const { ASSET_KEYS, adaptCatalogueaState } = require('./catalogueaAdapter');
const { createResultId } = require('./resultIdentity');

function validateVerifiedResult(normalizedResult, expectedFixture, actionOperationId) {
  if (normalizedResult?.status !== 'verified') {
    throw new Error('Only a verified result may be submitted to Cataloguea strategy.');
  }
  if (!expectedFixture) {
    throw new Error('There is no active Cataloguea fixture to settle.');
  }
  if (
    normalizedResult.fixture?.id !== expectedFixture.id
    || normalizedResult.fixture?.home !== expectedFixture.home
    || normalizedResult.fixture?.away !== expectedFixture.away
  ) {
    throw new Error('Verified result fixture does not match the active Cataloguea fixture.');
  }
  if (
    !Number.isSafeInteger(normalizedResult.result?.homeScore)
    || normalizedResult.result.homeScore < 0
    || !Number.isSafeInteger(normalizedResult.result?.awayScore)
    || normalizedResult.result.awayScore < 0
  ) {
    throw new Error('Verified result must contain complete non-negative integer scores.');
  }
  return createResultId(normalizedResult, actionOperationId);
}

function hasMarks(marks) {
  return (Array.isArray(marks) && marks.length > 0)
    || (marks instanceof Set && marks.size > 0);
}

// Marks evaluated by the automation (never by this port) for the strategy's own
// settlement. Optional: omitted marks keep the original manual-mark behaviour.
function normalizeEvaluatedMarks(marks) {
  if (marks === undefined || marks === null) return null;
  const toArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value instanceof Set) return [...value];
    return null;
  };
  const winners = toArray(marks.winners ?? []);
  const bigWinners = toArray(marks.bigWinners ?? []);
  if (!winners || !bigWinners) {
    throw new Error('Evaluated outcome marks must provide winners and bigWinners as arrays.');
  }
  for (const key of [...winners, ...bigWinners]) {
    if (typeof key !== 'string' || !ASSET_KEYS.includes(key)) {
      throw new Error(`Evaluated outcome marks contain an unknown strategy key: ${key}`);
    }
  }
  return { winners: [...new Set(winners)], bigWinners: [...new Set(bigWinners)] };
}

function createCatalogueaAutomationPort({
  readSnapshot,
  settleStrategyResult,
  submitFixture,
}) {
  if (typeof readSnapshot !== 'function' || typeof settleStrategyResult !== 'function') {
    throw new TypeError('Cataloguea strategy port requires snapshot and settlement functions.');
  }

  function getStrategySnapshot() {
    return readSnapshot();
  }

  function getCurrentInstruction() {
    return adaptCatalogueaState(getStrategySnapshot());
  }

  function settleVerifiedResult({ normalizedResult, actionOperationId, marks } = {}) {
    if (typeof actionOperationId !== 'string' || actionOperationId.length === 0) {
      throw new Error('A confirmed action operation ID is required for Cataloguea settlement.');
    }
    const snapshot = getStrategySnapshot();
    const resultId = createResultId(normalizedResult, actionOperationId);
    const legacyResultId = createResultId(normalizedResult);
    const priorReceipt = snapshot.automationSettlements?.find((receipt) => (
      typeof receipt === 'string'
        ? receipt === resultId || receipt === legacyResultId
        : receipt.resultId === resultId
          || (
            receipt.resultId === legacyResultId
            && receipt.actionOperationId === actionOperationId
          )
    ));
    if (priorReceipt) {
      validateVerifiedResult(
        normalizedResult,
        priorReceipt.fixture || normalizedResult.fixture,
        actionOperationId,
      );
      if (
        typeof priorReceipt !== 'string'
        && priorReceipt.actionOperationId !== actionOperationId
      ) {
        throw new Error('Result identity is already linked to a different action operation.');
      }
      return { status: 'already_settled', resultId };
    }
    validateVerifiedResult(normalizedResult, snapshot.fixture, actionOperationId);
    const evaluatedMarks = normalizeEvaluatedMarks(marks);
    const hasManualMarks = hasMarks(snapshot.winners) || hasMarks(snapshot.bigWinners);
    if (evaluatedMarks && hasManualMarks) {
      throw new Error(
        'Manual outcome marks already exist; refusing to combine them with automation-evaluated marks.',
      );
    }
    if (!evaluatedMarks && !hasManualMarks) {
      throw new Error(
        'Cataloguea requires an existing manual outcome mark; score-to-asset mapping is not defined.',
      );
    }
    const settlement = evaluatedMarks
      ? settleStrategyResult(normalizedResult, resultId, snapshot, actionOperationId, evaluatedMarks)
      : settleStrategyResult(normalizedResult, resultId, snapshot, actionOperationId);
    if (!settlement || settlement.status !== 'settled') {
      throw new Error('Cataloguea strategy did not confirm the verified-result settlement.');
    }
    return { ...settlement, resultId };
  }

  return Object.freeze({
    getStrategySnapshot,
    getCurrentInstruction,
    // Optional: feeds the identified fixture to the strategy. Present only when supplied.
    ...(typeof submitFixture === 'function' ? { submitFixture: (input) => submitFixture(input) } : {}),
    settleVerifiedResult,
  });
}

module.exports = { createCatalogueaAutomationPort, validateVerifiedResult };
