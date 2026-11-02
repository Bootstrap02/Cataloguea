const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { fixtureUrl } = require('./controller');
const { createAutomationConfig } = require('./config');
const {
  BETKING_TARGET_URL,
  DEFAULT_PROFILE_DIR,
  dismissOptionalCookieConsent,
  inspectRoundNavigation,
  redactText,
  redactUrl,
  sanitize,
  writeInspectionReport,
  inspectAvailableMarkets,
  inspectScheduledFixtureDetails,
  inspectBetKingReadOnly,
} = require('./betkingInspect');
const { BETKING_STATUSES } = require('./sportsbook/betkingAdapter');

const readySnapshot = {
  status: BETKING_STATUSES.READY_READ_ONLY,
  reason: 'Read-only fixture and market data available.',
  snapshot: {
    url: BETKING_TARGET_URL,
    title: 'BetKing virtual football',
    league: { name: 'Kings League', key: 'kings-league' },
    selectedMarketName: '1X2',
    marketCategories: ['1X2', 'Double Chance', 'O/U 2.5'],
    cookieConsent: true,
    blockingOverlays: [{ text: 'Cookie choices', selector: '[role="dialog"]' }],
    loginRequired: false,
    accessRestricted: false,
    rounds: [{
      roundName: 'Week 20',
      roundId: '21',
      timer: '01:53',
      fixtures: [{
        fixtureId: 'ARS-COV',
        scheduledMatchId: 'matchup-statistics-button-ARS-COV',
        home: 'ARS',
        away: 'COV',
        market: '1X2',
        selections: [{ label: '1', odds: 1.37 }, { label: 'X', odds: 4.88 }, { label: '2', odds: 8.61 }],
        selectors: { market: '[data-testid="selected-market-name"]' },
      }],
    }],
  },
};

function stubDependencies({
  result = readySnapshot,
  navigationError,
  waitError,
  events = [],
} = {}) {
  const page = { click: async () => events.push('click') };
  return {
    page,
    dependencies: {
      launchBrowser: async (options) => {
        events.push(['launch', options]);
        return {
          page,
          close: async () => events.push('close'),
        };
      },
      navigateTo: async (receivedPage, url, options) => {
        assert.equal(receivedPage, page);
        events.push(['navigate', url, options]);
        if (navigationError) throw navigationError;
      },
      waitForUsablePage: async () => {
        events.push('wait');
        if (waitError) throw waitError;
      },
      inspectBetKingPage: async () => {
        events.push('inspect');
        return result;
      },
    },
    events,
  };
}

test('real inspection explicitly navigates to BetKing using the existing page adapter contract', async () => {
  const { dependencies, events, page } = stubDependencies();
  const report = await inspectBetKingReadOnly({ dependencies });
  const launch = events.find((event) => Array.isArray(event) && event[0] === 'launch')[1];
  assert.equal(launch.headless, false);
  assert.equal(launch.userDataDir, DEFAULT_PROFILE_DIR);
  assert.equal(path.isAbsolute(launch.userDataDir), true);
  assert.equal(events.find((event) => Array.isArray(event) && event[0] === 'navigate')[1], BETKING_TARGET_URL);
  assert.equal(BETKING_TARGET_URL, 'https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league');
  assert.equal(fixtureUrl.startsWith('file:'), true);
  assert.notEqual(BETKING_TARGET_URL, fixtureUrl);
  assert.equal(report.status, BETKING_STATUSES.READY_READ_ONLY);
  assert.equal(report.page.league.name, 'Kings League');
  assert.equal(report.rounds[0].fixtures[0].fixtureId, 'ARS-COV');
  assert.equal(report.markets[0].marketName, '1X2');
  assert.deepEqual(report.markets[0].selections, readySnapshot.snapshot.rounds[0].fixtures[0].selections);
  assert.equal(report.readOnly, true);
  assert.equal(typeof page.click, 'function');
  assert.equal(events.includes('click'), false);
  assert.equal(events.at(-1), 'close');
});

