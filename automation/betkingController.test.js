const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The controller is exercised with in-memory stand-ins for the browser, the BetKing
// ports, and the strategy tab. No browser, no network, no real site is touched.
const portsPath = require.resolve('./sportsbook/betkingPorts');
const bridgePath = require.resolve('./strategy/strategyBridge');
const flowPath = require.resolve('./sportsbook/betkingMarketFlow');
const injected = { ports: null, bridge: null, flow: null };
require.cache[portsPath] = { id: portsPath, filename: portsPath, loaded: true, exports: { createBetKingPorts: () => injected.ports } };
require.cache[flowPath] = { id: flowPath, filename: flowPath, loaded: true, exports: { createMarketFlow: () => injected.flow } };
require.cache[bridgePath] = { id: bridgePath, filename: bridgePath, loaded: true, exports: { createStrategyBridge: () => injected.bridge } };

const { createBetKingController } = require('./betkingController');
const { createBetKingLiveConfig } = require('./betkingLiveConfig');
const { createStrategyDecisionAdapter } = require('./strategy/strategyDecisionAdapter');
const { ASSET_KEYS } = require('./strategy/catalogueaAdapter');
const { OWNER_MAPPINGS } = require('./strategy/marketMappings');
const { createResultId } = require('./result/resultIdentity');

const STRATEGY_FIXTURE = {
  id: 'arsmnu', home: 'ars', away: 'mnu', winner: 325, oneX: 14.7, twoX: 14.7, x2: 14.6, tg0: 15.1,
  tg6: 16.9, ht12: 22.4, ht21: 13.4, ht30: 26.2, ft40: 35.8, ft41: 30,
};

function strategySnapshot({ bigOneX = 0, bigTwoX = 0 } = {}) {
  const zero = () => Object.fromEntries(ASSET_KEYS.map((key) => [key, 0]));
  return {
    baseStake: 10000, deficit: 0, smallDeficit: 0, privateDef: zero(), bigDef: { ...zero(), oneX: bigOneX, twoX: bigTwoX }, brokenTarget: zero(),
    clicked: [], winners: [], bigWinners: [], winnerStake: 0, recommendedAction: 'manual_result_entry',
    observedAt: '2026-10-12T10:00:00.000Z', fixture: STRATEGY_FIXTURE, automationSettlements: [],
  };
}

function fakePage(name) {
  return {
    name,
    goto: async () => {},
    waitForSelector: async () => {},
    evaluate: async () => true,
    bringToFront: async () => {},
    isClosed: () => false,
    title: async () => name,
  };
}

function liveFrames() {
  const fixture = { id: 'ARS-MNU', domId: 'matchup-statistics-button-ARS-MNU', home: 'ARS', away: 'MNU', roundId: '5' };
  const frame = (clock, homeScore, awayScore, status = 'IN_PROGRESS') => ({
    fixture, clock, homeScore, awayScore, status, observedAt: new Date().toISOString(),
  });
  return [frame('12', '1', '0'), frame('44', '1', '0'), frame('46', '1', '0'), frame('90', '1', '1', 'FINISHED')];
}

function setup({
  answers = null, frames = liveFrames(), authFirstReads = 0, strategyReadyAfter = 0,
  mappings = {}, bigDeficits = {}, through = 'identify', flowOverrides = {},
  strategyFeedable = false, feedStrategy = true, lastSettledWeek = null, env = {},
  feedResult = { ok: true, fixture: { id: 'arsmnu', home: 'ars', away: 'mnu' } },
} = {}) {
  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betking-run-'));
  const config = createBetKingLiveConfig({
    AUTOMATION_MODE: 'betking-live',
    AUTOMATION_BETKING_RUNS_DIR: runsDir,
    AUTOMATION_LIVE_INTERVAL_MS: '1',
    AUTOMATION_MATCH_WAIT_TIMEOUT_MS: '5000',
    AUTOMATION_POLL_INTERVAL_MS: '1',
    AUTOMATION_PIPELINE_THROUGH: through,
    ...env,
    AUTOMATION_FEED_STRATEGY: feedStrategy ? 'true' : 'false',
    AUTOMATION_STRATEGY_MODE: 'page',
    AUTOMATION_WATCH_MODE: env.AUTOMATION_WATCH_MODE ?? 'selectors',
    AUTOMATION_WEEK_CHECK: env.AUTOMATION_WEEK_CHECK ?? 'strict',
    AUTOMATION_SLIP_REVIEW_MS: '0',
    AUTOMATION_BETKING_PROGRESS_FILE: path.join(runsDir, 'progress.json'),
    AUTOMATION_LOGIN_WAIT_TIMEOUT_MS: '5000',
    AUTOMATION_STRATEGY_WAIT_TIMEOUT_MS: '5000',
  });
  const calls = { settle: [], selectWeek: [], flow: [], feed: [] };
  let fed = !strategyFeedable;
  const receipts = [];
  if (lastSettledWeek !== null) {
    fs.writeFileSync(path.join(runsDir, 'progress.json'), JSON.stringify({ lastSettledWeek }));
  }
  const logs = [];
  let frameIndex = 0;
  let scheduleReads = 0;
  let strategyReads = 0;
  injected.ports = {
    readSchedule: async () => (++scheduleReads <= authFirstReads ? { status: 'AUTH_REQUIRED', snapshot: { rounds: [] } } : {
      status: 'READY_READ_ONLY',
      snapshot: {
        url: config.targetUrl,
        rounds: [{
          roundName: 'Week 5', roundId: '5',
          fixtures: [{ fixtureId: 'matchup-statistics-button-ARS-MNU', home: 'ARS', away: 'MNU', market: '1X2', selections: [{ name: '1', odds: 1.5 }] }],
        }],
      },
    }),
    readVisibleWeek: async () => 5,
    selectWeek: async (week) => { calls.selectWeek.push(week); },
    openLive: async () => false,
    readLiveSnapshot: async () => frames[Math.min(frameIndex++, frames.length - 1)],
    readResultsPage: async () => { throw new Error('not configured'); },
    verifySelection: async () => ({ status: 'MISSING_MARKET' }),
    populateBetSlip: async () => ({ status: 'BET_SLIP_SELECTORS_NOT_CONFIGURED' }),
  };
  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: () => strategySnapshot(bigDeficits),
    betKingMarketMappings: mappings,
  });
  const track = (name, result) => async (...args) => { calls.flow.push({ name, args }); return typeof result === 'function' ? result(...args) : result; };
  injected.flow = {
    openMarketCategory: track('openMarketCategory', { status: 'MARKET_CATEGORY_OPENED', evidence: { category: 'HT/FT', observedCategory: 'HT/FT', labelsInFixture: ['1/1', '1/X', '1/2'], via: 'test' } }),
    identifyMarketSelection: track('identifyMarketSelection', (selection) => ({ status: 'MARKET_SELECTION_IDENTIFIED', odds: 13.3, evidence: { selection, matchedLabel: selection, home: 'ARS', away: 'MNU', expectedHome: 'ARS', expectedAway: 'MNU', index: 1, labels: [selection] } })),
    selectOdd: track('selectOdd', { status: 'SELECTION_ADDED', evidence: { selectedStateObserved: true, slipCountBefore: 0, slipCountAfter: 1 } }),
    openBetSlip: track('openBetSlip', { status: 'BET_SLIP_OPEN' }),
    enterStake: track('enterStake', { status: 'STAKE_NOT_ACCEPTED', evidence: {} }),
    readSlipPage: track('readSlipPage', {}),
    ...Object.fromEntries(Object.entries(flowOverrides).map(([name, result]) => [name, track(name, result)])),
  };
  injected.bridge = {
    getInstructions: async () => ((++strategyReads <= strategyReadyAfter || !fed)
      ? { status: 'FIXTURE_NOT_SUBMITTED', fixture: null, instructions: [] }
      : adapter.getCurrentInstructions()),
    submitFixture: async (input) => {
      calls.feed.push(input);
      if (feedResult.ok) fed = true;
      return feedResult;
    },
    strategyPort: {
      getStrategySnapshot: async () => ({ ...strategySnapshot(), automationSettlements: [...receipts] }),
      settleVerifiedResult: async (input) => {
        calls.settle.push(input);
        receipts.push({ resultId: createResultId(input.normalizedResult, input.actionOperationId) });
        return { status: 'settled' };
      },
    },
  };
  const context = {
    pages: () => [fakePage('betking')],
    newPage: async () => fakePage('cataloguea'),
    close: async () => {},
  };
  const prompts = [];
  const queue = answers ? [...answers] : [];
  const controller = createBetKingController({
    config,
    selectors: { configured: { live: true, results: false, betSlip: false }, live: {}, filePath: 'test' },
    mappings,
    launchContext: async () => context,
    prompt: async (question) => { prompts.push(question); return queue.length ? queue.shift() : ''; },
    sleep: async () => {},
    log: (message) => logs.push(String(message)),
  });
  return { controller, calls, runsDir, prompts, mappings, logs };
}

