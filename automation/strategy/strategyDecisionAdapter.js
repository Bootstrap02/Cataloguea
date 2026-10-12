const { ASSET_KEYS } = require('./catalogueaAdapter');
const { submitSoloMatrixFixture } = require('../../src/strategy/soloMatrixSettlement');
const { STRATEGY_BET_TYPES, UNRESOLVED_MARKET } = require('./canonicalBetTypes');

const MINIMUM_STAKE = 10;

const OUTCOME_STATUSES = Object.freeze({
  QUALIFYING: 'QUALIFYING',
  SKIPPED_BELOW_MINIMUM: 'SKIPPED_BELOW_MINIMUM',
  UNRESOLVED_MARKET: 'UNRESOLVED_MARKET',
  NO_STAKE_CALCULATED: 'NO_STAKE_CALCULATED',
  FIXTURE_NOT_SUBMITTED: 'FIXTURE_NOT_SUBMITTED',
});

function createStrategyDecisionAdapter({
  readStrategySnapshot,
  betKingMarketMappings = {},
} = {}) {
  if (typeof readStrategySnapshot !== 'function') {
    throw new TypeError('A strategy snapshot reader function is required.');
  }

  function evaluateStakes(state, fixture) {
    if (!fixture) {
      throw new Error('A fixture is required for stake evaluation.');
    }
    // The fixture from the strategy has odds as direct properties (winner, oneX, twoX, etc.)
    // Check if at least some odds are present
    const hasOdds = ASSET_KEYS.some((key) => typeof fixture[key] === 'number') || typeof fixture.winner === 'number';
    if (!hasOdds) {
      throw new Error('A fixture with odds is required for stake evaluation.');
    }
    const submitted = submitSoloMatrixFixture(state, fixture, ASSET_KEYS);
    return submitted;
  }

  function getStakeForAsset(submittedState, assetKey) {
    const normalStake = submittedState.gameStakes?.[assetKey] ?? 0;
    const bigStake = submittedState.bigStakes?.[assetKey] ?? 0;
    return { normal: normalStake, big: bigStake, total: normalStake + bigStake };
  }

  function determineInstructionStatus(assetKey, stakeInfo, betKingMapping) {
    const totalStake = stakeInfo.total;

    if (totalStake <= 0) {
      return {
        status: OUTCOME_STATUSES.NO_STAKE_CALCULATED,
        reason: 'No stake was calculated for this asset.',
      };
    }

    if (totalStake < MINIMUM_STAKE) {
      return {
        status: OUTCOME_STATUSES.SKIPPED_BELOW_MINIMUM,
        reason: `Stake ${totalStake} is below the minimum of ${MINIMUM_STAKE}.`,
      };
    }

    const mapping = betKingMapping[assetKey] ?? { status: UNRESOLVED_MARKET };
    if (mapping.status === UNRESOLVED_MARKET) {
      return {
        status: OUTCOME_STATUSES.UNRESOLVED_MARKET,
        reason: `No verified BetKing market mapping exists for ${assetKey}.`,
      };
    }

    return {
      status: OUTCOME_STATUSES.QUALIFYING,
      reason: `Stake ${totalStake} meets minimum and market mapping is resolved.`,
    };
  }

  function getBetKingMarketInfo(assetKey) {
    const betType = STRATEGY_BET_TYPES.find((bt) => bt.strategyKey === assetKey);
    if (!betType) return { status: UNRESOLVED_MARKET, market: null, selection: null };

    const mapping = betType.betKing;
    return {
      status: mapping.status,
      market: mapping.market,
      selection: mapping.selection,
      canonicalId: betType.canonicalId,
      strategyLabel: betType.strategyLabel,
    };
  }

  function buildInstructions(snapshot) {
    const fixture = snapshot.fixture;
    if (!fixture) {
      return {
        status: OUTCOME_STATUSES.FIXTURE_NOT_SUBMITTED,
        reason: 'No active fixture in strategy state.',
        instructions: [],
        fixture: null,
        winnerStake: snapshot.winnerStake ?? 0,
      };
    }

    const state = {
      baseStake: snapshot.baseStake ?? 0,
      deficit: snapshot.deficit ?? 0,
      smallDeficit: snapshot.smallDeficit ?? 0,
      privateDef: snapshot.privateDef ?? {},
      bigDef: snapshot.bigDef ?? {},
      brokenTarget: snapshot.brokenTarget ?? {},
      clicked: snapshot.clicked ?? new Set(),
      winners: snapshot.winners ?? new Set(),
      bigWinners: snapshot.bigWinners ?? new Set(),
    };

    const submitted = evaluateStakes(state, fixture);

    const instructions = ASSET_KEYS.map((assetKey) => {
      const stakeInfo = getStakeForAsset(submitted, assetKey);
      const betKingInfo = getBetKingMarketInfo(assetKey);
      const statusResult = determineInstructionStatus(assetKey, stakeInfo, betKingInfo);

      return {
        strategyKey: assetKey,
        strategyLabel: betKingInfo.strategyLabel,
        canonicalId: betKingInfo.canonicalId,
        stake: stakeInfo.total,
        normalStake: stakeInfo.normal,
        bigDeficitStake: stakeInfo.big,
        odds: fixture.odds?.[assetKey] ?? null,
        betKingMarket: betKingInfo.market,
        betKingSelection: betKingInfo.selection,
        status: statusResult.status,
        reason: statusResult.reason,
        betKingMappingStatus: betKingInfo.status,
      };
    });

    const winnerStake = Math.max(Math.round((state.baseStake + state.deficit) / (fixture.odds?.winner ?? 1)), 10);
    const winnerStatus = winnerStake < MINIMUM_STAKE
      ? OUTCOME_STATUSES.SKIPPED_BELOW_MINIMUM
      : OUTCOME_STATUSES.QUALIFYING;
    const winnerReason = winnerStake < MINIMUM_STAKE
      ? `Winner stake ${winnerStake} is below minimum ${MINIMUM_STAKE}.`
      : `Winner stake ${winnerStake} meets minimum.`;

    const winnerInstruction = {
      strategyKey: 'winner',
      strategyLabel: '6–0',
      canonicalId: 'SCORE_6_0',
      stake: winnerStake,
      normalStake: winnerStake,
      bigDeficitStake: 0,
      odds: fixture.odds?.winner ?? null,
      betKingMarket: null,
      betKingSelection: null,
      status: winnerStatus,
      reason: winnerReason,
      betKingMappingStatus: UNRESOLVED_MARKET,
    };

    return {
      status: 'OK',
      fixture: {
        id: fixture.id,
        home: fixture.home,
        away: fixture.away,
      },
      winnerStake,
      instructions: [winnerInstruction, ...instructions],
      recommendedAction: snapshot.recommendedAction,
      observedAt: snapshot.observedAt,
    };
  }

  function getCurrentInstructions() {
    const snapshot = readStrategySnapshot();
    return buildInstructions(snapshot);
  }

  return Object.freeze({
    getCurrentInstructions,
    MINIMUM_STAKE,
    OUTCOME_STATUSES,
  });
}

module.exports = { createStrategyDecisionAdapter, MINIMUM_STAKE, OUTCOME_STATUSES };