// Operational workflow for processing the Liverpool fixture of one game week.
//
// This module is the single place that defines:
//   * the ordered workflow steps and how each maps onto the EXISTING state machine
//   * the failure policy for every failure condition
//   * pure planning functions (week alignment, Liverpool fixture identification,
//     instruction preparation, per-option evaluation, next-week planning)
//   * a thin coordinator that drives steps 1-9 through injected ports
//
// It deliberately does NOT contain strategy formulas, settlement conditions, or
// browser code. Stakes come from the existing strategy via the decision adapter,
// rules come from rules.js, identity scoring comes from fixtureIdentity.js, and
// all website access happens behind ports. Nothing here clicks a selection,
// populates a bet slip, submits a wager, or applies a settlement.

const { STATES } = require('../stateMachine');
const {
  BETKING_STATUSES,
  classifyBetKingPage,
  normalizeBetKingSnapshot,
} = require('../sportsbook/betkingAdapter');
const {
  FIXTURE_IDENTITY_CONFIDENCE,
  calculateIdentityMatch,
  createBetKingFixtureIdentity,
  createCatalogueaFixtureIdentity,
  normalizeTeamCode,
} = require('./fixtureIdentity');
const {
  SIDE_STATUS,
  determineLiverpoolSide,
} = require('./liverpoolPerspective');
const {
  SETTLEMENT_OUTCOMES,
  evaluateResultAgainstStrategy,
  resolveSkippedOptionTreatment,
} = require('./rules');
const {
  assessWeekAlignment,
  isValidWeek,
  nextWeek,
  parseWeek,
} = require('./seasonWeek');

// ---------------------------------------------------------------------------
// Failure policies
// ---------------------------------------------------------------------------

const FAILURE_ACTIONS = Object.freeze({
  RETRY: 'RETRY',
  WAIT: 'WAIT',
  MANUAL_INTERVENTION: 'MANUAL_INTERVENTION',
  MARK_UNRESOLVED: 'MARK_UNRESOLVED',
  STOP_FIXTURE: 'STOP_FIXTURE',
  RESUME_FROM_CHECKPOINT: 'RESUME_FROM_CHECKPOINT',
  SKIP_OPTION: 'SKIP_OPTION',
  IGNORE_DUPLICATE: 'IGNORE_DUPLICATE',
  RECALCULATE: 'RECALCULATE',
});

function policy(code, action, fallback, description) {
  return Object.freeze({ code, action, fallback, description });
}

// Every failure has a primary action and an optional fallback used when the
// primary action is exhausted (retries are bounded by config.recoveryMaxAttempts
// with the existing recovery backoff). No failure is ever converted into an
// invented success, and no failure may fall back to simulated data.
const FAILURE_POLICIES = Object.freeze(Object.fromEntries([
  policy('BETKING_UNAVAILABLE', 'RETRY', 'MANUAL_INTERVENTION',
    'BetKing is unreachable or the page snapshot is empty. Retry with bounded backoff, then ask the user to check the connection/site.'),
  policy('AUTHENTICATION_REQUIRED', 'MANUAL_INTERVENTION', null,
    'Pause with the visible browser open; the user signs in manually. Credentials are never requested or entered by the automation.'),
  policy('SESSION_EXPIRED', 'MANUAL_INTERVENTION', null,
    'Pause and ask the user to sign in again, then re-verify page, week, and fixture before continuing.'),
  policy('ACCESS_RESTRICTED', 'MANUAL_INTERVENTION', null,
    'The site reports restricted access. Stop and report; no access-control bypass is attempted.'),
  policy('SCHEDULE_NOT_VISIBLE', 'WAIT', 'MANUAL_INTERVENTION',
    'The league or its fixtures are not visible yet. Wait (bounded), then ask the user to check the page.'),
  policy('REQUIRED_WEEK_UNKNOWN', 'MANUAL_INTERVENTION', null,
    'No valid required week (1-38) is available from the workflow checkpoint. Ask the user to supply the target week.'),
  policy('REQUIRED_WEEK_UNAVAILABLE', 'STOP_FIXTURE', null,
    'The required week is not offered by the website. Do not process another week; preserve state and report.'),
  policy('WRONG_WEEK_SELECTED', 'RETRY', 'STOP_FIXTURE',
    'After selecting, the page does not show the required week. Re-select once or twice, then stop the fixture.'),
  policy('LIVERPOOL_FIXTURE_NOT_FOUND', 'STOP_FIXTURE', null,
    'Liverpool does not appear in the selected week. Report; never switch week or fixture.'),
  policy('AMBIGUOUS_LIVERPOOL_FIXTURE', 'STOP_FIXTURE', null,
    'More than one candidate Liverpool fixture. Never pick one arbitrarily; stop the whole fixture.'),
  policy('FIXTURE_IDENTITY_MISMATCH', 'STOP_FIXTURE', null,
    'The website fixture does not match the strategy fixture with HIGH confidence (teams, home/away order, id). Stop the whole fixture.'),
  policy('STRATEGY_STATE_MISSING', 'MANUAL_INTERVENTION', null,
    'The strategy has no active fixture/stakes (or could not be read). Ask the user to submit the fixture in Cataloguea.'),
  policy('STALE_STRATEGY_STATE', 'RECALCULATE', 'MANUAL_INTERVENTION',
    'The strategy changed after decisions were calculated. Discard the old decisions, re-read, recompute.'),
  policy('STAKE_NOT_CALCULATED', 'MARK_UNRESOLVED', null,
    'No stake exists for the option. Mark it NO_STAKE_CALCULATED and continue with independent options.'),
  policy('STAKE_BELOW_MINIMUM', 'SKIP_OPTION', null,
    'Final (combined) stake is below NGN 10. Skip the option, preserve the original stake, continue with the rest. Never round up.'),
  policy('UNRESOLVED_MARKET_MAPPING', 'MARK_UNRESOLVED', null,
    'Stake qualifies but the BetKing market/selection mapping is not verified. Report separately; do not substitute a similar market.'),
  policy('MISSING_MARKET_SELECTION', 'MARK_UNRESOLVED', null,
    'The market exists but the exact selection could not be located. Mark the option unresolved.'),
  policy('MISSING_ODDS', 'MARK_UNRESOLVED', null,
    'No odds were read for the selection. Odds are never invented; the option is not prepared.'),
  policy('FIXTURE_STARTS_LATER', 'WAIT', 'MANUAL_INTERVENTION',
    'The fixture has not started when expected. Wait on the real fixture state (never a fixed 30 s assumption), bounded.'),
  policy('LIVE_FIXTURE_NOT_LOCATED', 'RETRY', 'MANUAL_INTERVENTION',
    'The live view of the correct fixture cannot be found. Retry bounded, then ask the user.'),
  policy('HALFTIME_SCORE_UNAVAILABLE', 'MARK_UNRESOLVED', null,
    'No verified half-time score. Half-time-dependent options stay unresolved/pending; the half-time score is never inferred from the final score.'),
  policy('FULLTIME_RESULT_UNAVAILABLE', 'WAIT', 'MANUAL_INTERVENTION',
    'The full-time result is not available yet. Poll boundedly via the result poller, then ask the user. Never invent a score.'),
  policy('INTERNET_DISCONNECTED', 'RESUME_FROM_CHECKPOINT', 'MANUAL_INTERVENTION',
    'Treat as a failure, not a result. After reconnecting re-verify page, week, and fixture, re-read data, then continue from the last verified checkpoint.'),
  policy('BROWSER_CRASH', 'RESUME_FROM_CHECKPOINT', 'MANUAL_INTERVENTION',
    'Relaunch the visible browser with the persistent profile and resume from the last verified checkpoint.'),
  policy('DUPLICATE_RESULT', 'IGNORE_DUPLICATE', null,
    'The same completed result was observed again. Do not re-evaluate or re-settle.'),
  policy('DUPLICATE_SETTLEMENT', 'IGNORE_DUPLICATE', null,
    'A settlement receipt already exists for this result. Return already_settled; apply nothing.'),
  policy('PERSISTENCE_FAILED', 'MANUAL_INTERVENTION', null,
    'Updated strategy state was not saved. Settlement is UNKNOWN: pause, do not advance the week, do not re-apply blindly.'),
  policy('NEXT_WEEK_FIXTURES_MISSING', 'WAIT', 'MANUAL_INTERVENTION',
    'The next week fixture is not yet published. Preserve state and wait in a documented pending state.'),
  policy('STRATEGY_FEED_FAILED', 'MANUAL_INTERVENTION', null,
    'The identified fixture could not be fed to the strategy: the opponent has no odds row in the strategy data, a different fixture is already active, or the strategy did not report the fixture. Odds are never invented; add the missing row or settle the active fixture first.'),
  policy('MARKET_CATEGORY_NOT_OPENED', 'RETRY', 'MARK_UNRESOLVED',
    'The requested category did not become active. Retry (bounded), then mark the option unresolved; never select an odd from another category.'),
  policy('FIXTURE_ROW_NOT_AVAILABLE', 'RETRY', 'STOP_FIXTURE',
    'The confirmed fixture\'s row is missing, duplicated, or collapsed. Re-read, then stop the fixture; never use another row.'),
  policy('MARKET_SELECTION_NOT_FOUND', 'MARK_UNRESOLVED', null,
    'The exact selection label is not offered for the fixture in this category. Mark the option unresolved; never substitute a similar label.'),
  policy('ODDS_UNAVAILABLE', 'MARK_UNRESOLVED', null,
    'No valid odds for the identified selection. Odds are never invented.'),
  policy('ODDS_CHANGED', 'RETRY', 'MARK_UNRESOLVED',
    'The odds changed between reading and selecting (or in the slip). Re-read once; the new price must be accepted by a person, not assumed.'),
  policy('SLIP_NOT_EMPTY', 'MANUAL_INTERVENTION', null,
    'The slip already holds selections. They are never cleared automatically; clear them yourself, then continue.'),
  policy('SELECTION_NOT_ADDED', 'MARK_UNRESOLVED', null,
    'No observable evidence that the selection was added. The click may have worked: re-read the slip before any retry; never click blindly again.'),
  policy('BET_SLIP_MISMATCH', 'MANUAL_INTERVENTION', null,
    'The slip differs from the strategy (fixture, market, selection, odds, stake, extra or duplicate selection). Do not authorize; fix or clear it yourself.'),
  policy('SLIP_EXPIRING', 'WAIT', 'MARK_UNRESOLVED',
    'The "Next event will expire in" countdown is too low to review safely. Abandon this slip; prepare it again for the next event.'),
  policy('AUTHORIZATION_REQUIRED', 'MANUAL_INTERVENTION', null,
    'Only a person may place a bet. The program stops here and never submits.'),
].map((entry) => [entry.code, entry])));

