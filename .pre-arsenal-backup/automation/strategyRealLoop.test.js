const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AutomationController } = require('./controller');
const { RunStore } = require('./persistence/runStore');
const { STATES } = require('./stateMachine');
const { ASSET_KEYS } = require('./strategy/catalogueaAdapter');
const {
  STORAGE_KEY,
  createLocalCatalogueaRuntime,
} = require('./strategy/localCatalogueaRuntime');
const { settleSoloMatrixState } = require('../src/strategy/soloMatrixSettlement');

const NOW = '2026-10-07T00:00:00.000Z';

let oddsRows;
async function fixtureById(id) {
  oddsRows ||= (await import('../src/Scores.js')).odds;
  const fixture = oddsRows.find((row) => row.id === id);
  assert.ok(fixture, `Expected real Cataloguea odds fixture "${id}".`);
  return fixture;
}

async function createStore(t, label) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `stage14-${label}-`));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let sequence = 0;
  const options = {
    filePath: path.join(directory, 'run-state.json'),
    clock: () => NOW,
    idFactory: () => `${label}-${++sequence}`,
  };
  return { options, store: new RunStore(options) };
}

function strategyFinancialState(snapshot) {
  return {
    baseStake: snapshot.baseStake,
    deficit: snapshot.deficit,
    smallDeficit: snapshot.smallDeficit,
    shadow: snapshot.shadow,
    bank: snapshot.bank,
    privateDef: snapshot.privateDef,
    bigDef: snapshot.bigDef,
    brokenTarget: snapshot.brokenTarget,
  };
}

function controllerStatesThroughResultVerified(controller) {
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
    controller.stateMachine.transition(state);
  }
}

async function runRealStrategyCycle({
  runtime,
  fixture,
  marks,
  store,
  runId,
  resultScenario = 'complete',
  duplicateResultObservation = false,
  onSettlement,
}) {
  runtime.submitFixture(fixture);
  const beforeRun = runtime.getStrategySnapshot();
  const strategyInstruction = runtime.getCurrentInstruction();
  assert.equal(strategyInstruction.fixture.id, fixture.id);
  assert.ok(strategyInstruction.assets.some(({ stake }) => stake > 0));

  const controller = new AutomationController({
    runId,
    runStore: store,
    dependencies: {
      strategySettlementPort: async (request) => {
        runtime.recordManualOutcomeMarks(marks);
        const stateBeforeStrategySettlement = runtime.getStrategySnapshot();
        const independentlyExpected = settleSoloMatrixState(
          stateBeforeStrategySettlement,
          ASSET_KEYS,
        );
        const response = runtime.strategyPort.settleVerifiedResult({
          normalizedResult: request.normalizedResult,
          actionOperationId: request.actionOperationId,
        });
        if (response.status === 'settled') {
          assert.deepEqual(
            strategyFinancialState(runtime.getStrategySnapshot()),
            strategyFinancialState(independentlyExpected),
            'automation settlement must match the strategy-owned settlement calculation',
          );
          onSettlement?.({
            before: stateBeforeStrategySettlement,
            expected: independentlyExpected,
            response,
          });
        }
        return { strategyState: response.strategyState };
      },
    },
  });
  const result = await controller.runSimulatedOperation({
    strategySnapshot: beforeRun,
    assetKey: 'oneX',
    resultScenario,
    duplicateResultObservation,
  });
  return { controller, result, strategyInstruction };
}

