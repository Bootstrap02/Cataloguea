const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { RunStore } = require('./persistence/runStore');
const { createResultId } = require('./result/resultIdentity');
const {
  applySettlementRequest,
  createSettlementRequest,
} = require('./strategy/settlementAdapter');
const { AutomationController } = require('./controller');
const { STATES } = require('./stateMachine');

const fixture = { id: 'arsmnu', home: 'ars', away: 'mnu' };
const instruction = {
  fixture,
  strategyState: { status: 'stakes_available', financialState: { bank: 0 } },
};

function verifiedResult(homeScore = 2, awayScore = 1, timestamp = '2026-10-06T12:00:00.000Z') {
  return {
    fixture,
    status: 'verified',
    result: { homeScore, awayScore },
    timestamp,
    source: 'local_simulated_sportsbook',
  };
}

function createRequest(result = verifiedResult(), actionOperationId = 'action-1') {
  return createSettlementRequest({
    instruction,
    normalizedResult: result,
    actionOperationId,
  });
}

async function createStore(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'strategy-settlement-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let id = 0;
  const store = new RunStore({
    filePath: path.join(directory, 'run-state.json'),
    idFactory: () => `generated-${++id}`,
  });
  const action = await store.startOperation('run-1', 'simulated_sportsbook_selection');
  await store.beginOperation('run-1', action.id);
  await store.finishOperation('run-1', action.id, 'confirmed');
  await store.recordVerifiedResult('run-1', {
    operationId: action.id,
    normalizedResult: verifiedResult(),
  });
  return { store, action };
}

test('creates deterministic result identity independent of observation timestamp', () => {
  assert.equal(createResultId(verifiedResult()), 'arsmnu:2-1');
  assert.equal(
    createResultId(verifiedResult(2, 1, '2026-10-07T12:00:00.000Z')),
    createResultId(verifiedResult()),
  );
  assert.notEqual(createResultId(verifiedResult(2, 0)), createResultId(verifiedResult()));
  assert.equal(
    createResultId(verifiedResult(), 'action-1'),
    'arsmnu:2-1:op:action-1',
  );
  assert.notEqual(
    createResultId(verifiedResult(), 'action-1'),
    createResultId(verifiedResult(), 'action-2'),
  );
  assert.throws(
    () => createResultId(verifiedResult(), 'x'.repeat(129)),
    /valid action operation ID/,
  );
  assert.throws(
    () => createResultId(verifiedResult(-1, 0)),
    /verified fixture and complete integer score/,
  );
});

test('settlement request requires a verified result matching the instruction fixture', () => {
  assert.equal(createRequest().resultId, 'arsmnu:2-1:op:action-1');
  assert.throws(
    () => createRequest({ ...verifiedResult(), status: 'pending' }),
    /Only a verified result/,
  );
  assert.throws(
    () => createRequest({
      ...verifiedResult(),
      fixture: { id: 'arsche', home: 'ars', away: 'che' },
    }),
    /does not match/,
  );
  assert.throws(
    () => createRequest({
      ...verifiedResult(),
      result: { homeScore: 2, awayScore: null },
    }),
    /complete integer score/,
  );
  assert.throws(
    () => createRequest({
      ...verifiedResult(),
      result: { homeScore: -1, awayScore: 0 },
    }),
    /non-negative/,
  );
});

test('strategy port applies state update without duplicating strategy calculations', async () => {
  let portCalls = 0;
  const update = await applySettlementRequest(createRequest(), async (request) => {
    portCalls += 1;
    return {
      strategyState: {
        ...request.instruction.strategyState,
        settlement: { status: 'settled', resultId: request.resultId },
      },
    };
  });
  assert.equal(portCalls, 1);
  assert.equal(update.strategyState.settlement.resultId, 'arsmnu:2-1:op:action-1');
  await assert.rejects(
    applySettlementRequest(createRequest(), undefined),
    /No strategy-owned settlement port/,
  );
});

