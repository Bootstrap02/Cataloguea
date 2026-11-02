const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { AutomationController } = require('./controller');
const { verifyObservedSelection } = require('./sportsbook/simulatedSportsbookAdapter');
const { RunStore } = require('./persistence/runStore');
const { STATES } = require('./stateMachine');

async function createStore(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'simulated-sportsbook-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new RunStore({ filePath: path.join(directory, 'state.json') });
}

function strategySnapshot() {
  return {
    fixture: { id: 'livmnu', home: 'liv', away: 'mnu', oneX: 14.7 },
    gameStakes: { oneX: 2 },
    bigStakes: {},
    winnerStake: 31,
    winners: [],
    bigWinners: [],
    baseStake: 10000,
    deficit: 0,
    smallDeficit: 31,
    shadow: 31,
    bank: 0,
  };
}

function validObservedSelection() {
  return {
    fixtureId: 'livmnu',
    market: 'oneX',
    assetKey: 'oneX',
    stake: 2,
    odds: 14.7,
  };
}

function controllerWithSimulation({
  runStore,
  prepareSimulatedSelection,
  observeResult = async () => ({
    fixture: { id: 'livmnu', home: 'liv', away: 'mnu' },
    status: 'complete',
    result: { homeScore: '2', awayScore: '1' },
    timestamp: '2026-10-06T12:00:00.000Z',
    source: 'local_simulated_sportsbook',
  }),
}) {
  return new AutomationController({
    runStore,
    dependencies: {
      launchBrowser: async () => ({
        page: {},
        close: async () => {},
      }),
      prepareSimulatedSelection,
      observeResult,
      strategySettlementPort: async ({ resultId, instruction }) => ({
        strategyState: {
          ...instruction.strategyState,
          settlement: { status: 'settled', resultId },
        },
      }),
    },
  });
}

test('verifies fixture, market/asset, stake, and odds against instruction', () => {
  const instruction = new AutomationController().observeStrategy(strategySnapshot());
  assert.equal(
    verifyObservedSelection(instruction, validObservedSelection()),
    true,
  );
});

test('rejects wrong fixture before simulated action', async (t) => {
  const runStore = await createStore(t);
  const controller = controllerWithSimulation({
    runStore,
    prepareSimulatedSelection: async () => {
      throw new Error('Fixture mismatch: strategy expects livmnu, local page shows livche.');
    },
  });

  await assert.rejects(
    controller.runSimulatedOperation({
      strategySnapshot: strategySnapshot(),
      assetKey: 'oneX',
    }),
    /Fixture mismatch/,
  );
  assert.equal(controller.currentState, STATES.ERROR);
  assert.equal((await runStore.snapshot()).operations.length, 0);
});

test('rejects missing market before simulated action', () => {
  const instruction = new AutomationController().observeStrategy(strategySnapshot());
  assert.throws(
    () => verifyObservedSelection(instruction, {
      ...validObservedSelection(),
      market: 'missingMarket',
    }),
    /market mismatch/,
  );
});

test('rejects stake and odds mismatches before execution', () => {
  const instruction = new AutomationController().observeStrategy(strategySnapshot());
  assert.throws(
    () => verifyObservedSelection(instruction, {
      ...validObservedSelection(),
      stake: 20,
    }),
    /stake mismatch/,
  );
  assert.throws(
    () => verifyObservedSelection(instruction, {
      ...validObservedSelection(),
      odds: 15,
    }),
    /odds mismatch/,
  );
});

test('confirms one simulated operation and persists its lifecycle', async (t) => {
  const runStore = await createStore(t);
  let executeCalls = 0;
  const controller = controllerWithSimulation({
    runStore,
    prepareSimulatedSelection: async () => ({
      selection: validObservedSelection(),
      execute: async () => {
        executeCalls += 1;
        return { confirmation: 'Local simulation confirmed.' };
      },
    }),
  });

  const result = await controller.runSimulatedOperation({
    strategySnapshot: strategySnapshot(),
    assetKey: 'oneX',
  });
  const store = await runStore.snapshot();

  assert.equal(result.state, STATES.COMPLETED);
  assert.equal(result.selection.stake, 2);
  assert.deepEqual(result.normalizedResult.result, { homeScore: 2, awayScore: 1 });
  assert.equal(executeCalls, 1);
  assert.deepEqual(
    store.operations.map(({ name, status }) => ({ name, status })),
    [
      { name: 'simulated_sportsbook_selection', status: 'confirmed' },
      { name: 'cataloguea_strategy_settlement', status: 'confirmed' },
    ],
  );
  assert.ok(store.events.some(({ type }) => type === 'operation_executing'));
  assert.deepEqual(
    result.transitions.slice(-7).map(({ to }) => to),
    [
      STATES.CONFIRMED,
      STATES.WAITING_FOR_RESULT,
      STATES.RESULT_DETECTED,
      STATES.RESULT_VERIFIED,
      STATES.SETTLING_STRATEGY,
      STATES.SETTLEMENT_CONFIRMED,
      STATES.COMPLETED,
    ],
  );
  assert.equal(result.settlementStatus, 'confirmed');
  assert.equal(result.settlementDisposition, 'settled');
  assert.equal(result.actionOperationId, store.operations[0].id);
  assert.notEqual(result.settlementOperationId, result.actionOperationId);
  assert.equal(
    result.strategyState.settlement.resultId,
    `livmnu:2-1:op:${result.actionOperationId}`,
  );
  assert.equal(store.results.length, 1);
  assert.equal(store.results[0].operationId, store.operations[0].id);
  assert.equal(store.settlements.length, 1);
  assert.equal(store.settlements[0].status, 'confirmed');
  assert.equal(store.settlements[0].actionOperationId, store.operations[0].id);
  assert.equal(store.settlements[0].settlementOperationId, result.settlementOperationId);
  assert.equal(store.checkpoint.resultObservationStatus, 'verified');
  assert.deepEqual(store.checkpoint.normalizedResult.result, { homeScore: 2, awayScore: 1 });
});