test('Stage 14 local end-to-end cycles settle and persist through the real Cataloguea strategy', async (t) => {
  const fixture = await fixtureById('livmnu');
  const complexRuntime = createLocalCatalogueaRuntime({
    fixture,
    financialState: {
      baseStake: 10000,
      deficit: 125,
      smallDeficit: 27,
      shadow: 42,
      bank: 90,
      privateDef: { oneX: 25 },
      bigDef: { x2: 180 },
      brokenTarget: { ft41: 5 },
    },
  });
  const complexStore = await createStore(t, 'complex-cycle');
  let complexComparison;
  const complexCycle = await runRealStrategyCycle({
    runtime: complexRuntime,
    fixture,
    marks: { winners: ['oneX', 'ht21'], bigWinners: ['x2'] },
    store: complexStore.store,
    runId: 'run-complex-cycle',
    duplicateResultObservation: true,
    onSettlement: (comparison) => { complexComparison = comparison; },
  });

  assert.equal(complexCycle.result.state, STATES.COMPLETED);
  assert.equal(complexCycle.result.settlementStatus, 'confirmed');
  assert.equal(complexCycle.result.strategyState.status, 'settled');
  assert.deepEqual(
    strategyFinancialState(complexRuntime.getStrategySnapshot()),
    strategyFinancialState(complexComparison.expected),
  );
  assert.equal(complexRuntime.getStrategySnapshot().fixture, null);
  assert.equal(complexCycle.result.instruction.fixture.id, fixture.id);
  assert.deepEqual(
    complexCycle.result.selection,
    {
      fixtureId: fixture.id,
      market: 'oneX',
      assetKey: 'oneX',
      stake: complexCycle.strategyInstruction.assets.find(({ key }) => key === 'oneX').stake,
      odds: fixture.oneX,
    },
  );
  const complexPersistence = JSON.parse(complexRuntime.storage.getItem(STORAGE_KEY));
  assert.deepEqual(complexPersistence.privateDef, complexComparison.expected.privateDef);
  assert.deepEqual(complexPersistence.bigDef, complexComparison.expected.bigDef);
  assert.deepEqual(complexPersistence.brokenTarget, complexComparison.expected.brokenTarget);
  assert.equal(complexPersistence.automationSettlements.length, 1);
  assert.equal(
    complexPersistence.automationSettlements[0].resultId,
    require('./result/resultIdentity')
      .createResultId(complexCycle.result.normalizedResult, complexCycle.result.actionOperationId),
  );
  const complexRun = await complexStore.store.snapshot();
  assert.equal(
    complexRun.operations.filter(({ name }) => name === 'simulated_sportsbook_selection').length,
    1,
  );
  assert.equal(
    complexRun.operations.filter(({ name }) => name === 'cataloguea_strategy_settlement').length,
    1,
  );
  assert.equal(complexRun.settlements[0].status, 'confirmed');
  assert.equal(complexRun.checkpoint.state, STATES.COMPLETED);

  const lossFixture = await fixtureById('livmnu');
  const lossRuntime = createLocalCatalogueaRuntime({
    fixture: lossFixture,
    financialState: {
      baseStake: 13000,
      deficit: 70,
      smallDeficit: 55,
      shadow: 55,
      bank: 900,
      privateDef: { twoX: 950 },
      bigDef: { x2: 1000, tg0: 900 },
      brokenTarget: { ft41: 995 },
    },
  });
  const lossStore = await createStore(t, 'losing-assets');
  let lossComparison;
  const lossCycle = await runRealStrategyCycle({
    runtime: lossRuntime,
    fixture: lossFixture,
    marks: { winners: ['oneX'], bigWinners: ['tg0'] },
    store: lossStore.store,
    runId: 'run-losing-assets',
    onSettlement: (comparison) => { lossComparison = comparison; },
  });

  assert.equal(lossCycle.result.state, STATES.COMPLETED);
  assert.ok(lossComparison.before.gameStakes.twoX > 0);
  assert.equal(lossComparison.expected.privateDef.twoX, 0);
  assert.ok(lossComparison.expected.bigDef.twoX > 0);
  assert.equal(lossComparison.expected.brokenTarget.ft41, 0);
  assert.ok(lossComparison.expected.baseStake > lossComparison.before.baseStake);
  assert.deepEqual(
    strategyFinancialState(lossRuntime.getStrategySnapshot()),
    strategyFinancialState(lossComparison.expected),
  );

  const jackpotRuntime = createLocalCatalogueaRuntime({
    fixture: lossFixture,
    financialState: {
      baseStake: 18400,
      deficit: 300,
      smallDeficit: 80,
      shadow: 80,
      bank: 500,
    },
  });
  const jackpotState = jackpotRuntime.applyJackpot();
  assert.equal(jackpotState.baseStake, 10000);
  assert.equal(jackpotState.deficit, 0);
  assert.equal(jackpotState.smallDeficit, 0);
  assert.equal(jackpotState.shadow, 0);
  assert.ok(jackpotState.clicked.has('six'));
  const jackpotPersistence = JSON.parse(jackpotRuntime.storage.getItem(STORAGE_KEY));
  assert.equal(jackpotPersistence.base, jackpotState.baseStake);
  assert.equal(jackpotPersistence.smallDeficit, 0);

  const jackpotStore = await createStore(t, 'jackpot-cycle');
  const jackpotCycle = await runRealStrategyCycle({
    runtime: jackpotRuntime,
    fixture: lossFixture,
    marks: { winners: ['oneX'] },
    store: jackpotStore.store,
    runId: 'run-jackpot-cycle',
  });
  assert.equal(jackpotCycle.result.state, STATES.COMPLETED);
  assert.equal(
    jackpotCycle.strategyInstruction.winnerStake,
    Math.max(Math.round(10000 / lossFixture.winner), 10),
  );

  const repeatedRuntime = createLocalCatalogueaRuntime({
    fixture,
    financialState: { baseStake: 10000 },
  });
  const firstCycleStore = await createStore(t, 'repeat-first');
  const firstCycle = await runRealStrategyCycle({
    runtime: repeatedRuntime,
    fixture,
    marks: { winners: ['oneX'] },
    store: firstCycleStore.store,
    runId: 'run-repeat-first',
  });
  assert.equal(firstCycle.result.state, STATES.COMPLETED);

  const secondFixture = await fixtureById('livche');
  const secondCycleStore = await createStore(t, 'repeat-second');
  const secondCycle = await runRealStrategyCycle({
    runtime: repeatedRuntime,
    fixture: secondFixture,
    marks: { winners: ['ht21', 'ft41'], bigWinners: ['x2'] },
    store: secondCycleStore.store,
    runId: 'run-repeat-second',
    resultScenario: 'alternate_complete',
  });
  assert.equal(secondCycle.result.state, STATES.COMPLETED);
  const repeatedPersistence = JSON.parse(repeatedRuntime.storage.getItem(STORAGE_KEY));
  assert.equal(repeatedPersistence.automationSettlements.length, 2);
  assert.deepEqual(
    repeatedPersistence.automationSettlements.map(({ resultId }) => resultId),
    [
      require('./result/resultIdentity')
        .createResultId(firstCycle.result.normalizedResult, firstCycle.result.actionOperationId),
      require('./result/resultIdentity')
        .createResultId(secondCycle.result.normalizedResult, secondCycle.result.actionOperationId),
    ],
  );
});

