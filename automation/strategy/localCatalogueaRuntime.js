const { ASSET_KEYS } = require('./catalogueaAdapter');
const { createCatalogueaAutomationPort } = require('../../src/strategy/catalogueaAutomationPort');
const {
  applySoloMatrixJackpot,
  persistStrategyState,
  settleSoloMatrixState,
  submitSoloMatrixFixture,
} = require('../../src/strategy/soloMatrixSettlement');

const STORAGE_KEY = 'virt-epl-solo-v1';

function emptyAssetMap() {
  return Object.fromEntries(ASSET_KEYS.map((key) => [key, 0]));
}

function copySnapshot(snapshot) {
  return {
    ...snapshot,
    fixture: snapshot.fixture ? { ...snapshot.fixture } : null,
    privateDef: { ...snapshot.privateDef },
    bigDef: { ...snapshot.bigDef },
    brokenTarget: { ...snapshot.brokenTarget },
    gameStakes: { ...snapshot.gameStakes },
    bigStakes: { ...snapshot.bigStakes },
    winners: new Set(snapshot.winners),
    bigWinners: new Set(snapshot.bigWinners),
    clicked: new Set(snapshot.clicked),
    automationSettlements: snapshot.automationSettlements.map((receipt) => ({
      ...receipt,
      fixture: receipt.fixture ? { ...receipt.fixture } : undefined,
      result: receipt.result ? { ...receipt.result } : undefined,
    })),
  };
}

function createLocalCatalogueaRuntime({
  fixture,
  financialState = {},
  storage = new Map(),
} = {}) {
  if (!fixture || typeof fixture.id !== 'string') {
    throw new TypeError('A real Cataloguea fixture is required for the local strategy runtime.');
  }

  const storageAdapter = {
    getItem: (key) => (
      typeof storage.getItem === 'function' ? storage.getItem(key) : storage.get(key) ?? null
    ),
    setItem: (key, value) => (
      typeof storage.setItem === 'function' ? storage.setItem(key, value) : storage.set(key, value)
    ),
  };
  const persisted = storageAdapter.getItem(STORAGE_KEY);
  const persistedState = persisted ? JSON.parse(persisted) : {};
  let state = {
    fixture: null,
    baseStake: persistedState.base ?? financialState.baseStake ?? 10000,
    deficit: persistedState.deficit ?? financialState.deficit ?? 0,
    winnerStake: 0,
    smallDeficit: persistedState.smallDeficit ?? financialState.smallDeficit ?? 0,
    shadow: persistedState.shadow ?? financialState.shadow ?? 0,
    bank: persistedState.bank ?? financialState.bank ?? 0,
    privateDef: {
      ...emptyAssetMap(),
      ...(financialState.privateDef || persistedState.privateDef),
    },
    bigDef: {
      ...emptyAssetMap(),
      ...(financialState.bigDef || persistedState.bigDef),
    },
    brokenTarget: {
      ...emptyAssetMap(),
      ...(financialState.brokenTarget || persistedState.brokenTarget),
    },
    gameStakes: emptyAssetMap(),
    bigStakes: {},
    winners: new Set(),
    bigWinners: new Set(),
    clicked: new Set(),
    automationSettlements: Array.isArray(persistedState.automationSettlements)
      ? persistedState.automationSettlements
      : [],
    observedAt: new Date().toISOString(),
  };

  function persist(nextState, receipts = nextState.automationSettlements) {
    return persistStrategyState(storageAdapter, STORAGE_KEY, nextState, receipts);
  }

  function submitFixture(nextFixture = fixture) {
    state = submitSoloMatrixFixture(state, nextFixture, ASSET_KEYS);
    return copySnapshot(state);
  }

  function applyJackpot() {
    state = applySoloMatrixJackpot(state);
    persist(state);
    return copySnapshot(state);
  }

  function recordManualOutcomeMarks({ winners = [], bigWinners = [] } = {}) {
    if (!state.fixture) {
      throw new Error('Manual strategy outcome marks require an active fixture.');
    }
    state = {
      ...state,
      winners: new Set(winners),
      bigWinners: new Set(bigWinners),
    };
  }

  const strategyPort = createCatalogueaAutomationPort({
    readSnapshot: () => copySnapshot(state),
    settleStrategyResult: (normalizedResult, resultId, snapshot, actionOperationId) => {
      const settledState = settleSoloMatrixState(snapshot, ASSET_KEYS);
      const receipts = [
        ...snapshot.automationSettlements,
        {
          resultId,
          fixture: {
            id: snapshot.fixture.id,
            home: snapshot.fixture.home,
            away: snapshot.fixture.away,
          },
          result: { ...normalizedResult.result },
          actionOperationId,
        },
      ];
      persist(settledState, receipts);
      state = { ...settledState, automationSettlements: receipts };
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
            privateDef: { ...settledState.privateDef },
            bigDef: { ...settledState.bigDef },
            brokenTarget: { ...settledState.brokenTarget },
          },
        },
      };
    },
  });

  return Object.freeze({
    applyJackpot,
    getCurrentInstruction: () => strategyPort.getCurrentInstruction(),
    getStrategySnapshot: () => strategyPort.getStrategySnapshot(),
    recordManualOutcomeMarks,
    storage: storageAdapter,
    strategyPort,
    submitFixture,
  });
}

module.exports = { STORAGE_KEY, createLocalCatalogueaRuntime };
