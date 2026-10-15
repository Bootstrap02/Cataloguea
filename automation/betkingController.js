// Controller for the REAL BetKing run: one controlled lifecycle per game week.
//
//   open BetKing (visible, persistent profile) -> manual sign-in if needed ->
//   select week -> identify Liverpool fixture -> read strategy -> stakes, merge,
//   filter, mappings -> prepare instructions (optionally populate the bet slip,
//   never submit) -> human review -> watch the match -> verified half-time and
//   full-time result -> settle the strategy once -> next week.
//
// It never uses the simulation, never invents data, and never loops without a
// bound (maxWeeks). It does NOT place or submit wagers.

const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { StateMachine, STATES } = require('./stateMachine');
const { BETKING_STATUSES } = require('./sportsbook/betkingAdapter');
const { RunStore } = require('./persistence/runStore');
const { createRunJournal } = require('./betkingRunJournal');
const { createBetKingPorts } = require('./sportsbook/betkingPorts');
const { createStrategyBridge } = require('./strategy/strategyBridge');
const { createOperationalWorkflow, evaluateOptionsForResult } = require('./strategy/operationalWorkflow');
const { settlePlannedFixture, createOperationId, SETTLEMENT_STATUS } = require('./strategy/settlementIntegration');
const { createLiveResultObserver, verifyResultsPageResult } = require('./result/liveResultObserver');
const { createResultPoller } = require('./strategy/resultPoller');
const { createBetKingFixtureIdentity } = require('./strategy/fixtureIdentity');
const { renderPlanMarkdown } = require('./betkingReport');

async function defaultLaunchContext(config) {
  const { chromium } = require('playwright');
  return chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    channel: config.browserChannel,
    timeout: config.browserLaunchTimeoutMs,
    viewport: { width: 1280, height: 800 },
  });
}

async function defaultPrompt(question) {
  const readline = require('node:readline/promises');
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await terminal.question(question);
  } finally {
    terminal.close();
  }
}

// The live observer compares the short id ('LIV-COV') and, when both sides have it,
// the full DOM id ('matchup-statistics-button-LIV-COV').
function toObserverFixtureIds(fixtureId) {
  const raw = String(fixtureId ?? '');
  const match = /^matchup-statistics-button-(.+)$/i.exec(raw);
  return match ? { id: match[1], domId: raw } : { id: raw, domId: undefined };
}

const sleepFor = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const isStop = (answer) => /^\s*stop\s*$/i.test(String(answer ?? ''));

