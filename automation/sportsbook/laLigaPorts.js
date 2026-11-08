// The real BetKing side of the La Liga loop (see laLigaController.js for the loop itself). Each port reuses the
// page steps that were proven on the Premier League: open the market, identify the odd, add it, enter the stake,
// compare the slip with what was planned, click PLACE BET, and prove the bet by the site's text or the balance.

const fs = require('node:fs');
const path = require('node:path');
const reader = require('./laLigaReader');
const { readMatchClock, parsePanelText, parseResultForFixture, squash, createResultsModalReader, setResultsCaptureDirectory } = require('./betkingResultsModal');
const { readSettledBets, settledResultsFor } = require('./myBetsReader');
const { parseBalance } = require('./betkingMarketFlow');
const { readBoard } = require('./liveBoard');
const { compareSlipToExpected } = require('../strategy/marketFirstSequence');

const timerSeconds = (text) => {
  const match = /(\d{1,2}):(\d{2})/.exec(text || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

function createLaLigaPorts({ page, flow, runDir, targetUrl, log = console.log, maxOddsDrift = 0.15 }) {
  let evidenceCount = 0;
  const resultsReader = createResultsModalReader({ page });
  if (runDir && typeof setResultsCaptureDirectory === 'function') setResultsCaptureDirectory(runDir);

  // The Kings Liga page has its own address: the same as the Kings League one with kings-liga at the end.
  const ligaUrl = /\/leagues\/[^/?#]+/.test(targetUrl || '')
    ? targetUrl.replace(/\/leagues\/[^/?#]+/, '/leagues/kings-liga')
    : `${new URL(targetUrl).origin}/en-ng/virtuals/scheduled/leagues/kings-liga`;

  async function captureEvidence(label) {
    evidenceCount += 1;
    if (!runDir) return;
    const base = path.join(runDir, `${String(evidenceCount).padStart(3, '0')}-${label}`);
    try {
      fs.writeFileSync(`${base}.txt`, await page.evaluate(() => document.body.innerText || ''));
      await page.screenshot({ path: `${base}.png` });
      // What each fixture row looks like right now (its text and the kinds of element inside it).
      const rows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="match"]')].slice(0, 12).map((element) => ({
        text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
        testids: [...new Set([...element.querySelectorAll('[data-testid]')].map((node) => node.getAttribute('data-testid')))],
      })));
      fs.writeFileSync(`${base}-rows.json`, JSON.stringify(rows, null, 2));
    } catch (error) { /* evidence only */ }
  }

  const onLiga = () => /kings-liga/i.test(page.url());

  // The orange La Liga tab must be the one showing. The page jumps back to the Premier League after a bet is
  // confirmed (and if anyone clicks another tab), so this is checked before every step that reads or bets.
  async function ensureLiga() {
    if (/login|sign-?in/i.test(page.url())) throw new Error('BetKing is asking you to log in. Log in in the browser window, then run again.');
    if (!onLiga()) {
      log('The page is not on La Liga: going back to the orange Kings Liga tab.');
      await page.goto(ligaUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('[data-testid="league-round"]', { timeout: 20000 }).catch(() => {});
    }
    let here = await reader.waitForLigaRound(page, { timeoutMs: 8000 });
    if (here.ok) return true;
    const switched = await reader.switchToLiga(page);
    if (switched.ok) here = await reader.waitForLigaRound(page, { timeoutMs: 15000 });
    if (!here.ok) {
      await captureEvidence('liga-not-found');
      throw new Error(`The Liga fixtures did not appear (${here.known} La Liga teams recognised). If BetKing shows a login screen, log in and run again.`);
    }
    return true;
  }

  async function readUpcomingRound() {
    if (!onLiga()) await ensureLiga();
    const rounds = await reader.readRounds(page);
    // only a round of La Liga fixtures counts (never the Premier League's)
    const ligaCodes = new Set(reader.LA_LIGA_CODES);
    const round = rounds.find((item) => item.matches.length >= 8 && item.matches.filter((match) => ligaCodes.has(match.home.toUpperCase()) || ligaCodes.has(match.away.toUpperCase())).length >= 8);
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
    await ensureLiga();
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
    await ensureLiga();
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
      await ensureLiga();
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
        await ensureLiga().catch(() => {});   // the confirmation sends the page back to the Premier League
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
    readBoard: () => readBoard(page),
    // the balance in the page header: it tells which account is logged in (shown on the panel while paused)
    readBalance: async () => parseBalance(await page.evaluate(() => document.body.innerText || '')),
    // Click the league tab (it reads LIVE during the matches): it brings the live view with all ten scores forward.
    showLive: async () => { await reader.switchToLiga(page); await page.waitForTimeout(800); },
    // Only the La Liga tab's own clock. Off La Liga there is no valid clock (the Premier League has its own).
    readClock: async () => {
      if (!onLiga()) return { offLiga: true, countdown: null, live: false };
      const tab = await reader.readLigaTab(page);
      if (!tab.found) return readMatchClock(page);
      return { offLiga: false, countdown: tab.countdown, live: tab.live };
    },
    // A short look at what the fixture rows say (for the log, so a live view that cannot be read is visible at once).
    sampleLive: async () => page.evaluate(() => [...document.querySelectorAll('[data-testid="match"]')].slice(0, 3).map((element) => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90)).join('  ||  ')),
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