test('Stage 14 failures do not silently alter real strategy state or localStorage', async (t) => {
  const fixture = await fixtureById('livmnu');
  const scenarios = [
    {
      name: 'unknown action',
      options: { failureMode: 'confirmation_missing' },
      expectedState: STATES.PAUSED,
      expectedStatus: 'unknown',
    },
    {
      name: 'pending result',
      options: { resultScenario: 'pending' },
      expectedState: STATES.WAITING_FOR_RESULT,
      expectedStatus: 'pending',
    },
    {
      name: 'wrong result fixture',
      options: { resultScenario: 'wrong_fixture' },
      expectedState: STATES.ERROR,
      expectedError: /Result fixture mismatch/,
    },
    {
      name: 'incomplete result',
      options: { resultScenario: 'incomplete' },
      expectedState: STATES.ERROR,
      expectedError: /missing or ambiguous scores/,
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async (subtest) => {
      const runtime = createLocalCatalogueaRuntime({ fixture });
      runtime.submitFixture(fixture);
      const before = runtime.getStrategySnapshot();
      let strategyCalls = 0;
      const { store } = await createStore(subtest, scenario.name.replaceAll(' ', '-'));
      const controller = new AutomationController({
        runId: `run-${scenario.name.replaceAll(' ', '-')}`,
        runStore: store,
        dependencies: {
          strategySettlementPort: async () => {
            strategyCalls += 1;
            throw new Error('Settlement should not be invoked for an unverified scenario.');
          },
        },
      });

      if (scenario.expectedError) {
        await assert.rejects(
          controller.runSimulatedOperation({
            strategySnapshot: before,
            assetKey: 'oneX',
            ...scenario.options,
          }),
          scenario.expectedError,
        );
      } else {
        const result = await controller.runSimulatedOperation({
          strategySnapshot: before,
          assetKey: 'oneX',
          ...scenario.options,
        });
        assert.equal(result.state, scenario.expectedState);
        assert.equal(
          scenario.expectedStatus === 'pending' ? result.resultDisposition : result.operationStatus,
          scenario.expectedStatus,
        );
      }
      assert.deepEqual(runtime.getStrategySnapshot(), before);
      assert.equal(runtime.storage.getItem(STORAGE_KEY), null);
      assert.equal(strategyCalls, 0);
      assert.equal((await store.snapshot()).settlements.length, 0);
    });
  }
});

