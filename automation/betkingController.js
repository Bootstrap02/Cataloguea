// Controller for the REAL BetKing run: one controlled lifecycle per game week.
//
//   open BetKing (visible, persistent profile) -> manual sign-in if needed ->
//   select week -> identify Arsenal fixture -> read strategy -> stakes, merge,
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
const { createMarketFlow } = require('./sportsbook/betkingMarketFlow');
const { createHeadlessStrategyBridge } = require('./strategy/headlessStrategy');
const {
  PIPELINE_FAILURES,
  compareSlipToExpected,
  createOptionPipeline,
  canSelectOdd,
  describeAuthorizationRequest,
} = require('./strategy/marketFirstSequence');
const { createStrategyBridge } = require('./strategy/strategyBridge');
const { createOperationalWorkflow, evaluateOptionsForResult } = require('./strategy/operationalWorkflow');
const { settlePlannedFixture, createOperationId, SETTLEMENT_STATUS } = require('./strategy/settlementIntegration');
const { createLiveResultObserver, verifyResultsPageResult } = require('./result/liveResultObserver');
const { createResultPoller } = require('./strategy/resultPoller');
const { createBetKingFixtureIdentity } = require('./strategy/fixtureIdentity');
const { renderPlanMarkdown } = require('./betkingReport');
const {
  WEEK_RECONCILIATION,
  detectUpcomingRound,
  readProgress,
  reconcileWeek,
  writeProgress,
} = require('./strategy/weekProgress');

