const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OPTIONS, BY_ID, SELECTION_LIST, optionsHit, oddsFor } = require('./options');
const { buildOccurrences, missedSeasons, toCsv } = require('./charts');
const { topQuarterAverage } = require('./percentile');
const { ruleFor, teamOptionOdds, evaluate, decideToSend } = require('./rulesEngine');
const { planVisit, markRecorded } = require('./oddsCycle');
const { createOddsStore } = require('./oddsStore');
const { createOddsHunter, completeWeeks } = require('./oddsHunter');
const { runSignalCheck, loadRules } = require('./signalCheck');
const { normalizeLabel, gridToSelections } = require('./oddsPage');
const { resolveLeagues } = require('./leagues');

const RULES = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules-of-engagement', 'rules.json'), 'utf8'));
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'odds-'));
const match = (home, away, ht, ft, season = 1, week = 1) => ({ season, week, home, away, ht, ft });

test('there are exactly 22 options and every one has odds selections', () => {
  assert.equal(OPTIONS.length, 22);
  assert.deepEqual(Object.keys(SELECTION_LIST).sort(), ['CS', 'HTCS', 'HTFT', 'TG']);
  assert.deepEqual([...SELECTION_LIST.HTFT].sort(), ['1/2', '1/X', '2/1', '2/X']);
  assert.deepEqual([...SELECTION_LIST.TG].sort(), ['0', '6']);
});

test('options are judged from one team\'s side', () => {
  // BAR (home) lead 1-0 at half-time and draw 2-2: HT/FT 1X for BAR, and for VIL (away) it is a draw after TRAILING: no 1X
  const draw = match('BAR', 'VIL', [1, 0], [2, 2]);
  assert.ok(optionsHit(draw, 'HOME').includes('HTFT_1X'));
  assert.ok(optionsHit(draw, 'HOME').includes('CS_2-2'));
  assert.ok(!optionsHit(draw, 'AWAY').includes('HTFT_1X'));
  // MLG v BAR 1-4 (HT 0-2): for BAR (away) a 4-1 win; for MLG (home) a 1-4 loss
  const loss = match('MLG', 'BAR', [0, 2], [1, 4]);
  assert.ok(optionsHit(loss, 'AWAY').includes('CS_4-1'));
  assert.ok(optionsHit(loss, 'HOME').includes('CS_1-4'));
  assert.ok(optionsHit(loss, 'HOME').includes('HTCS_0-3') === false);
  // trailing 0-3 at half-time, wins later
  const comeback = match('ARS', 'AST', [0, 3], [5, 3]);
  assert.ok(optionsHit(comeback, 'HOME').includes('HTCS_0-3'));
  assert.ok(optionsHit(comeback, 'HOME').includes('HTFT_21'));
  assert.ok(optionsHit(comeback, 'AWAY').includes('HTFT_12'));
  // total goals
  assert.ok(optionsHit(match('A', 'B', [0, 0], [0, 0]), 'HOME').includes('TG_0'));
  assert.ok(optionsHit(match('A', 'B', [2, 1], [4, 2]), 'AWAY').includes('TG_6'));
  assert.ok(optionsHit(match('A', 'B', [2, 1], [3, 2]), 'HOME').includes('CS_3-2'));
});

test('which odds selection belongs to a team: home reads one label, away reads the mirrored one', () => {
  assert.equal(BY_ID.HTFT_1X.selection('HOME'), '1/X');
  assert.equal(BY_ID.HTFT_1X.selection('AWAY'), '2/X');
  assert.equal(BY_ID['CS_4-1'].selection('HOME'), '4-1');
  assert.equal(BY_ID['CS_4-1'].selection('AWAY'), '1-4');
  assert.equal(BY_ID['HTCS_0-3'].selection('AWAY'), '3-0');
  const fixtureOdds = { HTFT: { '1/X': 13.7, '2/X': 15.1 }, CS: { '4-1': 90, '1-4': 120 } };
  assert.equal(oddsFor('HTFT_1X', fixtureOdds, 'HOME'), 13.7);
  assert.equal(oddsFor('HTFT_1X', fixtureOdds, 'AWAY'), 15.1);
  assert.equal(oddsFor('CS_4-1', fixtureOdds, 'AWAY'), 120);
  assert.equal(oddsFor('TG_0', fixtureOdds, 'HOME'), null);
});

