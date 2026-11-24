// The PAGE side of the odds hunter: select a league tab, find which weeks are on screen, open the market groups
// (HT/FT, Total Goals, Correct Score, and HT Correct Score inside Correct Score) and read every fixture's odds.
// It is built on the pieces the betting project already used on this same site (the market flow and the fixture-grid
// reader), so it only reads: it never touches a betslip. NOT yet verified on the live site: run
//   node observer-run.js --odds-probe --league laliga
// first. The probe prints exactly which selection labels and odds each market group shows, and saves evidence.
const reader = require('../sportsbook/laLigaReader');
const { SELECTION_LIST } = require('./options');
const { belongsToLeague } = require('./leagueCheck');

const GROUPS = [
  { group: 'HTFT', category: 'HT/FT', market: 'HT/FT', sentinel: ['1/X'] },
  { group: 'TG', category: 'Total Goals', market: 'Total Goals', sentinel: ['0'] },
  { group: 'CS', category: 'Correct Score', market: 'Correct Score', sentinel: ['6-0', '0-6'] },
  { group: 'HTCS', category: 'Correct Score', market: 'HT Correct Score', sentinel: ['0-3', '1-2'] },
];

// the site's label -> our label, per group (null = not one of ours)
function normalizeLabel(group, raw) {
  const label = String(raw ?? '').trim();
  let m;
  if (group === 'TG') return (m = /^(\d{1,2})(?:\s*goals?)?$/i.exec(label)) ? String(Number(m[1])) : null;
  if (group === 'CS' || group === 'HTCS') return (m = /^(\d{1,2})\s*[-:]\s*(\d{1,2})$/.exec(label)) ? `${Number(m[1])}-${Number(m[2])}` : null;
  if (group === 'HTFT') return (m = /^([12X])\s*\/\s*([12X])$/i.exec(label)) ? `${m[1].toUpperCase()}/${m[2].toUpperCase()}` : null;
  return null;
}

function gridToSelections(group, grid) {
  const wanted = new Set(SELECTION_LIST[group]);
  const out = {};
  for (const [rawLabel, rawOdd] of Object.entries(grid || {})) {
    const label = normalizeLabel(group, rawLabel);
    const odd = reader.parseOdd(rawOdd);
    if (label && wanted.has(label) && odd !== null) out[label] = odd;
  }
  return out;
}

const weekNumber = (name) => { const m = /Week\s+(\d{1,2})/i.exec(String(name)); return m ? Number(m[1]) : null; };

