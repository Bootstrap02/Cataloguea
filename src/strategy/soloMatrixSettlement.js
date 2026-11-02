function submitSoloMatrixFixture(state, fixture, assetKeys) {
  const baseStake = state.baseStake + state.deficit;
  const winnerStake = Math.max(Math.round(baseStake / fixture.winner), 10);
  const smallDeficit = state.smallDeficit + winnerStake;
  const gameStakes = Object.fromEntries(assetKeys.map((key) => {
    const odd = fixture[key] || 0;
    const stake = odd > 1.01
      ? Math.round(((state.brokenTarget[key] || 0) + smallDeficit
        + (state.privateDef[key] || 0)) / (odd - 1))
      : 0;
    return [key, stake];
  }));

  const bigStakes = {};
  const brokenTarget = { ...state.brokenTarget };
  assetKeys.forEach((key) => {
    if ((state.bigDef[key] || 0) === 0) return;
    const odd = fixture[key] || 0;
    if (odd > 1.01) {
      bigStakes[key] = Math.round(state.bigDef[key] / odd);
      const share = Math.floor(bigStakes[key] / 10);
      if (share > 0) {
        assetKeys.forEach((assetKey) => {
          brokenTarget[assetKey] = (brokenTarget[assetKey] || 0) + share;
        });
      }
    }
  });

  return {
    ...state,
    fixture,
    baseStake,
    deficit: 0,
    winnerStake,
    smallDeficit,
    shadow: smallDeficit,
    gameStakes,
    bigStakes,
    brokenTarget,
    winners: new Set(),
    bigWinners: new Set(),
    clicked: new Set(),
  };
}

function applySoloMatrixJackpot(state) {
  return {
    ...state,
    baseStake: 10000,
    deficit: 0,
    smallDeficit: 0,
    shadow: 0,
    clicked: new Set([...state.clicked, 'six']),
  };
}

function settleSoloMatrixState(state, assetKeys) {
  if (!state.fixture) return null;

  let smallDeficit = state.smallDeficit;
  let shadow = state.shadow;
  let bank = state.bank;
  let deficit = state.deficit;
  let baseStake = state.baseStake;
  const privateDef = { ...state.privateDef };
  const bigDef = { ...state.bigDef };
  const brokenTarget = { ...state.brokenTarget };

  assetKeys.forEach((key) => {
    if (state.bigWinners.has(key)) {
      bigDef[key] = 0;
    }
  });

  let firstWin = true;
  const shadowPayout = shadow;

  assetKeys.forEach((key) => {
    const stake = state.gameStakes[key] || 0;

    if (state.winners.has(key)) {
      privateDef[key] = 0;
      brokenTarget[key] = 0;

      if (firstWin) {
        smallDeficit = 0;
        firstWin = false;
      } else {
        bank += shadowPayout;
        shadow = 0;
        smallDeficit = 0;
      }
    } else {
      privateDef[key] = (privateDef[key] || 0) + stake;

      if (privateDef[key] >= 1000) {
        if (bank > 0) {
          const reduction = Math.min(bank, 500);
          bank -= reduction;
          privateDef[key] -= reduction;
        }
        bigDef[key] = (bigDef[key] || 0) + privateDef[key];
        privateDef[key] = 0;
      }
    }
  });

  assetKeys.forEach((key) => {
    if ((brokenTarget[key] || 0) >= 1000) {
      baseStake += brokenTarget[key];
      brokenTarget[key] = 0;
    }
  });

  return {
    baseStake,
    deficit,
    smallDeficit,
    shadow,
    bank,
    privateDef,
    bigDef,
    brokenTarget,
    fixture: null,
    gameStakes: Object.fromEntries(assetKeys.map((key) => [key, 0])),
    bigStakes: {},
    winners: new Set(),
    bigWinners: new Set(),
    clicked: new Set(),
    winnerStake: 0,
  };
}

function persistStrategyState(storage, key, state, automationSettlements) {
  const persisted = {
    base: state.baseStake ?? state.base,
    deficit: state.deficit,
    smallDeficit: state.smallDeficit,
    shadow: state.shadow,
    bank: state.bank,
    privateDef: state.privateDef,
    bigDef: state.bigDef,
    brokenTarget: state.brokenTarget,
    automationSettlements: [...automationSettlements],
    backupMeta: state.backupMeta || {},
    observedAt: state.observedAt || new Date().toISOString(),
  };
  storage.setItem(key, JSON.stringify(persisted));
  return persisted;
}

module.exports = {
  applySoloMatrixJackpot,
  persistStrategyState,
  settleSoloMatrixState,
  submitSoloMatrixFixture,
};
