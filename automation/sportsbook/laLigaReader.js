// Reading the Kings Liga (La Liga) tab of BetKing. It is the same interface as Kings League: the round list
// ([data-testid="league-round"]), fixture rows ([data-testid="match"]), one accordion per fixture, and the HT/FT grid
// printing each label (1/1, 1/X, ... 2/2) in a caption above its odd. READ-ONLY: it only changes the view.

const LA_LIGA_CODES = Object.freeze(['RMA', 'RST', 'CEL', 'RSO', 'ATM', 'ELC', 'ALV', 'BAR', 'OSA', 'RAY', 'DLC', 'VIL', 'VAL', 'GET', 'BET', 'MLG', 'LEV', 'ESP', 'ATH', 'SEV']);
const HT_FT_LABELS = Object.freeze(['1/1', '1/X', '1/2', 'X/1', 'X/X', 'X/2', '2/1', '2/X', '2/2']);

// ---- pure helpers (tested) ---------------------------------------------------------------------

function parseOdd(value) {
  const number = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(number) && number > 1 ? number : null;
}

// A team's protecting bet: ahead at half-time, level at full time: 1/X for the home team, 2/X for the away team.
function protectingSelection(side) {
  return side === 'HOME' ? '1/X' : '2/X';
}

// fixtures: [{ home, away, grid: { '1/X': '13.70', ... } }] -> { RMA: { selection, odds, fixture } ... }
function teamOddsFromFixtures(fixtures) {
  const teams = {};
  const missing = [];
  for (const fixture of fixtures) {
    for (const [side, code] of [['HOME', fixture.home], ['AWAY', fixture.away]]) {
      const selection = protectingSelection(side);
      const odds = parseOdd(fixture.grid?.[selection]);
      if (odds === null) { missing.push(`${code} (${selection})`); continue; }
      teams[code] = { selection, odds, fixture: `${fixture.home} v ${fixture.away}`, side };
    }
  }
  return { teams, missing };
}

// The 6-0 winner odds for one team in the Correct Score grid: "6-0" when the team is at home, "0-6" when away.
function winnerOddsFromGrid(grid, side) {
  return parseOdd(grid?.[side === 'HOME' ? '6-0' : '0-6']);
}

// ---- the page ----------------------------------------------------------------------------------

async function switchToLiga(page) {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[data-testid^="league-switcher-tab-"]')];
    const text = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim();
    const list = tabs.map((element) => ({ testid: element.getAttribute('data-testid'), text: text(element) }));
    const notOthers = (value) => !/bund|ital|champ/i.test(value);
    let index = list.findIndex((tab) => /liga/i.test(tab.testid) && notOthers(tab.testid));
    if (index === -1) index = list.findIndex((tab) => /liga/i.test(tab.text) && notOthers(tab.text));
    if (index === -1 && tabs.length >= 2) index = 1;   // the orange tab is the second one (it shows a timer instead of its name)
    if (index === -1) return { ok: false, tabs: list };
    tabs[index].click();
    return { ok: true, tabs: list, clicked: list[index] };
  });
}

// The La Liga tab's own clock: its countdown, or LIVE while its matches are played. Only the selected tab shows one
// (the others show their names), and each league runs on its own clock, so this is the only clock that counts.
async function readLigaTab(page) {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[data-testid^="league-switcher-tab-"]')];
    const text = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim();
    const list = tabs.map((element) => ({ testid: element.getAttribute('data-testid'), text: text(element) }));
    const notOthers = (value) => !/bund|ital|champ/i.test(value);
    let index = list.findIndex((tab) => /liga/i.test(tab.testid) && notOthers(tab.testid));
    if (index === -1) index = list.findIndex((tab) => /liga/i.test(tab.text) && notOthers(tab.text));
    if (index === -1 && tabs.length >= 2) index = 1;
    if (index === -1) return { found: false };
    const label = list[index].text;
    const timer = /(\d{1,2}):(\d{2})/.exec(label);
    return { found: true, text: label, countdown: timer ? Number(timer[1]) * 60 + Number(timer[2]) : null, live: /\bLIVE\b/i.test(label) };
  });
}

