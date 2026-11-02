const assert = require('node:assert/strict');
const test = require('node:test');
const { ASSET_KEYS } = require('./strategy/catalogueaAdapter');
const { createCatalogueaAutomationPort } = require('../src/strategy/catalogueaAutomationPort');
const {
  persistStrategyState,
  settleSoloMatrixState,
} = require('../src/strategy/soloMatrixSettlement');

const FIXTURE = { id: 'livmnu', home: 'liv', away: 'mnu' };
const VERIFIED_RESULT = {
  fixture: FIXTURE,
  status: 'verified',
  result: { homeScore: 2, awayScore: 1 },
  timestamp: '2026-10-07T00:00:00.000Z',
  source: 'local_simulated_sportsbook',
};

function createStrategyState(overrides = {}) {
  return {
    fixture: { ...FIXTURE, winner: 325, oneX: 14.7 },
    baseStake: 10000,
    deficit: 0,
    winnerStake: 31,
    smallDeficit: 31,
    shadow: 20,
    bank: 100,
    privateDef: Object.fromEntries(ASSET_KEYS.map((key) => [key, 0])),
    bigDef: Object.fromEntries(ASSET_KEYS.map((key) => [key, 0])),
    brokenTarget: Object.fromEntries(ASSET_KEYS.map((key) => [key, 0])),
    gameStakes: Object.fromEntries(ASSET_KEYS.map((key) => [key, 0])),
    bigStakes: {},
    winners: new Set(['oneX']),
    bigWinners: new Set(['x2']),
    clicked: new Set(),
    automationSettlements: [],
    observedAt: '2026-10-07T00:00:00.000Z',
    ...overrides,
  };
}

function createHarness(initialState = createStrategyState()) {
  let strategyState = initialState;
  let settlementCalls = 0;
  const persisted = new Map();
  const port = createCatalogueaAutomationPort({
    readSnapshot: () => strategyState,
    settleStrategyResult: (normalizedResult, resultId, snapshot, actionOperationId) => {
      settlementCalls += 1;
      const settledState = settleSoloMatrixState(snapshot, ASSET_KEYS);
      const receipts = [
        ...snapshot.automationSettlements,
        {
          resultId,
          fixture: { ...snapshot.fixture },
          result: { ...normalizedResult.result },
          actionOperationId,
        },
      ];
      persistStrategyState(
        {
          setItem: (key, value) => persisted.set(key, value),
        },
        'virt-epl-solo-v1',
        settledState,
        receipts,
      );
      strategyState = {
        ...settledState,
        automationSettlements: receipts,
      };
      return {
        status: 'settled',
        resultId,
        strategyState: {
          status: 'settled',
          financialState: {
            baseStake: settledState.baseStake,
            deficit: settledState.deficit,
            smallDeficit: settledState.smallDeficit,
            shadow: settledState.shadow,
            bank: settledState.bank,
            privateDef: settledState.privateDef,
            bigDef: settledState.bigDef,
            brokenTarget: settledState.brokenTarget,
          },
        },
      };
    },
  });
  return {
    port,
    persisted,
    settlementCalls: () => settlementCalls,
    strategyState: () => strategyState,
  };
}

test('live-shaped strategy snapshot translates its precomputed stakes unchanged', () => {
  const state = createStrategyState({
    gameStakes: { ...Object.fromEntries(ASSET_KEYS.map((key) => [key, 0])), oneX: 217 },
    bigStakes: { x2: 19 },
  });
  const { port } = createHarness(state);

  const snapshot = port.getStrategySnapshot();
  const instruction = port.getCurrentInstruction();

  assert.equal(snapshot.fixture.id, 'livmnu');
  assert.deepEqual(instruction.assets.find(({ key }) => key === 'oneX'), {
    key: 'oneX',
    stake: 217,
    bigDeficitStake: 0,
  });
  assert.deepEqual(instruction.assets.find(({ key }) => key === 'x2'), {
    key: 'x2',
    stake: 0,
    bigDeficitStake: 19,
  });
  assert.equal(instruction.winnerStake, 31);
  assert.equal(instruction.fixture.odds.oneX, 14.7);
});

