const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBoard, resultsFromBoard } = require('./liveBoard');

// the text of your Oct 26 screenshot at full time (the icons print no text)
const FULL_TIME = `Week 16
FT
CHE 0 - 1 ARS
89'
All Fixtures this round
CHE 0 - 1 ARS
89'
TOT 1 - 0 CRY
'35
NEW 0 - 3 BRE
47', 80', 81'
AST 1 - 1 EVE
'10 50'
COV 1 - 0 MNU
'23
HUL 1 - 3 MNC
'6 32', 38', 49'
BOU 1 - 0 LEE
'58
IPS 2 - 1 LIV
'43, '7 62'
SUN 1 - 2 BHA
'70 6', 14'
FUL 1 - 0 NOT
'5`;

test('all ten fixtures are read from the live list, with scores and goal minutes', () => {
  const board = parseBoard(FULL_TIME);
  assert.equal(board.fixtures.length, 10);
  assert.equal(board.fullTime, true);
  const by = Object.fromEntries(board.fixtures.map((item) => [`${item.home}-${item.away}`, item]));
  assert.deepEqual(by['HUL-MNC'].score, { home: 1, away: 3 });
  assert.deepEqual(by['HUL-MNC'].goals, { home: [6], away: [32, 38, 49] });
  assert.deepEqual(by['IPS-LIV'].goals, { home: [7, 43], away: [62] });
  assert.deepEqual(by['NEW-BRE'].goals, { home: [], away: [47, 80, 81] });
});

test('half-time for every fixture is counted from the goal minutes: first half is minutes 1 to 45', () => {
  const results = resultsFromBoard(parseBoard(FULL_TIME));
  assert.deepEqual(results['HUL-MNC'], { ft: { home: 1, away: 3 }, ht: { home: 1, away: 2 } });
  assert.deepEqual(results['IPS-LIV'], { ft: { home: 2, away: 1 }, ht: { home: 2, away: 0 } });
  assert.deepEqual(results['SUN-BHA'], { ft: { home: 1, away: 2 }, ht: { home: 0, away: 2 } });
  assert.deepEqual(results['CHE-ARS'].ft, { home: 0, away: 1 });
});

test('while the matches are being played there is a minute and no FT; markets of the next round are ignored', () => {
  const live = `39' BRE 0 - 1 AST
All Fixtures this round
BRE 0 - 1 AST
'10 EVE 1 - 0 CHE
'12 Popular Week 15 ATM - ATH Home To Win 1-0 6.58 2-0 7.47`;
  const board = parseBoard(live);
  assert.equal(board.fullTime, false);
  assert.equal(board.minute, 39);
  assert.deepEqual(board.fixtures.map((item) => `${item.home}-${item.away}`), ['BRE-AST', 'EVE-CHE']);
});

test('a page with no scores gives an empty board, not a guess', () => {
  const board = parseBoard('Week 15 ATM - ATH Home To Win 1-0 6.58 2-0 7.47 BAR - CEL RST - BET');
  assert.deepEqual(board, { fixtures: [], fullTime: false, minute: null });
});