test('missed seasons count completed, fully seen seasons back from the latest', () => {
  const state = { seasons: { 1: { complete: true, partial: true }, 2: { complete: true, partial: false }, 3: { complete: true, partial: false }, 4: { complete: false, partial: false } } };
  const none = buildOccurrences([match('ARS', 'AST', [0, 0], [0, 0], 2), match('ARS', 'AST', [0, 0], [0, 0], 3)]);
  assert.equal(missedSeasons(none, 'ARS', 'HTFT_1X', state), 2, 'seasons 2 and 3 are usable; season 1 is partial and is not counted');
  const hitIn2 = buildOccurrences([match('ARS', 'AST', [1, 0], [1, 1], 2, 9)]);
  assert.equal(missedSeasons(hitIn2, 'ARS', 'HTFT_1X', state), 1);
  const hitIn3 = buildOccurrences([match('ARS', 'AST', [1, 0], [1, 1], 3, 4)]);
  assert.equal(missedSeasons(hitIn3, 'ARS', 'HTFT_1X', state), 0);
  assert.match(toCsv({ occurrences: hitIn3, state, teams: ['ARS'] }), /ARS,HTFT_1X,.*,0,1,3,4/);
});

test('the percentile is the average of the highest quarter of the odds', () => {
  const odds = Array.from({ length: 38 }, (_, i) => i + 1);
  assert.equal(topQuarterAverage(odds), 33.5, '38 odds: the 10 biggest (29..38)');
  assert.equal(topQuarterAverage(Array.from({ length: 34 }, (_, i) => i + 1)), 30, '34 odds: the 9 biggest (26..34)');
  assert.equal(topQuarterAverage([]), null);
  assert.equal(topQuarterAverage([10, 12.5]), 12.5);
});

test('the rules of engagement: bands of 8, seasons grow, money stops at 2500, the multiplier works', () => {
  const at = (percentile, rules = RULES) => ruleFor(percentile, rules);
  assert.deepEqual([at(10).band, at(10).seasons, at(10).stake], [0, 2, 500]);
  assert.deepEqual([at(16).band, at(16).seasons, at(16).stake], [0, 2, 500]);
  assert.deepEqual([at(17).band, at(17).seasons, at(17).stake], [1, 3, 1000]);
  assert.deepEqual([at(24).band, at(24).seasons, at(24).stake], [1, 3, 1000]);
  assert.deepEqual([at(25).band, at(25).seasons, at(25).stake], [2, 4, 1500]);
  assert.deepEqual([at(32).band, at(32).seasons], [2, 4]);
  assert.deepEqual([at(33).band, at(33).seasons, at(33).stake], [3, 5, 2000]);
  assert.deepEqual([at(41).band, at(41).seasons, at(41).stake], [4, 6, 2500]);
  assert.deepEqual([at(80).seasons, at(80).stake], [10, 2500], 'seasons keep growing, the money does not');
  assert.equal(at(10, { ...RULES, multiplier: 2 }).stake, 1000);
  assert.equal(at(80, { ...RULES, multiplier: 2 }).stake, 5000, 'cap on the ladder, then the multiplier');
  assert.equal(at(80, { ...RULES, multiplier: 2, capAppliesTo: 'final' }).stake, 2500, 'or the cap on the final number');
});

