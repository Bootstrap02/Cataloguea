const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AutomationController } = require('../controller');
const { RunStore } = require('../persistence/runStore');
const { RecoveryManager } = require('../recovery/recoveryManager');
const { verifyResult } = require('../result/resultObserver');
const { createSettlementRequest } = require('../strategy/settlementAdapter');
const { prepareSimulatedSelection, verifyObservedSelection } = require('../sportsbook/simulatedSportsbookAdapter');
const { STATES } = require('../stateMachine');
const { createFaultInjector } = require('./faultInjection');

const FIXTURE = { id: 'livmnu', home: 'liv', away: 'mnu' };
const TIMESTAMP = '2026-10-07T00:00:00.000Z';
const EXPECTED_SUCCESS_STATES = [
  STATES.INITIALIZING,
  STATES.OBSERVING_STRATEGY,
  STATES.STRATEGY_INSTRUCTION_READY,
  STATES.FINDING_MATCH,
  STATES.MATCH_VERIFICATION,
  STATES.READY_FOR_ACTION,
  STATES.EXECUTING,
  STATES.VERIFYING,
  STATES.CONFIRMED,
  STATES.WAITING_FOR_RESULT,
  STATES.RESULT_DETECTED,
  STATES.RESULT_VERIFIED,
  STATES.SETTLING_STRATEGY,
  STATES.SETTLEMENT_CONFIRMED,
  STATES.COMPLETED,
];

function strategySnapshot() {
  return {
    fixture: { ...FIXTURE, oneX: 14.7 },
    gameStakes: { oneX: 2 },
    bigStakes: {},
    winnerStake: 31,
    winners: new Set(),
    bigWinners: new Set(),
    baseStake: 10000,
    deficit: 0,
    smallDeficit: 31,
    shadow: 31,
    bank: 0,
    observedAt: TIMESTAMP,
  };
}

function completeObservation(overrides = {}) {
  return {
    fixture: { ...FIXTURE },
    status: 'complete',
    result: { homeScore: '2', awayScore: '1' },
    timestamp: TIMESTAMP,
    source: 'local_simulated_sportsbook',
    ...overrides,
  };
}

async function createStore(t, label) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `stage11-${label}-`));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let nextId = 0;
  const options = {
    filePath: path.join(directory, 'run-state.json'),
    clock: () => TIMESTAMP,
    idFactory: () => `${label}-${++nextId}`,
  };
  return { store: new RunStore(options), options };
}

function createSession({ initiallyClosed = false } = {}) {
  let closed = initiallyClosed;
  const browser = { isConnected: () => true };
  const session = {
    browser,
    get page() {
      return {
        isClosed: () => closed,
        title: async () => {
          if (closed) throw new Error('Target page has been closed');
          return 'Local simulated sportsbook';
        },
      };
    },
    restoreCount: 0,
    async restorePage() {
      closed = false;
      this.restoreCount += 1;
      return this.page;
    },
    async close() {},
  };
  return session;
}

function createMockController({
  store,
  runId,
  faults = {},
  initiallyClosed = false,
  selectionOverride = {},
  observation = completeObservation(),
  retryMaxAttempts = 3,
} = {}) {
  const injector = createFaultInjector(faults);
  const session = createSession({ initiallyClosed });
  let prepareCalls = 0;
  let executeCalls = 0;
  let actionCount = 0;
  let settlementCalls = 0;
  const controller = new AutomationController({
    runId,
    runStore: store,
    recoveryManager: new RecoveryManager({
      maxAttempts: retryMaxAttempts,
      baseDelayMs: 0,
      sleep: async () => {},
    }),
    dependencies: {
      launchBrowser: async () => session,
      prepareSimulatedSelection: async (page, instruction, { assetKey }) => {
        prepareCalls += 1;
        if (page.isClosed()) throw new Error('Target page has been closed');
        injector.hit('navigation');
        if (selectionOverride.missingMarket) {
          throw new Error(`Expected market "${assetKey}" is unavailable.`);
        }
        const selection = {
          fixtureId: selectionOverride.wrongFixture ? 'livche' : instruction.fixture.id,
          market: assetKey,
          assetKey,
          stake: instruction.assets.find(({ key }) => key === assetKey).stake,
          odds: instruction.fixture.odds[assetKey],
        };
        return {
          selection,
          execute: async () => {
            executeCalls += 1;
            injector.hit('action_before');
            actionCount += 1;
            try {
              injector.hit('confirmation');
            } catch (error) {
              error.simulatedActionCount = actionCount;
              throw error;
            }
            return { confirmation: 'Local simulation confirmed.', actionCount };
          },
        };
      },
      verifyObservedSelection,
      observeResult: async () => observation,
      verifyResult,
      strategySettlementPort: async ({ resultId, instruction: currentInstruction }) => {
        settlementCalls += 1;
        injector.hit('settlement');
        return {
          strategyState: {
            ...currentInstruction.strategyState,
            settlement: { status: 'settled', resultId },
          },
        };
      },
    },
  });

  return {
    controller,
    injector,
    session,
    counts: () => ({ prepareCalls, executeCalls, actionCount, settlementCalls }),
  };
}

