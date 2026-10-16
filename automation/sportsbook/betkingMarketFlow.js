// Market-first operations on the REAL BetKing mobile Virtuals page.
//
// Every operation returns observable evidence (what the page showed afterwards), never
// "I clicked". Sequence (see marketFirstSequence.js):
//   openMarketCategory -> identifyMarketSelection (read only) -> selectOdd ->
//   openBetSlip -> enterStake -> readBetSlip (then compareSlipToExpected).
//
// EVIDENCE LEVEL OF THE LOCATORS:
//   * [data-testid] values for rounds, matches, team names, selection names, odds, and the
//     selected market come from earlier read-only inspector runs (betkingAdapter.js).
//   * The "More Markets" toggle, category chips, the "Betslip" tab, and the slip page text
//     ("VIRTUALS BETSLIP", "Total Stake Amount", ...) are located by their VISIBLE TEXT as
//     seen in the owner's screen recording. They are NOT verified in the DOM; every one can be
//     overridden through the selectors file (section "marketFlow") after a live inspection.
//
// SAFETY: nothing here submits a wager. There is no locator for the "PLACE BET" button, and
// "Clear All" / the trash icon are never clicked. Only the odd of the verified selection is
// ever clicked, and only by selectOdd after the earlier stages succeeded.

const { parseBetSlipText } = require('../strategy/marketFirstSequence');

const ATTRIBUTE_ODD = 'data-cataloguea-odd';
const ATTRIBUTE_STAKE = 'data-cataloguea-stake';

