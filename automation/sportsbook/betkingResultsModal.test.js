const test = require('node:test');
const assert = require('node:assert/strict');
const { parseResultsText, rowsToResultsPage } = require('./betkingResultsModal');
const { createResultPoller } = require('../strategy/resultPoller');
const { createBetKingFixtureIdentity } = require('../strategy/fixtureIdentity');

// Text as shown in the owner's recording of the Results window (Week 38, HT and FT columns).
const WINDOW_TEXT = `Kings League
Standings Results
League: 49062481 Week 38 HT FT
12:48
1 NEW - ARS 0 - 0 1 - 0
2 EVE - CHE 1 - 0 2 - 0
3 BRE - AST 0 - 1 0 - 1
4 LIV - FUL 2 - 1 3 - 2
5 SUN - TOT 0 - 0 2 - 3
6 MNC - NOT 0 - 0 0 - 1
7 MNU - HUL 0 - 0 1 - 0
8 LEE - BHA 0 - 3 0 - 3
9 BOU - COV 0 - 2 0 - 2`;

test('the Results window text is read into fixtures with half-time and full-time scores', () => {
  const parsed = parseResultsText(WINDOW_TEXT);
  assert.equal(parsed.roundName, 'Week 38');
  assert.equal(parsed.rows.length, 9);
  assert.deepEqual(parsed.rows[0], { position: 1, home: 'NEW', away: 'ARS', halfTime: { home: 0, away: 0 }, fullTime: { home: 1, away: 0 } });
  assert.deepEqual(parsed.rows[3].halfTime, { home: 2, away: 1 });
  assert.deepEqual(parsed.rows[3].fullTime, { home: 3, away: 2 });
});

test('inline spacing variants and a standings-only window are handled', () => {
  assert.equal(parseResultsText('Week 5 1 NEW-ARS 0-0 1-0').rows.length, 1);
  assert.equal(parseResultsText('01 AST 0 0 0 0 0 0 0 0').rows.length, 0);
});

test('the poller verifies the Arsenal fixture from the built-in Results reader (including half-time)', async () => {
  const scheduled = createBetKingFixtureIdentity(
    { fixtureId: 'matchup-statistics-button-NEW-ARS', home: 'NEW', away: 'ARS', market: '' },
    { roundName: 'Week 38', roundId: 'Week 38' },
  );
  const poller = createResultPoller({
    readResultsPage: async () => rowsToResultsPage(parseResultsText(WINDOW_TEXT)),
    getExpectedFixture: () => ({ scheduled, live: null, results: null }),
    getActionOperationId: () => 'op-1',
    config: { minConfidence: 'MEDIUM', initialDelayMs: 0, intervalMs: 1, maxAttempts: 2 },
  });
  const outcome = await poller.startPolling({});
  assert.equal(outcome.status, 'verified');
  assert.deepEqual(outcome.result.fullTime, { home: 1, away: 0, verified: true });
  assert.deepEqual(outcome.result.halfTime, { home: 0, away: 0, verified: true });
});

test('a different round in the window is never taken as the result', async () => {
  const scheduled = createBetKingFixtureIdentity(
    { fixtureId: 'matchup-statistics-button-NEW-ARS', home: 'NEW', away: 'ARS', market: '' },
    { roundName: 'Week 39', roundId: 'Week 39' },
  );
  const poller = createResultPoller({
    readResultsPage: async () => rowsToResultsPage(parseResultsText(WINDOW_TEXT)),
    getExpectedFixture: () => ({ scheduled, live: null, results: null }),
    getActionOperationId: () => 'op-1',
    config: { minConfidence: 'MEDIUM', initialDelayMs: 0, intervalMs: 1, maxAttempts: 2 },
  });
  assert.notEqual((await poller.startPolling({})).status, 'verified');
});
