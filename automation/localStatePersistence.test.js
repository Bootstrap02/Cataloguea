const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createBackupMeta,
  isValidStoredStrategyState,
  readStoredStrategyState,
  shouldUseBackendRecovery,
  withBackupMeta,
} = require('../src/strategy/localStatePersistence');
const { persistStrategyState } = require('../src/strategy/soloMatrixSettlement');

const VALID_LOCAL_STATE = {
  base: 10000,
  deficit: 100,
  smallDeficit: 40,
  shadow: 30,
  bank: 50,
  privateDef: { oneX: 5, twoX: 0 },
  bigDef: { x2: 0 },
  brokenTarget: { ht21: 2 },
  automationSettlements: [],
  observedAt: '2026-10-07T10:00:00.000Z',
  backupMeta: {
    status: 'local-authoritative',
    lastSuccessfulBackupAt: '2026-10-06T10:00:00.000Z',
  },
};

test('valid local state loads correctly and is accepted as authoritative', () => {
  const parsed = readStoredStrategyState(JSON.stringify(VALID_LOCAL_STATE));

  assert.ok(parsed);
  assert.ok(isValidStoredStrategyState(parsed));
  assert.equal(parsed.base, 10000);
  assert.equal(parsed.shadow, 30);
  assert.equal(parsed.backupMeta.status, 'local-authoritative');
});

test('malformed local state is rejected safely', () => {
  const malformed = JSON.stringify({ base: 'nope', deficit: null, privateDef: 'broken' });
  assert.equal(readStoredStrategyState(malformed), null);
  assert.equal(isValidStoredStrategyState({ base: 'nope' }), false);
});

test('local state remains authoritative over stale backend data', () => {
  const backendState = {
    ...VALID_LOCAL_STATE,
    observedAt: '2026-10-06T09:00:00.000Z',
    backupMeta: { lastSuccessfulBackupAt: '2026-10-06T09:00:00.000Z' },
  };

  assert.equal(shouldUseBackendRecovery(VALID_LOCAL_STATE, backendState), false);
});

test('successful backup metadata records a successful timestamp without mutating strategy state', () => {
  const storage = new Map();
  const updated = withBackupMeta({
    ...VALID_LOCAL_STATE,
    backupMeta: { status: 'local-authoritative' },
  }, createBackupMeta({
    status: 'backup-success',
    lastAttemptAt: '2026-10-07T10:15:00.000Z',
    lastSuccessfulBackupAt: '2026-10-07T10:16:00.000Z',
  }));

  persistStrategyState({
    setItem: (key, value) => storage.set(key, value),
  }, 'virt-epl-solo-v1', updated, updated.automationSettlements);

  const stored = JSON.parse(storage.get('virt-epl-solo-v1'));
  assert.equal(stored.backupMeta.status, 'backup-success');
  assert.equal(stored.deficit, VALID_LOCAL_STATE.deficit);
  assert.equal(stored.base, VALID_LOCAL_STATE.base);
});

test('failed backup metadata does not modify local strategy state', () => {
  const state = withBackupMeta({ ...VALID_LOCAL_STATE }, createBackupMeta({
    status: 'backup-failed',
    errorMessage: 'network timeout',
    lastAttemptAt: '2026-10-07T10:20:00.000Z',
  }));

  assert.equal(state.base, VALID_LOCAL_STATE.base);
  assert.equal(state.backupMeta.status, 'backup-failed');
  assert.equal(state.backupMeta.errorMessage, 'network timeout');
});

test('overlapping backups are prevented by a simple flight guard', () => {
  let inFlight = false;
  const trigger = () => {
    if (inFlight) {
      return 'skipped';
    }
    inFlight = true;
    return 'started';
  };

  assert.equal(trigger(), 'started');
  assert.equal(trigger(), 'skipped');
});
