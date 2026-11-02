const { createResultId } = require('../result/resultIdentity');

function createSettlementRequest({
  instruction,
  normalizedResult,
  actionOperationId,
}) {
  if (!instruction?.fixture || !instruction.strategyState) {
    throw new Error('A Cataloguea strategy instruction is required for settlement.');
  }
  if (normalizedResult?.status !== 'verified') {
    throw new Error('Only a verified result may be submitted for strategy settlement.');
  }
  if (
    normalizedResult.fixture?.id !== instruction.fixture.id
    || normalizedResult.fixture?.home !== instruction.fixture.home
    || normalizedResult.fixture?.away !== instruction.fixture.away
  ) {
    throw new Error('Settlement result fixture does not match the strategy instruction.');
  }
  if (
    !Number.isSafeInteger(normalizedResult.result?.homeScore)
    || normalizedResult.result.homeScore < 0
    || !Number.isSafeInteger(normalizedResult.result?.awayScore)
    || normalizedResult.result.awayScore < 0
  ) {
    throw new Error('Settlement result must contain complete integer scores that are non-negative.');
  }
  if (typeof actionOperationId !== 'string' || actionOperationId.length === 0) {
    throw new Error('The confirmed action operation ID is required for settlement.');
  }

  return {
    resultId: createResultId(normalizedResult, actionOperationId),
    actionOperationId,
    fixture: { ...normalizedResult.fixture },
    result: { ...normalizedResult.result },
    source: normalizedResult.source,
    resultTimestamp: normalizedResult.timestamp,
    normalizedResult: {
      ...normalizedResult,
      fixture: { ...normalizedResult.fixture },
      result: { ...normalizedResult.result },
    },
    instruction,
  };
}

async function applySettlementRequest(request, strategySettlementPort) {
  if (typeof strategySettlementPort !== 'function') {
    throw new Error(
      'No strategy-owned settlement port is available; refusing to calculate settlement in automation.',
    );
  }
  const update = await strategySettlementPort(request);
  if (!update || typeof update !== 'object' || !update.strategyState) {
    throw new Error('Strategy settlement port did not return an updated strategy state.');
  }
  return update;
}

module.exports = { applySettlementRequest, createSettlementRequest };
