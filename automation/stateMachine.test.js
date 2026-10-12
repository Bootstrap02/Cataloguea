const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { RunStore } = require('./persistence/runStore');
const { STATES, StateMachine } = require('./stateMachine');

test('starts in IDLE', () => {
  const machine = new StateMachine();
  assert.equal(machine.getState(), STATES.IDLE);
  assert.deepEqual(machine.getTransitions(), []);
});

test('performs a valid transition and records it', () => {
  const machine = new StateMachine();
  assert.deepEqual(machine.transition(STATES.INITIALIZING), {
    from: STATES.IDLE,
    to: STATES.INITIALIZING,
  });
  assert.equal(machine.getState(), STATES.INITIALIZING);
  assert.deepEqual(machine.getTransitions(), [
    { from: STATES.IDLE, to: STATES.INITIALIZING },
  ]);
});

test('rejects an invalid transition without changing state', () => {
  const machine = new StateMachine();
  assert.throws(() => machine.transition(STATES.COMPLETED), /Invalid state transition/);
  assert.equal(machine.getState(), STATES.IDLE);
  assert.deepEqual(machine.getTransitions(), []);
});

test('updates current state deterministically', () => {
  const machine = new StateMachine();
  machine.transition(STATES.INITIALIZING);
  machine.transition(STATES.OBSERVING);
  assert.equal(machine.getState(), STATES.OBSERVING);
});

test('allows an explicit error transition from active states', () => {
  const machine = new StateMachine();
  machine.transition(STATES.INITIALIZING);
  assert.deepEqual(machine.transition(STATES.ERROR), {
    from: STATES.INITIALIZING,
    to: STATES.ERROR,
  });
  assert.equal(machine.getState(), STATES.ERROR);
});

test('transitions through waiting, detected, and verified result states', () => {
  const machine = new StateMachine();
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
    STATES.SETTLING_STRATEGY,
    STATES.SETTLEMENT_CONFIRMED,
    STATES.COMPLETED,
  ]) {
    machine.transition(state);
  }
  assert.equal(machine.getState(), STATES.COMPLETED);
  assert.throws(
    () => machine.transition(STATES.RESULT_VERIFIED),
    /Invalid state transition/,
  );
});

test('stops deterministically and rejects transitions after stopping', () => {
  const machine = new StateMachine();
  machine.transition(STATES.INITIALIZING);
  assert.deepEqual(machine.stop(), {
    from: STATES.INITIALIZING,
    to: STATES.STOPPED,
  });
  assert.equal(machine.getState(), STATES.STOPPED);
  assert.throws(() => machine.stop(), /Invalid state transition: STOPPED/);
});

test('persists checkpoints and structured state transition events', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'automation-run-store-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new RunStore({
    filePath: path.join(directory, 'run-state.json'),
    clock: () => '2026-10-06T12:00:00.000Z',
    idFactory: (() => {
      let nextId = 0;
      return () => `test-id-${++nextId}`;
    })(),
  });

  await store.recordTransition('run-1', {
    from: STATES.IDLE,
    to: STATES.INITIALIZING,
  });

  const snapshot = await store.snapshot();
  assert.deepEqual(snapshot.checkpoint, {
    runId: 'run-1',
    state: STATES.INITIALIZING,
    step: STATES.INITIALIZING,
    updatedAt: '2026-10-06T12:00:00.000Z',
  });
  assert.equal(snapshot.events[0].type, 'state_transition');
  assert.equal(snapshot.events[0].from, STATES.IDLE);
  assert.equal(snapshot.events[0].to, STATES.INITIALIZING);
  assert.equal((await fs.stat(store.filePath)).mode & 0o777, 0o600);
});

test('serializes concurrent mutations from separate store instances without dropping events', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'automation-store-concurrency-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'run-state.json');
  const firstStore = new RunStore({ filePath });
  const secondStore = new RunStore({ filePath });

  await Promise.all(Array.from({ length: 24 }, (_, index) => (
    (index % 2 ? firstStore : secondStore).recordEvent('run-concurrent', 'probe', { index })
  )));

  const snapshot = await firstStore.snapshot();
  const recordedIndexes = snapshot.events.map(({ index }) => index).sort((left, right) => left - right);
  assert.deepEqual(recordedIndexes, Array.from({ length: 24 }, (_, index) => index));
});

test('cleans the temporary file when an atomic store replacement fails', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'automation-store-write-failure-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const targetDirectory = path.join(directory, 'state-target');
  await fs.mkdir(targetDirectory);
  const store = new RunStore({ filePath: targetDirectory });
  store.read = async () => ({
    version: 1,
    updatedAt: null,
    checkpoint: null,
    operations: [],
    results: [],
    settlements: [],
    events: [],
  });

  await assert.rejects(
    store.recordEvent('run-write-failure', 'probe'),
    /Writing automation run store failed/,
  );
  assert.deepEqual(await fs.readdir(directory), ['state-target']);
});

test('tracks confirmed, failed, and uncertain operation outcomes', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'automation-operations-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let nextId = 0;
  const store = new RunStore({
    filePath: path.join(directory, 'run-state.json'),
    clock: () => '2026-10-06T12:00:00.000Z',
    idFactory: () => `operation-${++nextId}`,
  });

  for (const status of ['confirmed', 'failed', 'uncertain']) {
    const operation = await store.startOperation('run-1', 'local_fixture_interaction');
    await store.finishOperation('run-1', operation.id, status);
  }

  const snapshot = await store.snapshot();
  assert.deepEqual(snapshot.operations.map(({ status }) => status), [
    'confirmed',
    'failed',
    'uncertain',
  ]);
  assert.equal(snapshot.events.filter(({ type }) => type === 'operation_started').length, 3);
  assert.equal(snapshot.events.filter(({ type }) => type === 'operation_finished').length, 3);
});

test('rejects malformed persisted data and invalid operation updates', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'automation-invalid-store-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'run-state.json');
  const store = new RunStore({ filePath });

  await fs.writeFile(filePath, '{invalid', 'utf8');
  await assert.rejects(store.snapshot(), /Parsing automation run store failed/);

  await fs.rm(filePath);
  const operation = await store.startOperation('run-1', 'local_fixture_interaction');
  await assert.rejects(
    store.finishOperation('run-other', operation.id, 'confirmed'),
    /was not found/,
  );
  await assert.rejects(
    store.finishOperation('run-1', operation.id, 'pending'),
    /Invalid operation status/,
  );
});

test('rejects a duplicate generated operation ID instead of aliasing two actions', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'automation-duplicate-operation-id-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new RunStore({
    filePath: path.join(directory, 'run-state.json'),
    idFactory: () => 'same-operation-id',
  });

  await store.startOperation('run-1', 'local_fixture_interaction');
  await assert.rejects(
    store.startOperation('run-1', 'local_fixture_interaction'),
    /invalid or duplicate operation ID/,
  );
  assert.equal((await store.snapshot()).operations.length, 1);
});
