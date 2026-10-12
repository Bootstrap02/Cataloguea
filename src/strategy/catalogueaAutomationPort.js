const { adaptCatalogueaState } = require('./catalogueaAdapter');
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

function createCatalogueaAutomationPort({
  readSnapshot,
  settleStrategyResult,
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

  function settleVerifiedResult({ normalizedResult, actionOperationId } = {}) {
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
    if (!hasMarks(snapshot.winners) && !hasMarks(snapshot.bigWinners)) {
      throw new Error(
        'Cataloguea requires an existing manual outcome mark; score-to-asset mapping is not defined.',
      );
    }
    const settlement = settleStrategyResult(
      normalizedResult,
      resultId,
      snapshot,
      actionOperationId,
    );
    if (!settlement || settlement.status !== 'settled') {
      throw new Error('Cataloguea strategy did not confirm the verified-result settlement.');
    }
    return { ...settlement, resultId };
  }

  return Object.freeze({
    getStrategySnapshot,
    getCurrentInstruction,
    settleVerifiedResult,
  });
}

module.exports = { createCatalogueaAutomationPort, validateVerifiedResult };