test('real-site configuration refuses to start without the explicit mode', () => {
  assert.throws(() => createBetKingLiveConfig({}), /AUTOMATION_MODE=betking-live/);
  const config = createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live' });
  assert.equal(config.mode, 'betking-live');
  assert.equal(config.browserHeadless, false);
  assert.match(config.targetUrl, /^https:\/\/m\.betking\.com\/en-ng\/virtuals\/scheduled\/leagues\/kings-league$/);
});

test('the controller refuses a non-live configuration (no simulation substitute)', () => {
  assert.throws(() => createBetKingController({ config: { mode: 'local' } }), /betking-live/);
});

test('a full week is prepared, watched, evaluated, and settled once through the strategy port', async () => {
  const { controller, calls, runsDir } = setup();
  const outcome = await controller.run({ requiredWeek: 5 });

  // Every option is defined, so the verified result (HT 1-0, FT 1-1) settles exactly once.
  assert.equal(outcome.status, 'COMPLETED');
  assert.equal(calls.settle.length, 1);
  assert.deepEqual(calls.settle[0].marks, { winners: [], bigWinners: [] });
  assert.equal(calls.selectWeek.length, 0);

  const files = fs.readdirSync(outcome.runDir);
  assert.ok(files.includes('week-5-instructions.md'));
  assert.ok(files.includes('week-5-plan.json'));
  assert.ok(files.includes('week-5-evaluation.json'));
  assert.ok(files.includes('journal.json'));
  const instructions = fs.readFileSync(path.join(outcome.runDir, 'week-5-instructions.md'), 'utf8');
  assert.match(instructions, /No wager has been placed/);
  assert.ok(outcome.runDir.startsWith(runsDir));

  const evaluation = JSON.parse(fs.readFileSync(path.join(outcome.runDir, 'week-5-evaluation.json'), 'utf8'));
  const oneX = evaluation.evaluations.find((entry) => entry.strategyKey === 'oneX');
  if (oneX) {
    // HT 1-0 (Arsenal home leads) and FT 1-1: oneX condition is met.
    assert.equal(oneX.outcome, 'WON');
  }
});

test('typing stop at the first prompt ends the run without touching the strategy', async () => {
  const { controller, calls } = setup({ answers: ['stop'] });
  const outcome = await controller.run({ requiredWeek: 5, prompts: true });
  assert.equal(outcome.status, 'STOPPED');
  assert.equal(calls.settle.length, 0);
});

test('an invalid week is rejected by the workflow rather than processed', async () => {
  const { controller } = setup();
  const outcome = await controller.run({ requiredWeek: 39, prompts: false });
  assert.equal(outcome.status, 'FAILED');
  assert.equal(outcome.code, 'REQUIRED_WEEK_UNKNOWN');
});


test('after you sign in the run takes over by itself (no Enter needed)', async () => {
  const { controller, prompts } = setup({ authFirstReads: 3 });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.equal(prompts.length, 0);
  assert.equal(outcome.status, 'COMPLETED');
  const journal = JSON.parse(fs.readFileSync(path.join(outcome.runDir, 'journal.json'), 'utf8'));
  assert.ok(journal.events.some((event) => event.type === 'WAITING_FOR_LOGIN'));
  assert.ok(journal.events.some((event) => event.type === 'LOGIN_DETECTED'));
});