test('odds records become each team\'s odds for each option', () => {
  const records = [];
  const add = (week, home, away, group, sel, odd) => records.push({ week, home, away, group, sel, odd });
  add(1, 'ARS', 'AST', 'HTFT', '1/X', 13.7); add(1, 'ARS', 'AST', 'HTFT', '2/X', 15.1);
  add(2, 'AST', 'ARS', 'HTFT', '1/X', 14.4); add(2, 'AST', 'ARS', 'HTFT', '2/X', 12.2);
  const teams = teamOptionOdds(records);
  assert.deepEqual(teams.ARS.HTFT_1X, [13.7, 12.2], 'home in week 1 (1/X), away in week 2 (2/X)');
  assert.deepEqual(teams.AST.HTFT_1X, [15.1, 14.4]);
});

test('week-1 waiting: nothing is recorded until week 1 is on screen, then only the new season', () => {
  const T = (iso) => new Date(iso);
  let r = planVisit({}, { today: '2026-11-19', weeksOnScreen: [25, 26, 27, 28], now: T('2026-11-19T00:00:00Z') });
  assert.deepEqual(r.record, []);
  assert.match(r.note, /waiting for week 1/);
  r = planVisit(r.state, { today: '2026-11-19', weeksOnScreen: [37, 38, 1, 2], now: T('2026-11-19T01:00:00Z') });
  assert.deepEqual(r.record, [1, 2], '37 and 38 belong to the old season');
  assert.equal(r.state.status, 'collecting');
  let s = markRecorded(r.state, [1, 2], 38, T('2026-11-19T01:00:00Z'));
  r = planVisit(s, { today: '2026-11-19', weeksOnScreen: [2, 3, 4, 5], now: T('2026-11-19T01:30:00Z') });
  assert.deepEqual(r.record, [3, 4, 5]);
  s = markRecorded(r.state, Array.from({ length: 36 }, (_, i) => i + 3), 38, T('2026-11-19T20:00:00Z'));
  assert.equal(s.status, 'done');
  assert.deepEqual(planVisit(s, { today: '2026-11-19', weeksOnScreen: [1, 2], now: T('2026-11-19T21:00:00Z') }).record, [], 'done for the day');
  assert.equal(s.status, 'done', 'a finished league stays finished for the rest of the run');
});

test('a new run: a finished cycle is history, a recent half-done one is carried on, an old one starts again', () => {
  const { startRun } = require('./oddsCycle');
  const now = new Date('2026-11-20T12:00:00Z');
  const done = startRun({ status: 'done', cycleId: 'c1', recorded: [1, 2, 3], completeCycles: ['c1'], uploadProgress: { c1: { weeks: [1, 2, 3] } } }, now);
  assert.equal(done.status, 'waiting');
  assert.deepEqual(done.recorded, []);
  assert.deepEqual(done.completeCycles, ['c1'], 'what was already finished is kept (it may still need uploading)');
  const recent = startRun({ status: 'collecting', cycleId: 'c2', recorded: [1, 2, 3], updatedAt: '2026-11-20T11:00:00Z' }, now);
  assert.equal(recent.status, 'collecting');
  assert.equal(recent.resumed, true);
  const stale = startRun({ status: 'collecting', cycleId: 'c3', recorded: [1, 2, 3], updatedAt: '2026-11-19T08:00:00Z' }, now);
  assert.equal(stale.status, 'waiting', 'it started in a season that is long over');
  assert.deepEqual(stale.recorded, []);
  assert.equal(startRun({}, now).status, 'waiting');
});

// A fake page: it serves `perRound` fixtures per week with every selection
function fakeReader(weeksNow) {
  const fixturesOf = (league, week) => Array.from({ length: league.perRound }, (_, i) => {
    const odds = {};
    for (const [group, labels] of Object.entries(SELECTION_LIST)) { odds[group] = {}; labels.forEach((label, j) => { odds[group][label] = 10 + week + i + j; }); }
    return { week, home: `H${i}`, away: `A${i}`, odds };
  });
  return {
    weeksNow,
    async peekWeeks() { return this.weeksNow; },
    async readOdds(league, weeks) { return weeks.flatMap((week) => fixturesOf(league, week)); },
  };
}

