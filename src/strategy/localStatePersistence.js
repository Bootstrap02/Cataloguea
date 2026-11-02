function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function coerceNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function normalizeAssetMap(value = {}) {
  return Object.fromEntries(
    Object.entries(value || {}).reduce((memo, [key, rawValue]) => {
      memo.push([key, coerceNumber(rawValue, 0)]);
      return memo;
    }, []),
  );
}

function getStateTimestamp(value) {
  if (!isPlainObject(value)) return 0;
  const backupTimestamp = value.backupMeta?.lastSuccessfulBackupAt || value.backupMeta?.lastAttemptAt;
  const stateTimestamp = value.observedAt || value.lastUpdatedAt || value.updatedAt;
  const candidate = backupTimestamp || stateTimestamp;
  if (!candidate) return 0;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isValidStoredStrategyState(value) {
  if (!isPlainObject(value)) return false;

  const requiredNumericFields = ['base', 'deficit', 'smallDeficit', 'shadow', 'bank'];
  if (!requiredNumericFields.every((field) => Number.isFinite(coerceNumber(value[field], Number.NaN)))) {
    return false;
  }

  if (!isPlainObject(value.privateDef) || !isPlainObject(value.bigDef) || !isPlainObject(value.brokenTarget)) {
    return false;
  }

  return true;
}

function readStoredStrategyState(data) {
  if (!data) return null;
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!isValidStoredStrategyState(parsed)) {
      return null;
    }
    return {
      ...parsed,
      privateDef: normalizeAssetMap(parsed.privateDef),
      bigDef: normalizeAssetMap(parsed.bigDef),
      brokenTarget: normalizeAssetMap(parsed.brokenTarget),
      backupMeta: isPlainObject(parsed.backupMeta) ? { ...parsed.backupMeta } : {},
    };
  } catch (error) {
    return null;
  }
}

function withBackupMeta(state, backupMeta = {}) {
  if (!isPlainObject(state)) return state;
  return {
    ...state,
    backupMeta: {
      ...(state.backupMeta || {}),
      ...backupMeta,
    },
  };
}

function shouldUseBackendRecovery(localState, backendState) {
  if (!isValidStoredStrategyState(backendState)) {
    return false;
  }

  if (!isValidStoredStrategyState(localState)) {
    return true;
  }

  return getStateTimestamp(backendState) > getStateTimestamp(localState);
}

function createBackupMeta({
  status = 'idle',
  errorMessage = null,
  lastAttemptAt = null,
  lastSuccessfulBackupAt = null,
} = {}) {
  return {
    status,
    errorMessage,
    lastAttemptAt,
    lastSuccessfulBackupAt,
  };
}

module.exports = {
  createBackupMeta,
  getStateTimestamp,
  isValidStoredStrategyState,
  readStoredStrategyState,
  shouldUseBackendRecovery,
  withBackupMeta,
};
