const BETKING_STATUSES = Object.freeze({
  PAGE_UNAVAILABLE: 'PAGE_UNAVAILABLE',
  NO_LEAGUE: 'NO_LEAGUE',
  NO_FIXTURE: 'NO_FIXTURE',
  NO_MARKET: 'NO_MARKET',
  MISSING_ODDS: 'MISSING_ODDS',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  ACCESS_RESTRICTED: 'ACCESS_RESTRICTED',
  ACCESS_RESTRICTED: 'ACCESS_RESTRICTED',
  FIXTURE_NOT_FOUND: 'FIXTURE_NOT_FOUND',
  AMBIGUOUS_FIXTURE: 'AMBIGUOUS_FIXTURE',
  MATCH_VERIFIED: 'MATCH_VERIFIED',
  READY_READ_ONLY: 'READY_READ_ONLY',
});

const DEFAULT_MARKET_LABEL = '1X2';
const DEFAULT_SELECTION_LABELS = ['1', 'X', '2'];
const LIVE_RESULT_SELECTOR_KEYS = Object.freeze([
  'fixtureId',
  'home',
  'away',
  'roundId',
  'clock',
  'homeScore',
  'awayScore',
  'status',
]);

function toText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const candidate = typeof value === 'string' ? value.trim() : value;
  if (candidate === '') {
    return null;
  }
  const numericValue = Number(candidate);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeSelection(entry) {
  const label = toText(entry?.label ?? entry?.name ?? entry?.side ?? '').toUpperCase();
  const odds = toNumber(entry?.odds ?? entry?.value ?? entry?.price ?? entry?.odd ?? null);
  return {
    label,
    odds: odds,
  };
}

function normalizeFixture(rawFixture) {
  const home = toText(rawFixture?.home ?? rawFixture?.homeTeam ?? rawFixture?.teams?.home ?? '').toUpperCase();
  const away = toText(rawFixture?.away ?? rawFixture?.awayTeam ?? rawFixture?.teams?.away ?? '').toUpperCase();
  const fixtureId = toText(
    rawFixture?.fixtureId
    ?? rawFixture?.id
    ?? rawFixture?.scheduledMatchId
    ?? rawFixture?.scheduledFixtureId
    ?? rawFixture?.matchId
    ?? rawFixture?.matchupId
    ?? rawFixture?.matchup
    ?? `${home}-${away}`,
  );
  const marketValue = rawFixture?.market ?? rawFixture?.marketName ?? rawFixture?.selectedMarketName ?? '';
  const marketName = toText(marketValue) || '';
  const selections = Array.isArray(rawFixture?.selections) && rawFixture.selections.length > 0
    ? rawFixture.selections.map((entry) => normalizeSelection(entry))
    : Array.isArray(rawFixture?.odds)
      ? rawFixture.odds.map((value) => normalizeSelection({ odds: value }))
      : [];

  return {
    fixtureId,
    scheduledMatchId: toText(rawFixture?.scheduledMatchId ?? fixtureId),
    home,
    away,
    market: marketName,
    selections,
    marketCategories: Array.isArray(rawFixture?.marketCategories)
      ? rawFixture.marketCategories.map(toText).filter(Boolean)
      : [],
    selectors: rawFixture?.selectors || {},
    raw: rawFixture,
  };
}

function normalizeRound(rawRound, index) {
  const fixtures = Array.isArray(rawRound?.fixtures)
    ? rawRound.fixtures.map(normalizeFixture)
    : Array.isArray(rawRound?.matches)
      ? rawRound.matches.map(normalizeFixture)
      : [];

  return {
    roundName: toText(rawRound?.roundName ?? rawRound?.name ?? rawRound?.round ?? `Week ${index + 1}`),
    roundId: toText(rawRound?.roundId ?? rawRound?.id ?? String(index + 1)),
    timer: toText(rawRound?.timer ?? rawRound?.countdown ?? ''),
    fixtures,
  };
}

