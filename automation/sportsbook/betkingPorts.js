// Playwright implementations of the schedule/week/live/results ports used by the
// operational workflow. Market-first selection and bet-slip operations live in
// betkingMarketFlow.js.
//
// SAFETY BOUNDARY: this module only reads the page and activates week controls. It has no
// code path that selects an odd, edits the bet slip, or submits a wager.
//
// SELECTOR STATUS: round/fixture/odds selectors come from the existing read-only adapter
// (observed in earlier stages). Live and results selectors are NOT guessed; they come from
// the user's selectors file and are used only when complete.

const { inspectBetKingPage, readLiveFixtureSnapshot } = require('./betkingAdapter');
const { parseWeek } = require('../strategy/seasonWeek');
const { normalizeTeamCode } = require('../strategy/fixtureIdentity');
const { createResultsModalReader } = require('./betkingResultsModal');

const ROUND_SWITCHER = '[data-testid^="round-switcher-button-"]';

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
    // No results selectors configured: use the built-in reader for the Kings League Results window.
    if (!selectors.configured || !selectors.configured.results) {
      return createResultsModalReader({ page, actionTimeoutMs: actionTimeout }).readResultsPage();
    }
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

  return Object.freeze({
    readSchedule,
    readVisibleWeek,
    selectWeek,
    openLive,
    readLiveSnapshot,
    readResultsPage,
  });
}

module.exports = { PortError, createBetKingPorts };
