const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BETKING_STATUSES,
  classifyBetKingPage,
  inspectBetKingPage,
  matchCatalogueaFixtureToBetKing,
  readLiveFixtureSnapshot,
} = require('./sportsbook/betkingAdapter');

const mockKingsLeagueSnapshot = {
  url: 'https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league',
  title: 'Virtual Football Betting | Virtual Sports',
  league: { name: 'Kings League', key: 'kings-league' },
  selectedMarketName: '1X2',
  rounds: [
    {
      roundName: 'Week 20',
      roundId: '21',
      timer: '01:53',
      fixtures: [
        {
          fixtureId: 'IPS-ARS',
          scheduledMatchId: 'matchup-statistics-button-IPS-ARS',
          home: 'IPS',
          away: 'ARS',
          market: '1X2',
          selections: [
            { label: '1', odds: 7.61 },
            { label: 'X', odds: 4.67 },
            { label: '2', odds: 1.42 },
          ],
        },
        {
          fixtureId: 'LIV-COV',
          scheduledMatchId: 'matchup-statistics-button-LIV-COV',
          home: 'LIV',
          away: 'COV',
          market: '1X2',
          selections: [
            { label: '1', odds: 1.37 },
            { label: 'X', odds: 4.88 },
            { label: '2', odds: 8.61 },
          ],
        },
      ],
    },
  ],
};

test('detects a public King League schedule as READY_READ_ONLY', () => {
  const result = classifyBetKingPage(mockKingsLeagueSnapshot);

  assert.equal(result.status, BETKING_STATUSES.READY_READ_ONLY);
  assert.equal(result.snapshot.league.name, 'Kings League');
  assert.equal(result.snapshot.rounds[0].fixtures[0].fixtureId, 'IPS-ARS');
  assert.deepEqual(
    result.snapshot.rounds[0].fixtures[0].selections.map(({ label, odds }) => ({ label, odds })),
    [
      { label: '1', odds: 7.61 },
      { label: 'X', odds: 4.67 },
      { label: '2', odds: 1.42 },
    ],
  );
});

test('rejects malformed or empty league snapshots safely', () => {
  const emptyResult = classifyBetKingPage({});
  assert.equal(emptyResult.status, BETKING_STATUSES.PAGE_UNAVAILABLE);

  const noFixtureResult = classifyBetKingPage({
    url: 'https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league',
    title: 'Virtual Football Betting | Virtual Sports',
    league: { name: 'Kings League', key: 'kings-league' },
    rounds: [],
  });
  assert.equal(noFixtureResult.status, BETKING_STATUSES.NO_FIXTURE);
});

test('flags auth-required state when a login gate appears without a visible schedule', () => {
  const result = classifyBetKingPage({
    url: 'https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league',
    title: 'Virtual Football Betting | Virtual Sports',
    loginButtons: true,
    rounds: [],
  });

  assert.equal(result.status, BETKING_STATUSES.AUTH_REQUIRED);
});

test('flags missing market and missing odds states for incomplete page data', () => {
  const missingMarket = classifyBetKingPage({
    url: 'https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league',
    title: 'Virtual Football Betting | Virtual Sports',
    league: { name: 'Kings League', key: 'kings-league' },
    rounds: [{
      roundName: 'Week 20',
      fixtures: [{
        fixtureId: 'IPS-ARS',
        home: 'IPS',
        away: 'ARS',
        selections: [],
      }],
    }],
  });
  assert.equal(missingMarket.status, BETKING_STATUSES.NO_MARKET);

  const missingOdds = classifyBetKingPage({
    url: 'https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league',
    title: 'Virtual Football Betting | Virtual Sports',
    league: { name: 'Kings League', key: 'kings-league' },
    selectedMarketName: '1X2',
    rounds: [{
      roundName: 'Week 20',
      fixtures: [{
        fixtureId: 'IPS-ARS',
        home: 'IPS',
        away: 'ARS',
        market: '1X2',
        selections: [{ label: '1', odds: null }, { label: 'X', odds: null }, { label: '2', odds: null }],
      }],
    }],
  });
  assert.equal(missingOdds.status, BETKING_STATUSES.MISSING_ODDS);
});

