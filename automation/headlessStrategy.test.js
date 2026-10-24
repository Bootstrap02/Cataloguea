const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHeadlessStrategyBridge, loadOddsTable } = require('./headlessStrategy');

function tempState() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-')), 'state.json');
}

test('the odds table loads from src/Scores.js with Arsenal rows both ways', () => {
  const table = loadOddsTable(path.join(__dirname, '..', '..', 'src', 'Scores.js'));
  assert.ok(table.find((row) => row.id === 'arsmnu' && row.home === 'ars' && row.away === 'mnu'));
  assert.ok(table.find((row) => row.id === 'ipsars'));
});

test('feeding the opponent returns a stake per option with no browser (Arsenal home vs Sunderland)', async () => {
  const bridge = createHeadlessStrategyBridge({ stateFile: tempState(), baseStake: 10000 });
  const fed = await bridge.submitFixture({ home: 'ARS', away: 'sun' });
  assert.equal(fed.ok, true);
  const { instructions } = await bridge.getInstructions().then((result) => ({ instructions: result }));
  const text = JSON.stringify(instructions);
  assert.ok(text.includes('ft40'));
  const snapshot = await bridge.strategyPort.getStrategySnapshot();
  // winner 45.9 -> winnerStake round(10000/45.9)=218; ft40 odds 11 -> round(218/10)=22
  assert.equal(snapshot.winnerStake, 218);
  assert.equal(snapshot.gameStakes.ft40, 22);
});

test('an unknown fixture is refused and a second fixture is refused while one is active', async () => {
  const bridge = createHeadlessStrategyBridge({ stateFile: tempState() });
  assert.equal((await bridge.submitFixture({ home: 'ars', away: 'zzz' })).code, 'NO_ODDS_FOR_FIXTURE');
  assert.equal((await bridge.submitFixture({ home: 'ars', away: 'mnu' })).ok, true);
  assert.equal((await bridge.submitFixture({ home: 'ars', away: 'new' })).code, 'FIXTURE_ALREADY_SUBMITTED');
});

test('settling with evaluated marks updates and saves the state file', async () => {
  const stateFile = tempState();
  const bridge = createHeadlessStrategyBridge({ stateFile, baseStake: 10000 });
  await bridge.submitFixture({ home: 'ars', away: 'sun' });
  const snapshot = await bridge.strategyPort.getStrategySnapshot();
  const result = await bridge.strategyPort.settleVerifiedResult({
    normalizedResult: {
      status: 'verified',
      fixture: { id: snapshot.fixture.id, home: snapshot.fixture.home, away: snapshot.fixture.away },
      result: { homeScore: 0, awayScore: 0 },
    },
    actionOperationId: 'op-1',
    marks: { winners: ['tg0'], bigWinners: [] },
  });
  assert.equal(result.status, 'settled');
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(saved.privateDef.tg0, 0);
  assert.ok(saved.privateDef.ft40 > 0, 'a non-winning option carries its stake forward');
  assert.equal(saved.automationSettlements.length, 1);
  // a second bridge on the same file continues from the saved state
  const again = createHeadlessStrategyBridge({ stateFile });
  assert.equal((await again.strategyPort.getStrategySnapshot()).privateDef.ft40, saved.privateDef.ft40);
});
