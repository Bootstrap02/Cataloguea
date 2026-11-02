const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { RecoveryManager, checkBrowserHealth, classifyFailure } = require('./recovery/recoveryManager');
const { AutomationController } = require('./controller');
const { RunStore } = require('./persistence/runStore');
const { STATES } = require('./stateMachine');

async function makeRunStore(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'automation-recovery-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new RunStore({ filePath: path.join(directory, 'run-state.json') });
}

function healthySession() {
  return {
    browser: { isConnected: () => true },
    page: {
      isClosed: () => false,
      title: async () => 'Local fixture',
    },
  };
}

test('recovers a safe transient failure using the saved checkpoint', async (t) => {
  const runStore = await makeRunStore(t);
  await runStore.recordTransition('run-1', {
    from: STATES.INITIALIZING,
    to: STATES.OBSERVING,
  });
  const manager = new RecoveryManager({ sleep: async () => {} });
  let attempts = 0;

  const result = await manager.recover({
    runId: 'run-1',
    error: new Error('Navigation timeout'),
    browserSession: healthySession(),
    runStore,
    retrySafe: true,
    retry: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Navigation still unavailable');
    },
  });

  assert.equal(result.status, 'recovered');
  assert.equal(result.failureType, 'timeout');
  assert.equal(result.attempts, 3);
  assert.deepEqual(result.checkpoint, {
    runId: 'run-1',
    state: STATES.OBSERVING,
    step: STATES.OBSERVING,
    updatedAt: result.checkpoint.updatedAt,
  });
  assert.equal(attempts, 2);
});

test('pauses instead of retrying when failure is not safe to retry', async (t) => {
  const runStore = await makeRunStore(t);
  let attempts = 0;
  const manager = new RecoveryManager({ sleep: async () => {} });

  const result = await manager.recover({
    runId: 'run-1',
    error: new Error('Connection failed'),
    browserSession: healthySession(),
    runStore,
    retrySafe: false,
    retry: async () => { attempts += 1; },
  });

  assert.equal(result.status, 'paused');
  assert.equal(result.reason, 'operation_not_safe_to_retry');
  assert.equal(attempts, 0);
});

test('bounds retries and reports exhausted recovery', async (t) => {
  const runStore = await makeRunStore(t);
  const waits = [];
  let attempts = 0;
  const manager = new RecoveryManager({
    maxAttempts: 3,
    baseDelayMs: 10,
    sleep: async (milliseconds) => waits.push(milliseconds),
  });

  test('rejects invalid retry bounds and delays', () => {
    assert.throws(() => new RecoveryManager({ maxAttempts: 0 }), /between 1 and 10/);
    assert.throws(() => new RecoveryManager({ maxAttempts: 11 }), /between 1 and 10/);
    assert.throws(() => new RecoveryManager({ baseDelayMs: -1 }), /non-negative integer/);
  });

  const result = await manager.recover({
    runId: 'run-1',
    error: new Error('Navigation timeout'),
    browserSession: healthySession(),
    runStore,
    retrySafe: true,
    retry: async () => {
      attempts += 1;
      throw new Error('Still failing');
    },
  });

  assert.equal(result.status, 'exhausted');
  assert.equal(result.attempts, 3);
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [10, 20]);
});

test('marks an unresolved operation unknown and never retries it', async (t) => {
  const runStore = await makeRunStore(t);
  await runStore.recordTransition('run-1', {
    from: STATES.ACTION_REQUIRED,
    to: STATES.EXECUTING,
  });
  const operation = await runStore.startOperation('run-1', 'local_fixture_interaction');
  let attempts = 0;
  const manager = new RecoveryManager({ sleep: async () => {} });

  const result = await manager.recover({
    runId: 'run-1',
    error: new Error('Browser disconnected'),
    browserSession: healthySession(),
    runStore,
    operation,
    retrySafe: true,
    retry: async () => { attempts += 1; },
  });

  const snapshot = await runStore.snapshot();
  assert.equal(result.status, 'paused');
  assert.equal(result.reason, 'operation_outcome_unknown');
  assert.equal(attempts, 0);
  assert.equal(snapshot.operations[0].status, 'unknown');
});

test('loads unresolved checkpoint operations and marks pending outcome unknown', async (t) => {
  const runStore = await makeRunStore(t);
  await runStore.recordTransition('run-1', {
    from: STATES.ACTION_REQUIRED,
    to: STATES.EXECUTING,
  });
  const operation = await runStore.startOperation('run-1', 'local_fixture_interaction');
  let attempts = 0;

  const result = await new RecoveryManager({ sleep: async () => {} }).recover({
    runId: 'run-1',
    error: new Error('Page closed'),
    browserSession: healthySession(),
    runStore,
    retrySafe: true,
    retry: async () => { attempts += 1; },
  });

  const snapshot = await runStore.snapshot();
  assert.equal(result.status, 'paused');
  assert.equal(result.checkpoint.state, STATES.EXECUTING);
  assert.equal(snapshot.operations.find(({ id }) => id === operation.id).status, 'unknown');
  assert.equal(attempts, 0);
});

test('detects closed pages and disconnected browsers', async () => {
  const closedPage = healthySession();
  closedPage.page.isClosed = () => true;
  assert.deepEqual(await checkBrowserHealth(closedPage), {
    healthy: false,
    reason: 'page_closed',
  });

  const disconnectedBrowser = healthySession();
  disconnectedBrowser.browser.isConnected = () => false;
  assert.deepEqual(await checkBrowserHealth(disconnectedBrowser), {
    healthy: false,
    reason: 'browser_disconnected',
  });
});

test('classifies common browser/navigation failures', () => {
  assert.equal(classifyFailure(new Error('Navigation timeout')), 'timeout');
  assert.equal(classifyFailure(new Error('Target page has been closed')), 'page_closed');
  assert.equal(classifyFailure(new Error('Browser disconnected')), 'browser_disconnected');
  assert.equal(classifyFailure(new Error('Unexpected assertion')), 'unexpected_failure');
});

test('controller closes the browser and enters ERROR when navigation retries exhaust', async (t) => {
  const runStore = await makeRunStore(t);
  let navigationAttempts = 0;
  let browserClosed = false;
  const lifecycle = [];
  const session = {
    browser: { isConnected: () => true },
    page: {
      isClosed: () => false,
      title: async () => 'Local fixture',
    },
    close: async () => {
      lifecycle.push('close');
      browserClosed = true;
    },
  };
  const controller = new AutomationController({
    runStore,
    recoveryManager: new RecoveryManager({ sleep: async () => {} }),
    dependencies: {
      launchBrowser: async () => session,
      navigateTo: async () => {
        navigationAttempts += 1;
        throw new Error('Navigation timeout');
      },
      takeScreenshot: async (_page, screenshotPath, options) => {
        lifecycle.push('diagnostic');
        assert.equal(screenshotPath, path.join(os.tmpdir(), 'automation-error.png'));
        assert.deepEqual(options, { fullPage: true });
      },
    },
  });

  await assert.rejects(
    controller.run({ diagnosticScreenshotPath: path.join(os.tmpdir(), 'automation-error.png') }),
    /observation recovery exhausted/,
  );
  assert.equal(controller.currentState, STATES.ERROR);
  assert.equal(navigationAttempts, 3);
  assert.equal(browserClosed, true);
  assert.deepEqual(lifecycle, ['diagnostic', 'close']);
  const snapshot = await runStore.snapshot();
  assert.equal(
    snapshot.events.find(({ type }) => type === 'run_failed').diagnosticScreenshotCaptured,
    true,
  );
});