function createOddsPageReader({ page, flow, log = () => {}, evidence = async () => {} }) {
  const wait = (ms) => page.waitForTimeout(ms);

  const rowsOf = (rounds) => rounds.flatMap((round) => round.matches.map((match) => ({ home: match.home.toUpperCase(), away: match.away.toUpperCase() })));

  // The collector STAYS on its league's page: the page itself moves on to the next rounds. The tab is only clicked when the
  // page is not showing this league (first time, or after a reload).
  async function ensureLeague(league) {
    const current = await reader.readRounds(page).catch(() => []);
    const rows = rowsOf(current);
    if (rows.length && belongsToLeague(league, { rows })) return current;
    return selectLeague(league);
  }

  async function selectLeague(league) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const clicked = await page.evaluate((index) => {
        const tabs = [...document.querySelectorAll('[data-testid^="league-switcher-tab-"]')];
        if (tabs.length < 5 || !tabs[index]) return false;
        tabs[index].click();
        return true;
      }, league.tabIndex);
      if (!clicked) throw new Error(`the league tabs were not found on the page (wanted ${league.name})`);
      await wait(1500);
      const rounds = await reader.readRounds(page);
      const rows = rowsOf(rounds);
      if (rows.length && belongsToLeague(league, { rows })) return rounds;
      log(`  [odds ${league.key}] the page still shows another league; selecting ${league.name} again (${attempt}/3).`);
      await wait(1500);
    }
    throw new Error(`could not bring ${league.name} on screen`);
  }

  async function peekWeeks(league) {
    const rounds = await ensureLeague(league);
    return [...new Set(rounds.map((round) => weekNumber(round.name)).filter((week) => week !== null))];
  }

  // One round, one market group: every fixture of the round.
  async function readGroup(spec, round) {
    const week = weekNumber(round.name);
    const opened = await flow.openMarketCategory(spec.category, { roundName: round.name, home: round.matches[0].home, away: round.matches[0].away }, { market: spec.market });
    if (opened.status !== 'MARKET_CATEGORY_OPENED') throw new Error(`${spec.market} would not open (${opened.status})`);
    const out = [];
    for (const match of round.matches) {
      const result = await reader.readFixtureGrid(page, round.name, match.home, match.away, { expectedLabels: spec.sentinel, timeoutMs: 3500 });
      out.push({ week, home: match.home.toUpperCase(), away: match.away.toUpperCase(), group: spec.group, selections: gridToSelections(spec.group, result.grid) });
    }
    return out;
  }

  // The odds of a round only stay on the page for about 3 minutes before it starts (the page shows 4 rounds ahead = 12
  // minutes), so the rounds are read SOONEST FIRST and all four market groups of one round are finished before the next
  // round starts. Switching market group costs a little, but a round that rolled off half way would be lost.
  async function readOdds(league, weeks) {
    const rounds = await ensureLeague(league);
    const fixtures = new Map();
    for (const round of rounds) {
      const week = weekNumber(round.name);
      if (!weeks.includes(week) || !round.matches.length) continue;
      for (const spec of GROUPS) {
        let rows;
        try { rows = await readGroup(spec, round); } catch (error) { log(`  [odds ${league.key}] week ${week} ${spec.group}: ${String(error.message).split('\n')[0]}`); continue; }
        for (const row of rows) {
          const key = `${row.week}|${row.home}|${row.away}`;
          const fixture = fixtures.get(key) || { week: row.week, home: row.home, away: row.away, odds: {} };
          fixture.odds[row.group] = row.selections;
          fixtures.set(key, fixture);
        }
      }
    }
    return [...fixtures.values()];
  }

  // For the first real run: what does each market group show for ONE fixture?
  async function probe(league) {
    const rounds = await selectLeague(league);
    const round = rounds.find((item) => item.matches.length);
    if (!round) throw new Error('no round with fixtures on the page');
    const match = round.matches[0];
    const report = { league: league.key, round: round.name, fixture: `${match.home} v ${match.away}`, weeksOnScreen: rounds.map((item) => item.name), groups: {} };
    for (const spec of GROUPS) {
      try {
        const began = Date.now();
        const opened = await flow.openMarketCategory(spec.category, { roundName: round.name, home: match.home, away: match.away }, { market: spec.market });
        const openedMs = Date.now() - began;
        const readBegan = Date.now();
        const result = await reader.readFixtureGrid(page, round.name, match.home, match.away, { expectedLabels: spec.sentinel, timeoutMs: 4000 });
        const readMs = Date.now() - readBegan;
        // the whole of one round = opening the group once + reading every fixture of the round
        report.groups[spec.group] = { opened: opened.status, openMs: openedMs, oneFixtureMs: readMs, estimatedRoundSeconds: Math.round((openedMs + readMs * round.matches.length) / 100) / 10, labelsOnPage: result.grid, ours: gridToSelections(spec.group, result.grid), wanted: SELECTION_LIST[spec.group] };
      } catch (error) { report.groups[spec.group] = { error: String(error.message).split('\n')[0] }; }
      await evidence(`probe-${league.key}-${spec.group}`, JSON.stringify(report.groups[spec.group], null, 2));
    }
    return report;
  }

  return Object.freeze({ peekWeeks, readOdds, probe });
}

module.exports = { createOddsPageReader, normalizeLabel, gridToSelections, GROUPS };
