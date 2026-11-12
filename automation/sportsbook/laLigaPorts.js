// The real BetKing side of the La Liga loop (see laLigaController.js for the loop itself). Each port reuses the
// page steps that were proven on the Premier League: open the market, identify the odd, add it, enter the stake,
// compare the slip with what was planned, click PLACE BET, and prove the bet by the site's text or the balance.

const fs = require('node:fs');
const path = require('node:path');
const reader = require('./laLigaReader');
const { readMatchClock, parsePanelText, parseResultForFixture, squash, createResultsModalReader, setResultsCaptureDirectory } = require('./betkingResultsModal');
const { readSettledBets, settledResultsFor } = require('./myBetsReader');
const { parseBalance, balanceDroppedBy } = require('./betkingMarketFlow');
const { readBoard } = require('./liveBoard');
const { compareSlipToExpected } = require('../strategy/marketFirstSequence');

// The site's error window (seen with a Free Bet on the slip): "Something Went Wrong ... unexpected error ... TRY AGAIN".
const SITE_ERROR_WINDOW = /something\s+went\s+wrong|unexpected\s+error|try\s+again|free\s*bet/i;

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

  // ---- RECOVERY when PLACE BET was clicked but the site's confirmation was never seen ------------------------------
  // Nothing is forgotten: the plan, the round and the record stay in the program. The page is reloaded and the WALLET
  // BALANCE decides, because the balance is what BetKing itself changes when a bet exists:
  //   balance fell by the stake  -> the bet exists: it counts as PLACED and the run carries on
  //   balance unchanged          -> the bet does not exist: it is placed again (once)
  //   anything else / unreadable -> unknown: the run stops (a second bet could cost real money)
  const waitOnline = async (maxMs) => {
    const until = Date.now() + maxMs;
    while (Date.now() < until) {
      if (await page.evaluate(() => navigator.onLine).catch(() => false)) return true;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  };

  async function recoverUnconfirmed({ bet, balanceBefore }) {
    if (balanceBefore === null || balanceBefore === undefined) return { status: 'AMBIGUOUS', why: 'the balance before the click was not read' };
    let why = 'the page could not be reloaded or the balance read';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      log(`  Recovery ${attempt}/3 for ${bet.key}: reloading the page now to check whether the bet exists (waits up to 10s only if the network is down).`);
      const online = await waitOnline(10000);
      if (!online) { why = 'the network stayed down for 10 seconds'; continue; }
      try {
        await page.goto(ligaUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('[data-testid="league-round"]', { timeout: 20000 }).catch(() => {});
        let balance = null;
        for (let look = 0; look < 12 && balance === null; look += 1) {   // up to about 3 seconds for the header balance to show
          balance = parseBalance(await page.evaluate(() => document.body.innerText || ''));
          if (balance === null) await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (balance === null) { why = 'the balance could not be read after the reload'; continue; }
        if (balanceDroppedBy(balanceBefore, balance, bet.stake)) return { status: 'PLACED', balance };
        if (Math.abs(balance - balanceBefore) < 0.005) return { status: 'NOT_PLACED', balance };
        return { status: 'AMBIGUOUS', why: `the balance moved from ${balanceBefore} to ${balance}, which is not the stake N${bet.stake}` };
      } catch (error) {
        why = `reload failed: ${error.message.split('\n')[0]}`;
        log(`  Recovery ${attempt}/3: ${why}`);
      }
    }
    return { status: 'AMBIGUOUS', why };
  }

  // Reload the La Liga page (after waiting up to 10 seconds for the network). Only the PAGE is reloaded: the plan, the
  // round, the stakes and the record all stay in the program, so the run carries on from where it stopped.
  async function reloadLiga() {
    const online = await waitOnline(10000);
    if (!online) log('  The network is still down after 10 seconds; reloading anyway.');
    await page.goto(ligaUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('[data-testid="league-round"]', { timeout: 20000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // Returns { status: 'PLACED', odds } | { status: 'FAILED', reason } | { status: 'UNCONFIRMED', reason }.
  async function placeBet({ bet, round, retried = false, reloads = 0 }) {
    const fixture = { roundName: round.name, home: bet.fixture.home, away: bet.fixture.away };
    const fail = async (reason) => { await resetSlipQuietly(); return { status: 'FAILED', reason }; };
    const secondsLeftNow = () => round.secondsLeft - (Date.now() - round.readAt) / 1000;
    let clicked = false;
    let odds = bet.odds;
    // The page got stuck BEFORE PLACE BET was clicked (slow page, slow network): reload and try this same bet again.
    const stuck = async (reason) => {
      const left = secondsLeftNow();
      if (reloads >= 2 || (Number.isFinite(left) && left < 25)) return fail(reason);
      log(`  ${bet.key}: stuck (${reason}). Nothing was clicked. Reloading the page and trying this bet again (${reloads + 1}/2).`);
      await resetSlipQuietly();
      await reloadLiga().catch((error) => log(`  Reload problem: ${error.message.split('\n')[0]}`));
      return placeBet({ bet, round, retried, reloads: reloads + 1 });
    };
    // PLACE BET was clicked but the confirmation was not seen: reload and let the balance decide.
    const afterUnclear = async (balanceBefore, extra = '') => {
      await captureEvidence(`unconfirmed-${bet.key}`);
      const recovery = await recoverUnconfirmed({ bet, balanceBefore });
      if (recovery.status === 'PLACED') {
        log(`  Recovered: after the reload the balance shows the ${bet.key} bet was taken (balance ${recovery.balance}). Counted as placed.`);
        await resetSlipQuietly();
        return { status: 'PLACED', odds };
      }
      if (recovery.status === 'NOT_PLACED') {
        if (retried) return fail('the bet was not taken, even on the second try');
        const left = secondsLeftNow();
        if (Number.isFinite(left) && left < 25) return fail('the bet was not taken and there is no time left to place it again');
        log(`  Recovered: the balance is unchanged (${recovery.balance}), so the ${bet.key} bet was NOT taken. Placing it again.`);
        return placeBet({ bet, round, retried: true, reloads });
      }
      log(`  Recovery could not decide whether the ${bet.key} bet exists: ${recovery.why}.`);
      return { status: 'UNCONFIRMED', reason: `after-place evidence saved in ${runDir ?? 'the run folder'}${extra}` };
    };
    let balanceBeforeClick = null;
    try {
      await ensureLiga();
      const opened = await flow.openMarketCategory(bet.category, fixture, { market: bet.market });
      if (opened.status !== 'MARKET_CATEGORY_OPENED') return stuck(`open ${bet.category}: ${opened.status}`);
      const identified = await flow.identifyMarketSelection(bet.selection, fixture);
      if (identified.status !== 'MARKET_SELECTION_IDENTIFIED') return stuck(`find ${bet.selection}: ${identified.status}`);
      odds = identified.odds;
      if (bet.odds > 1 && Math.abs(identified.odds - bet.odds) / bet.odds > maxOddsDrift) return fail(`odds moved from ${bet.odds} to ${identified.odds}`);
      const leftover = await flow.readSlipSummary();
      if (leftover.count > 0) await resetSlipQuietly();
      const added = await flow.selectOdd(bet.selection, { ...fixture }, identified.odds);
      if (added.status !== 'SELECTION_ADDED') return stuck(`add selection: ${added.status}`);
      const slipOpen = await flow.openBetSlip();
      if (slipOpen.status !== 'BET_SLIP_OPEN') return stuck(`open slip: ${slipOpen.status}`);
      const entered = await flow.enterStake(bet.stake);
      if (entered.status !== 'STAKE_ENTERED') return stuck(`enter stake: ${entered.status}`);
      const slip = await flow.readSlipPage();
      const expected = { home: bet.fixture.home, away: bet.fixture.away, market: bet.market, selection: bet.selection, stake: bet.stake, odds: identified.odds, week: round.number };
      const check = compareSlipToExpected({ slip, expected, minSecondsRemaining: 15 });
      if (!check.ok) {
        await captureEvidence(`slip-problem-${bet.key}`);
        return fail(`slip does not match: ${check.problems.join(', ')}`);
      }
      balanceBeforeClick = await page.evaluate(() => document.body.innerText || '').then(parseBalance).catch(() => null);
      clicked = true;   // from here on a failure may hide a bet that exists
      const placed = await flow.placeBet({ minSecondsRemaining: 15, onEvidence: async (label) => captureEvidence(`${bet.key}-${label}`) });
      if (placed.status === 'ACCEPTED_BY_SITE_TEXT') {
        try { await flow.dismissBetPlaced(); } catch (error) { /* the next bet clears the window */ }
        const closed = await flow.closeBetSlip();
        if (closed.status !== 'BET_SLIP_CLOSED') await resetSlipQuietly();
        await ensureLiga().catch(() => {});   // the confirmation sends the page back to the Premier League
        return { status: 'PLACED', odds: identified.odds };
      }
      if (placed.status === 'REJECTED_BY_SITE_TEXT') {
        const shown = (placed.evidence?.newLines ?? []).join(' | ').slice(0, 160);
        if (SITE_ERROR_WINDOW.test(shown)) {
          // The "Something Went Wrong ... TRY AGAIN" window: do not wait and do not press anything on it. Reload the
          // page at once, then the balance says whether the bet went through.
          log(`  The site showed an error window after PLACE BET (${shown.slice(0, 90)}). Reloading the page at once and checking the balance.`);
          return afterUnclear(placed.evidence?.balanceBefore ?? balanceBeforeClick, '. The site showed an error window.');
        }
        await reloadLiga().catch(() => {});   // clears any window the site left on the screen
        return fail(`the site rejected the bet: ${shown.slice(0, 120)}`);
      }
      if (placed.status === 'SUBMITTED_UNCONFIRMED') {
        return afterUnclear(placed.evidence?.balanceBefore ?? balanceBeforeClick, placed.evidence?.offlineSeen ? '. The page reported being OFFLINE while waiting (network problem).' : '');
      }
      return stuck(`place bet: ${placed.status}`);   // nothing was clicked
    } catch (error) {
      await captureEvidence(`error-${bet.key}`);
      if (clicked) return afterUnclear(balanceBeforeClick, `. The page failed after PLACE BET was clicked (${error.message.split('\n')[0]}).`);
      if (/log ?in/i.test(error.message)) return fail(`error: ${error.message}`);
      return stuck(`error: ${error.message.split('\n')[0]}`);
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
    ensureLiga, readUpcomingRound, readWinnerOdds, readTeamOdds, placeBet, captureEvidence, readLiveResults, reloadLiga,
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