test('persists a separate settlement operation linked to action and result; repeat does not execute again', async (t) => {
  const { store, action } = await createStore(t);
  const request = createRequest(verifiedResult(), action.id);
  let portCalls = 0;
  const first = await store.beginSettlement('run-1', request);
  assert.equal(first.disposition, 'started');
  assert.notEqual(first.operation.id, action.id);

  const update = await applySettlementRequest(request, async () => {
    portCalls += 1;
    return {
      strategyState: {
        status: 'settled',
        financialState: { bank: 999999 },
      },
    };
  });
  await store.finishSettlement('run-1', request.resultId, 'confirmed', {
    strategyState: update.strategyState,
    actionOperationId: action.id,
    resultId: request.resultId,
  });
  const second = await store.beginSettlement('run-1', request);
  const snapshot = await store.snapshot();

  assert.equal(second.disposition, 'already_settled');
  assert.equal(portCalls, 1);
  assert.equal(snapshot.settlements.length, 1);
  assert.equal(snapshot.settlements[0].status, 'confirmed');
  assert.deepEqual(snapshot.settlements[0].outcome.strategyState, {
    status: 'settled',
    resultId: request.resultId,
  });
  assert.equal(
    Object.hasOwn(snapshot.settlements[0].outcome.strategyState, 'financialState'),
    false,
  );
  assert.equal(snapshot.settlements[0].actionOperationId, action.id);
  assert.equal(snapshot.settlements[0].settlementOperationId, first.operation.id);
  assert.ok(snapshot.events.some(
    ({ type, operationId }) => type === 'operation_started' && operationId === first.operation.id,
  ));
  assert.ok(snapshot.events.some(
    ({ type, operationId }) => type === 'operation_executing' && operationId === first.operation.id,
  ));
  assert.equal(
    snapshot.operations.find(({ id }) => id === first.operation.id).status,
    'confirmed',
  );
});

test('different verified score creates a distinct result identity and settlement', async (t) => {
  const { store, action } = await createStore(t);
  const changed = verifiedResult(1, 0);
  const changedAction = await store.startOperation('run-1', 'simulated_sportsbook_selection');
  await store.beginOperation('run-1', changedAction.id);
  await store.finishOperation('run-1', changedAction.id, 'confirmed');
  await store.recordVerifiedResult('run-1', {
    operationId: changedAction.id,
    normalizedResult: changed,
  });
  const claim = await store.beginSettlement('run-1', createRequest(changed, changedAction.id));
  assert.equal(claim.disposition, 'started');
  assert.equal((await store.snapshot()).settlements.length, 1);
  assert.equal(claim.settlement.resultId, 'arsmnu:1-0:op:'.concat(changedAction.id));
});

test('identical fixture and score under a new confirmed operation has a distinct settlement identity', async (t) => {
  const { store, action } = await createStore(t);
  const firstRequest = createRequest(verifiedResult(), action.id);
  const firstClaim = await store.beginSettlement('run-1', firstRequest);
  await store.finishSettlement('run-1', firstRequest.resultId, 'confirmed', {
    actionOperationId: action.id,
  });

  const secondAction = await store.startOperation('run-1', 'simulated_sportsbook_selection');
  await store.beginOperation('run-1', secondAction.id);
  await store.finishOperation('run-1', secondAction.id, 'confirmed');
  const secondResult = await store.recordVerifiedResult('run-1', {
    operationId: secondAction.id,
    normalizedResult: verifiedResult(),
  });
  const secondRequest = createRequest(verifiedResult(), secondAction.id);
  const secondClaim = await store.beginSettlement('run-1', secondRequest);
  const snapshot = await store.snapshot();

  assert.equal(firstClaim.disposition, 'started');
  assert.equal(secondResult.disposition, 'recorded');
  assert.notEqual(secondResult.resultId, firstRequest.resultId);
  assert.equal(secondClaim.disposition, 'started');
  assert.equal(snapshot.results.length, 2);
  assert.equal(snapshot.settlements.length, 2);
});

test('one confirmed action cannot be assigned conflicting verified scores', async (t) => {
  const { store, action } = await createStore(t);
  await assert.rejects(
    store.recordVerifiedResult('run-1', {
      operationId: action.id,
      normalizedResult: verifiedResult(3, 0),
    }),
    /conflicting verified results/,
  );
  assert.equal((await store.snapshot()).results.length, 1);
});

