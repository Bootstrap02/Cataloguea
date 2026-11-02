const browserManager = require('../browser/browserManager');
const { createAutomationConfig } = require('../config');
const DEFAULT_MAX_ATTEMPTS = createAutomationConfig().recoveryMaxAttempts;
const DEFAULT_BASE_DELAY_MS = createAutomationConfig().recoveryBaseDelayMs;

function classifyFailure(error) {
  const message = `${error?.name || ''} ${error?.message || error}`.toLowerCase();
  if (/target closed|page closed|page has been closed/.test(message)) {
    return 'page_closed';
  }
  if (/browser.*disconnected|disconnected.*browser/.test(message)) {
    return 'browser_disconnected';
  }
  if (/timeout|timed out/.test(message)) {
    return 'timeout';
  }
  if (/net::err_|connection|unavailable|navigation/.test(message)) {
    return 'navigation_or_connection_failure';
  }
  return 'unexpected_failure';
}

async function checkBrowserHealth(browserSession) {
  if (!browserSession?.browser || !browserSession?.page) {
    return { healthy: false, reason: 'browser_session_missing' };
  }

  try {
    if (!browserSession.browser.isConnected()) {
      return { healthy: false, reason: 'browser_disconnected' };
    }
    if (browserSession.page.isClosed()) {
      return { healthy: false, reason: 'page_closed' };
    }
    await browserSession.page.title();
    return { healthy: true, reason: null };
  } catch (error) {
    return { healthy: false, reason: classifyFailure(error) };
  }
}

class RecoveryManager {
  constructor({
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    restorePage = browserManagerSessionRestore,
  } = {}) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
      throw new Error('Recovery maxAttempts must be an integer between 1 and 10.');
    }
    if (!Number.isInteger(baseDelayMs) || baseDelayMs < 0) {
      throw new Error('Recovery baseDelayMs must be a non-negative integer.');
    }
    this.maxAttempts = maxAttempts;
    this.baseDelayMs = baseDelayMs;
    this.sleep = sleep;
    this.restorePage = restorePage;
  }

  async recover({
    runId,
    error,
    browserSession,
    runStore,
    operation,
    retrySafe = false,
    retry,
  }) {
    const checkpoint = await runStore.snapshot();
    const unresolvedOperations = checkpoint.operations.filter(
      (entry) => entry.runId === runId
        && ['pending', 'executing', 'unknown', 'uncertain'].includes(entry.status),
    );
    const health = await checkBrowserHealth(browserSession);
    const failureType = classifyFailure(error);

    if (operation || unresolvedOperations.length > 0) {
      for (const pending of unresolvedOperations) {
        if (pending.status === 'pending' || pending.status === 'executing') {
          await runStore.finishOperation(runId, pending.id, 'unknown', {
            reason: 'Recovery found an operation with no verified outcome.',
          });
        }
      }
      return {
        status: 'paused',
        reason: 'operation_outcome_unknown',
        failureType,
        checkpoint: checkpoint.checkpoint,
        attempts: 0,
      };
    }
    if (!retrySafe || typeof retry !== 'function') {
      return {
        status: 'paused',
        reason: 'operation_not_safe_to_retry',
        failureType,
        checkpoint: checkpoint.checkpoint,
        attempts: 0,
      };
    }

    if (!health.healthy) {
      try {
        await this.restorePage(browserSession);
      } catch (restoreError) {
        return {
          status: 'exhausted',
          reason: `browser_restore_failed: ${restoreError.message}`,
          failureType: health.reason,
          checkpoint: checkpoint.checkpoint,
          attempts: 0,
        };
      }
    }

    let lastError = error;
    for (let attempt = 2; attempt <= this.maxAttempts; attempt += 1) {
      await this.sleep(this.baseDelayMs * (2 ** (attempt - 2)));
      const currentHealth = await checkBrowserHealth(browserSession);
      if (!currentHealth.healthy) {
        try {
          await this.restorePage(browserSession);
        } catch (restoreError) {
          lastError = restoreError;
          continue;
        }
      }

      try {
        await retry(attempt);
        return {
          status: 'recovered',
          failureType,
          checkpoint: checkpoint.checkpoint,
          attempts: attempt,
        };
      } catch (retryError) {
        lastError = retryError;
      }
    }

    return {
      status: 'exhausted',
      reason: lastError.message,
      failureType,
      checkpoint: checkpoint.checkpoint,
      attempts: this.maxAttempts,
    };
  }
}

async function browserManagerSessionRestore(browserSession) {
  return browserSession.restorePage();
}

module.exports = {
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_ATTEMPTS,
  RecoveryManager,
  checkBrowserHealth,
  classifyFailure,
};
