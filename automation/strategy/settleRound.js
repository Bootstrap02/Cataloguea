// Settle a round by hand: for a round whose bets were placed but whose result the program never got to feed to
// the strategy (for example the run stopped right after the bets). Give the fixture, the final score and the
// options that were PLACED and WON (read them from BetKing's My Bets); everything else settles as non-winning,
// exactly as in a normal automatic round.
const { createHeadlessStrategyBridge } = require('./headlessStrategy');

async function settleRound({ stateFile, baseStake = 10000, home, away, score, winners = [], log = () => {} }) {
  const parsed = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(String(score ?? '').trim());
  if (!parsed) throw new Error('The score must look like 3-3 (home-away).');
  const bridge = createHeadlessStrategyBridge({ stateFile, baseStake, log });
  const fed = await bridge.submitFixture({ home, away });
  if (!fed.ok) throw new Error(`The strategy would not take ${home} v ${away}: ${fed.code ?? ''} ${fed.reason ?? ''}`.trim());
  const before = await bridge.strategyPort.getStrategySnapshot();
  const result = await bridge.strategyPort.settleVerifiedResult({
    normalizedResult: {
      status: 'verified',
      fixture: { id: before.fixture.id, home: before.fixture.home, away: before.fixture.away },
      result: { homeScore: Number(parsed[1]), awayScore: Number(parsed[2]) },
    },
    actionOperationId: `manual-${before.fixture.id}-${Date.now()}`,
    marks: { winners, bigWinners: [] },
  });
  const after = await bridge.strategyPort.getStrategySnapshot();
  return { result, stakes: before.gameStakes, winnerStake: before.winnerStake, after: { deficit: after.deficit, smallDeficit: after.smallDeficit, privateDef: after.privateDef } };
}

module.exports = { settleRound };
