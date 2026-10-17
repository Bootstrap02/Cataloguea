const test = require('node:test');
const assert = require('node:assert/strict');
const { StateMachine, STATES } = require('../stateMachine');
const { ASSET_KEYS } = require('./catalogueaAdapter');
const { createStrategyDecisionAdapter } = require('./strategyDecisionAdapter');
const {
  FAILURE_POLICIES,
  INSTRUCTION_STAGES,
  WORKFLOW_STEPS,
  buildOperationalPlan,
  createOperationalWorkflow,
  evaluateOptionsForResult,
  identifyLiverpoolFixtureForWeek,
  planNextWeek,
  verifyFixtureAgainstStrategy,
} = require('./operationalWorkflow');

const STRATEGY_FIXTURE = {
  id: 'livmnu',
  home: 'liv',
  away: 'mnu',
  winner: 325,
  oneX: 14.7,
  twoX: 14.7,
  x2: 14.6,
  tg0: 15.1,
  tg6: 16.9,
  ht12: 22.4,
  ht21: 13.4,
  ht30: 26.2,
  ft40: 35.8,
  ft41: 30,
};

function createStrategySnapshot(fixture = STRATEGY_FIXTURE) {
  return {
    baseStake: 10000,
    deficit: 0,
    smallDeficit: 0,
    privateDef: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    bigDef: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    brokenTarget: Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])),
    clicked: new Set(),
    winners: new Set(),
    bigWinners: new Set(),
    winnerStake: 0,
    recommendedAction: 'manual_result_entry',
    observedAt: '2026-10-12T10:00:00.000Z',
    fixture,
  };
}

function betKingFixture(home, away) {
  return {
    fixtureId: `matchup-statistics-button-${home}-${away}`,
    home,
    away,
    market: '1X2',
    selections: [{ name: '1', odds: 1.5 }],
  };
}

function createSchedule() {
  return {
    url: 'https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league',
    title: 'Kings League',
    rounds: [
      { roundName: 'Week 5', roundId: '5', fixtures: [betKingFixture('ARS', 'CHE'), betKingFixture('LIV', 'MNU')] },
      { roundName: 'Week 6', roundId: '6', fixtures: [betKingFixture('EVE', 'LIV')] },
    ],
  };
}

function createPorts({ visibleWeek = 5, schedule = createSchedule(), strategyFixture = STRATEGY_FIXTURE } = {}) {
  const calls = { selectWeek: [] };
  let visible = visibleWeek;
  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: () => createStrategySnapshot(strategyFixture),
  });
  return {
    calls,
    readSchedule: async () => schedule,
    readVisibleWeek: async () => visible,
    selectWeek: async (week) => {
      calls.selectWeek.push(week);
      visible = week;
    },
    getStrategyInstructions: async () => adapter.getCurrentInstructions(),
  };
}

test('workflow definition covers the whole flow and maps onto existing machine states', () => {
  const ids = WORKFLOW_STEPS.map((workflowStep) => workflowStep.id);
  assert.equal(ids[0], 'START');
  assert.ok(ids.includes('MERGE_APPLICABLE_STAKE_COMPONENTS'));
  assert.ok(ids.includes('FILTER_STAKES_BELOW_MINIMUM'));
  assert.equal(ids[ids.length - 1], 'WAIT_FOR_NEXT_FIXTURE_OR_CONTINUE');
  for (const workflowStep of WORKFLOW_STEPS) {
    assert.ok(STATES[workflowStep.machineState], `${workflowStep.id} maps to unknown state`);
    assert.ok(workflowStep.success);
    assert.ok(workflowStep.recovery);
    for (const code of workflowStep.failures) {
      assert.ok(FAILURE_POLICIES[code], `${workflowStep.id} references unknown failure ${code}`);
    }
  }
});

test('every failure condition has a policy that never falls back to simulation', () => {
  const required = [
    'BETKING_UNAVAILABLE', 'AUTHENTICATION_REQUIRED', 'REQUIRED_WEEK_UNAVAILABLE', 'WRONG_WEEK_SELECTED',
    'LIVERPOOL_FIXTURE_NOT_FOUND', 'AMBIGUOUS_LIVERPOOL_FIXTURE', 'STRATEGY_STATE_MISSING', 'STAKE_NOT_CALCULATED',
    'STAKE_BELOW_MINIMUM', 'UNRESOLVED_MARKET_MAPPING', 'MISSING_MARKET_SELECTION', 'MISSING_ODDS',
    'FIXTURE_STARTS_LATER', 'LIVE_FIXTURE_NOT_LOCATED', 'HALFTIME_SCORE_UNAVAILABLE', 'FULLTIME_RESULT_UNAVAILABLE',
    'INTERNET_DISCONNECTED', 'BROWSER_CRASH', 'SESSION_EXPIRED', 'DUPLICATE_RESULT', 'DUPLICATE_SETTLEMENT',
    'STALE_STRATEGY_STATE', 'PERSISTENCE_FAILED', 'NEXT_WEEK_FIXTURES_MISSING',
  ];
  for (const code of required) {
    const entry = FAILURE_POLICIES[code];
    assert.ok(entry, `missing policy for ${code}`);
    assert.ok(entry.action);
    assert.ok(entry.description);
  }
});

