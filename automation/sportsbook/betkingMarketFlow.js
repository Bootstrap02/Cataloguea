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
const { OBSERVED_BETKING_MARKET_CATEGORIES } = require('../strategy/canonicalBetTypes');

const ATTRIBUTE_ODD = 'data-cataloguea-odd';
const ATTRIBUTE_STAKE = 'data-cataloguea-stake';
const ATTRIBUTE_CATEGORY = 'data-cataloguea-category';
const ATTRIBUTE_CLOSE = 'data-cataloguea-close';

// A promotional dialog may be dismissed only through a control that clearly just closes it.
// Anything that could play, join, claim, accept, or bet is never clicked.
const SAFE_CLOSE_LABEL = '^(\\u00d7|\\u2715|\\u2716|x|close|dismiss|not now|no,? thanks|maybe later|later|skip|cancel)$';
const UNSAFE_CLOSE_WORDS = 'play|join|claim|deposit|bet|accept|agree|continue|sign|register|log\\s*in|get started|win|enter|download|install';
const ESSENTIAL_ONLY_LABEL = 'essential|reject|decline|necessary';

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
      // The active category is also shown as the title next to the "More Markets" / "Close Markets"
      // toggle (recording). Read it from there when the test id is absent on this layout.
      const toggle = [...document.querySelectorAll('span,div,button,a,p')]
        .find((element) => element.children.length === 0 && /^(More|Close)\s+Markets$/i.test(text(element)));
      let headerCategory = null;
      if (toggle) {
        const toggleText = text(toggle);
        let node = toggle.parentElement;
        for (let depth = 0; depth < 4 && node && headerCategory === null; depth += 1) {
          const rest = text(node).replace(toggleText, '').replace(/\s+/g, ' ').trim();
          if (rest && rest.length <= 40) headerCategory = rest;
          node = node.parentElement;
        }
      }
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
        headerCategory,
        panelOpen: Boolean(toggle) && /^close/i.test(text(toggle)),
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

  // ---- overlays (promotional dialogs) ---------------------------------------------------------

  async function detectOverlays() {
    return page.evaluate(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      return [...document.querySelectorAll('.dialog__backdrop, [role="dialog"], [aria-modal="true"], dialog[open]')]
        .filter(visible)
        .map((node) => ({
          tag: node.tagName.toLowerCase(),
          classes: typeof node.className === 'string' ? node.className.slice(0, 120) : '',
          text: (node.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
        }));
    });
  }

  // Tries Escape, then a control that clearly only closes the dialog. Cookie or consent dialogs
  // are never accepted: only an explicit essential-only or reject control is allowed for them.
  async function clearOverlays() {
    let overlays = await detectOverlays();
    if (overlays.length === 0) return { ok: true, status: 'NO_OVERLAY' };
    const consent = /cookie|consent|privacy/i.test(overlays.map((overlay) => overlay.text).join(' '));
    if (!consent) {
      await page.keyboard.press('Escape');
      await pause(400);
      overlays = await detectOverlays();
      if (overlays.length === 0) return { ok: true, status: 'DISMISSED', via: 'escape' };
    }
    const tagged = await page.evaluate(({ safeSource, unsafeSource, essentialSource, consentDialog, attribute }) => {
      const safe = new RegExp(safeSource, 'i');
      const unsafe = new RegExp(unsafeSource, 'i');
      const essential = new RegExp(essentialSource, 'i');
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const roots = [...document.querySelectorAll('.dialog__backdrop, [role="dialog"], [aria-modal="true"], dialog[open]')].filter(visible);
      for (const root of roots) {
        const candidates = [...root.querySelectorAll('button,[role="button"],a,[aria-label],[class*="close" i]')].filter(visible);
        for (const candidate of candidates) {
          const aria = (candidate.getAttribute('aria-label') || candidate.getAttribute('title') || '').trim();
          const label = (aria || candidate.textContent || '').replace(/\s+/g, ' ').trim();
          const classes = typeof candidate.className === 'string' ? candidate.className : '';
          if (unsafe.test(label)) continue;
          const allowed = consentDialog
            ? essential.test(label)
            : (safe.test(label) || /close|dismiss/i.test(aria) || /close/i.test(classes));
          if (allowed) {
            candidate.setAttribute(attribute, '1');
            return { label: label.slice(0, 40), tag: candidate.tagName.toLowerCase(), classes: classes.slice(0, 80) };
          }
        }
      }
      return null;
    }, { safeSource: SAFE_CLOSE_LABEL, unsafeSource: UNSAFE_CLOSE_WORDS, essentialSource: ESSENTIAL_ONLY_LABEL, consentDialog: consent, attribute: ATTRIBUTE_CLOSE });
    if (tagged) {
      try {
        await page.locator(`[${ATTRIBUTE_CLOSE}="1"]`).first().click({ timeout: actionTimeout });
      } finally {
        await page.evaluate((attribute) => {
          document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
        }, ATTRIBUTE_CLOSE);
      }
      await pause(500);
      overlays = await detectOverlays();
      if (overlays.length === 0) return { ok: true, status: 'DISMISSED', via: 'close-control', control: tagged };
    }
    return { ok: false, status: 'OVERLAY_NOT_DISMISSED', overlays, consent };
  }

  async function waitForOverlayCleared(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await detectOverlays()).length === 0) return true;
      await pause(500);
    }
    return false;
  }

  // Clicks a NAVIGATION control (never an odd). If an overlay intercepts the click, it is
  // dismissed (or a person is given time to dismiss it) and the click is tried once more.
  async function safeClick(locator) {
    try {
      await locator.click({ timeout: actionTimeout });
      return;
    } catch (error) {
      const blocked = /intercepts pointer events|Timeout/i.test(error.message);
      if (!blocked) throw error;
      const cleared = await clearOverlays();
      if (!cleared.ok && !(await waitForOverlayCleared(config.overlayWaitMs ?? 20000))) {
        const detail = (cleared.overlays ?? []).map((overlay) => overlay.text).join(' | ').slice(0, 160);
        throw new Error(`Blocked by an overlay that could not be dismissed safely: ${detail}`);
      }
      await locator.click({ timeout: actionTimeout });
    }
  }

  // Finds the category chip INSIDE the More Markets panel (never a same-named element elsewhere,
  // such as the favourites star) and tags it for the click.
  async function tagCategoryChip(category) {
    return page.evaluate(({ wanted, known, attribute }) => {
      const text = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim();
      const up = (value) => String(value).replace(/\s+/g, ' ').trim().toUpperCase();
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const toggle = [...document.querySelectorAll('span,div,button,a,p')]
        .find((element) => element.children.length === 0 && /^(More|Close)\s+Markets$/i.test(text(element)));
      if (!toggle) return { found: false, reason: 'TOGGLE_NOT_FOUND' };
      const knownSet = new Set(known.map(up));
      let node = toggle.parentElement;
      let panel = null;
      for (let depth = 0; depth < 8 && node; depth += 1) {
        const leaves = [...node.querySelectorAll('*')].filter((element) => element.children.length === 0 && knownSet.has(up(text(element))));
        if (new Set(leaves.map((leaf) => up(text(leaf)))).size >= 6) { panel = node; break; }
        node = node.parentElement;
      }
      if (!panel) return { found: false, reason: 'PANEL_NOT_FOUND' };
      const matches = [...panel.querySelectorAll('*')].filter((element) => (
        element.children.length === 0 && up(text(element)) === up(wanted) && visible(element)
        && !element.closest('[data-testid="league-round"]') && !toggle.contains(element)
      ));
      if (matches.length === 0) return { found: false, reason: 'CHIP_NOT_FOUND' };
      matches[0].setAttribute(attribute, '1');
      return { found: true, matches: matches.length, panelTag: panel.tagName.toLowerCase(), panelClasses: typeof panel.className === 'string' ? panel.className.slice(0, 80) : '' };
    }, { wanted: category, known: OBSERVED_BETKING_MARKET_CATEGORIES, attribute: ATTRIBUTE_CATEGORY });
  }

  // ---- stage: market category ----------------------------------------------------------

  async function openMarketCategory(category, fixture) {
    const target = norm(category);
    const observed = (state) => state.selectedMarketName || state.headerCategory || null;
    const isActive = (state) => (norm(state.selectedMarketName) === target || norm(state.headerCategory) === target) && state.labels.length > 0;
    const opened = (state, via, attempts) => ({
      status: 'MARKET_CATEGORY_OPENED',
      evidence: { category, observedCategory: observed(state), labelsInFixture: state.labels, via, attempts },
    });
    const attempts = [];
    let state;
    try {
      const cleared = await clearOverlays();
      if (!cleared.ok) {
        attempts.push({ via: 'overlay', status: cleared.status, overlays: cleared.overlays });
        if (!(await waitForOverlayCleared(config.overlayWaitMs ?? 20000))) {
          return { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category, reason: 'OVERLAY_BLOCKING', attempts } };
        }
      }

      state = await readMarketState(fixture);
      if (state.roundCount !== 1 || state.matchCount !== 1) {
        return { status: 'FIXTURE_ROW_NOT_AVAILABLE', evidence: { category, state } };
      }
      if (isActive(state)) return opened(state, 'already-active', attempts);

      const confirm = async (via) => {
        state = await pollUntil(() => readMarketState(fixture), isActive);
        attempts.push({ via, selectedMarketName: state.selectedMarketName, headerCategory: state.headerCategory, labels: state.labels.length });
        return isActive(state);
      };

      // 1. A visible category chip in the favourites row (for example "HT/FT").
      const chip = page.locator(overrides.categoryChip || '[data-testid="market-selector-tab"]')
        .filter({ hasText: new RegExp(`^\\s*${escapeRegex(category)}\\s*$`, 'i') }).first();
      if (await chip.count() > 0 && await chip.isVisible()) {
        await safeClick(chip);
        if (await confirm('visible-chip')) return opened(state, 'visible-chip', attempts);
      }

      // 2. Open More Markets and choose the chip INSIDE the panel.
      const toggle = overrides.moreMarkets
        ? page.locator(overrides.moreMarkets).first()
        : page.getByText(/^(More|Close)\s+Markets$/i).first();
      state = await readMarketState(fixture);
      if (!state.panelOpen && await toggle.count() > 0) {
        await safeClick(toggle);
        await pause(500);
      }
      const tagged = await tagCategoryChip(category);
      attempts.push({ via: 'panel-chip', tagged });
      if (tagged.found) {
        try {
          await safeClick(page.locator(`[${ATTRIBUTE_CATEGORY}="1"]`).first());
        } finally {
          await page.evaluate((attribute) => {
            document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
          }, ATTRIBUTE_CATEGORY);
        }
        if (await confirm('panel-chip')) return opened(state, 'more-markets-panel', attempts);
      }
      return { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category, attempts, lastState: state } };
    } catch (error) {
      return { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category, attempts, error: error.message.split('\n')[0], lastState: state ?? null } };
    }
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
    // A promotional dialog must not swallow the click; the odd itself is never re-clicked blindly.
    const cleared = await clearOverlays();
    if (!cleared.ok) return { status: 'SELECTION_NOT_ADDED', evidence: { reason: 'OVERLAY_BLOCKING', overlays: cleared.overlays } };
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
    await safeClick(tab);
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

  // Evidence for debugging a failed navigation: overlays, the header, the toggle, the panel's
  // visible texts, and which rounds and fixtures are on screen. Read only.
  async function captureDiagnostics(fixture) {
    const overlays = await detectOverlays();
    const state = await readMarketState(fixture);
    const page_ = await page.evaluate(() => {
      const text = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim();
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      return {
        url: window.location.href,
        title: document.title,
        scrollY: Math.round(window.scrollY),
        roundNames: [...document.querySelectorAll('[data-testid="league-round"] [data-testid="round-name"]')].map(text),
        fixturesShown: [...document.querySelectorAll('[data-testid="match"]')].filter(visible).slice(0, 24)
          .map((match) => `${text(match.querySelector('[data-testid="teams-home-name"]') || match)} v ${text(match.querySelector('[data-testid="teams-away-name"]') || match)}`.slice(0, 40)),
        testIds: [...new Set([...document.querySelectorAll('[data-testid]')].map((element) => element.getAttribute('data-testid')))].slice(0, 80),
      };
    });
    return { capturedAt: new Date().toISOString(), overlays, state, page: page_ };
  }

  // ---- read-only catalogue of what each category offers for one fixture -------------------------

  async function catalogueCategories(categories, fixture) {
    const rows = [];
    for (const category of categories) {
      const opened = await openMarketCategory(category, fixture);
      if (opened.status !== 'MARKET_CATEGORY_OPENED') {
        rows.push({ category, status: opened.status, labels: [], odds: [], evidence: opened.evidence ?? null });
        continue;
      }
      const state = await readMarketState(fixture);
      rows.push({ category, status: 'READ', observedCategory: state.selectedMarketName, labels: state.labels, odds: state.odds });
    }
    return rows;
  }

  return Object.freeze({
    readMarketState,
    clearOverlays,
    captureDiagnostics,
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