test('supports a Playwright-like page object using the live observed selectors', async () => {
  const page = {
    evaluate: async () => ({
      url: 'https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league',
      title: 'Virtual Football Betting | Virtual Sports',
      league: { name: 'Kings League', key: 'kings-league' },
      selectedMarketName: '1X2',
      loginRequired: false,
      rounds: [
        {
          roundName: 'Week 20',
          fixtures: [
            {
              fixtureId: 'matchup-statistics-button-IPS-ARS',
              scheduledMatchId: 'matchup-statistics-button-IPS-ARS',
              home: 'IPS',
              away: 'ARS',
              market: '1X2',
              selections: [
                { label: '1', odds: 7.61 },
                { label: 'X', odds: 4.67 },
                { label: '2', odds: 1.42 },
              ],
            },
          ],
        },
      ],
    }),
  };

  const result = await inspectBetKingPage(page);
  assert.equal(result.status, BETKING_STATUSES.READY_READ_ONLY);
  assert.equal(result.snapshot.rounds[0].fixtures[0].fixtureId, 'matchup-statistics-button-IPS-ARS');
  assert.deepEqual(result.snapshot.rounds[0].fixtures[0].selections.map(({ label, odds }) => ({ label, odds })), [
    { label: '1', odds: 7.61 },
    { label: 'X', odds: 4.67 },
    { label: '2', odds: 1.42 },
  ]);
});

test('does not infer 1X2 selection names from odds order when labels are missing', async () => {
  const result = await inspectBetKingPage({
    evaluate: async () => ({
      url: mockKingsLeagueSnapshot.url,
      title: mockKingsLeagueSnapshot.title,
      league: { name: 'Kings League', key: 'kings-league' },
      selectedMarketName: '1X2',
      rounds: [{
        roundName: 'Week 20',
        fixtures: [{
          fixtureId: 'LIV-COV',
          home: 'LIV',
          away: 'COV',
          market: '1X2',
          selections: [{ label: '', odds: 1.37 }, { label: '', odds: 4.88 }, { label: '', odds: 8.61 }],
        }],
      }],
    }),
  });
  assert.deepEqual(result.snapshot.rounds[0].fixtures[0].selections, [
    { label: '', odds: 1.37 },
    { label: '', odds: 4.88 },
    { label: '', odds: 8.61 },
  ]);
});

test('extracts visible BetKing fixture, round, market, labels, odds, and consent evidence from the DOM', async () => {
  const makeElement = (text, attributes = {}) => ({
    textContent: text,
    tagName: 'BUTTON',
    getAttribute: (name) => attributes[name] ?? null,
    getClientRects: () => [{}],
  });
  const leagueTab = makeElement('Kings League');
  const selectedMarket = makeElement('1X2');
  const home = makeElement('LIV');
  const away = makeElement('COV');
  const statsButton = makeElement('', { 'data-testid': 'matchup-statistics-button-LIV-COV' });
  const labels = ['1', 'X', '2'].map((label) => makeElement(label));
  const odds = ['1.37', '4.88', '8.61'].map((odd) => makeElement(odd));
  const match = {
    querySelector: (selector) => ({
      '[data-testid="teams-home-name"]': home,
      '[data-testid="teams-away-name"]': away,
    }[selector] || null),
    querySelectorAll: (selector) => ({
      button: [statsButton],
      '[data-testid="selection-name"]': labels,
      '[data-testid="match-odd-value"]': odds,
    }[selector] || []),
  };
  const round = {
    querySelector: (selector) => ({
      '[data-testid="round-name"]': makeElement('Week 20'),
      '[data-testid="round-timer"]': makeElement('01:53'),
    }[selector] || null),
    querySelectorAll: (selector) => (selector === '[data-testid="match"]' ? [match] : []),
    getAttribute: (name) => (name === 'data-testid' ? 'league-round' : null),
    id: '',
  };
  const priorDocument = global.document;
  const priorLocation = global.location;
  global.document = {
    title: 'Virtual Football Betting | Virtual Sports',
    body: makeElement('Kings League Week 20'),
    querySelector: (selector) => (selector === '[data-testid="selected-market-name"]' ? selectedMarket : null),
    querySelectorAll: (selector) => ({
      '[data-testid="league-round"]': [round],
      '[data-testid^="league-switcher-tab-"]': [leagueTab],
      '[data-testid="market-selector-tab"]': [selectedMarket],
      '[data-testid="signInButton"]': [],
      '[role="dialog"], [aria-modal="true"], [data-testid*="cookie"], [data-testid*="consent"], [id*="cookie" i], [name*="cookie" i]': [],
      'a, button': [],
      '[data-testid]': [],
    }[selector] || []),
  };
  global.location = { href: mockKingsLeagueSnapshot.url };
  try {
    const result = await inspectBetKingPage({ evaluate: (callback) => callback() });
    assert.equal(result.status, BETKING_STATUSES.READY_READ_ONLY);
    assert.equal(result.snapshot.rounds[0].roundName, 'Week 20');
    assert.equal(result.snapshot.rounds[0].roundId, '');
    assert.equal(result.snapshot.rounds[0].fixtures[0].fixtureId, 'LIV-COV');
    assert.equal(
      result.snapshot.rounds[0].fixtures[0].scheduledMatchId,
      'matchup-statistics-button-LIV-COV',
    );
    assert.equal(result.snapshot.selectedMarketName, '1X2');
    assert.deepEqual(result.snapshot.rounds[0].fixtures[0].selections, [
      { label: '1', odds: 1.37 },
      { label: 'X', odds: 4.88 },
      { label: '2', odds: 8.61 },
    ]);
    assert.equal(result.snapshot.cookieConsent, false);
  } finally {
    if (priorDocument === undefined) delete global.document;
    else global.document = priorDocument;
    if (priorLocation === undefined) delete global.location;
    else global.location = priorLocation;
  }
});