// Existing state-machine state used when an action needs the machine to move.
const STATE_FOR_ACTION = Object.freeze({
  [FAILURE_ACTIONS.RETRY]: STATES.RECOVERING,
  [FAILURE_ACTIONS.RESUME_FROM_CHECKPOINT]: STATES.RECOVERING,
  [FAILURE_ACTIONS.MANUAL_INTERVENTION]: STATES.PAUSED,
  [FAILURE_ACTIONS.STOP_FIXTURE]: STATES.ERROR,
});

// ---------------------------------------------------------------------------
// Workflow definition (conceptual steps -> existing machine states)
// ---------------------------------------------------------------------------

function step(id, machineState, summary, success, failures, recovery) {
  return Object.freeze({ id, machineState, summary, success, failures: Object.freeze(failures), recovery });
}

const WORKFLOW_STEPS = Object.freeze([
  step('START', STATES.IDLE, 'Run created; nothing observed yet.',
    'A run id exists.', [], 'Nothing to recover.'),
  step('OPEN_BETKING', STATES.INITIALIZING, 'Open the real BetKing Kings League scheduled page in the visible persistent-profile browser.',
    'Page snapshot received from the real site.', ['BETKING_UNAVAILABLE', 'BROWSER_CRASH'], 'Bounded retry, then manual intervention. Never fall back to the local simulation.'),
  step('WAIT_FOR_MANUAL_LOGIN_IF_REQUIRED', STATES.PAUSED, 'If the site requires sign-in, pause for the user to sign in manually.',
    'Schedule/odds are visible without an authentication gate.', ['AUTHENTICATION_REQUIRED', 'SESSION_EXPIRED'], 'Resume via RECOVERING after the user confirms; re-verify page access.'),
  step('VERIFY_PAGE_ACCESS', STATES.INITIALIZING, 'Classify the page (accessible, restricted, no league/fixtures).',
    'Classification is accessible (not restricted/unavailable).', ['BETKING_UNAVAILABLE', 'ACCESS_RESTRICTED', 'SCHEDULE_NOT_VISIBLE'], 'Wait/retry bounded; restricted access stops the run.'),
  step('IDENTIFY_CURRENT_STRATEGY_WEEK', STATES.OBSERVING, 'Determine the required week (1-38) from the workflow checkpoint; the strategy state has no week field.',
    'Required week is a valid integer 1-38.', ['REQUIRED_WEEK_UNKNOWN'], 'Ask the user for the target week.'),
  step('SELECT_REQUIRED_WEEK', STATES.OBSERVING, 'If the visible week differs from the required week and the required week is offered, select it.',
    'Selection action completed.', ['REQUIRED_WEEK_UNAVAILABLE', 'WRONG_WEEK_SELECTED'], 'Never process a different week.'),
  step('VERIFY_SELECTED_WEEK', STATES.OBSERVING, 'Re-read the page: required, visible, and selected week must agree.',
    'All three weeks are equal.', ['WRONG_WEEK_SELECTED'], 'Re-select (bounded) or stop the fixture.'),
  step('IDENTIFY_LIVERPOOL_FIXTURE', STATES.FINDING_MATCH, 'Find the single Liverpool fixture in the selected week; record home/away and opponent.',
    'Exactly one Liverpool fixture identified.', ['LIVERPOOL_FIXTURE_NOT_FOUND', 'AMBIGUOUS_LIVERPOOL_FIXTURE'], 'Stop the fixture; never switch week.'),
  step('VERIFY_FIXTURE_IDENTITY', STATES.MATCH_VERIFICATION, 'Check week + teams + fixture id are mutually consistent on the website, then (after reading the strategy) match against the strategy fixture with HIGH confidence.',
    'Identity verified.', ['FIXTURE_IDENTITY_MISMATCH'], 'Stop the whole fixture.'),
  step('FEED_STRATEGY_FIXTURE', STATES.OBSERVING_STRATEGY, 'If the strategy has no active fixture, feed it the identified Liverpool fixture (home and away team codes) through the strategy\'s own submit routine. An existing active fixture is never replaced; a missing odds row is never invented.',
    'The strategy reports the same fixture as active with its stakes calculated.', ['STRATEGY_FEED_FAILED'], 'Add the missing team odds row to the strategy data, or settle the active fixture first.'),
  step('READ_STRATEGY_STATE', STATES.OBSERVING_STRATEGY, 'Read the existing Solo Matrix state through the decision adapter.',
    'A strategy snapshot with an active fixture was read.', ['STRATEGY_STATE_MISSING', 'STALE_STRATEGY_STATE'], 'Manual submission in Cataloguea, or recalculate.'),
  step('CALCULATE_STAKES', STATES.OBSERVING_STRATEGY, 'Stakes come from the existing strategy functions (submitSoloMatrixFixture); nothing is recomputed in automation.',
    'Per-option normal and big-deficit components obtained.', ['STAKE_NOT_CALCULATED'], 'Mark the option unresolved; continue.'),
  step('MERGE_APPLICABLE_STAKE_COMPONENTS', STATES.OBSERVING_STRATEGY, 'RULE-002: normal + big-deficit of the SAME option become one amount; components are kept for audit.',
    'Combined stake per option.', [], 'Pure computation; recompute on stale state.'),
  step('FILTER_STAKES_BELOW_MINIMUM', STATES.OBSERVING_STRATEGY, 'RULE-001: skip combined stakes below NGN 10; NGN 10 and above qualify.',
    'Each option is QUALIFIES / SKIPPED / INVALID.', ['STAKE_BELOW_MINIMUM'], 'Skip the option; continue.'),
  step('RESOLVE_STRATEGY_MARKETS', STATES.STRATEGY_INSTRUCTION_READY, 'Resolve each eligible option to a canonical type and a VERIFIED BetKing market/selection (currently none are verified).',
    'Mapping status recorded per option.', ['UNRESOLVED_MARKET_MAPPING', 'MISSING_MARKET_SELECTION', 'MISSING_ODDS'], 'Mark unresolved; continue with independent options.'),
  step('PREPARE_QUALIFYING_SELECTIONS', STATES.STRATEGY_INSTRUCTION_READY, 'Build instruction records for eligible options with verified mappings. No selection is clicked.',
    'Instruction records exist (lifecycle: calculated/eligible/market-resolved only).', [], 'Rebuild from the strategy.'),
  step('OPEN_MARKET_CATEGORY', STATES.READY_FOR_ACTION, 'Market-first: open the strategy option\'s verified category (for example HT/FT) and wait until the category is active and the fixture\'s selections are visible. No odd is touched.',
    'The page shows the requested category as active and lists selection labels for the confirmed fixture.', ['MARKET_CATEGORY_NOT_OPENED', 'FIXTURE_ROW_NOT_AVAILABLE'], 'Bounded retry; otherwise mark the option unresolved.'),
  step('IDENTIFY_MARKET_SELECTION', STATES.READY_FOR_ACTION, 'Find the exact selection label (for example 1/X) inside that category for that fixture; its home/away teams must equal the confirmed fixture.',
    'Exactly one label matches and belongs to the confirmed fixture.', ['MARKET_SELECTION_NOT_FOUND'], 'Mark the option unresolved; never pick a similar label.'),
  step('VERIFY_ODDS', STATES.READY_FOR_ACTION, 'Read the selection\'s odd; it must be a valid price and must not change before it is selected.',
    'A valid, stable decimal price.', ['ODDS_UNAVAILABLE', 'ODDS_CHANGED'], 'Re-read once; otherwise mark the option unresolved.'),
  step('ADD_SELECTION_TO_SLIP', STATES.READY_FOR_ACTION, 'Only with --through select or slip, and only after RULE-006 allows it: the slip must be empty, then click the identified odd.',
    'The slip summary shows exactly 1 selection at the selected price.', ['SLIP_NOT_EMPTY', 'SELECTION_NOT_ADDED'], 'Never click again blindly: re-read the slip first.'),
  step('VERIFY_BET_SLIP', STATES.READY_FOR_ACTION, 'Only with --through slip: open the slip, enter the strategy stake, and compare fixture, market, selection, odds, stake, week, and expiry with the strategy.',
    'No blocking mismatch; one selection; stake equals the strategy stake.', ['BET_SLIP_MISMATCH', 'SLIP_EXPIRING'], 'Do not authorize; correct manually or let the slip expire.'),
  step('AWAITING_AUTHORIZATION', STATES.READY_FOR_ACTION, 'The last stage this project reaches. A person decides and places the bet; no code path submits a wager.',
    'Nothing submitted; the authorization request is shown.', ['AUTHORIZATION_REQUIRED'], 'Wait for the person; the slip expires with the round.'),
  step('VERIFY_PREPARED_INSTRUCTIONS', STATES.READY_FOR_ACTION, 'Present qualifying, skipped, and unresolved options with reasons for human review.',
    'Plan produced; the workflow is ready for review.', [], 'Re-run preparation.'),
  step('WAIT_FOR_MATCH', STATES.WAITING_FOR_RESULT, 'Wait for the real fixture to start/finish using the website state, not a fixed duration.',
    'Fixture observed in progress or completed.', ['FIXTURE_STARTS_LATER', 'INTERNET_DISCONNECTED'], 'Wait/resume from checkpoint.'),
  step('MONITOR_LIVERPOOL_FIXTURE', STATES.WAITING_FOR_RESULT, 'Observe the SAME fixture (live observer); record scores with timestamps.',
    'Observations tied to the verified fixture.', ['LIVE_FIXTURE_NOT_LOCATED', 'INTERNET_DISCONNECTED'], 'Retry; re-confirm fixture identity after reconnecting.'),
  step('CAPTURE_HALFTIME_RESULT_WHEN_AVAILABLE', STATES.WAITING_FOR_RESULT, 'Keep the half-time score separate from the full-time score.',
    'Verified half-time score captured.', ['HALFTIME_SCORE_UNAVAILABLE'], 'Dependent options stay unresolved.'),
  step('DETECT_MATCH_COMPLETION', STATES.RESULT_DETECTED, 'Detect an explicit completed state (never "30 seconds elapsed").',
    'Explicit completion observed.', ['FULLTIME_RESULT_UNAVAILABLE'], 'Bounded polling.'),
  step('OBTAIN_FULLTIME_RESULT', STATES.RESULT_VERIFIED, 'Obtain the full-time score from a verified source for the correct fixture.',
    'Verified result with separate halfTime/fullTime.', ['FULLTIME_RESULT_UNAVAILABLE', 'DUPLICATE_RESULT'], 'Bounded polling; ignore duplicates.'),
  step('EVALUATE_QUALIFYING_OPTIONS', STATES.RESULT_VERIFIED, 'Evaluate each stake-eligible option with RULE-003 (strategy outcome, separate from execution status).',
    'WON/LOST/unresolved per option; settlement readiness computed.', [], 'Re-evaluate; unresolved options block automatic settlement.'),
  step('CHECK_FOR_DUPLICATE_SETTLEMENT', STATES.RESULT_VERIFIED, 'Look for an existing settlement receipt for this result identity.',
    'No prior receipt, or already_settled returned.', ['DUPLICATE_SETTLEMENT'], 'Return already_settled.'),
  step('SETTLE_STRATEGY', STATES.SETTLING_STRATEGY, 'Apply the result once through the existing strategy settlement function (NOT wired in this stage).',
    'Strategy confirms settled.', ['PERSISTENCE_FAILED'], 'SETTLEMENT_UNKNOWN then PAUSED; never re-apply blindly.'),
  step('VERIFY_PERSISTENCE', STATES.SETTLEMENT_CONFIRMED, 'Confirm the updated strategy state was persisted.',
    'Persistence verified.', ['PERSISTENCE_FAILED'], 'Pause; do not advance the week.'),
  step('GENERATE_NEXT_WEEK', STATES.SETTLEMENT_CONFIRMED, 'Compute the next week (38 rolls over to 1) only after settlement + persistence.',
    'Next week determined.', [], 'Blocked until settlement and persistence are confirmed.'),
  step('WAIT_FOR_NEXT_FIXTURE_OR_CONTINUE', STATES.WAITING_FOR_NEXT_FIXTURE, 'Wait for the next fixture or continue to the next week.',
    'Next fixture available (then back to OBSERVING).', ['NEXT_WEEK_FIXTURES_MISSING'], 'Preserve state; wait or stop in a documented pending state.'),
]);