test('the hunter runs a whole cycle with a fake page: waits, collects 3 weeks, finishes once', async () => {
  const league = { ...resolveLeagues('laliga')[0], weeks: 3 };
  const store = createOddsStore({ dir: tempDir(), league });
  const reader = fakeReader([2, 3, 1]);   // wrong order on purpose is not valid: the page lists oldest first
  reader.weeksNow = [2, 3];
  let clock = new Date('2026-11-19T00:00:00Z');
  const messages = [];
  const hunter = createOddsHunter({ league, store, reader, now: () => clock, log: (m) => messages.push(m) });
  assert.equal((await hunter.visit()).status, 'waiting');
  reader.weeksNow = [38, 1, 2];
  clock = new Date('2026-11-19T00:10:00Z');
  const second = await hunter.visit();
  assert.equal(second.status, 'collecting');
  assert.equal(second.recorded, 2);
  reader.weeksNow = [2, 3, 4];
  clock = new Date('2026-11-19T00:40:00Z');
  const third = await hunter.visit();
  assert.equal(third.justFinished, true);
  const state = store.loadState();
  assert.equal(state.status, 'done');
  assert.deepEqual(state.recorded, [1, 2, 3], 'week 4 does not exist in a 3-week season: ignored');
  assert.equal(state.completeCycles.length, 1);
  assert.equal(store.latestCompleteRecords().length, 3 * league.perRound * 32 );
  clock = new Date('2026-11-19T01:00:00Z');
  assert.equal((await hunter.visit()).recorded, 0, 'done for the day: nothing read');
  assert.ok(messages.some((m) => /CYCLE COMPLETE/.test(m)));
});

test('a week with a missing selection is not stored (it is tried again next visit)', () => {
  const league = { ...resolveLeagues('bundesliga')[0] };
  const reader = fakeReader([1]);
  return reader.readOdds(league, [1]).then((fixtures) => {
    assert.deepEqual(completeWeeks(fixtures, league), [1]);
    delete fixtures[0].odds.CS['6-0'];
    assert.deepEqual(completeWeeks(fixtures, league), []);
    assert.equal(league.perRound, 9);
  });
});

test('page labels are normalised and only wanted selections are kept', () => {
  assert.equal(normalizeLabel('TG', '0 Goals'), '0');
  assert.equal(normalizeLabel('TG', '6'), '6');
  assert.equal(normalizeLabel('CS', '4 - 1'), '4-1');
  assert.equal(normalizeLabel('HTFT', '1/x'), '1/X');
  assert.deepEqual(gridToSelections('HTFT', { '1/X': '13.70', '2/X': '15.10', '1/1': '3.01', X: '3.2' }), { '1/X': 13.7, '2/X': 15.1 });
  assert.deepEqual(gridToSelections('CS', { '6-0': '424.00', '0-6': '1,080', '1-0': '7' }), { '6-0': 424, '0-6': 1080 });
});