test('visible market tabs are inspected without selecting any betting outcome', async () => {
  let currentMarket = '1X2';
  const clickedTabs = [];
  const names = ['1X2', 'Double Chance'];
  const makeTab = (name) => ({
    innerText: async () => name,
    click: async () => {
      clickedTabs.push(name);
      currentMarket = name;
    },
  });
  const tabs = names.map(makeTab);
  const locator = {
    count: async () => tabs.length,
    nth: (index) => tabs[index],
    filter: ({ hasText }) => ({ first: () => makeTab(hasText) }),
  };
  const page = {
    getByTestId: (testId) => {
      assert.equal(testId, 'market-selector-tab');
      return locator;
    },
    waitForFunction: async (_callback, expectedName) => {
      assert.equal(currentMarket, expectedName);
    },
  };
  const initial = {
    ...readySnapshot,
    snapshot: { ...readySnapshot.snapshot, cookieConsent: false },
  };
  const inspected = await inspectAvailableMarkets(page, initial, {
    inspect: async () => ({
      ...readySnapshot,
      snapshot: { ...readySnapshot.snapshot, selectedMarketName: currentMarket },
    }),
    timeoutMs: 100,
  });
  assert.deepEqual(clickedTabs, ['Double Chance', '1X2']);
  assert.deepEqual(inspected.inspected.map(({ name }) => name), ['1X2', 'Double Chance']);
  assert.deepEqual(inspected.skipped, []);
});

test('cookie consent is not accepted and blocks market-tab interaction', async () => {
  const initial = readySnapshot;
  const inspected = await inspectAvailableMarkets({
    getByTestId: () => {
      throw new Error('Market tab interaction must not proceed behind cookie consent.');
    },
  }, initial);
  assert.equal(inspected.inspected.length, 1);
  assert.deepEqual(inspected.skipped.map(({ name }) => name), ['Double Chance', 'O/U 2.5']);
  assert.match(inspected.skipped[0].reason, /no consent choice/);
});

test('cookie dismissal only chooses an explicitly essential-only or rejection control', async () => {
  let clicked;
  const page = {
    locator: (selector) => ({
      getByRole: (role, options) => ({
        click: async () => {
          clicked = { selector, role, options };
        },
      }),
    }),
  };
  const essential = await dismissOptionalCookieConsent(page, {
    blockingOverlays: [{
      selector: '#cookiebanner',
      buttons: ['Accept all', 'Only necessary'],
    }],
  }, 500);
  assert.equal(essential, 'optional_cookies_rejected');
  assert.deepEqual(clicked, {
    selector: '#cookiebanner',
    role: 'button',
    options: { name: 'Only necessary', exact: true },
  });

  clicked = undefined;
  const noSafeChoice = await dismissOptionalCookieConsent(page, {
    blockingOverlays: [{
      selector: '#cookiebanner',
      buttons: ['Accept all', 'Customize'],
    }],
  }, 500);
  assert.equal(noSafeChoice, null);
  assert.equal(clicked, undefined);

  let clickedText;
  const visibleTextPage = {
    getByText: (text, options) => ({
      click: async () => {
        clickedText = { text, options };
      },
    }),
  };
  const visibleAction = await dismissOptionalCookieConsent(visibleTextPage, {
    blockingOverlays: [{
      selector: '#cookiebanner',
      buttons: [],
      visibleActions: ['ACCEPT ALL COOKIES', 'REJECT OPTIONAL COOKIES'],
    }],
  }, 500);
  assert.equal(visibleAction, 'optional_cookies_rejected');
  assert.deepEqual(clickedText, {
    text: 'REJECT OPTIONAL COOKIES',
    options: { exact: true },
  });
});

test('fixture-detail inspection activates only the visible matchup-statistics identity', async () => {
  let activated;
  const page = {
    url: () => BETKING_TARGET_URL,
    getByTestId: (testId) => ({
      click: async () => {
        activated = testId;
      },
    }),
    waitForTimeout: async () => {},
  };
  const detail = await inspectScheduledFixtureDetails(page, {
    ...readySnapshot.snapshot,
    cookieConsent: false,
  }, {
    timeoutMs: 100,
    inspect: async () => ({
      ...readySnapshot,
      snapshot: {
        ...readySnapshot.snapshot,
        blockingOverlays: [{ selector: '[role="dialog"]', text: 'Fixture statistics' }],
        liveEvidence: [],
      },
    }),
  });
  assert.equal(activated, 'matchup-statistics-button-ARS-COV');
  assert.equal(detail.status, 'DETAIL_VIEW_OPENED');
  assert.equal(detail.fixture.fixtureId, 'ARS-COV');

  activated = undefined;
  const blocked = await inspectScheduledFixtureDetails(page, {
    ...readySnapshot.snapshot,
    cookieConsent: true,
  }, { timeoutMs: 100 });
  assert.equal(blocked.status, 'BLOCKED_BY_COOKIE_CONSENT');
  assert.equal(activated, undefined);
});

