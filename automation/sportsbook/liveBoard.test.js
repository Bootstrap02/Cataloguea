const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBoard, resultsFromBoard, createGoalLedger } = require('./liveBoard');

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
  assert.deepEqual(by['HUL-MNC'].tokens, [6, 32, 38, 49]);
  assert.deepEqual(by['IPS-LIV'].tokens, [43, 7, 62]);
  assert.deepEqual(by['NEW-BRE'].tokens, [47, 80, 81]);
});

test('half-time for every fixture is counted from the goal minutes: first half is minutes 1 to 45', () => {
  const results = resultsFromBoard(parseBoard(FULL_TIME));
  assert.deepEqual(results['HUL-MNC'].ht, { home: 1, away: 2 });
  assert.deepEqual(results['IPS-LIV'].ht, { home: 2, away: 0 });
  assert.deepEqual(results['SUN-BHA'].ht, { home: 0, away: 2 });
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

// What the page really prints (your Week 18 run): home minutes look just like away minutes, "43'" for both.
const REAL_FORMAT = `All Fixtures this round
BAR 2 - 2 RSO
23' 70' 40' 85'
VAL 1 - 3 VIL
44' 12' 47' 80'
ATH 3 - 0 RAY
5' 33' 61'
ALV 0 - 3 ATM
10' 20' 30'`;

test('minutes are read whichever side of the minute the apostrophe is on', () => {
  const board = parseBoard(REAL_FORMAT);
  const by = Object.fromEntries(board.fixtures.map((item) => [`${item.home}-${item.away}`, item]));
  assert.deepEqual(by['BAR-RSO'].tokens, [23, 70, 40, 85]);
  assert.deepEqual(by['ATH-RAY'].tokens, [5, 33, 61]);
  assert.equal(by['ALV-ATM'].tokens.length, 3);
});

test('a side with no goals gets every minute, so half-time is known for one-sided scores', () => {
  const results = resultsFromBoard(parseBoard(REAL_FORMAT));
  assert.deepEqual(results['ATH-RAY'].ht, { home: 2, away: 0 }, 'minutes 5 and 33 are first half, 61 is second half');
  assert.deepEqual(results['ALV-ATM'].ht, { home: 0, away: 3 });
});

test('which side scored a minute is learned while the match is watched, even when both sides scored', () => {
  const ledger = createGoalLedger();
  const poll = (home, away, score, tokens) => ({ home, away, score, tokens });
  ledger.observe([poll('BAR', 'RSO', { home: 0, away: 0 }, [])]);
  ledger.observe([poll('BAR', 'RSO', { home: 1, away: 0 }, [23])]);          // 23' is a home goal
  ledger.observe([poll('BAR', 'RSO', { home: 1, away: 1 }, [23, 40])]);      // 40' is an away goal
  ledger.observe([poll('BAR', 'RSO', { home: 2, away: 1 }, [23, 40, 70])]);  // 70' is a home goal
  ledger.observe([poll('BAR', 'RSO', { home: 2, away: 2 }, [23, 40, 70, 85])]);
  assert.deepEqual(ledger.resolve(poll('BAR', 'RSO', { home: 2, away: 2 }, [23, 40, 70, 85])), { home: [23, 70], away: [40, 85] });
  // the order the page prints them does not matter: they were learned as they happened
  assert.deepEqual(ledger.resolve(poll('BAR', 'RSO', { home: 2, away: 2 }, [85, 70, 40, 23])), { home: [23, 70], away: [40, 85] });
});

test('two goals in one poll on different sides fall back to the printed order (home first) and still match the score', () => {
  const ledger = createGoalLedger();
  ledger.observe([{ home: 'VAL', away: 'VIL', score: { home: 0, away: 0 }, tokens: [] }]);
  ledger.observe([{ home: 'VAL', away: 'VIL', score: { home: 1, away: 1 }, tokens: [12, 44] }]);
  assert.deepEqual(ledger.resolve({ home: 'VAL', away: 'VIL', score: { home: 1, away: 1 }, tokens: [12, 44] }), { home: [12], away: [44] });
});

test('minutes that cannot be matched to the score give no half-time rather than a wrong one', () => {
  const ledger = createGoalLedger();
  assert.equal(ledger.resolve({ home: 'A', away: 'B', score: { home: 1, away: 1 }, tokens: [10] }), null);
  assert.equal(ledger.resolve({ home: 'A', away: 'B', score: { home: 1, away: 1 }, tokens: null }), null);
});