test('matches a deterministic Cataloguea fixture to the same Kings League scheduled BetKing fixture', () => {
  const strategyInstruction = {
    fixture: {
      id: 'livcov',
      home: 'liv',
      away: 'cov',
    },
    recommendedAction: 'manual_result_entry',
    observedAt: '2026-10-07T11:00:00.000Z',
  };

  const result = matchCatalogueaFixtureToBetKing(strategyInstruction, mockKingsLeagueSnapshot);
  assert.equal(result.status, BETKING_STATUSES.MATCH_VERIFIED);
  assert.equal(result.fixture.betking.fixtureId, 'LIV-COV');
  assert.equal(result.fixture.betking.home, 'LIV');
  assert.equal(result.fixture.betking.away, 'COV');
  assert.deepEqual(result.market.odds, {
    '1': 1.37,
    X: 4.88,
    '2': 8.61,
  });
  assert.equal(result.match, 'VERIFIED');
  assert.equal(result.readOnly, true);
  assert.equal(result.strategy.fixtureId, 'livcov');
});

test('rejects a fixture when home or away teams do not match the strategy fixture', () => {
  const strategyInstruction = {
    fixture: {
      id: 'livcov',
      home: 'liv',
      away: 'cov',
    },
    recommendedAction: 'manual_result_entry',
    observedAt: '2026-10-07T11:00:00.000Z',
  };

  const wrongAway = matchCatalogueaFixtureToBetKing(strategyInstruction, {
    ...mockKingsLeagueSnapshot,
    rounds: [{
      roundName: 'Week 20',
      fixtures: [{
        fixtureId: 'LIV-CHE',
        scheduledMatchId: 'matchup-statistics-button-LIV-CHE',
        home: 'LIV',
        away: 'CHE',
        market: '1X2',
        selections: [{ label: '1', odds: 1.37 }, { label: 'X', odds: 4.88 }, { label: '2', odds: 8.61 }],
      }],
    }],
  });
  assert.equal(wrongAway.status, BETKING_STATUSES.FIXTURE_NOT_FOUND);

  const wrongHome = matchCatalogueaFixtureToBetKing(strategyInstruction, {
    ...mockKingsLeagueSnapshot,
    rounds: [{
      roundName: 'Week 20',
      fixtures: [{
        fixtureId: 'MNU-COV',
        scheduledMatchId: 'matchup-statistics-button-MNU-COV',
        home: 'MNU',
        away: 'COV',
        market: '1X2',
        selections: [{ label: '1', odds: 1.37 }, { label: 'X', odds: 4.88 }, { label: '2', odds: 8.61 }],
      }],
    }],
  });
  assert.equal(wrongHome.status, BETKING_STATUSES.FIXTURE_NOT_FOUND);
});

