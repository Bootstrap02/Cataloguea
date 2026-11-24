const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseResultsCards } = require('./resultsCards');
const { createObserverStore } = require('./observerStore');
const { resolveLeagues } = require('./leagues');

// Week 28 of La Liga exactly as the Results window shows it (from the owner's screen recording).
const WEEK28 = 'League: 53162839 Week 28 HT FT 18:25 1 ATM - RAY 0 - 0 0 - 0 2 OSA - RMA 0 - 0 2 - 2 3 VIL - CEL 3 - 0 3 - 2 4 RSO - ESP 1 - 0 4 - 0 5 BET - ALV 0 - 0 1 - 0 6 RST - GET 0 - 1 0 - 2 7 ATH - LEV 0 - 0 0 - 2 8 MLG - BAR 0 - 2 1 - 4 9 DLC - SEV 0 - 1 0 - 1 10 ELC - VAL 0 - 1 1 - 2';

function card(week, leagueId = '53162839', clock = '18:00') {
  const rows = [];
  for (let i = 1; i <= 10; i += 1) rows.push(`${i} AAA - BBB ${i % 3} - 0 ${i % 4} - ${i % 2}`);
  return `League: ${leagueId} Week ${week} HT FT ${clock} ${rows.join(' ')}`;
}
const page = (...weeks) => parseResultsCards(`Standings Results ${weeks.map((week) => card(week)).join(' ')}`);   // newest first

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'observer-'));
const laliga = resolveLeagues('laliga')[0];
const bundesliga = resolveLeagues('bundesliga')[0];

test('one real card from the recording is read completely', () => {
  const [one] = parseResultsCards(`Kings Liga Standings Results ${WEEK28}`);
  assert.equal(one.week, 28);
  assert.equal(one.leagueId, '53162839');
  assert.equal(one.clock, '18:25');
  assert.equal(one.rows.length, 10);
  assert.equal(one.complete, true);
  assert.deepEqual(one.rows[7], { position: 8, home: 'MLG', away: 'BAR', ht: [0, 2], ft: [1, 4] });
  assert.deepEqual(one.rows[1], { position: 2, home: 'OSA', away: 'RMA', ht: [0, 0], ft: [2, 2] });
});

test('several cards: every card keeps its own week and rows, newest first', () => {
  const cards = page(22, 21, 20);
  assert.deepEqual(cards.map((c) => c.week), [22, 21, 20]);
  assert.ok(cards.every((c) => c.rows.length === 10 && c.complete));
});

test('a card with fewer than 10 rows is marked incomplete (it is not recorded yet)', () => {
  const [partial] = parseResultsCards(`League: 55006 Week 5 HT FT 18:00 1 MNU - SUN 1 - 0 2 - 0 2 NOT - BHA 1 - 0 2 - 0`);
  assert.equal(partial.complete, false);
});

test('first visit: the last 10 rounds are recorded oldest first as a partial season', () => {
  const store = createObserverStore({ dir: tempDir(), league: laliga });
  const result = store.ingest(page(28, 27, 26, 25, 24, 23, 22, 21, 20, 19));
  assert.equal(result.added, 10);
  assert.equal(result.matches, 100);
  assert.equal(result.state.season, 1);
  assert.equal(result.state.lastWeek, 28);
  assert.equal(result.state.seasons[1].partial, true);
  const lines = fs.readFileSync(store.matchesFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines[0].week, 19);
  assert.equal(lines[99].week, 28);
});

test('the next visit records only the weeks after where it stopped', () => {
  const store = createObserverStore({ dir: tempDir(), league: laliga });
  store.ingest(page(28, 27, 26, 25, 24, 23, 22, 21, 20, 19));
  const again = store.ingest(page(28, 27, 26, 25, 24, 23, 22, 21, 20, 19));
  assert.equal(again.added, 0);
  const next = store.ingest(page(29, 28, 27, 26, 25, 24, 23, 22, 21, 20));
  assert.equal(next.added, 1);
  assert.equal(next.matches, 10);
  assert.equal(next.state.lastWeek, 29);
  const two = store.ingest(page(31, 30, 29, 28, 27, 26, 25, 24, 23, 22));
  assert.equal(two.added, 2);
  assert.deepEqual(two.events.filter((e) => e.type === 'week').map((e) => e.week), [30, 31]);
});