test('end to end: a team that missed 2 seasons with a low percentile gives ONE signal, and again only when it grows', async () => {
  const dir = tempDir();
  const league = { ...resolveLeagues('laliga')[0], weeks: 3, perRound: 1 };
  const folder = path.join(dir, league.key);
  fs.mkdirSync(folder, { recursive: true });
  const seasons = { 1: { complete: true, partial: false }, 2: { complete: true, partial: false } };
  fs.writeFileSync(path.join(folder, 'state.json'), JSON.stringify({ season: 3, lastWeek: 0, seasons }));
  const lines = [];
  for (const season of [1, 2]) for (let week = 1; week <= 3; week += 1) lines.push(JSON.stringify(match('ARS', 'AST', [0, 0], [0, 0], season, week)));   // no HT/FT 1X for anybody
  fs.writeFileSync(path.join(folder, 'matches.ndjson'), `${lines.join('\n')}\n`);
  const store = createOddsStore({ dir, league });
  const fixtures = [1, 2, 3].map((week) => ({ week, home: 'ARS', away: `T${week}`, odds: { HTFT: { '1/X': 10 + week * 2, '2/X': 20, '1/2': 30, '2/1': 40 } } }));
  store.append('c1', fixtures);
  store.saveState({ ...store.loadState(), status: 'done', completeCycles: ['c1'] });
  const rulesFile = path.join(__dirname, 'rules-of-engagement', 'rules.json');
  const outbox = [];
  const send = async (signals) => { outbox.push(...signals); return signals.map((s) => `${s.league}|${s.team}|${s.optionId}`); };
  const first = await runSignalCheck({ leagues: [league], dir, rulesFile, send });
  const ars = outbox.find((s) => s.team === 'ARS' && s.optionId === 'HTFT_1X');
  assert.ok(ars, 'ARS 1X signal');
  assert.equal(ars.missed, 2);
  assert.equal(ars.percentile, 16, 'top quarter of 3 odds = the biggest: 16');
  assert.equal(ars.stake, 500);
  assert.ok(first.sent >= 1);
  const before = outbox.length;
  await runSignalCheck({ leagues: [league], dir, rulesFile, send });
  assert.equal(outbox.length, before, 'the same signal is not sent twice');
  // a third completed season without it: the signal grew
  const state = JSON.parse(fs.readFileSync(path.join(folder, 'state.json'), 'utf8'));
  state.seasons[3] = { complete: true, partial: false };
  fs.writeFileSync(path.join(folder, 'state.json'), JSON.stringify(state));
  fs.appendFileSync(path.join(folder, 'matches.ndjson'), `${[1, 2, 3].map((week) => JSON.stringify(match('ARS', 'AST', [0, 0], [0, 0], 3, week))).join('\n')}\n`);
  await runSignalCheck({ leagues: [league], dir, rulesFile, send });
  assert.ok(outbox.length > before);
  assert.equal(outbox[outbox.length - 1].missed >= 3, true);
});

test('a failed delivery is retried at the next check', async () => {
  const dir = tempDir();
  const league = { ...resolveLeagues('epl')[0], weeks: 3, perRound: 1 };
  const folder = path.join(dir, league.key);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'state.json'), JSON.stringify({ seasons: { 1: { complete: true, partial: false }, 2: { complete: true, partial: false } } }));
  fs.writeFileSync(path.join(folder, 'matches.ndjson'), `${[1, 2].map((season) => JSON.stringify(match('MNU', 'SUN', [0, 0], [0, 0], season, 1))).join('\n')}\n`);
  const store = createOddsStore({ dir, league });
  store.append('c1', [1, 2, 3].map((week) => ({ week, home: 'MNU', away: `T${week}`, odds: { HTFT: { '1/X': 11, '2/X': 12, '1/2': 13, '2/1': 14 } } })));
  store.saveState({ ...store.loadState(), completeCycles: ['c1'] });
  const rulesFile = path.join(__dirname, 'rules-of-engagement', 'rules.json');
  let attempts = 0;
  const flaky = async (signals) => { attempts += 1; return attempts === 1 ? [] : signals.map((s) => `${s.league}|${s.team}|${s.optionId}`); };
  const one = await runSignalCheck({ leagues: [league], dir, rulesFile, send: flaky });
  assert.equal(one.sent, 0);
  const two = await runSignalCheck({ leagues: [league], dir, rulesFile, send: flaky });
  assert.ok(two.sent > 0, 'sent on the second check');
});

test('a week number outside the season is ignored', () => {
  const r = planVisit({ status: 'waiting', day: '2026-11-19' }, { today: '2026-11-19', weeksOnScreen: [1, 2, 39, 0], now: new Date(), totalWeeks: 38 });
  assert.deepEqual(r.record, [1, 2]);
});