async function defaultLaunchContext(config) {
  const { chromium } = require('playwright');
  return chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    channel: config.browserChannel,
    timeout: config.browserLaunchTimeoutMs,
    viewport: { width: 1280, height: 800 },
    slowMo: config.slowMoMs || 0,
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

// The live observer compares the short id ('ARS-COV') and, when both sides have it,
// the full DOM id ('matchup-statistics-button-ARS-COV').
function toObserverFixtureIds(fixtureId) {
  const raw = String(fixtureId ?? '');
  const match = /^matchup-statistics-button-(.+)$/i.exec(raw);
  return match ? { id: match[1], domId: raw } : { id: raw, domId: undefined };
}

// Plain-language result of every option we bet on, with the rule that decided it, for example
// "ht21 WON  stake 15  Arsenal 2-1 at half-time  (HT 2-1, FT 3-1)". Scores are home-away as on the site.
function formatOutcomeSummary(plan, verifiedResult, evaluation) {
  const { RULE_TEXT } = require('./strategy/winRules');
  const ft = verifiedResult?.fullTime;
  const ht = verifiedResult?.halfTime;
  const fixture = plan?.fixture ? `${String(plan.fixture.home).toUpperCase()} v ${String(plan.fixture.away).toUpperCase()}` : 'fixture';
  const side = plan?.arsenalSide ? ` (Arsenal ${String(plan.arsenalSide).toLowerCase()})` : '';
  const lines = [`RESULT ${fixture}${side}: half-time ${ht ? `${ht.home}-${ht.away}` : 'n/a'}, full-time ${ft ? `${ft.home}-${ft.away}` : 'n/a'}`];
  for (const item of evaluation.evaluations) {
    const score = (label, value) => (value ? `${label} ${value.home}-${value.away}` : null);
    const detail = [score('HT', item.htScore), score('FT', item.ftScore)].filter(Boolean).join(', ');
    lines.push(`  ${item.strategyKey} ${item.outcome}  stake ${item.stake}  [${RULE_TEXT[item.strategyKey] ?? 'rule'}]${detail ? `  (${detail})` : ''}`);
  }
  for (const item of evaluation.notPlaced || []) lines.push(`  ${item.strategyKey} NOT PLACED  stake ${item.stake}`);
  for (const item of evaluation.skipped || []) lines.push(`  ${item.strategyKey} below minimum, not bet  stake ${item.stake}`);
  const won = evaluation.evaluations.filter((item) => item.outcome === 'WON').map((item) => item.strategyKey);
  const lost = evaluation.evaluations.filter((item) => item.outcome === 'LOST').map((item) => item.strategyKey);
  lines.push(`  WON: ${won.join(', ') || 'none'} | LOST: ${lost.join(', ') || 'none'}`);
  return lines.join('\n');
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
    const headlessStrategy = config.strategyMode === 'headless';
    let ports = null;
    let flow = null;
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
      flow = createMarketFlow({ page: betKingPage, config, selectors });
      if (typeof flow.setCaptureDirectory === 'function') flow.setCaptureDirectory(journal.runDir);
      workflow = createOperationalWorkflow({
        stateMachine: machine,
        ports: {
          readSchedule: () => ports.readSchedule(),
          readVisibleWeek: () => ports.readVisibleWeek(),
          selectWeek: (week) => ports.selectWeek(week),
          getStrategyInstructions: () => bridge.getInstructions(),
          ...(config.feedStrategy ? { submitFixtureToStrategy: ({ home, away }) => bridge.submitFixture({ home: String(home).toLowerCase(), away: String(away).toLowerCase() }) } : {}),
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
      log('Waiting for an Arsenal fixture to be submitted in the Cataloguea tab; the run continues by itself afterwards.');
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

    // Automatic week: the upcoming round's LABEL on the real schedule, reconciled with the last
    // settled week (1-38, 38 -> 1). The countdown is shown for you to compare, never used.
    async function resolveUpcomingWeek() {
      let result = await ports.readSchedule();
      if (result?.status === BETKING_STATUSES.AUTH_REQUIRED) {
        if (prompts) return { ok: false, code: 'AUTHENTICATION_REQUIRED', reason: 'Sign in to BetKing, then run again.' };
        if (!(await waitForLogin())) return { ok: false, code: 'AUTHENTICATION_REQUIRED', reason: 'BetKing sign-in was not completed in time.' };
        result = await ports.readSchedule();
      }
      const detected = detectUpcomingRound(result?.snapshot ?? result);
      if (detected.status !== 'DETECTED') {
        return { ok: false, code: 'REQUIRED_WEEK_UNKNOWN', reason: 'No round with a readable week label is visible on the schedule.' };
      }
      const progress = readProgress(config.progressFile);
      const reconciliation = reconcileWeek({ detectedWeek: detected.week, lastSettledWeek: progress.lastSettledWeek });
      journal.append('WEEK_DETECTED', { detected, lastSettledWeek: progress.lastSettledWeek, reconciliation });
      log(`Upcoming round: ${detected.roundName}${detected.timer ? ` (countdown ${detected.timer})` : ''}; weeks visible: ${detected.visibleWeeks.join(', ')}. ${reconciliation.reason}`);
      if (config.weekCheck !== 'strict') {
        // Take the round that is on the page now. The comparison with the last settled week is only logged.
        if (!reconciliation.ok) log(`Note: ${reconciliation.reason} Continuing with ${detected.roundName} because the page shows it as the upcoming round.`);
        return { ok: true, week: detected.week };
      }
      if (!reconciliation.ok) {
        return { ok: false, code: `WEEK_${reconciliation.status}`, reason: `${reconciliation.reason} Run with --week N to choose the week yourself.` };
      }
      if (reconciliation.status === WEEK_RECONCILIATION.FIRST_RUN && config.pipelineThrough !== 'identify') {
        return { ok: false, code: 'WEEK_NOT_CONFIRMED', reason: `First run: confirm the week yourself with --week ${detected.week} before selecting odds or touching the slip.` };
      }
      return { ok: true, week: detected.week };
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
          const which = prep.code === 'STRATEGY_STATE_MISSING' && strategyPage ? strategyPage : betKingPage;
          await which.bringToFront();
          const answer = await prompt(
            prep.code === 'STRATEGY_STATE_MISSING'
              ? 'In the Cataloguea tab, select and submit the Arsenal fixture, then press Enter (or type stop): '
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

    // Market-first pipeline (rules RULE-006 / RULE-007). For each option with a VERIFIED
    // mapping: open its category, identify the exact selection for the confirmed fixture, verify
    // the odds, and only then (depending on --through) add the odd to the slip, enter the stake,
    // and verify the slip. It stops at AWAITING_AUTHORIZATION: nothing is ever submitted.
    async function runMarketFirstPipeline(prep) {
      const { plan, identification, fixtureCrossCheck } = prep;
      const through = config.pipelineThrough;
      const fixture = { roundName: identification.roundName, home: plan.fixture.home, away: plan.fixture.away };
      const reached = [];
      const failed = [];
      const deferred = [];
      let slipHolder = null;
      let halted = null;

      // Leave the slip behind (clear + close) so the run never sits on it and the next option can use it.
      const recoverSlip = async () => {
        if (typeof flow.resetBetSlip !== 'function') return;
        try {
          const reset = await flow.resetBetSlip();
          journal.append('SLIP_RESET', reset);
          if (reset.status === 'BET_SLIP_RESET' || reset.status === 'ALREADY_CLEAN') slipHolder = null;
        } catch (error) {
          journal.append('SLIP_RESET_FAILED', { message: error.message });
        }
      };

      const FAILURE_FOR_STATUS = {
        MARKET_CATEGORY_NOT_OPENED: PIPELINE_FAILURES.MARKET_CATEGORY_NOT_OPENED,
        FIXTURE_ROW_NOT_AVAILABLE: PIPELINE_FAILURES.FIXTURE_ROW_NOT_AVAILABLE,
        MARKET_SELECTION_NOT_FOUND: PIPELINE_FAILURES.MARKET_SELECTION_NOT_FOUND,
        ODDS_UNAVAILABLE: PIPELINE_FAILURES.ODDS_UNAVAILABLE,
        ODDS_CHANGED: PIPELINE_FAILURES.ODDS_CHANGED,
        SLIP_NOT_EMPTY: PIPELINE_FAILURES.SLIP_NOT_EMPTY,
        SELECTION_NOT_ADDED: PIPELINE_FAILURES.SELECTION_NOT_ADDED,
      };

      for (const record of plan.instructions) {
        const pipeline = createOptionPipeline({ strategyKey: record.strategyKey });
        const optionStartedAt = Date.now();
        record.verificationStatus = 'NOT_VERIFIED';

        if (halted) {
          record.pipelineStatus = 'HALTED';
          record.reason = `Not attempted: the run stopped at ${halted.strategyKey} (${halted.code}).`;
          deferred.push(record);
          continue;
        }
        if (through !== 'identify' && slipHolder) {
          // A second outcome of the same market replaces the first and several selections
          // would form one combined bet, so options are prepared one at a time.
          record.pipelineStatus = 'PENDING_SLIP_TURN';
          record.reason = `Waiting for its turn: the slip is held by ${slipHolder}. Options are prepared one at a time.`;
          deferred.push(record);
          continue;
        }

        const advance = (stage, evidence) => {
          const outcome = pipeline.advance(stage, evidence);
          journal.append('PIPELINE_STAGE', { strategyKey: record.strategyKey, stage, ok: outcome.ok, reason: outcome.reason ?? null });
          return outcome.ok;
        };
        const stop = (code, details = {}) => {
          pipeline.fail(code, details);
          record.pipelineStatus = 'PIPELINE_FAILED';
          record.eligibilityStatus = 'PIPELINE_FAILED';
          record.verificationStatus = 'NOT_VERIFIED';
          record.reason = `Stopped after ${pipeline.stage ?? 'no stage'}: ${code}${details.reason ? ` (${details.reason})` : ''}.`;
          journal.append('PIPELINE_FAILED', { strategyKey: record.strategyKey, code, afterStage: pipeline.stage, details });
          failed.push(record);
        };
        const stopFromStatus = (result) => stop(FAILURE_FOR_STATUS[result.status] ?? PIPELINE_FAILURES.BET_SLIP_MISMATCH, { status: result.status, evidence: result.evidence ?? null });

        try {
          if (!advance('FIXTURE_CONFIRMED', { verified: fixtureCrossCheck?.verified === true, home: plan.fixture.home, away: plan.fixture.away, arsenalSide: plan.arsenalSide })) {
            stop('FIXTURE_IDENTITY_MISMATCH', { reason: 'fixture not confirmed' }); continue;
          }
          if (!advance('STRATEGY_OPTIONS_RESOLVED', { mappingStatus: record.mappingStatus, category: record.betKingCategory ?? record.betKingMarket, selection: record.betKingSelection })) {
            stop('UNRESOLVED_MARKET_MAPPING'); continue;
          }

          const opened = await flow.openMarketCategory(record.betKingCategory ?? record.betKingMarket, fixture, { market: record.betKingMarket });
          if (opened.status !== 'MARKET_CATEGORY_OPENED') { stopFromStatus(opened); continue; }
          if (!advance('MARKET_CATEGORY_OPENED', opened.evidence)) { stop(PIPELINE_FAILURES.MARKET_CATEGORY_NOT_OPENED); continue; }

          const identified = await flow.identifyMarketSelection(record.betKingSelection, fixture);
          if (identified.status !== 'MARKET_SELECTION_IDENTIFIED') { stopFromStatus(identified); continue; }
          if (!advance('MARKET_SELECTION_IDENTIFIED', identified.evidence)) { stop(PIPELINE_FAILURES.MARKET_SELECTION_NOT_FOUND); continue; }
          if (!advance('ODDS_VERIFIED', { odds: identified.odds })) { stop(PIPELINE_FAILURES.ODDS_UNAVAILABLE); continue; }
          // The strategy calculated this stake from its own odds table; show how far BetKing's
          // current price is from it so the difference is never hidden.
          if (typeof record.odds === 'number' && record.odds > 1) {
            const percent = Math.round(((identified.odds - record.odds) / record.odds) * 1000) / 10;
            record.oddsComparison = { strategyTable: record.odds, betKing: identified.odds, percentDifference: percent };
            if (Math.abs(percent) > 5) journal.append('ODDS_DIFFER_FROM_STRATEGY_TABLE', { strategyKey: record.strategyKey, ...record.oddsComparison });
          }
          record.betKingOdds = identified.odds;
          record.oddsSource = 'BETKING';
          record.oddsStatus = 'READ_FROM_BETKING';
          record.verificationStatus = 'SELECTION_IDENTIFIED_ON_PAGE';

          if (through === 'identify') { record.pipelineStatus = 'READ_ONLY_COMPLETE'; reached.push(record); continue; }

          // RULE-006: no odd is touched until the stages above are all verified.
          const gate = canSelectOdd(pipeline);
          if (!gate.allowed) { stop(PIPELINE_FAILURES.SELECTION_NOT_ADDED, { reason: gate.reason }); continue; }
          const added = await flow.selectOdd(record.betKingSelection, { ...fixture }, identified.odds);
          if (added.status !== 'SELECTION_ADDED') { stopFromStatus(added); continue; }
          if (!advance('SELECTION_ADDED', added.evidence)) { stop(PIPELINE_FAILURES.SELECTION_NOT_ADDED); continue; }
          record.lifecycle.selectionPrepared = true;
          record.verificationStatus = 'SELECTION_ADDED_TO_SLIP';
          slipHolder = record.strategyKey;

          if (through === 'select') { record.pipelineStatus = 'SELECTION_ADDED'; reached.push(record); continue; }

          const slipOpen = await flow.openBetSlip();
          if (slipOpen.status !== 'BET_SLIP_OPEN') { stop(PIPELINE_FAILURES.BET_SLIP_MISMATCH, { status: slipOpen.status }); continue; }
          const entered = await flow.enterStake(record.stake);
          if (entered.status !== 'STAKE_ENTERED') { stop(PIPELINE_FAILURES.BET_SLIP_MISMATCH, { status: entered.status, evidence: entered.evidence ?? null }); continue; }
          const slip = await flow.readSlipPage();
          const comparison = compareSlipToExpected({
            slip,
            expected: {
              home: plan.fixture.home,
              away: plan.fixture.away,
              market: record.betKingMarket,
              selection: record.betKingSelection,
              stake: record.stake,
              odds: identified.odds,
              week: plan.week,
            },
          });
          record.slip = slip;
          if (!advance('BET_SLIP_VERIFIED', { comparison })) {
            stop(comparison.problems.includes('SLIP_EXPIRING') ? PIPELINE_FAILURES.SLIP_EXPIRING : PIPELINE_FAILURES.BET_SLIP_MISMATCH, { problems: comparison.problems });
            continue;
          }
          record.lifecycle.betSlipVerified = true;
          record.verificationStatus = 'BET_SLIP_VERIFIED';
          advance('AWAITING_AUTHORIZATION', { submitted: false });
          record.pipelineStatus = 'AWAITING_AUTHORIZATION';
          record.authorizationRequest = describeAuthorizationRequest({
            week: plan.week,
            home: plan.fixture.home,
            away: plan.fixture.away,
            arsenalSide: plan.arsenalSide,
            category: record.betKingMarket,
            selection: record.betKingSelection,
            odds: identified.odds,
            stake: record.stake,
            potentialWinnings: slip.potentialWinnings,
            expirySeconds: slip.expirySeconds,
          });
          if (through !== 'place') { reached.push(record); continue; }

          // ---- Placement (real money). Every guard must pass, once, in this order. -----------
          const refuse = (code, reason, severe = false) => {
            pipeline.fail(code, { reason });
            record.pipelineStatus = 'NOT_PLACED';
            record.reason = `Not placed: ${code} (${reason}).`;
            journal.append('WAGER_NOT_PLACED', { strategyKey: record.strategyKey, code, reason });
            failed.push(record);
            if (severe || code === PIPELINE_FAILURES.WAGER_NOT_AUTHORIZED && !config.allowRealMoney) halted = { code, strategyKey: record.strategyKey, severe };
          };
          if (!config.allowRealMoney) { refuse(PIPELINE_FAILURES.WAGER_NOT_AUTHORIZED, 'AUTOMATION_ALLOW_REAL_MONEY=yes is not set'); continue; }
          if (record.stake > config.maxStake) { refuse(PIPELINE_FAILURES.WAGER_NOT_AUTHORIZED, `stake ${record.stake} is above the stake cap ${config.maxStake} (AUTOMATION_MAX_STAKE)`); continue; }
          let authorized = config.autoConfirm;
          if (!authorized) {
            if (!prompts) { refuse(PIPELINE_FAILURES.WAGER_NOT_AUTHORIZED, 'confirmation is required: run with --prompts or --auto-confirm'); continue; }
            await betKingPage.bringToFront();
            const answer = await prompt(`${record.authorizationRequest}\nType PLACE ${record.stake} to place this bet, or press Enter to skip: `);
            authorized = String(answer ?? '').trim().toUpperCase() === `PLACE ${record.stake}`;
            if (!authorized) { refuse(PIPELINE_FAILURES.WAGER_NOT_AUTHORIZED, 'not confirmed by you'); continue; }
          }
          // A last look at the slip immediately before the click.
          const finalCheck = compareSlipToExpected({
            slip: await flow.readSlipPage(),
            expected: { home: plan.fixture.home, away: plan.fixture.away, market: record.betKingMarket, selection: record.betKingSelection, stake: record.stake, odds: identified.odds, week: plan.week },
            minSecondsRemaining: 15,
          });
          if (!finalCheck.ok) {
            stop(finalCheck.problems.includes('SLIP_EXPIRING') ? PIPELINE_FAILURES.SLIP_EXPIRING : PIPELINE_FAILURES.BET_SLIP_MISMATCH, { problems: finalCheck.problems });
            continue;
          }
          const placed = await flow.placeBet({
            minSecondsRemaining: 15,
            onEvidence: async (label) => {
              try {
                await betKingPage.screenshot({ path: path.join(journal.runDir, `week-${plan.week}-${record.strategyKey}-${label}.png`) });
              } catch (screenshotError) {
                journal.append('SCREENSHOT_FAILED', { label, message: screenshotError.message });
              }
            },
          });
          journal.append('WAGER_RESULT', { strategyKey: record.strategyKey, status: placed.status, evidence: placed.evidence });
          const clicked = ['ACCEPTED_BY_SITE_TEXT', 'REJECTED_BY_SITE_TEXT', 'SUBMITTED_UNCONFIRMED'].includes(placed.status);
          if (clicked) {
            advance('WAGER_SUBMITTED', { authorized: true, clickedAt: placed.evidence.clickedAt });
            record.lifecycle.submitted = true;
          }
          if (placed.status === 'ACCEPTED_BY_SITE_TEXT') {
            advance('WAGER_ACCEPTED', { siteConfirmationText: placed.evidence.siteConfirmationText });
            record.lifecycle.accepted = true;
            record.pipelineStatus = 'WAGER_ACCEPTED';
            record.verificationStatus = 'WAGER_ACCEPTED_BY_SITE_TEXT';
            reached.push(record);
            const closed = await flow.closeBetSlip();
            if (closed.status !== 'BET_SLIP_CLOSED') {
              halted = { code: 'BET_SLIP_NOT_CLOSED', strategyKey: record.strategyKey, severe: false };
            } else {
              slipHolder = null;
            }
            continue;
          }
          if (placed.status === 'REJECTED_BY_SITE_TEXT') {
            pipeline.fail(PIPELINE_FAILURES.WAGER_REJECTED, placed.evidence);
            record.pipelineStatus = 'WAGER_REJECTED';
            record.reason = `The site rejected the bet: ${(placed.evidence.newLines ?? []).join(' | ').slice(0, 160)}`;
            failed.push(record);
            continue;
          }
          // No confirmation (or no click happened). A click without confirmation is severe: a bet may exist.
          const severe = placed.status === 'SUBMITTED_UNCONFIRMED';
          pipeline.fail(severe ? PIPELINE_FAILURES.WAGER_UNCONFIRMED : PIPELINE_FAILURES.PLACE_BUTTON_NOT_FOUND, { status: placed.status, evidence: placed.evidence });
          record.pipelineStatus = severe ? 'WAGER_UNCONFIRMED' : 'NOT_PLACED';
          record.reason = severe
            ? 'The place-bet control was used but the site showed no confirmation. Check My Bets before doing anything else.'
            : `The bet was not placed (${placed.status}).`;
          failed.push(record);
          if (severe) halted = { code: PIPELINE_FAILURES.WAGER_UNCONFIRMED, strategyKey: record.strategyKey, severe };
        } catch (error) {
          stop(PIPELINE_FAILURES.BET_SLIP_MISMATCH, { reason: error.message });
        } finally {
          record.pipeline = pipeline.snapshot();
          journal.append('PIPELINE_TIMING', { strategyKey: record.strategyKey, elapsedMs: Date.now() - optionStartedAt, reachedStage: pipeline.stage });
          // After an error, an expiry, a rejection or a dry run, leave the slip. A bet that may exist
          // without confirmation is never touched.
          const dryRunDone = through === 'slip' && record.pipelineStatus === 'AWAITING_AUTHORIZATION';
          const needsReset = slipHolder === record.strategyKey && !(halted && halted.severe)
            && (['PIPELINE_FAILED', 'NOT_PLACED', 'WAGER_REJECTED'].includes(record.pipelineStatus) || dryRunDone);
          if (needsReset) {
            if (dryRunDone && config.slipReviewMs > 0) await sleepFor(config.slipReviewMs);
            await recoverSlip();
          }
        }
      }

      plan.instructions = reached;
      plan.pipelineFailed = failed;
      plan.deferred = deferred;
      plan.halted = halted;
      // In place mode only options whose bet the site accepted may receive a winning mark.
      plan.placedOnly = through === 'place';
      plan.pipelineThrough = through;
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
      // The built-in Results-window reader is used when no results selectors are configured.
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
      if (headlessStrategy) {
        // No strategy tab: the strategy runs in this program (see strategy/headlessStrategy.js).
        bridge = createHeadlessStrategyBridge({
          stateFile: config.strategyStateFile,
          baseStake: config.baseStake,
          betKingMarketMappings: mappings,
          log,
        });
        log(`Strategy runs without a screen (state file: ${config.strategyStateFile}).`);
      } else {
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
      }
      rebuildPorts();

      moveTo(STATES.INITIALIZING);
      try {
        await gotoBetKing();
      } catch (error) {
        journal.append('OPEN_BETKING_FAILED', { message: error.message });
      }

      await betKingPage.bringToFront();
      if (prompts) {
        if (strategyPage) await strategyPage.bringToFront();
        const answer = await prompt(
          headlessStrategy
            ? 'BetKing is open. Sign in if needed (the strategy runs inside this program, no strategy tab). Press Enter to start (or type stop): '
            : 'Two tabs are open: BetKing and Cataloguea. Sign in to BetKing if needed and make sure the Cataloguea tab shows your strategy with the Arsenal fixture submitted. Press Enter to start (or type stop): ',
        );
        if (isStop(answer)) {
          moveTo(STATES.STOPPED);
          return finish('STOPPED');
        }
      }

      // ---- one controlled lifecycle per week -----------------------------------
      let week = requiredWeek;
      if (week === null || week === undefined) {
        const resolved = await resolveUpcomingWeek();
        if (!resolved.ok) {
          moveTo(STATES.PAUSED);
          return finish('FAILED', { code: resolved.code, reason: resolved.reason });
        }
        week = resolved.week;
      }
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

        await runMarketFirstPipeline(prepared);
        if (config.pipelineThrough === 'place') {
          const accepted = prepared.plan.instructions.filter((record) => record.lifecycle.accepted);
          journal.append('PLACEMENT_SUMMARY', {
            accepted: accepted.map((record) => ({ strategyKey: record.strategyKey, stake: record.stake })),
            halted: prepared.plan.halted,
          });
          if (prepared.plan.halted?.severe) {
            moveTo(STATES.PAUSED);
            return finish('PAUSED', { code: prepared.plan.halted.code, week, reason: 'A bet may exist without confirmation. Check My Bets before doing anything else.' });
          }
          if (accepted.length === 0) {
            moveTo(STATES.PAUSED);
            return finish('NO_BETS_PLACED', {
              code: prepared.plan.halted?.code ?? 'NOTHING_TO_PLACE',
              week,
              failures: (prepared.plan.pipelineFailed ?? []).map((record) => ({ strategyKey: record.strategyKey, reason: record.reason })),
            });
          }
        }
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

        if (config.pipelineThrough === 'select' || config.pipelineThrough === 'slip') {
          // A dry run places nothing, so there is no match to wait for.
          moveTo(STATES.STOPPED);
          return finish('DRY_RUN_COMPLETE', { week, through: config.pipelineThrough, verified: prepared.plan.instructions.map((record) => record.strategyKey) });
        }

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
        log(formatOutcomeSummary(prepared.plan, result.verifiedResult, evaluation));
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
        try {
          writeProgress(config.progressFile, week);
        } catch (progressError) {
          journal.append('PROGRESS_NOT_SAVED', { message: progressError.message });
        }
        log(`Week ${week} settled once and persisted. Next target: Week ${nextWeek}.`);

        if (cycle + 1 >= maxWeeks) {
          moveTo(STATES.COMPLETED);
          return finish('COMPLETED', { week, nextWeek, rolledOver: settlement.next.rolledOver });
        }
        moveTo(STATES.WAITING_FOR_NEXT_FIXTURE);
        if (prompts) {
          if (strategyPage) await strategyPage.bringToFront();
          const answer = await prompt(
            headlessStrategy
              ? `Week ${nextWeek} is next; the strategy will be fed automatically. Press Enter to continue (or type stop): `
              : `Select and submit the next Arsenal fixture in Cataloguea for Week ${nextWeek}, then press Enter (or type stop): `,
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

module.exports = { createBetKingController, formatOutcomeSummary };