// Every round on screen with its fixtures and, for each fixture, the labels/odds that are showing right now.
async function readRounds(page) {
  return page.evaluate(() => {
    const text = (element) => (element ? (element.textContent || '').replace(/\s+/g, ' ').trim() : '');
    return [...document.querySelectorAll('[data-testid="league-round"]')].map((round) => ({
      name: text(round.querySelector('[data-testid="round-name"]')),
      timer: text(round.querySelector('[data-testid="round-timer"]')),
      matches: [...round.querySelectorAll('[data-testid="match"]')].map((match) => {
        const nodes = [...match.querySelectorAll('[data-testid="selection-name"], [data-testid="typography-caption--inherit"], [data-testid="match-odd-value"]')];
        const grid = {};
        let pending = null;
        for (const node of nodes) {
          const kind = node.getAttribute('data-testid');
          if (kind === 'match-odd-value') {
            if (pending !== null) grid[pending] = text(node);
            pending = null;
          } else {
            const value = text(node);
            if (value && value.length <= 12) pending = value;
          }
        }
        const details = match.querySelector('[data-testid="accordion-details"]');
        return {
          home: text(match.querySelector('[data-testid="teams-home-name"]')),
          away: text(match.querySelector('[data-testid="teams-away-name"]')),
          open: details ? details.open === true : false,
          grid,
        };
      }),
    }));
  });
}

async function waitForLigaRound(page, { timeoutMs = 12000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let rounds = [];
  while (Date.now() < deadline) {
    rounds = await readRounds(page);
    const codes = new Set(rounds.flatMap((round) => round.matches.flatMap((match) => [match.home.toUpperCase(), match.away.toUpperCase()])));
    const known = LA_LIGA_CODES.filter((code) => codes.has(code)).length;
    if (known >= 12) return { ok: true, rounds, known };
    await page.waitForTimeout(250);
  }
  return { ok: false, rounds, known: 0 };
}

// Open one fixture's accordion (when closed), wait for its odds to load, and return its grid.
async function readFixtureGrid(page, roundName, home, away, { expectedLabels, timeoutMs = 6000 } = {}) {
  const tag = async () => page.evaluate(({ roundName: wantedRound, home: wantedHome, away: wantedAway }) => {
    const text = (element) => (element ? (element.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase() : '');
    const rounds = [...document.querySelectorAll('[data-testid="league-round"]')].filter((round) => text(round.querySelector('[data-testid="round-name"]')) === wantedRound.toUpperCase());
    if (rounds.length !== 1) return 'no-round';
    const match = [...rounds[0].querySelectorAll('[data-testid="match"]')].find((item) => (
      text(item.querySelector('[data-testid="teams-home-name"]')) === wantedHome.toUpperCase()
      && text(item.querySelector('[data-testid="teams-away-name"]')) === wantedAway.toUpperCase()));
    if (!match) return 'no-match';
    const details = match.querySelector('[data-testid="accordion-details"]');
    if (details && details.open === true) return 'open';
    const summary = match.querySelector('[data-testid="accordion-summary"]') || match.querySelector('[data-testid="teams"]');
    if (!summary) return 'no-summary';
    summary.click();
    return 'clicked';
  }, { roundName, home, away });
  const first = await tag();
  if (first === 'no-round' || first === 'no-match' || first === 'no-summary') return { ok: false, reason: first, grid: {} };
  const deadline = Date.now() + timeoutMs;
  let grid = {};
  while (Date.now() < deadline) {
    await page.waitForTimeout(150);
    const rounds = await readRounds(page);
    const round = rounds.find((item) => item.name.toUpperCase() === roundName.toUpperCase());
    const match = round?.matches.find((item) => item.home.toUpperCase() === home.toUpperCase() && item.away.toUpperCase() === away.toUpperCase());
    grid = match?.grid ?? {};
    if (expectedLabels.every((label) => grid[label])) return { ok: true, grid };
  }
  return { ok: Object.keys(grid).length > 0, reason: 'odds incomplete', grid };
}

module.exports = {
  LA_LIGA_CODES, HT_FT_LABELS, parseOdd, protectingSelection, teamOddsFromFixtures, winnerOddsFromGrid,
  switchToLiga, readLigaTab, readRounds, waitForLigaRound, readFixtureGrid,
};