function normalizeBetKingSnapshot(snapshot = {}) {
  const rounds = Array.isArray(snapshot.rounds)
    ? snapshot.rounds.map(normalizeRound)
    : [];

  const leagueName = toText(
    snapshot?.league?.name
    ?? snapshot?.leagueName
    ?? snapshot?.league?.label
    ?? snapshot?.league?.key
    ?? 'Kings League',
  ) || 'Kings League';

  const leagueKey = toText(
    snapshot?.league?.key
    ?? snapshot?.league?.id
    ?? snapshot?.leagueIdentity?.key
    ?? 'kings-league',
  ) || 'kings-league';

  const normalized = {
    url: toText(snapshot?.url || ''),
    title: toText(snapshot?.title || ''),
    league: {
      name: leagueName,
      key: leagueKey,
    },
    rounds,
    selectedMarketName: toText(snapshot?.selectedMarketName ?? snapshot?.marketName ?? DEFAULT_MARKET_LABEL) || DEFAULT_MARKET_LABEL,
    marketCategories: Array.isArray(snapshot?.marketCategories)
      ? snapshot.marketCategories.map(toText).filter(Boolean)
      : [],
    cookieConsent: Boolean(snapshot?.cookieConsent),
    blockingOverlays: Array.isArray(snapshot?.blockingOverlays) ? snapshot.blockingOverlays : [],
    resultsEntryPoints: Array.isArray(snapshot?.resultsEntryPoints) ? snapshot.resultsEntryPoints : [],
    liveEvidence: Array.isArray(snapshot?.liveEvidence) ? snapshot.liveEvidence : [],
    visibleSelectionNames: Array.isArray(snapshot?.visibleSelectionNames)
      ? snapshot.visibleSelectionNames
      : [],
    signInButtonVisible: Boolean(snapshot?.signInButtonVisible),
    accessRestricted: Boolean(snapshot?.accessRestricted),
    loginRequired: Boolean(snapshot?.loginRequired),
    authRequired: Boolean(snapshot?.authRequired),
    pageStatus: toText(snapshot?.pageStatus || ''),
    requiresAuthentication: Boolean(snapshot?.requiresAuthentication),
  };

  return normalized;
}

function classifyBetKingPage(snapshot) {
  const normalized = normalizeBetKingSnapshot(snapshot);
  const hasLoginButton = Boolean(snapshot?.loginButtons || snapshot?.loginButton) || normalized.loginRequired || normalized.authRequired;

  if (normalized.accessRestricted) {
    return {
      status: BETKING_STATUSES.ACCESS_RESTRICTED,
      reason: normalized.pageStatus || 'The page reports restricted access; no access-control bypass was attempted.',
      snapshot: normalized,
    };
  }

  if (!normalized.url && !normalized.title && !normalized.rounds.length) {
    return {
      status: BETKING_STATUSES.PAGE_UNAVAILABLE,
      reason: 'No BetKing page snapshot was supplied.',
      snapshot: normalized,
    };
  }

  if (hasLoginButton && !normalized.rounds.length) {
    return {
      status: BETKING_STATUSES.AUTH_REQUIRED,
      reason: 'The page appears to require authentication before the league schedule is visible.',
      snapshot: normalized,
    };
  }

  const fixtureCount = normalized.rounds.reduce((count, round) => count + round.fixtures.length, 0);
  if (!normalized.league?.name && !fixtureCount) {
    return {
      status: BETKING_STATUSES.NO_LEAGUE,
      reason: 'No Kings League or scheduled-league structure was detected.',
      snapshot: normalized,
    };
  }

  if (!fixtureCount) {
    return {
      status: BETKING_STATUSES.NO_FIXTURE,
      reason: 'The league is visible but no scheduled fixtures were found.',
      snapshot: normalized,
    };
  }

  const hasMarket = normalized.rounds.some((round) => round.fixtures.some((fixture) => fixture.market && fixture.market.length > 0));
  if (!hasMarket) {
    return {
      status: BETKING_STATUSES.NO_MARKET,
      reason: 'The scheduled matches were visible, but no market label or selection market metadata could be inferred.',
      snapshot: normalized,
    };
  }

  const hasOdds = normalized.rounds.some((round) => round.fixtures.some((fixture) => Array.isArray(fixture.selections) && fixture.selections.some((selection) => selection.odds !== null)));
  if (!hasOdds) {
    return {
      status: BETKING_STATUSES.MISSING_ODDS,
      reason: 'Fixtures and markets are visible but no usable odds were detected.',
      snapshot: normalized,
    };
  }

  return {
    status: BETKING_STATUSES.READY_READ_ONLY,
    reason: 'Scheduled fixture data and odds are available without interacting with the sportsbook.',
    snapshot: normalized,
  };
}

