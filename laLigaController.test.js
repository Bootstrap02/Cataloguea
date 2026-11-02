const test = require('node:test');
const assert = require('node:assert/strict');
const { createLaLigaController, createMemoryStore } = require('./laLigaController');
const { createState } = require('./strategy/laLigaStrategy');

const FIXTURES = [['BAR', 'RMA'], ['VAL', 'GET'], ['ATM', 'OSA'], ['CEL', 'RSO'], ['ALV', 'ELC'], ['RAY', 'RST'], ['DLC', 'VIL'], ['BET', 'MLG'], ['LEV', 'ESP'], ['ATH', 'SEV']];

// A pretend BetKing with a virtual clock. results: { 'BAR-RMA': { ht: [h, a], ft: [h, a] } }
function makeSite({ results = {}, liveReadable = true, failBets = {}, windowRows = null, countdownStart = 100, odds = 2.5 } = {}) {
  let t = 1_000_000;
  const site = {
    placed: [], logs: [], calls: { results: 0 }, kickoff: null,
    now: () => t,
    sleep: async (ms) => { t += ms; },
    round() { return { name: 'Week 14', number: 14, secondsLeft: countdownStart, readAt: t, matches: FIXTURES.map(([home, away]) => ({ home, away })) }; },
  };
  const teams = {};
  for (const [home, away] of FIXTURES) {
    teams[home] = { selection: '1/X', odds, side: 'HOME', fixture: `${home} v ${away}` };
    teams[away] = { selection: '2/X', odds, side: 'AWAY', fixture: `${home} v ${away}` };
  }
  let roundOpenedAt = t;
  const kickoffAt = () => roundOpenedAt + countdownStart * 1000;
  site.ports = {
    ensureLiga: async () => true,
    readUpcomingRound: async () => {
      if (t >= kickoffAt()) { roundOpenedAt = t + 5000; return { ...site.round(), secondsLeft: null, name: 'Week 14' }; }
      return { ...site.round(), secondsLeft: Math.round((kickoffAt() - t) / 1000) };
    },
    readWinnerOdds: async () => ({ BAR: 476, RMA: 1870 }),
    readTeamOdds: async () => ({ teams, missing: [] }),
    placeBet: async ({ bet }) => {
      const failure = failBets[bet.key];
      if (failure === 'UNCONFIRMED') return { status: 'UNCONFIRMED', reason: 'no confirmation text' };
      if (failure) return { status: 'FAILED', reason: failure };
      t += 6000;   // each placement takes about six seconds
      site.placed.push(bet.key);
      return { status: 'PLACED', odds: bet.odds };
    },
    readClock: async () => {
      const k = kickoffAt();
      if (t < k) return { countdown: Math.round((k - t) / 1000), live: false };
      if (t < k + 30000) return { countdown: null, live: true };
      return { countdown: 140, live: false };
    },
    readBoard: async () => {
      const k = kickoffAt();
      if (!liveReadable || t < k) return { fixtures: [], fullTime: false, minute: null };
      const over = t >= k + 29000;
      const fixtures = FIXTURES.map(([home, away]) => {
        const r = results[`${home}-${away}`] ?? { ht: [0, 0], ft: [0, 0] };
        const goals = { home: [], away: [] };
        for (let i = 0; i < r.ft[0]; i += 1) goals.home.push(i < r.ht[0] ? 10 + i : 50 + i);
        for (let i = 0; i < r.ft[1]; i += 1) goals.away.push(i < r.ht[1] ? 12 + i : 60 + i);
        return { home, away, score: { home: over ? r.ft[0] : 0, away: over ? r.ft[1] : 0 }, goals: over ? goals : null };
      });
      return { fixtures, fullTime: over, minute: over ? null : 20 };
    },
    readResultsWindow: async () => {
      site.calls.results += 1;
      if (!windowRows) return { results: [] };
      return { results: windowRows.map(({ home, away, ht, ft }) => ({ fixture: { home, away }, halfTime: { home: ht[0], away: ht[1] }, fullTime: { home: ft[0], away: ft[1] } })) };
    },
    captureEvidence: async () => {},
  };
  return site;
}

function build(site, config = {}, state = createState({ baseStake: 10000 })) {
  const logs = [];
  const store = createMemoryStore(state);
  const controller = createLaLigaController({ ports: site.ports, store, config: { allowRealMoney: true, ...config }, log: (line) => logs.push(line), sleep: site.sleep, now: site.now });
  return { controller, logs, store };
}

test('a dry run plans the round and places nothing', async () => {
  const site = makeSite();
  const { controller, logs, store } = build(site, { allowRealMoney: false });
  const outcome = await controller.run();
  assert.equal(outcome.status, 'DRY_RUN');
  assert.deepEqual(site.placed, []);
  assert.equal(store.state.open, null);
  assert.match(logs.join('\n'), /BAR: odds 476\s+stake N11\s+PLAY/);
  assert.match(logs.join('\n'), /DRY RUN/);
});

