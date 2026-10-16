// Button-access probe for the REAL BetKing page.
//
// Purpose: prove, on the live site, that the automation can see and operate the
// platform's own controls. It
//   1. inventories the controls it knows about (round switcher, market tabs, league
//      tabs, matches, odds buttons, statistics buttons, all buttons),
//   2. outlines them in the browser so you can see them,
//   3. clicks ONLY navigation controls (round-switcher buttons and market tabs), records
//      what the page did, and restores the original view.
//
// SAFETY: odds buttons, selections, bet-slip controls, and anything that could place or
// stage a wager are never clicked. The click allowlist below is the only thing clicked.

const CLICK_ALLOWLIST = Object.freeze([
  { label: 'round switcher', selector: '[data-testid^="round-switcher-button-"]' },
  { label: 'market tab', selector: '[data-testid="market-selector-tab"]' },
]);

const INVENTORY = Object.freeze([
  { key: 'roundSwitchers', selector: '[data-testid^="round-switcher-button-"]' },
  { key: 'marketTabs', selector: '[data-testid="market-selector-tab"]' },
  { key: 'leagueTabs', selector: '[data-testid^="league-switcher-tab-"]' },
  { key: 'matches', selector: '[data-testid="match"]' },
  { key: 'oddsButtons', selector: '[data-testid="match-odd-value"]' },
  { key: 'statisticsButtons', selector: '[data-testid^="matchup-statistics-button-"]' },
  { key: 'allButtons', selector: 'button' },
]);

async function readInventory(page) {
  return page.evaluate((items) => {
    const text = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const result = {};
    for (const { key, selector } of items) {
      const elements = [...document.querySelectorAll(selector)];
      const shown = elements.filter(visible);
      result[key] = { selector, total: elements.length, visible: shown.length, samples: shown.slice(0, 6).map(text) };
    }
    return result;
  }, INVENTORY);
}

async function readViewState(page) {
  return page.evaluate(() => {
    const text = (element) => (element ? (element.textContent || '').replace(/\s+/g, ' ').trim() : '');
    return {
      selectedMarket: text(document.querySelector('[data-testid="selected-market-name"]')),
      firstRound: text(document.querySelector('[data-testid="league-round"] [data-testid="round-name"]')),
      roundsShown: document.querySelectorAll('[data-testid="league-round"]').length,
      matchesShown: document.querySelectorAll('[data-testid="match"]').length,
    };
  });
}

async function highlight(page, on) {
  const selectors = CLICK_ALLOWLIST.map((entry) => entry.selector);
  await page.evaluate(({ selectors: list, enabled }) => {
    for (const selector of list) {
      document.querySelectorAll(selector).forEach((element) => {
        if (enabled) {
          element.setAttribute('data-cataloguea-probe-old', element.style.outline || '');
          element.style.outline = '3px solid #ff0066';
        } else if (element.hasAttribute('data-cataloguea-probe-old')) {
          element.style.outline = element.getAttribute('data-cataloguea-probe-old');
          element.removeAttribute('data-cataloguea-probe-old');
        }
      });
    }
  }, { selectors, enabled: on });
}

// Explains WHY a control could not be clicked: what sits on top of it, whether it is inside
// the viewport, whether it is disabled, and its pointer-events and classes.
async function describeClickBlocker(control) {
  const handle = await control.elementHandle({ timeout: 1000 });
  if (!handle) return null;
  return handle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const top = document.elementFromPoint(centerX, centerY);
    const describe = (node) => {
      if (!node) return null;
      const testId = node.getAttribute('data-testid');
      const classes = typeof node.className === 'string' ? node.className.split(/\s+/).filter(Boolean).slice(0, 4).join('.') : '';
      return `${node.tagName.toLowerCase()}${testId ? `[data-testid=${testId}]` : ''}${classes ? `.${classes}` : ''}`;
    };
    return {
      box: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      centerInViewport: centerX >= 0 && centerY >= 0 && centerX <= window.innerWidth && centerY <= window.innerHeight,
      topElementAtCenter: describe(top),
      coveredByAnotherElement: Boolean(top) && !(element === top || element.contains(top)),
      disabled: element.disabled === true,
      ariaDisabled: element.getAttribute('aria-disabled'),
      pointerEvents: window.getComputedStyle(element).pointerEvents,
      classes: typeof element.className === 'string' ? element.className.slice(0, 160) : '',
    };
  });
}