function normalizeTeamCode(value) {
  return toText(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function extractBetKingMarketSelections(fixture) {
  const marketName = toText(fixture?.market ?? fixture?.selectedMarketName ?? DEFAULT_MARKET_LABEL) || DEFAULT_MARKET_LABEL;
  const requiredLabels = [...DEFAULT_SELECTION_LABELS];
  const selectionMap = new Map();

  for (const selection of fixture.selections || []) {
    const label = toText(selection?.label ?? selection?.name ?? '').toUpperCase();
    const oddValue = toNumber(selection?.odds ?? selection?.value ?? selection?.price ?? selection?.odd);
    if (label) {
      selectionMap.set(label, oddValue);
    }
  }

  const missing = requiredLabels.filter((label) => !selectionMap.has(label) || selectionMap.get(label) === null);
  if (missing.length > 0) {
    return {
      status: BETKING_STATUSES.MISSING_ODDS,
      marketName,
      odds: Object.fromEntries(requiredLabels.map((label) => [label, selectionMap.get(label) ?? null])),
      missing,
    };
  }

  return {
    status: BETKING_STATUSES.MATCH_VERIFIED,
    marketName,
    odds: Object.fromEntries(requiredLabels.map((label) => [label, selectionMap.get(label)])),
    missing: [],
  };
}

function matchCatalogueaFixtureToBetKing(strategyInstruction, snapshot) {
  const normalizedSnapshot = normalizeBetKingSnapshot(snapshot);
  const classification = classifyBetKingPage(normalizedSnapshot);
  if (classification.status !== BETKING_STATUSES.READY_READ_ONLY) {
    return {
      status: classification.status,
      reason: classification.reason,
      fixture: null,
      market: null,
      readOnly: true,
      strategy: strategyInstruction || null,
    };
  }

  const strategyFixture = strategyInstruction?.fixture || strategyInstruction || null;
  if (!strategyFixture || !strategyFixture.home || !strategyFixture.away) {
    return {
      status: BETKING_STATUSES.FIXTURE_NOT_FOUND,
      reason: 'No Cataloguea strategy fixture was supplied for read-only matching.',
      fixture: null,
      market: null,
      readOnly: true,
      strategy: strategyInstruction || null,
    };
  }

  const expectedLeague = toText(normalizedSnapshot.league?.name || '').toLowerCase();
  if (expectedLeague && !expectedLeague.includes('kings')) {
    return {
      status: BETKING_STATUSES.NO_LEAGUE,
      reason: 'The visible BetKing league is not Kings League.',
      fixture: null,
      market: null,
      readOnly: true,
      strategy: strategyInstruction || null,
    };
  }

  const expectedHome = normalizeTeamCode(strategyFixture.home);
  const expectedAway = normalizeTeamCode(strategyFixture.away);
  const candidates = [];
  for (const round of normalizedSnapshot.rounds || []) {
    for (const fixture of round.fixtures || []) {
      const home = normalizeTeamCode(fixture.home);
      const away = normalizeTeamCode(fixture.away);
      const fixtureId = toText(fixture.fixtureId || fixture.scheduledMatchId || '');
      const fixtureMatch = (home === expectedHome && away === expectedAway)
        || (home === expectedAway && away === expectedHome && fixtureId.includes(`${expectedHome}-${expectedAway}`));
      if (fixtureMatch) {
        candidates.push({
          roundName: round.roundName,
          roundId: round.roundId,
          timer: round.timer,
          fixture,
        });
      }
    }
  }

  if (candidates.length === 0) {
    return {
      status: BETKING_STATUSES.FIXTURE_NOT_FOUND,
      reason: 'No BetKing scheduled fixture matched the Cataloguea strategy fixture and league context.',
      fixture: null,
      market: null,
      readOnly: true,
      strategy: strategyInstruction || null,
    };
  }

  if (candidates.length > 1) {
    return {
      status: BETKING_STATUSES.AMBIGUOUS_FIXTURE,
      reason: 'Multiple BetKing scheduled fixtures matched the same strategy fixture; no unsafe auto-selection was made.',
      candidates: candidates.map(({ roundName, roundId, timer, fixture }) => ({
        roundName,
        roundId,
        timer,
        fixtureId: fixture.fixtureId,
        home: fixture.home,
        away: fixture.away,
      })),
      fixture: null,
      market: null,
      readOnly: true,
      strategy: strategyInstruction || null,
    };
  }

  const [candidate] = candidates;
  const marketObservation = extractBetKingMarketSelections(candidate.fixture);
  if (marketObservation.status === BETKING_STATUSES.MISSING_ODDS) {
    return {
      status: BETKING_STATUSES.MISSING_ODDS,
      reason: `Market ${marketObservation.marketName} was visible but odds were incomplete for ${candidate.fixture.home} vs ${candidate.fixture.away}.`,
      fixture: {
        id: candidate.fixture.fixtureId,
        scheduledMatchId: candidate.fixture.scheduledMatchId,
        home: candidate.fixture.home,
        away: candidate.fixture.away,
        roundName: candidate.roundName,
        roundId: candidate.roundId,
        timer: candidate.timer,
        market: marketObservation.marketName,
      },
      market: marketObservation,
      readOnly: true,
      strategy: strategyInstruction || null,
    };
  }

  const requestedMarket = toText(normalizedSnapshot.selectedMarketName || DEFAULT_MARKET_LABEL).toUpperCase();
  if (requestedMarket && requestedMarket !== DEFAULT_MARKET_LABEL.toUpperCase()) {
    return {
      status: BETKING_STATUSES.NO_MARKET,
      reason: `Expected BetKing market ${DEFAULT_MARKET_LABEL}, but the page exposed ${requestedMarket}.`,
      fixture: {
        id: candidate.fixture.fixtureId,
        scheduledMatchId: candidate.fixture.scheduledMatchId,
        home: candidate.fixture.home,
        away: candidate.fixture.away,
        roundName: candidate.roundName,
        roundId: candidate.roundId,
        timer: candidate.timer,
        market: requestedMarket,
      },
      market: null,
      readOnly: true,
      strategy: strategyInstruction || null,
    };
  }

  return {
    status: BETKING_STATUSES.MATCH_VERIFIED,
    match: 'VERIFIED',
    reason: 'Cataloguea fixture and BetKing scheduled fixture matched using a deterministic home/away and league context check.',
    fixture: {
      cataloguea: {
        fixtureId: strategyFixture.id || `${strategyFixture.home}-${strategyFixture.away}`,
        home: toText(strategyFixture.home).toUpperCase(),
        away: toText(strategyFixture.away).toUpperCase(),
      },
      betking: {
        fixtureId: candidate.fixture.fixtureId,
        scheduledMatchId: candidate.fixture.scheduledMatchId,
        home: candidate.fixture.home,
        away: candidate.fixture.away,
        roundName: candidate.roundName,
        roundId: candidate.roundId,
        timer: candidate.timer,
        market: marketObservation.marketName,
      },
    },
    market: {
      name: marketObservation.marketName,
      selections: Object.entries(marketObservation.odds).map(([label, odds]) => ({ label, odds })),
      odds: marketObservation.odds,
    },
    strategy: {
      fixtureId: strategyFixture.id || `${strategyFixture.home}-${strategyFixture.away}`,
      home: toText(strategyFixture.home).toUpperCase(),
      away: toText(strategyFixture.away).toUpperCase(),
      recommendedAction: strategyInstruction?.recommendedAction || 'read_only_observation',
      observedAt: strategyInstruction?.observedAt || new Date().toISOString(),
    },
    readOnly: true,
  };
}

async function inspectBetKingPage(page) {
  if (!page || typeof page.evaluate !== 'function') {
    throw new TypeError('A Playwright-like page instance with page.evaluate() is required for live BetKing inspection.');
  }

  const rawSnapshot = await page.evaluate(() => {
    const defaultMarketLabel = '1X2';
    const text = (element) => (element ? (element.textContent || '').replace(/\s+/g, ' ').trim() : '');
    const roundEls = [...document.querySelectorAll('[data-testid="league-round"]')];
    const leagueTab = [...document.querySelectorAll('[data-testid^="league-switcher-tab-"]')].find((element) => /kings/i.test(text(element)));
    const selectedMarket = document.querySelector('[data-testid="selected-market-name"]');
    const pageSelectionNames = [...document.querySelectorAll('[data-testid="selection-name"]')]
      .map(text);
    const marketCategories = [...document.querySelectorAll('[data-testid="market-selector-tab"]')]
      .map(text)
      .filter(Boolean);
    const loginButtons = document.querySelectorAll('[data-testid="signInButton"]').length > 0;
    const bodyText = text(document.body);
    const accessRestricted = /\b(access denied|access restricted|temporarily blocked|verify you are human|unusual traffic)\b/i.test(bodyText);
    const blockingOverlays = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-testid*="cookie"], [data-testid*="consent"], [id*="cookie" i], [name*="cookie" i]')]
      .filter((element) => typeof element.getClientRects !== 'function' || element.getClientRects().length > 0)
      .map((element) => ({
        text: text(element).slice(0, 500),
        selector: element.getAttribute('data-testid')
          ? `[data-testid="${element.getAttribute('data-testid')}"]`
          : element.id ? `#${element.id}`
          : element.getAttribute('role') === 'dialog' ? '[role="dialog"]' : '[aria-modal="true"]',
        buttons: [...element.querySelectorAll('button, [role="button"]')]
          .filter((button) => typeof button.getClientRects !== 'function' || button.getClientRects().length > 0)
          .map((button) => text(button) || button.getAttribute('aria-label') || '')
          .filter(Boolean),
        visibleActions: [...element.querySelectorAll('*')]
          .filter((candidate) => typeof candidate.getClientRects !== 'function' || candidate.getClientRects().length > 0)
          .map((candidate) => text(candidate))
          .filter((candidate) => /^(accept all cookies|reject optional cookies|only necessary cookies)$/i.test(candidate)),
      }));
    const cookieConsent = blockingOverlays.some(({ text: overlayText }) => /cookie|consent|privacy/i.test(overlayText));
    const resultsEntryPoints = [...document.querySelectorAll('a, button')]
      .filter((element) => /^(results?|match results)$/i.test(text(element) || element.getAttribute('aria-label') || ''))
      .filter((element) => typeof element.getClientRects !== 'function' || element.getClientRects().length > 0)
      .map((element) => ({
        text: text(element) || element.getAttribute('aria-label') || '',
        tag: element.tagName.toLowerCase(),
        href: element.getAttribute('href') || '',
        testId: element.getAttribute('data-testid') || '',
      }));
    const liveEvidence = [...document.querySelectorAll('[data-testid]')]
      .filter((element) => /live|score|clock|finished|completed|match-status/i.test(element.getAttribute('data-testid') || ''))
      .filter((element) => typeof element.getClientRects !== 'function' || element.getClientRects().length > 0)
      .map((element) => ({
        testId: element.getAttribute('data-testid'),
        text: text(element),
      }));

    const rounds = roundEls.map((roundEl) => {
      const roundName = text(roundEl.querySelector('[data-testid="round-name"]'));
      const timer = text(roundEl.querySelector('[data-testid="round-timer"]'));
      const matchEls = [...roundEl.querySelectorAll('[data-testid="match"]')];

      const fixtures = matchEls.map((matchEl) => {
        const homeEl = matchEl.querySelector('[data-testid="teams-home-name"]');
        const awayEl = matchEl.querySelector('[data-testid="teams-away-name"]');
        const home = text(homeEl).toUpperCase();
        const away = text(awayEl).toUpperCase();
        const button = [...matchEl.querySelectorAll('button')].find((element) => /matchup-statistics-button-/.test(element.getAttribute('data-testid') || ''));
        const buttonId = button ? button.getAttribute('data-testid') : '';
        const fixtureId = buttonId
          ? buttonId.replace('matchup-statistics-button-', '')
          : `${home}-${away}`;
        const selectionNames = [...matchEl.querySelectorAll('[data-testid="selection-name"]')];
        const oddsValues = [...matchEl.querySelectorAll('[data-testid="match-odd-value"]')];
        const exactSelectionNames = selectionNames.length === oddsValues.length
          ? selectionNames.map(text)
          : [];
        const selections = oddsValues.map((element, index) => {
          const rawOdds = (element.textContent || '').trim();
          const parsedOdds = Number(rawOdds.replace(/,/g, ''));
          const marketName = text(selectedMarket) || defaultMarketLabel;
          const label = exactSelectionNames[index] || '';
          return {
            label,
            odds: rawOdds && Number.isFinite(parsedOdds) ? parsedOdds : null,
          };
        });

        return {
          fixtureId,
          scheduledMatchId: buttonId,
          home,
          away,
          market: text(selectedMarket) || defaultMarketLabel,
          selections,
          marketCategories,
          selectors: {
            fixture: '[data-testid="match"]',
            home: '[data-testid="teams-home-name"]',
            away: '[data-testid="teams-away-name"]',
            market: '[data-testid="selected-market-name"]',
            selections: '[data-testid="selection-name"]',
            odds: '[data-testid="match-odd-value"]',
          },
        };
      }).filter((fixture) => fixture.home && fixture.away);

      return {
        roundName,
        roundId: roundEl.getAttribute('data-round-id') || roundEl.id || '',
        timer,
        fixtures,
      };
    }).filter((round) => round.fixtures.length > 0);

    return {
      url: location.href,
      title: document.title,
      league: {
        name: text(leagueTab) || 'Kings League',
        key: 'kings-league',
      },
      selectedMarketName: text(selectedMarket) || defaultMarketLabel,
      visibleSelectionNames: pageSelectionNames.filter(Boolean),
      marketCategories,
      cookieConsent,
      blockingOverlays,
      resultsEntryPoints,
      liveEvidence,
      accessRestricted,
      pageStatus: accessRestricted ? 'BetKing access-restriction text is visible on the page.' : '',
      loginRequired: loginButtons && rounds.length === 0,
      signInButtonVisible: loginButtons,
      rounds,
    };
  });

  return classifyBetKingPage(rawSnapshot);
}

async function readLiveFixtureSnapshot(page, selectors) {
  if (!page || typeof page.evaluate !== 'function') {
    throw new TypeError('A Playwright-like page instance with page.evaluate() is required for live fixture inspection.');
  }
  if (!selectors || typeof selectors !== 'object' || Array.isArray(selectors)) {
    throw new TypeError('Explicitly observed live-fixture selectors are required; none are guessed.');
  }

  const selectorMap = {};
  for (const key of LIVE_RESULT_SELECTOR_KEYS) {
    const entry = selectors[key];
    const selector = typeof entry === 'string' ? entry : entry?.selector;
    if (typeof selector !== 'string' || selector.trim().length === 0) {
      throw new TypeError(`A verified selector for live fixture field "${key}" is required.`);
    }
    const attribute = typeof entry === 'object' ? entry.attribute : undefined;
    if (attribute !== undefined && (typeof attribute !== 'string' || attribute.length === 0)) {
      throw new TypeError(`The selector attribute for live fixture field "${key}" must be a non-empty string.`);
    }
    selectorMap[key] = { selector, attribute };
  }

  return page.evaluate((fields) => {
    const read = (field) => {
      const element = document.querySelector(field.selector);
      if (!element) return null;
      if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) {
        return null;
      }
      const value = field.attribute
        ? element.getAttribute(field.attribute)
        : element.textContent;
      return value === null || value === undefined
        ? null
        : String(value).replace(/\s+/g, ' ').trim();
    };

    return {
      fixture: {
        id: read(fields.fixtureId),
        home: read(fields.home),
        away: read(fields.away),
        roundId: read(fields.roundId),
      },
      clock: read(fields.clock),
      homeScore: read(fields.homeScore),
      awayScore: read(fields.awayScore),
      status: read(fields.status),
      observedAt: new Date().toISOString(),
    };
  }, selectorMap);
}

module.exports = {
  BETKING_STATUSES,
  DEFAULT_MARKET_LABEL,
  DEFAULT_SELECTION_LABELS,
  LIVE_RESULT_SELECTOR_KEYS,
  classifyBetKingPage,
  inspectBetKingPage,
  matchCatalogueaFixtureToBetKing,
  normalizeBetKingSnapshot,
  readLiveFixtureSnapshot,
};