// ---------------------------------------------------------------------------
// Instruction lifecycle (never interchangeable)
// ---------------------------------------------------------------------------

const INSTRUCTION_STAGES = Object.freeze([
  'CALCULATED',
  'ELIGIBLE',
  'MARKET_RESOLVED',
  'SELECTION_PREPARED',
  'BET_SLIP_VERIFIED',
  'SUBMITTED',
  'ACCEPTED',
]);

function createLifecycle({ calculated = false, eligible = false, marketResolved = false } = {}) {
  // Stage 27 only ever reaches MARKET_RESOLVED. Selection preparation, bet-slip
  // verification, submission, and acceptance are not implemented and stay false.
  return {
    calculated,
    eligible,
    marketResolved,
    selectionPrepared: false,
    betSlipVerified: false,
    submitted: false,
    accepted: false,
  };
}

// ---------------------------------------------------------------------------
// Pure planning functions
// ---------------------------------------------------------------------------

function roundLabel(rawRound) {
  return rawRound?.roundName ?? rawRound?.name ?? rawRound?.round ?? null;
}

// Weeks visible in a RAW inspector snapshot. Rounds without a parseable week
// label are ignored (their position is never turned into a week number).
function weeksFromSnapshot(snapshot) {
  const rounds = Array.isArray(snapshot?.rounds) ? snapshot.rounds : [];
  return rounds.map((round) => parseWeek(String(roundLabel(round) ?? ''))).filter((week) => week !== null);
}

