const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createAutomationConfig } = require('./config');
const browserManager = require('./browser/browserManager');
const { navigateTo } = require('./browser/navigation');
const { BETKING_STATUSES, inspectBetKingPage } = require('./sportsbook/betkingAdapter');
const { STRATEGY_BET_TYPES, UNRESOLVED_MARKET } = require('./strategy/canonicalBetTypes');

const BETKING_TARGET_URL = 'https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league';
const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.cataloguea', 'betking-profile');
const DEFAULT_REPORT_DIR = path.join(__dirname, 'artifacts', 'betking-inspection');

const LIVE_MATCH_SELECTORS = Object.freeze({
  liveSection: '[data-testid="live-section"], [data-testid="live-tab"], [role="tab"]:has-text("Live"), a[href*="/live"]',
  leagueTabs: '[data-testid^="league-switcher-tab-"], [role="tab"][data-testid*="league"]',
  liveFixtures: '[data-testid="live-match"], [data-testid="match"][data-live="true"], [data-testid="fixture"][data-status="live"]',
  matchCard: '[data-testid="match"], [data-testid="fixture"], [data-testid="live-match"]',
  homeTeam: '[data-testid="teams-home-name"], [data-testid="home-team"], .home-team',
  awayTeam: '[data-testid="teams-away-name"], [data-testid="away-team"], .away-team',
  homeScore: '[data-testid="home-score"], [data-testid="score-home"], .home-score',
  awayScore: '[data-testid="away-score"], [data-testid="score-away"], .away-score',
  matchClock: '[data-testid="match-clock"], [data-testid="minute"], [data-testid="clock"], .match-minute, .match-clock',
  matchStatus: '[data-testid="match-status"], [data-testid="status"], [data-testid="phase"]',
  halfTimeIndicator: '[data-testid="half-time"], [data-testid="ht"], .half-time',
  fullTimeIndicator: '[data-testid="full-time"], [data-testid="ft"], .full-time',
  goalEvents: '[data-testid="goal"], [data-testid="event-goal"], .goal-event',
  marketPanel: '[data-testid="market-panel"], [data-testid="markets"], [role="tablist"][data-testid*="market"]',
  marketTabs: '[data-testid="market-tab"], [data-testid="market-selector-tab"], [role="tab"][data-testid*="market"]',
  resultsLink: '[data-testid="results-link"], [data-testid="results-tab"], a[href*="/results"], button:has-text("Results")',
  resultsSection: '[data-testid="results"], [data-testid="results-section"], [data-testid="match-results"]',
  completedFixtures: '[data-testid="completed-match"], [data-testid="finished-match"], [data-testid="result-match"]',
  fixtureId: '[data-testid="match-id"], [data-testid="fixture-id"], [data-match-id]',
  roundInfo: '[data-testid="round-name"], [data-testid="round"], [data-round]',
});

function redactText(value) {
  return String(value ?? '')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/._=-]+/gi, '$1 [REDACTED]')
    .replace(/\b(authorization|cookie|set-cookie|password|passwd|token|access[_-]?token|refresh[_-]?token|session[_-]?(?:id|token)|api[_-]?key)\s*[:=]\s*[^,\s;]+/gi, '$1=[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\+?\d[\d ().-]{7,}\d)\b/g, '[REDACTED_PHONE]')
    .slice(0, 12000);
}

function redactUrl(value) {
  try {
    const absoluteInput = /^[a-z][a-z\d+.-]*:/i.test(String(value));
    const parsed = new URL(value, 'https://redaction.invalid');
    parsed.username = '';
    parsed.password = '';
    for (const key of parsed.searchParams.keys()) parsed.searchParams.set(key, '[REDACTED]');
    parsed.hash = '';
    return redactText(absoluteInput
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}`);
  } catch {
    return redactText(value);
  }
}

function sanitize(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /^(?:url|href)$/i.test(key) && typeof item === 'string'
      ? redactUrl(item)
      : !/^cookieConsent(?:Choice)?$/.test(key)
        && /cookie|authorization|password|token|secret|credential/i.test(key)
      ? '[REDACTED]'
      : sanitize(item),
  ]));
}

function createObservationRecorder(page) {
  const recorder = { navigation: [], requests: [], responseTasks: [] };
  const observedDataKeys = new Set([
    'rounds',
    'roundId',
    'roundName',
    'fixtures',
    'fixture',
    'fixtureResults',
    'results',
    'matchId',
    'matchName',
    'homeTeam',
    'awayTeam',
    'homeScore',
    'awayScore',
    'halfTimeScore',
    'fullTimeScore',
    'halfTime',
    'fullTime',
    'score',
    'scores',
    'clock',
    'status',
    'phase',
    'selectionsByMarket',
    'oddsByMarket',
    'marketName',
    'selectionName',
    'selection',
    'odds',
    'home',
    'away',
  ]);
  const projectObservedData = (value, depth = 0) => {
    if (depth > 5 || value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      return typeof value === 'string' ? redactText(value).slice(0, 120) : value;
    }
    if (Array.isArray(value)) {
      return { type: 'array', length: value.length, sample: value.slice(0, 2).map((item) => projectObservedData(item, depth + 1)) };
    }
    if (typeof value !== 'object') return null;
    const selected = Object.entries(value)
      .filter(([key]) => observedDataKeys.has(key))
      .slice(0, 30)
      .map(([key, nested]) => [key, projectObservedData(nested, depth + 1)]);
    return Object.fromEntries(selected);
  };
  if (typeof page.on !== 'function') return recorder;
  const recordNavigation = (frame) => {
    if (typeof page.mainFrame !== 'function' || frame === page.mainFrame()) {
      recorder.navigation.push({
        url: redactUrl(frame.url()),
        observedAt: new Date().toISOString(),
      });
    }
  };
  page.on('framenavigated', recordNavigation);
  page.on('request', (request) => {
    if (recorder.requests.length >= 1000) return;
    recorder.requests.push({
      url: redactUrl(request.url()),
      method: request.method(),
      resourceType: request.resourceType(),
      observedAt: new Date().toISOString(),
    });
  });
  page.on('response', (response) => {
    const task = (async () => {
      if (recorder.requests.length >= 1000) return;
      const contentType = response.headers()['content-type'] || '';
      const entry = {
        url: redactUrl(response.url()),
        method: response.request().method(),
        status: response.status(),
        contentType: redactText(contentType),
        dataIndicators: [],
        fieldNames: [],
      };
      if (/json/i.test(contentType)) {
        try {
          const body = await response.json();
          const names = new Set();
          const collectNames = (value, depth = 0) => {
            if (!value || typeof value !== 'object' || depth > 4) return;
            for (const [key, nested] of Object.entries(value).slice(0, 100)) {
              names.add(key);
              collectNames(nested, depth + 1);
            }
          };
          collectNames(body);
          entry.fieldNames = [...names].slice(0, 80);
          entry.dataIndicators = [...new Set(entry.fieldNames
            .filter((name) => /fixture|match|market|selection|score|result|clock|status|round|team/i.test(name)))];
          const evidence = projectObservedData(body);
          if (Object.keys(evidence).length) entry.dataEvidence = evidence;
        } catch {
          entry.bodyInspection = 'JSON body unavailable; response values were not recorded.';
        }
      }
      recorder.requests.push(entry);
    })();
    recorder.responseTasks.push(task);
  });
  page.on('requestfailed', (request) => {
    if (recorder.requests.length >= 1000) return;
    recorder.requests.push({
      url: redactUrl(request.url()),
      method: request.method(),
      failed: redactText(request.failure()?.errorText || 'request failed'),
    });
  });
  return recorder;
}

async function installDomChangeRecorder(page) {
  if (typeof page.addInitScript !== 'function') return;
  await page.addInitScript(() => {
    window.__catalogueaBetkingDomChanges = [];
    const describe = (node) => ({
      tag: node?.nodeType === Node.ELEMENT_NODE ? node.tagName.toLowerCase() : 'text',
      testId: node?.nodeType === Node.ELEMENT_NODE ? node.getAttribute('data-testid') : null,
      id: node?.nodeType === Node.ELEMENT_NODE ? node.id || null : null,
    });
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (window.__catalogueaBetkingDomChanges.length >= 200) return;
        window.__catalogueaBetkingDomChanges.push({
          type: mutation.type,
          target: describe(mutation.target),
          added: [...mutation.addedNodes].slice(0, 5).map(describe),
          removed: [...mutation.removedNodes].slice(0, 5).map(describe),
          observedAt: new Date().toISOString(),
        });
      }
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

async function capturePageSnapshot(page, inspect = inspectBetKingPage) {
  const details = typeof page.evaluate === 'function' ? await page.evaluate(() => {
    const visible = (element) => Boolean(element.getClientRects?.().length);
    const text = (element) => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
    const elements = (selector) => [...document.querySelectorAll(selector)]
      .filter(visible)
      .map((element) => ({
        text: text(element).slice(0, 500),
        tag: element.tagName.toLowerCase(),
        href: element.tagName === 'A' ? element.getAttribute('href') : null,
        testId: element.getAttribute('data-testid'),
        ariaLabel: element.getAttribute('aria-label'),
      }));
    const relevantLines = [...new Set((document.querySelector('main')?.innerText || document.body?.innerText || '')
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line && /kings league|week \d+|round \d+|live|result|finished|completed|half.?time|full.?time|score|match|fixture|1x2|double chance|o\/u|gg\/ng|correct score/i.test(line))
      .slice(0, 80))];
    return {
      url: location.href,
      title: document.title,
      headings: elements('h1, h2, h3, [role="heading"]'),
      navigationItems: elements('nav a, nav button, [role="navigation"] a, [role="navigation"] button'),
      buttons: elements('button, [role="button"]'),
      links: elements('a'),
      fixtureCards: [...document.querySelectorAll('[data-testid="match"]')]
        .filter(visible)
        .map((element) => ({
          text: text(element).slice(0, 1000),
          testId: element.getAttribute('data-testid'),
          identity: element.querySelector('[data-testid^="matchup-statistics-button-"]')?.getAttribute('data-testid') || null,
        })),
      marketTabs: elements('[data-testid="market-selector-tab"]'),
      relevantVisibleText: relevantLines,
    };
  }) : {
    url: typeof page.url === 'function' ? page.url() : 'about:blank',
    title: '',
    headings: [],
    navigationItems: [],
    buttons: [],
    links: [],
    fixtureCards: [],
    marketTabs: [],
    relevantVisibleText: [],
  };
  let structured;
  try {
    structured = await inspect(page);
  } catch (error) {
    structured = { status: 'PAGE_SNAPSHOT_UNAVAILABLE', reason: redactText(error.message), snapshot: {} };
  }
  return sanitize({
    ...details,
    url: redactUrl(details.url),
    status: structured.status,
    reason: structured.reason,
    structuredSnapshot: structured.snapshot,
  });
}

async function readDomChanges(page) {
  try {
    return sanitize(await page.evaluate(() => window.__catalogueaBetkingDomChanges || []));
  } catch {
    return [];
  }
}

function createReadableReport(report) {
  return [
    '# BetKing real-site inspection',
    '',
    `- Status: ${report.status}`,
    `- Page: ${report.page?.title || 'Unavailable'}`,
    `- URL: ${report.page?.url || report.targetUrl}`,
    `- Classification: ${report.pageClassification || 'unclassified'}`,
    `- Snapshots: ${report.reconnaissance?.snapshots?.length || 0}`,
    `- Requests observed: ${report.reconnaissance?.requests?.length || 0}`,
    '',
    'Detailed sanitized observations are in the adjacent JSON file.',
    '',
    '## Observed navigation',
    '',
    ...(report.reconnaissance?.navigation || []).map(({ url, observedAt }) => `- ${observedAt}: ${url}`),
    '',
    '## Inspection outcome',
    '',
    redactText(report.reason || 'No inspection reason was recorded.'),
    '',
  ].join('\n');
}

async function writeInspectionReport(report, outputDir = DEFAULT_REPORT_DIR) {
  await fs.mkdir(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `betking-inspection-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `betking-inspection-${timestamp}.md`);
  const safeReport = sanitize(report);
  await Promise.all([
    fs.writeFile(jsonPath, `${JSON.stringify(safeReport, null, 2)}\n`, { mode: 0o600 }),
    fs.writeFile(markdownPath, createReadableReport(safeReport), { mode: 0o600 }),
  ]);
  return { jsonPath, markdownPath };
}

