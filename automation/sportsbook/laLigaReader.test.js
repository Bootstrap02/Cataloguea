const test = require('node:test');
const assert = require('node:assert/strict');
const { parseOdd, protectingSelection, teamOddsFromFixtures, winnerOddsFromGrid, LA_LIGA_CODES } = require('./laLigaReader');

test('there are 20 La Liga team codes', () => {
  assert.equal(new Set(LA_LIGA_CODES).size, 20);
});

test('each team is bet on its own result: 1/X at home, 2/X away (the BAR v RMA grid from the recording)', () => {
  assert.equal(protectingSelection('HOME'), '1/X');
  assert.equal(protectingSelection('AWAY'), '2/X');
  const grid = { '1/1': '2.98', '1/X': '13.70', '1/2': '28.00', 'X/1': '8.02', 'X/X': '6.51', 'X/2': '10.20', '2/1': '29.20', '2/X': '19.50', '2/2': '5.91' };
  const { teams, missing } = teamOddsFromFixtures([{ home: 'BAR', away: 'RMA', grid }]);
  assert.deepEqual(missing, []);
  assert.equal(teams.BAR.selection, '1/X');
  assert.equal(teams.BAR.odds, 13.7);
  assert.equal(teams.RMA.selection, '2/X');
  assert.equal(teams.RMA.odds, 19.5);
});

test('a team whose odd could not be read is reported, not guessed', () => {
  const { teams, missing } = teamOddsFromFixtures([{ home: 'ATM', away: 'OSA', grid: { '1/X': '15.2' } }]);
  assert.deepEqual(Object.keys(teams), ['ATM']);
  assert.deepEqual(missing, ['OSA (2/X)']);
});

test('the 6-0 winner odds come from 6-0 for a home team and 0-6 for an away team; odds above 1 only', () => {
  const grid = { '6-0': '1,870.00', '0-6': '476.00' };
  assert.equal(winnerOddsFromGrid(grid, 'HOME'), 1870);
  assert.equal(winnerOddsFromGrid(grid, 'AWAY'), 476);
  assert.equal(winnerOddsFromGrid({}, 'HOME'), null);
  assert.equal(parseOdd('1.00'), null);
});
