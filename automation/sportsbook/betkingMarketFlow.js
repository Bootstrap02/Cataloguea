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

// The wallet balance printed in the page header (for example 101.65). It is the first money-like figure on the page.
function parseBalance(text) {
  const match = /(?:^|\s)(\d{1,3}(?:,\d{3})*\.\d{2})(?=\s|$)/.exec(String(text ?? '').slice(0, 600));
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

// A bet is also proven when the balance fell by (about) the stake after PLACE BET was clicked.
function balanceDroppedBy(before, now, stake) {
  return before !== null && now !== null && Number(stake) > 0 && before - now >= Number(stake) - 0.01;
}

function createMarketFlow({ page, config = {}, selectors = {} } = {}) {
  if (!page || typeof page.evaluate !== 'function') {
    throw new TypeError('A Playwright page is required for the market flow.');
  }
  const overrides = selectors?.marketFlow ?? {};
  const waitMs = config.marketWaitTimeoutMs ?? 4000;
  const actionTimeout = Math.max(config.actionTimeoutMs ?? 1000, 3000);
  const intervalMs = 120;

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
        marketTitles: rounds.length === 1
          ? [...rounds[0].querySelectorAll('*')]
            .filter((element) => element.children.length === 0 && !element.closest('[data-testid="match"]'))
            .map(text)
            .filter((value) => value && value.length <= 40 && !/^\d{1,2}:\d{2}$/.test(value))
          : [],
        chipTexts: [...document.querySelectorAll('[data-testid="market-selector-tab"]')].map(text),
        // The grid prints each label (1-0, 1/X, 0 ...) in a caption directly ABOVE its odd and the
        // page has no per-selection test id for it (see diagnostics.json). Walk the fixture in
        // document order and pair each odd with the nearest label before it. Older layouts that
        // use data-testid="selection-name" are still read the same way.
        ...(() => {
          if (!row) return { labels: [], odds: [], oddsCount: 0, expanded: false, bodyOpen: false };
          const nodes = [...row.querySelectorAll('[data-testid="selection-name"], [data-testid="typography-caption--inherit"], [data-testid="match-odd-value"]')];
          const labels = [];
          const odds = [];
          let pending = null;
          for (const node of nodes) {
            const kind = node.getAttribute('data-testid');
            if (kind === 'match-odd-value') {
              labels.push(pending === null ? '' : pending);
              odds.push(text(node));
              pending = null;
            } else {
              const value = text(node);
              if (value && value.length <= 12) pending = value;
            }
          }
          // bodyOpen: the fixture's accordion is open even while its odds are still loading (grey
          // empty cells); such a row must be waited for, never clicked, or the click would close it.
          // Each fixture is a <details data-testid="accordion-details">; its real state is the open flag
          // (a collapsed row still has its body in the page, so the body's presence proves nothing).
          const details = row.querySelector('[data-testid="accordion-details"]');
          const bodyOpen = details ? details.open === true : !!row.querySelector('[data-testid="accordion-body-inner"]');
          return { labels: labels.every((label) => label === '') ? [] : labels, odds, oddsCount: odds.length, expanded: odds.length > 0, bodyOpen };
        })(),
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
  // Promotional pop-ups that the ordinary dialog markup does not describe (for example the "Penalty Shootout -
  // Daily Free to Play" game window): a fixed element covering most of the screen. The betslip, the Results
  // window and the "Bet Placed" window are also large, so they are recognised by their text and left alone.
  async function findCoverOverlay() {
    return page.evaluate(() => {
      const text = (element) => (element.innerText || '').replace(/\s+/g, ' ').trim();
      const width = window.innerWidth;
      const height = window.innerHeight;
      const covers = [...document.querySelectorAll('body *')].filter((element) => {
        const style = getComputedStyle(element);
        if (style.position !== 'fixed' || style.display === 'none' || style.visibility === 'hidden') return false;
        const box = element.getBoundingClientRect();
        return box.width >= width * 0.6 && box.height >= height * 0.6 && Number(style.opacity || 1) > 0.05;
      });
      const known = /VIRTUALS BETSLIP|Standings|Bet Placed|Total Stake|You'?re in the game/i;
      const cover = covers.filter((element) => !known.test(text(element))).pop();
      if (!cover) return null;
      const inner = [...cover.querySelectorAll('iframe,img,div')].map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter((item) => item.box.width > 100 && item.box.height > 100 && item.box.width * item.box.height < width * height * 0.9)
        .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0];
      const box = inner ? inner.box : cover.getBoundingClientRect();
      return { text: text(cover).slice(0, 80), rect: { left: box.left, top: box.top, right: box.right, bottom: box.bottom } };
    });
  }

  async function dismissCoverOverlay() {
    const cover = await findCoverOverlay();
    if (!cover) return null;
    await page.keyboard.press('Escape');
    await pause(250);
    if (!(await findCoverOverlay())) return { ok: true, status: 'DISMISSED', via: 'escape', text: cover.text };
    // The close control: the top-right-most button or icon in the pop-up's header area.
    await page.evaluate((target) => {
      const candidates = [...document.querySelectorAll('button,[role="button"],svg,[class*="close" i],[aria-label*="close" i]')].filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 8 && box.width <= 80 && box.height > 8 && box.height <= 80
          && box.top >= target.top - 4 && box.top <= target.top + 90 && box.right <= target.right + 20 && box.left >= target.left + (target.right - target.left) * 0.5;
      }).sort((a, b) => (b.getBoundingClientRect().right - a.getBoundingClientRect().right) || (a.getBoundingClientRect().top - b.getBoundingClientRect().top));
      const best = candidates[0];
      if (best) (best.closest('button,[role="button"]') || best).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, cover.rect);
    await pause(300);
    if (!(await findCoverOverlay())) return { ok: true, status: 'DISMISSED', via: 'close-control', text: cover.text };
    // Last resort: click where the pop-up's own close button sits (top right corner, as in the screenshot).
    try {
      await page.mouse.click(cover.rect.right - 36, cover.rect.top + 36);
    } catch (error) { /* continue */ }
    await pause(400);
    return (await findCoverOverlay())
      ? { ok: false, status: 'OVERLAY_NOT_DISMISSED', overlays: [{ text: cover.text }] }
      : { ok: true, status: 'DISMISSED', via: 'corner-click', text: cover.text };
  }

  async function clearOverlays() {
    let overlays = await detectOverlays();
    if (overlays.length === 0) return (await dismissCoverOverlay()) ?? { ok: true, status: 'NO_OVERLAY' };
    const consent = /cookie|consent|privacy/i.test(overlays.map((overlay) => overlay.text).join(' '));
    if (!consent) {
      await page.keyboard.press('Escape');
      await pause(150);
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
      await pause(200);
      overlays = await detectOverlays();
      if (overlays.length === 0) return { ok: true, status: 'DISMISSED', via: 'close-control', control: tagged };
    }
    return { ok: false, status: 'OVERLAY_NOT_DISMISSED', overlays, consent };
  }

  async function waitForOverlayCleared(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await detectOverlays()).length === 0) return true;
      await pause(200);
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

  // The page lists every fixture as a collapsed accordion; only some are open. When our fixture's
  // grid is not in the page, open it by clicking the teams row (never the stats icon, never an
  // odd). Clicking only happens when no odds are present, so an open fixture is never collapsed.
  async function expandFixture(fixture) {
    const tagged = await page.evaluate(({ round: wantedRound, home: wantedHome, away: wantedAway, attribute }) => {
      const text = (element) => (element ? (element.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase() : '');
      const rounds = [...document.querySelectorAll('[data-testid="league-round"]')]
        .filter((round) => text(round.querySelector('[data-testid="round-name"]')) === wantedRound);
      if (rounds.length !== 1) return false;
      const matches = [...rounds[0].querySelectorAll('[data-testid="match"]')].filter((match) => (
        text(match.querySelector('[data-testid="teams-home-name"]')) === wantedHome
        && text(match.querySelector('[data-testid="teams-away-name"]')) === wantedAway));
      if (matches.length !== 1) return false;
      const target = matches[0].querySelector('[data-testid="accordion-summary"]') || matches[0].querySelector('[data-testid="teams"]');
      if (!target) return false;
      target.setAttribute(attribute, '1');
      return true;
    }, { round: norm(fixture.roundName), home: norm(fixture.home), away: norm(fixture.away), attribute: ATTRIBUTE_CATEGORY });
    if (!tagged) return false;
    try {
      await safeClick(page.locator(`[${ATTRIBUTE_CATEGORY}="1"]`).first());
    } finally {
      await page.evaluate((attribute) => {
        document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
      }, ATTRIBUTE_CATEGORY);
    }
    return true;
  }

  // ---- stage: market category ----------------------------------------------------------

  // Step screenshots: when a directory is set (setCaptureDirectory), every navigation step saves a
  // numbered PNG, so a failure shows exactly which step it stopped at. Best effort, never throws.
  let captureDirectory = null;
  let captureCounter = 0;
  function setCaptureDirectory(directory) {
    captureDirectory = directory || null;
  }
  async function snap(label) {
    if (!captureDirectory) return null;
    try {
      captureCounter += 1;
      const safe = String(label).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      const file = `${require('node:path').join(captureDirectory, `step-${String(captureCounter).padStart(3, '0')}-${safe}.png`)}`;
      await page.screenshot({ path: file });
      return file;
    } catch (error) {
      return null;
    }
  }

  // Returns the first VISIBLE chip in the market chip row whose text is exactly `name`.
  async function findVisibleChip(name) {
    const chips = page.locator(overrides.categoryChip || '[data-testid="market-selector-tab"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegex(name)}\\s*$`, 'i') });
    const count = await chips.count();
    for (let index = 0; index < count; index += 1) {
      if (await chips.nth(index).isVisible()) return chips.nth(index);
    }
    return null;
  }

  // Opens a market exactly as the owner does it on the real page:
  //   1. More Markets (always first; the page opens on Popular or Favourites, so the category
  //      chips are only reachable through it),
  //   2. the category chip inside the panel (HT/FT, Total Goals, Correct Score),
  //   3. when the market has its own chip inside that category (HT Correct Score lives INSIDE
  //      Correct Score), that sub-chip,
  //   4. the fixture's own row, opened if it is collapsed.
  // The Popular row has a shortcut chip also called "Correct Score"; it is NOT used, because the
  // page header stays on Popular. The category counts as open only when the page header names it,
  // the market only when its title is shown, and the fixture must list selection labels.
  async function openMarketCategory(category, fixture, options = {}) {
    const market = options.market ?? category;
    const target = norm(category);
    const needsSubMarket = norm(market) !== target;
    const KNOWN_SUB_MARKETS = ['HT CORRECT SCORE'];
    const observed = (state) => state.headerCategory || state.selectedMarketName || null;
    // The header next to More Markets is the truth for the active category. The selected-market
    // test id is only used when the header could not be read.
    const categoryActive = (state) => (state.headerCategory
      ? norm(state.headerCategory) === target
      : norm(state.selectedMarketName) === target);
    const marketShown = (state) => (state.marketTitles.some((name) => norm(name) === norm(market))
      || (!needsSubMarket && !state.marketTitles.some((name) => KNOWN_SUB_MARKETS.includes(norm(name)))
        && state.marketTitles.length > 0 && categoryActive(state)));
    const fullyActive = (state) => categoryActive(state) && marketShown(state) && state.labels.length > 0;
    const opened = (state, via, attempts) => ({
      status: 'MARKET_CATEGORY_OPENED',
      evidence: {
        category,
        market,
        observedCategory: observed(state),
        observedMarkets: state.marketTitles,
        labelsInFixture: state.labels,
        via,
        attempts,
      },
    });
    const attempts = [];
    let state;
    try {
      const cleared = await clearOverlays();
      if (!cleared.ok) {
        attempts.push({ via: 'overlay', status: cleared.status, overlays: cleared.overlays });
        if (!(await waitForOverlayCleared(config.overlayWaitMs ?? 20000))) {
          return { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category, market, reason: 'OVERLAY_BLOCKING', attempts } };
        }
      }

      state = await readMarketState(fixture);
      if (state.roundCount !== 1 || state.matchCount !== 1) {
        return { status: 'FIXTURE_ROW_NOT_AVAILABLE', evidence: { category, market, state } };
      }
      await snap(`${category}-start`);
      if (fullyActive(state)) return opened(state, 'already-active', attempts);

      const confirm = async (via, predicate) => {
        state = await pollUntil(() => readMarketState(fixture), predicate);
        attempts.push({
          via,
          selectedMarketName: state.selectedMarketName,
          headerCategory: state.headerCategory,
          panelOpen: state.panelOpen,
          markets: state.marketTitles,
          labels: state.labels.length,
          odds: state.oddsCount,
        });
        await snap(`${category}-${via}`);
        return predicate(state);
      };

      // Step 1 and 2: More Markets, then the category chip inside the panel.
      if (!categoryActive(state)) {
        const toggle = overrides.moreMarkets
          ? page.locator(overrides.moreMarkets).first()
          : page.getByText(/^(More|Close)\s+Markets$/i).first();
        if (await toggle.count() === 0) {
          attempts.push({ via: 'more-markets', found: false });
          return { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category, market, reason: 'MORE_MARKETS_NOT_FOUND', attempts, lastState: state } };
        }
        if (!state.panelOpen) {
          await safeClick(toggle);
          await pause(200);
        }
        state = await pollUntil(() => readMarketState(fixture), (current) => current.panelOpen, 3000);
        attempts.push({ via: 'more-markets', panelOpen: state.panelOpen, headerCategory: state.headerCategory });
        await snap(`${category}-more-markets-open`);

        const tagged = await tagCategoryChip(category);
        attempts.push({ via: 'panel-chip', tagged });
        if (!tagged.found) {
          return { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category, market, reason: tagged.reason, attempts, lastState: state } };
        }
        try {
          await safeClick(page.locator(`[${ATTRIBUTE_CATEGORY}="1"]`).first());
        } finally {
          await page.evaluate((attribute) => {
            document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
          }, ATTRIBUTE_CATEGORY);
        }
        if (!(await confirm('category-clicked', categoryActive))) {
          return { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category, market, reason: 'CATEGORY_HEADER_DID_NOT_CHANGE', attempts, lastState: state } };
        }
      }

      // Step 3: a sub-chip inside the category (for example HT Correct Score inside Correct Score).
      if (!marketShown(state)) {
        const marketChip = await findVisibleChip(market);
        if (!marketChip) {
          attempts.push({ via: 'market-chip', found: false, chips: state.chipTexts });
          return { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category, market, reason: 'MARKET_CHIP_NOT_FOUND', attempts, lastState: state } };
        }
        await safeClick(marketChip);
        if (!(await confirm('market-chip-clicked', marketShown))) {
          return { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category, market, reason: 'MARKET_TITLE_DID_NOT_CHANGE', attempts, lastState: state } };
        }
      }

      // Step 4: the fixture row must be open to show its selections.
      if (state.labels.length === 0 && state.bodyOpen) {
        // Already open, odds still loading (owner's Week 3 Total Goals run): wait, do not click.
        state = await pollUntil(() => readMarketState(fixture), (current) => current.labels.length > 0, 8000);
        attempts.push({ via: 'wait-for-odds', labels: state.labels.length });
        await snap(`${category}-wait-for-odds`);
      } else if (state.labels.length === 0 && !state.expanded) {
        const expanded = await expandFixture(fixture);
        attempts.push({ via: 'expand-fixture', clicked: expanded });
        await snap(`${category}-expand-fixture`);
      }
      if (await confirm('labels-shown', fullyActive)) return opened(state, 'more-markets-panel', attempts);
      return { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category, market, reason: 'NO_SELECTION_LABELS', attempts, lastState: state } };
    } catch (error) {
      return { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category, market, attempts, error: error.message.split('\n')[0], lastState: state ?? null } };
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
      // fill() focuses and replaces the field by itself. A separate click timed out while the slip
      // panel was still sliding in ("element is not stable"), which cost the bet its time.
      await input.fill(String(stake), { timeout: actionTimeout });
      let slip = await pollUntil(readSlipPage, (parsed) => parsed.stake === Number(stake), 1500);
      if (slip.stake !== Number(stake)) {
        // The site pre-fills 100; if the replacement did not register, select everything and type it.
        await input.focus({ timeout: actionTimeout });
        await page.keyboard.press('Control+A');
        await page.keyboard.type(String(stake));
        slip = await pollUntil(readSlipPage, (parsed) => parsed.stake === Number(stake), 2500);
      }
      return slip.stake === Number(stake)
        ? { status: 'STAKE_ENTERED', slip }
        : { status: 'STAKE_NOT_ACCEPTED', evidence: { expected: stake, found: slip.stake } };
    } finally {
      await page.evaluate((attribute) => {
        document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
      }, ATTRIBUTE_STAKE);
    }
  }

  // ---- closing the slip and placing the bet ---------------------------------------------------

  // Closes the slip with the X beside its title (as in the recording) and waits until the market
  // page is back. Nothing else is clicked.
  async function closeBetSlip() {
    const tagged = await page.evaluate((attribute) => {
      const text = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim();
      const title = [...document.querySelectorAll('*')]
        .find((element) => element.children.length === 0 && /^VIRTUALS BETSLIP$/i.test(text(element)));
      if (!title) return false;
      const titleBox = title.getBoundingClientRect();
      let node = title.parentElement;
      for (let depth = 0; depth < 4 && node; depth += 1) {
        const candidates = [...node.querySelectorAll('button,[role="button"],a,svg')].filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && box.left > titleBox.right
            && Math.abs((box.top + box.height / 2) - (titleBox.top + titleBox.height / 2)) < 40
            && !/clear all/i.test(text(element));
        });
        if (candidates.length > 0) {
          candidates[candidates.length - 1].setAttribute(attribute, '1');
          return true;
        }
        node = node.parentElement;
      }
      return false;
    }, ATTRIBUTE_CLOSE);
    if (!tagged) {
      // After PLACE BET the site already returns to the market page and shows a "Bet Placed" window;
      // with no slip title on screen there is nothing left to close.
      const slipNow = await readSlipPage();
      return slipNow.isBetSlipPage
        ? { status: 'BET_SLIP_NOT_CLOSED', evidence: { reason: 'The close control was not found.' } }
        : { status: 'BET_SLIP_CLOSED' };
    }
    try {
      await safeClick(page.locator(`[${ATTRIBUTE_CLOSE}="1"]`).first());
    } finally {
      await page.evaluate((attribute) => {
        document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
      }, ATTRIBUTE_CLOSE);
    }
    const back = await pollUntil(readSlipPage, (parsed) => !parsed.isBetSlipPage, 4000);
    return back.isBetSlipPage
      ? { status: 'BET_SLIP_NOT_CLOSED', evidence: { reason: 'The slip is still shown.' } }
      : { status: 'BET_SLIP_CLOSED' };
  }

  // Clears the slip with the "Clear All" control at its top (visible in the recording). Only that
  // control is clicked, and only while the slip page is open.
  async function clearBetSlip() {
    const slip = await readSlipPage();
    if (!slip.isBetSlipPage) return { status: 'BET_SLIP_NOT_OPEN' };
    // Do not trust an empty reading: if the slip text could not be parsed, the slip may still hold a pick.
    const isEmpty = async (timeoutMs) => (await pollUntil(readSlipPage, (parsed) => parsed.items.length === 0, timeoutMs)).items.length === 0;
    const control = page.getByText(/^\s*Clear All\s*$/i).first();
    if (await control.count() > 0) {
      await safeClick(control);
      if (await isEmpty(1200)) return { status: 'BET_SLIP_CLEARED' };
      // Some layouts ask "are you sure?"; accept only a button that plainly confirms the clearing.
      const confirm = page.getByRole('button', { name: /^(yes|ok|confirm|clear|clear all|remove all|delete)$/i });
      if (await confirm.count() === 1 && await confirm.first().isVisible()) {
        await safeClick(confirm.first());
        if (await isEmpty(1500)) return { status: 'BET_SLIP_CLEARED' };
      }
    }
    // Last resort: the remove (bin) control of the selection itself, found by its own label.
    const remove = page.locator('[data-testid*="delete" i], [data-testid*="remove" i], [aria-label*="remove" i], [aria-label*="delete" i]').first();
    if (await remove.count() > 0) {
      await safeClick(remove);
      if (await isEmpty(1500)) return { status: 'BET_SLIP_CLEARED' };
    }
    await snap('slip-not-cleared');
    const html = await page.evaluate(() => {
      const title = [...document.querySelectorAll('*')].find((element) => element.children.length === 0 && /^VIRTUALS BETSLIP$/i.test((element.textContent || '').trim()));
      let node = title;
      for (let depth = 0; depth < 8 && node && node.parentElement; depth += 1) {
        if (node.parentElement.outerHTML.length > 30000) break;
        node = node.parentElement;
      }
      return node ? node.outerHTML.slice(0, 9000) : null;
    });
    return { status: 'BET_SLIP_NOT_CLEARED', evidence: { slipHtml: html } };
  }

  // Leaves the slip behind after an expiry, an error or a dry run: open it if needed, clear it,
  // close it, and confirm the summary bar shows no selections. The run never waits on the slip.
  async function resetBetSlip() {
    const steps = [];
    const summary = await readSlipSummary();
    let slip = await readSlipPage();
    if (!slip.isBetSlipPage && summary.count === 0) return { status: 'ALREADY_CLEAN', steps };
    if (!slip.isBetSlipPage) steps.push((await openBetSlip()).status);
    const cleared = await clearBetSlip();
    steps.push(cleared.status);
    steps.push((await closeBetSlip()).status);
    slip = await readSlipPage();
    const after = await readSlipSummary();
    return { status: !slip.isBetSlipPage && after.count === 0 ? 'BET_SLIP_RESET' : 'BET_SLIP_NOT_RESET', steps, evidence: cleared.evidence ?? null };
  }

  // Dismisses the "Bet Placed - You're in the game" window (owner screenshot, Oct 26 2026): CONTINUE when it
  // is there, otherwise the X at the window's top right. Only a window that names the placed bet is touched.
  async function dismissBetPlaced() {
    const shown = () => page.evaluate(() => /bet placed|you'?re in the game/i.test(document.body.innerText || ''));
    if (!(await pollUntil(shown, (value) => value === true, 3000))) return { status: 'NO_BET_PLACED_WINDOW' };
    const proceed = page.getByRole('button', { name: /^continue$/i });
    if (await proceed.count() === 1 && await proceed.first().isVisible()) {
      await safeClick(proceed.first());
    } else {
      const tagged = await page.evaluate((attribute) => {
        const text = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim();
        const marker = [...document.querySelectorAll('*')]
          .find((element) => element.children.length === 0 && /bet placed|you'?re in the game/i.test(text(element)));
        if (!marker) return false;
        let node = marker.parentElement;
        for (let depth = 0; depth < 6 && node; depth += 1) {
          const closers = [...node.querySelectorAll('button,[role="button"],svg')].filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && box.top < marker.getBoundingClientRect().top + 40
              && box.left > marker.getBoundingClientRect().right - 10 && !/my tickets/i.test(text(element));
          });
          if (closers.length > 0) { closers[closers.length - 1].setAttribute(attribute, '1'); return true; }
          node = node.parentElement;
        }
        return false;
      }, ATTRIBUTE_CLOSE);
      if (!tagged) return { status: 'BET_PLACED_WINDOW_NOT_DISMISSED' };
      try {
        await safeClick(page.locator(`[${ATTRIBUTE_CLOSE}="1"]`).first());
      } finally {
        await page.evaluate((attribute) => {
          document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
        }, ATTRIBUTE_CLOSE);
      }
    }
    const gone = await pollUntil(shown, (value) => value === false, 3000);
    return { status: gone === false ? 'BET_PLACED_WINDOW_DISMISSED' : 'BET_PLACED_WINDOW_STILL_SHOWN' };
  }

  const CONFIRMED_PATTERN = /(bet\s*(slip)?\s*(has\s*been\s*)?(successfully\s*)?(placed|accepted)|successfully\s*placed|bet\s*placed|placed\s*successfully|you'?re\s*in\s*the\s*game)/i;
  const REJECTED_PATTERN = /(insufficient|not\s*enough|failed|error|rejected|declined|unable|invalid|expired|not\s*allowed|exceeds?)/i;

  // THE ONLY FUNCTION THAT CAN SUBMIT A WAGER. It clicks the single visible "PLACE BET" control
  // exactly once, never retries, and then reports only what the page shows. A click is not
  // acceptance: without the site's own confirmation text the result is SUBMITTED_UNCONFIRMED and
  // the run must stop. Callers must have verified the slip and obtained authorization first.
  async function placeBet({ minSecondsRemaining = 15, onEvidence = null } = {}) {
    const before = await readSlipPage();
    if (!before.isBetSlipPage || before.items.length !== 1) {
      return { status: 'PLACE_PRECONDITION_FAILED', evidence: { isBetSlipPage: before.isBetSlipPage, items: before.items.length } };
    }
    if (typeof before.expirySeconds === 'number' && before.expirySeconds < minSecondsRemaining) {
      return { status: 'SLIP_EXPIRING', evidence: { expirySeconds: before.expirySeconds } };
    }
    const button = page.getByRole('button', { name: /^place bet$/i });
    if (await button.count() !== 1 || !(await button.first().isVisible()) || !(await button.first().isEnabled())) {
      return { status: 'PLACE_BUTTON_NOT_FOUND', evidence: { matches: await button.count() } };
    }
    const textBefore = await page.evaluate(() => document.body.innerText || '');
    const balanceBefore = parseBalance(textBefore);
    const stakePlaced = before.stake;
    if (onEvidence) await onEvidence('before-place');

    const clickedAt = new Date().toISOString();
    try {
      await button.first().click({ timeout: actionTimeout });
    } catch (error) {
      return { status: 'PLACE_CLICK_FAILED', evidence: { error: error.message.split('\n')[0] } };
    }

    // Observe what the page shows afterwards; only lines that appeared after the click count.
    const knownLines = new Set(textBefore.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    const deadline = Date.now() + (config.placeObserveMs ?? 8000);
    let newLines = [];
    let verdict = 'SUBMITTED_UNCONFIRMED';
    let confirmedBy = null;
    // "New lines only" can miss a confirmation when the same words were already on screen (an earlier "Bet Placed"
    // window still showing), so the wallet is a second, independent witness: the balance must fall by the stake.
    const stillShowedConfirmation = CONFIRMED_PATTERN.test(textBefore);
    const observe = async () => {
      const textNow = await page.evaluate(() => document.body.innerText || '');
      newLines = textNow.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !knownLines.has(line));
      const joined = newLines.join(' | ');
      if (CONFIRMED_PATTERN.test(joined)) { verdict = 'ACCEPTED_BY_SITE_TEXT'; confirmedBy = 'site text'; return true; }
      if (REJECTED_PATTERN.test(joined)) { verdict = 'REJECTED_BY_SITE_TEXT'; return true; }
      if (balanceDroppedBy(balanceBefore, parseBalance(textNow), stakePlaced)) { verdict = 'ACCEPTED_BY_SITE_TEXT'; confirmedBy = 'balance drop'; return true; }
      return false;
    };
    while (Date.now() < deadline) {
      await pause(200);
      if (await observe()) break;
    }
    if (verdict === 'SUBMITTED_UNCONFIRMED') {
      // The balance can lag the confirmation window by a moment: look once more before calling it unconfirmed.
      await pause(1500);
      await observe();
    }
    if (onEvidence) await onEvidence('after-place');
    if (verdict === 'ACCEPTED_BY_SITE_TEXT') {
      // The site's "Bet Placed - You're in the game, Good luck!" window (owner recording, Oct 23 2026)
      // offers MY TICKETS and CONTINUE. CONTINUE is clicked only after that confirmation, so the next
      // option can use the slip. Best effort; the bet is already accepted either way.
      try {
        const proceed = page.getByRole('button', { name: /^continue$/i });
        if (await proceed.count() === 1 && await proceed.first().isVisible()) await proceed.first().click({ timeout: 2000 });
      } catch (error) { /* the confirmation window may already be closed */ }
    }
    return {
      status: verdict,
      evidence: { clickedAt, confirmedBy, balanceBefore, staleConfirmationOnScreen: stillShowedConfirmation, newLines: newLines.slice(0, 20), siteConfirmationText: verdict === 'ACCEPTED_BY_SITE_TEXT' ? newLines.join(' | ').slice(0, 300) : null },
    };
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
        testIds: [...new Set([...document.querySelectorAll('[data-testid]')].map((element) => element.getAttribute('data-testid')))].slice(0, 300),
        // Raw markup of the market selector area and of the first match row, so the next fix is
        // built from the real page and not from guesses.
        marketSelectorHtml: (document.querySelector('[data-testid="area-market-selector"]') || document.body).outerHTML.slice(0, 6000),
        firstMatchHtml: ((document.querySelector('[data-testid="match"]') || {}).outerHTML || '').slice(0, 6000),
      };
    });
    return { capturedAt: new Date().toISOString(), overlays, state, page: page_ };
  }

  // ---- read-only catalogue of what each category offers for one fixture -------------------------

  // Each entry is { category, market } (market defaults to the category name).
  async function catalogueCategories(entries, fixture) {
    const rows = [];
    for (const entry of entries) {
      const { category, market = category } = typeof entry === 'string' ? { category: entry } : entry;
      const opened = await openMarketCategory(category, fixture, { market });
      if (opened.status !== 'MARKET_CATEGORY_OPENED') {
        rows.push({ category, market, status: opened.status, labels: [], odds: [], evidence: opened.evidence ?? null });
        continue;
      }
      const state = await readMarketState(fixture);
      rows.push({ category, market, status: 'READ', observedCategory: state.selectedMarketName || state.headerCategory, observedMarkets: state.marketTitles, labels: state.labels, odds: state.odds });
    }
    return rows;
  }

  return Object.freeze({
    readMarketState,
    clearOverlays,
    captureDiagnostics,
    openMarketCategory,
    setCaptureDirectory,
    captureStep: snap,
    dismissBetPlaced,
    clearBetSlip,
    resetBetSlip,
    identifyMarketSelection,
    readSlipSummary,
    selectOdd,
    openBetSlip,
    readSlipPage,
    enterStake,
    closeBetSlip,
    placeBet,
    catalogueCategories,
  });
}

module.exports = { createMarketFlow, parseBalance, balanceDroppedBy };