test('rejects wrong league and ambiguous fixture selections without guessing', () => {
  const strategyInstruction = {
    fixture: {
      id: 'livcov',
      home: 'liv',
      away: 'cov',
    },
    recommendedAction: 'manual_result_entry',
    observedAt: '2026-10-07T11:00:00.000Z',
  };

  const wrongLeague = matchCatalogueaFixtureToBetKing(strategyInstruction, {
    ...mockKingsLeagueSnapshot,
    league: { name: 'Premier League', key: 'premier-league' },
  });
  assert.equal(wrongLeague.status, BETKING_STATUSES.NO_LEAGUE);

  const ambiguous = matchCatalogueaFixtureToBetKing(strategyInstruction, {
    ...mockKingsLeagueSnapshot,
    rounds: [
      { roundName: 'Week 20', fixtures: [{ fixtureId: 'LIV-COV', scheduledMatchId: 'matchup-statistics-button-LIV-COV', home: 'LIV', away: 'COV', market: '1X2', selections: [{ label: '1', odds: 1.9 }, { label: 'X', odds: 3.1 }, { label: '2', odds: 4.2 }] }] },
      { roundName: 'Week 21', fixtures: [{ fixtureId: 'LIV-COV', scheduledMatchId: 'matchup-statistics-button-LIV-COV', home: 'LIV', away: 'COV', market: '1X2', selections: [{ label: '1', odds: 1.8 }, { label: 'X', odds: 3.5 }, { label: '2', odds: 4.1 }] }] },
    ],
  });
  assert.equal(ambiguous.status, BETKING_STATUSES.AMBIGUOUS_FIXTURE);
});

test('ensures read-only strategy comparison does not mutate the strategy state', () => {
  const strategyInstruction = {
    fixture: {
      id: 'livcov',
      home: 'liv',
      away: 'cov',
    },
    recommendedAction: 'manual_result_entry',
    observedAt: '2026-10-07T11:00:00.000Z',
    strategyState: { status: 'stakes_available' },
  };
  const before = JSON.parse(JSON.stringify(strategyInstruction));

  const result = matchCatalogueaFixtureToBetKing(strategyInstruction, mockKingsLeagueSnapshot);
  assert.equal(result.status, BETKING_STATUSES.MATCH_VERIFIED);
  assert.deepEqual(strategyInstruction, before);
  assert.equal(strategyInstruction.strategyState.status, 'stakes_available');
});

test('live fixture extraction requires explicit selectors and reads only supplied DOM fields', async () => {
  const selectors = Object.fromEntries([
    'fixtureId',
    'home',
    'away',
    'roundId',
    'clock',
    'homeScore',
    'awayScore',
    'status',
  ].map((key) => [key, { selector: `[data-test="${key}"]` }]));
  const values = {
    fixtureId: 'LIV-COV',
    home: 'LIV',
    away: 'COV',
    roundId: '21',
    clock: '45',
    homeScore: '2',
    awayScore: '1',
    status: 'IN_PROGRESS',
  };
  const page = {
    evaluate: async (callback, selectorMap) => {
      const priorDocument = global.document;
      global.document = {
        querySelector: (selector) => {
          const key = Object.keys(selectorMap).find(
            (candidate) => selectorMap[candidate].selector === selector,
          );
          return key
            ? {
              textContent: values[key],
              getAttribute: () => null,
              getClientRects: () => [{}],
            }
            : null;
        },
      };
      try {
        return callback(selectorMap);
      } finally {
        if (priorDocument === undefined) delete global.document;
        else global.document = priorDocument;
      }
    },
  };

  await assert.rejects(
    readLiveFixtureSnapshot(page),
    /Explicitly observed live-fixture selectors are required/,
  );
  const observed = await readLiveFixtureSnapshot(page, selectors);
  assert.deepEqual(observed.fixture, {
    id: 'LIV-COV',
    home: 'LIV',
    away: 'COV',
    roundId: '21',
  });
  assert.equal(observed.clock, '45');
  assert.equal(observed.status, 'IN_PROGRESS');
  assert.match(observed.observedAt, /^\d{4}-\d\d-\d\dT/);
});