function describeMarkets(snapshot) {
  return (snapshot?.rounds || []).flatMap((round) => (
    round.fixtures || []
  ).map((fixture) => ({
    roundName: round.roundName,
    roundId: round.roundId,
    fixtureId: fixture.fixtureId,
    teams: { home: fixture.home, away: fixture.away },
    marketName: fixture.market,
    selections: fixture.selections,
    selectors: fixture.selectors,
  })));
}

async function inspectAvailableMarkets(page, initialResult, {
  inspect = inspectBetKingPage,
  timeoutMs,
  conditionTimeoutMs = timeoutMs,
} = {}) {
  const snapshot = initialResult.snapshot;
  const categories = snapshot.marketCategories || [];
  const inspected = [{
    name: snapshot.selectedMarketName,
    result: initialResult,
  }];
  const skipped = [];

  if (snapshot.cookieConsent) {
    return {
      inspected,
      skipped: categories
        .filter((name) => name !== snapshot.selectedMarketName)
        .map((name) => ({ name, reason: 'Cookie-consent overlay remains visible; no consent choice was made.' })),
    };
  }

  if (typeof page.getByTestId !== 'function') {
    return { inspected, skipped: categories.filter((name) => name !== snapshot.selectedMarketName)
      .map((name) => ({ name, reason: 'Playwright market-tab locator is unavailable.' })) };
  }

  const tabLocator = page.getByTestId('market-selector-tab');
  const count = await tabLocator.count();
  const originalMarket = snapshot.selectedMarketName;
  let currentMarket = originalMarket;
  let consentBlocked = false;
  try {
    for (let index = 0; index < count; index += 1) {
      const tab = tabLocator.nth(index);
      const marketName = (await tab.innerText()).replace(/\s+/g, ' ').trim();
      if (!marketName || marketName === currentMarket) continue;

      try {
        await tab.click({ timeout: timeoutMs });
        await page.waitForFunction(
          (expectedName) => {
            const selected = document.querySelector('[data-testid="selected-market-name"]');
            return selected?.textContent?.replace(/\s+/g, ' ').trim() === expectedName;
          },
          marketName,
          { timeout: conditionTimeoutMs },
        );
        const result = await inspect(page);
        if (result.snapshot.selectedMarketName !== marketName) {
          throw new Error(`Selected market reported "${result.snapshot.selectedMarketName}", expected "${marketName}".`);
        }
        inspected.push({ name: marketName, result });
        currentMarket = marketName;
      } catch (error) {
        const reason = error.message.split('\nCall log:')[0];
        let refreshed;
        let refreshError;
        try {
          refreshed = await inspect(page);
        } catch (inspectionError) {
          refreshError = inspectionError;
          refreshed = null;
        }
        if (refreshed?.snapshot.cookieConsent) {
          Object.assign(snapshot, refreshed.snapshot);
          if (refreshed.snapshot.selectedMarketName !== currentMarket) {
            inspected.push({ name: refreshed.snapshot.selectedMarketName, result: refreshed });
            currentMarket = refreshed.snapshot.selectedMarketName;
          }
          const choice = await dismissOptionalCookieConsent(page, refreshed.snapshot, timeoutMs);
          if (choice) {
            if (typeof page.waitForTimeout === 'function') {
              await page.waitForTimeout(Math.min(1000, timeoutMs));
            }
            const afterChoice = await inspect(page);
            if (!afterChoice.snapshot.cookieConsent) {
              Object.assign(snapshot, afterChoice.snapshot);
              initialResult.cookieConsentChoice = choice;
              currentMarket = afterChoice.snapshot.selectedMarketName;
              if (currentMarket !== marketName) index -= 1;
              continue;
            }
            Object.assign(snapshot, afterChoice.snapshot);
          }
          consentBlocked = true;
          skipped.push({
            name: marketName,
            reason: `A visible cookie overlay blocked the market tab (${refreshed.snapshot.blockingOverlays.map(({ selector }) => selector).filter(Boolean).join(', ') || 'overlay selector unavailable'}); no safe optional-cookie rejection control was used.`,
          });
          break;
        }
        skipped.push({
          name: marketName,
          reason: refreshError
            ? `${reason}; follow-up DOM inspection failed: ${refreshError.message}`
            : reason,
        });
      }
    }
  } finally {
    if (!consentBlocked && !snapshot.cookieConsent && originalMarket && currentMarket !== originalMarket) {
      const originalTab = tabLocator.filter({ hasText: originalMarket }).first();
      try {
        await originalTab.click({ timeout: timeoutMs });
        await page.waitForFunction(
          (expectedName) => document.querySelector('[data-testid="selected-market-name"]')
            ?.textContent?.replace(/\s+/g, ' ').trim() === expectedName,
          originalMarket,
          { timeout: conditionTimeoutMs },
        );
      } catch (error) {
        skipped.push({ name: originalMarket, reason: `Could not restore originally displayed market: ${error.message}` });
      }
    }
  }
  if (consentBlocked) {
    for (const name of categories) {
      if (!inspected.some(({ name: inspectedName }) => inspectedName === name)
        && !skipped.some(({ name: skippedName }) => skippedName === name)) {
        skipped.push({
          name,
          reason: `Market inspection stopped because the cookie overlay intercepted the visible market tabs.`,
        });
      }
    }
  }
  return { inspected, skipped };
}

async function dismissOptionalCookieConsent(page, snapshot, timeoutMs) {
  const safeChoice = /^(reject all(?: cookies)?|reject optional(?: cookies)?|only essential cookies|essential cookies only|necessary cookies only|only necessary)$/i;
  for (const overlay of snapshot.blockingOverlays || []) {
    const buttonName = (overlay.buttons || []).find((name) => safeChoice.test(name.trim()));
    if (buttonName && overlay.selector && typeof page.locator === 'function') {
      await page.locator(overlay.selector)
        .getByRole('button', { name: buttonName, exact: true })
        .click({ timeout: timeoutMs });
      return 'optional_cookies_rejected';
    }
    const visibleAction = (overlay.visibleActions || []).find((name) => safeChoice.test(name.trim()));
    if (visibleAction && typeof page.getByText === 'function') {
      await page.getByText(visibleAction, { exact: true }).click({ timeout: timeoutMs });
      return 'optional_cookies_rejected';
    }
  }
  return null;
}

