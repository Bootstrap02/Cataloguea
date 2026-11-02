const { ASSET_KEYS } = require('./catalogueaAdapter');
const { STRATEGY_PRIORITY } = require('./marketMappings');
const { submitSoloMatrixFixture } = require('../../src/strategy/soloMatrixSettlement');
const { STRATEGY_BET_TYPES, UNRESOLVED_MARKET, getMarketProposal } = require('./canonicalBetTypes');
const {
  MINIMUM_STAKE,
  STAKE_QUALIFICATION,
  evaluateMinimumStake,
  mergeNormalAndBigDeficitStakes,
} = require('./rules');
const {
  determineArsenalSide,
  resolveOrientedSelection,
} = require('./arsenalPerspective');

const OUTCOME_STATUSES = Object.freeze({
  QUALIFYING: 'QUALIFYING',
  SKIPPED_BELOW_MINIMUM: 'SKIPPED_BELOW_MINIMUM',
  UNRESOLVED_MARKET: 'UNRESOLVED_MARKET',
  NO_STAKE_CALCULATED: 'NO_STAKE_CALCULATED',
  FIXTURE_NOT_SUBMITTED: 'FIXTURE_NOT_SUBMITTED',
});

// Rule identifiers that produced each stake decision (see rules.js).
const STAKE_RULE_IDS = Object.freeze(['RULE-002', 'RULE-001']);

