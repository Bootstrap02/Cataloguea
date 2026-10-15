const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The controller is exercised with in-memory stand-ins for the browser, the BetKing
// ports, and the strategy tab. No browser, no network, no real site is touched.
const portsPath = require.resolve('./sportsbook/betkingPorts');
const bridgePath = require.resolve('./strategy/strategyBridge');
const injected = { ports: null, bridge: null };
require.cache[portsPath] = { id: portsPath, filename: portsPath, loaded: true, exports: { createBetKingPorts: () => injected.ports } };
require.cache[bridgePath] = { id: bridgePath, filename: bridgePath, loaded: true, exports: { createStrategyBridge: () => injected.bridge } };

const { createBetKingController } = require('./betkingController');
const { createBetKingLiveConfig } = require('./betkingLiveConfig');
const { createStrategyDecisionAdapter } = require('./strategy/strategyDecisionAdapter');
const { ASSET_KEYS } = require('./strategy/catalogueaAdapter');

const STRATEGY_FIXTURE = {
  id: 'livmnu', home: 'liv', away: 'mnu', winner: 325, oneX: 14.7, twoX: 14.7, x2: 14.6, tg0: 15.1,
  tg6: 16.9, ht12: 22.4, ht21: 13.4, ht30: 26.2, ft40: 35.8, ft41: 30,
};

function strategySnapshot() {
  const zero = () => Object.fromEntries(ASSET_KEYS.map((key) => [key, 0]));
  return {
    baseStake: 10000, deficit: 0, smallDeficit: 0, privateDef: zero(), bigDef: zero(), brokenTarget: zero(),
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
  const fixture = { id: 'LIV-MNU', domId: 'matchup-statistics-button-LIV-MNU', home: 'LIV', away: 'MNU', roundId: '5' };
  const frame = (clock, homeScore, awayScore, status = 'IN_PROGRESS') => ({
    fixture, clock, homeScore, awayScore, status, observedAt: new Date().toISOString(),
  });
  return [frame('12', '1', '0'), frame('44', '1', '0'), frame('46', '1', '0'), frame('90', '1', '1', 'FINISHED')];
}

function setup({ answers = null, frames = liveFrames(), authFirstReads = 0, strategyReadyAfter = 0 } = {}) {
  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betking-run-'));
  const config = createBetKingLiveConfig({
    AUTOMATION_MODE: 'betking-live',
    AUTOMATION_BETKING_RUNS_DIR: runsDir,
    AUTOMATION_LIVE_INTERVAL_MS: '1',
    AUTOMATION_MATCH_WAIT_TIMEOUT_MS: '5000',
    AUTOMATION_POLL_INTERVAL_MS: '1',
    AUTOMATION_LOGIN_WAIT_TIMEOUT_MS: '5000',
    AUTOMATION_STRATEGY_WAIT_TIMEOUT_MS: '5000',
  });
  const calls = { settle: [], selectWeek: [] };
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
          fixtures: [{ fixtureId: 'matchup-statistics-button-LIV-MNU', home: 'LIV', away: 'MNU', market: '1X2', selections: [{ name: '1', odds: 1.5 }] }],
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
  const adapter = createStrategyDecisionAdapter({ readStrategySnapshot: () => strategySnapshot() });
  injected.bridge = {
    getInstructions: async () => (++strategyReads <= strategyReadyAfter
      ? { status: 'FIXTURE_NOT_SUBMITTED', fixture: null, instructions: [] }
      : adapter.getCurrentInstructions()),
    strategyPort: {
      getStrategySnapshot: async () => strategySnapshot(),
      settleVerifiedResult: async (input) => { calls.settle.push(input); return { status: 'settled' }; },
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
    mappings: {},
    launchContext: async () => context,
    prompt: async (question) => { prompts.push(question); return queue.length ? queue.shift() : ''; },
    sleep: async () => {},
    log: () => {},
  });
  return { controller, calls, runsDir, prompts };
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

test('a full week is prepared, watched, evaluated, and stopped safely when options cannot be decided', async () => {
  const { controller, calls, runsDir } = setup();
  const outcome = await controller.run({ requiredWeek: 5 });

  // winner (6-0) has no defined win condition, so settlement must not be applied.
  assert.equal(outcome.status, 'BLOCKED_SETTLEMENT');
  assert.equal(outcome.state, 'PAUSED');
  assert.ok(outcome.blockers.some((blocker) => blocker.strategyKey === 'winner'));
  assert.equal(calls.settle.length, 0);
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
    // HT 1-0 (Liverpool home leads) and FT 1-1: oneX condition is met.
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
  assert.equal(outcome.status, 'BLOCKED_SETTLEMENT');
  const journal = JSON.parse(fs.readFileSync(path.join(outcome.runDir, 'journal.json'), 'utf8'));
  assert.ok(journal.events.some((event) => event.type === 'WAITING_FOR_LOGIN'));
  assert.ok(journal.events.some((event) => event.type === 'LOGIN_DETECTED'));
});

test('the run waits for the strategy fixture by itself and then continues', async () => {
  const { controller, prompts } = setup({ strategyReadyAfter: 3 });
  const outcome = await controller.run({ requiredWeek: 5 });
  assert.equal(prompts.length, 0);
  assert.equal(outcome.status, 'BLOCKED_SETTLEMENT');
  const journal = JSON.parse(fs.readFileSync(path.join(outcome.runDir, 'journal.json'), 'utf8'));
  assert.ok(journal.events.some((event) => event.type === 'WAITING_FOR_STRATEGY_FIXTURE'));
});
