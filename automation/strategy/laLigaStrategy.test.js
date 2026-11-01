const test = require('node:test');
const assert = require('node:assert/strict');
const { createState, planRound, settleRound, discardRound } = require('./laLigaStrategy');
const original = require('../../src/strategy/soloMatrixSettlement');

function lcg(seed) {
  let value = seed;
  return () => { value = (value * 1664525 + 1013904223) % 4294967296; return value / 4294967296; };
}

test('with ONE winner and base 10000 the engine matches the original strategy round after round', () => {
  const keys = ['a', 'b', 'c', 'd', 'e'];
  const random = lcg(7);
  let old = {
    baseStake: 10000, deficit: 0, smallDeficit: 0, shadow: 0, bank: 0, privateDef: {}, bigDef: {}, brokenTarget: {},
    winners: new Set(), bigWinners: new Set(), clicked: new Set(),
  };
  let mine = createState({ baseStake: 10000, winners: ['W'] });
  for (let round = 1; round <= 120; round += 1) {
    const winnerOdds = 40 + Math.floor(random() * 200);
    const teamOdds = Object.fromEntries(keys.map((key) => [key, Math.round((8 + random() * 40) * 10) / 10]));
    old = original.submitSoloMatrixFixture(old, { winner: winnerOdds, ...teamOdds }, keys);
    mine = planRound(mine, { roundId: `r${round}`, winnerOdds: { W: winnerOdds }, teamOdds });
    assert.deepEqual(mine.open.gameStakes, old.gameStakes, `stakes differ in round ${round}`);
    assert.deepEqual(mine.open.bigStakes, old.bigStakes, `big stakes differ in round ${round}`);
    assert.equal(mine.open.winnerStakes.W, old.winnerStake, `winner stake differs in round ${round}`);
    const won = keys.filter(() => random() < 0.07);
    old = { ...old, winners: new Set(won), bigWinners: new Set() };
    const settledOld = original.settleSoloMatrixState(old, keys);
    old = { ...old, ...settledOld, fixture: null };
    mine = settleRound(mine, { teamWinners: won });
    assert.equal(mine.bases.W, old.baseStake, `base differs after round ${round}`);
    assert.equal(mine.smallDeficits.W, old.smallDeficit, `small deficit differs after round ${round}`);
    assert.deepEqual(mine.privateDef, old.privateDef, `private deficits differ after round ${round}`);
    assert.deepEqual(mine.bigDef, old.bigDef, `big deficits differ after round ${round}`);
    assert.equal(mine.bank, old.bank, `bank differs after round ${round}`);
  }
});

test('two winners start at 5000 each and carry their own costs; a protecting stake covers both', () => {
  let state = createState();
  assert.deepEqual(state.bases, { BAR: 5000, RMA: 5000 });
  state = planRound(state, { roundId: 'x1', winnerOdds: { BAR: 50, RMA: 100 }, teamOdds: { VAL: 12, SEV: 41 } });
  assert.equal(state.open.winnerStakes.BAR, 100);       // 5000 / 50
  assert.equal(state.open.winnerStakes.RMA, 50);        // 5000 / 100
  assert.deepEqual(state.smallDeficits, { BAR: 100, RMA: 50 });
  assert.equal(state.open.gameStakes.VAL, Math.round(150 / 11));   // (100 + 50) / (12 - 1)
  assert.equal(state.open.options.VAL.playable, true);
  assert.equal(state.open.options.SEV.stake, Math.round(150 / 40));
  assert.equal(state.open.options.SEV.playable, false, 'below 10 is not bet but still settles as a loss');
});

test('each winner clears only its own burden when it hits 6-0', () => {
  let state = createState();
  state = planRound(state, { roundId: 'a', winnerOdds: { BAR: 50, RMA: 100 }, teamOdds: { VAL: 12 } });
  state = settleRound(state, {});
  state = planRound(state, { roundId: 'b', winnerOdds: { BAR: 50, RMA: 100 }, teamOdds: { VAL: 12 } });
  assert.deepEqual(state.smallDeficits, { BAR: 200, RMA: 100 });
  state = settleRound(state, { winnersHit: ['BAR'] });
  assert.deepEqual(state.smallDeficits, { BAR: 0, RMA: 100 }, 'Barcelona cleared; Real Madrid still carries its own');
  assert.equal(state.bases.BAR, 5000);
});

test('a protecting win clears every winner running cost and the option deficit; losses carry forward even when not bet', () => {
  let state = createState();
  state = planRound(state, { roundId: 'a', winnerOdds: { BAR: 50, RMA: 100 }, teamOdds: { VAL: 12, SEV: 41 } });
  state = settleRound(state, { teamWinners: ['VAL'] });
  assert.deepEqual(state.smallDeficits, { BAR: 0, RMA: 0 });
  assert.equal(state.privateDef.VAL, 0);
  assert.equal(state.privateDef.SEV, state.settledRounds.length ? Math.round(150 / 40) : 0, 'SEV lost (not bet) and its stake carries');
});

test('a round cannot be planned over an open one, settled twice, or settled when nothing is open; discard undoes the costs', () => {
  let state = createState();
  state = planRound(state, { roundId: 'a', winnerOdds: { BAR: 50, RMA: 100 }, teamOdds: { VAL: 12 } });
  assert.throws(() => planRound(state, { roundId: 'b', winnerOdds: { BAR: 50, RMA: 100 }, teamOdds: {} }), /still open/);
  const discarded = discardRound(state);
  assert.deepEqual(discarded.smallDeficits, { BAR: 0, RMA: 0 });
  assert.equal(discarded.open, null);
  const settled = settleRound(state, {});
  assert.throws(() => settleRound(settled, {}), /No open round/);
});

test('a winner whose bet was not placed leaves the running cost again', () => {
  const { markPlacement } = require('./laLigaStrategy');
  let state = createState();
  state = planRound(state, { roundId: 'p', winnerOdds: { BAR: 50, RMA: 100 }, teamOdds: { VAL: 12 } });
  state = markPlacement(state, { placedWinners: ['BAR'] });
  assert.deepEqual(state.smallDeficits, { BAR: 100, RMA: 0 });
  assert.deepEqual(state.open.placedWinners, ['BAR']);
});

test('discarding a planned round restores everything it changed, including the broken targets', () => {
  let state = createState();
  state.bigDef = { VAL: 2000 };
  const before = JSON.parse(JSON.stringify({ s: state.smallDeficits, b: state.brokenTarget, sh: state.shadow }));
  state = planRound(state, { roundId: 'd', winnerOdds: { BAR: 50, RMA: 100 }, teamOdds: { VAL: 12, SEV: 41 } });
  assert.notDeepEqual(state.brokenTarget, before.b, 'planning changed the broken targets');
  state = discardRound(state);
  assert.deepEqual({ s: state.smallDeficits, b: state.brokenTarget, sh: state.shadow }, before);
  assert.equal(state.open, null);
});