async function navigateToLiveSection(page, {
  inspect = inspectBetKingPage,
  timeoutMs = 10000,
  conditionTimeoutMs = timeoutMs,
} = {}) {
  const observations = {
    status: 'NOT_ATTEMPTED',
    liveTabFound: false,
    liveTabClicked: false,
    urlChanged: false,
    pageInspected: null,
    reason: '',
  };

  try {
    // Look for Live tab/section in navigation
    const liveSelectors = [
      '[data-testid="live-tab"]',
      '[data-testid="live-section"]',
      '[role="tab"]:has-text("Live")',
      'a[href*="/live"]',
      'button:has-text("Live")',
      '[data-testid="navigation-live"]',
    ];

    let liveElement = null;
    let usedSelector = null;

    for (const selector of liveSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.count()) {
          liveElement = element;
          usedSelector = selector;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!liveElement) {
      // Try finding by text content
      try {
        liveElement = page.getByRole('tab', { name: /^Live$/i }).first();
        if (await liveElement.count()) {
          usedSelector = 'getByRole(tab, Live)';
        }
      } catch {
        // ignore
      }
    }

    if (!liveElement) {
      try {
        liveElement = page.getByText('Live', { exact: true }).first();
        if (await liveElement.count()) {
          usedSelector = 'getByText(Live)';
        }
      } catch {
        // ignore
      }
    }

    if (!liveElement || !(await liveElement.count())) {
      observations.status = 'LIVE_TAB_NOT_FOUND';
      observations.reason = 'No visible Live tab or section was found on the page.';
      return observations;
    }

    observations.liveTabFound = true;
    const beforeUrl = page.url();

    try {
      await liveElement.click({ timeout: timeoutMs });
      observations.liveTabClicked = true;
    } catch (clickError) {
      observations.status = 'LIVE_TAB_CLICK_FAILED';
      observations.reason = `Failed to click Live tab: ${redactText(clickError.message)}`;
      return observations;
    }

    // Wait for potential navigation or DOM update
    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(Math.min(2000, conditionTimeoutMs));
    }

    const afterUrl = page.url();
    observations.urlChanged = afterUrl !== beforeUrl;

    // Wait for page to be usable
    await waitForUsablePage(page, conditionTimeoutMs);

    // Inspect the resulting page
    const result = await inspect(page);
    observations.pageInspected = {
      url: redactUrl(afterUrl),
      title: result.snapshot.title,
      status: result.status,
      league: result.snapshot.league,
      marketCategories: result.snapshot.marketCategories,
      rounds: result.snapshot.rounds?.map(r => ({
        roundName: r.roundName,
        roundId: r.roundId,
        timer: r.timer,
        fixtureCount: r.fixtures?.length || 0,
      })) || [],
      liveEvidence: result.snapshot.liveEvidence || [],
      blockingOverlays: result.snapshot.blockingOverlays || [],
    };

    observations.status = 'LIVE_SECTION_INSPECTED';
    observations.reason = `Live tab clicked via ${usedSelector}. ${observations.urlChanged ? 'URL changed.' : 'Client-side transition detected.'}`;

  } catch (error) {
    observations.status = 'LIVE_NAVIGATION_ERROR';
    observations.reason = redactText(error.message);
  }

  return observations;
}

async function inspectLiveFixtures(page, {
  inspect = inspectBetKingPage,
  timeoutMs = 10000,
  conditionTimeoutMs = timeoutMs,
  maxFixtures = 5,
  snapshotIntervalMs = 3000,
  snapshotsCount = 3,
} = {}) {
  const observations = {
    status: 'NOT_ATTEMPTED',
    liveFixturesFound: 0,
    fixtures: [],
    snapshots: [],
    reason: '',
  };

  try {
    // Wait for live fixtures to appear
    await waitForUsablePage(page, conditionTimeoutMs);

    // Try multiple selectors for live fixtures
    const fixtureSelectors = [
      '[data-testid="live-match"]',
      '[data-testid="match"][data-live="true"]',
      '[data-testid="fixture"][data-status="live"]',
      '[data-testid="match"]',  // fallback
    ];

    let fixtureLocator = null;
    for (const selector of fixtureSelectors) {
      const locator = page.locator(selector);
      if (await locator.count()) {
        fixtureLocator = locator;
        break;
      }
    }

    if (!fixtureLocator || !(await fixtureLocator.count())) {
      observations.status = 'NO_LIVE_FIXTURES_FOUND';
      observations.reason = 'No live fixtures were found on the page.';
      return observations;
    }

    const count = await fixtureLocator.count();
    observations.liveFixturesFound = count;

    // Inspect first few fixtures
    const fixturesToInspect = Math.min(count, maxFixtures);
    for (let i = 0; i < fixturesToInspect; i++) {
      const fixture = fixtureLocator.nth(i);
      try {
        const fixtureData = await fixture.evaluate((el) => {
          const text = (sel) => {
            const element = el.querySelector(sel);
            return element ? (element.textContent || '').replace(/\s+/g, ' ').trim() : '';
          };
          const attr = (sel, attrName) => {
            const element = el.querySelector(sel);
            return element ? element.getAttribute(attrName) : '';
          };

          return {
            homeTeam: text('[data-testid="teams-home-name"], [data-testid="home-team"], .home-team'),
            awayTeam: text('[data-testid="teams-away-name"], [data-testid="away-team"], .away-team'),
            homeScore: text('[data-testid="home-score"], [data-testid="score-home"], .home-score'),
            awayScore: text('[data-testid="away-score"], [data-testid="score-away"], .away-score'),
            matchClock: text('[data-testid="match-clock"], [data-testid="minute"], [data-testid="clock"], .match-minute, .match-clock'),
            matchStatus: text('[data-testid="match-status"], [data-testid="status"], [data-testid="phase"]'),
            halfTime: text('[data-testid="half-time"], [data-testid="ht"], .half-time'),
            fullTime: text('[data-testid="full-time"], [data-testid="ft"], .full-time'),
            fixtureId: attr('[data-testid="match-id"], [data-testid="fixture-id"], [data-match-id]', 'data-match-id') ||
                       attr('[data-testid="match-id"], [data-testid="fixture-id"], [data-match-id]', 'data-fixture-id') ||
                       attr('[data-testid="match-id"], [data-testid="fixture-id"], [data-match-id]', 'data-testid'),
            roundInfo: text('[data-testid="round-name"], [data-testid="round"], [data-round]'),
            testId: el.getAttribute('data-testid') || '',
            outerHTML: el.outerHTML.slice(0, 2000),
          };
        });

        observations.fixtures.push(fixtureData);
      } catch (error) {
        observations.fixtures.push({
          index: i,
          error: redactText(error.message),
        });
      }
    }

    // Capture repeated snapshots to observe score/clock updates
    for (let snap = 0; snap < snapshotsCount; snap++) {
      if (snap > 0 && typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(snapshotIntervalMs);
      }

      const snapshotData = await page.evaluate(() => {
        const fixtures = [...document.querySelectorAll('[data-testid="live-match"], [data-testid="match"][data-live="true"], [data-testid="match"]')];
        return fixtures.slice(0, maxFixtures).map((el, idx) => {
          const text = (sel) => {
            const element = el.querySelector(sel);
            return element ? (element.textContent || '').replace(/\s+/g, ' ').trim() : '';
          };
          return {
            index: idx,
            homeTeam: text('[data-testid="teams-home-name"], [data-testid="home-team"], .home-team'),
            awayTeam: text('[data-testid="teams-away-name"], [data-testid="away-team"], .away-team'),
            homeScore: text('[data-testid="home-score"], [data-testid="score-home"], .home-score'),
            awayScore: text('[data-testid="away-score"], [data-testid="score-away"], .away-score'),
            matchClock: text('[data-testid="match-clock"], [data-testid="minute"], [data-testid="clock"], .match-minute, .match-clock'),
            matchStatus: text('[data-testid="match-status"], [data-testid="status"], [data-testid="phase"]'),
            testId: el.getAttribute('data-testid') || '',
          };
        });
      });

      observations.snapshots.push({
        snapshotIndex: snap,
        timestamp: new Date().toISOString(),
        fixtures: snapshotData,
      });
    }

    // Analyze score/clock changes
    const scoreChanges = [];
    if (observations.snapshots.length >= 2) {
      for (let f = 0; f < observations.snapshots[0].fixtures.length; f++) {
        for (let s = 1; s < observations.snapshots.length; s++) {
          const prev = observations.snapshots[s - 1].fixtures[f];
          const curr = observations.snapshots[s].fixtures[f];
          if (prev && curr) {
            if (prev.homeScore !== curr.homeScore || prev.awayScore !== curr.awayScore) {
              scoreChanges.push({
                fixtureIndex: f,
                snapshotFrom: s - 1,
                snapshotTo: s,
                from: { homeScore: prev.homeScore, awayScore: prev.awayScore },
                to: { homeScore: curr.homeScore, awayScore: curr.awayScore },
              });
            }
            if (prev.matchClock !== curr.matchClock) {
              scoreChanges.push({
                fixtureIndex: f,
                snapshotFrom: s - 1,
                snapshotTo: s,
                type: 'clock',
                from: prev.matchClock,
                to: curr.matchClock,
              });
            }
          }
        }
      }
    }

    observations.scoreChanges = scoreChanges;
    observations.status = 'LIVE_FIXTURES_INSPECTED';
    observations.reason = `Found ${count} live fixtures; inspected ${fixturesToInspect}; captured ${snapshotsCount} snapshots.`;

  } catch (error) {
    observations.status = 'LIVE_FIXTURES_INSPECTION_ERROR';
    observations.reason = redactText(error.message);
  }

  return observations;
}