test('a full round: winners first, then every protecting option, watched to full time and settled from the live view', async () => {
  const site = makeSite({ countdownStart: 200, results: { 'VAL-GET': { ht: [1, 0], ft: [1, 1] }, 'BAR-RMA': { ht: [0, 0], ft: [2, 1] } } });
  const { controller, logs, store } = build(site);
  const outcome = await controller.run();
  const text = logs.join('\n');
  assert.equal(outcome.status, 'STOPPED', text);
  assert.deepEqual(site.placed.slice(0, 2), ['BAR', 'RMA'], 'winners are placed first');
  assert.equal(site.placed.length, 22, 'two winners and all 20 teams reach N10 at these odds');
  assert.match(text, /Kick-off! The countdown reached zero/);
  assert.match(text, /FT is showing: all 10 matches are over/);
  assert.match(text, /PROTECT\s+VAL 1\/X.*WON/, 'VAL led at half-time and drew');
  assert.match(text, /settled and saved/);
  assert.equal(store.state.open, null);
  assert.equal(store.state.privateDef.VAL, 0, 'the winning option is cleared');
  assert.ok(store.state.privateDef.RMA > 0, 'a losing option carries its stake');
  assert.equal(store.state.settledRounds.length, 1);
  assert.match(text, /SESSION: 1 round\(s\)/);
});

test('a 6-0 for Barcelona is detected, paid, and clears only Barcelona', async () => {
  const site = makeSite({ results: { 'BAR-RMA': { ht: [3, 0], ft: [6, 0] } } });
  const { controller, logs, store } = build(site);
  await controller.run();
  const text = logs.join('\n');
  assert.match(text, /WINNER\s+BAR wins 6-0\s+N11\s+476\s+WON/);
  assert.match(text, /YOU BET AND WON:\s+BAR 6-0/);
  assert.equal(store.state.smallDeficits.BAR, 0);
  assert.equal(store.state.bases.BAR, 5000);
});

test('protecting options below N10 are not bet, and the round is still settled', async () => {
  const site = makeSite({ odds: 40 });   // (11 + 10) / 39 rounds to 1: far below N10
  const { controller, store } = build(site);
  await controller.run();
  assert.deepEqual(site.placed, ['BAR', 'RMA']);
  assert.equal(store.state.settledRounds.length, 1);
  assert.equal(store.state.privateDef.VAL, Math.round(21 / 39), 'the small stake still carries as a deficit');
});

test('when the live view is unreadable the Results window supplies both halves', async () => {
  const rows = FIXTURES.map(([home, away]) => ({ home, away, ht: home === 'VAL' ? [0, 1] : [0, 0], ft: home === 'VAL' ? [1, 1] : [0, 0] }));
  const site = makeSite({ liveReadable: false, windowRows: rows });
  const { controller, logs } = build(site);
  await controller.run();
  const text = logs.join('\n');
  assert.match(text, /live scoreboard could not be read/);
  assert.match(text, /Results window is used/);
  assert.match(text, /\[source: RESULTS_WINDOW\]/);
  assert.match(text, /PROTECT\s+GET 2\/X.*WON/, 'GET led at half-time and drew');
  assert.ok(site.calls.results >= 1);
});

test('a winner that cannot be placed leaves the strategy untouched; no winner placed means the round is skipped', async () => {
  const site = makeSite({ failBets: { BAR: 'ODDS_CHANGED', RMA: 'ODDS_CHANGED' } });
  const { controller, logs, store } = build(site);
  const outcome = await controller.run();
  assert.equal(outcome.status, 'STOPPED');
  assert.equal(store.state.open, null);
  assert.deepEqual(store.state.smallDeficits, { BAR: 0, RMA: 0 });
  assert.deepEqual(site.placed, []);
  assert.match(logs.join('\n'), /No winner bet could be placed in time/);
});

test('one winner failing costs nothing: its stake leaves the running cost', async () => {
  const site = makeSite({ failBets: { RMA: 'SELECTION_NOT_ADDED' } });
  const { controller, store, logs } = build(site);
  await controller.run();
  assert.match(logs.join('\n'), /NOT placed RMA: SELECTION_NOT_ADDED/);
  assert.ok(site.placed.includes('BAR'));
  assert.ok(!site.placed.includes('RMA'));
  assert.equal(store.state.smallDeficits.RMA, 0);
});

