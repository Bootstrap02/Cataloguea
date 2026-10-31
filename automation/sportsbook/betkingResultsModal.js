// Reads the match results the way the owner does it (screen recording, Oct 23 2026):
//   list icon next to the week chips ([data-testid="standings-button"]) opens the "Kings League"
//   window with the tabs Standings | Results. The Results tab shows "Week N" with, per fixture,
//   the codes, the HALF-TIME score and the FULL-TIME score, for example "NEW - ARS  0 - 0  1 - 0".
// Results appear only after the round has finished, about 30 seconds after full time (when the
// next round's countdown is under 2 minutes), so the poller simply keeps asking until the row exists.
// The half-time column is the site's own, so it is used as given; goals after 45' are second half.

function squash(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

// Pure parser (unit tested): text of the Results window -> { roundName, rows }.
function parseResultsText(text) {
  const flat = squash(text);
  const week = /Week\s+(\d{1,2})/i.exec(flat);
  const rows = [];
  const pattern = /(?:^|\s)(\d{1,2})\s+([A-Z]{2,4})\s*-\s*([A-Z]{2,4})\s+(\d{1,2})\s*-\s*(\d{1,2})\s+(\d{1,2})\s*-\s*(\d{1,2})(?=\s|$)/g;
  let match;
  while ((match = pattern.exec(flat)) !== null) {
    rows.push({
      position: Number(match[1]),
      home: match[2],
      away: match[3],
      halfTime: { home: Number(match[4]), away: Number(match[5]) },
      fullTime: { home: Number(match[6]), away: Number(match[7]) },
    });
  }
  return { roundName: week ? `Week ${week[1]}` : null, rows };
}

function rowsToResultsPage({ roundName, rows }, observedAt = new Date().toISOString()) {
  return {
    results: rows.map((row) => ({
      fixture: {
        id: `${row.home}-${row.away}`,
        fixtureId: `${row.home}-${row.away}`,
        home: row.home,
        away: row.away,
        homeName: row.home,
        awayName: row.away,
        roundId: roundName,
        roundName,
      },
      status: 'FINISHED',
      fullTime: { ...row.fullTime },
      halfTime: { ...row.halfTime },
      timestamp: observedAt,
    })),
  };
}

// Evidence from every check of the Results window: screenshot + the text read, so a parsing problem can be
// fixed from what the page really showed. Set by the controller to the run folder; best effort only.
let captureDirectory = null;
let readCount = 0;
function setResultsCaptureDirectory(directory) {
  captureDirectory = directory || null;
  readCount = 0;
}

function createResultsModalReader({ page, actionTimeoutMs = 3000, settleMs = 600 }) {
  const wait = (ms) => (typeof page.waitForTimeout === 'function' ? page.waitForTimeout(ms) : Promise.resolve());
  const ROOT = 'data-cataloguea-results-root';
  const TAB = 'data-cataloguea-results-tab';

  // Finds the Kings League window by its own two tabs (Standings | Results) and marks the window and the
  // Results tab, so nothing else on the page can be clicked or read by mistake.
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
        if (/Kings League/i.test(root.innerText || '') && (root.innerText || '').length > 150) break;
        root = root.parentElement;
      }
      document.querySelectorAll(`[${rootAttribute}],[${tabAttribute}]`).forEach((element) => {
        element.removeAttribute(rootAttribute);
        element.removeAttribute(tabAttribute);
      });
      tab.setAttribute(tabAttribute, '1');
      root.setAttribute(rootAttribute, '1');
      return { found: true };
    }, { rootAttribute: ROOT, tabAttribute: TAB });
  }

  // Clicks through the page itself. Playwright refuses elements it judges to be outside the viewport (the
  // owner's runs failed exactly there), but the site only needs the click event.
  async function domClick(selector) {
    return page.evaluate((target) => {
      const element = document.querySelector(target);
      if (!element) return false;
      try { element.scrollIntoView({ block: 'center', inline: 'center' }); } catch (error) { /* ignore */ }
      const clickable = element.closest('button,[role="tab"],[role="button"],a') || element;
      clickable.click();
      return true;
    }, selector);
  }
  async function clickWithFallback(selector) {
    try {
      await page.locator(selector).first().click({ timeout: 1200 });
    } catch (error) {
      if (!(await domClick(selector))) throw error;
    }
  }

  const readRoot = () => page.locator(`[${ROOT}="1"]`).first().innerText({ timeout: actionTimeoutMs });
  const hasColumns = (text) => /\bHT\b/.test(text) && /\bFT\b/.test(text);

  async function openAndRead() {
    let marked = await markWindow();
    if (!marked.found) {
      await clickWithFallback('[data-testid="standings-button"]');
      await wait(settleMs + 400);
      marked = await markWindow();
      if (!marked.found) throw new Error('The Kings League window did not open (no Standings and Results tabs found).');
    }
    let text = await readRoot();
    if (!hasColumns(text)) {
      await clickWithFallback(`[${TAB}="1"]`);
      await wait(settleMs + 400);
      marked = await markWindow();
      if (!marked.found) throw new Error('The Results tab did not stay open.');
      text = await readRoot();
    }
    return text;
  }

  // Closes the window: Escape first; if it is still there, the close control in its header (top right).
  async function close() {
    try { await page.keyboard.press('Escape'); } catch (error) { /* continue */ }
    await wait(300);
    try {
      const still = await markWindow();
      if (!still.found) return;
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
    } catch (error) { /* the next check will find or reopen it */ } finally {
      try {
        await page.evaluate(({ rootAttribute, tabAttribute }) => {
          document.querySelectorAll(`[${rootAttribute}],[${tabAttribute}]`).forEach((element) => {
            element.removeAttribute(rootAttribute);
            element.removeAttribute(tabAttribute);
          });
        }, { rootAttribute: ROOT, tabAttribute: TAB });
      } catch (ignored) { /* page may be navigating */ }
    }
  }

  async function saveEvidence(name, text) {
    if (!captureDirectory) return;
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      if (text !== undefined) fs.writeFileSync(path.join(captureDirectory, `${name}.txt`), `${text}\n`);
      await page.screenshot({ path: path.join(captureDirectory, `${name}.png`) });
    } catch (error) { /* evidence only */ }
  }

  // Same shape as the configured results reader: { results: [...] }, rows only once finished.
  async function readResultsPage() {
    let text;
    try {
      text = await openAndRead();
    } catch (error) {
      readCount += 1;
      let bodyText = '';
      try { bodyText = (await page.evaluate(() => document.body.innerText || '')).slice(0, 4000); } catch (ignored) { /* none */ }
      await saveEvidence(`results-failed-${String(readCount).padStart(2, '0')}`, `${error.message}\n---- page text ----\n${bodyText}`);
      throw error;
    }
    const parsed = parseResultsText(text);
    const page_ = rowsToResultsPage(parsed);
    Object.defineProperty(page_, 'summary', { value: { roundName: parsed.roundName, rows: parsed.rows.length }, enumerable: false });
    readCount += 1;
    if (readCount <= 4 || readCount % 5 === 0) await saveEvidence(`results-window-${String(readCount).padStart(2, '0')}`, text);
    await close();
    return page_;
  }

  return Object.freeze({ readResultsPage });
}