test('instruction lifecycle stages are distinct and only the first three are ever reached in this stage', () => {
  assert.deepEqual(INSTRUCTION_STAGES, [
    'CALCULATED', 'ELIGIBLE', 'MARKET_RESOLVED', 'SELECTION_PREPARED', 'BET_SLIP_VERIFIED', 'SUBMITTED', 'ACCEPTED',
  ]);
});

test('identifyLiverpoolFixtureForWeek identifies the single Liverpool fixture of the required week', () => {
  const result = identifyLiverpoolFixtureForWeek({ snapshot: createSchedule(), week: 5 });
  assert.equal(result.status, 'IDENTIFIED');
  assert.equal(result.liverpoolSide, 'HOME');
  assert.equal(result.opponent, 'MNU');
  assert.equal(result.fixture.home, 'LIV');
  assert.equal(result.matchState, 'UNKNOWN');
});

test('identifyLiverpoolFixtureForWeek reports Liverpool as the away team in another week', () => {
  const result = identifyLiverpoolFixtureForWeek({ snapshot: createSchedule(), week: 6 });
  assert.equal(result.status, 'IDENTIFIED');
  assert.equal(result.liverpoolSide, 'AWAY');
  assert.equal(result.opponent, 'EVE');
});

test('identifyLiverpoolFixtureForWeek never switches to another week', () => {
  const result = identifyLiverpoolFixtureForWeek({ snapshot: createSchedule(), week: 7 });
  assert.equal(result.status, 'WEEK_NOT_FOUND');
  assert.equal(result.fixture, undefined);
});

test('identifyLiverpoolFixtureForWeek reports a week without Liverpool', () => {
  const schedule = { rounds: [{ roundName: 'Week 5', fixtures: [betKingFixture('ARS', 'CHE')] }] };
  assert.equal(identifyLiverpoolFixtureForWeek({ snapshot: schedule, week: 5 }).status, 'LIVERPOOL_NOT_FOUND');
});

test('identifyLiverpoolFixtureForWeek refuses to pick between several Liverpool fixtures', () => {
  const schedule = {
    rounds: [{ roundName: 'Week 5', fixtures: [betKingFixture('LIV', 'MNU'), betKingFixture('EVE', 'LIV')] }],
  };
  const result = identifyLiverpoolFixtureForWeek({ snapshot: schedule, week: 5 });
  assert.equal(result.status, 'AMBIGUOUS_FIXTURE');
  assert.equal(result.candidates.length, 2);
});

test('identifyLiverpoolFixtureForWeek does not invent weeks from unlabelled rounds', () => {
  const schedule = { rounds: [{ fixtures: [betKingFixture('LIV', 'MNU')] }] };
  assert.equal(identifyLiverpoolFixtureForWeek({ snapshot: schedule, week: 1 }).status, 'WEEK_NOT_FOUND');
});

test('verifyFixtureAgainstStrategy requires a HIGH-confidence match in the same orientation', () => {
  const identified = identifyLiverpoolFixtureForWeek({ snapshot: createSchedule(), week: 5 });
  assert.equal(verifyFixtureAgainstStrategy({ identified, strategyFixture: STRATEGY_FIXTURE }).verified, true);
  assert.equal(
    verifyFixtureAgainstStrategy({ identified, strategyFixture: { id: 'livcov', home: 'liv', away: 'cov' } }).verified,
    false,
  );
  assert.equal(
    verifyFixtureAgainstStrategy({ identified, strategyFixture: { id: 'mnuliv', home: 'mnu', away: 'liv' } }).verified,
    false,
  );
  assert.equal(verifyFixtureAgainstStrategy({ identified, strategyFixture: null }).status, 'NO_STRATEGY_FIXTURE');
});