test('verified result runs the existing strategy settlement and persists it exactly once', () => {
  const harness = createHarness(createStrategyState({
    privateDef: { ...Object.fromEntries(ASSET_KEYS.map((key) => [key, 0])), oneX: 50 },
    bigDef: { ...Object.fromEntries(ASSET_KEYS.map((key) => [key, 0])), x2: 300 },
    brokenTarget: { ...Object.fromEntries(ASSET_KEYS.map((key) => [key, 0])), oneX: 25 },
    gameStakes: { ...Object.fromEntries(ASSET_KEYS.map((key) => [key, 0])), oneX: 12 },
  }));
  const request = {
    normalizedResult: VERIFIED_RESULT,
    actionOperationId: 'action-verified-1',
  };

  const first = harness.port.settleVerifiedResult(request);
  const second = harness.port.settleVerifiedResult(request);
  const stored = JSON.parse(harness.persisted.get('virt-epl-solo-v1'));

  assert.equal(first.status, 'settled');
  assert.equal(second.status, 'already_settled');
  assert.equal(first.resultId, 'livmnu:2-1:op:action-verified-1');
  assert.equal(harness.settlementCalls(), 1);
  assert.equal(harness.strategyState().smallDeficit, 0);
  assert.equal(harness.strategyState().privateDef.oneX, 0);
  assert.equal(harness.strategyState().brokenTarget.oneX, 0);
  assert.equal(harness.strategyState().bigDef.x2, 0);
  assert.equal(stored.base, 10000);
  assert.equal(stored.privateDef.oneX, 0);
  assert.equal(stored.automationSettlements.length, 1);
  assert.equal(stored.automationSettlements[0].actionOperationId, 'action-verified-1');
});

test('pending, malformed, and wrong-fixture results are rejected before strategy settlement', () => {
  const harness = createHarness();
  const invalidResults = [
    { ...VERIFIED_RESULT, status: 'pending' },
    { ...VERIFIED_RESULT, result: { homeScore: 2, awayScore: null } },
    {
      ...VERIFIED_RESULT,
      fixture: { id: 'livche', home: 'liv', away: 'che' },
    },
  ];

  for (const normalizedResult of invalidResults) {
    assert.throws(
      () => harness.port.settleVerifiedResult({
        normalizedResult,
        actionOperationId: 'action-verified-1',
      }),
    );
  }
  assert.equal(harness.settlementCalls(), 0);
  assert.equal(harness.persisted.size, 0);
});

test('verified scores do not invent strategy outcome marks', () => {
  const harness = createHarness(createStrategyState({
    winners: new Set(),
    bigWinners: new Set(),
  }));

  assert.throws(
    () => harness.port.settleVerifiedResult({
      normalizedResult: VERIFIED_RESULT,
      actionOperationId: 'action-verified-1',
    }),
    /score-to-asset mapping is not defined/,
  );
  assert.equal(harness.settlementCalls(), 0);
  assert.equal(harness.persisted.size, 0);
});

test('legacy strategy receipt remains idempotent for its original result', () => {
  const legacyState = createStrategyState({
    automationSettlements: ['livmnu:2-1'],
  });
  const harness = createHarness(legacyState);
  const result = harness.port.settleVerifiedResult({
    normalizedResult: VERIFIED_RESULT,
    actionOperationId: 'action-verified-1',
  });

  assert.equal(result.status, 'already_settled');
  assert.equal(harness.settlementCalls(), 0);
});

test('manual settlement still uses strategy-owned winner marks and existing settlement rules', () => {
  const manualState = createStrategyState({
    winners: new Set(['oneX', 'twoX']),
    gameStakes: {
      ...Object.fromEntries(ASSET_KEYS.map((key) => [key, 0])),
      oneX: 50,
      twoX: 25,
    },
  });

  const settled = settleSoloMatrixState(manualState, ASSET_KEYS);

  assert.equal(settled.smallDeficit, 0);
  assert.equal(settled.bank, 120);
  assert.equal(manualState.winners.size, 2);
  assert.equal(manualState.fixture.id, 'livmnu');
});

test('failed strategy persistence is not acknowledged as successful settlement', () => {
  const port = createCatalogueaAutomationPort({
    readSnapshot: createStrategyState,
    settleStrategyResult: () => {
      throw new Error('Cataloguea strategy persistence failed.');
    },
  });

  assert.throws(
    () => port.settleVerifiedResult({
      normalizedResult: VERIFIED_RESULT,
      actionOperationId: 'action-verified-1',
    }),
    /persistence failed/,
  );
});