// Fallback when the Results window cannot be read: the score of our fixture on the main match panel
// ("All Fixtures this round", for example "CHE 0 - 1 ARS"). Full time only; the half-time score is not there.
async function readPanelScore(page, home, away) {
  const text = await page.evaluate(() => document.body.innerText || '');
  const flat = squash(text);
  const h = String(home).toUpperCase();
  const a = String(away).toUpperCase();
  const score = `${h}\\s+(\\d{1,2})\\s*-\\s*(\\d{1,2})\\s+${a}`;
  // Separators other than "-" and a token or two (an icon, a minute) between the codes and the score are allowed.
  const loose = `${h}(?:\\s+\\S{1,6}){0,2}?\\s+(\\d{1,2})\\s*[-\\u2013\\u2014:]\\s*(\\d{1,2})(?:\\s+\\S{1,6}){0,2}?\\s+${a}`;
  const match = new RegExp(`(?:^|\\s)${score}(?=\\s|$)`).exec(flat) || new RegExp(`(?:^|\\s)${loose}(?=\\s|$)`).exec(flat);
  if (!match) return null;
  // Header of the live view: "39'  BRE 0 - 1 AST" while playing, "FT  BRE 0 - 1 AST" when over.
  const minute = new RegExp(`(\\d{1,2})'\\s+${score}`).exec(flat);
  const finished = new RegExp(`\\bFT\\b\\s+${score}`).test(flat);
  return {
    home: Number(match[1]),
    away: Number(match[2]),
    finished,
    // At full time the header shows FT instead of a minute, so any minute found there belongs to other text.
    minute: !finished && minute ? Number(minute[1]) : null,
    goals: parseGoalMinutes(flat, match, Number(match[1]), Number(match[2])),
  };
}

// The match list prints the minute of every goal under the score: home goals to the left of the ball icon with
// a leading apostrophe ('43), away goals to its right with a trailing one (62'). Read from the text that follows
// our fixture's score, up to the next fixture. The lists are trusted only when their sizes match the score.
function parseGoalMinutes(flat, match, homeScore, awayScore) {
  const after = flat.slice(match.index + match[0].length, match.index + match[0].length + 140);
  const tail = after.split(/[A-Z]{2,4}\s+\d{1,2}\s*-\s*\d{1,2}\s+[A-Z]{2,4}/)[0].replace(/[\u2019\u2032\u00b4`]/g, "'");
  const homeMinutes = [...tail.matchAll(/(?<![\d'])'(\d{1,2})(?![\d'])/g)].map((m) => Number(m[1]));
  const awayMinutes = [...tail.matchAll(/(?<![\d'])(\d{1,2})'(?!\d)/g)].map((m) => Number(m[1]));
  if (homeMinutes.length !== homeScore || awayMinutes.length !== awayScore) return null;
  return { home: homeMinutes.sort((a, b) => a - b), away: awayMinutes.sort((a, b) => a - b) };
}

// The countdown on the league tab (the lion icon) counts down to zero; at zero the match starts and the tab
// shows LIVE for the 30 seconds the match lasts (owner's explanation and recordings). Returns seconds left
// (null when no countdown is on screen) and whether the page says LIVE. The first mm:ss on the page is that
// countdown, because the league tab sits above everything else.
// What the page says about our two teams, for the log when the score cannot be read: the text lines that
// mention either code. Shows the real format so the reader can be corrected from evidence.
async function readPanelDebug(page, home, away) {
  const text = await page.evaluate(() => document.body.innerText || '');
  const h = String(home).toUpperCase();
  const a = String(away).toUpperCase();
  return String(text).split(/\n+/).map((line) => line.trim()).filter((line) => line && (line.includes(h) || line.includes(a))).slice(0, 12);
}

async function readMatchClock(page) {
  const text = await page.evaluate(() => document.body.innerText || '');
  const flat = squash(text);
  const timer = /(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$)/.exec(flat);
  return {
    countdown: timer ? Number(timer[1]) * 60 + Number(timer[2]) : null,
    live: /\bLIVE\b/.test(flat),
  };
}

module.exports = { parseResultsText, rowsToResultsPage, createResultsModalReader, setResultsCaptureDirectory, readPanelScore, readMatchClock, readPanelDebug };