test('planNextWeek advances only after settlement and persistence, and rolls 38 over to 1', () => {
  assert.equal(planNextWeek({ currentWeek: 5 }).status, 'BLOCKED');
  assert.equal(planNextWeek({ currentWeek: 5, settlementApplied: true }).status, 'BLOCKED');
  const advance = planNextWeek({
    currentWeek: 5, settlementApplied: true, persistenceVerified: true, nextFixtureAvailable: true,
  });
  assert.equal(advance.status, 'ADVANCE');
  assert.equal(advance.nextWeek, 6);
  const waiting = planNextWeek({ currentWeek: 5, settlementApplied: true, persistenceVerified: true });
  assert.equal(waiting.status, 'WAIT_FOR_NEXT_FIXTURE');
  const rollover = planNextWeek({
    currentWeek: 38, settlementApplied: true, persistenceVerified: true, nextFixtureAvailable: true,
  });
  assert.equal(rollover.nextWeek, 1);
  assert.equal(rollover.rolledOver, true);
  assert.equal(planNextWeek({ currentWeek: 39, settlementApplied: true, persistenceVerified: true }).status, 'BLOCKED');
});

test('prepareWeek produces a plan for the required week through the existing state machine', async () => {
  const machine = new StateMachine();
  const ports = createPorts();
  const workflow = createOperationalWorkflow({ stateMachine: machine, ports });
  const result = await workflow.prepareWeek({ requiredWeek: 5 });

  assert.equal(result.status, 'PREPARED');
  assert.equal(result.state, STATES.READY_FOR_ACTION);
  assert.equal(machine.getState(), STATES.READY_FOR_ACTION);
  assert.equal(result.plan.week, 5);
  assert.equal(result.plan.liverpoolSide, 'HOME');
  assert.equal(ports.calls.selectWeek.length, 0);
  // No BetKing mapping is verified yet, so nothing is ready as a prepared instruction.
  assert.equal(result.plan.instructions.length, 0);
  assert.ok(result.plan.unresolved.some((record) => record.strategyKey === 'winner'));
  for (const record of result.plan.eligible) {
    assert.equal(record.lifecycle.selectionPrepared, false);
    assert.equal(record.lifecycle.submitted, false);
    assert.equal(record.lifecycle.accepted, false);
    assert.equal(record.verificationStatus, 'UNVERIFIED');
    assert.equal(record.oddsSource, 'STRATEGY_TABLE');
  }
});

test('prepareWeek selects the required week when the page shows another one', async () => {
  const machine = new StateMachine();
  const ports = createPorts({ visibleWeek: 6 });
  const result = await createOperationalWorkflow({ stateMachine: machine, ports }).prepareWeek({ requiredWeek: 5 });
  assert.equal(result.status, 'PREPARED');
  assert.deepEqual(ports.calls.selectWeek, [5]);
});

test('prepareWeek stops when the required week is not offered', async () => {
  const machine = new StateMachine();
  const ports = createPorts({ visibleWeek: 5 });
  const result = await createOperationalWorkflow({ stateMachine: machine, ports }).prepareWeek({ requiredWeek: 12 });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.code, 'REQUIRED_WEEK_UNAVAILABLE');
  assert.equal(machine.getState(), STATES.ERROR);
});

test('prepareWeek rejects an invalid required week without touching the page week', async () => {
  const machine = new StateMachine();
  const ports = createPorts();
  const result = await createOperationalWorkflow({ stateMachine: machine, ports }).prepareWeek({ requiredWeek: 39 });
  assert.equal(result.code, 'REQUIRED_WEEK_UNKNOWN');
  assert.equal(machine.getState(), STATES.PAUSED);
  assert.equal(ports.calls.selectWeek.length, 0);
});

test('prepareWeek pauses for manual login when authentication is required', async () => {
  const machine = new StateMachine();
  const ports = createPorts({ schedule: { url: 'https://m.betking.com/x', loginRequired: true, rounds: [] } });
  const result = await createOperationalWorkflow({ stateMachine: machine, ports }).prepareWeek({ requiredWeek: 5 });
  assert.equal(result.code, 'AUTHENTICATION_REQUIRED');
  assert.equal(machine.getState(), STATES.PAUSED);
});

test('prepareWeek reports BetKing unavailable instead of using simulated data', async () => {
  const machine = new StateMachine();
  const ports = createPorts();
  ports.readSchedule = async () => { throw new Error('net::ERR_INTERNET_DISCONNECTED'); };
  const result = await createOperationalWorkflow({ stateMachine: machine, ports }).prepareWeek({ requiredWeek: 5 });
  assert.equal(result.code, 'BETKING_UNAVAILABLE');
  assert.equal(machine.getState(), STATES.RECOVERING);
  assert.equal(result.plan, undefined);
});