// Strategy fixtures (src/Scores.js rows) carry odds as flat properties
// (fixture.oneX, fixture.winner, ...). A nested fixture.odds object is also
// accepted. The flat shape is what the strategy itself consumes.
function readFixtureOdd(fixture, key) {
  const nested = fixture?.odds?.[key];
  const flat = fixture?.[key];
  const value = typeof nested === 'number' ? nested : flat;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toSet(value) {
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : []);
}

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
    const hasOdds = ASSET_KEYS.some((key) => typeof fixture[key] === 'number')
      || typeof fixture.winner === 'number';
    if (!hasOdds) {
      throw new Error('A fixture with odds is required for stake evaluation.');
    }
    // The existing strategy owns every stake formula. Nothing is recomputed here.
    return submitSoloMatrixFixture(state, fixture, ASSET_KEYS);
  }

  function getStakeForAsset(submittedState, assetKey) {
    if (assetKey === 'winner') {
      return { normal: submittedState.winnerStake ?? 0, big: 0 };
    }
    return {
      normal: submittedState.gameStakes?.[assetKey] ?? 0,
      big: submittedState.bigStakes?.[assetKey] ?? 0,
    };
  }

  // A verified mapping may name the selection per Arsenal position (selectionBySide). If
  // the position is unknown the option stays unresolved; nothing is guessed.
  function getBetKingMarketInfo(assetKey, arsenalSide = null) {
    const betType = STRATEGY_BET_TYPES.find((bt) => bt.strategyKey === assetKey);
    if (!betType) return { status: UNRESOLVED_MARKET, market: null, selection: null };

    const override = betKingMarketMappings[assetKey];
    const mapping = override && typeof override === 'object' ? override : betType.betKing;
    const market = mapping.market ?? mapping.category ?? null;
    const category = mapping.category ?? mapping.market ?? null;
    let selection = mapping.selection ?? null;
    let status = mapping.status;
    if (mapping.selectionBySide) {
      selection = mapping.selectionBySide[arsenalSide] ?? null;
      if (!selection) status = UNRESOLVED_MARKET;
    }
    return {
      status,
      market,
      category,
      selection,
      canonicalId: betType.canonicalId,
      strategyLabel: betType.strategyLabel,
      semanticsStatus: betType.semanticsStatus,
    };
  }

  // Order of decisions (explicit so every rejection is explainable):
  //   1. combine normal + big-deficit components of THIS option (RULE-002)
  //   2. no stake -> NO_STAKE_CALCULATED
  //   3. minimum stake on the combined amount (RULE-001)
  //   4. market mapping
  function determineInstructionStatus(stakeInfo, betKingMapping) {
    const merged = mergeNormalAndBigDeficitStakes(stakeInfo.normal, stakeInfo.big);

    if (merged.combined <= 0) {
      return {
        merged,
        stakeQualification: null,
        stakeEligible: false,
        status: OUTCOME_STATUSES.NO_STAKE_CALCULATED,
        reason: 'No stake was calculated for this asset.',
      };
    }

    const qualification = evaluateMinimumStake(merged.combined);
    if (qualification.status !== STAKE_QUALIFICATION.QUALIFIES) {
      return {
        merged,
        stakeQualification: qualification.status,
        stakeEligible: false,
        status: OUTCOME_STATUSES.SKIPPED_BELOW_MINIMUM,
        reason: qualification.reason,
      };
    }

    if (betKingMapping.status === UNRESOLVED_MARKET) {
      return {
        merged,
        stakeQualification: qualification.status,
        stakeEligible: true,
        status: OUTCOME_STATUSES.UNRESOLVED_MARKET,
        reason: 'Stake qualifies, but no verified BetKing market mapping exists for this option.',
      };
    }

    return {
      merged,
      stakeQualification: qualification.status,
      stakeEligible: true,
      status: OUTCOME_STATUSES.QUALIFYING,
      reason: `Stake ${merged.combined} meets minimum and market mapping is resolved.`,
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
      clicked: toSet(snapshot.clicked),
      winners: toSet(snapshot.winners),
      bigWinners: toSet(snapshot.bigWinners),
    };

    const submitted = evaluateStakes(state, fixture);
    const arsenal = determineArsenalSide(fixture);

    // Options are listed in the owner's order of play (winner first, ft41 last).
    const instructions = STRATEGY_PRIORITY.map((assetKey) => {
      const stakeInfo = getStakeForAsset(submitted, assetKey);
      const betKingInfo = getBetKingMarketInfo(assetKey, arsenal.side);
      const decision = determineInstructionStatus(stakeInfo, betKingInfo);
      const oriented = resolveOrientedSelection(assetKey, arsenal.side);

      return {
        strategyKey: assetKey,
        strategyLabel: betKingInfo.strategyLabel,
        canonicalId: betKingInfo.canonicalId,
        semanticsStatus: betKingInfo.semanticsStatus,
        stake: decision.merged.combined,
        normalStake: decision.merged.normal,
        bigDeficitStake: decision.merged.big,
        odds: readFixtureOdd(fixture, assetKey),
        betKingMarket: betKingInfo.market,
        betKingCategory: betKingInfo.category ?? null,
        betKingSelection: betKingInfo.selection,
        orientedSelection: oriented.oriented ? oriented.selection : null,
        arsenalSide: arsenal.side,
        stakeQualification: decision.stakeQualification,
        stakeEligible: decision.stakeEligible,
        ruleIds: STAKE_RULE_IDS,
        status: decision.status,
        reason: decision.reason,
        betKingMappingStatus: betKingInfo.status,
        // Visible-in-video proposal (never verified): shown for review, never acted on.
        marketProposal: getMarketProposal(assetKey, arsenal.side),
      };
    });

    return {
      status: 'OK',
      fixture: {
        id: fixture.id,
        home: fixture.home,
        away: fixture.away,
      },
      arsenal,
      winnerStake: submitted.winnerStake,
      instructions,
      recommendedAction: snapshot.recommendedAction,
      observedAt: snapshot.observedAt,
    };
  }

  function getCurrentInstructions() {
    const snapshot = readStrategySnapshot();
    return buildInstructions(snapshot);
  }

  // For readers that return a Promise (a snapshot read through the browser page).
  async function getCurrentInstructionsAsync() {
    const snapshot = await readStrategySnapshot();
    return buildInstructions(snapshot);
  }

  return Object.freeze({
    getCurrentInstructions,
    getCurrentInstructionsAsync,
    MINIMUM_STAKE,
    OUTCOME_STATUSES,
  });
}

module.exports = { createStrategyDecisionAdapter, MINIMUM_STAKE, OUTCOME_STATUSES };
