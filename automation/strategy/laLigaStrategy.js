// The La Liga strategy engine: two independent 6-0 "winners" (Barcelona and Real Madrid) protected by up to 20
// half-time/full-time options (each team's own 1/X when at home, 2/X when away). Pure maths and a state shape;
// no browser and no file access. The rules are the existing solo-matrix rules (src/strategy/soloMatrixSettlement.js)
// with ONE change: the single winner (Arsenal, base 10000) becomes several winners, each with its OWN base and its
// OWN running cost, so each clears only its own burden when it hits. With ONE winner and base 10000 this engine
// gives exactly the same stakes and states as the original (the tests prove it round by round).
//
// All numbers are plain integers/naira. Odds are whatever was read from the page that round.

const MIN_STAKE = 10;

function createState({ baseStake = 10000, winners = ['BAR', 'RMA'] } = {}) {
  const share = baseStake / winners.length;
  return {
    winners: [...winners],
    startBase: share,
    bases: Object.fromEntries(winners.map((code) => [code, share])),   // each winner's own target
    smallDeficits: Object.fromEntries(winners.map((code) => [code, 0])), // each winner's own accumulated cost
    shadow: 0,
    bank: 0,
    privateDef: {},
    bigDef: {},
    brokenTarget: {},
    open: null,            // the round that has been planned but not yet settled
    settledRounds: [],     // receipts, so one round is never settled twice
  };
}

const sum = (object) => Object.values(object).reduce((total, value) => total + value, 0);

// Plan one round. winnerOdds: { BAR: 61, RMA: 48 }. teamOdds: { RMA: 14.2, BAR: 16, ... } (the 1/X or 2/X odds).
function planRound(state, { roundId, winnerOdds, teamOdds }) {
  if (state.open) throw new Error(`Round ${state.open.roundId} is still open; settle or discard it first.`);
  const winnerStakes = {};
  const smallDeficits = { ...state.smallDeficits };
  for (const code of state.winners) {
    const odd = winnerOdds[code] || 0;
    winnerStakes[code] = odd > 1.01 ? Math.max(Math.round(state.bases[code] / odd), MIN_STAKE) : 0;
    smallDeficits[code] += winnerStakes[code];
  }
  const totalCost = sum(smallDeficits);
  const keys = Object.keys(teamOdds);
  const gameStakes = {};
  for (const key of keys) {
    const odd = teamOdds[key] || 0;
    gameStakes[key] = odd > 1.01
      ? Math.round(((state.brokenTarget[key] || 0) + totalCost + (state.privateDef[key] || 0)) / (odd - 1))
      : 0;
  }
  // Big deficits add a "big" stake and raise every option's target (the original's brokenTarget rule).
  const bigStakes = {};
  const brokenTarget = { ...state.brokenTarget };
  for (const key of keys) {
    if ((state.bigDef[key] || 0) === 0) continue;
    const odd = teamOdds[key] || 0;
    if (odd > 1.01) {
      bigStakes[key] = Math.round(state.bigDef[key] / odd);
      const share = Math.floor(bigStakes[key] / 10);
      if (share > 0) for (const other of keys) brokenTarget[other] = (brokenTarget[other] || 0) + share;
    }
  }
  const options = {};
  for (const key of keys) {
    const normal = gameStakes[key];
    const big = bigStakes[key] || 0;
    const final = normal + big;
    options[key] = { normal, big, stake: final, odds: teamOdds[key] || 0, playable: final >= MIN_STAKE };
  }
  const winnerPlans = {};
  for (const code of state.winners) {
    winnerPlans[code] = { stake: winnerStakes[code], odds: winnerOdds[code] || 0, playable: winnerStakes[code] >= MIN_STAKE };
  }
  return {
    ...state,
    smallDeficits,
    shadow: totalCost,
    brokenTarget,
    open: { roundId, winnerStakes, gameStakes, bigStakes, options, winnerPlans, previous: { smallDeficits: state.smallDeficits, brokenTarget: state.brokenTarget, shadow: state.shadow } },
  };
}