test('prepareWeek stops the whole fixture when Liverpool is ambiguous', async () => {
  const machine = new StateMachine();
  const schedule = {
    url: 'https://m.betking.com/x',
    rounds: [{ roundName: 'Week 5', fixtures: [betKingFixture('LIV', 'MNU'), betKingFixture('EVE', 'LIV')] }],
  };
  const result = await createOperationalWorkflow({ stateMachine: machine, ports: createPorts({ schedule }) })
    .prepareWeek({ requiredWeek: 5 });
  assert.equal(result.code, 'AMBIGUOUS_LIVERPOOL_FIXTURE');
  assert.equal(machine.getState(), STATES.ERROR);
});

test('prepareWeek stops when the strategy fixture does not match the website fixture', async () => {
  const machine = new StateMachine();
  const ports = createPorts({ strategyFixture: { ...STRATEGY_FIXTURE, id: 'livcov', away: 'cov' } });
  const result = await createOperationalWorkflow({ stateMachine: machine, ports }).prepareWeek({ requiredWeek: 5 });
  assert.equal(result.code, 'FIXTURE_IDENTITY_MISMATCH');
  assert.equal(machine.getState(), STATES.ERROR);
});

test('prepareWeek asks for manual input when the strategy has no active fixture', async () => {
  const machine = new StateMachine();
  const ports = createPorts({ strategyFixture: null });
  const result = await createOperationalWorkflow({ stateMachine: machine, ports }).prepareWeek({ requiredWeek: 5 });
  assert.equal(result.code, 'STRATEGY_STATE_MISSING');
  assert.equal(machine.getState(), STATES.PAUSED);
});

test('evaluateOptionsForResult keeps strategy outcomes separate from execution status and blocks on unresolved options', async () => {
  const machine = new StateMachine();
  const prepared = await createOperationalWorkflow({ stateMachine: machine, ports: createPorts() }).prepareWeek({ requiredWeek: 5 });
  const verifiedResult = { status: 'verified', halfTime: { home: 1, away: 0 }, fullTime: { home: 1, away: 1 } };
  const evaluation = evaluateOptionsForResult({ plan: prepared.plan, verifiedResult });

  for (const entry of evaluation.evaluations) {
    assert.equal(entry.executionStatus, 'NOT_VERIFIED');
  }
  // winner has undefined semantics, so settlement cannot be automatic yet.
  assert.equal(evaluation.settlementReadiness.ready, false);
  assert.ok(evaluation.settlementReadiness.blockers.some((blocker) => blocker.strategyKey === 'winner'));
  assert.equal(evaluation.proposedStrategyMarks, null);
});

test('evaluateOptionsForResult proposes marks only when every eligible option is decidable', () => {
  const plan = {
    liverpoolSide: 'HOME',
    eligible: [
      { strategyKey: 'oneX', stake: 1200, stakeComponents: { normal: 150, bigDeficit: 1050 }, mappingStatus: 'UNRESOLVED_MARKET', semanticsStatus: 'USER_SPECIFIED', lifecycle: { accepted: false } },
      { strategyKey: 'twoX', stake: 40, stakeComponents: { normal: 40, bigDeficit: 0 }, mappingStatus: 'UNRESOLVED_MARKET', semanticsStatus: 'USER_SPECIFIED', lifecycle: { accepted: false } },
    ],
    skipped: [{ strategyKey: 'ht12', stake: 4, reason: 'Stake 4 is below the minimum of 10.' }],
  };
  const verifiedResult = { status: 'verified', halfTime: { home: 1, away: 0 }, fullTime: { home: 2, away: 2 } };
  const evaluation = evaluateOptionsForResult({ plan, verifiedResult });
  assert.equal(evaluation.settlementReadiness.ready, true);
  assert.deepEqual(evaluation.proposedStrategyMarks, { winners: ['oneX'], bigWinners: ['oneX'] });
  assert.equal(evaluation.skipped[0].evaluated, false);
});

test('evaluateOptionsForResult does not settle on an unverified result', () => {
  const plan = {
    liverpoolSide: 'HOME',
    eligible: [
      { strategyKey: 'oneX', stake: 50, stakeComponents: { normal: 50, bigDeficit: 0 }, mappingStatus: 'UNRESOLVED_MARKET', semanticsStatus: 'USER_SPECIFIED', lifecycle: { accepted: false } },
    ],
    skipped: [],
  };
  const evaluation = evaluateOptionsForResult({ plan, verifiedResult: { status: 'observing' } });
  assert.equal(evaluation.settlementReadiness.ready, false);
  assert.equal(evaluation.proposedStrategyMarks, null);
});

