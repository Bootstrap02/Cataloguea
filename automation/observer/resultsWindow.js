// Drives the BetKing page for the observer: pick a league tab, open its Results window (the list icon next to the week
// chips, the same control the betting project already uses), scroll through the window collecting the round cards,
// and close it again. Nothing is ever bet and nothing is typed: it only clicks tabs and reads text.
const { parseResultsCards } = require('./resultsCards');
const { belongsToLeague } = require('./leagueCheck');

const ANY_LEAGUE_TAB = '^KINGS\\s+(LEAGUE|LIGA|CHAMPIONS|ITALIANO|BUNDL?IGA)$';
const ROOT = 'data-observer-root';
const TAB = 'data-observer-tab';
const SCROLLER = 'data-observer-scroll';

function createResultsWindow({ page, log = () => {}, listUrl, settleMs = 700, evidence = async () => {} }) {
  const wait = (ms) => page.waitForTimeout(ms);

  // Click a league tab. The tab of the league that is open shows its countdown instead of its name, so when the wanted
  // tab has no readable name, it is the tab at the wanted position in the row of five.
  async function clickLeagueTab(league) {
    return page.evaluate(({ wantedSource, wantedFlags, anySource, index }) => {
      // the text as it is DISPLAYED ("KINGS" on one line and "LEAGUE" on the next reads as "KINGS LEAGUE")
      const shown = (element) => (element.innerText || '').replace(/\s+/g, ' ').trim();
      const visible = (element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
      const wanted = new RegExp(wantedSource, wantedFlags);
      const any = new RegExp(anySource, 'i');
      // the smallest elements whose displayed text is exactly a league tab name
      const named = (regex) => [...document.querySelectorAll('body *')]
        .filter((element) => visible(element) && regex.test(shown(element)))
        .filter((element) => ![...element.children].some((child) => regex.test(shown(child))));
      const click = (element) => { (element.closest('button,[role="tab"],[role="button"],a') || element).click(); };
      const direct = named(wanted)[0];
      if (direct) { click(direct); return { clicked: true, how: 'by name' }; }
      const other = named(any)[0];
      if (!other) return { clicked: false, how: 'no league tab on the page' };
      let node = other;
      for (let depth = 0; depth < 6 && node; depth += 1) {
        if (node.parentElement && node.parentElement.children.length === 5) {
          const target = node.parentElement.children[index];
          if (target) { click(target); return { clicked: true, how: 'by position' }; }
        }
        node = node.parentElement;
      }
      return { clicked: false, how: 'the row of five league tabs was not found' };
    }, { wantedSource: league.tabLabel.source, wantedFlags: league.tabLabel.flags, anySource: ANY_LEAGUE_TAB, index: league.tabIndex });
  }

  // Marks the Results window (found by its two tabs, Standings | Results) and the Results tab.
  async function markWindow() {
    return page.evaluate(({ rootAttribute, tabAttribute }) => {
      const text = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim();
      const visible = (element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
      const leaves = [...document.querySelectorAll('body *')].filter((element) => element.childElementCount === 0 && visible(element));
      const standings = leaves.find((element) => /^Standings$/i.test(text(element)));
      const results = leaves.filter((element) => /^Results$/i.test(text(element)));
      if (!standings || results.length === 0) return { found: false };
      let node = standings;
      let tab = null;
      for (let depth = 0; depth < 6 && node && !tab; depth += 1) {
        node = node.parentElement;
        tab = node ? results.find((candidate) => node.contains(candidate)) : null;
      }
      if (!tab) return { found: false };
      let root = node;
      for (let depth = 0; depth < 8 && root.parentElement && root.parentElement !== document.body; depth += 1) {
        if (/Kings\s+(League|Liga|Champions|Italiano|Bund)/i.test(root.innerText || '') && (root.innerText || '').length > 150) break;
        root = root.parentElement;
      }
      document.querySelectorAll(`[${rootAttribute}],[${tabAttribute}]`).forEach((element) => { element.removeAttribute(rootAttribute); element.removeAttribute(tabAttribute); });
      tab.setAttribute(tabAttribute, '1');
      root.setAttribute(rootAttribute, '1');
      return { found: true };
    }, { rootAttribute: ROOT, tabAttribute: TAB });
  }

  // The site only needs the click event; Playwright's own click refuses elements it thinks are off screen.
  async function domClick(selector) {
    return page.evaluate((target) => {
      const element = document.querySelector(target);
      if (!element) return false;
      try { element.scrollIntoView({ block: 'center', inline: 'center' }); } catch (error) { /* ignore */ }
      (element.closest('button,[role="tab"],[role="button"],a') || element).click();
      return true;
    }, selector);
  }
  async function clickWithFallback(selector) {
    try { await page.locator(selector).first().click({ timeout: 1200 }); } catch (error) { if (!(await domClick(selector))) throw error; }
  }

  const readRoot = () => page.locator(`[${ROOT}="1"]`).first().innerText({ timeout: 4000 });
  const hasColumns = (text) => /\bHT\b/.test(text) && /\bFT\b/.test(text);

  async function openResults() {
    let marked = await markWindow();
    if (!marked.found) {
      await clickWithFallback('[data-testid="standings-button"]');
      await wait(settleMs + 500);
      marked = await markWindow();
      if (!marked.found) throw new Error('The league window did not open (no Standings and Results tabs found).');
    }
    let text = await readRoot();
    if (!hasColumns(text)) {
      await clickWithFallback(`[${TAB}="1"]`);
      await wait(settleMs + 500);
      marked = await markWindow();
      if (!marked.found) throw new Error('The Results tab did not stay open.');
      text = await readRoot();
    }
    return text;
  }

  async function closeWindow() {
    try { await page.keyboard.press('Escape'); } catch (error) { /* continue */ }
    await wait(300);
    try {
      if ((await markWindow()).found) {
        await page.evaluate((rootAttribute) => {
          const root = document.querySelector(`[${rootAttribute}="1"]`);
          if (!root) return;
          const top = root.getBoundingClientRect().top;
          const candidates = [...root.querySelectorAll('button,[role="button"],svg')]
            .filter((element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.top < top + 70; })
            .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
          const target = candidates[0];
          if (target) (target.closest('button,[role="button"]') || target).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }, ROOT);
        await wait(300);
      }
    } catch (error) { /* the next visit reopens it if needed */ } finally {
      try {
        await page.evaluate(({ r, t, s }) => document.querySelectorAll(`[${r}],[${t}],[${s}]`).forEach((element) => { element.removeAttribute(r); element.removeAttribute(t); element.removeAttribute(s); }), { r: ROOT, t: TAB, s: SCROLLER });
      } catch (ignored) { /* page may be navigating */ }
    }
  }

  // Scrolls the window's list one step down; says whether it moved.
  async function scrollStep() {
    return page.evaluate(({ rootAttribute, scrollAttribute }) => {
      const root = document.querySelector(`[${rootAttribute}="1"]`);
      if (!root) return { moved: false };
      let scroller = document.querySelector(`[${scrollAttribute}="1"]`);
      if (!scroller) {
        const candidates = [root, ...root.querySelectorAll('*')].filter((element) => {
          const style = getComputedStyle(element);
          return element.scrollHeight > element.clientHeight + 20 && /(auto|scroll)/.test(style.overflowY);
        }).sort((a, b) => b.scrollHeight - a.scrollHeight);
        scroller = candidates[0] || null;
        if (scroller) scroller.setAttribute(scrollAttribute, '1');
      }
      if (!scroller) return { moved: false, noScroller: true };
      const before = scroller.scrollTop;
      scroller.scrollTop = before + Math.round(scroller.clientHeight * 0.8);
      return { moved: scroller.scrollTop > before };
    }, { rootAttribute: ROOT, scrollAttribute: SCROLLER });
  }

  // Back to the top of the list (the window can remember where it was scrolled the last time).
  async function scrollToTop() {
    await page.evaluate(({ rootAttribute, scrollAttribute }) => {
      const root = document.querySelector(`[${rootAttribute}="1"]`);
      if (!root) return;
      [root, ...root.querySelectorAll('*')].forEach((element) => { if (element.scrollTop > 0) element.scrollTop = 0; });
      const marked = document.querySelector(`[${scrollAttribute}="1"]`);
      if (marked) marked.removeAttribute(scrollAttribute);
    }, { rootAttribute: ROOT, scrollAttribute: SCROLLER });
  }

  // Selects the league, opens the Results window, and collects the round cards (newest first, at most 10).
  // Only cards whose teams belong to THIS league are kept: right after switching league the window can still show the
  // previous league's rounds for a moment, and those must never reach the record book.
  async function readCards(league) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const tab = await clickLeagueTab(league);
      if (!tab.clicked) throw new Error(`could not select ${league.name}: ${tab.how}`);
      await wait(settleMs + 900);
      const firstText = await openResults();
      const head = String(firstText).replace(/\s+/g, ' ').slice(0, 160);
      if (!league.titleRegex.test(head)) {
        log(`  [${league.key}] the window shows another league ("${head.slice(0, 40)}"); selecting ${league.name} again (${attempt}/3).`);
        await closeWindow();
        continue;
      }
      const found = new Map();   // one entry per league id + week; a complete card replaces a half-drawn one
      await scrollToTop();
      await wait(300);
      let text = await readRoot();
      let foreign = 0;
      for (let step = 0; step < 16; step += 1) {
        for (const card of parseResultsCards(text, { rowsPerRound: league.perRound })) {
          if (!belongsToLeague(league, card)) { foreign += 1; continue; }
          const id = `${card.leagueId}|${card.week}`;
          const old = found.get(id);
          if (!old || (!old.complete && card.complete)) found.set(id, card);
        }
        if ([...found.values()].filter((card) => card.complete).length >= 10) break;   // the window keeps the last 10 rounds
        const moved = await scrollStep();
        if (!moved.moved) break;
        await wait(350);
        text = await readRoot();
      }
      await evidence(`${league.key}-results`, firstText);
      await closeWindow();
      if (found.size === 0) {
        log(`  [${league.key}] the window showed ${foreign ? 'another league\'s rounds' : 'no round cards'}; opening it again (${attempt}/3).`);
        await wait(1500);
        continue;
      }
      return { cards: [...found.values()], head };
    }
    throw new Error(`the Results window kept showing the wrong league instead of ${league.name}`);
  }

  async function reloadList() {
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await wait(2500);
  }

  return Object.freeze({ readCards, reloadList, closeWindow });
}

module.exports = { createResultsWindow };