async function clickEach(page, entry, { report, settleMs, log }) {
  const locator = page.locator(entry.selector);
  const count = await locator.count();
  const before = await readViewState(page);
  for (let index = 0; index < count; index += 1) {
    const control = locator.nth(index);
    let text = '';
    try {
      if (!(await control.isVisible())) continue;
      text = (await control.innerText()).replace(/\s+/g, ' ').trim().slice(0, 40);
      const stateBefore = await readViewState(page);
      await control.scrollIntoViewIfNeeded({ timeout: 3000 });
      await control.click({ timeout: 8000 });
      await page.waitForTimeout(settleMs);
      const stateAfter = await readViewState(page);
      const changed = JSON.stringify(stateBefore) !== JSON.stringify(stateAfter);
      report.clicks.push({ control: entry.label, text, ok: true, pageChanged: changed, before: stateBefore, after: stateAfter });
      log(`  clicked ${entry.label} "${text}" -> ${changed ? 'page changed' : 'page unchanged'} (market: ${stateAfter.selectedMarket || '-'}, first round: ${stateAfter.firstRound || '-'})`);
    } catch (error) {
      let diagnostics = null;
      try {
        diagnostics = await describeClickBlocker(control);
      } catch (diagnosticError) {
        diagnostics = { error: diagnosticError.message };
      }
      report.clicks.push({ control: entry.label, text, ok: false, error: error.message.split('\n')[0], diagnostics });
      log(`  could not click ${entry.label} "${text}": ${error.message.split('\n')[0]}${diagnostics?.coveredByAnotherElement ? ` (covered by ${diagnostics.topElementAtCenter})` : ''}`);
    }
  }
  return before;
}

async function runControlProbe(page, { log = (message) => console.log(message), settleMs = 700 } = {}) {
  const report = { startedAt: new Date().toISOString(), url: page.url(), controls: null, clicks: [], restored: null };

  report.controls = await readInventory(page);
  for (const { key } of INVENTORY) {
    const item = report.controls[key];
    log(`  ${key}: ${item.visible} visible of ${item.total}${item.samples.length ? ` (e.g. ${item.samples.slice(0, 3).join(' | ')})` : ''}`);
  }

  await highlight(page, true);
  await page.waitForTimeout(1500);

  const originalView = await readViewState(page);
  for (const entry of CLICK_ALLOWLIST) {
    log(`Clicking ${entry.label} controls (navigation only):`);
    await clickEach(page, entry, { report, settleMs, log });
  }

  // Restore the original market tab (the round view needs no restore: it only scrolls/filters).
  if (originalView.selectedMarket) {
    const tabs = page.locator(CLICK_ALLOWLIST[1].selector);
    const count = await tabs.count();
    for (let index = 0; index < count; index += 1) {
      const label = (await tabs.nth(index).innerText()).replace(/\s+/g, ' ').trim();
      if (label.toUpperCase() === originalView.selectedMarket.toUpperCase()) {
        await tabs.nth(index).click({ timeout: 3000 });
        await page.waitForTimeout(settleMs);
        break;
      }
    }
  }
  await highlight(page, false);
  report.restored = await readViewState(page);
  report.finishedAt = new Date().toISOString();
  return report;
}

function summarizeProbe(report) {
  const attempted = report.clicks.length;
  const succeeded = report.clicks.filter((click) => click.ok).length;
  const changed = report.clicks.filter((click) => click.ok && click.pageChanged).length;
  return {
    controlsFound: Object.fromEntries(Object.entries(report.controls ?? {}).map(([key, item]) => [key, item.visible])),
    clicksAttempted: attempted,
    clicksSucceeded: succeeded,
    clicksThatChangedThePage: changed,
    buttonsUsable: attempted > 0 && succeeded === attempted,
  };
}

function renderProbeMarkdown(report) {
  const summary = summarizeProbe(report);
  const lines = [
    '# BetKing button-access probe',
    '',
    `URL: ${report.url}`,
    `Run: ${report.startedAt} to ${report.finishedAt ?? 'unfinished'}`,
    '',
    '## Controls found (visible)',
    '',
    ...Object.entries(summary.controlsFound).map(([key, count]) => `- ${key}: ${count}`),
    '',
    '## Clicks (navigation controls only; odds, selections, and bet-slip controls are never clicked)',
    '',
    `Attempted ${summary.clicksAttempted}, succeeded ${summary.clicksSucceeded}, changed the page ${summary.clicksThatChangedThePage}.`,
    '',
    ...report.clicks.map((click) => (click.ok
      ? `- ${click.control} "${click.text}": ok, ${click.pageChanged ? 'page changed' : 'page unchanged'}`
      : `- ${click.control} "${click.text}": FAILED (${click.error})${click.diagnostics ? `\n  - diagnostics: ${JSON.stringify(click.diagnostics)}` : ''}`)),
    '',
    `Buttons usable: ${summary.buttonsUsable ? 'YES' : 'NO'}`,
    '',
  ];
  return lines.join('\n');
}

module.exports = {
  CLICK_ALLOWLIST,
  INVENTORY,
  renderProbeMarkdown,
  runControlProbe,
  summarizeProbe,
};
