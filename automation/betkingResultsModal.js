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

function createResultsModalReader({ page, actionTimeoutMs = 3000, settleMs = 600 }) {
  const wait = (ms) => (typeof page.waitForTimeout === 'function' ? page.waitForTimeout(ms) : Promise.resolve());

  async function readWindowText() {
    return page.evaluate(() => {
      const candidates = [...document.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="dialog" i], [class*="drawer" i]')]
        .filter((element) => /Results/i.test(element.innerText || '') && /Standings/i.test(element.innerText || ''));
      const target = candidates.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
      return target ? target.innerText : null;
    });
  }

  async function openResultsTab() {
    let text = await readWindowText();
    if (text === null) {
      await page.locator('[data-testid="standings-button"]').first().click({ timeout: actionTimeoutMs });
      await wait(settleMs);
      text = await readWindowText();
      if (text === null) throw new Error('The Kings League results window did not open.');
    }
    if (!/\bHT\b/.test(text)) {
      await page.getByText(/^\s*Results\s*$/i).first().click({ timeout: actionTimeoutMs });
      await wait(settleMs);
      text = await readWindowText();
    }
    return text;
  }

  async function close() {
    try {
      const closer = page.locator('[role="dialog"] [aria-label*="close" i], [role="dialog"] button:has(svg)').first();
      if (await closer.count()) await closer.click({ timeout: 1500 });
      else await page.keyboard.press('Escape');
    } catch (error) {
      try { await page.keyboard.press('Escape'); } catch (ignored) { /* best effort */ }
    }
    await wait(300);
  }

  // Same shape as the configured results reader: { results: [...] }, rows only once finished.
  async function readResultsPage() {
    let text;
    try {
      text = await openResultsTab();
    } finally {
      // Closed again after every read so the page is usable for betting between polls.
    }
    const page_ = rowsToResultsPage(parseResultsText(text));
    await close();
    return page_;
  }

  return Object.freeze({ readResultsPage });
}

module.exports = { parseResultsText, rowsToResultsPage, createResultsModalReader };