const FIXTURE_ID_CODES = /^(?:matchup-statistics-button-)?([A-Za-z]{2,4})-([A-Za-z]{2,4})$/;

function identifyLiverpoolFixtureForWeek({ snapshot, week } = {}) {
  const required = parseWeek(week);
  if (required === null) {
    return { status: 'REQUIRED_WEEK_UNKNOWN', week: null, reason: `Invalid week ${JSON.stringify(week)}.` };
  }
  const rawRounds = Array.isArray(snapshot?.rounds) ? snapshot.rounds : [];
  const availableWeeks = weeksFromSnapshot(snapshot);
  const matching = rawRounds.filter((round) => parseWeek(String(roundLabel(round) ?? '')) === required);

  if (matching.length === 0) {
    return {
      status: 'WEEK_NOT_FOUND',
      week: required,
      availableWeeks,
      reason: `Week ${required} is not present in the schedule (available: ${availableWeeks.join(', ') || 'none'}).`,
    };
  }
  if (matching.length > 1) {
    return {
      status: 'AMBIGUOUS_WEEK',
      week: required,
      reason: `Week ${required} appears ${matching.length} times; the round cannot be chosen safely.`,
    };
  }

  const rawRound = matching[0];
  const round = normalizeBetKingSnapshot({ rounds: [rawRound] }).rounds[0];
  const candidates = round.fixtures
    .map((fixture) => ({ fixture, side: determineLiverpoolSide(fixture) }))
    .filter(({ side }) => side.status !== SIDE_STATUS.NOT_FOUND);

  if (candidates.length === 0) {
    return {
      status: 'LIVERPOOL_NOT_FOUND',
      week: required,
      roundName: round.roundName,
      reason: `No Liverpool fixture in week ${required}. No other week was considered.`,
    };
  }
  if (candidates.length > 1 || candidates[0].side.status === SIDE_STATUS.AMBIGUOUS) {
    return {
      status: 'AMBIGUOUS_FIXTURE',
      week: required,
      roundName: round.roundName,
      candidates: candidates.map(({ fixture }) => ({ fixtureId: fixture.fixtureId, home: fixture.home, away: fixture.away })),
      reason: `Week ${required} has ${candidates.length} Liverpool candidates; none was selected.`,
    };
  }

  const { fixture, side } = candidates[0];
  return {
    status: 'IDENTIFIED',
    week: required,
    roundName: round.roundName,
    roundId: round.roundId,
    fixture: {
      fixtureId: fixture.fixtureId,
      scheduledMatchId: fixture.scheduledMatchId,
      home: fixture.home,
      away: fixture.away,
    },
    liverpoolSide: side.side,
    opponent: side.opponent,
    // The scheduled page exposes no live/finished state. UNKNOWN is reported
    // rather than assuming SCHEDULED.
    matchState: typeof fixture.raw?.matchState === 'string' ? fixture.raw.matchState.toUpperCase() : 'UNKNOWN',
    observedIn: 'scheduled',
  };
}

