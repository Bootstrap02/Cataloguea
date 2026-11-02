const test = require('node:test');
const assert = require('node:assert/strict');
const { betWon, evaluatePlaced, teamsThatWon, resultsFromLive, resultsFromWindow, formatRoundReport } = require('./laLigaOutcome');

const home = (code, selection = '1/X') => ({ kind: 'team', side: 'HOME', code, selection });
const away = (code, selection = '2/X') => ({ kind: 'team', side: 'AWAY', code, selection });

test('a protecting bet wins when the team led at half-time and the match ended level', () => {
  assert.equal(betWon(home('VAL'), { ht: { home: 1, away: 0 }, ft: { home: 2, away: 2 } }), true);
  assert.equal(betWon(home('VAL'), { ht: { home: 0, away: 0 }, ft: { home: 1, away: 1 } }), false, 'level at half-time is not ahead');
  assert.equal(betWon(home('VAL'), { ht: { home: 1, away: 0 }, ft: { home: 2, away: 1 } }), false, 'won, not drawn');
  assert.equal(betWon(away('SEV'), { ht: { home: 0, away: 2 }, ft: { home: 3, away: 3 } }), true);
  assert.equal(betWon(away('SEV'), { ht: { home: 1, away: 0 }, ft: { home: 1, away: 1 } }), false, 'the home side led');
  assert.equal(betWon(home('VAL'), { ft: { home: 1, away: 1 }, ht: null }), null, 'no half-time score: cannot tell');
  assert.equal(betWon(home('VAL'), undefined), null);
});

test('a 6-0 winner needs the team to win by exactly six to nil; away teams win 0-6', () => {
  const winnerHome = { kind: 'winner', side: 'HOME' };
  const winnerAway = { kind: 'winner', side: 'AWAY' };
  assert.equal(betWon(winnerHome, { ft: { home: 6, away: 0 } }), true);
  assert.equal(betWon(winnerHome, { ft: { home: 7, away: 0 } }), false);
  assert.equal(betWon(winnerHome, { ft: { home: 6, away: 1 } }), false);
  assert.equal(betWon(winnerAway, { ft: { home: 0, away: 6 } }), true);
  assert.equal(betWon(winnerAway, { ft: { home: 6, away: 0 } }), false);
});

test('only placed bets are staked and paid; unresolved bets are reported, not guessed', () => {
  const placed = [
    { key: 'BAR', kind: 'winner', code: 'BAR', side: 'HOME', fixture: { home: 'BAR', away: 'RMA' }, stake: 11, odds: 476 },
    { key: 'VAL', kind: 'team', code: 'VAL', side: 'HOME', selection: '1/X', fixture: { home: 'VAL', away: 'GET' }, stake: 20, odds: 12.5 },
    { key: 'SEV', kind: 'team', code: 'SEV', side: 'AWAY', selection: '2/X', fixture: { home: 'ATH', away: 'SEV' }, stake: 15, odds: 14 },
  ];
  const results = {
    'BAR-RMA': { ft: { home: 1, away: 1 }, ht: { home: 0, away: 1 } },
    'VAL-GET': { ft: { home: 2, away: 2 }, ht: { home: 1, away: 0 } },
  };
  const evaluation = evaluatePlaced(placed, results);
  assert.deepEqual(evaluation.winnersHit, []);
  assert.deepEqual(evaluation.teamWinners, ['VAL']);
  assert.deepEqual(evaluation.unresolved, ['SEV']);
  assert.equal(evaluation.staked, 46);
  assert.equal(evaluation.returned, 250);
});

test('teams that would have won are found even when no bet was placed', () => {
  const teams = {
    VAL: { selection: '1/X', side: 'HOME', fixture: 'VAL v GET' },
    GET: { selection: '2/X', side: 'AWAY', fixture: 'VAL v GET' },
  };
  assert.deepEqual(teamsThatWon(teams, { 'VAL-GET': { ft: { home: 1, away: 1 }, ht: { home: 1, away: 0 } } }), ['VAL']);
});

test('results come from the live view only for finished fixtures, and from the Results window as the site lists them', () => {
  const live = resultsFromLive([
    { home: 'BAR', away: 'RMA', finished: true, score: { home: 1, away: 1 }, goals: { home: [30], away: [70] } },
    { home: 'ATM', away: 'OSA', finished: false, score: { home: 0, away: 0 }, goals: null },
  ]);
  assert.deepEqual(live, { 'BAR-RMA': { ft: { home: 1, away: 1 }, ht: { home: 1, away: 0 } } });
  const window = resultsFromWindow({ results: [{ fixture: { home: 'VAL', away: 'GET' }, fullTime: { home: 0, away: 0 }, halfTime: { home: 0, away: 0 } }] });
  assert.deepEqual(window, { 'VAL-GET': { ft: { home: 0, away: 0 }, ht: { home: 0, away: 0 } } });
});