test('real-site navigation errors surface and never fall back to the local fixture', async () => {
  const failure = new Error('Navigation to BetKing failed: net::ERR_NAME_NOT_RESOLVED');
  const { dependencies, events } = stubDependencies({ navigationError: failure });
  const report = await inspectBetKingReadOnly({ dependencies });
  assert.equal(report.status, 'NAVIGATION_FAILED');
  assert.match(report.reason, /ERR_NAME_NOT_RESOLVED/);
  assert.equal(report.pageClassification, 'navigation_failed');
  assert.deepEqual(report.reconnaissance.snapshots.map(({ phase }) => phase), ['before_navigation']);
  assert.equal(events.some((event) => Array.isArray(event) && event[0] === 'navigate' && event[1] === fixtureUrl), false);
  assert.equal(events.at(-1), 'close');
});

test('login-required and access-restricted states are reported clearly without interaction', async () => {
  const auth = {
    ...readySnapshot,
    status: BETKING_STATUSES.AUTH_REQUIRED,
    reason: 'Sign-in required.',
    snapshot: { ...readySnapshot.snapshot, loginRequired: true, rounds: [] },
  };
  const authRun = stubDependencies({ result: auth });
  const authReport = await inspectBetKingReadOnly({ dependencies: authRun.dependencies });
  assert.equal(authReport.status, BETKING_STATUSES.AUTH_REQUIRED);
  assert.equal(authReport.page.loginRequired, true);
  assert.equal(authReport.markets.length, 0);

  const restricted = {
    ...readySnapshot,
    status: BETKING_STATUSES.ACCESS_RESTRICTED,
    reason: 'Access denied.',
    snapshot: { ...readySnapshot.snapshot, accessRestricted: true },
  };
  const restrictedRun = stubDependencies({ result: restricted });
  const restrictedReport = await inspectBetKingReadOnly({ dependencies: restrictedRun.dependencies });
  assert.equal(restrictedReport.status, BETKING_STATUSES.ACCESS_RESTRICTED);
  assert.equal(restrictedReport.page.accessRestricted, true);
});

test('bounded page usability timeout fails safely and closes the browser', async () => {
  const timeout = new Error('page usability timed out');
  const { dependencies, events } = stubDependencies({ waitError: timeout });
  await assert.rejects(inspectBetKingReadOnly({ dependencies }), /page usability timed out/);
  assert.equal(events.includes('inspect'), false);
  assert.equal(events.at(-1), 'close');
});

test('manual login is user-controlled and completes before the page is inspected', async () => {
  const run = stubDependencies();
  run.dependencies.waitForManualInspection = async (timeout) => {
    run.events.push('manual-login');
    assert.equal(timeout, createAutomationConfig({}).manualLoginTimeoutMs);
    return true;
  };
  run.dependencies.inspectBetKingPage = async () => {
    run.events.push('inspect');
    return readySnapshot;
  };
  const report = await inspectBetKingReadOnly({ dependencies: run.dependencies });
  assert.equal(report.status, BETKING_STATUSES.READY_READ_ONLY);
  assert.ok(run.events.lastIndexOf('inspect') > run.events.indexOf('manual-login'));
  assert.equal(report.manualInspection.status, 'RESUMED');
  assert.deepEqual(report.reconnaissance.snapshots.map(({ phase }) => phase), [
    'before_navigation',
    'after_navigation',
    'after_manual_pause',
    'after_automated_collection',
  ]);
});

test('persistent-profile configuration requires an absolute path and manual login timeout is bounded', () => {
  assert.throws(
    () => createAutomationConfig({ AUTOMATION_BETKING_PROFILE_DIR: 'relative/profile' }),
    /absolute path/,
  );
  assert.throws(
    () => createAutomationConfig({ AUTOMATION_BETKING_MANUAL_LOGIN_TIMEOUT_MS: '120001' }),
    /between 1 and 120000/,
  );
});

test('sensitive values are redacted from text, URLs, and structured report fields', () => {
  assert.equal(redactText('Authorization: Bearer abc.def.ghi token=secret-value'), 'Authorization=[REDACTED] [REDACTED] token=[REDACTED]');
  assert.equal(redactUrl('https://user:pass@example.test/page?session=secret&view=live#token'), 'https://example.test/page?session=%5BREDACTED%5D&view=%5BREDACTED%5D');
  assert.equal(redactUrl('/login?session=private&return=%2Fhome'), '/login?session=%5BREDACTED%5D&return=%5BREDACTED%5D');
  assert.deepEqual(sanitize({
    cookie: 'private',
    cookieConsent: false,
    href: '/join?token=private',
    title: 'session_token=abc',
    nested: { score: 2 },
  }), {
    cookie: '[REDACTED]',
    cookieConsent: false,
    href: '/join?token=[REDACTED]',
    title: 'session_token=[REDACTED]',
    nested: { score: 2 },
  });
});