test('a season with a hole is recorded but never counts as a season without a result', () => {
  const { createObserverStore } = require('./observerStore');
  const { usableSeasons } = require('./charts');
  const league = resolveLeagues('laliga')[0];
  const store = createObserverStore({ dir: tempDir(), league });
  const card = (week) => { const rows = []; for (let i = 1; i <= 10; i += 1) rows.push(`${i} AAA - BBB 0 - 0 1 - 0`); return require('./resultsCards').parseResultsCards(`League: 1 Week ${week} HT FT 18:00 ${rows.join(' ')}`)[0]; };
  store.ingest([card(1)]);
  store.ingest([card(2)]);
  const hole = store.ingest([card(6), card(5), card(4), card(3)].slice(0, 1));   // weeks 3, 4, 5 were never seen
  const gap = hole.events.find((event) => event.type === 'gap');
  assert.deepEqual([gap.from, gap.to, gap.weeks], [3, 5, 3]);
  for (let week = 7; week <= 38; week += 1) store.ingest([card(week)]);
  const state = store.load();
  assert.equal(state.seasons[1].complete, true);
  assert.deepEqual(state.seasons[1].gaps, [3, 4, 5]);
  assert.deepEqual(usableSeasons(state), [], 'a season with a hole cannot be used for a streak');
});

test('the season passing ends the odds cycle: 90% of the weeks is kept, less starts again', () => {
  const at = (iso) => new Date(iso);
  const done = Array.from({ length: 36 }, (_, i) => i + 1);   // 36 of 38 weeks
  const kept = planVisit({ status: 'collecting', day: '2026-11-19', cycleId: 'c1', recorded: done }, { today: '2026-11-19', weeksOnScreen: [38, 1, 2, 3].filter((w) => w !== 38), now: at('2026-11-19T02:00:00Z'), totalWeeks: 38 });
  assert.equal(kept.finished, true);
  assert.equal(kept.state.status, 'done');
  assert.equal(kept.state.partial, true);
  assert.deepEqual(kept.state.missing, [37, 38]);
  const poor = planVisit({ status: 'collecting', day: '2026-11-19', cycleId: 'c1', recorded: Array.from({ length: 25 }, (_, i) => i + 1) }, { today: '2026-11-19', weeksOnScreen: [1, 2, 3, 4], now: at('2026-11-19T02:00:00Z'), totalWeeks: 38 });
  assert.equal(poor.restarted, true);
  assert.equal(poor.state.status, 'collecting');
  assert.notEqual(poor.state.cycleId, 'c1');
  assert.deepEqual(poor.record, [1, 2, 3, 4]);
});

test('a hunter finishes a cycle when the season passes, and tells the uploader', async () => {
  const league = { ...resolveLeagues('laliga')[0], weeks: 10 };
  const store = createOddsStore({ dir: tempDir(), league });
  const stored = [];
  const finished = [];
  const reader = { weeksNow: [1, 2, 3, 4], async peekWeeks() { return this.weeksNow; }, async readOdds(lg, weeks) { return fakeReader([]).readOdds(lg, weeks); } };
  let clock = new Date('2026-11-19T00:00:00Z');
  const hunter = createOddsHunter({ league, store, reader, now: () => clock, onStored: (e) => stored.push(e), onFinished: (e) => finished.push(e) });
  await hunter.visit();
  for (const weeks of [[4, 5, 6, 7], [7, 8, 9, 10]]) { reader.weeksNow = weeks; clock = new Date(clock.getTime() + 600000); await hunter.visit(); }
  assert.equal(store.loadState().status, 'done', 'all 10 weeks recorded');
  assert.equal(finished.length, 1);
  assert.ok(stored.length >= 3);
});

test('a visit that failed is retried within minutes, not after a whole interval', () => {
  const { createVisitSchedule } = require('./visitSchedule');
  let now = 1000000;
  const league = { key: 'epl', everyMin: 25 };
  const schedule = createVisitSchedule([league], () => now);
  assert.equal(schedule.due().length, 1);
  schedule.done(league, now);
  now += 60000;
  assert.equal(schedule.due().length, 0, 'normally the next visit is 25 minutes away');
  schedule.retry(league, 120000);
  now += 119000;
  assert.equal(schedule.due().length, 0);
  now += 2000;
  assert.equal(schedule.due().length, 1, 'but after a failure it comes back after 2 minutes');
});