function norm(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createMarketFlow({ page, config = {}, selectors = {} } = {}) {
  if (!page || typeof page.evaluate !== 'function') {
    throw new TypeError('A Playwright page is required for the market flow.');
  }
  const overrides = selectors?.marketFlow ?? {};
  const waitMs = config.marketWaitTimeoutMs ?? 4000;
  const actionTimeout = Math.max(config.actionTimeoutMs ?? 1000, 3000);
  const intervalMs = 250;

  const pause = (milliseconds) => page.waitForTimeout(milliseconds);

  async function pollUntil(read, accept, timeoutMs = waitMs) {
    const deadline = Date.now() + timeoutMs;
    let last = await read();
    while (!accept(last) && Date.now() < deadline) {
      await pause(intervalMs);
      last = await read();
    }
    return last;
  }

  // ---- reading the market view -------------------------------------------------------

  async function readMarketState({ roundName, home, away }) {
    return page.evaluate(({ round: wantedRound, home: wantedHome, away: wantedAway, headerSelector }) => {
      const text = (element) => (element ? (element.textContent || '').replace(/\s+/g, ' ').trim() : '');
      const up = (value) => String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
      const selected = document.querySelector(headerSelector || '[data-testid="selected-market-name"]');
      const rounds = [...document.querySelectorAll('[data-testid="league-round"]')]
        .filter((round) => up(text(round.querySelector('[data-testid="round-name"]'))) === wantedRound);
      const matches = rounds.length === 1
        ? [...rounds[0].querySelectorAll('[data-testid="match"]')].filter((match) => (
          up(text(match.querySelector('[data-testid="teams-home-name"]'))) === wantedHome
          && up(text(match.querySelector('[data-testid="teams-away-name"]'))) === wantedAway))
        : [];
      const row = matches.length === 1 ? matches[0] : null;
      return {
        selectedMarketName: selected ? text(selected) : null,
        roundCount: rounds.length,
        matchCount: matches.length,
        matchHome: row ? text(row.querySelector('[data-testid="teams-home-name"]')) : null,
        matchAway: row ? text(row.querySelector('[data-testid="teams-away-name"]')) : null,
        labels: row ? [...row.querySelectorAll('[data-testid="selection-name"]')].map(text) : [],
        odds: row ? [...row.querySelectorAll('[data-testid="match-odd-value"]')].map(text) : [],
      };
    }, {
      round: norm(roundName), home: norm(home), away: norm(away), headerSelector: overrides.categoryHeader || null,
    });
  }

  // ---- stage: market category ----------------------------------------------------------

  async function openMarketCategory(category, fixture) {
    const target = norm(category);
    const isActive = (state) => norm(state.selectedMarketName) === target && state.labels.length > 0;
    let state = await readMarketState(fixture);

    if (state.roundCount !== 1 || state.matchCount !== 1) {
      return { status: 'FIXTURE_ROW_NOT_AVAILABLE', evidence: { category, state } };
    }
    if (isActive(state)) {
      return { status: 'MARKET_CATEGORY_OPENED', evidence: { category, observedCategory: state.selectedMarketName, labelsInFixture: state.labels, via: 'already-active' } };
    }

    const attempts = [];
    const confirm = async (via) => {
      state = await pollUntil(() => readMarketState(fixture), isActive);
      attempts.push({ via, observedCategory: state.selectedMarketName, labels: state.labels.length });
      return isActive(state);
    };

    // 1. A visible category chip (the favourites row shows a few, e.g. "HT/FT").
    const chip = page.locator(overrides.categoryChip || '[data-testid="market-selector-tab"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegex(category)}\\s*$`, 'i') }).first();
    if (await chip.count() > 0 && await chip.isVisible()) {
      await chip.click({ timeout: actionTimeout });
      if (await confirm('visible-chip')) {
        return { status: 'MARKET_CATEGORY_OPENED', evidence: { category, observedCategory: state.selectedMarketName, labelsInFixture: state.labels, via: 'visible-chip', attempts } };
      }
    }

    // 2. Open the "More Markets" panel and choose the category from its grid.
    const toggle = overrides.moreMarkets
      ? page.locator(overrides.moreMarkets).first()
      : page.getByText(/^(More|Close)\s+Markets$/i).first();
    if (await toggle.count() > 0 && /more/i.test((await toggle.innerText()))) {
      await toggle.click({ timeout: actionTimeout });
      await pause(400);
    }
    const candidates = page.getByText(category, { exact: true });
    const total = Math.min(await candidates.count(), 5);
    for (let index = 0; index < total; index += 1) {
      const candidate = candidates.nth(index);
      if (!(await candidate.isVisible())) continue;
      try {
        await candidate.click({ timeout: actionTimeout });
      } catch (error) {
        attempts.push({ via: `grid-candidate-${index}`, error: error.message.split('\n')[0] });
        continue;
      }
      if (await confirm(`grid-candidate-${index}`)) {
        return { status: 'MARKET_CATEGORY_OPENED', evidence: { category, observedCategory: state.selectedMarketName, labelsInFixture: state.labels, via: 'more-markets-grid', attempts } };
      }
      // Reopen the panel if the failed click collapsed it.
      if (await toggle.count() > 0 && /more/i.test((await toggle.innerText()))) {
        await toggle.click({ timeout: actionTimeout });
        await pause(400);
      }
    }
    return { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category, attempts, lastState: state } };
  }

  // ---- stage: selection and odds (read only) ---------------------------------------------

  async function identifyMarketSelection(selection, fixture) {
    const state = await readMarketState(fixture);
    if (state.matchCount !== 1) return { status: 'FIXTURE_ROW_NOT_AVAILABLE', evidence: { state } };
    const indexes = state.labels.map((label, index) => (norm(label) === norm(selection) ? index : -1)).filter((index) => index >= 0);
    if (indexes.length !== 1 || state.labels.length !== state.odds.length) {
      return { status: 'MARKET_SELECTION_NOT_FOUND', evidence: { selection, labels: state.labels, aligned: state.labels.length === state.odds.length } };
    }
    const index = indexes[0];
    const raw = String(state.odds[index]).replace(/,/g, '').trim();
    const odds = Number(raw);
    if (!raw || !Number.isFinite(odds)) {
      return { status: 'ODDS_UNAVAILABLE', evidence: { selection, rawOdds: state.odds[index] } };
    }
    return {
      status: 'MARKET_SELECTION_IDENTIFIED',
      odds,
      evidence: {
        selection,
        matchedLabel: state.labels[index],
        home: state.matchHome,
        away: state.matchAway,
        expectedHome: fixture.home,
        expectedAway: fixture.away,
        index,
        labels: state.labels,
      },
    };
  }

  // ---- slip summary bar ("1 Selection  Odds: 13.30") ---------------------------------------

  async function readSlipSummary() {
    return page.evaluate(() => {
      const source = document.body.innerText || '';
      const match = /(\d+)\s+Selections?\s*[\r\n\s]*Odds:\s*([\d.,]+)/i.exec(source);
      return match ? { count: Number(match[1]), odds: Number(match[2].replace(/,/g, '')) } : { count: 0, odds: null };
    });
  }

  // ---- stage: select the odd -----------------------------------------------------------------

  async function selectOdd(selection, fixture, expectedOdds) {
    const before = await readSlipSummary();
    if (before.count !== 0) {
      return { status: 'SLIP_NOT_EMPTY', evidence: { slipCountBefore: before.count } };
    }
    const fresh = await identifyMarketSelection(selection, fixture);
    if (fresh.status !== 'MARKET_SELECTION_IDENTIFIED') return fresh;
    if (Math.abs(fresh.odds - expectedOdds) > 0.005) {
      return { status: 'ODDS_CHANGED', evidence: { expectedOdds, currentOdds: fresh.odds } };
    }

    // Tag exactly the identified odd, click it, and always remove the tag.
    const tagged = await page.evaluate(({ round, home, away, index, attribute }) => {
      const text = (element) => (element ? (element.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase() : '');
      const rounds = [...document.querySelectorAll('[data-testid="league-round"]')]
        .filter((candidate) => text(candidate.querySelector('[data-testid="round-name"]')) === round);
      if (rounds.length !== 1) return false;
      const matches = [...rounds[0].querySelectorAll('[data-testid="match"]')].filter((match) => (
        text(match.querySelector('[data-testid="teams-home-name"]')) === home
        && text(match.querySelector('[data-testid="teams-away-name"]')) === away));
      if (matches.length !== 1) return false;
      const odd = [...matches[0].querySelectorAll('[data-testid="match-odd-value"]')][index];
      if (!odd) return false;
      odd.setAttribute(attribute, '1');
      return true;
    }, { round: norm(fixture.roundName), home: norm(fixture.home), away: norm(fixture.away), index: fresh.evidence.index, attribute: ATTRIBUTE_ODD });
    if (!tagged) return { status: 'MARKET_SELECTION_NOT_FOUND', evidence: { selection, reason: 'The odd could not be tagged.' } };

    try {
      await page.locator(`[${ATTRIBUTE_ODD}="1"]`).click({ timeout: actionTimeout });
    } finally {
      await page.evaluate((attribute) => {
        document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
      }, ATTRIBUTE_ODD);
    }

    // Observable condition: the summary bar shows exactly 1 selection at the selected price.
    const after = await pollUntil(readSlipSummary, (summary) => summary.count >= 1);
    const observed = after.count === 1 && after.odds !== null && Math.abs(after.odds - expectedOdds) <= 0.005;
    if (!observed) {
      return { status: 'SELECTION_NOT_ADDED', evidence: { slipCountBefore: before.count, slipCountAfter: after.count, summaryOdds: after.odds, expectedOdds } };
    }
    return {
      status: 'SELECTION_ADDED',
      evidence: { selectedStateObserved: true, slipCountBefore: before.count, slipCountAfter: after.count, summaryOdds: after.odds },
    };
  }

  // ---- stage: the bet slip ----------------------------------------------------------------------

  async function readSlipPage() {
    const result = await page.evaluate((stakeAttribute) => {
      const source = document.body.innerText || '';
      const label = [...document.querySelectorAll('*')]
        .find((element) => element.children.length === 0 && /total stake amount/i.test(element.textContent || ''));
      let value = null;
      let node = label;
      for (let depth = 0; depth < 6 && node && value === null; depth += 1) {
        const input = node.querySelector ? node.querySelector('input') : null;
        if (input) {
          value = input.value;
          input.setAttribute(stakeAttribute, '1');
        }
        node = node.parentElement;
      }
      return { source, value };
    }, ATTRIBUTE_STAKE);
    return parseBetSlipText(result.source, { stakeInputValue: result.value });
  }

  async function openBetSlip() {
    const tab = overrides.betslipTab
      ? page.locator(overrides.betslipTab).first()
      : page.getByText(/^Betslip$/i).last();
    await tab.click({ timeout: actionTimeout });
    const slip = await pollUntil(readSlipPage, (parsed) => parsed.isBetSlipPage, 5000);
    return slip.isBetSlipPage
      ? { status: 'BET_SLIP_OPEN', slip }
      : { status: 'BET_SLIP_NOT_OPEN', evidence: { reason: 'The text "VIRTUALS BETSLIP" never appeared.' } };
  }

  async function enterStake(stake) {
    await readSlipPage(); // tags the stake input
    const input = page.locator(overrides.slipStake || `[${ATTRIBUTE_STAKE}="1"]`).first();
    try {
      if (await input.count() === 0) return { status: 'STAKE_INPUT_NOT_FOUND', evidence: {} };
      await input.click({ timeout: actionTimeout });
      await input.fill(String(stake), { timeout: actionTimeout });
      const slip = await pollUntil(readSlipPage, (parsed) => parsed.stake === Number(stake), 3000);
      return slip.stake === Number(stake)
        ? { status: 'STAKE_ENTERED', slip }
        : { status: 'STAKE_NOT_ACCEPTED', evidence: { expected: stake, found: slip.stake } };
    } finally {
      await page.evaluate((attribute) => {
        document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
      }, ATTRIBUTE_STAKE);
    }
  }

  // ---- read-only catalogue of what each category offers for one fixture -------------------------

  async function catalogueCategories(categories, fixture) {
    const rows = [];
    for (const category of categories) {
      const opened = await openMarketCategory(category, fixture);
      if (opened.status !== 'MARKET_CATEGORY_OPENED') {
        rows.push({ category, status: opened.status, labels: [], odds: [] });
        continue;
      }
      const state = await readMarketState(fixture);
      rows.push({ category, status: 'READ', observedCategory: state.selectedMarketName, labels: state.labels, odds: state.odds });
    }
    return rows;
  }

  return Object.freeze({
    readMarketState,
    openMarketCategory,
    identifyMarketSelection,
    readSlipSummary,
    selectOdd,
    openBetSlip,
    readSlipPage,
    enterStake,
    catalogueCategories,
  });
}

module.exports = { createMarketFlow };