// Website-internal consistency: the codes inside the fixture id (when it has a
// recognisable shape) must equal the home/away teams of the same fixture.
function checkWebsiteFixtureConsistency(identified) {
  const fixtureId = identified?.fixture?.fixtureId;
  const parts = typeof fixtureId === 'string' ? FIXTURE_ID_CODES.exec(fixtureId) : null;
  if (!parts) {
    return { consistent: true, evidence: 'Fixture id has no recognisable team-code shape; no id cross-check possible.' };
  }
  const idHome = normalizeTeamCode(parts[1]);
  const idAway = normalizeTeamCode(parts[2]);
  const home = normalizeTeamCode(identified.fixture.home);
  const away = normalizeTeamCode(identified.fixture.away);
  if (idHome === home && idAway === away) {
    return { consistent: true, evidence: `Fixture id codes ${idHome}-${idAway} match the displayed teams.` };
  }
  return {
    consistent: false,
    evidence: `Fixture id codes ${idHome}-${idAway} disagree with displayed teams ${home}-${away}.`,
  };
}

function verifyFixtureAgainstStrategy({ identified, strategyFixture } = {}) {
  if (!identified?.fixture) {
    return { verified: false, status: 'NO_BETKING_FIXTURE', reason: 'No identified BetKing fixture.' };
  }
  if (!strategyFixture) {
    return { verified: false, status: 'NO_STRATEGY_FIXTURE', reason: 'The strategy has no active fixture.' };
  }
  const catalogueaIdentity = createCatalogueaFixtureIdentity(strategyFixture);
  const betKingIdentity = createBetKingFixtureIdentity(
    { ...identified.fixture, market: '' },
    { roundName: identified.roundName, roundId: identified.roundId },
  );
  const match = calculateIdentityMatch(catalogueaIdentity, betKingIdentity);
  const verified = match.matched && match.confidence === FIXTURE_IDENTITY_CONFIDENCE.HIGH;
  return {
    verified,
    status: verified ? 'VERIFIED' : 'MISMATCH',
    confidence: match.confidence,
    score: match.score,
    reasons: match.reasons,
    reason: verified
      ? 'Strategy fixture matches the BetKing fixture with HIGH confidence.'
      : `Strategy fixture does not match the BetKing fixture with HIGH confidence (${match.confidence}).`,
  };
}

function toInstructionRecord(instruction, context) {
  const lifecycle = createLifecycle({
    calculated: instruction.status !== 'NO_STAKE_CALCULATED',
    eligible: instruction.stakeEligible === true,
    marketResolved: instruction.stakeEligible === true && instruction.betKingMappingStatus !== 'UNRESOLVED_MARKET',
  });
  const hasOdds = typeof instruction.odds === 'number';
  return {
    week: context.week,
    fixture: context.fixture,
    opponent: context.opponent,
    liverpoolSide: context.liverpoolSide,
    strategyKey: instruction.strategyKey,
    strategyLabel: instruction.strategyLabel,
    canonicalBetType: instruction.canonicalId,
    semanticsStatus: instruction.semanticsStatus,
    betKingMarket: instruction.betKingMarket ?? null,
    betKingSelection: instruction.betKingSelection ?? null,
    // For x2 this is the Liverpool-oriented label (X2 home / X1 away). It is a
    // label only; it is NOT a verified BetKing selection.
    orientedSelection: instruction.orientedSelection ?? null,
    stake: instruction.stake,
    stakeComponents: {
      normal: instruction.normalStake,
      bigDeficit: instruction.bigDeficitStake,
      combined: instruction.stake,
    },
    // Odds here come from the strategy odds table, not from BetKing.
    odds: hasOdds ? instruction.odds : null,
    oddsSource: hasOdds ? 'STRATEGY_TABLE' : null,
    oddsStatus: hasOdds ? 'STRATEGY_TABLE_ONLY' : 'MISSING',
    eligibilityStatus: instruction.status,
    stakeQualification: instruction.stakeQualification,
    mappingStatus: instruction.betKingMappingStatus,
    verificationStatus: 'UNVERIFIED',
    lifecycle,
    ruleIds: instruction.ruleIds,
    reason: instruction.reason,
  };
}

// Fingerprint of the strategy-side stake decisions a plan was built from. If the
// strategy changes afterwards (a different fixture, deficits, or stakes) the
// fingerprint differs and the old decisions must not be settled.
function createStakeFingerprint(strategyFixtureId, components) {
  const parts = [...components]
    .sort((a, b) => String(a.strategyKey).localeCompare(String(b.strategyKey)))
    .map((component) => `${component.strategyKey}:${component.normal}:${component.big}`);
  return `${strategyFixtureId}|${parts.join(',')}`;
}