test('the report lists every fixture, each bet with WON or LOST, and the totals', () => {
  const placed = [{ key: 'VAL', kind: 'team', code: 'VAL', side: 'HOME', selection: '1/X', fixture: { home: 'VAL', away: 'GET' }, stake: 20, odds: 12.5 }];
  const results = { 'VAL-GET': { ft: { home: 2, away: 2 }, ht: { home: 1, away: 0 } } };
  const evaluation = evaluatePlaced(placed, results);
  const text = formatRoundReport({ round: { name: 'Week 14', matches: [{ home: 'VAL', away: 'GET' }] }, placed, evaluation, results, notPlaced: ['ESP (below N10)'], wonNotPlaced: [] });
  assert.match(text, /RESULTS Week 14/);
  assert.match(text, /VAL v GET\s+half-time 1-0, full-time 2-2/);
  assert.match(text, /PROTECT\s+VAL 1\/X.*N20\s+12.5\s+WON/);   // old layout (no plan)
  assert.match(text, /NOT PLACED: ESP/);
  assert.match(text, /STAKED: N20 \| RETURNED: N250 \| NET: \+N230/);
});

test('with the plan, the report lists EVERY option with WON or LOST, placed or not', () => {
  const plan = {
    winnerPlans: { BAR: { stake: 45, odds: 112, playable: true }, RMA: { stake: 10, odds: 717, playable: true } },
    options: {
      VAL: { stake: 20, odds: 12.5, playable: true },
      SEV: { stake: 3, odds: 13.4, playable: false },
      ESP: { stake: 2, odds: 19.6, playable: false },
      ATH: { stake: 4, odds: 13.6, playable: false },
    },
  };
  const teams = {
    VAL: { selection: '1/X', side: 'HOME', fixture: 'VAL v GET' },
    SEV: { selection: '1/X', side: 'HOME', fixture: 'SEV v MLG' },
    ESP: { selection: '2/X', side: 'AWAY', fixture: 'RST v ESP' },
    ATH: { selection: '1/X', side: 'HOME', fixture: 'ATH v RAY' },
  };
  const results = {
    'BAR-RSO': { ft: { home: 2, away: 2 }, ht: { home: 1, away: 1 } },
    'OSA-RMA': { ft: { home: 0, away: 1 }, ht: { home: 0, away: 0 } },
    'VAL-GET': { ft: { home: 1, away: 1 }, ht: { home: 1, away: 0 } },
    'SEV-MLG': { ft: { home: 1, away: 0 }, ht: { home: 0, away: 0 } },
    'RST-ESP': { ft: { home: 0, away: 0 }, ht: { home: 0, away: 0 } },
    'ATH-RAY': { ft: { home: 2, away: 2 }, ht: { home: 2, away: 1 } },
  };
  const placed = [
    { key: 'BAR', kind: 'winner', code: 'BAR', side: 'HOME', fixture: { home: 'BAR', away: 'RSO' }, stake: 45, odds: 112 },
    { key: 'RMA', kind: 'winner', code: 'RMA', side: 'AWAY', fixture: { home: 'OSA', away: 'RMA' }, stake: 10, odds: 717 },
    { key: 'VAL', kind: 'team', code: 'VAL', side: 'HOME', selection: '1/X', fixture: { home: 'VAL', away: 'GET' }, stake: 20, odds: 12.5 },
  ];
  const evaluation = evaluatePlaced(placed, results);
  const round = { name: 'Week 18', matches: [{ home: 'BAR', away: 'RSO' }, { home: 'OSA', away: 'RMA' }, { home: 'VAL', away: 'GET' }, { home: 'SEV', away: 'MLG' }, { home: 'RST', away: 'ESP' }, { home: 'ATH', away: 'RAY' }] };
  const text = formatRoundReport({ round, plan, placed, evaluation, results, teams, notPlaced: [], wonNotPlaced: teamsThatWon(teams, results).filter((code) => !placed.some((bet) => bet.code === code)) });
  assert.match(text, /WINNER\s+BAR wins 6-0\s+N45\s+112\s+PLACED\s+LOST/);
  assert.match(text, /WINNER\s+RMA wins 0-6\s+N10\s+717\s+PLACED\s+LOST/);
  assert.match(text, /PROTECT\s+VAL 1\/X.*PLACED\s+WON/);
  assert.match(text, /PROTECT\s+ATH 1\/X.*below N10\s+WON\s+\[ATH v RAY: HT 2-1, FT 2-2\]/, 'a win that was not placed is still shown as WON');
  assert.match(text, /PROTECT\s+SEV 1\/X.*below N10\s+LOST/);
  assert.match(text, /PROTECT\s+ESP 2\/X.*below N10\s+LOST/);
  assert.match(text, /YOU BET AND LOST:\s+BAR 6-0, RMA 6-0/);
  assert.match(text, /WON BUT NOT PLACED: ATH/);
  assert.ok(text.indexOf('ATH 1/X') < text.indexOf('SEV 1/X'), 'winners of the round are listed before the losers');
});