test('a bet that may exist without confirmation stops everything and leaves the round open', async () => {
  const site = makeSite({ failBets: { VAL: 'UNCONFIRMED' } });
  const { controller, store } = build(site);
  const outcome = await controller.run({ forever: true });
  assert.equal(outcome.status, 'HALTED');
  assert.equal(outcome.code, 'WAGER_UNCONFIRMED');
  assert.match(outcome.reason, /VAL bet was clicked/);
  assert.ok(store.state.open, 'the round stays open so it cannot be planned over');
  // a new run no longer refuses: it sets the old round aside, records it, and carries on
  const again = createLaLigaController({ ports: site.ports, store, config: { allowRealMoney: true }, log() {}, sleep: site.sleep, now: site.now });
  const second = await again.run();
  assert.equal(store.state.quashed.length, 1, 'the set-aside round is recorded');
  assert.equal(store.state.quashed[0].placed.length > 0, true);
  assert.equal(second.code, 'WAGER_UNCONFIRMED', 'it started a new round (which hit the same fake failure)');
  // the old behaviour is still available on request
  const strict = createLaLigaController({ ports: site.ports, store, config: { allowRealMoney: true, haltOnOpen: true }, log() {}, sleep: site.sleep, now: site.now });
  assert.equal((await strict.run()).code, 'ROUND_LEFT_OPEN');
});

test('a round left open with placed winners is quashed at the start, its costs removed, and a new round is played', async () => {
  const site = makeSite({ results: { 'BAR-RMA': { ht: [0, 0], ft: [1, 1] } } });
  const { controller, logs, store } = build(site);
  const { planRound, markPlacement } = require('./strategy/laLigaStrategy');
  let state = planRound(createState(), { roundId: 'Week 3@old', winnerOdds: { BAR: 161, RMA: 167 }, teamOdds: {} });
  state = markPlacement(state, { placedWinners: ['BAR', 'RMA'], placed: [{ key: 'BAR', kind: 'winner', code: 'BAR', side: 'AWAY', fixture: { home: 'LEV', away: 'BAR' }, selection: '0-6', stake: 31, odds: 161 }] });
  store.state = state;
  const outcome = await controller.run();
  const text = logs.join('\n');
  assert.equal(outcome.status, 'STOPPED', text);
  assert.match(text, /A previous round \(Week 3@old\) was never settled; 1 bet\(s\) had been placed on it: BAR 0-6 N31/);
  assert.equal(store.state.quashed.length, 1);
  assert.equal(store.state.settledRounds.length, 1, 'the new round was played and settled');
  assert.equal(store.state.open, null);
});

test('placing stops when the round runs low on time; the rest settle as not bet', async () => {
  const site = makeSite({ countdownStart: 75 });   // 75s: winners and a few teams fit, not all 20
  const { controller, logs, store } = build(site, { minStartSeconds: 70 });
  await controller.run();
  const text = logs.join('\n');
  assert.ok(site.placed.length >= 2 && site.placed.length < 22, `placed ${site.placed.length}`);
  assert.match(text, /out of time|left: the remaining/);
  assert.equal(store.state.settledRounds.length, 1);
});

test('forever mode goes round after round until stopped', async () => {
  const site = makeSite();
  const { controller, logs } = build(site);
  let rounds = 0;
  const original = site.ports.readWinnerOdds;
  site.ports.readWinnerOdds = async (...args) => { rounds += 1; if (rounds === 3) controller.stop(); return original(...args); };
  // each round the fake site opens a new round after the previous one ended
  const readUpcoming = site.ports.readUpcomingRound;
  let opened = 0;
  site.ports.readUpcomingRound = async () => {
    const round = await readUpcoming();
    return round;
  };
  const outcome = await controller.run({ forever: true });
  assert.equal(outcome.status, 'STOPPED');
  assert.ok(outcome.session.rounds >= 1, logs.join('\n'));
  assert.match(logs.join('\n'), /Stopped as you asked/);
  void opened;
});

test('a fixture the Results window never lists halts the round (page not left) and points to --resume', async () => {
  const rows = FIXTURES.filter(([home]) => home !== 'BAR').map(([home, away]) => ({ home, away, ht: [0, 0], ft: [0, 0] }));   // BAR-RMA missing
  const site = makeSite({ liveReadable: false, windowRows: rows });
  let myBetsOpened = 0;
  site.ports.readMyBets = async () => { myBetsOpened += 1; return {}; };
  const { controller, store } = build(site);
  const outcome = await controller.run();
  assert.equal(outcome.status, 'HALTED');
  assert.equal(outcome.code, 'RESULTS_UNAVAILABLE');
  assert.match(outcome.reason, /laliga-run\.js --resume/);
  assert.equal(myBetsOpened, 0);
  assert.ok(store.state.open, 'the round stays open for --resume');
});

