// BetKing's own record of the bets: My Bets > Virtuals > Settled. Every settled single prints its fixture, the
// full-time score and the half-time score, for example "Kings League | Week 38 | ARS 3-3 BRE (HT: 2-0) | Event Ended".
// That is the site's own result for exactly the fixtures that were bet on, and it stays there after the Results
// window has moved on.

function squash(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

// Pure: every "CODE n-n CODE (HT: n-n)" in the page, with the week printed just before it when there is one.
function parseSettledBets(text) {
  const flat = squash(text);
  const pattern = /(?:Week\s+(\d{1,2})\s*\|?\s*)?([A-Z]{2,4})\s+(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Z]{2,4})\s*\(\s*HT:\s*(\d{1,2})\s*-\s*(\d{1,2})\s*\)/g;
  const found = [];
  let match;
  while ((match = pattern.exec(flat)) !== null) {
    found.push({
      week: match[1] ? Number(match[1]) : null,
      home: match[2],
      away: match[5],
      ft: { home: Number(match[3]), away: Number(match[4]) },
      ht: { home: Number(match[6]), away: Number(match[7]) },
    });
  }
  return found;
}

// results map { 'HOME-AWAY': { ht, ft } } for the wanted fixtures (and week, when the page prints it).
function settledResultsFor(found, fixtures, weekNumber = null) {
  const results = {};
  for (const fixture of fixtures) {
    const hit = found.find((item) => item.home === fixture.home && item.away === fixture.away && (weekNumber === null || item.week === null || item.week === weekNumber));
    if (hit) results[`${fixture.home}-${fixture.away}`] = { ft: hit.ft, ht: hit.ht };
  }
  return results;
}

async function readSettledBets(page, { targetUrl, settleMs = 2500 } = {}) {
  const origin = new URL(targetUrl).origin;
  await page.goto(`${origin}/en-ng/my-bets/virtuals/settled`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // The list says "Loading..." for a moment: wait until the scores are printed (or give up after 12 seconds).
  let text = '';
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(settleMs > 1000 ? 1000 : settleMs);
    text = await page.evaluate(() => document.body.innerText || '');
    if (/\(\s*HT:/.test(text) && !/Loading/i.test(text)) break;
  }
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-testid="league-round"]', { timeout: 15000 }).catch(() => {});
  } catch (error) { /* ensureLiga reports it */ }
  return { text, found: parseSettledBets(text) };
}

module.exports = { parseSettledBets, settledResultsFor, readSettledBets };