function assertUniqueOperationIds(snapshot) {
  const ids = snapshot.operations.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length, 'operation IDs must be unique');
  for (const operation of snapshot.operations) {
    assert.equal(typeof operation.startedAt, 'string');
    assert.equal(typeof operation.updatedAt, 'string');
  }
}

function assertSettlementLinks(snapshot) {
  for (const settlement of snapshot.settlements) {
    const action = snapshot.operations.find(({ id }) => id === settlement.actionOperationId);
    const settlementOperation = snapshot.operations.find(
      ({ id }) => id === settlement.settlementOperationId,
    );
    assert.ok(action, 'settlement must reference an existing action');
    assert.equal(action.runId, settlement.runId);
    assert.equal(action.status, 'confirmed');
    assert.ok(settlementOperation, 'settlement must reference an existing operation');
    assert.equal(settlementOperation.name, 'cataloguea_strategy_settlement');
    assert.equal(settlementOperation.details.actionOperationId, action.id);
    assert.equal(settlementOperation.details.resultId, settlement.resultId);
  }
}

test('Stage 11 deterministic end-to-end chaos matrix', async (t) => {
  await t.test('success reaches every lifecycle checkpoint exactly once on the local fixture', async (subtest) => {
    const { store } = await createStore(subtest, 'success');
    const controller = new AutomationController({
      runId: 'run-success',
      runStore: store,
      dependencies: {
        observeResult: async (page) => {
          const observation = await require('../result/resultObserver').observeResult(page, {
            clock: () => TIMESTAMP,
          });
          return observation;
        },
        strategySettlementPort: async ({ resultId, instruction }) => ({
          strategyState: {
            ...instruction.strategyState,
            settlement: { status: 'settled', resultId },
          },
        }),
      },
    });

    const result = await controller.runSimulatedOperation({
      strategySnapshot: strategySnapshot(),
      assetKey: 'oneX',
    });
    const snapshot = await store.snapshot();
    const actions = snapshot.operations.filter(
      ({ runId, name }) => runId === result.runId && name === 'simulated_sportsbook_selection',
    );
    const settlements = snapshot.operations.filter(
      ({ runId, name }) => runId === result.runId && name === 'cataloguea_strategy_settlement',
    );

    assert.equal(result.state, STATES.COMPLETED);
    assert.deepEqual(result.transitions.map(({ to }) => to), EXPECTED_SUCCESS_STATES);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].status, 'confirmed');
    assert.deepEqual(actions[0].details.selection, {
      fixtureId: FIXTURE.id,
      market: 'oneX',
      assetKey: 'oneX',
      stake: 2,
      odds: 14.7,
    });
    assert.deepEqual(actions[0].details.fixture, FIXTURE);
    assert.deepEqual(actions[0].details.strategyInstruction, {
      observedAt: result.instruction.observedAt,
      recommendedAction: result.instruction.recommendedAction,
      assetKey: 'oneX',
      stake: 2,
      odds: 14.7,
    });
    assert.equal(snapshot.results.length, 1);
    const expectedResultId = require('../result/resultIdentity')
      .createResultId(result.normalizedResult, actions[0].id);
    assert.equal(snapshot.results[0].id, expectedResultId);
    assert.equal(snapshot.results[0].operationId, actions[0].id);
    assert.equal(settlements.length, 1);
    assert.equal(settlements[0].status, 'confirmed');
    assert.equal(snapshot.settlements.length, 1);
    assert.equal(snapshot.settlements[0].status, 'confirmed');
    assert.equal(snapshot.settlements[0].actionOperationId, actions[0].id);
    assert.equal(snapshot.checkpoint.state, STATES.COMPLETED);
    assert.equal(snapshot.checkpoint.settlementStatus, 'confirmed');
    assert.equal(snapshot.checkpoint.normalizedResult.status, 'verified');
    assert.equal(result.strategyState.settlement.resultId, expectedResultId);
    assertUniqueOperationIds(snapshot);
    assertSettlementLinks(snapshot);
  });

  await t.test('closed page is restored before match observation; bounded recovery returns to verification', async (subtest) => {
    const { store } = await createStore(subtest, 'closed-page');
    const harness = createMockController({
      store,
      runId: 'run-closed-page',
      initiallyClosed: true,
    });
    const result = await harness.controller.runSimulatedOperation({
      strategySnapshot: strategySnapshot(),
      assetKey: 'oneX',
    });
    const snapshot = await store.snapshot();

    assert.equal(result.state, STATES.COMPLETED);
    assert.equal(harness.session.restoreCount, 1);
    assert.equal(harness.counts().prepareCalls, 2);
    assert.ok(result.transitions.some(({ from, to }) => (
      from === STATES.MATCH_VERIFICATION && to === STATES.RECOVERING
    )));
    assert.ok(result.transitions.some(({ from, to }) => (
      from === STATES.RECOVERING && to === STATES.MATCH_VERIFICATION
    )));
    assert.equal(snapshot.operations.filter(({ name }) => name === 'simulated_sportsbook_selection').length, 1);
    assert.equal(snapshot.settlements.length, 1);
  });

  await t.test('navigation timeout retries only within the configured bound', async (subtest) => {
    const { store } = await createStore(subtest, 'navigation-once');
    const harness = createMockController({
      store,
      runId: 'run-navigation-once',
      faults: { navigation: { times: 1, error: new Error('Navigation timeout') } },
    });
    const result = await harness.controller.runSimulatedOperation({
      strategySnapshot: strategySnapshot(),
      assetKey: 'oneX',
    });

    assert.equal(result.state, STATES.COMPLETED);
    assert.equal(harness.counts().prepareCalls, 2);
    assert.equal((await store.snapshot()).operations.filter(
      ({ name }) => name === 'simulated_sportsbook_selection',
    ).length, 1);
  });

  await t.test('exhausted navigation recovery fails deterministically without an action', async (subtest) => {
    const { store } = await createStore(subtest, 'navigation-exhausted');
    const harness = createMockController({
      store,
      runId: 'run-navigation-exhausted',
      faults: { navigation: { times: 3, error: new Error('Navigation timeout') } },
    });

    await assert.rejects(
      harness.controller.runSimulatedOperation({
        strategySnapshot: strategySnapshot(),
        assetKey: 'oneX',
      }),
      /Match preparation recovery exhausted/,
    );
    const snapshot = await store.snapshot();
    assert.equal(harness.counts().prepareCalls, 3);
    assert.equal(harness.counts().executeCalls, 0);
    assert.equal(harness.controller.currentState, STATES.ERROR);
    assert.equal(snapshot.operations.length, 0);
    assert.equal(snapshot.checkpoint.state, STATES.ERROR);
  });

  for (const [scenario, selectionOverride, errorPattern] of [
    ['wrong fixture', { wrongFixture: true }, /fixtureId mismatch/],
    ['missing market', { missingMarket: true }, /Expected market/],
  ]) {
    await t.test(`${scenario} is rejected before an operation exists`, async (subtest) => {
      const { store } = await createStore(subtest, scenario.replaceAll(' ', '-'));
      const harness = createMockController({
        store,
        runId: `run-${scenario.replaceAll(' ', '-')}`,
        selectionOverride,
      });
      await assert.rejects(
        harness.controller.runSimulatedOperation({
          strategySnapshot: strategySnapshot(),
          assetKey: 'oneX',
        }),
        errorPattern,
      );
      const snapshot = await store.snapshot();
      assert.equal(harness.controller.currentState, STATES.ERROR);
      assert.equal(harness.counts().executeCalls, 0);
      assert.equal(snapshot.operations.length, 0);
      assert.equal(snapshot.settlements.length, 0);
    });
  }

  await t.test('execution failure before action outcome is known is UNKNOWN and never retried', async (subtest) => {
    const { store } = await createStore(subtest, 'action-before');
    const harness = createMockController({
      store,
      runId: 'run-action-before',
      faults: { action_before: { error: new Error('Failure before simulated action') } },
    });
    const result = await harness.controller.runSimulatedOperation({
      strategySnapshot: strategySnapshot(),
      assetKey: 'oneX',
    });
    const snapshot = await store.snapshot();

    assert.equal(result.state, STATES.PAUSED);
    assert.equal(result.operationStatus, 'unknown');
    assert.equal(harness.counts().executeCalls, 1);
    assert.equal(harness.counts().actionCount, 0);
    assert.equal(snapshot.operations.length, 1);
    assert.equal(snapshot.operations[0].status, 'unknown');
    assert.equal(snapshot.settlements.length, 0);

    const restarted = createMockController({
      store,
      runId: 'run-action-before',
    });
    const restartResult = await restarted.controller.runSimulatedOperation({
      strategySnapshot: strategySnapshot(),
      assetKey: 'oneX',
    });
    assert.equal(restartResult.state, STATES.PAUSED);
    assert.equal(restartResult.operationId, snapshot.operations[0].id);
    assert.equal(restarted.counts().executeCalls, 0);
    assert.equal((await store.snapshot()).operations.length, 1);
  });

  await t.test('missing action confirmation is UNKNOWN, PAUSED, and not repeated', async (subtest) => {
    const { store } = await createStore(subtest, 'action-unknown');
    const harness = createMockController({
      store,
      runId: 'run-action-unknown',
      faults: { confirmation: { error: new Error('Action confirmation unavailable') } },
    });
    const result = await harness.controller.runSimulatedOperation({
      strategySnapshot: strategySnapshot(),
      assetKey: 'oneX',
    });
    const snapshot = await store.snapshot();

    assert.equal(result.state, STATES.PAUSED);
    assert.equal(result.operationStatus, 'unknown');
    assert.equal(harness.counts().executeCalls, 1);
    assert.equal(harness.counts().actionCount, 1);
    assert.equal(snapshot.operations.length, 1);
    assert.equal(snapshot.operations[0].status, 'unknown');
    assert.equal(snapshot.operations[0].outcome.simulatedActionCount, 1);
    assert.equal(snapshot.settlements.length, 0);
  });

  await t.test('pending result stays WAITING_FOR_RESULT without settlement or strategy update', async (subtest) => {
    const { store } = await createStore(subtest, 'result-pending');
    let strategyUpdates = 0;
    const harness = createMockController({
      store,
      runId: 'run-result-pending',
      observation: completeObservation({ status: 'pending', result: null }),
    });
    harness.controller.dependencies.strategySettlementPort = async () => {
      strategyUpdates += 1;
      return { strategyState: {} };
    };
    const result = await harness.controller.runSimulatedOperation({
      strategySnapshot: strategySnapshot(),
      assetKey: 'oneX',
    });
    const snapshot = await store.snapshot();

    assert.equal(result.state, STATES.WAITING_FOR_RESULT);
    assert.equal(result.resultObservation.status, 'pending');
    assert.equal(snapshot.operations.length, 1);
    assert.equal(snapshot.results.length, 0);
    assert.equal(snapshot.settlements.length, 0);
    assert.equal(strategyUpdates, 0);
  });

  for (const [scenario, observation, pattern] of [
    [
      'wrong result fixture',
      completeObservation({ fixture: { id: 'livche', home: 'liv', away: 'che' } }),
      /Result fixture mismatch/,
    ],
    [
      'incomplete result',
      completeObservation({ result: { homeScore: '2', awayScore: '?' } }),
      /missing or ambiguous scores/,
    ],
  ]) {
    await t.test(`${scenario} is rejected with no strategy update`, async (subtest) => {
      const { store } = await createStore(subtest, scenario.replaceAll(' ', '-'));
      let strategyUpdates = 0;
      const harness = createMockController({
        store,
        runId: `run-${scenario.replaceAll(' ', '-')}`,
        observation,
      });
      harness.controller.dependencies.strategySettlementPort = async () => {
        strategyUpdates += 1;
        return { strategyState: {} };
      };
      await assert.rejects(
        harness.controller.runSimulatedOperation({
          strategySnapshot: strategySnapshot(),
          assetKey: 'oneX',
        }),
        pattern,
      );
      const snapshot = await store.snapshot();
      assert.equal(harness.controller.currentState, STATES.ERROR);
      assert.equal(snapshot.checkpoint.resultObservationStatus, 'rejected');
      assert.equal(snapshot.results.length, 0);
      assert.equal(snapshot.settlements.length, 0);
      assert.equal(strategyUpdates, 0);
    });
  }

  await t.test('three identical result processings settle once and then return already_settled', async (subtest) => {
    const { store } = await createStore(subtest, 'duplicate-result');
    const harness = createMockController({ store, runId: 'run-duplicate-result' });
    const result = await harness.controller.runSimulatedOperation({
      strategySnapshot: strategySnapshot(),
      assetKey: 'oneX',
    });
    const args = {
      instruction: result.instruction,
      normalizedResult: result.normalizedResult,
      actionOperationId: result.actionOperationId,
    };
    const resultProcessing = [];
    for (let index = 0; index < 3; index += 1) {
      resultProcessing.push(await store.recordVerifiedResult(result.runId, {
        operationId: result.actionOperationId,
        normalizedResult: result.normalizedResult,
      }));
    }
    const first = await harness.controller.settleVerifiedResult(args);
    const second = await harness.controller.settleVerifiedResult(args);
    const third = await harness.controller.settleVerifiedResult(args);
    const snapshot = await store.snapshot();

    assert.equal(first.disposition, 'already_settled');
    assert.equal(second.disposition, 'already_settled');
    assert.equal(third.disposition, 'already_settled');
    assert.equal(result.settlementDisposition, 'settled');
    assert.deepEqual(resultProcessing.map(({ disposition }) => disposition), [
      'already_known',
      'already_known',
      'already_known',
    ]);
    assert.equal(harness.counts().actionCount, 1);
    assert.equal(snapshot.results.length, 1);
    assert.equal(
      snapshot.results[0].id,
      require('../result/resultIdentity').createResultId(
        result.normalizedResult,
        result.actionOperationId,
      ),
    );
    assert.equal(snapshot.operations.filter(({ name }) => name === 'simulated_sportsbook_selection').length, 1);
    assert.equal(snapshot.operations.filter(({ name }) => name === 'cataloguea_strategy_settlement').length, 1);
    assert.equal(snapshot.settlements.length, 1);
  });

  await t.test('UNKNOWN settlement remains persisted and its strategy port is never retried', async (subtest) => {
    const { store } = await createStore(subtest, 'settlement-unknown');
    const harness = createMockController({
      store,
      runId: 'run-settlement-unknown',
      faults: { settlement: { error: new Error('Settlement confirmation unavailable') } },
    });
    const result = await harness.controller.runSimulatedOperation({
      strategySnapshot: strategySnapshot(),
      assetKey: 'oneX',
    });
    const repeated = await harness.controller.settleVerifiedResult({
      instruction: result.instruction,
      normalizedResult: result.normalizedResult,
      actionOperationId: result.actionOperationId,
    });
    const snapshot = await store.snapshot();

    assert.equal(result.state, STATES.PAUSED);
    assert.equal(result.settlementStatus, 'unknown');
    assert.equal(repeated.status, 'unknown');
    assert.equal(harness.counts().settlementCalls, 1);
    assert.equal(snapshot.operations.filter(({ name }) => name === 'cataloguea_strategy_settlement').length, 1);
    assert.equal(snapshot.settlements.length, 1);
    assert.equal(snapshot.settlements[0].status, 'unknown');
    assert.equal(
      snapshot.operations.find(({ id }) => id === snapshot.settlements[0].settlementOperationId).status,
      'unknown',
    );
    assert.equal(snapshot.checkpoint.settlementStatus, 'unknown');
    assertSettlementLinks(snapshot);
  });

  await t.test('settlement requires both a confirmed action and verified result', async (subtest) => {
    const { store } = await createStore(subtest, 'settlement-prerequisites');
    const runId = 'run-settlement-prerequisites';
    const instruction = new AutomationController().observeStrategy(strategySnapshot());
    const action = await store.startOperation(runId, 'simulated_sportsbook_selection');
    const normalizedResult = verifyResult(completeObservation(), FIXTURE);
    const request = createSettlementRequest({
      instruction,
      normalizedResult,
      actionOperationId: action.id,
    });
    await assert.rejects(
      store.recordVerifiedResult(runId, { operationId: action.id, normalizedResult }),
      /confirmed action operation/,
    );
    assert.equal((await store.snapshot()).settlements.length, 0);
    await store.beginOperation(runId, action.id);
    await store.finishOperation(runId, action.id, 'confirmed');
    await store.recordVerifiedResult(runId, {
      operationId: action.id,
      normalizedResult,
    });
    assert.equal((await store.beginSettlement(runId, request)).disposition, 'started');
    assert.throws(
      () => createSettlementRequest({
        instruction,
        normalizedResult: {
          ...normalizedResult,
          status: 'pending',
          result: null,
        },
        actionOperationId: action.id,
      }),
      /Only a verified result/,
    );
  });

  await t.test('restart after confirmed action waits for explicit result verification without a new action', async (subtest) => {
    const { store, options } = await createStore(subtest, 'restart-after-action');
    const runId = 'run-restart-after-action';
    const action = await store.startOperation(runId, 'simulated_sportsbook_selection');
    await store.beginOperation(runId, action.id);
    await store.finishOperation(runId, action.id, 'confirmed');
    await store.recordTransition(runId, { from: STATES.CONFIRMED, to: STATES.WAITING_FOR_RESULT });
    const restartedStore = new RunStore(options);
    let retried = 0;
    const recovery = await new RecoveryManager({ sleep: async () => {} }).recover({
      runId,
      error: new Error('Simulated process restart before result observation'),
      browserSession: createSession(),
      runStore: restartedStore,
      retrySafe: false,
      retry: async () => { retried += 1; },
    });
    const snapshot = await restartedStore.snapshot();

    assert.equal(recovery.status, 'paused');
    assert.equal(recovery.reason, 'operation_not_safe_to_retry');
    assert.equal(retried, 0);
    assert.equal(snapshot.checkpoint.state, STATES.WAITING_FOR_RESULT);
    assert.equal(snapshot.operations.length, 1);
    assert.equal(snapshot.operations[0].status, 'confirmed');
    assert.equal(snapshot.settlements.length, 0);
  });

  await t.test('restart after verified result can claim one settlement without duplicate operation', async (subtest) => {
    const { store, options } = await createStore(subtest, 'restart-before-settlement');
    const runId = 'run-restart-before-settlement';
    const instruction = new AutomationController().observeStrategy(strategySnapshot());
    const action = await store.startOperation(runId, 'simulated_sportsbook_selection');
    await store.beginOperation(runId, action.id);
    await store.finishOperation(runId, action.id, 'confirmed');
    const normalizedResult = verifyResult(completeObservation(), FIXTURE);
    await store.recordVerifiedResult(runId, {
      operationId: action.id,
      normalizedResult,
    });
    const request = createSettlementRequest({
      instruction,
      normalizedResult,
      actionOperationId: action.id,
    });
    const restartedStore = new RunStore(options);
    const first = await restartedStore.beginSettlement(runId, request);
    await restartedStore.finishSettlement(runId, request.resultId, 'confirmed', {
      actionOperationId: action.id,
      resultId: request.resultId,
      strategyState: { settlement: 'settled' },
    });
    const second = await restartedStore.beginSettlement(runId, request);
    const snapshot = await restartedStore.snapshot();

    assert.equal(first.disposition, 'started');
    assert.equal(second.disposition, 'already_settled');
    assert.equal(snapshot.operations.filter(({ name }) => name === 'simulated_sportsbook_selection').length, 1);
    assert.equal(snapshot.operations.filter(({ name }) => name === 'cataloguea_strategy_settlement').length, 1);
    assert.equal(snapshot.settlements.length, 1);
    assert.equal(snapshot.settlements[0].status, 'confirmed');
    assertSettlementLinks(snapshot);
  });

  await t.test('restart during EXECUTING settlement marks it UNKNOWN and pauses', async (subtest) => {
    const { store, options } = await createStore(subtest, 'restart-settlement-executing');
    const runId = 'run-restart-settlement-executing';
    const instruction = new AutomationController().observeStrategy(strategySnapshot());
    const action = await store.startOperation(runId, 'simulated_sportsbook_selection');
    await store.beginOperation(runId, action.id);
    await store.finishOperation(runId, action.id, 'confirmed');
    const normalizedResult = verifyResult(completeObservation(), FIXTURE);
    await store.recordVerifiedResult(runId, {
      operationId: action.id,
      normalizedResult,
    });
    const request = createSettlementRequest({
      instruction,
      normalizedResult,
      actionOperationId: action.id,
    });
    const started = await store.beginSettlement(runId, request);
    const restartedStore = new RunStore(options);
    const harness = createMockController({
      store: restartedStore,
      runId,
    });
    for (const state of [
      STATES.INITIALIZING,
      STATES.OBSERVING_STRATEGY,
      STATES.STRATEGY_INSTRUCTION_READY,
      STATES.FINDING_MATCH,
      STATES.MATCH_VERIFICATION,
      STATES.READY_FOR_ACTION,
      STATES.EXECUTING,
      STATES.VERIFYING,
      STATES.CONFIRMED,
      STATES.WAITING_FOR_RESULT,
      STATES.RESULT_DETECTED,
      STATES.RESULT_VERIFIED,
    ]) {
      harness.controller.stateMachine.transition(state);
    }
    const recoveryResult = await harness.controller.settleVerifiedResult({
      instruction,
      normalizedResult,
      actionOperationId: action.id,
    });
    const snapshot = await restartedStore.snapshot();

    assert.equal(started.disposition, 'started');
    assert.equal(recoveryResult.status, 'unknown');
    assert.equal(harness.controller.currentState, STATES.PAUSED);
    assert.equal(harness.counts().settlementCalls, 0);
    assert.equal(snapshot.operations.filter(({ name }) => name === 'cataloguea_strategy_settlement').length, 1);
    assert.equal(snapshot.settlements[0].status, 'unknown');
    assert.equal(
      snapshot.operations.find(({ id }) => id === started.operation.id).status,
      'unknown',
    );
    assertSettlementLinks(snapshot);
  });

  await t.test('invalid lifecycle jumps are rejected', async () => {
    const { StateMachine } = require('../stateMachine');
    for (const start of [STATES.OBSERVING_STRATEGY, STATES.FINDING_MATCH, STATES.ERROR]) {
      const machine = new StateMachine();
      if (start === STATES.ERROR) {
        machine.transition(STATES.INITIALIZING);
        machine.transition(STATES.ERROR);
      } else {
        machine.transition(STATES.INITIALIZING);
        if (start === STATES.OBSERVING_STRATEGY) machine.transition(start);
        else {
          machine.transition(STATES.OBSERVING_STRATEGY);
          machine.transition(STATES.STRATEGY_INSTRUCTION_READY);
          machine.transition(start);
        }
      }
      assert.throws(
        () => machine.transition(STATES.SETTLEMENT_CONFIRMED),
        /Invalid state transition/,
      );
    }
  });
});

test('failure injector counts phase attempts deterministically', () => {
  const injector = createFaultInjector({
    navigation: { times: 2, error: new Error('Navigation timeout') },
  });
  assert.throws(() => injector.hit('navigation'), /Navigation timeout/);
  assert.throws(() => injector.hit('navigation'), /Navigation timeout/);
  assert.doesNotThrow(() => injector.hit('navigation'));
  assert.equal(injector.calls('navigation'), 3);
});