async function navigateToResults(page, {
  inspect = inspectBetKingPage,
  navigate = navigateTo,
  wait = waitForUsablePage,
  targetUrl = BETKING_TARGET_URL,
  timeoutMs = 10000,
  conditionTimeoutMs = timeoutMs,
} = {}) {
  const observations = {
    status: 'NOT_ATTEMPTED',
    resultsFound: false,
    resultsClicked: false,
    urlChanged: false,
    pageInspected: null,
    navigationPath: [],
    reason: '',
  };

  try {
    // Try multiple ways to find Results
    const resultsSelectors = [
      '[data-testid="results-link"]',
      '[data-testid="results-tab"]',
      '[data-testid="results-button"]',
      'a[href*="/results"]',
      'button:has-text("Results")',
      'a:has-text("Results")',
      '[role="tab"]:has-text("Results")',
    ];

    let resultsElement = null;
    let usedSelector = null;

    for (const selector of resultsSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.count()) {
          resultsElement = element;
          usedSelector = selector;
          break;
        }
      } catch {
        continue;
      }
    }

    // Try via Menu if direct link not found
    if (!resultsElement) {
      observations.navigationPath.push('Attempting via Menu...');
      try {
        const menuLink = page.locator('a[href="/menu"]').first();
        if (await menuLink.count()) {
          await menuLink.click({ timeout: timeoutMs });
          await wait(page, conditionTimeoutMs);
          observations.navigationPath.push('Menu opened');

          // Look for Results in menu
          const menuResults = page.locator('a:has-text("Results"), button:has-text("Results"), [role="menuitem"]:has-text("Results")').first();
          if (await menuResults.count()) {
            resultsElement = menuResults;
            usedSelector = 'Menu > Results';
          }
        }
      } catch {
        // ignore
      }
    }

    // Try getByRole/text as fallback
    if (!resultsElement) {
      try {
        resultsElement = page.getByRole('link', { name: /Results/i }).first();
        if (await resultsElement.count()) {
          usedSelector = 'getByRole(link, Results)';
        }
      } catch {
        // ignore
      }
    }

    if (!resultsElement) {
      try {
        resultsElement = page.getByRole('button', { name: /Results/i }).first();
        if (await resultsElement.count()) {
          usedSelector = 'getByRole(button, Results)';
        }
      } catch {
        // ignore
      }
    }

    if (!resultsElement) {
      try {
        resultsElement = page.getByText('Results', { exact: true }).first();
        if (await resultsElement.count()) {
          usedSelector = 'getByText(Results)';
        }
      } catch {
        // ignore
      }
    }

    if (!resultsElement || !(await resultsElement.count())) {
      observations.status = 'RESULTS_ENTRY_NOT_FOUND';
      observations.reason = 'No visible Results link, button, or tab was found.';
      return observations;
    }

    observations.resultsFound = true;
    const beforeUrl = page.url();

    try {
      await resultsElement.click({ timeout: timeoutMs });
      observations.resultsClicked = true;
      observations.navigationPath.push(`Clicked Results via ${usedSelector}`);
    } catch (clickError) {
      observations.status = 'RESULTS_CLICK_FAILED';
      observations.reason = `Failed to click Results: ${redactText(clickError.message)}`;
      return observations;
    }

    // Wait for navigation or DOM update
    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(Math.min(2000, conditionTimeoutMs));
    }

    const afterUrl = page.url();
    observations.urlChanged = afterUrl !== beforeUrl;

    await wait(page, conditionTimeoutMs);

    const result = await inspect(page);
    observations.pageInspected = {
      url: redactUrl(afterUrl),
      title: result.snapshot.title,
      status: result.status,
      rounds: result.snapshot.rounds?.map(r => ({
        roundName: r.roundName,
        roundId: r.roundId,
        timer: r.timer,
        fixtureCount: r.fixtures?.length || 0,
      })) || [],
      liveEvidence: result.snapshot.liveEvidence || [],
      resultsEntryPoints: result.snapshot.resultsEntryPoints || [],
      blockingOverlays: result.snapshot.blockingOverlays || [],
    };

    observations.status = 'RESULTS_INSPECTED';
    observations.reason = `Results accessed via ${usedSelector}. ${observations.urlChanged ? 'URL changed.' : 'Client-side transition detected.'}`;

    // If we left the target URL, navigate back
    if (afterUrl !== targetUrl) {
      try {
        await navigate(page, targetUrl, { waitUntil: 'domcontentloaded', timeout: conditionTimeoutMs });
        await wait(page, conditionTimeoutMs);
        observations.navigationPath.push('Returned to scheduled page');
      } catch {
        observations.navigationPath.push('Failed to return to scheduled page');
      }
    }

  } catch (error) {
    observations.status = 'RESULTS_NAVIGATION_ERROR';
    observations.reason = redactText(error.message);
  }

  return observations;
}

async function inspectResultsPage(page, {
  inspect = inspectBetKingPage,
  timeoutMs = 10000,
  conditionTimeoutMs = timeoutMs,
} = {}) {
  const observations = {
    status: 'NOT_ATTEMPTED',
    completedFixturesFound: 0,
    fixtures: [],
    hasHalfTimeScores: false,
    hasFullTimeScores: false,
    roundInfo: [],
    reason: '',
  };

  try {
    await waitForUsablePage(page, conditionTimeoutMs);

    // Look for completed/finished fixtures
    const fixtureSelectors = [
      '[data-testid="completed-match"]',
      '[data-testid="finished-match"]',
      '[data-testid="result-match"]',
      '[data-testid="match"][data-status="finished"]',
      '[data-testid="match"][data-status="completed"]',
    ];

    let fixtureLocator = null;
    for (const selector of fixtureSelectors) {
      const locator = page.locator(selector);
      if (await locator.count()) {
        fixtureLocator = locator;
        break;
      }
    }

    // Fallback: look for any match with scores
    if (!fixtureLocator) {
      const allMatches = page.locator('[data-testid="match"]');
      const count = await allMatches.count();
      if (count > 0) {
        fixtureLocator = allMatches;
      }
    }

    if (!fixtureLocator || !(await fixtureLocator.count())) {
      observations.status = 'NO_COMPLETED_FIXTURES_FOUND';
      observations.reason = 'No completed fixtures found on results page.';
      return observations;
    }

    const count = await fixtureLocator.count();
    observations.completedFixturesFound = count;

    // Extract round information
    const roundElements = page.locator('[data-testid="round-name"], [data-testid="round"], [data-round]');
    const roundCount = await roundElements.count();
    for (let i = 0; i < roundCount; i++) {
      const roundEl = roundElements.nth(i);
      observations.roundInfo.push({
        name: (await roundEl.innerText()).replace(/\s+/g, ' ').trim(),
        testId: await roundEl.getAttribute('data-testid'),
        roundId: await roundEl.getAttribute('data-round'),
      });
    }

    // Inspect fixtures
    for (let i = 0; i < Math.min(count, 10); i++) {
      const fixture = fixtureLocator.nth(i);
      try {
        const fixtureData = await fixture.evaluate((el) => {
          const text = (sel) => {
            const element = el.querySelector(sel);
            return element ? (element.textContent || '').replace(/\s+/g, ' ').trim() : '';
          };
          const attr = (sel, attrName) => {
            const element = el.querySelector(sel);
            return element ? element.getAttribute(attrName) : '';
          };

          const homeScore = text('[data-testid="home-score"], [data-testid="score-home"], .home-score, [data-testid="ft-home-score"]');
          const awayScore = text('[data-testid="away-score"], [data-testid="score-away"], .away-score, [data-testid="ft-away-score"]');
          const htHomeScore = text('[data-testid="ht-home-score"], [data-testid="half-time-home-score"]');
          const htAwayScore = text('[data-testid="ht-away-score"], [data-testid="half-time-away-score"]');

          return {
            homeTeam: text('[data-testid="teams-home-name"], [data-testid="home-team"], .home-team'),
            awayTeam: text('[data-testid="teams-away-name"], [data-testid="away-team"], .away-team'),
            homeScore,
            awayScore,
            htHomeScore,
            htAwayScore,
            hasHT: !!(htHomeScore || htAwayScore),
            hasFT: !!(homeScore || awayScore),
            fixtureId: attr('[data-testid="match-id"], [data-testid="fixture-id"], [data-match-id]', 'data-match-id') ||
                       attr('[data-testid="match-id"], [data-testid="fixture-id"], [data-match-id]', 'data-fixture-id'),
            matchStatus: text('[data-testid="match-status"], [data-testid="status"], [data-testid="phase"]'),
            roundInfo: text('[data-testid="round-name"], [data-testid="round"], [data-round]'),
            testId: el.getAttribute('data-testid') || '',
          };
        });

        if (fixtureData.hasHT) observations.hasHalfTimeScores = true;
        if (fixtureData.hasFT) observations.hasFullTimeScores = true;

        observations.fixtures.push(fixtureData);
      } catch (error) {
        observations.fixtures.push({
          index: i,
          error: redactText(error.message),
        });
      }
    }

    observations.status = 'RESULTS_FIXTURES_INSPECTED';
    observations.reason = `Found ${count} completed fixtures; inspected ${Math.min(count, 10)}. HT scores: ${observations.hasHalfTimeScores}, FT scores: ${observations.hasFullTimeScores}.`;

  } catch (error) {
    observations.status = 'RESULTS_INSPECTION_ERROR';
    observations.reason = redactText(error.message);
  }

  return observations;
}

