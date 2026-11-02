const test = require('node:test');
const assert = require('node:assert/strict');
const { createCatalogueaAutomationPort } = require('../../src/strategy/catalogueaAutomationPort');
const { createStakeFingerprint } = require('./operationalWorkflow');
const {
  SETTLEMENT_STATUS,
  buildNormalizedResult,
  createOperationId,
  settlePlannedFixture,
} = require('./settlementIntegration');

const STRATEGY_FIXTURE = { id: 'arsmnu', home: 'ars', away: 'mnu' };

function record(strategyKey, normal, big, extra = {}) {
  return {
    strategyKey,
    stake: normal + big,
    stakeComponents: { normal, bigDeficit: big, combined: normal + big },
    mappingStatus: 'UNRESOLVED_MARKET',
    semanticsStatus: 'USER_SPECIFIED',
    lifecycle: { accepted: false },
    reason: '',
    ...extra,
  };
}

function createPlan({ week = 5 } = {}) {
  const oneX = record('oneX', 150, 1050);
  const twoX = record('twoX', 40, 0);
  const ht12 = record('ht12', 4, 0, { stakeQualification: 'SKIPPED_BELOW_MINIMUM', reason: 'Stake 4 is below the minimum of 10.' });
  const all = [oneX, twoX, ht12];
  return {
    week,
    fixture: { fixtureId: 'matchup-statistics-button-ARS-MNU', home: 'ARS', away: 'MNU' },
    strategyFixture: STRATEGY_FIXTURE,
    arsenalSide: 'HOME',
    observedAt: '2026-10-12T10:00:00.000Z',
    allRecords: all,
    eligible: [oneX, twoX],
    skipped: [ht12],
    stakeFingerprint: createStakeFingerprint('arsmnu', all.map((r) => ({
      strategyKey: r.strategyKey, normal: r.stakeComponents.normal, big: r.stakeComponents.bigDeficit,
    }))),
  };
}

function createInstructions({ bigOneX = 1050 } = {}) {
  return () => ({
    status: 'OK',
    fixture: STRATEGY_FIXTURE,
    instructions: [
      { strategyKey: 'oneX', normalStake: 150, bigDeficitStake: bigOneX },
      { strategyKey: 'twoX', normalStake: 40, bigDeficitStake: 0 },
      { strategyKey: 'ht12', normalStake: 4, bigDeficitStake: 0 },
    ],
  });
}

function createFakeStrategy({ manualWinners = [] } = {}) {
  const state = {
    receipts: [],
    settleCalls: [],
    snapshot: () => ({
      fixture: { ...STRATEGY_FIXTURE },
      winners: [...manualWinners],
      bigWinners: [],
      automationSettlements: [...state.receipts],
    }),
  };
  state.port = createCatalogueaAutomationPort({
    readSnapshot: () => state.snapshot(),
    settleStrategyResult: (normalizedResult, resultId, snapshot, actionOperationId, marks) => {
      state.settleCalls.push({ resultId, actionOperationId, marks });
      state.receipts.push({
        resultId,
        fixture: { ...STRATEGY_FIXTURE },
        result: normalizedResult.result,
        actionOperationId,
      });
      return { status: 'settled' };
    },
  });
  return state;
}

const VERIFIED = { status: 'verified', halfTime: { home: 1, away: 0 }, fullTime: { home: 2, away: 2 } };

test('createOperationId is deterministic and needs every part', () => {
  const input = { week: 5, fixtureId: 'arsmnu', planObservedAt: '2026-10-12T10:00:00.000Z' };
  assert.equal(createOperationId(input), createOperationId({ ...input }));
  assert.notEqual(createOperationId(input), createOperationId({ ...input, week: 6 }));
  assert.throws(() => createOperationId({ week: 5, fixtureId: 'arsmnu' }));
});

test('buildNormalizedResult keeps half time separate from the full-time score fields', () => {
  const normalized = buildNormalizedResult({ strategyFixture: STRATEGY_FIXTURE, verifiedResult: VERIFIED, source: 'test' });
  assert.deepEqual(normalized.result, { homeScore: 2, awayScore: 2, halfTime: { home: 1, away: 0 } });
  assert.throws(() => buildNormalizedResult({
    strategyFixture: STRATEGY_FIXTURE,
    verifiedResult: { status: 'verified', halfTime: { home: 1, away: 0 }, fullTime: null },
  }));
});