function buildOperationalPlan({ week, identification, strategyInstructions } = {}) {
  if (!isValidWeek(week)) {
    throw new RangeError(`A valid week (1-38) is required to build a plan; received ${week}.`);
  }
  if (identification?.status !== 'IDENTIFIED') {
    throw new Error('A fixture must be identified before building an operational plan.');
  }
  if (!strategyInstructions || strategyInstructions.status !== 'OK') {
    throw new Error('Strategy instructions with status OK are required to build an operational plan.');
  }

  const context = {
    week,
    fixture: { ...identification.fixture },
    opponent: identification.opponent,
    liverpoolSide: identification.liverpoolSide,
  };
  const records = strategyInstructions.instructions.map((instruction) => toInstructionRecord(instruction, context));

  const byStatus = (status) => records.filter((record) => record.eligibilityStatus === status);
  const readyForReview = byStatus('QUALIFYING');
  const unresolved = byStatus('UNRESOLVED_MARKET');
  const skipped = byStatus('SKIPPED_BELOW_MINIMUM');
  const noStake = byStatus('NO_STAKE_CALCULATED');

  return {
    week,
    fixture: context.fixture,
    strategyFixture: strategyInstructions.fixture ? { ...strategyInstructions.fixture } : null,
    stakeFingerprint: createStakeFingerprint(
      strategyInstructions.fixture?.id ?? null,
      records.map((record) => ({
        strategyKey: record.strategyKey,
        normal: record.stakeComponents.normal,
        big: record.stakeComponents.bigDeficit,
      })),
    ),
    allRecords: records,
    opponent: context.opponent,
    liverpoolSide: context.liverpoolSide,
    // Stake-eligible options (>= NGN 10 after merging), whatever their mapping status.
    eligible: [...readyForReview, ...unresolved],
    // Eligible options whose BetKing mapping is verified (instruction records).
    instructions: readyForReview,
    unresolved,
    skipped,
    noStake,
    observedAt: strategyInstructions.observedAt ?? null,
  };
}

// Evaluates the strategy outcome of every stake-eligible option against a
// verified result. This is the STRATEGY evaluation; it is recorded separately
// from execution status, which stays NOT_VERIFIED because wager acceptance is
// not implemented.
function evaluateOptionsForResult({ plan, verifiedResult } = {}) {
  if (!plan || !Array.isArray(plan.eligible)) {
    throw new TypeError('An operational plan is required for evaluation.');
  }
  const resultVerified = verifiedResult?.status === 'verified';

  const evaluations = plan.eligible.map((record) => {
    const evaluation = evaluateResultAgainstStrategy(verifiedResult, record.strategyKey, {
      liverpoolSide: plan.liverpoolSide,
    });
    return {
      strategyKey: record.strategyKey,
      stake: record.stake,
      normalStake: record.stakeComponents.normal,
      bigDeficitStake: record.stakeComponents.bigDeficit,
      outcome: evaluation.outcome,
      reason: evaluation.reason,
      htScore: evaluation.htScore ?? null,
      ftScore: evaluation.ftScore ?? null,
      semanticsStatus: evaluation.semanticsStatus ?? record.semanticsStatus,
      mappingStatus: record.mappingStatus,
      executionStatus: record.lifecycle.accepted ? 'ACCEPTED' : 'NOT_VERIFIED',
    };
  });

  const skipped = plan.skipped.map((record) => {
    const treatment = resolveSkippedOptionTreatment(record.stakeQualification);
    return {
      strategyKey: record.strategyKey,
      stake: record.stake,
      outcome: SETTLEMENT_OUTCOMES.SKIPPED_BELOW_MINIMUM,
      evaluated: false,
      strategyTreatment: treatment.treatment,
      reason: record.reason,
    };
  });

  const blockers = evaluations
    .filter(({ outcome }) => outcome !== SETTLEMENT_OUTCOMES.WON && outcome !== SETTLEMENT_OUTCOMES.LOST)
    .map(({ strategyKey, outcome, reason }) => ({ strategyKey, outcome, reason }));
  if (!resultVerified) {
    blockers.unshift({
      strategyKey: null,
      outcome: SETTLEMENT_OUTCOMES.RESULT_UNVERIFIED,
      reason: 'The result is not verified.',
    });
  }
  const ready = blockers.length === 0;

  // Hand-off for the strategy's own settlement (winners / bigWinners marks).
  // A merged bet that wins wins both of its components. Skipped options get no
  // marks, so the strategy treats them as non-winning.
  const strategyMarks = ready
    ? {
      winners: evaluations.filter((e) => e.outcome === SETTLEMENT_OUTCOMES.WON && e.strategyKey !== 'winner').map((e) => e.strategyKey),
      bigWinners: evaluations
        .filter((e) => e.outcome === SETTLEMENT_OUTCOMES.WON && e.strategyKey !== 'winner' && e.bigDeficitStake > 0)
        .map((e) => e.strategyKey),
    }
    : null;

  return {
    evaluations,
    skipped,
    settlementReadiness: { ready, blockers },
    proposedStrategyMarks: strategyMarks,
    note: 'Strategy outcomes only. No wager is assumed accepted; marks are a proposal and are not applied to the strategy by this module.',
  };
}

function planNextWeek({
  currentWeek,
  settlementApplied = false,
  persistenceVerified = false,
  nextFixtureAvailable = false,
} = {}) {
  if (!isValidWeek(currentWeek)) {
    return { status: 'BLOCKED', fromWeek: currentWeek ?? null, nextWeek: null, rolledOver: false, reason: `Current week ${currentWeek} is not a valid week.` };
  }
  if (!settlementApplied) {
    return { status: 'BLOCKED', fromWeek: currentWeek, nextWeek: null, rolledOver: false, reason: 'The previous settlement has not been applied.' };
  }
  if (!persistenceVerified) {
    return { status: 'BLOCKED', fromWeek: currentWeek, nextWeek: null, rolledOver: false, reason: 'The updated strategy state has not been verified as persisted.' };
  }
  const next = nextWeek(currentWeek);
  return {
    status: nextFixtureAvailable ? 'ADVANCE' : 'WAIT_FOR_NEXT_FIXTURE',
    fromWeek: next.fromWeek,
    nextWeek: next.week,
    rolledOver: next.rolledOver,
    reason: next.rolledOver
      ? 'Week 38 is complete; the next season cycle starts at Week 1.'
      : `Next target is Week ${next.week}.`,
  };
}

// ---------------------------------------------------------------------------
// Coordinator for steps 1-9 (ports only; no browser code here)
// ---------------------------------------------------------------------------
//
// ports.readSchedule()           -> raw inspector snapshot (rounds[], fixtures[]) of the REAL site
// ports.readVisibleWeek()        -> number | "Week 7" | null
// ports.selectWeek(week)         -> navigate the real page to the week
// ports.getStrategyInstructions()-> decision adapter output (existing strategy)
// ports.onCheckpoint(checkpoint) -> optional; called after each step
//
// No port may return simulated data on failure; a failing port is a failure.

// inspectBetKingPage returns { status, reason, snapshot }. A raw snapshot is also
// accepted. Returns the schedule snapshot and, when supplied, the classification.
function unpackSchedule(result) {
  const statuses = Object.values(BETKING_STATUSES);
  if (
    result && typeof result === 'object'
    && typeof result.status === 'string' && statuses.includes(result.status)
    && result.snapshot && typeof result.snapshot === 'object'
  ) {
    return { snapshot: result.snapshot, access: { status: result.status, reason: result.reason } };
  }
  return { snapshot: result, access: null };
}