test('week 38 completes the season and week 1 starts the next one', () => {
  const store = createObserverStore({ dir: tempDir(), league: laliga });
  store.ingest(page(37, 36, 35));
  const end = store.ingest(page(38, 37, 36));
  assert.ok(end.events.some((e) => e.type === 'season-complete' && e.season === 1));
  assert.equal(end.state.seasons[1].complete, true);
  const rollover = store.ingest(page(2, 1, 38, 37, 36));
  assert.equal(rollover.state.season, 2);
  assert.equal(rollover.state.lastWeek, 2);
  assert.equal(rollover.state.seasons[2].partial, false);
  assert.ok(rollover.events.some((e) => e.type === 'season-started' && e.season === 2 && e.firstWeek === 1));
});

test('the Bundesliga season has 34 weeks', () => {
  const store = createObserverStore({ dir: tempDir(), league: bundesliga });
  const result = store.ingest(page(34, 33));
  assert.ok(result.events.some((e) => e.type === 'season-complete'));
  assert.equal(bundesliga.everyMin, 12);
  assert.equal(laliga.everyMin, 25);
});

test('the state survives a restart (a new store on the same folder carries on)', () => {
  const dir = tempDir();
  createObserverStore({ dir, league: laliga }).ingest(page(10, 9));
  const again = createObserverStore({ dir, league: laliga }).ingest(page(11, 10, 9));
  assert.equal(again.added, 1);
  assert.equal(again.state.season, 1);
});

test('league selection and interval overrides', () => {
  assert.deepEqual(resolveLeagues('epl,seriea').map((l) => l.key), ['epl', 'seriea']);
  assert.equal(resolveLeagues('epl', { OBSERVER_EVERY_EPL_MIN: '20' })[0].everyMin, 20);
  assert.equal(resolveLeagues().length, 4);
});

test('a card of another league is recognised and refused', () => {
  const { belongsToLeague } = require('./leagueCheck');
  const eplCard = parseResultsCards('League: 55006 Week 22 HT FT 18:27 1 MNU - SUN 1 - 0 2 - 0 2 NOT - BHA 1 - 0 2 - 0 3 FUL - COV 0 - 2 1 - 2 4 LEE - CHE 0 - 0 1 - 2 5 BRE - EVE 1 - 1 2 - 1 6 NEW - CRY 2 - 0 4 - 0 7 LIV - HUL 0 - 0 0 - 0 8 AST - MNC 0 - 3 2 - 3 9 BOU - TOT 0 - 0 1 - 0 10 ARS - IPS 3 - 0 5 - 0')[0];
  const [liga] = parseResultsCards(`Kings Liga ${WEEK28}`);
  const [epl] = resolveLeagues('epl');
  const [laligaLeague] = resolveLeagues('laliga');
  const [seriea] = resolveLeagues('seriea');
  assert.equal(belongsToLeague(laligaLeague, liga), true);
  assert.equal(belongsToLeague(laligaLeague, eplCard), false, 'EPL rounds shown while La Liga was asked for');
  assert.equal(belongsToLeague(epl, eplCard), true);
  assert.equal(belongsToLeague(seriea, liga), false, 'Serie A must not look like La Liga');
  assert.equal(belongsToLeague(seriea, parseResultsCards('League: 7 Week 3 HT FT 18:00 1 JUV - MIL 1 - 0 2 - 0 2 INT - NAP 0 - 0 1 - 1')[0]), true);
});

test('a Bundesliga round has 9 matches and counts as complete with 9', () => {
  const [bundesliga] = resolveLeagues('bundesliga');
  const rows = ['BMU - HOF 1 - 2 1 - 3', 'BRE - LEV 0 - 0 0 - 2', 'RBL - ELV 3 - 0 3 - 1', 'BVB - PAD 2 - 1 2 - 1', 'FRA - MGB 1 - 0 3 - 0', 'AUG - STU 1 - 2 1 - 4', 'HSV - FRE 0 - 2 1 - 3', 'KOE - MNZ 0 - 1 2 - 1', 'SCH - UBE 0 - 0 0 - 0'];
  const text = `League: 53169125 Week 16 HT FT 18:13 ${rows.map((row, i) => `${i + 1} ${row}`).join(' ')}`;
  const [asTen] = parseResultsCards(text);
  const [asNine] = parseResultsCards(text, { rowsPerRound: bundesliga.perRound });
  assert.equal(asTen.complete, false, 'with the default of 10 the round would have been refused');
  assert.equal(asNine.complete, true);
  assert.equal(asNine.rows.length, 9);
  assert.equal(bundesliga.perRound, 9);
});