// After the bets: a winner whose bet was NOT placed never cost anything, so its stake leaves the running cost.
function markPlacement(state, { placedWinners = [], placed = [], round = null }) {
  if (!state.open) throw new Error('No open round.');
  const smallDeficits = { ...state.smallDeficits };
  for (const code of state.winners) {
    if (!placedWinners.includes(code)) smallDeficits[code] -= state.open.winnerStakes[code] || 0;
  }
  return { ...state, smallDeficits, open: { ...state.open, placedWinners: [...placedWinners], placed, round } };
}

// Settle the open round. winnersHit: winners whose 6-0 came in (and were placed). teamWinners: options that won AND
// were placed. bigWinners: options whose "big" stake won. Options that were not placed settle as non-winning.
function settleRound(state, { winnersHit = [], teamWinners = [], bigWinners = [] }) {
  if (!state.open) throw new Error('No open round to settle.');
  const round = state.open;
  if (state.settledRounds.includes(round.roundId)) throw new Error(`Round ${round.roundId} was already settled.`);
  const winSet = new Set(teamWinners);
  let smallDeficits = { ...state.smallDeficits };
  let shadow = state.shadow;
  let bank = state.bank;
  const bases = { ...state.bases };
  const privateDef = { ...state.privateDef };
  const bigDef = { ...state.bigDef };
  const brokenTarget = { ...state.brokenTarget };
  const keys = Object.keys(round.gameStakes);

  for (const key of keys) if (bigWinners.includes(key)) bigDef[key] = 0;

  let firstWin = true;
  const shadowPayout = shadow;
  for (const key of keys) {
    const stake = round.gameStakes[key] || 0;
    if (winSet.has(key)) {
      privateDef[key] = 0;
      brokenTarget[key] = 0;
      if (firstWin) {
        firstWin = false;
      } else {
        bank += shadowPayout;
        shadow = 0;
      }
      smallDeficits = Object.fromEntries(Object.keys(smallDeficits).map((code) => [code, 0]));
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
  }
  // A broken target of 1000 or more raises the winners' targets; the increase is shared equally.
  for (const key of keys) {
    if ((brokenTarget[key] || 0) >= 1000) {
      for (const code of state.winners) bases[code] += brokenTarget[key] / state.winners.length;
      brokenTarget[key] = 0;
    }
  }
  // A winner that hit 6-0 clears only its own burden: base back to its start, its own running cost to zero.
  for (const code of winnersHit) {
    if (!state.winners.includes(code)) throw new Error(`Unknown winner ${code}.`);
    bases[code] = state.startBase;
    smallDeficits[code] = 0;
  }
  return {
    ...state, bases, smallDeficits, shadow: winnersHit.length ? 0 : shadow, bank, privateDef, bigDef, brokenTarget,
    open: null, settledRounds: [...state.settledRounds, round.roundId].slice(-200),
  };
}

// Discard a planned round that was never played (for example no bet could be placed in time): nothing is settled
// and the winners' running costs go back to what they were.
function discardRound(state) {
  if (!state.open) return state;
  const { previous } = state.open;
  return { ...state, open: null, smallDeficits: previous.smallDeficits, brokenTarget: previous.brokenTarget, shadow: previous.shadow };
}

// Set an open round aside for good (the run stopped, a bet could not be confirmed, ...): the strategy carries on as
// if it had never been played, and a record of what had been placed is kept so nothing disappears silently.
function quashRound(state) {
  if (!state.open) return state;
  const open = state.open;
  const record = {
    roundId: open.roundId,
    quashedAt: new Date().toISOString(),
    placed: (open.placed || []).map((bet) => ({ key: bet.key, kind: bet.kind, selection: bet.selection, stake: bet.stake, odds: bet.odds, fixture: `${bet.fixture.home} v ${bet.fixture.away}` })),
  };
  const restored = discardRound(state);
  return { ...restored, quashed: [...(state.quashed || []), record].slice(-50) };
}

module.exports = { MIN_STAKE, quashRound, createState, planRound, markPlacement, settleRound, discardRound };