function createOperationalWorkflow({ stateMachine, ports } = {}) {
  if (!stateMachine || typeof stateMachine.transition !== 'function') {
    throw new TypeError('The existing StateMachine instance is required.');
  }
  for (const name of ['readSchedule', 'readVisibleWeek', 'selectWeek', 'getStrategyInstructions']) {
    if (typeof ports?.[name] !== 'function') {
      throw new TypeError(`Workflow port "${name}" is required.`);
    }
  }

  async function prepareWeek({ requiredWeek } = {}) {
    const trace = [];

    function record(stepId, status, detail = {}) {
      const entry = { step: stepId, status, state: stateMachine.getState(), detail };
      trace.push(entry);
      if (typeof ports.onCheckpoint === 'function') {
        ports.onCheckpoint({ step: stepId, state: entry.state, requiredWeek: parseWeek(requiredWeek) });
      }
    }

    function moveTo(state) {
      if (stateMachine.getState() !== state) stateMachine.transition(state);
    }

    function fail(code, stepId, details = {}) {
      const selectedPolicy = FAILURE_POLICIES[code];
      const target = STATE_FOR_ACTION[selectedPolicy.action] ?? null;
      if (target) {
        try {
          stateMachine.transition(target);
        } catch (transitionError) {
          try {
            stateMachine.transition(STATES.ERROR);
          } catch (ignored) {
            // The machine is left where it is; the returned state tells the truth.
          }
        }
      }
      record(stepId, 'FAILED', { code, ...details });
      return {
        status: 'FAILED',
        code,
        step: stepId,
        policy: selectedPolicy,
        details,
        state: stateMachine.getState(),
        trace,
      };
    }

    // Resuming: a paused run (e.g. after manual login) re-enters through RECOVERING.
    const startState = stateMachine.getState();
    const allowedStartStates = [
      STATES.IDLE,
      STATES.INITIALIZING,
      STATES.RECOVERING,
      STATES.PAUSED,
      STATES.WAITING_FOR_NEXT_FIXTURE,
    ];
    if (!allowedStartStates.includes(startState)) {
      throw new Error(`prepareWeek cannot start from state ${startState}.`);
    }
    if (startState === STATES.PAUSED) moveTo(STATES.RECOVERING);

    // OPEN_BETKING / VERIFY_PAGE_ACCESS
    if (stateMachine.getState() === STATES.IDLE) moveTo(STATES.INITIALIZING);
    let snapshot;
    let suppliedAccess = null;
    try {
      const unpacked = unpackSchedule(await ports.readSchedule());
      snapshot = unpacked.snapshot;
      suppliedAccess = unpacked.access;
    } catch (error) {
      return fail('BETKING_UNAVAILABLE', 'OPEN_BETKING', { message: error?.message ?? String(error) });
    }
    if (!snapshot || typeof snapshot !== 'object') {
      return fail('BETKING_UNAVAILABLE', 'OPEN_BETKING', { message: 'The schedule port returned no snapshot.' });
    }
    const access = suppliedAccess ?? classifyBetKingPage(snapshot);
    const blockingStatuses = {
      [BETKING_STATUSES.PAGE_UNAVAILABLE]: 'BETKING_UNAVAILABLE',
      [BETKING_STATUSES.AUTH_REQUIRED]: 'AUTHENTICATION_REQUIRED',
      [BETKING_STATUSES.ACCESS_RESTRICTED]: 'ACCESS_RESTRICTED',
      [BETKING_STATUSES.NO_LEAGUE]: 'SCHEDULE_NOT_VISIBLE',
      [BETKING_STATUSES.NO_FIXTURE]: 'SCHEDULE_NOT_VISIBLE',
    };
    if (blockingStatuses[access.status]) {
      return fail(blockingStatuses[access.status], 'VERIFY_PAGE_ACCESS', { pageStatus: access.status, reason: access.reason });
    }
    record('VERIFY_PAGE_ACCESS', 'OK', { pageStatus: access.status });

    // IDENTIFY_CURRENT_STRATEGY_WEEK
    moveTo(STATES.OBSERVING);
    const required = parseWeek(requiredWeek);
    if (required === null) {
      return fail('REQUIRED_WEEK_UNKNOWN', 'IDENTIFY_CURRENT_STRATEGY_WEEK', { requiredWeek });
    }
    let visibleWeek;
    try {
      visibleWeek = await ports.readVisibleWeek();
    } catch (error) {
      return fail('BETKING_UNAVAILABLE', 'IDENTIFY_CURRENT_STRATEGY_WEEK', { message: error?.message ?? String(error) });
    }
    // The snapshot only lists the rounds currently rendered; a week missing from
    // it may still be reachable by selection, so availability is decided AFTER
    // the selection attempt, not before.
    const before = assessWeekAlignment({ requiredWeek: required, visibleWeek, selectedWeek: null });
    record('IDENTIFY_CURRENT_STRATEGY_WEEK', before.status, { requiredWeek: required, visibleWeek: parseWeek(visibleWeek) });

    // SELECT_REQUIRED_WEEK / VERIFY_SELECTED_WEEK
    const alreadyVisible = parseWeek(visibleWeek) === required;
    if (!alreadyVisible) {
      try {
        await ports.selectWeek(required);
      } catch (error) {
        return fail('WRONG_WEEK_SELECTED', 'SELECT_REQUIRED_WEEK', { message: error?.message ?? String(error) });
      }
      try {
        snapshot = unpackSchedule(await ports.readSchedule()).snapshot;
      } catch (error) {
        return fail('BETKING_UNAVAILABLE', 'VERIFY_SELECTED_WEEK', { message: error?.message ?? String(error) });
      }
    }
    if (!snapshot || typeof snapshot !== 'object') {
      return fail('BETKING_UNAVAILABLE', 'VERIFY_SELECTED_WEEK', { message: 'The schedule port returned no snapshot.' });
    }
    const weeksNow = weeksFromSnapshot(snapshot);
    if (weeksNow.length > 0 && !weeksNow.includes(required)) {
      return fail('REQUIRED_WEEK_UNAVAILABLE', 'SELECT_REQUIRED_WEEK', {
        reason: `Week ${required} is not offered by the website (available: ${weeksNow.join(', ')}).`,
        availableWeeks: weeksNow,
      });
    }
    let visibleAfter;
    try {
      visibleAfter = await ports.readVisibleWeek();
    } catch (error) {
      return fail('BETKING_UNAVAILABLE', 'VERIFY_SELECTED_WEEK', { message: error?.message ?? String(error) });
    }
    const after = assessWeekAlignment({
      requiredWeek: required,
      visibleWeek: visibleAfter,
      selectedWeek: parseWeek(visibleAfter) === required ? required : null,
    });
    record('VERIFY_SELECTED_WEEK', after.status, { visibleWeek: parseWeek(visibleAfter) });
    if (!after.ok) {
      return fail('WRONG_WEEK_SELECTED', 'VERIFY_SELECTED_WEEK', { reason: after.reason });
    }

    // IDENTIFY_LIVERPOOL_FIXTURE
    moveTo(STATES.FINDING_MATCH);
    const identification = identifyLiverpoolFixtureForWeek({ snapshot, week: required });
    record('IDENTIFY_LIVERPOOL_FIXTURE', identification.status, {
      fixture: identification.fixture ?? null,
      reason: identification.reason ?? null,
    });
    if (identification.status === 'WEEK_NOT_FOUND') {
      return fail('REQUIRED_WEEK_UNAVAILABLE', 'IDENTIFY_LIVERPOOL_FIXTURE', { reason: identification.reason });
    }
    if (identification.status === 'LIVERPOOL_NOT_FOUND') {
      return fail('LIVERPOOL_FIXTURE_NOT_FOUND', 'IDENTIFY_LIVERPOOL_FIXTURE', { reason: identification.reason });
    }
    if (identification.status !== 'IDENTIFIED') {
      return fail('AMBIGUOUS_LIVERPOOL_FIXTURE', 'IDENTIFY_LIVERPOOL_FIXTURE', {
        status: identification.status,
        reason: identification.reason,
        candidates: identification.candidates ?? null,
      });
    }

    // VERIFY_FIXTURE_IDENTITY (website-internal part)
    moveTo(STATES.MATCH_VERIFICATION);
    const consistency = checkWebsiteFixtureConsistency(identification);
    record('VERIFY_FIXTURE_IDENTITY', consistency.consistent ? 'OK' : 'MISMATCH', { evidence: consistency.evidence });
    if (!consistency.consistent) {
      return fail('FIXTURE_IDENTITY_MISMATCH', 'VERIFY_FIXTURE_IDENTITY', { evidence: consistency.evidence });
    }

    // READ_STRATEGY_STATE / CALCULATE_STAKES / MERGE / FILTER (existing strategy via adapter)
    moveTo(STATES.OBSERVING_STRATEGY);
    let strategyInstructions;
    try {
      strategyInstructions = await ports.getStrategyInstructions();
    } catch (error) {
      return fail('STRATEGY_STATE_MISSING', 'READ_STRATEGY_STATE', { message: error?.message ?? String(error) });
    }

    // Feed the identified fixture to the strategy only when it has none. An already active
    // fixture is left alone and cross-checked below.
    if (strategyInstructions?.status === 'FIXTURE_NOT_SUBMITTED' && typeof ports.submitFixtureToStrategy === 'function') {
      let feed;
      try {
        feed = await ports.submitFixtureToStrategy({
          home: identification.fixture.home,
          away: identification.fixture.away,
          week: required,
        });
      } catch (error) {
        feed = { ok: false, reason: error?.message ?? String(error) };
      }
      record('FEED_STRATEGY_FIXTURE', feed?.ok ? 'SUBMITTED' : 'FAILED', {
        home: identification.fixture.home, away: identification.fixture.away, reason: feed?.reason ?? null, code: feed?.code ?? null,
      });
      if (!feed?.ok) {
        return fail('STRATEGY_FEED_FAILED', 'FEED_STRATEGY_FIXTURE', {
          home: identification.fixture.home, away: identification.fixture.away, reason: feed?.reason ?? 'no result', code: feed?.code ?? null,
        });
      }
      // The strategy updates asynchronously; the fixture counts as fed only once it reports it.
      const deadline = Date.now() + (ports.feedWaitMs ?? 5000);
      do {
        strategyInstructions = await ports.getStrategyInstructions();
        if (strategyInstructions?.status === 'OK') break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      } while (Date.now() < deadline);
      if (strategyInstructions?.status !== 'OK') {
        return fail('STRATEGY_FEED_FAILED', 'FEED_STRATEGY_FIXTURE', { reason: 'The strategy never reported the submitted fixture.' });
      }
    }
    if (!strategyInstructions || strategyInstructions.status !== 'OK') {
      return fail('STRATEGY_STATE_MISSING', 'READ_STRATEGY_STATE', {
        status: strategyInstructions?.status ?? null,
        reason: strategyInstructions?.reason ?? null,
      });
    }
    record('READ_STRATEGY_STATE', 'OK', { observedAt: strategyInstructions.observedAt ?? null });

    // VERIFY_FIXTURE_IDENTITY (strategy side)
    const crossCheck = verifyFixtureAgainstStrategy({
      identified: identification,
      strategyFixture: strategyInstructions.fixture,
    });
    record('VERIFY_FIXTURE_IDENTITY', crossCheck.status, { confidence: crossCheck.confidence ?? null });
    if (!crossCheck.verified) {
      return fail('FIXTURE_IDENTITY_MISMATCH', 'VERIFY_FIXTURE_IDENTITY', { reason: crossCheck.reason, reasons: crossCheck.reasons ?? [] });
    }

    // RESOLVE_STRATEGY_MARKETS / PREPARE_QUALIFYING_SELECTIONS
    moveTo(STATES.STRATEGY_INSTRUCTION_READY);
    const plan = buildOperationalPlan({ week: required, identification, strategyInstructions });
    record('PREPARE_QUALIFYING_SELECTIONS', 'OK', {
      eligible: plan.eligible.length,
      instructions: plan.instructions.length,
      unresolved: plan.unresolved.length,
      skipped: plan.skipped.length,
      noStake: plan.noStake.length,
    });

    // VERIFY_PREPARED_INSTRUCTIONS
    moveTo(STATES.READY_FOR_ACTION);
    record('VERIFY_PREPARED_INSTRUCTIONS', 'READY_FOR_REVIEW', {});

    return {
      status: 'PREPARED',
      plan,
      identification,
      fixtureCrossCheck: crossCheck,
      state: stateMachine.getState(),
      trace,
    };
  }

  return Object.freeze({ prepareWeek });
}

module.exports = {
  FAILURE_ACTIONS,
  FAILURE_POLICIES,
  INSTRUCTION_STAGES,
  WORKFLOW_STEPS,
  buildOperationalPlan,
  checkWebsiteFixtureConsistency,
  createLifecycle,
  createOperationalWorkflow,
  createStakeFingerprint,
  evaluateOptionsForResult,
  identifyLiverpoolFixtureForWeek,
  planNextWeek,
  verifyFixtureAgainstStrategy,
  weeksFromSnapshot,
};