test('the run waits for the strategy fixture by itself and then continues', async () => {
  const { controller, prompts } = setup({ strategyReadyAfter: 3, feedStrategy: false });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.equal(prompts.length, 0);
  assert.equal(outcome.status, 'COMPLETED');
  const journal = JSON.parse(fs.readFileSync(path.join(outcome.runDir, 'journal.json'), 'utf8'));
  assert.ok(journal.events.some((event) => event.type === 'WAITING_FOR_STRATEGY_FIXTURE'));
});


const ONEX_MAPPING = {
  oneX: {
    status: 'VERIFIED',
    market: 'HT/FT',
    selectionBySide: { HOME: '1/X', AWAY: '2/X' },
    evidence: 'test evidence',
  },
};

function readPlan(outcome) {
  return JSON.parse(fs.readFileSync(path.join(outcome.runDir, 'week-5-plan.json'), 'utf8')).plan;
}

test('market-first (identify): opens the category, identifies the selection, verifies odds, and never clicks an odd', async () => {
  const { controller, calls } = setup({ mappings: ONEX_MAPPING, bigDeficits: { bigOneX: 5000 }, through: 'identify' });
  const outcome = await controller.run({ requiredWeek: 5 });
  const names = calls.flow.map((call) => call.name);
  assert.deepEqual(names.slice(0, 2), ['openMarketCategory', 'identifyMarketSelection']);
  assert.ok(!names.includes('selectOdd'));
  // Arsenal is the home team, so oneX resolves to HT/FT 1/X.
  assert.equal(calls.flow[0].args[0], 'HT/FT');
  assert.equal(calls.flow[1].args[0], '1/X');
  const oneX = readPlan(outcome).instructions.find((record) => record.strategyKey === 'oneX');
  assert.equal(oneX.pipelineStatus, 'READ_ONLY_COMPLETE');
  assert.equal(oneX.pipeline.stage, 'ODDS_VERIFIED');
  assert.equal(oneX.betKingOdds, 13.3);
  assert.equal(oneX.oddsSource, 'BETKING');
});