test('settlePlannedFixture settles once through the strategy port with evaluated marks', async () => {
  const strategy = createFakeStrategy();
  const outcome = await settlePlannedFixture({
    plan: createPlan(),
    verifiedResult: VERIFIED,
    strategyPort: strategy.port,
    getCurrentInstructions: createInstructions(),
  });
  assert.equal(outcome.status, SETTLEMENT_STATUS.SETTLED);
  assert.equal(outcome.persistenceVerified, true);
  assert.equal(strategy.settleCalls.length, 1);
  // Merged oneX bet won both components; the skipped ht12 option gets no marks.
  assert.deepEqual(strategy.settleCalls[0].marks, { winners: ['oneX'], bigWinners: ['oneX'] });
  assert.equal(outcome.next.status, 'WAIT_FOR_NEXT_FIXTURE');
  assert.equal(outcome.next.nextWeek, 6);
});

test('settlePlannedFixture is idempotent when the same result is submitted again', async () => {
  const strategy = createFakeStrategy();
  const input = {
    plan: createPlan(),
    verifiedResult: VERIFIED,
    strategyPort: strategy.port,
    getCurrentInstructions: createInstructions(),
  };
  await settlePlannedFixture(input);
  const second = await settlePlannedFixture({ ...input, getCurrentInstructions: () => ({ status: 'OK', fixture: null, instructions: [] }) });
  assert.equal(second.status, SETTLEMENT_STATUS.ALREADY_SETTLED);
  assert.equal(strategy.settleCalls.length, 1);
});

test('settlePlannedFixture refuses to settle stale strategy decisions', async () => {
  const strategy = createFakeStrategy();
  const outcome = await settlePlannedFixture({
    plan: createPlan(),
    verifiedResult: VERIFIED,
    strategyPort: strategy.port,
    getCurrentInstructions: createInstructions({ bigOneX: 0 }),
  });
  assert.equal(outcome.status, SETTLEMENT_STATUS.STALE_STRATEGY_STATE);
  assert.equal(strategy.settleCalls.length, 0);
});

test('settlePlannedFixture does not settle when an option cannot be decided', async () => {
  const strategy = createFakeStrategy();
  const plan = createPlan();
  plan.eligible.push(record('mystery', 31, 0));
  const outcome = await settlePlannedFixture({
    plan,
    verifiedResult: VERIFIED,
    strategyPort: strategy.port,
    getCurrentInstructions: createInstructions(),
  });
  assert.equal(outcome.status, SETTLEMENT_STATUS.NOT_READY);
  assert.ok(outcome.blockers.some((blocker) => blocker.strategyKey === 'mystery'));
  assert.equal(strategy.settleCalls.length, 0);
});

test('settlePlannedFixture does not settle an unverified result', async () => {
  const strategy = createFakeStrategy();
  const outcome = await settlePlannedFixture({
    plan: createPlan(),
    verifiedResult: { status: 'observing' },
    strategyPort: strategy.port,
    getCurrentInstructions: createInstructions(),
  });
  assert.equal(outcome.status, SETTLEMENT_STATUS.NOT_READY);
  assert.equal(strategy.settleCalls.length, 0);
});

test('settlePlannedFixture reports SETTLEMENT_UNKNOWN and blocks the week when the port fails', async () => {
  const strategy = createFakeStrategy({ manualWinners: ['oneX'] });
  const outcome = await settlePlannedFixture({
    plan: createPlan(),
    verifiedResult: VERIFIED,
    strategyPort: strategy.port,
    getCurrentInstructions: createInstructions(),
  });
  // Manual marks already exist, so the port refuses to mix them with evaluated marks.
  assert.equal(outcome.status, SETTLEMENT_STATUS.SETTLEMENT_UNKNOWN);
  assert.equal(outcome.next.status, 'BLOCKED');
  assert.equal(strategy.settleCalls.length, 0);
});

test('the strategy port still requires manual marks when no evaluated marks are supplied', async () => {
  const strategy = createFakeStrategy();
  const normalizedResult = buildNormalizedResult({ strategyFixture: STRATEGY_FIXTURE, verifiedResult: VERIFIED });
  assert.throws(
    () => strategy.port.settleVerifiedResult({ normalizedResult, actionOperationId: 'op-1' }),
    /requires an existing manual outcome mark/,
  );
});

test('the strategy port rejects unknown keys in evaluated marks', () => {
  const strategy = createFakeStrategy();
  const normalizedResult = buildNormalizedResult({ strategyFixture: STRATEGY_FIXTURE, verifiedResult: VERIFIED });
  assert.throws(
    () => strategy.port.settleVerifiedResult({
      normalizedResult,
      actionOperationId: 'op-2',
      marks: { winners: ['notAKey'], bigWinners: [] },
    }),
    /unknown strategy key/,
  );
});
