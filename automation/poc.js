const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { RunStore } = require('./persistence/runStore');
const { AutomationController } = require('./controller');
const { createLocalCatalogueaRuntime } = require('./strategy/localCatalogueaRuntime');

const screenshotPath = path.join(__dirname, 'artifacts', 'poc.png');
const temporaryRunStores = [];

function createIsolatedRunStore(label) {
  const filePath = path.join(os.tmpdir(), `cataloguea-poc-${label}-${randomUUID()}.json`);
  temporaryRunStores.push(filePath);
  return new RunStore({ filePath });
}

async function main() {
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });

  const { odds } = await import('../src/Scores.js');
  const fixture = odds.find(({ id }) => id === 'livmnu');
  assert.ok(fixture, 'The real Cataloguea odds table must contain the local fixture.');
  const observationRuntime = createLocalCatalogueaRuntime({ fixture });
  observationRuntime.submitFixture();
  const observedStrategySnapshot = observationRuntime.getStrategySnapshot();
  const controller = new AutomationController({
    onTransition: ({ from, to }) => console.log(`[STATE] ${from} → ${to}`),
    onError: (error, state) => console.error(`[ERROR] ${state}: ${error.message}`),
  });
  const instruction = observationRuntime.getCurrentInstruction();
  assert.equal(instruction.fixture.id, 'livmnu');
  assert.equal(instruction.strategyState.status, 'stakes_available');
  assert.equal(instruction.recommendedAction, 'manual_result_entry');
  assert.equal(instruction.winnerStake, 31);
  assert.equal(instruction.assets.length, 10);
  console.log('[STRATEGY] Reading real Cataloguea fixture, calculated stakes, and strategy instruction.');
  console.log('[STRATEGY] Strategy-owned snapshot → adapter → automation instruction:');
  console.log(JSON.stringify({
    fixture: instruction.fixture,
    assets: instruction.assets,
    winnerStake: instruction.winnerStake,
    recommendedAction: instruction.recommendedAction,
    status: instruction.strategyState.status,
    observedAt: instruction.observedAt,
  }, null, 2));

  const successRuntime = createLocalCatalogueaRuntime({ fixture });
  successRuntime.submitFixture();
  let strategySettlementCalls = 0;
  let expectedSettledFinancialState;
  const simulatedController = new AutomationController({
    runStore: createIsolatedRunStore('real-strategy'),
    onTransition: ({ from, to }) => console.log(`[SIM STATE] ${from} → ${to}`),
    onError: (error, state) => console.error(`[SIM ERROR] ${state}: ${error.message}`),
    dependencies: {
      strategySettlementPort: async (request) => {
        strategySettlementCalls += 1;
        console.log('[STRATEGY] Using explicit outcome mark; result scores do not infer asset winners.');
        successRuntime.recordManualOutcomeMarks({ winners: ['oneX'] });
        expectedSettledFinancialState = require('../src/strategy/soloMatrixSettlement')
          .settleSoloMatrixState(successRuntime.getStrategySnapshot(), require('./strategy/catalogueaAdapter').ASSET_KEYS);
        return {
          strategyState: successRuntime.strategyPort.settleVerifiedResult({
            normalizedResult: request.normalizedResult,
            actionOperationId: request.actionOperationId,
          }).strategyState,
        };
      },
    },
  });
  const simulatedResult = await simulatedController.runSimulatedOperation({
    strategySnapshot: successRuntime.getStrategySnapshot(),
    assetKey: 'oneX',
    duplicateResultObservation: true,
    screenshotPath: path.join(__dirname, 'artifacts', 'simulated-sportsbook.png'),
  });
  assert.equal(simulatedResult.state, 'COMPLETED');
  assert.equal(simulatedResult.settlementStatus, 'confirmed');
  assert.equal(simulatedResult.settlementDisposition, 'settled');
  assert.equal(simulatedResult.strategyState.status, 'settled');
  assert.deepEqual(
    simulatedResult.strategyState.financialState,
    {
      baseStake: expectedSettledFinancialState.baseStake,
      deficit: expectedSettledFinancialState.deficit,
      smallDeficit: expectedSettledFinancialState.smallDeficit,
      shadow: expectedSettledFinancialState.shadow,
      bank: expectedSettledFinancialState.bank,
      privateDef: expectedSettledFinancialState.privateDef,
      bigDef: expectedSettledFinancialState.bigDef,
      brokenTarget: expectedSettledFinancialState.brokenTarget,
    },
  );
  assert.equal(simulatedResult.selection.stake, instruction.assets[0].stake);
  assert.deepEqual(simulatedResult.normalizedResult, {
    fixture: { id: 'livmnu', home: 'liv', away: 'mnu' },
    status: 'verified',
    result: { homeScore: 2, awayScore: 1 },
    timestamp: simulatedResult.normalizedResult.timestamp,
    source: 'local_simulated_sportsbook',
  });
  assert.equal(simulatedResult.resultDisposition, 'already_known');
  const simulatedResultId = require('./result/resultIdentity')
    .createResultId(simulatedResult.normalizedResult, simulatedResult.actionOperationId);
  const successStore = await simulatedController.runStore.snapshot();
  const successOperations = successStore.operations.filter(
    ({ runId }) => runId === simulatedResult.runId,
  );
  assert.equal(successOperations.filter(({ name }) => name === 'simulated_sportsbook_selection').length, 1);
  const actionOperation = successOperations.find(({ name }) => name === 'simulated_sportsbook_selection');
  const settlementOperation = successStore.operations.find(
    ({ id }) => id === simulatedResult.settlementOperationId,
  );
  const settlementRecord = successStore.settlements.find(
    ({ resultId }) => resultId === simulatedResultId,
  );
  assert.equal(actionOperation.status, 'confirmed');
  assert.ok(settlementOperation);
  assert.equal(settlementOperation.status, 'confirmed');
  assert.equal(settlementRecord.settlementOperationId, settlementOperation.id);
  assert.equal(settlementRecord.actionOperationId, simulatedResult.actionOperationId);
  assert.ok(successStore.results.some(
    ({ id }) => id === simulatedResultId,
  ));
  assert.equal(successStore.checkpoint.settlementOperationId, simulatedResult.settlementOperationId);
  console.log('[RESULT] Normalized simulated result:');
  console.log(JSON.stringify(simulatedResult.normalizedResult, null, 2));
  console.log('[SETTLEMENT] Strategy settlement confirmed; updated strategy state persisted.');
  assert.equal(strategySettlementCalls, 1);
  const strategyPersistence = JSON.parse(
    successRuntime.storage.getItem(require('./strategy/localCatalogueaRuntime').STORAGE_KEY),
  );
  assert.equal(strategyPersistence.automationSettlements[0].resultId, simulatedResultId);
  console.log('[PERSISTENCE] Real strategy state and result receipt saved to localStorage fixture.');
  const beforeDuplicateOperations = successStore.operations.length;
  const duplicateSettlement = await simulatedController.settleVerifiedResult({
    instruction: simulatedResult.instruction,
    normalizedResult: simulatedResult.normalizedResult,
    actionOperationId: simulatedResult.actionOperationId,
  });
  const afterDuplicateStore = await simulatedController.runStore.snapshot();
  assert.equal(duplicateSettlement.disposition, 'already_settled');
  assert.equal(afterDuplicateStore.operations.length, beforeDuplicateOperations);
  assert.equal(afterDuplicateStore.settlements.length, successStore.settlements.length);
  console.log('[TEST] Repeated result returned already_settled without creating another operation.');

  const uncertainRuntime = createLocalCatalogueaRuntime({ fixture });
  uncertainRuntime.submitFixture();
  const uncertainSnapshot = uncertainRuntime.getStrategySnapshot();
  let settlementAttempts = 0;
  const uncertainSettlementController = new AutomationController({
    runStore: createIsolatedRunStore('unknown-settlement'),
    onTransition: ({ from, to }) => console.log(`[SIM STATE] ${from} → ${to}`),
    onError: (error, state) => console.error(`[SIM ERROR] ${state}: ${error.message}`),
    dependencies: {
      strategySettlementPort: async () => {
        settlementAttempts += 1;
        throw new Error('Simulated settlement confirmation interruption.');
      },
    },
  });
  const uncertainSettlement = await uncertainSettlementController.runSimulatedOperation({
    strategySnapshot: uncertainSnapshot,
    assetKey: 'oneX',
    resultScenario: 'alternate_complete',
  });
  assert.equal(uncertainSettlement.state, 'PAUSED');
  assert.equal(uncertainSettlement.settlementStatus, 'unknown');
  assert.deepEqual(uncertainRuntime.getStrategySnapshot(), uncertainSnapshot);
  assert.equal(uncertainRuntime.storage.getItem(
    require('./strategy/localCatalogueaRuntime').STORAGE_KEY,
  ), null);
  const settlementAttemptsBeforeRepeat = settlementAttempts;
  const repeatUncertainSettlement = await uncertainSettlementController.settleVerifiedResult({
    instruction: uncertainSettlement.instruction,
    normalizedResult: uncertainSettlement.normalizedResult,
    actionOperationId: uncertainSettlement.actionOperationId,
  });
  const uncertainSettlementStore = await uncertainSettlementController.runStore.snapshot();
  assert.equal(repeatUncertainSettlement.status, 'unknown');
  assert.equal(settlementAttempts, settlementAttemptsBeforeRepeat);
  assert.ok(settlementAttempts <= 1);
  const uncertainResultId = require('./result/resultIdentity')
    .createResultId(uncertainSettlement.normalizedResult, uncertainSettlement.actionOperationId);
  assert.equal(uncertainSettlementStore.settlements.find(
    ({ resultId }) => resultId === uncertainResultId,
  ).status, 'unknown');
  console.log('[TEST] Unknown settlement paused and was not executed again.');

  const pendingController = new AutomationController({
    onTransition: ({ from, to }) => console.log(`[SIM STATE] ${from} → ${to}`),
  });
  const pendingResult = await pendingController.runSimulatedOperation({
    strategySnapshot: observedStrategySnapshot,
    assetKey: 'oneX',
    resultScenario: 'pending',
  });
  assert.equal(pendingResult.state, 'WAITING_FOR_RESULT');
  assert.equal(pendingResult.resultObservation.result, null);
  const pendingStore = await pendingController.runStore.snapshot();
  assert.equal(pendingStore.checkpoint.resultObservationStatus, 'pending');
  assert.equal(
    pendingStore.results.filter(({ runId }) => runId === pendingController.runId).length,
    0,
  );
  console.log('[TEST] Pending simulated result remained WAITING_FOR_RESULT.');

  for (const [resultScenario, expectedMessage] of [
    ['wrong_fixture', /Result fixture mismatch/],
    ['incomplete', /missing or ambiguous scores/],
  ]) {
    const resultFailureController = new AutomationController({
      onTransition: ({ from, to }) => console.log(`[SIM STATE] ${from} → ${to}`),
      onError: (error, state) => console.error(`[SIM ERROR] ${state}: ${error.message}`),
    });
    await assert.rejects(
      resultFailureController.runSimulatedOperation({
        strategySnapshot: observedStrategySnapshot,
        assetKey: 'oneX',
        resultScenario,
      }),
      expectedMessage,
    );
    assert.equal(resultFailureController.currentState, 'ERROR');
    const rejectedStore = await resultFailureController.runStore.snapshot();
    assert.equal(rejectedStore.operations[0].status, 'confirmed');
    assert.equal(rejectedStore.checkpoint.resultObservationStatus, 'rejected');
    assert.equal(
      rejectedStore.results.filter(({ runId }) => runId === resultFailureController.runId).length,
      0,
    );
    console.log(`[TEST] ${resultScenario} result was rejected without settlement.`);
  }

  for (const failureMode of ['wrong_fixture', 'missing_market']) {
    const failureController = new AutomationController({
      onTransition: ({ from, to }) => console.log(`[SIM STATE] ${from} → ${to}`),
      onError: (error, state) => console.error(`[SIM ERROR] ${state}: ${error.message}`),
    });
    await assert.rejects(
      failureController.runSimulatedOperation({
        strategySnapshot: observedStrategySnapshot,
        assetKey: 'oneX',
        failureMode,
      }),
    );
    assert.equal(failureController.currentState, 'ERROR');
    const failureStore = await failureController.runStore.snapshot();
    assert.equal(
      failureStore.operations.filter(({ runId }) => runId === failureController.runId).length,
      0,
    );
    console.log(`[TEST] ${failureMode} prevented simulated action; no operation was created.`);
  }

  const unconfirmedController = new AutomationController({
    onTransition: ({ from, to }) => console.log(`[SIM STATE] ${from} → ${to}`),
    onError: (error, state) => console.error(`[SIM ERROR] ${state}: ${error.message}`),
  });
  const unconfirmed = await unconfirmedController.runSimulatedOperation({
    strategySnapshot: observedStrategySnapshot,
    assetKey: 'oneX',
    failureMode: 'confirmation_missing',
  });
  assert.equal(unconfirmed.state, 'PAUSED');
  assert.equal(unconfirmed.operationStatus, 'unknown');
  const unconfirmedStore = await unconfirmedController.runStore.snapshot();
  const unknownOperation = unconfirmedStore.operations.find(
    ({ runId }) => runId === unconfirmed.runId,
  );
  assert.equal(unknownOperation.status, 'unknown');
  assert.equal(unknownOperation.outcome.simulatedActionCount, 1);
  console.log('[TEST] Missing confirmation recorded UNKNOWN after exactly one simulated action.');

  const result = await controller.run({ screenshotPath });
  assert.equal(result.state, 'COMPLETED');
  console.log(`Run checkpoint and operation record saved for ${result.runId}.`);
  console.log(`Screenshot saved to ${screenshotPath}`);
  console.log('Expected navigation timeout handled; local fixture remained open.');
  console.log('Verified fixture text, button interaction, and form input.');

  const recoveryController = new AutomationController({
    onTransition: ({ from, to }) => console.log(`[STATE] ${from} → ${to}`),
    onError: (error, state) => console.error(`[ERROR] ${state}: ${error.message}`),
  });
  const recovered = await recoveryController.run({ failureMode: 'closed_page_once' });
  assert.equal(recovered.state, 'COMPLETED');
  assert.ok(
    recovered.transitions.some(({ from, to }) => from === 'RECOVERING' && to === 'OBSERVING'),
  );
  console.log('[TEST] Closed-page failure recovered safely and returned to OBSERVING.');

  const unknownController = new AutomationController({
    onTransition: ({ from, to }) => console.log(`[STATE] ${from} → ${to}`),
    onError: (error, state) => console.error(`[ERROR] ${state}: ${error.message}`),
  });
  const unknownResult = await unknownController.run({ failureMode: 'unknown_operation' });
  assert.equal(unknownResult.state, 'PAUSED');
  assert.equal(unknownResult.operationStatus, 'unknown');
  const persistedUnknown = await unknownController.runStore.snapshot();
  const unknownOperations = persistedUnknown.operations.filter(
    ({ runId }) => runId === unknownResult.runId,
  );
  assert.equal(unknownOperations.length, 1);
  assert.equal(unknownOperations[0].status, 'unknown');
  console.log('[TEST] Unknown operation paused; it was not retried.');

  const restartedUnknownStore = new RunStore({
    filePath: unknownController.runStore.filePath,
  });
  const restartedUnknown = await restartedUnknownStore.snapshot();
  assert.equal(restartedUnknown.operations.filter(
    ({ runId }) => runId === unknownResult.runId,
  )[0].status, 'unknown');
  const restartedController = new AutomationController({
    runStore: restartedUnknownStore,
    runId: unknownResult.runId,
  });
  const restartResult = await restartedController.run();
  assert.equal(restartResult.state, 'PAUSED');
  assert.equal(restartResult.operationStatus, 'unknown');
  assert.equal((await restartedUnknownStore.snapshot()).operations.filter(
    ({ runId }) => runId === unknownResult.runId,
  ).length, 1);
  console.log('[TEST] Restart preserved UNKNOWN action and refused to create a duplicate.');
}

main().catch((error) => {
  console.error('Playwright proof of concept failed:', error);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.all(temporaryRunStores.map((filePath) => fs.rm(filePath, { force: true })));
});