async function inspectLiveMarketPanel(page, {
  inspect = inspectBetKingPage,
  timeoutMs = 10000,
  conditionTimeoutMs = timeoutMs,
} = {}) {
  const observations = {
    status: 'NOT_ATTEMPTED',
    marketTabsFound: [],
    marketsInspected: [],
    reason: '',
  };

  try {
    await waitForUsablePage(page, conditionTimeoutMs);

    // Find market tabs on live match page
    const marketTabSelectors = [
      '[data-testid="market-tab"]',
      '[data-testid="market-selector-tab"]',
      '[role="tab"][data-testid*="market"]',
      '[data-testid="markets"] [role="tab"]',
    ];

    let marketTabsLocator = null;
    for (const selector of marketTabSelectors) {
      const locator = page.locator(selector);
      if (await locator.count()) {
        marketTabsLocator = locator;
        break;
      }
    }

    if (!marketTabsLocator || !(await marketTabsLocator.count())) {
      // Try to find by text content for known market names
      const knownMarkets = ['Popular', 'Over/Under', 'Home Goals', 'Away Goals', '1X2 & GG/NG', 'Correct Score', 'Half Time', 'Full Time'];
      for (const marketName of knownMarkets) {
        try {
          const element = page.getByRole('tab', { name: marketName, exact: true }).first();
          if (await element.count()) {
            observations.marketTabsFound.push({ name: marketName, foundVia: 'getByRole' });
          }
        } catch {
          // ignore
        }
      }

      if (observations.marketTabsFound.length === 0) {
        observations.status = 'NO_MARKET_TABS_FOUND';
        observations.reason = 'No market tabs found on live match page.';
        return observations;
      }
    }

    const count = await marketTabsLocator.count();
    for (let i = 0; i < count; i++) {
      const tab = marketTabsLocator.nth(i);
      const name = (await tab.innerText()).replace(/\s+/g, ' ').trim();
      observations.marketTabsFound.push({ name, testId: await tab.getAttribute('data-testid') });
    }

    // Click each market tab and inspect selections
    for (const marketTab of observations.marketTabsFound) {
      try {
        let tabElement;
        if (marketTab.testId) {
          tabElement = page.locator(`[data-testid="${marketTab.testId}"]`).first();
        } else {
          tabElement = page.getByRole('tab', { name: marketTab.name, exact: true }).first();
        }

        if (!(await tabElement.count())) continue;

        await tabElement.click({ timeout: timeoutMs });
        if (typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(Math.min(1000, conditionTimeoutMs));
        }

        // Inspect market selections
        const selections = await page.evaluate(() => {
          const elements = [...document.querySelectorAll('[data-testid="selection"], [data-testid="selection-name"], [data-testid="market-selection"], .selection, .market-option')];
          return elements.map((el) => {
            const labelEl = el.querySelector('[data-testid="selection-name"], [data-testid="label"], .selection-label');
            const oddsEl = el.querySelector('[data-testid="odd"], [data-testid="odds"], [data-testid="price"], .odds, .price');
            return {
              label: labelEl ? (labelEl.textContent || '').replace(/\s+/g, ' ').trim() : '',
              odds: oddsEl ? (oddsEl.textContent || '').replace(/\s+/g, ' ').trim() : '',
              testId: el.getAttribute('data-testid') || '',
            };
          }).filter(s => s.label || s.odds);
        });

        observations.marketsInspected.push({
          marketName: marketTab.name,
          selections,
        });

      } catch (error) {
        observations.marketsInspected.push({
          marketName: marketTab.name,
          error: redactText(error.message),
        });
      }
    }

    observations.status = 'LIVE_MARKETS_INSPECTED';
    observations.reason = `Found ${observations.marketTabsFound.length} market tabs; inspected ${observations.marketsInspected.length}.`;

  } catch (error) {
    observations.status = 'LIVE_MARKETS_INSPECTION_ERROR';
    observations.reason = redactText(error.message);
  }

  return observations;
}

async function traceLiveAndResultsJourney(page, {
  inspect = inspectBetKingPage,
  navigate = navigateTo,
  wait = waitForUsablePage,
  targetUrl = BETKING_TARGET_URL,
  config,
} = {}) {
  const journey = {
    liveNavigation: null,
    liveFixtures: null,
    resultsNavigation: null,
    resultsInspection: null,
    liveMarkets: null,
    overallStatus: 'STARTED',
  };

  // 1. Navigate to Live section
  console.log('[JOURNEY] Navigating to Live section...');
  journey.liveNavigation = await navigateToLiveSection(page, {
    inspect,
    timeoutMs: config.actionTimeoutMs,
    conditionTimeoutMs: config.conditionTimeoutMs,
  });
  console.log(`[JOURNEY] Live navigation: ${journey.liveNavigation.status}`);

  // If live navigation succeeded, inspect live fixtures
  if (journey.liveNavigation.status === 'LIVE_SECTION_INSPECTED') {
    console.log('[JOURNEY] Inspecting live fixtures...');
    journey.liveFixtures = await inspectLiveFixtures(page, {
      inspect,
      timeoutMs: config.actionTimeoutMs,
      conditionTimeoutMs: config.conditionTimeoutMs,
      maxFixtures: 5,
      snapshotIntervalMs: 3000,
      snapshotsCount: 3,
    });
    console.log(`[JOURNEY] Live fixtures: ${journey.liveFixtures.status}`);

    // Inspect live market panel
    console.log('[JOURNEY] Inspecting live market panel...');
    journey.liveMarkets = await inspectLiveMarketPanel(page, {
      inspect,
      timeoutMs: config.actionTimeoutMs,
      conditionTimeoutMs: config.conditionTimeoutMs,
    });
    console.log(`[JOURNEY] Live markets: ${journey.liveMarkets.status}`);
  }

  // 2. Navigate to Results (from wherever we are)
  console.log('[JOURNEY] Navigating to Results...');
  journey.resultsNavigation = await navigateToResults(page, {
    inspect,
    navigate,
    wait,
    targetUrl,
    timeoutMs: config.actionTimeoutMs,
    conditionTimeoutMs: config.conditionTimeoutMs,
  });
  console.log(`[JOURNEY] Results navigation: ${journey.resultsNavigation.status}`);

  // If results navigation succeeded, inspect results page
  if (journey.resultsNavigation.status === 'RESULTS_INSPECTED' && journey.resultsNavigation.pageInspected) {
    console.log('[JOURNEY] Inspecting results page...');
    // We need to inspect the current page which should be the results page
    journey.resultsInspection = await inspectResultsPage(page, {
      inspect,
      timeoutMs: config.actionTimeoutMs,
      conditionTimeoutMs: config.conditionTimeoutMs,
    });
    console.log(`[JOURNEY] Results inspection: ${journey.resultsInspection.status}`);
  }

  // Determine overall status
  const criticalSteps = [
    journey.liveNavigation?.status === 'LIVE_SECTION_INSPECTED',
    journey.liveFixtures?.status === 'LIVE_FIXTURES_INSPECTED',
    journey.resultsNavigation?.status === 'RESULTS_INSPECTED',
    journey.resultsInspection?.status === 'RESULTS_FIXTURES_INSPECTED',
  ];

  const completedCritical = criticalSteps.filter(Boolean).length;
  if (completedCritical === criticalSteps.length) {
    journey.overallStatus = 'COMPLETE';
  } else if (completedCritical > 0) {
    journey.overallStatus = 'PARTIAL';
  } else {
    journey.overallStatus = 'FAILED';
  }

  return journey;
}

