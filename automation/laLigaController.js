// The La Liga loop: read the round's odds, plan with the strategy, place the 6-0 winners (Barcelona, Real Madrid) and
// every protecting HT/FT option that reaches the minimum stake, watch the round with the league countdown, read the
// results, settle the strategy, and go round again until stopped.
//
// Everything that touches the website is behind `ports`, so the whole loop is tested with a fake site.

const { planRound, markPlacement, settleRound, discardRound, quashRound, createState } = require('./strategy/laLigaStrategy');
const { evaluatePlaced, teamsThatWon, resultsFromWindow, formatRoundReport, formatCarried, sessionLine } = require('./strategy/laLigaOutcome');
const { resultsFromBoard, createGoalLedger } = require('./sportsbook/liveBoard');
const { protectingSelection } = require('./sportsbook/laLigaReader');

const mmss = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.max(0, Math.round(seconds)) % 60).padStart(2, '0')}`;

function createLaLigaController({ ports, store, config = {}, log = console.log, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now, hooks = {} }) {
  const cfg = {
    allowRealMoney: false,
    baseStake: 10000,
    minStartSeconds: 70,        // a round with less time than this is left; the next one is used
    minSecondsToPlace: 20,      // stop placing when the round has less than this left
    matchSeconds: 30,
    liveIntervalMs: 400,
    kickoffWaitMs: 360000,
    resultsWaitMs: 150000,
    resultsPollMs: 5000,
    resultsFirstCheckMs: 20000,   // the Results window lists a round about 30 seconds after full time
    maxOddsDrift: 0.15,
    haltOnOpen: false,          // true: refuse to start over an unsettled round (the old behaviour)
    ...config,
  };
  let stopRequested = false;
  const session = { rounds: 0, staked: 0, returned: 0, roundsWithWin: 0 };
  // ---- controls: pause, continue, stop ---------------------------------------------------------------------------
  // A round that has bets placed is always finished and settled first, so these act BETWEEN rounds:
  //   pause()      after the round in hand, nothing new is placed until unpause()
  //   requestStop() after the round in hand, the run ends
  //   abort()      stop at once (a placed round stays open and is dealt with at the next start)
  let stopAfterRound = false;
  let paused = false;
  let pauseReported = false;
  let phase = 'starting';
  let currentRound = null;
  let lastReport = '';
  const setPhase = (value) => { phase = value; };
  const requestStop = () => { stopAfterRound = true; };
  const abortNow = () => { stopRequested = true; };
  const pause = () => { paused = true; };
  const unpause = () => { paused = false; };
  const stopping = () => stopRequested || stopAfterRound;
  const logReport = (text) => { lastReport = String(text).trim(); log(text); };

  async function holdIfPaused() {
    while (paused && !stopping()) {
      if (!pauseReported) {
        pauseReported = true;
        setPhase('paused');
        log('PAUSED between rounds. Nothing is placed until you press Continue.');
        await fire('onPaused', { state: store.state, session });
      }
      await sleep(500);
    }
    if (pauseReported) {
      pauseReported = false;
      if (!stopping()) {
        log('Continuing.');
        await fire('onResumed', { state: store.state });
      }
    }
  }

  function status() {
    const count = (map) => Object.values(map || {}).filter(Boolean).length;
    const state = stopRequested ? 'stopping now' : stopAfterRound ? 'stopping after this round' : paused ? (pauseReported ? 'paused' : 'pausing after this round') : 'running';
    const memory = store.state;
    return {
      state, phase, round: currentRound, session: { ...session }, lastReport,
      strategy: {
        winners: memory.winners, bases: memory.bases, teamsWithDeficit: count(memory.privateDef), bigDeficits: count(memory.bigDef),
        bank: memory.bank, roundsSettled: (memory.settledRounds || []).length, openRound: Boolean(memory.open),
      },
    };
  }
  // Optional things to do at big moments (a tone, a sync). A hook that fails never stops the run.
  async function fire(name, payload) {
    if (typeof hooks[name] !== 'function') return;
    try { await hooks[name](payload); } catch (error) { log(`  (${name} failed: ${error.message})`); }
  }

  // ---- 1. wait for a round with enough time ---------------------------------------------------
  async function waitForRound() {
    let lastLog = 0;
    for (;;) {
      if (stopping()) return null;
      await holdIfPaused();
      if (stopping()) return null;
      const round = await ports.readUpcomingRound();
      if (round && round.secondsLeft !== null && round.secondsLeft >= cfg.minStartSeconds) return round;
      if (now() - lastLog > 10000) {
        log(round && round.secondsLeft !== null
          ? `${round.name} starts in ${mmss(round.secondsLeft)}: too soon to place everything. Waiting for the next round.`
          : 'Waiting for the next round to open.');
        lastLog = now();
      }
      await sleep(1000);
    }
  }

  // ---- 2. the bets for this round -------------------------------------------------------------
  function buildBets(round, state, teams, winnerOdds) {
    const open = state.open;
    const bets = [];
    for (const code of state.winners) {
      const plan = open.winnerPlans[code];
      const fixture = round.matches.find((match) => match.home === code || match.away === code);
      if (!fixture || !plan.playable) continue;
      const side = fixture.home === code ? 'HOME' : 'AWAY';
      bets.push({ key: code, kind: 'winner', code, side, fixture, category: 'Correct Score', market: 'Correct Score', selection: side === 'HOME' ? '6-0' : '0-6', stake: plan.stake, odds: winnerOdds[code] });
    }
    const teamBets = [];
    for (const [code, option] of Object.entries(open.options)) {
      const team = teams[code];
      if (!team || !option.playable) continue;
      const [home, away] = team.fixture.split(' v ');
      teamBets.push({ key: code, kind: 'team', code, side: team.side, fixture: { home, away }, category: 'HT/FT', market: 'HT/FT', selection: protectingSelection(team.side), stake: option.stake, odds: team.odds });
    }
    teamBets.sort((a, b) => b.stake - a.stake);
    return [...bets, ...teamBets];
  }

  function printPlan(round, state, teams, bets) {
    const open = state.open;
    log(`\n=== ${round.name}  (starts in ${mmss(round.secondsLeft)}) ===`);
    log('WINNERS (6-0 correct score)');
    for (const code of state.winners) {
      const plan = open.winnerPlans[code];
      log(`  ${code}: odds ${plan.odds || 'not read'}  stake N${plan.stake}  ${plan.playable ? 'PLAY' : 'not played'}`);
    }
    log('PROTECTING (HT/FT: ahead at half-time, level at full time)');
    for (const [code, option] of Object.entries(open.options).sort((a, b) => b[1].stake - a[1].stake)) {
      log(`  ${code.padEnd(4)} ${teams[code] ? teams[code].selection : '?'}  odds ${String(option.odds).padStart(6)}  stake N${String(option.stake).padStart(5)}  ${option.playable ? 'PLAY' : 'below N10: not bet, carried'}`);
    }
    log(`Bets to place: ${bets.length}.`);
  }

  // ---- 3. placing ------------------------------------------------------------------------------
  async function placeAll(round, bets) {
    const placed = [];
    const notPlaced = [];
    let halted = null;
    for (let index = 0; index < bets.length; index += 1) {
      const bet = bets[index];
      if (stopRequested) { notPlaced.push(...bets.slice(index).map((item) => `${item.key} (stopped)`)); break; }
      if (bet.kind === 'team' && !placed.some((item) => item.kind === 'winner')) {
        // The protecting options only make sense with a winner behind them.
        notPlaced.push(...bets.slice(index).map((item) => `${item.key} (no winner placed)`));
        break;
      }
      const secondsLeft = round.secondsLeft - (now() - round.readAt) / 1000;
      if (secondsLeft < cfg.minSecondsToPlace) {
        notPlaced.push(...bets.slice(index).map((item) => `${item.key} (out of time)`));
        log(`Only ${Math.max(0, Math.round(secondsLeft))}s left: the remaining ${bets.length - index} option(s) are not placed.`);
        break;
      }
      const result = await ports.placeBet({ bet, round });
      if (result.status === 'PLACED') {
        placed.push({ ...bet, odds: result.odds ?? bet.odds });
        log(`  placed ${bet.key} ${bet.selection} N${bet.stake} @ ${result.odds ?? bet.odds}   (${Math.max(0, Math.round(round.secondsLeft - (now() - round.readAt) / 1000))}s left)`);
      } else if (result.status === 'UNCONFIRMED') {
        halted = { code: 'WAGER_UNCONFIRMED', key: bet.key, reason: result.reason };
        notPlaced.push(`${bet.key} (unconfirmed)`);
        break;
      } else {
        notPlaced.push(`${bet.key} (${result.reason})`);
        log(`  NOT placed ${bet.key}: ${result.reason}`);
      }
    }
    return { placed, notPlaced, halted };
  }

  // ---- 4. watching and results ----------------------------------------------------------------
  async function watch(round, placed) {
    const fixtures = [...new Map(placed.map((bet) => [`${bet.fixture.home}-${bet.fixture.away}`, bet.fixture])).values()];
    let kickoffAt = null;
    let sawCountdown = false;
    let lastLogAt = 0;
    const waitStarted = now();
    await ports.ensureLiga();
    log(`Watching ${round.name}: the La Liga countdown tells when the matches start.`);
    while (kickoffAt === null) {
      if (stopRequested) return { stopped: true };
      if (now() - waitStarted > cfg.kickoffWaitMs) return { failed: 'KICKOFF_NOT_SEEN' };
      const clock = await ports.readClock();
      if (clock && clock.offLiga) {
        log('The page left La Liga (the Premier League has its own clock): going back to the orange Kings Liga tab.');
        await ports.ensureLiga();
        await sleep(300);
        continue;
      }
      if (clock) {
        if (clock.countdown !== null) sawCountdown = true;
        if (clock.live || (sawCountdown && clock.countdown !== null && clock.countdown <= 0)) {
          kickoffAt = now();
          log('Kick-off! The countdown reached zero and the matches are on.');
        } else if (clock.countdown !== null && now() - lastLogAt > 10000) {
          log(`  Kick-off in ${mmss(clock.countdown)}.`);
          lastLogAt = now();
        }
      }
      if (kickoffAt === null) await sleep(300);
    }
    // After kick-off: stay for the whole match. All ten matches run together and are over at the same moment, when
    // the FT badge shows; every fixture's score and goal minutes are on the live list.
    let board = null;
    const ledger = createGoalLedger();   // learns which side scored each minute while the match is watched
    let fullTimeReads = 0;
    let reportedReadable = false;
    let triedLiveTab = false;
    let lastLiveLog = 0;
    let evidenceTaken = false;
    const hardStop = kickoffAt + cfg.matchSeconds * 1000 + 15000;
    let over = false;
    while (now() < hardStop && !stopRequested) {
      const raw = await ports.readBoard();
      const elapsed = now() - kickoffAt;
      // The page keeps showing the previous round's FT results until the new matches replace them: a board only
      // counts when it holds THIS round's fixtures (the same home-away pairs).
      const sameRound = round.matches.filter((match) => raw.fixtures.some((item) => item.home === match.home && item.away === match.away)).length >= Math.min(8, round.matches.length);
      const current = sameRound ? raw : { fixtures: [], fullTime: false, minute: null };
      if (current.fixtures.length > 0) { board = current; ledger.observe(current.fixtures); }
      if (!triedLiveTab && current.fixtures.length === 0 && elapsed > 2500 && ports.showLive) {
        // If the page is still showing the markets, the LIVE tab opens the live view with the ten scores.
        triedLiveTab = true;
        log('No scores on the page yet: clicking the LIVE tab to open the live view.');
        try { await ports.showLive(); } catch (error) { log(`  (could not click the LIVE tab: ${error.message})`); }
      }
      if (!reportedReadable && elapsed > 3000 + (triedLiveTab ? 2500 : 0)) {
        reportedReadable = true;
        log(current.fixtures.length > 0
          ? `Live scoreboard readable: ${current.fixtures.length} of ${round.matches.length} fixtures.`
          : 'The live scoreboard could not be read (no scores on the page). The Results window will be used.');
        if (current.fixtures.length === 0 && ports.sampleLive) {
          try { log(`  Page rows (sample): ${await ports.sampleLive()}`); } catch (error) { /* sample only */ }
        }
      }
      if (current.fixtures.length > 0 && now() - lastLiveLog > 8000) {
        lastLiveLog = now();
        log(`  Live${current.minute ? ` ${current.minute}'` : ''}: ${current.fixtures.map((item) => `${item.home} ${item.score.home}-${item.score.away} ${item.away}`).join(' | ')}`);
      }
      if (!evidenceTaken && elapsed > cfg.matchSeconds * 400 && ports.captureEvidence) {
        evidenceTaken = true;
        await ports.captureEvidence('live-mid-match');
      }
      fullTimeReads = current.fullTime ? fullTimeReads + 1 : 0;
      if (fullTimeReads >= 2 && elapsed >= cfg.matchSeconds * 800) {
        log(`FT is showing: all ${board ? board.fixtures.length : 0} matches are over.`);
        over = true;
        break;
      }
      const clock = await ports.readClock();
      if (clock && clock.offLiga) { await ports.ensureLiga(); await sleep(300); continue; }
      if (board && clock && !clock.live && clock.countdown !== null && elapsed >= cfg.matchSeconds * 900) {
        log('The league tab is back to a countdown: the matches are over (the last scoreboard is used).');
        over = true;
        break;
      }
      await sleep(cfg.liveIntervalMs);
    }
    if (ports.captureEvidence) await ports.captureEvidence('live-full-time');
    if (!over && board) log('The matches should be over by now; using the last scoreboard that was read.');
    return { live: board ? resultsFromBoard(board, ledger) : {} };
  }

  async function collectResults(round, placed, live, { allowMyBets = false, patient = true } = {}) {
    const fixtures = [...new Map(placed.map((bet) => [`${bet.fixture.home}-${bet.fixture.away}`, bet.fixture])).values()];
    const needs = (results) => placed.every((bet) => {
      const result = results[`${bet.fixture.home}-${bet.fixture.away}`];
      return result && result.ft && (bet.kind === 'winner' || result.ht);
    });
    let results = { ...live };
    if (needs(results)) { log('Both halves of every bet were proven live. Using the live results now.'); return { results, source: 'LIVE' }; }
    log(allowMyBets
      ? 'Reading the Results window, then BetKing\'s own settled bets...'
      : `The live view did not prove every bet, so the Results window is used. It lists the round about 30 seconds after full time: first look in ${Math.round(cfg.resultsFirstCheckMs / 1000)}s. The page is not left.`);
    if (patient && !allowMyBets) await sleep(cfg.resultsFirstCheckMs);
    const started = now();
    let attempt = 0;
    while (now() - started < cfg.resultsWaitMs && !stopRequested) {
      attempt += 1;
      try {
        const page = await ports.readResultsWindow(fixtures);
        const fromWindow = resultsFromWindow(page);
        if (Object.keys(fromWindow).length > 0) results = { ...results, ...fromWindow };
        if (needs(results)) { log(`Results window read (check ${attempt}).`); return { results, source: 'RESULTS_WINDOW' }; }
        log(`Results window check ${attempt}: ${Object.keys(fromWindow).length} fixture(s) listed, ${placed.filter((bet) => !results[`${bet.fixture.home}-${bet.fixture.away}`]).length} bet(s) still without a result.`);
      } catch (error) {
        log(`Results window check ${attempt} failed: ${error.message}`);
      }
      if (allowMyBets && attempt >= 2 && typeof ports.readMyBets === 'function') {
        try {
          const fromMyBets = await ports.readMyBets(round, fixtures);
          if (Object.keys(fromMyBets).length > 0) results = { ...results, ...fromMyBets };
          if (needs(results)) { log(`BetKing's settled bets (My Bets) gave every result (check ${attempt}).`); return { results, source: 'MY_BETS' }; }
          log(`My Bets check: ${Object.keys(fromMyBets).length} of ${fixtures.length} fixture(s) settled so far.`);
        } catch (error) {
          log(`My Bets check failed: ${error.message}`);
        }
      }
      await sleep(cfg.resultsPollMs);
    }
    return { results, source: 'INCOMPLETE' };
  }

  // ---- 5. one round ---------------------------------------------------------------------------
  async function playRound() {
    setPhase('waiting for the next round');
    await holdIfPaused();
    if (stopping()) return { status: 'STOPPED' };
    await ports.ensureLiga();
    const round = await waitForRound();
    if (!round) return { status: 'STOPPED' };
    currentRound = { name: round.name, number: round.number };
    setPhase('reading the odds');
    round.readAt = round.readAt ?? now();
    const winnerOdds = await ports.readWinnerOdds(round, store.state.winners);
    const { teams, missing } = await ports.readTeamOdds(round);
    if (missing.length) log(`Could not read: ${missing.join(', ')} (those teams are not planned this round).`);

    store.state = planRound(store.state, {
      roundId: `${round.name}@${new Date(now()).toISOString()}`,
      winnerOdds,
      teamOdds: Object.fromEntries(Object.entries(teams).map(([code, team]) => [code, team.odds])),
    });
    const bets = buildBets(round, store.state, teams, winnerOdds);
    printPlan(round, store.state, teams, bets);
    store.save();

    if (!cfg.allowRealMoney) {
      store.state = discardRound(store.state);
      store.save();
      log('\nDRY RUN: nothing was placed (set AUTOMATION_ALLOW_REAL_MONEY=yes to bet for real).');
      return { status: 'DRY_RUN' };
    }
    if (!bets.some((bet) => bet.kind === 'winner')) {
      store.state = discardRound(store.state);
      store.save();
      log('No winner bet can be placed this round (odds not read). Skipping the round.');
      return { status: 'SKIPPED' };
    }

    setPhase('placing bets');
    log('\nPlacing:');
    const { placed, notPlaced, halted } = await placeAll(round, bets);
    const placedWinners = placed.filter((bet) => bet.kind === 'winner').map((bet) => bet.code);
    if (halted) {
      store.state = markPlacement(store.state, { placedWinners, placed });
      store.save();
      return { status: 'HALTED', code: halted.code, reason: `The ${halted.key} bet was clicked but the site's confirmation could not be read, so a bet may exist without confirmation. Check My Bets. ${halted.reason ?? ''}`.trim() };
    }
    if (placedWinners.length === 0) {
      store.state = discardRound(store.state);
      store.save();
      log('No winner bet could be placed in time. The round is left unplayed and not settled.');
      return { status: 'SKIPPED' };
    }
    store.state = markPlacement(store.state, { placedWinners, placed, round: { name: round.name, number: round.number, matches: round.matches } });
    store.save();

    setPhase('watching the matches');
    const watched = await watch(round, placed);
    if (watched.stopped) return { status: 'STOPPED', note: 'Stopped while watching; the round stays open (bets are placed).' };
    if (watched.failed) return { status: 'HALTED', code: watched.failed, reason: 'The league countdown never reached zero. Bets are placed; check My Bets.' };
    setPhase('reading the results');
    const { results, source } = await collectResults(round, placed, watched.live);
    const evaluation = evaluatePlaced(placed, results);
    if (evaluation.unresolved.length > 0) {
      return { status: 'HALTED', code: 'RESULTS_UNAVAILABLE', reason: `No result for: ${evaluation.unresolved.join(', ')}. The round stays open. Run  node laliga-run.js --resume  to read it from BetKing's settled bets, or settle by hand with  node settle-laliga.js --winners <BAR/RMA if a 6-0 came in or none> --teams <teams that won>` };
    }

    const allWon = teamsThatWon(teams, results);
    const wonNotPlaced = allWon.filter((code) => !placed.some((bet) => bet.code === code && bet.kind === 'team'));
    const readAll = round.matches.every((match) => results[`${match.home}-${match.away}`]);
    if (evaluation.winnersHit.length > 0) await fire('onSixNil', { winners: evaluation.winnersHit, rows: evaluation.rows.filter((row) => row.kind === 'winner' && row.won), round });
    logReport(`\n${formatRoundReport({ round, plan: store.state.open, placed, evaluation, results, teams, notPlaced, wonNotPlaced })}  [source: ${source}]${readAll ? '' : '\n  (some fixtures without a bet could not be read, so "won but not placed" may be incomplete)'}`);

    // The bet placed for an option is its normal stake PLUS its big stake in one ticket, so when it wins both are repaid.
    const bigWinners = evaluation.teamWinners.filter((code) => ((store.state.open.bigStakes || {})[code] || 0) > 0);
    store.state = settleRound(store.state, { winnersHit: evaluation.winnersHit, teamWinners: evaluation.teamWinners, bigWinners });
    store.save();
    session.rounds += 1;
    session.staked += evaluation.staked;
    session.returned += evaluation.returned;
    if (evaluation.winnersHit.length || evaluation.teamWinners.length) session.roundsWithWin += 1;
    log(`${round.name} settled and saved.`);
    log(formatCarried(store.state));
    await fire('onSettled', { state: store.state, sixNil: evaluation.winnersHit.length > 0, round, evaluation });
    log(sessionLine(session));
    setPhase('round settled; waiting for the next one');
    currentRound = null;
    return { status: 'SETTLED' };
  }

  // Settle a round that was placed but never settled (the run stopped, or results could not be read at the time):
  // the results are read from the Results window and BetKing's settled bets, then the strategy is settled.
  async function resume() {
    const open = store.state.open;
    if (!open || !Array.isArray(open.placed) || open.placed.length === 0) {
      return { status: 'HALTED', code: 'NOTHING_TO_RESUME', reason: 'There is no round with placed bets waiting to be settled.' };
    }
    await ports.ensureLiga();
    const placed = open.placed;
    const fixtures = [...new Map(placed.map((bet) => [`${bet.fixture.home}-${bet.fixture.away}`, bet.fixture])).values()];
    const round = open.round ?? { name: String(open.roundId).split('@')[0], number: Number((/\d+/.exec(open.roundId) || [])[0]) || null, matches: fixtures };
    log(`Resuming ${round.name}: ${placed.length} placed bet(s) waiting for their result.`);
    const { results, source } = await collectResults(round, placed, {}, { allowMyBets: true, patient: false });
    const evaluation = evaluatePlaced(placed, results);
    if (evaluation.unresolved.length > 0) {
      return { status: 'HALTED', code: 'RESULTS_UNAVAILABLE', reason: `Still no result for: ${evaluation.unresolved.join(', ')}. Read them in My Bets and use settle-laliga.js.` };
    }
    if (evaluation.winnersHit.length > 0) await fire('onSixNil', { winners: evaluation.winnersHit, rows: evaluation.rows.filter((row) => row.kind === 'winner' && row.won), round });
    logReport(`\n${formatRoundReport({ round, placed, evaluation, results, teams: {}, notPlaced: [], wonNotPlaced: [] })}  [source: ${source}]`);
    // The bet placed for an option is its normal stake PLUS its big stake in one ticket, so when it wins both are repaid.
    const bigWinners = evaluation.teamWinners.filter((code) => ((store.state.open.bigStakes || {})[code] || 0) > 0);
    store.state = settleRound(store.state, { winnersHit: evaluation.winnersHit, teamWinners: evaluation.teamWinners, bigWinners });
    store.save();
    session.rounds += 1;
    session.staked += evaluation.staked;
    session.returned += evaluation.returned;
    if (evaluation.winnersHit.length || evaluation.teamWinners.length) session.roundsWithWin += 1;
    log(`${round.name} settled and saved.`);
    log(formatCarried(store.state));
    await fire('onSettled', { state: store.state, sixNil: evaluation.winnersHit.length > 0, round, evaluation });
    log(sessionLine(session));
    return { status: 'SETTLED', session };
  }

  // ---- 6. forever ------------------------------------------------------------------------------
  async function run({ forever = false, maxRounds = 1, resumeOpen = false, resumeIfOpen = false } = {}) {
    // resumeIfOpen: if a round with placed bets was left unsettled (a crash, a power cut), read its result and settle
    // it first, then carry on; with nothing left open it just carries on. (resumeOpen is the same but must find one.)
    if (resumeIfOpen && store.state.open && Array.isArray(store.state.open.placed) && store.state.open.placed.length > 0) {
      const resumed = await resume();
      if (resumed.status !== 'SETTLED') return resumed;
    }
    if (resumeOpen) {
      const resumed = await resume();
      if (resumed.status !== 'SETTLED') return resumed;
    }
    if (store.state.open && !cfg.haltOnOpen) {
      const open = store.state.open;
      const placed = open.placed ?? [];
      log(`A previous round (${open.roundId}) was never settled${placed.length ? `; ${placed.length} bet(s) had been placed on it: ${placed.map((bet) => `${bet.key} ${bet.selection} N${bet.stake}`).join(', ')}` : ''}. It is set aside now and the strategy carries on as if it had not been played. Any bets that were placed stay on BetKing and are not counted.`);
      store.state = quashRound(store.state);
      store.save();
    }
    if (store.state.open) {
      return { status: 'HALTED', code: 'ROUND_LEFT_OPEN', reason: `A previous round (${store.state.open.roundId}) was never settled. Check My Bets and settle it with settle-laliga.js (or --discard-open if nothing was placed).` };
    }
    for (let count = 0; forever || count < maxRounds; count += 1) {
      if (stopping()) break;
      const outcome = await playRound();
      if (outcome.status === 'HALTED' || outcome.status === 'STOPPED' || outcome.status === 'DRY_RUN') return { ...outcome, session };
    }
    setPhase('stopped');
    log(`Stopped as you asked. ${sessionLine(session)}`);
    return { status: 'STOPPED', session };
  }

  return Object.freeze({ run, playRound, resume, stop: requestStop, abort: abortNow, pause, unpause, status, session });
}

function createMemoryStore(initial) {
  return { state: initial ?? createState({ baseStake: 10000 }), save() {}, reload() {} };
}

module.exports = { createLaLigaController, createMemoryStore };