function createBetKingController({
  config,
  selectors,
  mappings = {},
  launchContext = defaultLaunchContext,
  prompt = defaultPrompt,
  sleep = sleepFor,
  log = (message) => console.log(message),
} = {}) {
  if (!config || config.mode !== 'betking-live') {
    throw new Error('A betking-live configuration is required; the simulation is never a substitute.');
  }

  // prompts=false (default): after you sign in the run takes over by itself.
  // prompts=true: asks for Enter at the human checkpoints.
  async function run({ requiredWeek, maxWeeks = 1, prompts = false } = {}) {
    const runId = randomUUID();
    const journal = createRunJournal({ dir: config.runsDir, runId });
    const runStore = new RunStore({ filePath: path.join(journal.runDir, 'run-store.json') });
    const machine = new StateMachine((transition) => {
      journal.append('TRANSITION', transition);
      runStore.recordTransition(runId, transition).catch((error) => {
        journal.append('RUN_STORE_ERROR', { message: error.message });
      });
    });

    let stopRequested = false;
    const onInterrupt = () => {
      stopRequested = true;
      log('Stop requested; finishing the current step safely.');
    };
    process.on('SIGINT', onInterrupt);

    let context = null;
    let betKingPage = null;
    let strategyPage = null;
    let ports = null;
    let bridge = null;
    let workflow = null;

    function moveTo(state) {
      if (machine.getState() === state) return;
      try {
        machine.transition(state);
      } catch (error) {
        journal.append('TRANSITION_REFUSED', { to: state, from: machine.getState(), message: error.message });
      }
    }

    function finish(status, extra = {}) {
      const summary = { status, state: machine.getState(), ...extra };
      journal.setSummary(summary);
      log(`Run ${runId}: ${status}${extra.code ? ` (${extra.code})` : ''}. Journal: ${journal.runDir}`);
      return { runId, runDir: journal.runDir, ...summary };
    }

    function rebuildPorts() {
      ports = createBetKingPorts({ page: betKingPage, config, selectors });
      workflow = createOperationalWorkflow({
        stateMachine: machine,
        ports: {
          readSchedule: () => ports.readSchedule(),
          readVisibleWeek: () => ports.readVisibleWeek(),
          selectWeek: (week) => ports.selectWeek(week),
          getStrategyInstructions: () => bridge.getInstructions(),
          onCheckpoint: (checkpoint) => journal.append('CHECKPOINT', checkpoint),
        },
      });
    }

    async function gotoBetKing() {
      await betKingPage.goto(config.targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: Math.max(config.navigationTimeoutMs, 30000),
      });
      try {
        await betKingPage.waitForSelector('[data-testid="league-round"]', { timeout: config.pageTimeoutMs * 2 });
      } catch (error) {
        // Not fatal: page classification reports what is actually visible.
      }
    }

    async function waitForStrategyHook() {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const present = await strategyPage.evaluate(() => Boolean(window.catalogueaAutomation));
        if (present) return true;
        await sleep(500);
      }
      return false;
    }

    async function recoverBetKingPage() {
      if (betKingPage.isClosed()) {
        betKingPage = await context.newPage();
        rebuildPorts();
        await gotoBetKing();
      } else {
        try {
          await betKingPage.title();
        } catch (error) {
          await gotoBetKing();
        }
      }
      try {
        await ports.openLive();
      } catch (error) {
        journal.append('LIVE_NAVIGATION_FAILED', { message: error.message });
      }
    }

    // Autonomous sign-in: polls the real page until the schedule is accessible.
    async function waitForLogin() {
      log('Waiting for you to sign in to BetKing in the open browser window; the run continues by itself afterwards.');
      journal.append('WAITING_FOR_LOGIN', {});
      const deadline = Date.now() + config.loginWaitTimeoutMs;
      while (Date.now() < deadline) {
        if (stopRequested) return false;
        await sleep(config.pollIntervalMs);
        try {
          const result = await ports.readSchedule();
          const status = result?.status;
          if (status && status !== BETKING_STATUSES.AUTH_REQUIRED && status !== BETKING_STATUSES.PAGE_UNAVAILABLE) {
            journal.append('LOGIN_DETECTED', { status });
            return true;
          }
        } catch (error) {
          // The page may be navigating right after sign-in; keep waiting.
        }
      }
      return false;
    }

    // Autonomous strategy wait: polls the Cataloguea tab until a fixture is submitted.
    async function waitForStrategyFixture() {
      log('Waiting for a Liverpool fixture to be submitted in the Cataloguea tab; the run continues by itself afterwards.');
      journal.append('WAITING_FOR_STRATEGY_FIXTURE', {});
      const deadline = Date.now() + config.strategyWaitTimeoutMs;
      while (Date.now() < deadline) {
        if (stopRequested) return false;
        await sleep(config.pollIntervalMs);
        try {
          const instructions = await bridge.getInstructions();
          if (instructions && instructions.status === 'OK') return true;
        } catch (error) {
          // The fixture may not be selectable yet; keep waiting.
        }
      }
      return false;
    }

    async function prepareWithRecovery(week) {
      let retries = 0;
      let manualAttempts = 0;
      let autoWaits = 0;
      for (;;) {
        if (stopRequested) return { status: 'STOPPED' };
        const prep = await workflow.prepareWeek({ requiredWeek: week });
        if (prep.status === 'PREPARED') return prep;

        journal.append('PREPARE_FAILED', { code: prep.code, step: prep.step, details: prep.details });
        log(`Week ${week}: ${prep.code} at ${prep.step}. ${prep.policy.description}`);

        const needsLogin = ['AUTHENTICATION_REQUIRED', 'SESSION_EXPIRED'].includes(prep.code);
        if (!prompts && autoWaits < config.manualLoginMaxAttempts
          && (needsLogin || prep.code === 'STRATEGY_STATE_MISSING')) {
          autoWaits += 1;
          const ready = needsLogin ? await waitForLogin() : await waitForStrategyFixture();
          if (stopRequested) return { status: 'STOPPED' };
          if (ready) continue;
          return prep;
        }

        const needsHuman = ['AUTHENTICATION_REQUIRED', 'SESSION_EXPIRED', 'STRATEGY_STATE_MISSING'].includes(prep.code);
        if (needsHuman && prompts && manualAttempts < config.manualLoginMaxAttempts) {
          manualAttempts += 1;
          const which = prep.code === 'STRATEGY_STATE_MISSING' ? strategyPage : betKingPage;
          await which.bringToFront();
          const answer = await prompt(
            prep.code === 'STRATEGY_STATE_MISSING'
              ? 'In the Cataloguea tab, select and submit the Liverpool fixture, then press Enter (or type stop): '
              : 'Sign in manually in the BetKing tab (no credentials are requested here), then press Enter (or type stop): ',
          );
          if (isStop(answer)) return { status: 'STOPPED' };
          if (prep.code !== 'STRATEGY_STATE_MISSING') await gotoBetKing();
          continue;
        }
        if (['RETRY', 'WAIT'].includes(prep.policy.action) && retries < config.recoveryMaxAttempts) {
          retries += 1;
          await sleep(Math.max(config.recoveryBaseDelayMs, 1000) * (2 ** (retries - 1)));
          continue;
        }
        return prep;
      }
    }

    async function enrichPlan(prep) {
      const { plan, identification } = prep;
      const confirmed = [];
      const downgraded = [];
      for (const record of plan.instructions) {
        let check;
        try {
          check = await ports.verifySelection({
            roundName: identification.roundName,
            home: plan.fixture.home,
            away: plan.fixture.away,
            market: record.betKingMarket,
            selection: record.betKingSelection,
          });
        } catch (error) {
          check = { status: 'READ_FAILED', reason: error.message };
        }
        if (check.status === 'SELECTION_AVAILABLE') {
          record.betKingOdds = check.odds;
          record.oddsSource = 'BETKING';
          record.oddsStatus = 'READ_FROM_BETKING';
          record.verificationStatus = 'SELECTION_VISIBLE_ON_PAGE';
          confirmed.push(record);
        } else {
          record.eligibilityStatus = 'UNRESOLVED_MARKET';
          record.verificationStatus = 'SELECTION_NOT_CONFIRMED';
          record.lifecycle.marketResolved = false;
          record.reason = `The mapped selection could not be confirmed on the page (${check.status}).`;
          downgraded.push(record);
        }
      }
      plan.instructions = confirmed;
      plan.unresolved = [...plan.unresolved, ...downgraded];

      if (config.populateBetSlip) {
        for (const record of plan.instructions) {
          let outcome;
          try {
            outcome = await ports.populateBetSlip({
              roundName: identification.roundName,
              home: plan.fixture.home,
              away: plan.fixture.away,
              market: record.betKingMarket,
              selection: record.betKingSelection,
              stake: record.stake,
            });
          } catch (error) {
            outcome = { status: 'BET_SLIP_FAILED', reason: error.message };
          }
          record.betSlipStatus = outcome.status;
          const entered = outcome.status === 'BET_SLIP_STAKE_ENTERED';
          record.lifecycle.selectionPrepared = entered;
          record.lifecycle.betSlipVerified = entered;
          journal.append('BET_SLIP', { strategyKey: record.strategyKey, status: outcome.status });
        }
      }
      return prep;
    }

    async function crossCheckWithResultsPage(liveResult) {
      if (!selectors.configured.results) return { status: 'NOT_CONFIGURED' };
      for (let attempt = 1; attempt <= config.resultsCrossCheckAttempts; attempt += 1) {
        if (stopRequested) return { status: 'STOPPED' };
        let page;
        try {
          page = await ports.readResultsPage();
        } catch (error) {
          journal.append('RESULTS_READ_FAILED', { attempt, message: error.message });
          page = null;
        }
        if (page) {
          const verdict = verifyResultsPageResult(liveResult, page);
          if (verdict.status === 'verified') return { status: 'CONFIRMED', verdict };
          if (verdict.status === 'RESULTS_MISMATCH' || verdict.status === 'RESULTS_AMBIGUOUS') {
            return { status: 'CONFLICT', verdict };
          }
        }
        if (attempt < config.resultsCrossCheckAttempts) await sleep(config.resultsIntervalMs);
      }
      return { status: 'UNCONFIRMED' };
    }

    async function observeLive(prep) {
      if (!selectors.configured.live) return { status: 'NOT_CONFIGURED' };
      const { identification } = prep;
      const observer = createLiveResultObserver({
        ...toObserverFixtureIds(identification.fixture.fixtureId),
        home: identification.fixture.home,
        away: identification.fixture.away,
        roundId: identification.roundId || identification.roundName,
        roundName: identification.roundName,
      });
      try {
        await ports.openLive();
      } catch (error) {
        journal.append('LIVE_NAVIGATION_FAILED', { message: error.message });
      }
      const deadline = Date.now() + config.matchWaitTimeoutMs;
      let consecutiveErrors = 0;
      let lastStatus = null;
      while (Date.now() < deadline) {
        if (stopRequested) return { status: 'STOPPED' };
        let snapshot;
        try {
          snapshot = await ports.readLiveSnapshot();
          if (consecutiveErrors > 0) {
            consecutiveErrors = 0;
            moveTo(STATES.WAITING_FOR_RESULT);
          }
        } catch (error) {
          consecutiveErrors += 1;
          journal.append('LIVE_READ_FAILED', { attempt: consecutiveErrors, code: error.code ?? null, message: error.message });
          moveTo(STATES.RECOVERING);
          if (consecutiveErrors > config.recoveryMaxAttempts) {
            return { status: 'UNAVAILABLE', reason: 'LIVE_READ_FAILED', message: error.message };
          }
          try {
            await recoverBetKingPage();
          } catch (recoveryError) {
            return { status: 'UNAVAILABLE', reason: 'BROWSER_CRASH', message: recoveryError.message };
          }
          await sleep(Math.max(config.recoveryBaseDelayMs, 1000) * (2 ** (consecutiveErrors - 1)));
          continue;
        }
        const observation = observer.observe(snapshot);
        if (observation.status !== lastStatus) {
          lastStatus = observation.status;
          journal.append('LIVE_OBSERVATION', {
            status: observation.status,
            phase: observation.phase ?? null,
            clock: observation.clock ?? null,
            homeScore: observation.homeScore ?? null,
            awayScore: observation.awayScore ?? null,
            halfTime: observation.halfTime ?? null,
          });
        }
        if (observation.status === 'CONFLICTING_RESULT') return { status: 'CONFLICT', observation };
        if (observation.verified && !observation.duplicate) return { status: 'VERIFIED', observation };
        await sleep(config.liveIntervalMs);
      }
      return { status: 'TIMEOUT' };
    }

    async function pollResultsOnly(prep, operationId) {
      if (!selectors.configured.results) return { status: 'NOT_CONFIGURED' };
      const scheduled = createBetKingFixtureIdentity(
        { ...prep.plan.fixture, market: '' },
        { roundName: prep.identification.roundName, roundId: prep.identification.roundId },
      );
      const poller = createResultPoller({
        readResultsPage: () => ports.readResultsPage(),
        getExpectedFixture: () => ({ scheduled, live: null, results: null }),
        getActionOperationId: () => operationId,
        config: {
          minConfidence: 'MEDIUM',
          initialDelayMs: config.resultsInitialDelayMs,
          intervalMs: config.resultsIntervalMs,
          maxAttempts: config.resultsMaxAttempts,
        },
      });
      const outcome = await poller.startPolling({
        onProgress: (progress) => journal.append('RESULTS_POLL', { status: progress.status, attempt: progress.attempt }),
      });
      return outcome.status === 'verified'
        ? { status: 'VERIFIED', result: outcome.result }
        : { status: 'UNAVAILABLE', outcome };
    }

    // Returns { status: 'VERIFIED', verifiedResult, source, verifiedBy } or a failure.
    async function obtainVerifiedResult(prep, operationId) {
      const live = await observeLive(prep);
      journal.append('LIVE_OUTCOME', { status: live.status });
      if (live.status === 'STOPPED') return { status: 'STOPPED' };
      if (live.status === 'CONFLICT') return { status: 'CONFLICT', reason: 'Conflicting live results.' };

      if (live.status === 'VERIFIED') {
        const check = await crossCheckWithResultsPage(live.observation);
        journal.append('RESULTS_CROSSCHECK', { status: check.status });
        if (check.status === 'STOPPED') return { status: 'STOPPED' };
        if (check.status === 'CONFLICT') {
          return { status: 'CONFLICT', reason: 'The Results page disagrees with the live result.' };
        }
        if (check.status === 'CONFIRMED') {
          return {
            status: 'VERIFIED',
            verifiedResult: {
              status: 'verified',
              halfTime: check.verdict.halfTime,
              fullTime: check.verdict.fullTime,
            },
            source: check.verdict.source,
            verifiedBy: 'LIVE_PLUS_RESULTS_PAGE',
            timestamp: check.verdict.timestamp,
          };
        }
        return {
          status: 'VERIFIED',
          verifiedResult: {
            status: 'verified',
            halfTime: live.observation.halfTime,
            fullTime: live.observation.fullTime,
          },
          source: live.observation.source,
          verifiedBy: 'LIVE_ONLY',
          timestamp: live.observation.timestamp,
        };
      }

      const polled = await pollResultsOnly(prep, operationId);
      journal.append('RESULTS_ONLY_OUTCOME', { status: polled.status });
      if (polled.status === 'VERIFIED') {
        return {
          status: 'VERIFIED',
          verifiedResult: polled.result,
          source: polled.result.source,
          verifiedBy: 'RESULTS_PAGE_ONLY',
          timestamp: polled.result.timestamp,
        };
      }
      return {
        status: 'UNAVAILABLE',
        code: 'FULLTIME_RESULT_UNAVAILABLE',
        reason: `Live: ${live.status}; results polling: ${polled.status}.`,
      };
    }

    try {
      // ---- launch ---------------------------------------------------------
      context = await launchContext(config);
      betKingPage = context.pages()[0] || await context.newPage();
      strategyPage = await context.newPage();

      try {
        await strategyPage.goto(config.catalogueaUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (error) {
        return finish('FAILED', {
          code: 'STRATEGY_APP_UNREACHABLE',
          message: `Cataloguea is not reachable at ${config.catalogueaUrl}. Start it with "npm start" and retry.`,
        });
      }
      if (!(await waitForStrategyHook())) {
        return finish('FAILED', {
          code: 'STRATEGY_HOOK_MISSING',
          message: 'window.catalogueaAutomation is missing. The strategy app must run as a development build (npm start).',
        });
      }
      bridge = createStrategyBridge({ page: strategyPage, betKingMarketMappings: mappings });
      rebuildPorts();

      moveTo(STATES.INITIALIZING);
      try {
        await gotoBetKing();
      } catch (error) {
        journal.append('OPEN_BETKING_FAILED', { message: error.message });
      }

      await betKingPage.bringToFront();
      if (prompts) {
        await strategyPage.bringToFront();
        const answer = await prompt(
          'Two tabs are open: BetKing and Cataloguea. Sign in to BetKing if needed and make sure the Cataloguea tab shows your strategy with the Liverpool fixture submitted. Press Enter to start (or type stop): ',
        );
        if (isStop(answer)) {
          moveTo(STATES.STOPPED);
          return finish('STOPPED');
        }
      }

      // ---- one controlled lifecycle per week -----------------------------------
      let week = requiredWeek;
      for (let cycle = 0; cycle < maxWeeks; cycle += 1) {
        journal.append('WEEK_STARTED', { week, cycle: cycle + 1, of: maxWeeks });
        const prepared = await prepareWithRecovery(week);
        if (prepared.status === 'STOPPED') {
          moveTo(STATES.STOPPED);
          return finish('STOPPED', { week });
        }
        if (prepared.status !== 'PREPARED') {
          return finish('FAILED', { code: prepared.code, step: prepared.step, week, details: prepared.details });
        }

        await enrichPlan(prepared);
        const markdown = renderPlanMarkdown(prepared);
        const planPath = journal.writeArtifact(`week-${week}-instructions.md`, `${markdown}\n`);
        journal.writeArtifact(`week-${week}-plan.json`, `${JSON.stringify({ plan: prepared.plan, identification: prepared.identification }, null, 2)}\n`);
        log(`\n${markdown}\nSaved: ${planPath}\n`);
        journal.append('PLAN_READY', {
          week,
          ready: prepared.plan.instructions.length,
          unresolved: prepared.plan.unresolved.length,
          skipped: prepared.plan.skipped.length,
        });

        const snapshotBefore = await bridge.strategyPort.getStrategySnapshot();
        const operationId = createOperationId({
          week,
          fixtureId: prepared.plan.strategyFixture.id,
          planObservedAt: `settled-${(snapshotBefore.automationSettlements || []).length}`,
        });
        journal.append('OPERATION_ID', { operationId });

        if (prompts) {
          await betKingPage.bringToFront();
          const answer = await prompt(
            'Review the instructions above. Place any bets yourself on BetKing (this program never submits wagers), then press Enter to start watching the match (or type stop): ',
          );
          if (isStop(answer)) {
            moveTo(STATES.STOPPED);
            return finish('STOPPED', { week });
          }
        }

        moveTo(STATES.WAITING_FOR_RESULT);
        const result = await obtainVerifiedResult(prepared, operationId);
        if (result.status === 'STOPPED') {
          moveTo(STATES.STOPPED);
          return finish('STOPPED', { week });
        }
        if (result.status !== 'VERIFIED') {
          moveTo(STATES.PAUSED);
          return finish('PAUSED', { code: result.code ?? 'RESULT_NOT_VERIFIED', week, reason: result.reason });
        }

        moveTo(STATES.RESULT_DETECTED);
        moveTo(STATES.RESULT_VERIFIED);
        journal.append('RESULT_VERIFIED', {
          week,
          verifiedBy: result.verifiedBy,
          halfTime: result.verifiedResult.halfTime,
          fullTime: result.verifiedResult.fullTime,
        });

        // Evaluate first, so a blocked settlement leaves the strategy untouched.
        const evaluation = evaluateOptionsForResult({ plan: prepared.plan, verifiedResult: result.verifiedResult });
        journal.writeArtifact(`week-${week}-evaluation.json`, `${JSON.stringify(evaluation, null, 2)}\n`);
        if (!evaluation.settlementReadiness.ready) {
          moveTo(STATES.PAUSED);
          log('Settlement NOT applied: some options cannot be decided automatically:');
          for (const blocker of evaluation.settlementReadiness.blockers) {
            log(`  - ${blocker.strategyKey ?? 'result'}: ${blocker.outcome} (${blocker.reason})`);
          }
          log('The verified result and per-option evaluation are saved; settle in Cataloguea manually.');
          return finish('BLOCKED_SETTLEMENT', {
            code: 'UNRESOLVED_OPTIONS',
            week,
            blockers: evaluation.settlementReadiness.blockers,
          });
        }

        moveTo(STATES.SETTLING_STRATEGY);
        const settlement = await settlePlannedFixture({
          plan: prepared.plan,
          verifiedResult: result.verifiedResult,
          strategyPort: bridge.strategyPort,
          getCurrentInstructions: () => bridge.getInstructions(),
          actionOperationId: operationId,
          source: result.source,
          timestamp: result.timestamp,
        });
        journal.append('SETTLEMENT', { status: settlement.status, resultId: settlement.resultId ?? null });

        const applied = settlement.status === SETTLEMENT_STATUS.SETTLED
          || settlement.status === SETTLEMENT_STATUS.ALREADY_SETTLED;
        if (!applied || settlement.persistenceVerified !== true) {
          moveTo(settlement.status === SETTLEMENT_STATUS.SETTLEMENT_UNKNOWN ? STATES.SETTLEMENT_UNKNOWN : STATES.ERROR);
          return finish('FAILED', { code: settlement.status, week, reason: settlement.reason });
        }

        moveTo(STATES.SETTLEMENT_CONFIRMED);
        const nextWeek = settlement.next.nextWeek;
        journal.append('WEEK_SETTLED', { week, nextWeek, rolledOver: settlement.next.rolledOver });
        log(`Week ${week} settled once and persisted. Next target: Week ${nextWeek}.`);

        if (cycle + 1 >= maxWeeks) {
          moveTo(STATES.COMPLETED);
          return finish('COMPLETED', { week, nextWeek, rolledOver: settlement.next.rolledOver });
        }
        moveTo(STATES.WAITING_FOR_NEXT_FIXTURE);
        if (prompts) {
          await strategyPage.bringToFront();
          const answer = await prompt(
            `Select and submit the next Liverpool fixture in Cataloguea for Week ${nextWeek}, then press Enter (or type stop): `,
          );
          if (isStop(answer)) {
            moveTo(STATES.STOPPED);
            return finish('STOPPED', { nextWeek });
          }
        }
        week = nextWeek;
      }
      return finish('COMPLETED', {});
    } catch (error) {
      journal.append('UNEXPECTED_ERROR', { message: error.message });
      moveTo(STATES.ERROR);
      return finish('FAILED', { code: 'UNEXPECTED_ERROR', message: error.message });
    } finally {
      process.removeListener('SIGINT', onInterrupt);
      if (context) {
        try {
          await context.close();
        } catch (closeError) {
          journal.append('CLOSE_FAILED', { message: closeError.message });
        }
      }
    }
  }

  return Object.freeze({ run });
}

module.exports = { createBetKingController };