test('keeps a pending result in WAITING_FOR_RESULT without normalizing it as final', async (t) => {
  const runStore = await createStore(t);
  const controller = controllerWithSimulation({
    runStore,
    prepareSimulatedSelection: async () => ({
      selection: validObservedSelection(),
      execute: async () => ({ confirmation: 'Local simulation confirmed.' }),
    }),
    observeResult: async () => ({
      fixture: { id: 'livmnu', home: 'liv', away: 'mnu' },
      status: 'pending',
      result: null,
      timestamp: '2026-10-06T12:00:00.000Z',
      source: 'local_simulated_sportsbook',
    }),
  });

  const result = await controller.runSimulatedOperation({
    strategySnapshot: strategySnapshot(),
    assetKey: 'oneX',
  });
  const store = await runStore.snapshot();
  assert.equal(result.state, STATES.WAITING_FOR_RESULT);
  assert.equal(result.resultObservation.status, 'pending');
  assert.equal(result.resultObservation.result, null);
  assert.equal(store.checkpoint.resultObservationStatus, 'pending');
  assert.equal(store.checkpoint.operationId, store.operations[0].id);
  assert.equal(store.results.length, 0);
  assert.equal(store.operations[0].status, 'confirmed');
});

for (const [name, observation, expectedError] of [
  [
    'wrong fixture result',
    {
      fixture: { id: 'livche', home: 'liv', away: 'che' },
      status: 'complete',
      result: { homeScore: '2', awayScore: '1' },
      timestamp: '2026-10-06T12:00:00.000Z',
      source: 'local_simulated_sportsbook',
    },
    /Result fixture mismatch/,
  ],
  [
    'ambiguous incomplete result',
    {
      fixture: { id: 'livmnu', home: 'liv', away: 'mnu' },
      status: 'complete',
      result: { homeScore: '2', awayScore: '' },
      timestamp: '2026-10-06T12:00:00.000Z',
      source: 'local_simulated_sportsbook',
    },
    /missing or ambiguous scores/,
  ],
]) {
  test(`rejects ${name} and preserves the confirmed action record`, async (t) => {
    const runStore = await createStore(t);
    const controller = controllerWithSimulation({
      runStore,
      prepareSimulatedSelection: async () => ({
        selection: validObservedSelection(),
        execute: async () => ({ confirmation: 'Local simulation confirmed.' }),
      }),
      observeResult: async () => observation,
    });

    await assert.rejects(
      controller.runSimulatedOperation({
        strategySnapshot: strategySnapshot(),
        assetKey: 'oneX',
      }),
      expectedError,
    );
    const store = await runStore.snapshot();
    assert.equal(controller.currentState, STATES.ERROR);
    assert.equal(store.operations[0].status, 'confirmed');
    assert.equal(store.checkpoint.resultObservationStatus, 'rejected');
    assert.equal(store.results.length, 0);
  });
}

test('recognizes a duplicate verified result without storing it twice', async (t) => {
  const runStore = await createStore(t);
  const controller = controllerWithSimulation({
    runStore,
    prepareSimulatedSelection: async () => ({
      selection: validObservedSelection(),
      execute: async () => ({ confirmation: 'Local simulation confirmed.' }),
    }),
  });

  const result = await controller.runSimulatedOperation({
    strategySnapshot: strategySnapshot(),
    assetKey: 'oneX',
    duplicateResultObservation: true,
  });
  const store = await runStore.snapshot();
  assert.equal(result.resultDisposition, 'already_known');
  assert.equal(store.results.length, 1);
  assert.equal(store.events.filter(({ type }) => type === 'duplicate_result_observed').length, 1);
});

test('pauses unknown confirmation and never repeats simulated action', async (t) => {
  const runStore = await createStore(t);
  let executeCalls = 0;
  const controller = controllerWithSimulation({
    runStore,
    prepareSimulatedSelection: async () => ({
      selection: validObservedSelection(),
      execute: async () => {
        executeCalls += 1;
        const error = new Error('Confirmation was not observable.');
        error.simulatedActionCount = 1;
        throw error;
      },
    }),
  });

  const result = await controller.runSimulatedOperation({
    strategySnapshot: strategySnapshot(),
    assetKey: 'oneX',
  });
  const store = await runStore.snapshot();

  assert.equal(result.state, STATES.PAUSED);
  assert.equal(result.operationStatus, 'unknown');
  assert.equal(executeCalls, 1);
  assert.equal(store.operations[0].status, 'unknown');
  assert.equal(store.operations[0].outcome.simulatedActionCount, 1);
});
