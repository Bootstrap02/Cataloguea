function containsControlCharacters(value) {
  return [...value].some((character) => character.charCodeAt(0) < 32);
}

function createResultId(normalizedResult, actionOperationId) {
  const fixtureId = normalizedResult?.fixture?.id;
  const homeScore = normalizedResult?.result?.homeScore;
  const awayScore = normalizedResult?.result?.awayScore;
  if (
    normalizedResult?.status !== 'verified'
    || typeof fixtureId !== 'string'
    || fixtureId.length === 0
    || !Number.isSafeInteger(homeScore)
    || homeScore < 0
    || !Number.isSafeInteger(awayScore)
    || awayScore < 0
  ) {
    throw new Error('A verified fixture and complete integer score are required for result identity.');
  }
  const baseIdentity = `${fixtureId}:${homeScore}-${awayScore}`;
  if (actionOperationId === undefined) return baseIdentity;
  if (
    typeof actionOperationId !== 'string'
    || actionOperationId.length === 0
    || actionOperationId.length > 128
    || containsControlCharacters(actionOperationId)
  ) {
    throw new Error('A valid action operation ID is required for operation-scoped result identity.');
  }
  return `${baseIdentity}:op:${encodeURIComponent(actionOperationId)}`;
}

module.exports = { createResultId };