test('the corrected timing: 3-minute rounds, 4 rounds on screen, a window of 10 rounds', () => {
  const leagues = resolveLeagues();
  const byKey = Object.fromEntries(leagues.map((league) => [league.key, league]));
  assert.equal(byKey.epl.weeks * byKey.epl.roundMin, 114, 'a season is 114 minutes');
  assert.equal(byKey.bundesliga.weeks * byKey.bundesliga.roundMin, 51);
  assert.deepEqual([byKey.epl.everyMin, byKey.laliga.everyMin, byKey.seriea.everyMin, byKey.bundesliga.everyMin], [25, 25, 25, 12]);
  assert.deepEqual([byKey.epl.watchEverySec, byKey.laliga.watchEverySec, byKey.seriea.watchEverySec, byKey.bundesliga.watchEverySec], [20, 20, 20, 10]);
  for (const league of leagues) {
    assert.ok(league.everyMin < 10 * league.roundMin, 'the results interval is inside the window of the last 10 rounds');
    assert.ok(league.watchEverySec < league.roundMin * 60, 'the collector looks more than once per round, so no round is missed');
  }
});

test('retention: after 183 days the oldest 30 days go, the newest stay, and it repeats about monthly', async () => {
  const { pruneObserverRecords } = require('./retention');
  const dir = tempDir();
  const league = resolveLeagues('epl')[0];
  const folder = path.join(dir, league.key);
  fs.mkdirSync(folder, { recursive: true });
  const day = 86400000;
  const start = Date.parse('2026-01-01T00:00:00Z');
  const lines = [];
  for (let d = 0; d < 190; d += 1) lines.push(JSON.stringify({ season: d + 1, week: 1, home: 'A', away: 'B', ht: [0, 0], ft: [0, 0], observedAt: new Date(start + d * day + 3600000).toISOString() }));
  fs.writeFileSync(path.join(folder, 'matches.ndjson'), `${lines.join('\n')}\n`);
  fs.writeFileSync(path.join(folder, 'state.json'), JSON.stringify({ season: 190, seasons: Object.fromEntries(Array.from({ length: 190 }, (_, i) => [i + 1, { complete: true }])) }));
  // a league with only 100 days of history: nothing is removed
  const youngDir = tempDir();
  const youngFolder = path.join(youngDir, league.key);
  fs.mkdirSync(youngFolder, { recursive: true });
  fs.writeFileSync(path.join(youngFolder, 'matches.ndjson'), `${lines.slice(0, 100).join('\n')}\n`);
  const early = await pruneObserverRecords({ dir: youngDir, league, now: new Date(start + 100 * day) });
  assert.equal(early.pruned, 0, 'only 100 days of history: nothing is removed');
  const now = new Date(start + 190 * day);
  const first = await pruneObserverRecords({ dir, league, now });
  assert.ok(first.pruned >= 30 && first.pruned <= 31, `the first 30 days were removed (${first.pruned})`);
  const kept = fs.readFileSync(path.join(folder, 'matches.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(kept[0].season, first.minSeason, 'the oldest remaining record starts right after the removed 30 days');
  assert.equal(kept[kept.length - 1].season, 190, 'the newest record is untouched');
  const state = JSON.parse(fs.readFileSync(path.join(folder, 'state.json'), 'utf8'));
  assert.equal(Math.min(...Object.keys(state.seasons).map(Number)), first.minSeason, 'old seasons are dropped from the state too');
  const again = await pruneObserverRecords({ dir, league, now });
  assert.equal(again.pruned, 0, 'nothing more to remove straight away');
  // 30 days later the history is 183+ days again: another month goes
  const later = await pruneObserverRecords({ dir, league, now: new Date(start + 221 * day) });
  assert.ok(later.pruned > 0);
});

test('the chart has at most the last 12 seasons as columns', () => {
  const matches = [];
  for (let season = 1; season <= 40; season += 1) matches.push(match('ARS', 'AST', [1, 0], [1, 1], season, 1));
  const csv = toCsv({ occurrences: buildOccurrences(matches), state: { seasons: {} }, teams: ['ARS'] });
  const header = csv.split('\n')[0].split(',');
  assert.equal(header.filter((name) => name.startsWith('hits_season_')).length, 12);
  assert.ok(header.includes('hits_season_40') && !header.includes('hits_season_1'));
});

test('every league has its full team list and a name for every team', () => {
  const { NAMES } = require('./leagues');
  const sizes = Object.fromEntries(resolveLeagues().map((league) => [league.key, league.teams.length]));
  assert.deepEqual(sizes, { epl: 20, laliga: 20, seriea: 20, bundesliga: 18 });
  for (const league of resolveLeagues()) {
    for (const team of league.teams) assert.ok(NAMES[league.key][team], `${league.key} ${team} has a name`);
    assert.equal(Object.keys(NAMES[league.key]).length, league.teams.length, `${league.key}: no extra names`);
  }
  assert.equal(NAMES.laliga.LEV, 'Levante');
  assert.equal(NAMES.bundesliga.LEV, 'Bayer Leverkusen', 'the same code is a different team in another league');
});

test('the percentile table has a row for every team and stake option, with the right status', () => {
  const { buildPercentileTable, tableToCsv, signalsFrom } = require('./rulesEngine');
  const league = { ...resolveLeagues('bundesliga')[0], weeks: 3, perRound: 1 };
  const seasons = { 1: { complete: true, partial: false, gaps: [] }, 2: { complete: true, partial: false, gaps: [] } };
  const matches = [];
  for (const season of [1, 2]) for (let week = 1; week <= 3; week += 1) matches.push(match('BMU', 'HOF', [0, 0], [0, 0], season, week));
  const records = [];
  const add = (week, home, away, odds) => { for (const [sel, odd] of Object.entries(odds)) records.push({ week, home, away, group: 'HTFT', sel, odd }); };
  add(1, 'BMU', 'HOF', { '1/X': 10, '2/X': 11, '1/2': 30, '2/1': 40 });
  add(2, 'HOF', 'BMU', { '1/X': 12, '2/X': 13, '1/2': 31, '2/1': 41 });
  add(3, 'BMU', 'BVB', { '1/X': 14, '2/X': 15, '1/2': 32, '2/1': 42 });
  const rows = buildPercentileTable({ league, matches, state: { seasons }, oddsRecords: records, rules: RULES });
  const bmu1x = rows.find((row) => row.team === 'BMU' && row.optionId === 'HTFT_1X');
  assert.equal(bmu1x.teamName, 'Bayern Munich');
  assert.equal(bmu1x.odds, 3);
  // BMU's odds for HT/FT 1X: week 1 home '1/X' = 10, week 2 away '2/X' = 13, week 3 home '1/X' = 14.  Top quarter of 3 odds = the biggest 1 = 14.
  assert.equal(bmu1x.percentile, 14);
  assert.deepEqual([bmu1x.band, bmu1x.seasons, bmu1x.stake, bmu1x.missed, bmu1x.status], [0, 2, 500, 2, 'TRIGGERED']);
  assert.equal(bmu1x.seasonsToGo, 0);
  const hof = rows.find((row) => row.team === 'HOF' && row.optionId === 'HTFT_12');
  assert.ok(hof, 'every team in the odds gets a row for each option that has odds');
  assert.equal(rows.some((row) => row.status === 'odds incomplete'), true, 'a team with fewer odds than a season is marked incomplete, never triggered');
  assert.ok(signalsFrom(rows).every((row) => row.status === 'TRIGGERED'));
  const csv = tableToCsv(rows);
  assert.match(csv.split('\n')[0], /^league,team,team_name,option_id,option,odds_count,percentile,band,seasons_needed,stake_target/);
  assert.match(csv, /bundesliga,BMU,Bayern Munich,HTFT_1X,/);
});