async function inspectScheduledFixtureDetails(page, snapshot, {
  inspect = inspectBetKingPage,
  timeoutMs,
} = {}) {
  const fixture = snapshot.rounds[0]?.fixtures[0];
  if (!fixture?.scheduledMatchId || typeof page.getByTestId !== 'function') {
    return {
      status: 'FIXTURE_DETAIL_ENTRY_UNAVAILABLE',
      reason: 'No visible matchup-statistics button identity was available.',
    };
  }
  if (snapshot.cookieConsent) {
    return {
      status: 'BLOCKED_BY_COOKIE_CONSENT',
      fixtureId: fixture.fixtureId,
      reason: 'The cookie overlay remains visible and prevents ordinary fixture-detail navigation.',
    };
  }

  try {
    const startingUrl = page.url();
    await page.getByTestId(fixture.scheduledMatchId).click({ timeout: timeoutMs });
    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(Math.min(500, timeoutMs));
    }
    const detailResult = await inspect(page);
    const dialogs = (detailResult.snapshot.blockingOverlays || [])
      .filter(({ selector }) => selector === '[role="dialog"]' || selector === '[aria-modal="true"]');
    const opened = page.url() !== startingUrl || dialogs.length > 0;
    return {
      status: opened ? 'DETAIL_VIEW_OPENED' : 'BUTTON_ACTIVATED_NO_DETAIL_PANEL',
      fixture: {
        fixtureId: fixture.fixtureId,
        scheduledMatchId: fixture.scheduledMatchId,
        home: fixture.home,
        away: fixture.away,
        roundName: snapshot.rounds[0].roundName,
      },
      pageUrl: detailResult.snapshot.url,
      title: detailResult.snapshot.title,
      dialogs,
      liveEvidence: detailResult.snapshot.liveEvidence || [],
      reason: opened
        ? 'The visible matchup-statistics control was activated; only resulting visible page content was inspected.'
        : 'The visible matchup-statistics control was activated, but no separate details panel or navigation was detected.',
    };
  } catch (error) {
    return {
      status: 'DETAIL_VIEW_OPEN_FAILED',
      fixtureId: fixture.fixtureId,
      reason: error.message.split('\nCall log:')[0],
    };
  }
}

async function inspectMoreMarkets(page, initialResult, {
  inspect = inspectBetKingPage,
  timeoutMs = 1000,
} = {}) {
  if (typeof page.getByText !== 'function') {
    return { status: 'CONTROL_UNAVAILABLE', reason: 'Playwright text locator is unavailable.' };
  }
  try {
    const control = page.getByRole('button', { name: /More Markets/i }).first();
    if (await control.count() === 0) {
      return { status: 'NO_VISIBLE_CONTROL', reason: 'No visible More Markets control was found.' };
    }
    await control.click({ timeout: timeoutMs });
    if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(Math.min(500, timeoutMs));
    const result = await inspect(page);
    const before = initialResult.snapshot.marketCategories || [];
    const after = result.snapshot.marketCategories || [];
    const ui = await capturePageSnapshot(page, inspect);
    return {
      status: after.some((name) => !before.includes(name)) ? 'ADDITIONAL_MARKETS_REVEALED' : 'NO_ADDITIONAL_MARKETS_VERIFIED',
      visibleCategoriesBefore: before,
      visibleCategoriesAfter: after,
      newlyVisibleCategories: after.filter((name) => !before.includes(name)),
      pageUrl: result.snapshot.url,
      title: result.snapshot.title,
      visibleMarketTabs: ui.marketTabs,
      relatedVisibleControls: ui.buttons.filter(({ text, ariaLabel }) => /market|half.?time|full.?time|correct score|more markets/i.test(`${text} ${ariaLabel}`)),
      relevantVisibleText: ui.relevantVisibleText,
      reason: after.some((name) => !before.includes(name))
        ? 'The visible More Markets control was activated and additional category labels were present in the resulting DOM.'
        : 'The visible control was activated, but no additional market category was exposed in the resulting DOM.',
    };
  } catch (error) {
    return { status: 'ACTIVATION_FAILED', reason: redactText(error.message) };
  }
}

async function inspectRoundNavigation(page, snapshot, {
  inspect = inspectBetKingPage,
  timeoutMs = 1000,
  conditionTimeoutMs = timeoutMs,
} = {}) {
  if (typeof page.locator !== 'function') {
    return { status: 'ROUND_CONTROLS_UNAVAILABLE', rounds: [], reason: 'Playwright CSS locator is unavailable.' };
  }
  const locator = page.locator('[data-testid^="round-switcher-button-"]');
  const count = await locator.count();
  if (!count) {
    return { status: 'NO_VISIBLE_ROUND_CONTROLS', rounds: [], reason: 'No visible round-switcher buttons were found.' };
  }
  const tabs = [];
  for (let index = 0; index < count; index += 1) {
    const tab = locator.nth(index);
    tabs.push({
      locator: tab,
      testId: await tab.getAttribute('data-testid'),
      name: (await tab.innerText()).replace(/\s+/g, ' ').trim(),
      beforeState: {
        ariaSelected: await tab.getAttribute('aria-selected'),
        ariaPressed: await tab.getAttribute('aria-pressed'),
        className: await tab.getAttribute('class'),
      },
    });
  }
  const original = tabs.find(({ name }) => name === snapshot.rounds?.[0]?.roundName) || tabs[0];
  const observations = [];
  for (const tab of tabs) {
    if (!tab.name) continue;
    try {
      await tab.locator.click({ timeout: timeoutMs });
      if (typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(Math.min(500, conditionTimeoutMs));
      }
      const result = await inspect(page);
      const afterState = {
        ariaSelected: await tab.locator.getAttribute('aria-selected'),
        ariaPressed: await tab.locator.getAttribute('aria-pressed'),
        className: await tab.locator.getAttribute('class'),
      };
      const fixtureIds = (result.snapshot.rounds || [])
        .flatMap(({ fixtures }) => fixtures.map(({ fixtureId }) => fixtureId));
      const initialFixtureIds = (snapshot.rounds || [])
        .flatMap(({ fixtures }) => fixtures.map(({ fixtureId }) => fixtureId));
      observations.push({
        roundName: tab.name,
        controlTestId: tab.testId,
        activated: true,
        beforeState: tab.beforeState,
        afterState,
        visibleStateChanged: JSON.stringify(tab.beforeState) !== JSON.stringify(afterState),
        url: result.snapshot.url,
        visibleRoundNames: (result.snapshot.rounds || []).map(({ roundName }) => roundName),
        fixtureCount: (result.snapshot.rounds || []).reduce((sum, round) => sum + round.fixtures.length, 0),
        fixtureSetChanged: JSON.stringify(fixtureIds) !== JSON.stringify(initialFixtureIds),
        status: 'INSPECTED',
      });
    } catch (error) {
      observations.push({
        roundName: tab.name,
        controlTestId: tab.testId,
        activated: false,
        status: 'NAVIGATION_OR_INSPECTION_FAILED',
        reason: redactText(error.message),
      });
    }
  }
  let restored = false;
  try {
    await original.locator.click({ timeout: timeoutMs });
    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(Math.min(500, conditionTimeoutMs));
    }
    restored = true;
  } catch {
    restored = false;
  }
  return {
    status: observations.length ? 'VISIBLE_ROUND_CONTROLS_INSPECTED' : 'NO_ROUNDS_INSPECTED',
    initialRound: original.name,
    rounds: observations,
    initialRoundControlReactivated: restored,
    reason: 'Only visible round-switcher controls were used; no route was guessed and no market selection was clicked.',
  };
}

async function inspectVisibleDestinations(page, {
  inspect = inspectBetKingPage,
  navigate = navigateTo,
  wait = waitForUsablePage,
  targetUrl = BETKING_TARGET_URL,
  timeoutMs = 1000,
  conditionTimeoutMs = timeoutMs,
} = {}) {
  const observations = {};
  if (typeof page.getByTestId === 'function') {
    try {
      const standings = page.getByTestId('standings-button');
      if (await standings.count()) {
        await standings.click({ timeout: timeoutMs });
        await wait(page, conditionTimeoutMs);
        const result = await inspect(page);
        const standingsUi = await capturePageSnapshot(page, inspect);
        observations.standings = {
          status: 'VISIBLE_CONTROL_ACTIVATED',
          url: redactUrl(page.url()),
          title: result.snapshot.title,
          pageStatus: result.status,
          liveEvidence: result.snapshot.liveEvidence || [],
          resultsEntryPoints: result.snapshot.resultsEntryPoints || [],
          visibleText: standingsUi.relevantVisibleText,
          marketTabs: standingsUi.marketTabs,
          relevantControls: standingsUi.buttons
            .filter(({ text, ariaLabel }) => /market|half.?time|full.?time|correct score|result|standings/i.test(`${text} ${ariaLabel}`)),
        };
        if (page.url() !== targetUrl) {
          await navigate(page, targetUrl, { waitUntil: 'domcontentloaded', timeout: conditionTimeoutMs });
          await wait(page, conditionTimeoutMs);
        }
      } else {
        observations.standings = { status: 'NO_VISIBLE_CONTROL' };
      }
    } catch (error) {
      observations.standings = { status: 'ACTIVATION_FAILED', reason: redactText(error.message) };
    }
  }

  if (typeof page.getByRole === 'function') {
    try {
      const menuLink = typeof page.locator === 'function'
        ? page.locator('a[href="/menu"]')
        : page.getByRole('link', { name: 'Menu', exact: true });
      if (await menuLink.count()) {
        await menuLink.first().click({ timeout: timeoutMs });
        await wait(page, conditionTimeoutMs);
        let menuResult = await inspect(page);
        observations.menu = {
          status: 'VISIBLE_MENU_LINK_ACTIVATED',
          url: redactUrl(page.url()),
          title: menuResult.snapshot.title,
          pageStatus: menuResult.status,
          visibleLinks: (await capturePageSnapshot(page, inspect)).links,
          visibleButtons: (await capturePageSnapshot(page, inspect)).buttons,
          resultsEntryPoints: menuResult.snapshot.resultsEntryPoints || [],
        };
        const results = (menuResult.snapshot.resultsEntryPoints || []).find(({ text }) => /^results?$/i.test(text));
        if (results) {
          const resultControl = page.getByRole(results.tag === 'a' ? 'link' : 'button', {
            name: results.text,
            exact: true,
          }).first();
          await resultControl.click({ timeout: timeoutMs });
          await wait(page, conditionTimeoutMs);
          menuResult = await inspect(page);
          observations.results = {
            status: 'VISIBLE_RESULTS_CONTROL_ACTIVATED',
            url: redactUrl(page.url()),
            title: menuResult.snapshot.title,
            pageStatus: menuResult.status,
            liveEvidence: menuResult.snapshot.liveEvidence || [],
            relevantVisibleText: (await capturePageSnapshot(page, inspect)).relevantVisibleText,
          };
        } else {
          observations.results = {
            status: 'NO_RESULTS_CONTROL_FOUND_IN_MENU',
            reason: 'The opened menu contained no link or button labelled Results.',
          };
        }
        if (page.url() !== targetUrl) {
          await navigate(page, targetUrl, { waitUntil: 'domcontentloaded', timeout: conditionTimeoutMs });
          await wait(page, conditionTimeoutMs);
        }
      } else {
        observations.menu = { status: 'NO_VISIBLE_MENU_LINK' };
      }
    } catch (error) {
      observations.menu = { status: 'ACTIVATION_FAILED', reason: redactText(error.message) };
    }
  }
  return observations;
}