test('an open round with placed bets is settled by --resume from the settled bets, then the run can carry on', async () => {
  const site = makeSite({ liveReadable: false });
  site.ports.readMyBets = async (round, fixtures) => Object.fromEntries(fixtures.map(({ home, away }) => [`${home}-${away}`, { ft: { home: 0, away: 6 }, ht: { home: 0, away: 3 } }]));
  const { controller, logs, store } = build(site);
  // a state like the one left behind by the run that stopped: two winners placed, round open
  const { planRound, markPlacement } = require('./strategy/laLigaStrategy');
  let state = planRound(createState(), { roundId: 'Week 29@2026-11-01T08:07:45.132Z', winnerOdds: { BAR: 149, RMA: 717 }, teamOdds: {} });
  const placed = [
    { key: 'BAR', kind: 'winner', code: 'BAR', side: 'AWAY', fixture: { home: 'LEV', away: 'BAR' }, selection: '0-6', stake: 34, odds: 149 },
    { key: 'RMA', kind: 'winner', code: 'RMA', side: 'AWAY', fixture: { home: 'OSA', away: 'RMA' }, selection: '0-6', stake: 10, odds: 717 },
  ];
  store.state = markPlacement(state, { placedWinners: ['BAR', 'RMA'], placed });
  const outcome = await controller.run({ resumeOpen: true, maxRounds: 0 });
  const text = logs.join('\n');
  assert.equal(outcome.status, 'STOPPED', text);
  assert.match(text, /Resuming Week 29: 2 placed bet\(s\)/);
  assert.match(text, /WINNER\s+BAR wins 0-6\s+N34\s+149\s+WON/);
  assert.match(text, /YOU BET AND WON:\s+BAR 6-0, RMA 6-0/);
  assert.equal(store.state.open, null);
  assert.equal(store.state.settledRounds.length, 1);
});

test('the report says which options won even though they were not placed (below the minimum stake)', async () => {
  const site = makeSite({ odds: 40, results: { 'VAL-GET': { ht: [1, 0], ft: [1, 1] }, 'ATH-SEV': { ht: [0, 2], ft: [2, 2] } } });
  const { controller, logs } = build(site);
  await controller.run();
  const text = logs.join('\n');
  assert.deepEqual(site.placed, ['BAR', 'RMA']);
  assert.match(text, /WON BUT NOT PLACED: VAL, SEV/);
  assert.match(text, /VAL v GET\s+half-time 1-0, full-time 1-1/);
});

test('a normal round never leaves the page for My Bets: it waits for the Results window instead', async () => {
  const rows = FIXTURES.map(([home, away]) => ({ home, away, ht: [0, 0], ft: [0, 0] }));
  let windowReads = 0;
  const site = makeSite({ liveReadable: false });
  site.ports.readResultsWindow = async () => {
    windowReads += 1;
    // the window only lists the round some time after full time
    return windowReads < 3 ? { results: [] } : { results: rows.map(({ home, away, ht, ft }) => ({ fixture: { home, away }, halfTime: { home: ht[0], away: ht[1] }, fullTime: { home: ft[0], away: ft[1] } })) };
  };
  let myBetsOpened = 0;
  site.ports.readMyBets = async () => { myBetsOpened += 1; return {}; };
  const { controller, logs } = build(site);
  await controller.run();
  assert.equal(myBetsOpened, 0, 'My Bets must not be opened during a normal round');
  assert.ok(windowReads >= 3);
  assert.match(logs.join('\n'), /\[source: RESULTS_WINDOW\]/);
  assert.match(logs.join('\n'), /The page is not left/);
});

test('a stale board from the previous round (other pairings, FT showing) is never taken as this round\'s result', async () => {
  const site = makeSite({ liveReadable: false, windowRows: FIXTURES.map(([home, away]) => ({ home, away, ht: [0, 0], ft: [0, 0] })) });
  site.ports.readBoard = async () => ({
    fixtures: FIXTURES.map(([home, away]) => ({ home: away, away: home, score: { home: 6, away: 0 }, goals: { home: [1, 2, 3, 4, 5, 6], away: [] } })),   // reversed pairings: last round's
    fullTime: true, minute: null,
  });
  const { controller, logs } = build(site);
  await controller.run();
  const text = logs.join('\n');
  assert.match(text, /live scoreboard could not be read/);
  assert.match(text, /\[source: RESULTS_WINDOW\]/);
  assert.doesNotMatch(text, /WINNER\s+BAR wins 6-0\s+N11\s+476\s+WON/);
});

test('when no scores are on the page the LIVE tab is clicked once to open the live view', async () => {
  const site = makeSite({ liveReadable: false, windowRows: FIXTURES.map(([home, away]) => ({ home, away, ht: [0, 0], ft: [0, 0] })) });
  let clicks = 0;
  site.ports.showLive = async () => { clicks += 1; };
  const { controller, logs } = build(site);
  await controller.run();
  assert.equal(clicks, 1);
  assert.match(logs.join('\n'), /clicking the LIVE tab/);
});