test('Stage 14 duplicate results, restart-before-settlement, and unknown settlement remain idempotent', async (t) => {
  const fixture = await fixtureById('livmnu');
  const runtime = createLocalCatalogueaRuntime({ fixture });
  runtime.submitFixture(fixture);
  const instruction = runtime.getCurrentInstruction();
  const normalizedResult = {
    fixture: { id: fixture.id, home: fixture.home, away: fixture.away },
    status: 'verified',
    result: { homeScore: 2, awayScore: 1 },
    timestamp: NOW,
    source: 'local_simulated_sportsbook',
  };

  await t.test('restart before settlement uses the still-live strategy boundary', async (subtest) => {
    const { store, options } = await createStore(subtest, 'restart-before-real-settlement');
    const runId = 'run-restart-before-real-settlement';
    const action = await store.startOperation(runId, 'simulated_sportsbook_selection');
    await store.beginOperation(runId, action.id);
    await store.finishOperation(runId, action.id, 'confirmed');
    await store.recordVerifiedResult(runId, {
      operationId: action.id,
      normalizedResult,
    });

    const restartedController = new AutomationController({
      runId,
      runStore: new RunStore(options),
      dependencies: {
        strategySettlementPort: async (request) => {
          runtime.recordManualOutcomeMarks({ winners: ['oneX', 'ht21'] });
          const update = runtime.strategyPort.settleVerifiedResult({
            normalizedResult: request.normalizedResult,
            actionOperationId: request.actionOperationId,
          });
          return { strategyState: update.strategyState };
        },
      },
    });
    controllerStatesThroughResultVerified(restartedController);
    const result = await restartedController.settleVerifiedResult({
      instruction,
      normalizedResult,
      actionOperationId: action.id,
    });
    const snapshot = await restartedController.runStore.snapshot();

    assert.equal(result.disposition, 'settled');
    assert.equal(restartedController.currentState, STATES.COMPLETED);
    assert.equal(snapshot.operations.filter(
      ({ name }) => name === 'simulated_sportsbook_selection',
    ).length, 1);
    assert.equal(snapshot.operations.filter(
      ({ name }) => name === 'cataloguea_strategy_settlement',
    ).length, 1);
    assert.equal(JSON.parse(runtime.storage.getItem(STORAGE_KEY)).automationSettlements.length, 1);
  });

  await t.test('same verified result returns already_settled without changing strategy again', async () => {
    const beforeDuplicate = runtime.getStrategySnapshot();
    const update = runtime.strategyPort.settleVerifiedResult({
      normalizedResult,
      actionOperationId: 'restart-before-real-settlement-1',
    });
    assert.equal(update.status, 'already_settled');
    assert.deepEqual(runtime.getStrategySnapshot(), beforeDuplicate);
    assert.equal(JSON.parse(runtime.storage.getItem(STORAGE_KEY)).automationSettlements.length, 1);
  });

  await t.test('unknown settlement pauses, survives reconstruction, and is never retried', async (subtest) => {
    const unknownRuntime = createLocalCatalogueaRuntime({ fixture });
    unknownRuntime.submitFixture(fixture);
    const unknownInstruction = unknownRuntime.getCurrentInstruction();
    const { store, options } = await createStore(subtest, 'unknown-real-settlement');
    const runId = 'run-unknown-real-settlement';
    const action = await store.startOperation(runId, 'simulated_sportsbook_selection');
    await store.beginOperation(runId, action.id);
    await store.finishOperation(runId, action.id, 'confirmed');
    await store.recordVerifiedResult(runId, {
      operationId: action.id,
      normalizedResult,
    });
    const request = require('./strategy/settlementAdapter').createSettlementRequest({
      instruction: unknownInstruction,
      normalizedResult,
      actionOperationId: action.id,
    });
    const executing = await store.beginSettlement(runId, request);
    const restarted = new AutomationController({
      runId,
      runStore: new RunStore(options),
      dependencies: {
        strategySettlementPort: async () => {
          throw new Error('Restart found a prior settlement operation with unknown outcome.');
        },
      },
    });
    controllerStatesThroughResultVerified(restarted);
    const outcome = await restarted.settleVerifiedResult({
      instruction: unknownInstruction,
      normalizedResult,
      actionOperationId: action.id,
    });
    const after = await restarted.runStore.snapshot();

    assert.equal(executing.disposition, 'started');
    assert.equal(outcome.status, 'unknown');
    assert.equal(restarted.currentState, STATES.PAUSED);
    assert.equal(unknownRuntime.storage.getItem(STORAGE_KEY), null);
    assert.ok(unknownRuntime.getStrategySnapshot().fixture);
    assert.equal(after.settlements.length, 1);
    assert.equal(after.settlements[0].status, 'unknown');
    assert.equal(after.operations.filter(
      ({ name }) => name === 'cataloguea_strategy_settlement',
    ).length, 1);
  });
});
