// The real BetKing side of the La Liga loop (see laLigaController.js for the loop itself). Each port reuses the
// page steps that were proven on the Premier League: open the market, identify the odd, add it, enter the stake,
// compare the slip with what was planned, click PLACE BET, and prove the bet by the site's text or the balance.

const fs = require('node:fs');
const path = require('node:path');
const reader = require('./laLigaReader');
const { readMatchClock, parsePanelText, parseResultForFixture, squash, createResultsModalReader, setResultsCaptureDirectory } = require('./betkingResultsModal');
const { readSettledBets, settledResultsFor } = require('./myBetsReader');
const { compareSlipToExpected } = require('../strategy/marketFirstSequence');

const timerSeconds = (text) => {
  const match = /(\d{1,2}):(\d{2})/.exec(text || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

function createLaLigaPorts({ page, flow, runDir, targetUrl, log = console.log, maxOddsDrift = 0.15 }) {
  let evidenceCount = 0;
  const resultsReader = createResultsModalReader({ page });
  if (runDir && typeof setResultsCaptureDirectory === 'function') setResultsCaptureDirectory(runDir);

  async function captureEvidence(label) {
    evidenceCount += 1;
    if (!runDir) return;
    const base = path.join(runDir, `${String(evidenceCount).padStart(3, '0')}-${label}`);
    try {
      fs.writeFileSync(`${base}.txt`, await page.evaluate(() => document.body.innerText || ''));
      await page.screenshot({ path: `${base}.png` });
    } catch (error) { /* evidence only */ }
  }

  async function ensureLiga() {
    const here = await reader.waitForLigaRound(page, { timeoutMs: 1500 });
    if (here.ok) return true;
    const switched = await reader.switchToLiga(page);
    if (!switched.ok) throw new Error('Could not find the Kings Liga tab.');
    const loaded = await reader.waitForLigaRound(page, { timeoutMs: 15000 });
    if (!loaded.ok) throw new Error(`The Liga fixtures did not appear (${loaded.known} La Liga teams recognised).`);
    return true;
  }

  async function readUpcomingRound() {
    const rounds = await reader.readRounds(page);
    const round = rounds.find((item) => item.matches.length >= 8);
    if (!round) return null;
    return {
      name: round.name,
      number: Number((/\d+/.exec(round.name) || [])[0]) || null,
      secondsLeft: timerSeconds(round.timer),
      readAt: Date.now(),
      matches: round.matches.map((match) => ({ home: match.home.toUpperCase(), away: match.away.toUpperCase() })),
    };
  }

  async function readWinnerOdds(round, winners) {
    const odds = {};
    for (const code of winners) {
      odds[code] = null;
      const fixture = round.matches.find((match) => match.home === code || match.away === code);
      if (!fixture) continue;
      try {
        const side = fixture.home === code ? 'HOME' : 'AWAY';
        const label = side === 'HOME' ? '6-0' : '0-6';
        const opened = await flow.openMarketCategory('Correct Score', { roundName: round.name, ...fixture }, { market: 'Correct Score' });
        if (opened.status !== 'MARKET_CATEGORY_OPENED') { log(`  ${code}: Correct Score would not open (${opened.status}).`); continue; }
        const grid = await reader.readFixtureGrid(page, round.name, fixture.home, fixture.away, { expectedLabels: [label] });
        odds[code] = reader.winnerOddsFromGrid(grid.grid, side);
      } catch (error) {
        log(`  ${code}: could not read the 6-0 odds (${error.message}).`);
      }
    }
    return odds;
  }

  async function readTeamOdds(round) {
    const first = round.matches[0];
    const opened = await flow.openMarketCategory('HT/FT', { roundName: round.name, ...first }, { market: 'HT/FT' });
    if (opened.status !== 'MARKET_CATEGORY_OPENED') throw new Error(`Could not open HT/FT (${opened.status}).`);
    const fixtures = [];
    for (const match of round.matches) {
      const result = await reader.readFixtureGrid(page, round.name, match.home, match.away, { expectedLabels: reader.HT_FT_LABELS });
      fixtures.push({ home: match.home, away: match.away, grid: result.grid });
    }
    return reader.teamOddsFromFixtures(fixtures);
  }

  async function resetSlipQuietly() {
    try { await flow.resetBetSlip(); } catch (error) { /* the next bet checks the slip again */ }
  }

  // Returns { status: 'PLACED', odds } | { status: 'FAILED', reason } | { status: 'UNCONFIRMED', reason }.
  async function placeBet({ bet, round }) {
    const fixture = { roundName: round.name, home: bet.fixture.home, away: bet.fixture.away };
    const fail = async (reason) => { await resetSlipQuietly(); return { status: 'FAILED', reason }; };
    try {
      const opened = await flow.openMarketCategory(bet.category, fixture, { market: bet.market });
      if (opened.status !== 'MARKET_CATEGORY_OPENED') return fail(`open ${bet.category}: ${opened.status}`);
      const identified = await flow.identifyMarketSelection(bet.selection, fixture);
      if (identified.status !== 'MARKET_SELECTION_IDENTIFIED') return fail(`find ${bet.selection}: ${identified.status}`);
      if (bet.odds > 1 && Math.abs(identified.odds - bet.odds) / bet.odds > maxOddsDrift) return fail(`odds moved from ${bet.odds} to ${identified.odds}`);
      const leftover = await flow.readSlipSummary();
      if (leftover.count > 0) await resetSlipQuietly();
      const added = await flow.selectOdd(bet.selection, { ...fixture }, identified.odds);
      if (added.status !== 'SELECTION_ADDED') return fail(`add selection: ${added.status}`);
      const slipOpen = await flow.openBetSlip();
      if (slipOpen.status !== 'BET_SLIP_OPEN') return fail(`open slip: ${slipOpen.status}`);
      const entered = await flow.enterStake(bet.stake);
      if (entered.status !== 'STAKE_ENTERED') return fail(`enter stake: ${entered.status}`);
      const slip = await flow.readSlipPage();
      const expected = { home: bet.fixture.home, away: bet.fixture.away, market: bet.market, selection: bet.selection, stake: bet.stake, odds: identified.odds, week: round.number };
      const check = compareSlipToExpected({ slip, expected, minSecondsRemaining: 15 });
      if (!check.ok) {
        await captureEvidence(`slip-problem-${bet.key}`);
        return fail(`slip does not match: ${check.problems.join(', ')}`);
      }
      const placed = await flow.placeBet({ minSecondsRemaining: 15, onEvidence: async (label) => captureEvidence(`${bet.key}-${label}`) });
      if (placed.status === 'ACCEPTED_BY_SITE_TEXT') {
        try { await flow.dismissBetPlaced(); } catch (error) { /* the next bet clears the window */ }
        const closed = await flow.closeBetSlip();
        if (closed.status !== 'BET_SLIP_CLOSED') await resetSlipQuietly();
        return { status: 'PLACED', odds: identified.odds };
      }
      if (placed.status === 'REJECTED_BY_SITE_TEXT') return fail(`the site rejected the bet: ${(placed.evidence?.newLines ?? []).join(' | ').slice(0, 120)}`);
      if (placed.status === 'SUBMITTED_UNCONFIRMED') {
        await captureEvidence(`unconfirmed-${bet.key}`);
        return { status: 'UNCONFIRMED', reason: `after-place evidence saved in ${runDir ?? 'the run folder'}` };
      }
      return fail(`place bet: ${placed.status}`);   // nothing was clicked
    } catch (error) {
      await captureEvidence(`error-${bet.key}`);
      return fail(`error: ${error.message}`);
    }
  }

  async function readLiveResults(fixtures) {
    const text = await page.evaluate(() => document.body.innerText || '');
    const flat = squash(text);
    return fixtures.map(({ home, away }) => {
      const snap = parsePanelText(flat, home, away);
      return snap ? { home, away, score: { home: snap.home, away: snap.away }, finished: snap.finished, goals: snap.goals, minute: snap.minute } : null;
    });
  }

  return {
    ensureLiga, readUpcomingRound, readWinnerOdds, readTeamOdds, placeBet, captureEvidence, readLiveResults,
    readClock: () => readMatchClock(page),
    // The Results window, plus a targeted read of each wanted fixture for any row the table parse missed.
    readResultsWindow: async (fixtures = []) => {
      const page_ = await resultsReader.readResultsPage();
      const raw = page_.rawText ?? '';
      if (runDir) { try { fs.writeFileSync(path.join(runDir, 'results-window-latest.txt'), raw); } catch (error) { /* evidence only */ } }
      const have = new Set(page_.results.map((row) => `${row.fixture.home}-${row.fixture.away}`));
      for (const { home, away } of fixtures) {
        if (have.has(`${home}-${away}`)) continue;
        const hit = parseResultForFixture(raw, home, away);
        if (hit) page_.results.push({ fixture: { home, away }, status: 'FINISHED', halfTime: hit.halfTime, fullTime: hit.fullTime });
      }
      return page_;
    },
    // BetKing's own settled bets (My Bets): the site's HT and FT for the fixtures that were bet on.
    readMyBets: async (round, fixtures) => {
      const { text, found } = await readSettledBets(page, { targetUrl });
      if (runDir) { try { fs.writeFileSync(path.join(runDir, 'my-bets-latest.txt'), text); } catch (error) { /* evidence only */ } }
      return settledResultsFor(found, fixtures, round.number ?? null);
    },
  };
}

module.exports = { createLaLigaPorts, timerSeconds };