function createInspectionReport(result) {
  const snapshot = result.snapshot || {};
  const liveEvidence = result.fixtureDetailObservation?.liveEvidence?.length
    ? result.fixtureDetailObservation.liveEvidence
    : snapshot.liveEvidence || [];
  const resultsEntryPoints = snapshot.resultsEntryPoints || [];
  return {
    mode: 'real_betking_read_only',
    targetUrl: BETKING_TARGET_URL,
    readOnly: true,
    status: result.status,
    reason: result.reason,
    pageClassification: result.pageClassification || (
      result.status === BETKING_STATUSES.ACCESS_RESTRICTED
        ? 'access_restricted'
        : result.status === BETKING_STATUSES.AUTH_REQUIRED
          ? 'authentication_required'
          : result.status === BETKING_STATUSES.READY_READ_ONLY
            ? 'real_betking_page'
            : result.status === 'NAVIGATION_FAILED'
              ? 'navigation_failed'
              : result.status === BETKING_STATUSES.PAGE_UNAVAILABLE
                ? 'page_unavailable'
                : 'inspectable_page_without_verified_league_data'
    ),
    reconnaissance: result.reconnaissance || {
      snapshots: [],
      navigation: [],
      requests: [],
      domChanges: [],
    },
    manualInspection: result.manualInspection || { status: 'NOT_REQUESTED' },
    sessionReuse: result.sessionReuse || { status: 'NOT_TESTED' },
    page: {
      url: snapshot.url,
      title: snapshot.title,
      league: snapshot.league,
      marketCategories: snapshot.marketCategories,
      selectedMarket: snapshot.selectedMarketName,
      cookieConsent: snapshot.cookieConsent,
      cookieConsentChoice: result.cookieConsentChoice || null,
      blockingOverlays: snapshot.blockingOverlays,
      resultsEntryPoints,
      liveEvidence,
      visibleSelectionNames: snapshot.visibleSelectionNames,
      loginRequired: result.status === BETKING_STATUSES.AUTH_REQUIRED,
      signInButtonVisible: snapshot.signInButtonVisible,
      accessRestricted: snapshot.accessRestricted,
      nextScheduledRound: snapshot.rounds[0]
        ? {
          name: snapshot.rounds[0].roundName,
          id: snapshot.rounds[0].roundId || null,
          scheduledTimer: snapshot.rounds[0].timer,
        }
        : null,
    },
    rounds: (snapshot.rounds || []).map(({ roundName, roundId, timer, fixtures }) => ({
      roundName,
      roundId,
      scheduledTimer: timer,
      fixtures: fixtures.map(({ fixtureId, scheduledMatchId, home, away }) => ({
        fixtureId,
        scheduledMatchId,
        home,
        away,
      })),
    })),
    markets: describeMarkets(snapshot),
    marketInspection: {
      inspected: result.marketInspection?.inspected?.map(({ name, result: marketResult }) => ({
        marketName: name,
        status: marketResult.status,
        fixtures: describeMarkets(marketResult.snapshot),
      })) || [],
      skipped: result.marketInspection?.skipped || [],
    },
    fixtureDetailObservation: result.fixtureDetailObservation || {
      status: 'NOT_ATTEMPTED',
      reason: 'No fixture-detail observation was available.',
    },
    navigationInspection: result.navigationInspection || {},
    liveJourney: result.liveJourney || {
      status: 'NOT_ATTEMPTED',
      reason: 'Live match and results journey was not traced.',
    },
    strategyMappings: STRATEGY_BET_TYPES.map(({ strategyKey, strategyLabel, canonicalId, betKing }) => ({
      strategyKey,
      strategyLabel,
      canonicalId,
      status: betKing.status || UNRESOLVED_MARKET,
      market: betKing.market,
      selection: betKing.selection,
    })),
    liveMatchObservation: liveEvidence.length
      ? {
        status: 'VISIBLE_MARKERS_ONLY',
        evidence: liveEvidence,
        reason: 'Visible markers were recorded, but no verified live-fixture field selector contract is available.',
      }
      : {
        status: 'NO_VISIBLE_LIVE_MARKERS',
        reason: 'No visible test-id for live score, clock, or completion was found on the scheduled page; the round countdown is reported separately.',
      },
    clockEvidence: {
      scheduledRoundCountdown: snapshot.rounds?.map(({ roundName, timer }) => ({
        roundName,
        timer,
        classification: 'SCHEDULED_ROUND_COUNTDOWN_NOT_MATCH_CLOCK',
      })) || [],
      matchClockEvidence: liveEvidence.filter(({ testId, text }) => /clock|minute/i.test(`${testId} ${text}`)),
    },
    resultsObservation: resultsEntryPoints.length
      ? {
        status: 'ENTRY_POINT_VISIBLE_NOT_OPENED',
        entryPoints: resultsEntryPoints,
        reason: 'A visible Results entry point was recorded, but its destination was not navigated without a verified route contract.',
      }
      : {
        status: 'NO_VISIBLE_RESULTS_ENTRY_POINT',
        reason: 'No visible link or button labelled Results was found on the scheduled page.',
      },
  };
}

async function waitForUsablePage(page, timeoutMs) {
  await page.waitForFunction(
    () => Boolean(document.body && document.body.innerText.trim()),
    { timeout: timeoutMs },
  );
  if (typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(Math.min(1000, timeoutMs));
  }
}

