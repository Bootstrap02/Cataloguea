// Playwright implementations of the ports used by the operational workflow.
//
// SAFETY BOUNDARY: this module reads the page and, only when explicitly asked,
// activates a verified selection and types a stake into the bet slip. It has no
// code path that submits a wager, and it never receives a "place bet" selector.
//
// SELECTOR STATUS: round/fixture/odds selectors come from the existing read-only
// adapter (observed in earlier stages). Live, results, and bet-slip selectors are
// NOT guessed; they come from the user's selectors file and are used only when
// complete.

const { inspectBetKingPage, readLiveFixtureSnapshot } = require('./betkingAdapter');
const { parseWeek } = require('../strategy/seasonWeek');
const { normalizeTeamCode } = require('../strategy/fixtureIdentity');

const ROUND_SWITCHER = '[data-testid^="round-switcher-button-"]';
const MARKET_TAB = '[data-testid="market-selector-tab"]';
const SELECTED_MARKET = '[data-testid="selected-market-name"]';
const TARGET_ATTRIBUTE = 'data-cataloguea-target';

class PortError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PortError';
    this.code = code;
  }
}

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function createBetKingPorts({ page, config, selectors }) {
  if (!page || typeof page.evaluate !== 'function') {
    throw new TypeError('A Playwright page is required for the BetKing ports.');
  }
  const waitMs = config?.navigationWaitTimeoutMs ?? 500;
  const actionTimeout = Math.max(config?.actionTimeoutMs ?? 1000, 2000);

  async function settle() {
    if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(waitMs);
  }

  // ---- schedule / week -----------------------------------------------------

  async function readSchedule() {
    return inspectBetKingPage(page);
  }

  // Visible week: the selected round-switcher control when its selected state is
  // exposed (aria-selected / aria-pressed / aria-current); otherwise the first
  // rendered round. The selected-state attribute is UNVERIFIED on the real site.
  async function readVisibleWeek() {
    const info = await page.evaluate((switcherSelector) => {
      const text = (element) => (element ? (element.textContent || '').replace(/\s+/g, ' ').trim() : '');
      const buttons = [...document.querySelectorAll(switcherSelector)];
      const selected = buttons.find((button) => ['aria-selected', 'aria-pressed', 'aria-current']
        .some((name) => button.getAttribute(name) === 'true'));
      const firstRound = document.querySelector('[data-testid="league-round"] [data-testid="round-name"]');
      return { selected: selected ? text(selected) : null, firstRound: firstRound ? text(firstRound) : null };
    }, ROUND_SWITCHER);
    return parseWeek(info.selected ?? '') ?? parseWeek(info.firstRound ?? '');
  }

  async function selectWeek(week) {
    const locator = page.locator(ROUND_SWITCHER);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const control = locator.nth(index);
      const label = (await control.innerText()).replace(/\s+/g, ' ').trim();
      if (parseWeek(label) === week) {
        await control.click({ timeout: actionTimeout });
        await settle();
        return;
      }
    }
    throw new PortError('ROUND_CONTROL_NOT_FOUND', `No visible round control for week ${week}.`);
  }

  // ---- live ----------------------------------------------------------------

  function requireSelectors(section, code) {
    if (!selectors?.configured?.[section]) {
      throw new PortError(code, `The "${section}" selectors are not configured (${selectors?.filePath ?? 'no selectors file'}).`);
    }
  }

  async function openLive() {
    const enterLive = selectors?.liveNavigation?.enterLive;
    if (typeof enterLive !== 'string' || enterLive.trim().length === 0) return false;
    await page.locator(enterLive).first().click({ timeout: actionTimeout });
    await settle();
    return true;
  }

  async function readLiveSnapshot() {
    requireSelectors('live', 'LIVE_SELECTORS_NOT_CONFIGURED');
    const snapshot = await readLiveFixtureSnapshot(page, selectors.live);
    const map = selectors.liveStatusMap || {};
    const rawStatus = normalize(snapshot.status);
    return { ...snapshot, status: map[rawStatus] ?? rawStatus };
  }

  // ---- results -------------------------------------------------------------

  async function readResultsRows() {
    const config = selectors.results;
    return page.evaluate(({ rowSelector, fields }) => {
      const readEntry = (row, entry) => {
        if (!entry) return null;
        const selector = typeof entry === 'string' ? entry : entry.selector;
        const attribute = typeof entry === 'object' ? entry.attribute : undefined;
        const element = row.querySelector(selector);
        if (!element) return null;
        const value = attribute ? element.getAttribute(attribute) : element.textContent;
        return value === null || value === undefined ? null : String(value).replace(/\s+/g, ' ').trim();
      };
      return [...document.querySelectorAll(rowSelector)].map((row) => ({
        fixtureId: readEntry(row, fields.fixtureId),
        home: readEntry(row, fields.home),
        away: readEntry(row, fields.away),
        roundId: readEntry(row, fields.roundId),
        status: readEntry(row, fields.status),
        homeFT: readEntry(row, fields.homeScoreFT),
        awayFT: readEntry(row, fields.awayScoreFT),
        homeHT: readEntry(row, fields.homeScoreHT),
        awayHT: readEntry(row, fields.awayScoreHT),
      }));
    }, { rowSelector: config.rowSelector, fields: config.fields });
  }

  function toInteger(value) {
    return typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
  }

  async function readResultsPage() {
    requireSelectors('results', 'RESULTS_SELECTORS_NOT_CONFIGURED');
    let rows = await readResultsRows();
    const navigate = selectors.results.navigateSelector;
    if (rows.length === 0 && typeof navigate === 'string' && navigate.trim()) {
      await page.locator(navigate).first().click({ timeout: actionTimeout });
      await settle();
      rows = await readResultsRows();
    }
    const statusMap = selectors.results.statusMap || {};
    const observedAt = new Date().toISOString();
    return {
      results: rows.map((row) => {
        const home = normalizeTeamCode(row.home);
        const away = normalizeTeamCode(row.away);
        const rawStatus = normalize(row.status);
        const homeHT = toInteger(row.homeHT);
        const awayHT = toInteger(row.awayHT);
        return {
          fixture: {
            id: row.fixtureId,
            fixtureId: row.fixtureId,
            home,
            away,
            homeName: normalize(row.home),
            awayName: normalize(row.away),
            roundId: row.roundId,
            roundName: row.roundId,
          },
          status: statusMap[rawStatus] ?? rawStatus,
          fullTime: { home: toInteger(row.homeFT), away: toInteger(row.awayFT) },
          halfTime: homeHT !== null || awayHT !== null ? { home: homeHT, away: awayHT } : null,
          timestamp: observedAt,
        };
      }),
    };
  }

  // ---- market / selection (read-only unless populate is requested) -----------

  async function readSelectedMarket() {
    return page.evaluate((selector) => {
      const element = document.querySelector(selector);
      return element ? (element.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }, SELECTED_MARKET);
  }

  async function ensureMarket(market) {
    const current = await readSelectedMarket();
    if (normalize(current) === normalize(market)) return { ok: true, original: current };
    const tabs = page.locator(MARKET_TAB);
    const count = await tabs.count();
    const available = [];
    for (let index = 0; index < count; index += 1) {
      const label = (await tabs.nth(index).innerText()).replace(/\s+/g, ' ').trim();
      available.push(label);
      if (normalize(label) === normalize(market)) {
        await tabs.nth(index).click({ timeout: actionTimeout });
        await settle();
        const after = await readSelectedMarket();
        return normalize(after) === normalize(market)
          ? { ok: true, original: current }
          : { ok: false, original: current, available, reason: 'MARKET_TAB_NOT_ACTIVATED' };
      }
    }
    return { ok: false, original: current, available, reason: 'MARKET_NOT_AVAILABLE' };
  }

  async function restoreMarket(original) {
    if (!original) return;
    try {
      await ensureMarket(original);
    } catch (error) {
      // Best effort: the original market tab is only a display preference.
    }
  }

  function locateSelection(args) {
    return page.evaluate(({ roundName, home, away, selection, mark, attribute }) => {
      const text = (element) => (element ? (element.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase() : '');
      const rounds = [...document.querySelectorAll('[data-testid="league-round"]')]
        .filter((round) => text(round.querySelector('[data-testid="round-name"]')) === roundName);
      if (rounds.length !== 1) return { status: rounds.length === 0 ? 'ROUND_NOT_FOUND' : 'AMBIGUOUS_ROUND' };
      const matches = [...rounds[0].querySelectorAll('[data-testid="match"]')]
        .filter((match) => text(match.querySelector('[data-testid="teams-home-name"]')) === home
          && text(match.querySelector('[data-testid="teams-away-name"]')) === away);
      if (matches.length !== 1) return { status: matches.length === 0 ? 'MATCH_NOT_FOUND' : 'AMBIGUOUS_MATCH' };
      const names = [...matches[0].querySelectorAll('[data-testid="selection-name"]')];
      const odds = [...matches[0].querySelectorAll('[data-testid="match-odd-value"]')];
      if (names.length === 0 || names.length !== odds.length) return { status: 'SELECTIONS_NOT_ALIGNED' };
      const index = names.findIndex((name) => text(name) === selection);
      if (index === -1) return { status: 'MISSING_SELECTION', labels: names.map(text) };
      const raw = (odds[index].textContent || '').trim().replace(/,/g, '');
      const value = Number(raw);
      if (!raw || !Number.isFinite(value)) return { status: 'MISSING_ODDS' };
      if (mark) odds[index].setAttribute(attribute, '1');
      return { status: 'SELECTION_AVAILABLE', odds: value };
    }, args);
  }

  async function verifySelection({ roundName, home, away, market, selection }) {
    const marketState = await ensureMarket(market);
    if (!marketState.ok) {
      await restoreMarket(marketState.original);
      return { status: 'MISSING_MARKET', reason: marketState.reason, availableMarkets: marketState.available ?? [] };
    }
    try {
      return await locateSelection({
        roundName: normalize(roundName), home: normalize(home), away: normalize(away),
        selection: normalize(selection), mark: false, attribute: TARGET_ATTRIBUTE,
      });
    } finally {
      await restoreMarket(marketState.original);
    }
  }

  // Activates the verified selection and types the stake into the slip. It never
  // submits: there is no place-bet selector anywhere in this module.
  async function populateBetSlip({ roundName, home, away, market, selection, stake }) {
    if (!selectors?.configured?.betSlip) {
      return { status: 'BET_SLIP_SELECTORS_NOT_CONFIGURED' };
    }
    const marketState = await ensureMarket(market);
    if (!marketState.ok) return { status: 'MISSING_MARKET', reason: marketState.reason };
    const located = await locateSelection({
      roundName: normalize(roundName), home: normalize(home), away: normalize(away),
      selection: normalize(selection), mark: true, attribute: TARGET_ATTRIBUTE,
    });
    if (located.status !== 'SELECTION_AVAILABLE') return located;
    try {
      await page.locator(`[${TARGET_ATTRIBUTE}="1"]`).click({ timeout: actionTimeout });
      await settle();
    } finally {
      await page.evaluate((attribute) => {
        document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
      }, TARGET_ATTRIBUTE);
    }
    const stakeSelector = typeof selectors.betSlip.stakeInput === 'string'
      ? selectors.betSlip.stakeInput
      : selectors.betSlip.stakeInput.selector;
    const input = page.locator(stakeSelector).last();
    await input.fill(String(stake), { timeout: actionTimeout });
    const readBack = await input.inputValue();
    return Number(readBack) === Number(stake)
      ? { status: 'BET_SLIP_STAKE_ENTERED', odds: located.odds, stake: Number(readBack) }
      : { status: 'BET_SLIP_STAKE_MISMATCH', expected: stake, found: readBack };
  }

  return Object.freeze({
    readSchedule,
    readVisibleWeek,
    selectWeek,
    openLive,
    readLiveSnapshot,
    readResultsPage,
    verifySelection,
    populateBetSlip,
  });
}

module.exports = { PortError, createBetKingPorts };