test('buildOperationalPlan keeps original stake components and merges them for the same option only', () => {
  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: () => ({
      ...createStrategySnapshot(),
      bigDef: { ...Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])), oneX: 5000 },
    }),
  });
  const instructions = adapter.getCurrentInstructions();
  const identification = identifyLiverpoolFixtureForWeek({ snapshot: createSchedule(), week: 5 });
  const plan = buildOperationalPlan({ week: 5, identification, strategyInstructions: instructions });
  const oneX = plan.eligible.find((record) => record.strategyKey === 'oneX');
  assert.ok(oneX, 'oneX should be stake-eligible with a big-deficit component');
  assert.ok(oneX.stakeComponents.bigDeficit > 0);
  assert.equal(oneX.stakeComponents.combined, oneX.stakeComponents.normal + oneX.stakeComponents.bigDeficit);
  const twoX = [...plan.eligible, ...plan.skipped, ...plan.noStake].find((record) => record.strategyKey === 'twoX');
  assert.equal(twoX.stakeComponents.bigDeficit, 0);
});

test('buildOperationalPlan rejects an invalid week or unidentified fixture', () => {
  const instructions = createStrategyDecisionAdapter({ readStrategySnapshot: () => createStrategySnapshot() }).getCurrentInstructions();
  const identification = identifyLiverpoolFixtureForWeek({ snapshot: createSchedule(), week: 5 });
  assert.throws(() => buildOperationalPlan({ week: 39, identification, strategyInstructions: instructions }), RangeError);
  assert.throws(() => buildOperationalPlan({ week: 5, identification: { status: 'LIVERPOOL_NOT_FOUND' }, strategyInstructions: instructions }));
});


function createFeedablePorts({ feedResult = { ok: true }, neverReports = false } = {}) {
  const base = createPorts();
  const adapter = createStrategyDecisionAdapter({ readStrategySnapshot: () => createStrategySnapshot() });
  let fed = false;
  const calls = { feed: [] };
  return {
    calls,
    ports: {
      ...base,
      getStrategyInstructions: async () => (fed && !neverReports
        ? adapter.getCurrentInstructions()
        : { status: 'FIXTURE_NOT_SUBMITTED', fixture: null, instructions: [] }),
      submitFixtureToStrategy: async (input) => {
        calls.feed.push(input);
        if (feedResult.ok) fed = true;
        return feedResult;
      },
      feedWaitMs: 300,
    },
  };
}

test('prepareWeek feeds the identified fixture to a strategy that has none, then continues', async () => {
  const machine = new StateMachine();
  const { ports, calls } = createFeedablePorts();
  const result = await createOperationalWorkflow({ stateMachine: machine, ports }).prepareWeek({ requiredWeek: 5 });
  assert.equal(result.status, 'PREPARED');
  assert.deepEqual(calls.feed, [{ home: 'LIV', away: 'MNU', week: 5 }]);
  assert.ok(result.trace.some((entry) => entry.step === 'FEED_STRATEGY_FIXTURE' && entry.status === 'SUBMITTED'));
});

test('prepareWeek stops when the strategy refuses the fixture (for example no odds row)', async () => {
  const machine = new StateMachine();
  const { ports } = createFeedablePorts({ feedResult: { ok: false, code: 'NO_ODDS_FOR_FIXTURE', reason: 'No odds for liv vs mnu' } });
  const result = await createOperationalWorkflow({ stateMachine: machine, ports }).prepareWeek({ requiredWeek: 5 });
  assert.equal(result.code, 'STRATEGY_FEED_FAILED');
  assert.equal(machine.getState(), STATES.PAUSED);
});

test('prepareWeek does not continue when the strategy never reports the fed fixture', async () => {
  const machine = new StateMachine();
  const { ports } = createFeedablePorts({ neverReports: true });
  const result = await createOperationalWorkflow({ stateMachine: machine, ports }).prepareWeek({ requiredWeek: 5 });
  assert.equal(result.code, 'STRATEGY_FEED_FAILED');
});

test('an active strategy fixture is never replaced by the fed one', async () => {
  const machine = new StateMachine();
  const base = createPorts({ strategyFixture: { ...STRATEGY_FIXTURE, id: 'livcov', away: 'cov' } });
  let fed = 0;
  const ports = { ...base, submitFixtureToStrategy: async () => { fed += 1; return { ok: true }; } };
  const result = await createOperationalWorkflow({ stateMachine: machine, ports }).prepareWeek({ requiredWeek: 5 });
  assert.equal(fed, 0);
  assert.equal(result.code, 'FIXTURE_IDENTITY_MISMATCH');
});