test('market-first (select): the odd is added only after the earlier stages, and the other option waits for its turn', async () => {
  const { controller, calls } = setup({
    mappings: {
      ...ONEX_MAPPING,
      twoX: { status: 'VERIFIED', market: 'HT/FT', selectionBySide: { HOME: '2/X', AWAY: '1/X' }, evidence: 'test evidence' },
    },
    bigDeficits: { bigOneX: 5000, bigTwoX: 5000 },
    through: 'select',
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  const names = calls.flow.map((call) => call.name);
  assert.deepEqual(names, ['openMarketCategory', 'identifyMarketSelection', 'selectOdd']);
  const plan = readPlan(outcome);
  const first = plan.instructions[0];
  assert.equal(first.pipeline.stage, 'SELECTION_ADDED');
  assert.equal(first.lifecycle.selectionPrepared, true);
  assert.equal(plan.deferred.length, 1);
  assert.equal(plan.deferred[0].pipelineStatus, 'PENDING_SLIP_TURN');
});

test('market-first: when the category cannot be opened no odd is touched and the option is stopped', async () => {
  const { controller, calls } = setup({
    mappings: ONEX_MAPPING,
    bigDeficits: { bigOneX: 5000 },
    through: 'select',
    flowOverrides: { openMarketCategory: { status: 'MARKET_CATEGORY_NOT_OPENED', evidence: { category: 'HT/FT', attempts: [] } } },
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.ok(!calls.flow.some((call) => call.name === 'selectOdd'));
  const plan = readPlan(outcome);
  assert.equal(plan.pipelineFailed.length, 1);
  assert.equal(plan.pipelineFailed[0].pipeline.failure.code, 'MARKET_CATEGORY_NOT_OPENED');
  assert.equal(plan.instructions.length, 0);
});

test('market-first: a stake that is not entered stops the option before authorization', async () => {
  const { controller } = setup({ mappings: ONEX_MAPPING, bigDeficits: { bigOneX: 5000 }, through: 'slip' });
  const outcome = await controller.run({ requiredWeek: 5 });
  const plan = readPlan(outcome);
  assert.equal(plan.pipelineFailed.length, 1);
  assert.equal(plan.pipelineFailed[0].pipelineStatus, 'PIPELINE_FAILED');
  assert.ok(!plan.instructions.some((record) => record.pipelineStatus === 'AWAITING_AUTHORIZATION'));
});

test('the pipeline depth must be identify, select, or slip', () => {
  assert.throws(() => createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live', AUTOMATION_PIPELINE_THROUGH: 'submit' }), /AUTOMATION_PIPELINE_THROUGH/);
  assert.equal(createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live' }).pipelineThrough, 'identify');
});


test('the identified Arsenal fixture is fed to the strategy when it has none (team codes in lower case)', async () => {
  const { controller, calls } = setup({ strategyFeedable: true });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.deepEqual(calls.feed, [{ home: 'ars', away: 'mnu' }]);
  assert.equal(outcome.status, 'COMPLETED');
  const journal = JSON.parse(fs.readFileSync(path.join(outcome.runDir, 'journal.json'), 'utf8'));
  assert.ok(journal.events.some((event) => event.type === 'CHECKPOINT' && event.details.step === 'FEED_STRATEGY_FIXTURE'));
});

test('a fixture the strategy has no odds for stops the run instead of inventing odds', async () => {
  const { controller } = setup({
    strategyFeedable: true,
    feedStrategy: true,
    feedResult: { ok: false, code: 'NO_ODDS_FOR_FIXTURE', reason: 'No odds for ars vs mnu' },
  });
  const outcome = await controller.run({ requiredWeek: 5, prompts: true });
  // With prompts the controller offers a manual retry first; typing stop ends the run.
  assert.ok(['STOPPED', 'FAILED'].includes(outcome.status));
  assert.notEqual(outcome.status, 'COMPLETED');
});

test('automatic week: the upcoming round label is detected and reconciled on a first read-only run', async () => {
  const { controller } = setup();
  const outcome = await controller.run({ requiredWeek: null });
  assert.equal(outcome.status, 'COMPLETED');
  const journal = JSON.parse(fs.readFileSync(path.join(outcome.runDir, 'journal.json'), 'utf8'));
  const detected = journal.events.find((event) => event.type === 'WEEK_DETECTED');
  assert.equal(detected.details.detected.week, 5);
  assert.equal(detected.details.reconciliation.status, 'FIRST_RUN');
});

test('automatic week: a week that was already settled is refused', async () => {
  const { controller } = setup({ lastSettledWeek: 5 });
  const outcome = await controller.run({ requiredWeek: null });
  assert.equal(outcome.status, 'FAILED');
  assert.equal(outcome.code, 'WEEK_REPEAT');
});

test('automatic week: a skipped week is refused until you choose the week yourself', async () => {
  const { controller } = setup({ lastSettledWeek: 3 });
  const outcome = await controller.run({ requiredWeek: null });
  assert.equal(outcome.status, 'FAILED');
  assert.equal(outcome.code, 'WEEK_GAP');
});

test('automatic week: the next week after the last settled one is accepted', async () => {
  const { controller } = setup({ lastSettledWeek: 4 });
  const outcome = await controller.run({ requiredWeek: null });
  assert.equal(outcome.status, 'COMPLETED');
});

test('automatic week: the first run refuses to select an odd until you confirm the week', async () => {
  const { controller } = setup({ through: 'select' });
  const outcome = await controller.run({ requiredWeek: null });
  assert.equal(outcome.status, 'FAILED');
  assert.equal(outcome.code, 'WEEK_NOT_CONFIRMED');
});

// ---- owner mappings, priority order, and the guarded place-bet step -------------------------

function slipFlow(overrides = {}) {
  const current = {};
  return {
    openMarketCategory: (category, fixture, options) => {
      current.market = options?.market ?? category;
      return {
        status: 'MARKET_CATEGORY_OPENED',
        evidence: { category, market: current.market, observedCategory: category, observedMarkets: [current.market], labelsInFixture: ['x'], via: 'test' },
      };
    },
    identifyMarketSelection: (selection) => {
      current.selection = selection;
      return { status: 'MARKET_SELECTION_IDENTIFIED', odds: 13.3, evidence: { selection, matchedLabel: selection, home: 'ARS', away: 'MNU', expectedHome: 'ARS', expectedAway: 'MNU', index: 0, labels: [selection] } };
    },
    enterStake: (stake) => { current.stake = stake; return { status: 'STAKE_ENTERED' }; },
    readSlipPage: () => ({
      isBetSlipPage: true,
      items: [{ home: 'ARS', away: 'MNU', market: current.market, selection: current.selection, odds: 13.3, week: 5 }],
      stake: current.stake,
      totalOdds: 13.3,
      potentialWinnings: current.stake * 13.3,
      expirySeconds: 40,
    }),
    placeBet: { status: 'ACCEPTED_BY_SITE_TEXT', evidence: { clickedAt: '2026-10-17T10:00:00Z', siteConfirmationText: 'Bet placed successfully', newLines: [] } },
    closeBetSlip: { status: 'BET_SLIP_CLOSED' },
    resetBetSlip: { status: 'BET_SLIP_RESET', steps: [] },
    ...overrides,
  };
}

const PLACE_ENV = { AUTOMATION_ALLOW_REAL_MONEY: 'yes', AUTOMATION_AUTO_CONFIRM: 'true' };
const identifiedSelections = (calls) => calls.flow.filter((call) => call.name === 'identifyMarketSelection').map((call) => call.args[0]);

test('every option is resolved from the owner mappings and processed in the owner order of play', async () => {
  const { controller, calls } = setup({ mappings: OWNER_MAPPINGS, bigDeficits: { bigOneX: 5000, bigTwoX: 5000 }, through: 'identify', flowOverrides: slipFlow() });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.equal(outcome.status, 'COMPLETED');
  // Arsenal is home: winner 6-0, then oneX 1/X, then twoX 2/X.
  assert.deepEqual(identifiedSelections(calls), ['6-0', '1/X', '2/X']);
  const categories = calls.flow.filter((call) => call.name === 'openMarketCategory').map((call) => call.args[0]);
  assert.deepEqual(categories, ['Correct Score', 'HT/FT', 'HT/FT']);
});

test('place mode places each verified bet once, one slip at a time, and settles only placed options', async () => {
  const { controller, calls } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: { bigOneX: 5000, bigTwoX: 5000 }, through: 'place', env: PLACE_ENV, flowOverrides: slipFlow(),
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.equal(outcome.status, 'COMPLETED');
  const names = calls.flow.map((call) => call.name);
  assert.equal(names.filter((name) => name === 'placeBet').length, 3);
  assert.equal(names.filter((name) => name === 'closeBetSlip').length, 3);
  // Slip handling per option: add the odd, open the slip, enter the stake, place, close, next.
  assert.deepEqual(names.slice(0, 8), ['openMarketCategory', 'identifyMarketSelection', 'selectOdd', 'openBetSlip', 'enterStake', 'readSlipPage', 'readSlipPage', 'placeBet']);
  // HT 1-0, FT 1-1 at home: oneX won, twoX and winner lost. Only the accepted bets are evaluated.
  assert.deepEqual(calls.settle[0].marks, { winners: ['oneX'], bigWinners: ['oneX'] });
});

test('place mode refuses to place anything without explicit real-money consent', async () => {
  const { controller, calls } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: { bigOneX: 5000 }, through: 'place', env: { AUTOMATION_AUTO_CONFIRM: 'true' }, flowOverrides: slipFlow(),
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.equal(outcome.status, 'NO_BETS_PLACED');
  assert.ok(!calls.flow.some((call) => call.name === 'placeBet'));
  assert.equal(calls.settle.length, 0);
});

test('place mode needs a typed confirmation unless auto-confirm is on', async () => {
  const { controller, calls } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: { bigOneX: 5000 }, through: 'place', env: { AUTOMATION_ALLOW_REAL_MONEY: 'yes' }, flowOverrides: slipFlow(),
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.equal(outcome.status, 'NO_BETS_PLACED');
  assert.ok(!calls.flow.some((call) => call.name === 'placeBet'));
});

test('a typed confirmation of the exact stake is accepted and anything else is refused', async () => {
  const winnerStake = 31;
  const { controller, calls } = setup({
    mappings: { winner: OWNER_MAPPINGS.winner }, through: 'place', env: { AUTOMATION_ALLOW_REAL_MONEY: 'yes' }, flowOverrides: slipFlow(),
    answers: ['', `PLACE ${winnerStake}`],
  });
  const outcome = await controller.run({ requiredWeek: 5, prompts: true });
  assert.equal(calls.flow.filter((call) => call.name === 'placeBet').length, 1);
  assert.equal(outcome.status, 'COMPLETED');
});

test('a stake above the cap is skipped and the remaining options are still attempted', async () => {
  const { controller, calls } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: { bigOneX: 5000, bigTwoX: 5000 }, through: 'place',
    env: { ...PLACE_ENV, AUTOMATION_MAX_STAKE: '100' }, flowOverrides: slipFlow(),
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  // The winner stake (31) is within the cap and is placed; oneX and twoX are over the cap and refused,
  // but being refused does not stop the run: every option is still looked at.
  assert.equal(calls.flow.filter((call) => call.name === 'placeBet').length, 1);
  const plan = readPlan(outcome);
  assert.equal(plan.halted, null);
  assert.ok(plan.pipelineFailed.some((record) => record.strategyKey === 'oneX'));
  assert.ok(plan.pipelineFailed.some((record) => record.strategyKey === 'twoX'));
});

test('a failed option leaves the slip and the next option is still tried', async () => {
  const { controller, calls } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: { bigOneX: 5000, bigTwoX: 5000 }, through: 'place', env: PLACE_ENV,
    flowOverrides: slipFlow({ placeBet: { status: 'SLIP_EXPIRING', evidence: { expirySeconds: 3 } } }),
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  const attempts = calls.flow.filter((call) => call.name === 'placeBet').length;
  assert.ok(attempts >= 2, 'every option is attempted, not just the first');
  assert.ok(calls.flow.filter((call) => call.name === 'resetBetSlip').length >= 2, 'the slip is left after each failure');
  assert.equal(outcome.status, 'NO_BETS_PLACED');
});

test('a --through slip dry run leaves the slip, then finishes without waiting for a match', async () => {
  const { controller, calls } = setup({ mappings: OWNER_MAPPINGS, bigDeficits: { bigOneX: 5000 }, through: 'slip', flowOverrides: slipFlow() });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.equal(outcome.status, 'DRY_RUN_COMPLETE');
  assert.ok(calls.flow.some((call) => call.name === 'resetBetSlip'));
  assert.equal(calls.flow.filter((call) => call.name === 'placeBet').length, 0);
});

test('the week on the page is used without --week unless AUTOMATION_WEEK_CHECK=strict', () => {
  assert.equal(createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live' }).weekCheck, 'off');
  assert.equal(createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live', AUTOMATION_WEEK_CHECK: 'strict' }).weekCheck, 'strict');
});

test('a click with no confirmation from the site pauses the run and nothing is settled', async () => {
  const { controller, calls } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: { bigOneX: 5000 }, through: 'place', env: PLACE_ENV,
    flowOverrides: slipFlow({ placeBet: { status: 'SUBMITTED_UNCONFIRMED', evidence: { clickedAt: '2026-10-17T10:00:00Z', newLines: ['Loading'] } } }),
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.equal(outcome.status, 'PAUSED');
  assert.equal(outcome.code, 'WAGER_UNCONFIRMED');
  assert.equal(calls.flow.filter((call) => call.name === 'placeBet').length, 1);
  assert.equal(calls.settle.length, 0);
});

test('a bet the site rejects is not counted as placed; the other options are still tried and nothing is settled', async () => {
  const { controller, calls } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: { bigOneX: 5000 }, through: 'place', env: PLACE_ENV,
    flowOverrides: slipFlow({ placeBet: { status: 'REJECTED_BY_SITE_TEXT', evidence: { clickedAt: '2026-10-17T10:00:00Z', newLines: ['Insufficient balance'] } } }),
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.equal(outcome.status, 'NO_BETS_PLACED');
  assert.ok(calls.flow.filter((call) => call.name === 'placeBet').length >= 1);
  assert.ok(calls.flow.some((call) => call.name === 'resetBetSlip'), 'the slip is left after a rejection');
  assert.equal(calls.settle.length, 0);
});

test('a slip that no longer matches right before the click is not placed', async () => {
  const flow = slipFlow();
  const original = flow.readSlipPage;
  let reads = 0;
  flow.readSlipPage = () => {
    reads += 1;
    const slip = original();
    // The first read (slip verification) is correct; the last look before the click shows a changed price.
    return reads >= 2 ? { ...slip, items: [{ ...slip.items[0], odds: 12.1 }] } : slip;
  };
  const { controller, calls } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: { bigOneX: 5000 }, through: 'place', env: PLACE_ENV, flowOverrides: flow,
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.ok(!calls.flow.some((call) => call.name === 'placeBet'));
  assert.equal(outcome.status, 'NO_BETS_PLACED');
});

test('the place depth is accepted by the configuration and is the only one that can submit', () => {
  assert.equal(createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live', AUTOMATION_PIPELINE_THROUGH: 'place' }).pipelineThrough, 'place');
  const config = createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live' });
  assert.equal(config.allowRealMoney, false);
  assert.equal(config.autoConfirm, false);
  assert.equal(config.maxStake, 1000);
});

test('the strategy runs without a screen by default, and the old tab mode is opt-in', () => {
  const live = createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live' });
  assert.equal(live.strategyMode, 'headless');
  assert.equal(live.baseStake, 10000);
  assert.ok(live.slowMoMs > 0, 'clicks are slowed so they can be watched');
  assert.equal(createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live', AUTOMATION_STRATEGY_MODE: 'page' }).strategyMode, 'page');
  assert.equal(createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live', AUTOMATION_SLOW_MO_MS: '0' }).slowMoMs, 0);
});

test('the outcome summary says which options won and lost, with the half-time and full-time scores', () => {
  const { formatOutcomeSummary } = require('./betkingController');
  const text = formatOutcomeSummary(
    { fixture: { home: 'ars', away: 'new' }, arsenalSide: 'HOME', skipped: [{ strategyKey: 'oneX', stake: 7, odds: 14.7, pipelineStatus: 'SKIPPED_BELOW_MINIMUM' }] },
    { halfTime: { home: 2, away: 1 }, fullTime: { home: 3, away: 1 } },
    {
      evaluations: [
        { strategyKey: 'ht21', outcome: 'WON', stake: 15, odds: 13.4, htScore: { home: 2, away: 1 }, ftScore: { home: 3, away: 1 } },
        { strategyKey: 'tg0', outcome: 'LOST', stake: 12, odds: 15.1, htScore: null, ftScore: { home: 3, away: 1 } },
      ],
      notPlaced: [],
      skipped: [],
    },
  );
  assert.match(text, /ARS v NEW \(Arsenal home\): half-time 2-1, full-time 3-1/);
  assert.match(text, /ht21\s+WON\s+PLACED\s+N15\s+13\.4/);
  assert.match(text, /tg0\s+LOST\s+PLACED/);
  assert.match(text, /oneX\s+LOST\s+below minimum/);
  assert.match(text, /YOU BET AND WON:\s+ht21/);
  assert.match(text, /YOU BET AND LOST:\s+tg0/);
  assert.match(text, /STAKED: N27 \| RETURNED: N201 \|/);
});

test('trial mode: AUTOMATION_ONLY_OPTIONS limits the bets and uses its own strategy state file', () => {
  const config = createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live', AUTOMATION_ONLY_OPTIONS: 'winner' });
  assert.deepEqual(config.onlyOptions, ['winner']);
  assert.match(config.strategyStateFile, /strategy-state\.trial\.json$/);
  assert.equal(createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live' }).onlyOptions, null);
  assert.throws(() => createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live', AUTOMATION_ONLY_OPTIONS: 'winer' }), /unknown option/);
});

test('trial mode places only the chosen option and leaves the others alone', async () => {
  const { controller, calls } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: { bigOneX: 5000, bigTwoX: 5000 }, through: 'place',
    env: { ...PLACE_ENV, AUTOMATION_ONLY_OPTIONS: 'winner' }, flowOverrides: slipFlow(),
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.equal(calls.flow.filter((call) => call.name === 'placeBet').length, 1);
  assert.deepEqual(identifiedSelections(calls), ['6-0']);
  const plan = readPlan(outcome);
  assert.ok(plan.deferred.some((record) => record.strategyKey === 'oneX' && record.pipelineStatus === 'NOT_SELECTED_THIS_RUN'));
});

test('a selection left in the slip by an earlier run is cleared before the next one is added', async () => {
  let cleared = false;
  const { controller, calls } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: {}, through: 'place', env: { ...PLACE_ENV, AUTOMATION_ONLY_OPTIONS: 'winner' },
    flowOverrides: slipFlow({
      readSlipSummary: () => (cleared ? { count: 0, odds: null } : { count: 1, odds: 143 }),
      resetBetSlip: () => { cleared = true; return { status: 'BET_SLIP_RESET', steps: [] }; },
    }),
  });
  await controller.run({ requiredWeek: 5 });
  const names = calls.flow.map((call) => call.name);
  assert.ok(names.indexOf('resetBetSlip') !== -1 && names.indexOf('resetBetSlip') < names.indexOf('selectOdd'), 'the stale slip is cleared before selecting');
  assert.equal(names.filter((name) => name === 'placeBet').length, 1);
});

test('place mode waits for a round with enough time left instead of racing the clock', async () => {
  const { controller, calls } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: {}, through: 'place',
    env: { ...PLACE_ENV, AUTOMATION_ONLY_OPTIONS: 'winner', AUTOMATION_WEEK_CHECK: 'off', AUTOMATION_MIN_START_SECONDS: '60' },
    flowOverrides: slipFlow(),
  });
  const original = injected.ports.readSchedule;
  let reads = 0;
  injected.ports.readSchedule = async () => {
    const result = await original();
    reads += 1;
    result.snapshot.rounds[0].timer = reads < 3 ? '00:10' : '02:20';
    return result;
  };
  await controller.run({});
  assert.ok(reads >= 3, 'it kept reading the schedule until a round with enough time appeared');
  assert.equal(calls.flow.filter((call) => call.name === 'placeBet').length, 1);
});

test('time limits have sensible defaults: wait for 75s in place mode, retry two more rounds', () => {
  assert.equal(createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live', AUTOMATION_PIPELINE_THROUGH: 'place' }).minStartSeconds, 75);
  assert.equal(createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live' }).minStartSeconds, 0);
  assert.equal(createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live' }).retryRounds, 2);
});

test('a failed option says why, for example the slip problems', async () => {
  const { controller } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: {}, through: 'place', env: { ...PLACE_ENV, AUTOMATION_ONLY_OPTIONS: 'winner' },
    flowOverrides: slipFlow({ enterStake: { status: 'STAKE_NOT_ACCEPTED', evidence: { expected: 31, found: 100 } } }),
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.match(outcome.failures[0].reason, /BET_SLIP_MISMATCH \(STAKE_NOT_ACCEPTED\)/);
});

test('the result report judges all 11 options, including the ones that were not bet', () => {
  const { formatOutcomeSummary } = require('./betkingController');
  const text = formatOutcomeSummary(
    { fixture: { home: 'ars', away: 'ast' }, arsenalSide: 'HOME', instructions: [{ strategyKey: 'winner', stake: 44, betKingOdds: 228 }] },
    { halfTime: { home: 3, away: 0 }, fullTime: { home: 6, away: 0 } },
    { evaluations: [{ strategyKey: 'winner', outcome: 'WON', stake: 44, odds: 228, htScore: { home: 3, away: 0 }, ftScore: { home: 6, away: 0 } }], notPlaced: [], skipped: [] },
  );
  assert.match(text, /winner\s+WON\s+PLACED/);
  assert.match(text, /tg6\s+WON\s+not placed/);
  assert.match(text, /ht30\s+WON\s+not placed/);
  assert.match(text, /oneX\s+LOST/);
  assert.match(text, /WON BUT NOT PLACED: tg6, ht30/);
  assert.match(text, /STAKED: N44 \| RETURNED: N10032 \| WINNING OPTIONS ON THIS SCORE: winner, tg6, ht30/);
});

test('by default the match is read from the Results window, with the live reader off', () => {
  assert.equal(createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live' }).watchMode, 'results');
  assert.equal(createBetKingLiveConfig({ AUTOMATION_MODE: 'betking-live', AUTOMATION_WATCH_MODE: 'selectors' }).watchMode, 'selectors');
});

test('place mode in the default watch mode reads the Results window, then prints the score and all 11 options', async () => {
  const { rowsToResultsPage } = require('./sportsbook/betkingResultsModal');
  const { controller, logs } = setup({
    mappings: OWNER_MAPPINGS, bigDeficits: {}, through: 'place',
    env: { ...PLACE_ENV, AUTOMATION_ONLY_OPTIONS: 'winner', AUTOMATION_WATCH_MODE: 'results' }, flowOverrides: slipFlow(),
  });
  injected.ports.readResultsPage = async () => rowsToResultsPage({
    roundName: 'Week 5',
    rows: [{ position: 1, home: 'ARS', away: 'MNU', halfTime: { home: 1, away: 0 }, fullTime: { home: 1, away: 1 } }],
  });
  const outcome = await controller.run({ requiredWeek: 5 });
  const text = logs.join('\n');
  assert.equal(outcome.status, 'COMPLETED', text);
  assert.match(text, /Bet placed\. Watching the match/);
  assert.match(text, /RESULT ARS v MNU \(Arsenal home\): half-time 1-0, full-time 1-1/);
  assert.match(text, /winner\s+LOST\s+PLACED/);
  assert.match(text, /oneX\s+WON\s+below minimum/);
  assert.match(text, /WON BUT NOT PLACED: oneX/);
});

const LIVE_ENV = {
  AUTOMATION_ONLY_OPTIONS: 'winner', AUTOMATION_WATCH_MODE: 'results', AUTOMATION_LIVE_TRACK_INTERVAL_MS: '1', AUTOMATION_LIVE_GIVE_UP_MS: '1',
  AUTOMATION_RESULTS_MAX_ATTEMPTS: '2', AUTOMATION_RESULTS_INTERVAL_MS: '1', AUTOMATION_RESULTS_INITIAL_DELAY_MS: '1',
};
const sequence = (entries) => {
  let index = 0;
  return async () => entries[Math.min(index++, entries.length - 1)];
};

test('the match is watched live: half-time and full-time come from the score and minute, then every option is judged', async () => {
  const { controller, logs } = setup({ mappings: OWNER_MAPPINGS, bigDeficits: {}, through: 'place', env: { ...PLACE_ENV, ...LIVE_ENV }, flowOverrides: slipFlow() });
  injected.ports.readResultsPage = async () => { throw new Error('The Kings League window did not open.'); };
  injected.ports.readPanelScore = sequence([
    { home: 0, away: 0, finished: false, minute: 10 },
    { home: 1, away: 0, finished: false, minute: 30 },
    { home: 1, away: 0, finished: false, minute: 44 },
    { home: 1, away: 0, finished: false, minute: 47 },
    { home: 1, away: 1, finished: false, minute: 70 },
    { home: 1, away: 1, finished: false, minute: 88 },
    { home: 1, away: 1, finished: true, minute: null },
  ]);
  const outcome = await controller.run({ requiredWeek: 5 });
  const text = logs.join('\n');
  assert.equal(outcome.status, 'COMPLETED', text);
  assert.match(text, /Live: ARS 1 - 1 MNU/);
  assert.match(text, /Full time: ARS 1 - 1 MNU, half-time 1-0/);
  assert.match(text, /RESULT ARS v MNU \(Arsenal home\): half-time 1-0, full-time 1-1 {2}\[source: LIVE_TRACKING\]/);
  assert.match(text, /winner\s+LOST\s+PLACED/);
  assert.match(text, /oneX\s+WON\s+below minimum/);
  assert.match(text, /ht21\s+LOST/);
});

test('when a goal falls between the observations, half-time is not guessed', async () => {
  const { controller, logs } = setup({ mappings: OWNER_MAPPINGS, bigDeficits: {}, through: 'place', env: { ...PLACE_ENV, ...LIVE_ENV }, flowOverrides: slipFlow() });
  injected.ports.readResultsPage = async () => { throw new Error('window closed'); };
  injected.ports.readPanelScore = sequence([
    { home: 0, away: 0, finished: false, minute: 44 },
    { home: 1, away: 0, finished: false, minute: 47 },
    { home: 1, away: 0, finished: false, minute: 88 },
    { home: 1, away: 0, finished: true, minute: null },
  ]);
  await controller.run({ requiredWeek: 5 });
  const text = logs.join('\n');
  assert.match(text, /half-time not proven/);
  assert.match(text, /half-time n\/a, full-time 1-0/);
  assert.match(text, /ht21\s+NEEDS HT/);
  assert.match(text, /winner\s+LOST\s+PLACED/);
});

test('the Results window, when it can be read, is the authority over the live view', async () => {
  const { rowsToResultsPage } = require('./sportsbook/betkingResultsModal');
  const { controller, logs } = setup({ mappings: OWNER_MAPPINGS, bigDeficits: {}, through: 'place', env: { ...PLACE_ENV, ...LIVE_ENV }, flowOverrides: slipFlow() });
  injected.ports.readPanelScore = sequence([
    { home: 0, away: 0, finished: false, minute: 30 },
    { home: 1, away: 1, finished: false, minute: 89 },
    { home: 1, away: 1, finished: true, minute: null },
  ]);
  injected.ports.readResultsPage = async () => rowsToResultsPage({
    roundName: 'Week 5',
    rows: [{ position: 1, home: 'ARS', away: 'MNU', halfTime: { home: 1, away: 0 }, fullTime: { home: 1, away: 2 } }],
  });
  await controller.run({ requiredWeek: 5 });
  const text = logs.join('\n');
  assert.match(text, /WARNING: the live view said 1-1 but the Results window says 1-2/);
  assert.match(text, /RESULT ARS v MNU \(Arsenal home\): half-time 1-0, full-time 1-2/);
});

test('when neither the live view nor the Results window can be read, nothing is settled and the run says where to look', async () => {
  const { controller, logs } = setup({ mappings: OWNER_MAPPINGS, bigDeficits: {}, through: 'place', env: { ...PLACE_ENV, ...LIVE_ENV }, flowOverrides: slipFlow() });
  injected.ports.readResultsPage = async () => { throw new Error('The Kings League window did not open.'); };
  injected.ports.readPanelScore = async () => null;
  const outcome = await controller.run({ requiredWeek: 5 });
  const text = logs.join('\n');
  assert.equal(outcome.status, 'PAUSED');
  assert.match(text, /could not be read/);
  assert.match(text, /results-failed-/);
});

test('an FT label seen early in the match is ignored, so the run never leaves at the first goal', async () => {
  const { controller, logs } = setup({ mappings: OWNER_MAPPINGS, bigDeficits: {}, through: 'place', env: { ...PLACE_ENV, ...LIVE_ENV }, flowOverrides: slipFlow() });
  injected.ports.readResultsPage = async () => { throw new Error('window closed'); };
  injected.ports.readPanelScore = sequence([
    { home: 0, away: 0, finished: false, minute: 12 },
    { home: 1, away: 0, finished: true, minute: 15 },   // a stray FT while the match is only at minute 15
    { home: 1, away: 0, finished: true, minute: 15 },
    { home: 1, away: 0, finished: true, minute: 15 },
    { home: 1, away: 0, finished: false, minute: 44 },
    { home: 1, away: 0, finished: false, minute: 47 },
    { home: 1, away: 2, finished: false, minute: 90 },
    { home: 1, away: 2, finished: true, minute: null },
  ]);
  await controller.run({ requiredWeek: 5 });
  const text = logs.join('\n');
  assert.match(text, /FT label appeared at minute 15; ignored/);
  assert.match(text, /Full time: ARS 1 - 2 MNU, half-time 1-0/);
});

test('the league countdown decides when the match starts: wait for zero, then watch until full time', async () => {
  const { controller, logs } = setup({ mappings: OWNER_MAPPINGS, bigDeficits: {}, through: 'place', env: { ...PLACE_ENV, ...LIVE_ENV }, flowOverrides: slipFlow() });
  injected.ports.readResultsPage = async () => { throw new Error('window closed'); };
  injected.ports.readMatchClock = sequence([
    { countdown: 3, live: false }, { countdown: 2, live: false }, { countdown: 1, live: false }, { countdown: 0, live: false }, { countdown: null, live: true },
  ]);
  injected.ports.readPanelScore = sequence([
    null, null, null, null,
    { home: 0, away: 0, finished: false, minute: 20 },
    { home: 1, away: 0, finished: false, minute: 44 },
    { home: 1, away: 0, finished: false, minute: 47 },
    { home: 1, away: 0, finished: false, minute: 89 },
    { home: 1, away: 0, finished: true, minute: null },
  ]);
  const outcome = await controller.run({ requiredWeek: 5 });
  const text = logs.join('\n');
  assert.equal(outcome.status, 'COMPLETED', text);
  assert.match(text, /Kick-off in 00:03/);
  assert.match(text, /Kick-off! The countdown reached zero/);
  assert.match(text, /Full time: ARS 1 - 0 MNU, half-time 1-0/);
});

test('if no score is ever read, the whole match is still watched, the page lines are shown, and only then the Results window is used', async () => {
  const { controller, logs } = setup({ mappings: OWNER_MAPPINGS, bigDeficits: {}, through: 'place', env: { ...PLACE_ENV, ...LIVE_ENV, AUTOMATION_MATCH_SECONDS: '1', AUTOMATION_LIVE_END_MARGIN_MS: '50' }, flowOverrides: slipFlow() });
  injected.ports.readResultsPage = async () => { throw new Error('window closed'); };
  injected.ports.readMatchClock = sequence([{ countdown: 0, live: true }]);
  injected.ports.readPanelScore = async () => null;
  injected.ports.readPanelDebug = async () => ['ARS', 'MNU', 'ARS 0 : 0 MNU ???'];
  await controller.run({ requiredWeek: 5 });
  const text = logs.join('\n');
  assert.match(text, /Kick-off! The countdown reached zero/);
  assert.match(text, /No score read yet\. Page lines mentioning ARS\/MNU: \[ARS\] \[MNU\]/);
  assert.match(text, /The whole match \(1s\) has passed and its score was never read/);
});

test('a stray LIVE word while the countdown is still running does not start the watch', async () => {
  const { controller, logs } = setup({ mappings: OWNER_MAPPINGS, bigDeficits: {}, through: 'place', env: { ...PLACE_ENV, ...LIVE_ENV, AUTOMATION_MATCH_SECONDS: '1', AUTOMATION_LIVE_END_MARGIN_MS: '50' }, flowOverrides: slipFlow() });
  injected.ports.readResultsPage = async () => { throw new Error('window closed'); };
  injected.ports.readMatchClock = sequence([
    { countdown: 40, live: true }, { countdown: 39, live: true }, { countdown: 0, live: false }, { countdown: 0, live: false },
  ]);
  injected.ports.readPanelScore = async () => null;
  await controller.run({ requiredWeek: 5 });
  const text = logs.join('\n');
  assert.match(text, /Kick-off in 00:40/);
  assert.equal((text.match(/Kick-off! The countdown/g) || []).length, 1);
});