async function inspectBetKingReadOnly({
  config = createAutomationConfig(),
  dependencies = {},
} = {}) {
  const launch = dependencies.launchBrowser || browserManager.launchBrowser;
  const navigate = dependencies.navigateTo || navigateTo;
  const wait = dependencies.waitForUsablePage || waitForUsablePage;
  const inspect = dependencies.inspectBetKingPage || inspectBetKingPage;
  const targetUrl = dependencies.targetUrl || BETKING_TARGET_URL;
  let browserSession;
  let inspectionError;

  try {
    browserSession = await launch({
      headless: false,
      timeout: config.browserLaunchTimeoutMs,
      defaultTimeout: config.pageTimeoutMs,
      userDataDir: config.betkingProfileDir || DEFAULT_PROFILE_DIR,
    });
    const page = browserSession.page;
    const recorder = createObservationRecorder(page);
    await installDomChangeRecorder(page);
    const snapshots = [{
      phase: 'before_navigation',
      snapshot: await capturePageSnapshot(page, async () => ({
        status: 'INITIAL_PAGE',
        reason: 'Captured before navigating to the configured BetKing target.',
        snapshot: {},
      })),
    }];
    let navigationError;
    try {
      await navigate(page, targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.navigationTimeoutMs,
      });
    } catch (error) {
      navigationError = error;
    }
    if (!navigationError) await wait(page, config.conditionTimeoutMs);
    let result;
    if (navigationError) {
      result = {
        status: 'NAVIGATION_FAILED',
        reason: redactText(navigationError.message),
        snapshot: {
          url: redactUrl(typeof page.url === 'function' ? page.url() : targetUrl),
          title: '',
          rounds: [],
          marketCategories: [],
        },
      };
    } else {
      snapshots.push({ phase: 'after_navigation', snapshot: await capturePageSnapshot(page, inspect) });
      let manualInspection = { status: 'NOT_REQUESTED' };
      if (dependencies.waitForManualLogin || dependencies.waitForManualInspection) {
        const prompt = dependencies.waitForManualInspection || dependencies.waitForManualLogin;
        const userResumed = await prompt(config.manualLoginTimeoutMs);
        manualInspection = { status: userResumed ? 'RESUMED' : 'TIMED_OUT' };
        const resumedUrl = typeof page.url === 'function' ? page.url() : '';
        let resumedOrigin = null;
        try {
          resumedOrigin = new URL(resumedUrl).origin;
        } catch {
          resumedOrigin = null;
        }
        const expectedOrigin = new URL(targetUrl).origin;
        if (userResumed && resumedOrigin && resumedOrigin !== expectedOrigin) {
          manualInspection = {
            status: 'ORIGIN_MISMATCH',
            url: redactUrl(resumedUrl),
            expectedOrigin,
            actualOrigin: resumedOrigin,
            reason: 'The manually opened page is outside the configured BetKing origin; its DOM was not inspected.',
          };
          result = {
            status: 'MANUAL_NAVIGATION_LEFT_BETKING_ORIGIN',
            reason: manualInspection.reason,
            snapshot: { url: redactUrl(resumedUrl), title: '', rounds: [], marketCategories: [] },
          };
        } else {
          if (userResumed) await wait(page, config.conditionTimeoutMs);
          snapshots.push({ phase: 'after_manual_pause', snapshot: await capturePageSnapshot(page, inspect) });
        }
      }
      if (!result) result = await inspect(page);
      result.manualInspection = manualInspection;
    }
    if (result.snapshot.cookieConsent) {
      result.cookieConsentChoice = await (
        dependencies.dismissOptionalCookieConsent || dismissOptionalCookieConsent
      )(page, result.snapshot, config.actionTimeoutMs);
      if (result.cookieConsentChoice) {
        await wait(page, config.conditionTimeoutMs);
        result = await inspect(page);
        result.cookieConsentChoice = 'optional_cookies_rejected';
      }
    }
    if (result.status === BETKING_STATUSES.READY_READ_ONLY) {
      result.navigationInspection = {};
      result.navigationInspection.moreMarkets = await (
        dependencies.inspectMoreMarkets || inspectMoreMarkets
      )(page, result, {
        inspect,
        timeoutMs: Math.max(config.actionTimeoutMs, config.conditionTimeoutMs),
      });
      const afterMoreMarkets = await inspect(page);
      if (afterMoreMarkets.status === BETKING_STATUSES.READY_READ_ONLY) {
        result.snapshot = afterMoreMarkets.snapshot;
      }
      result.navigationInspection.rounds = await (
        dependencies.inspectRoundNavigation || inspectRoundNavigation
      )(page, result.snapshot, {
        inspect,
        timeoutMs: Math.max(config.actionTimeoutMs, config.conditionTimeoutMs),
        conditionTimeoutMs: config.conditionTimeoutMs,
      });
      result.marketInspection = await (dependencies.inspectAvailableMarkets || inspectAvailableMarkets)(
        page,
        result,
        {
          timeoutMs: Math.max(config.actionTimeoutMs, config.conditionTimeoutMs),
          conditionTimeoutMs: config.conditionTimeoutMs,
        },
      );
      result.fixtureDetailObservation = await (
        dependencies.inspectScheduledFixtureDetails || inspectScheduledFixtureDetails
      )(page, result.snapshot, {
        inspect,
        timeoutMs: Math.max(config.actionTimeoutMs, config.conditionTimeoutMs),
      });
      result.navigationInspection.destinations = await (
        dependencies.inspectVisibleDestinations || inspectVisibleDestinations
      )(page, {
        inspect,
        navigate,
        wait,
        targetUrl,
        timeoutMs: Math.max(config.actionTimeoutMs, config.conditionTimeoutMs),
        conditionTimeoutMs: config.conditionTimeoutMs,
      });
    }

    // Trace live matches and results journey
    console.log('[INSPECTION] Starting live match and results journey trace...');
    result.liveJourney = await traceLiveAndResultsJourney(page, {
      inspect,
      navigate,
      wait,
      targetUrl,
      config,
    });
    console.log(`[INSPECTION] Live journey completed: ${result.liveJourney.overallStatus}`);

    if (!navigationError) {
      snapshots.push({ phase: 'after_automated_collection', snapshot: await capturePageSnapshot(page, inspect) });
    }
    await Promise.all(recorder.responseTasks);
    result.reconnaissance = {
      snapshots,
      navigation: recorder.navigation,
      requests: recorder.requests,
      domChanges: await readDomChanges(page),
      dataCapturePolicy: 'Request URLs, method/status/content type, and JSON field names only; no headers, cookies, storage, or response values are recorded.',
    };
    if (dependencies.manualLoginRequested && !navigationError) {
      const beforeRestart = {
        url: redactUrl(page.url()),
        status: result.status,
        signInButtonVisible: result.snapshot.signInButtonVisible,
      };
      await browserSession.close();
      browserSession = null;
      const restartedSession = await launch({
        headless: false,
        timeout: config.browserLaunchTimeoutMs,
        defaultTimeout: config.pageTimeoutMs,
        userDataDir: config.betkingProfileDir || DEFAULT_PROFILE_DIR,
      });
      browserSession = restartedSession;
      await navigate(restartedSession.page, targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.navigationTimeoutMs,
      });
      await wait(restartedSession.page, config.conditionTimeoutMs);
      const afterRestart = await inspect(restartedSession.page);
      result.sessionReuse = {
        status: 'CONTROLLED_RESTART_TESTED',
        beforeRestart,
        afterRestart: {
          url: redactUrl(restartedSession.page.url()),
          status: afterRestart.status,
          signInButtonVisible: afterRestart.snapshot.signInButtonVisible,
        },
        authenticatedReuseVerified: beforeRestart.signInButtonVisible === false
          && beforeRestart.status === BETKING_STATUSES.READY_READ_ONLY
          && afterRestart.status === BETKING_STATUSES.READY_READ_ONLY
          && afterRestart.snapshot.signInButtonVisible === false
          && new URL(restartedSession.page.url()).origin === new URL(targetUrl).origin,
        reason: 'Only the visible page state before and after a persistent-profile restart was compared; no cookies or storage were read.',
      };
    }
    return createInspectionReport(result);
  } catch (error) {
    inspectionError = error;
    throw error;
  } finally {
    if (browserSession) {
      try {
        await browserSession.close();
      } catch (closeError) {
        if (inspectionError) {
          throw new AggregateError(
            [inspectionError, closeError],
            `BetKing inspection failed and browser cleanup also failed: ${inspectionError.message}`,
          );
        }
        throw closeError;
      }
    }
  }
}

async function promptForManualLogin(timeoutMs) {
  const readline = require('node:readline/promises');
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  let timer;
  try {
    const entered = terminal.question(
      `Explore or sign in manually in the visible BetKing browser if desired, then press Enter to resume inspection (max ${timeoutMs} ms). Do not bypass any security check: `,
    ).then(() => true);
    const timedOut = new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    return await Promise.race([entered, timedOut]);
  } finally {
    clearTimeout(timer);
    terminal.close();
  }
}

async function main() {
  try {
    const config = createAutomationConfig();
    const manualLoginRequested = process.argv.includes('--manual-login');
    const interactiveRequested = process.argv.includes('--interactive');
    const report = await inspectBetKingReadOnly({
      config,
      dependencies: {
        ...((manualLoginRequested || interactiveRequested)
          ? { waitForManualInspection: promptForManualLogin }
          : {}),
        manualLoginRequested,
      },
    });
    const paths = await writeInspectionReport(report);
    console.log(JSON.stringify(sanitize({ report: paths, ...report }), null, 2));
  } catch (error) {
    const report = createInspectionReport({
      status: 'BROWSER_OR_INSPECTION_FAILED',
      reason: redactText(error.message),
      pageClassification: 'browser_unavailable_or_inspection_failed',
      snapshot: {
        url: BETKING_TARGET_URL,
        title: '',
        league: null,
        marketCategories: [],
        rounds: [],
      },
      reconnaissance: {
        snapshots: [],
        navigation: [],
        requests: [],
        domChanges: [],
        failure: redactText(error.message),
      },
    });
    try {
      const paths = await writeInspectionReport(report);
      console.error(`[BETKING INSPECTION ERROR] ${redactText(error.message)}\nSanitized failure report: ${paths.markdownPath}`);
    } catch (reportError) {
      console.error(`[BETKING INSPECTION ERROR] ${redactText(error.message)}\nReport writing also failed: ${redactText(reportError.message)}`);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  BETKING_TARGET_URL,
  DEFAULT_PROFILE_DIR,
  DEFAULT_REPORT_DIR,
  capturePageSnapshot,
  createInspectionReport,
  createReadableReport,
  createObservationRecorder,
  dismissOptionalCookieConsent,
  describeMarkets,
  inspectBetKingReadOnly,
  inspectAvailableMarkets,
  inspectMoreMarkets,
  inspectRoundNavigation,
  inspectScheduledFixtureDetails,
  inspectVisibleDestinations,
  navigateToLiveSection,
  inspectLiveFixtures,
  navigateToResults,
  inspectResultsPage,
  inspectLiveMarketPanel,
  traceLiveAndResultsJourney,
  redactText,
  redactUrl,
  sanitize,
  waitForUsablePage,
  writeInspectionReport,
};