test('round navigation only activates observed round controls and records the resulting DOM', async () => {
  let selectedRound = 'Week 21';
  const buttons = ['Week 21', 'Week 22'].map((name, index) => ({
    innerText: async () => name,
    getAttribute: async () => `round-switcher-button-${21 + index}-${index}`,
    click: async () => { selectedRound = name; },
  }));
  const locator = {
    count: async () => buttons.length,
    nth: (index) => buttons[index],
  };
  const page = {
    locator: (selector) => {
      assert.equal(selector, '[data-testid^="round-switcher-button-"]');
      return locator;
    },
    waitForFunction: async (_callback, roundName) => assert.equal(selectedRound, roundName),
    url: () => BETKING_TARGET_URL,
  };
  const result = await inspectRoundNavigation(page, {
    rounds: [{ roundName: 'Week 21', fixtures: [] }],
  }, {
    inspect: async () => ({
      status: BETKING_STATUSES.READY_READ_ONLY,
      snapshot: { url: BETKING_TARGET_URL, rounds: [{ roundName: selectedRound, fixtures: [{}, {}] }] },
    }),
  });
  assert.equal(result.status, 'VISIBLE_ROUND_CONTROLS_INSPECTED');
  assert.deepEqual(result.rounds.map(({ roundName, fixtureCount }) => ({ roundName, fixtureCount })), [
    { roundName: 'Week 21', fixtureCount: 2 },
    { roundName: 'Week 22', fixtureCount: 2 },
  ]);
  assert.equal(result.initialRoundControlReactivated, true);
  assert.equal(selectedRound, 'Week 21');
});

test('inspection report generation writes readable local JSON and Markdown safely', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cataloguea-betking-report-'));
  try {
    const paths = await writeInspectionReport({
      status: 'PAGE_UNAVAILABLE',
      targetUrl: BETKING_TARGET_URL,
      page: { title: 'Unavailable', url: 'https://m.betking.com/?token=private' },
      reason: 'No fixture result was found.',
      reconnaissance: { navigation: [], snapshots: [], requests: [] },
    }, directory);
    const json = await fs.readFile(paths.jsonPath, 'utf8');
    const markdown = await fs.readFile(paths.markdownPath, 'utf8');
    assert.match(json, /PAGE_UNAVAILABLE/);
    assert.doesNotMatch(json, /private/);
    assert.match(markdown, /BetKing real-site inspection/);
    assert.match(markdown, /No fixture result was found/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('scheduled round countdown is never represented as a real match clock', async () => {
  const { dependencies } = stubDependencies();
  const report = await inspectBetKingReadOnly({ dependencies });
  assert.deepEqual(report.clockEvidence.scheduledRoundCountdown, [{
    roundName: 'Week 20',
    timer: '01:53',
    classification: 'SCHEDULED_ROUND_COUNTDOWN_NOT_MATCH_CLOCK',
  }]);
  assert.deepEqual(report.clockEvidence.matchClockEvidence, []);
});

test('manual persistent-profile restart is only reported as verified when public page state survives', async () => {
  const run = stubDependencies();
  const launchOptions = [];
  run.dependencies.launchBrowser = async (options) => {
    launchOptions.push(options);
    const page = {
      url: () => BETKING_TARGET_URL,
      evaluate: async () => ({
        url: BETKING_TARGET_URL,
        title: 'Virtual Football Betting | Virtual Sports',
        headings: [],
        navigationItems: [],
        buttons: [],
        links: [],
        fixtureCards: [],
        marketTabs: [],
        relevantVisibleText: [],
      }),
      on: () => {},
      mainFrame: () => ({}),
      addInitScript: async () => {},
    };
    return { page, close: async () => {} };
  };
  run.dependencies.navigateTo = async () => {};
  run.dependencies.waitForUsablePage = async () => {};
  run.dependencies.inspectBetKingPage = async () => ({
    ...readySnapshot,
    snapshot: { ...readySnapshot.snapshot, signInButtonVisible: false },
  });
  const report = await inspectBetKingReadOnly({
    config: createAutomationConfig({}),
    dependencies: { ...run.dependencies, manualLoginRequested: true },
  });
  assert.equal(launchOptions.length, 2);
  assert.equal(launchOptions[0].headless, false);
  assert.equal(launchOptions[0].userDataDir, launchOptions[1].userDataDir);
  assert.equal(report.sessionReuse.authenticatedReuseVerified, true);
});