test('legacy fixture-and-score records remain idempotent after identity hardening', async (t) => {
  const { store, action } = await createStore(t);
  const request = createRequest(verifiedResult(), action.id);
  const claim = await store.beginSettlement('run-1', request);
  await store.finishSettlement('run-1', request.resultId, 'confirmed', {
    resultId: request.resultId,
    strategyState: { status: 'settled' },
  });

  const legacyResultId = createResultId(verifiedResult());
  const legacyStore = await store.snapshot();
  legacyStore.results[0].id = legacyResultId;
  legacyStore.settlements[0].resultId = legacyResultId;
  legacyStore.operations.find(({ id }) => id === claim.operation.id).details.resultId = legacyResultId;
  legacyStore.checkpoint.resultId = legacyResultId;
  await fs.writeFile(store.filePath, `${JSON.stringify(legacyStore)}\n`);

  const duplicateResult = await store.recordVerifiedResult('run-1', {
    operationId: action.id,
    normalizedResult: verifiedResult(),
  });
  const duplicateSettlement = await store.beginSettlement('run-1', request);
  const snapshot = await store.snapshot();

  assert.equal(duplicateResult.disposition, 'already_known');
  assert.equal(duplicateSettlement.disposition, 'already_settled');
  assert.equal(snapshot.results.length, 1);
  assert.equal(snapshot.settlements.length, 1);
});

test('unknown settlement is paused and never automatically re-executed', async (t) => {
  const { store, action } = await createStore(t);
  let portCalls = 0;
  const controller = new AutomationController({
    runStore: store,
    runId: 'run-1',
    dependencies: {
      strategySettlementPort: async () => {
        portCalls += 1;
        throw new Error('Settlement confirmation unavailable.');
      },
    },
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
    controller.stateMachine.transition(state);
  }
  const requestArgs = {
    instruction,
    normalizedResult: verifiedResult(),
    actionOperationId: action.id,
  };

  const first = await controller.settleVerifiedResult(requestArgs);
  const second = await controller.settleVerifiedResult(requestArgs);
  const snapshot = await store.snapshot();
  assert.equal(first.status, 'unknown');
  assert.equal(second.status, 'unknown');
  assert.equal(controller.currentState, STATES.PAUSED);
  assert.deepEqual(controller.transitions.slice(-3).map(({ to }) => to), [
    STATES.SETTLING_STRATEGY,
    STATES.SETTLEMENT_UNKNOWN,
    STATES.PAUSED,
  ]);
  assert.equal(portCalls, 1);
  assert.equal(snapshot.settlements.length, 1);
  assert.equal(snapshot.settlements[0].status, 'unknown');
});

test('does not begin a first settlement outside RESULT_VERIFIED', async (t) => {
  const { store, action } = await createStore(t);
  const controller = new AutomationController({ runStore: store, runId: 'run-1' });
  await assert.rejects(
    controller.settleVerifiedResult({
      instruction,
      normalizedResult: verifiedResult(),
      actionOperationId: action.id,
    }),
    /only start from RESULT_VERIFIED/,
  );
  assert.equal((await store.snapshot()).settlements.length, 0);
});

test('an executing settlement discovered after a simulated crash becomes unknown', async (t) => {
  const { store, action } = await createStore(t);
  const request = createRequest(verifiedResult(), action.id);
  const started = await store.beginSettlement('run-1', request);
  const recoveryAttempt = await store.beginSettlement('run-1', request);
  const snapshot = await store.snapshot();

  assert.equal(started.disposition, 'started');
  assert.equal(recoveryAttempt.disposition, 'unknown');
  assert.equal(snapshot.settlements[0].status, 'unknown');
  assert.equal(
    snapshot.operations.find(({ id }) => id === started.operation.id).status,
    'unknown',
  );
});

test('serializes competing settlement claims across store instances', async (t) => {
  const { store, action } = await createStore(t);
  const competingStore = new RunStore({ filePath: store.filePath });
  const request = createRequest(verifiedResult(), action.id);
  const [first, second] = await Promise.all([
    store.beginSettlement('run-1', request),
    competingStore.beginSettlement('run-1', request),
  ]);
  const snapshot = await store.snapshot();

  assert.deepEqual(
    [first.disposition, second.disposition].sort(),
    ['started', 'unknown'],
  );
  assert.equal(snapshot.settlements.length, 1);
  assert.equal(snapshot.settlements[0].status, 'unknown');
});
