// Market-first selection sequence (pure logic; no browser code).
//
// Rule (from the owner's screen recording): an odd is never selected until the correct
// market CATEGORY has been opened and the exact SELECTION inside it has been identified
// for the confirmed fixture. Category, selection, and stake are three separate operations.
// This applies to every strategy option, each with its own verified category/selection;
// HT/FT is only the example shown in the recording.
//
// Stages (adapted onto the existing state machine; see STAGE_MACHINE_STATE):
//
//   FIXTURE_CONFIRMED -> STRATEGY_OPTIONS_RESOLVED -> MARKET_CATEGORY_OPENED ->
//   MARKET_SELECTION_IDENTIFIED -> ODDS_VERIFIED -> SELECTION_ADDED ->
//   BET_SLIP_VERIFIED -> AWAITING_AUTHORIZATION
//
// A stage is reached only when its observable evidence is supplied and valid. Attempting
// a click is never evidence. Nothing in this module submits a wager.

const { normalizeTeamCode } = require('./fixtureIdentity');
const { STATES } = require('../stateMachine');

const STAGES = Object.freeze([
  'FIXTURE_CONFIRMED',
  'STRATEGY_OPTIONS_RESOLVED',
  'MARKET_CATEGORY_OPENED',
  'MARKET_SELECTION_IDENTIFIED',
  'ODDS_VERIFIED',
  'SELECTION_ADDED',
  'BET_SLIP_VERIFIED',
  'AWAITING_AUTHORIZATION',
  'WAGER_SUBMITTED',
  'WAGER_ACCEPTED',
]);

// How far a run may go. 'identify' is read-only (never clicks an odd). 'place' is the only depth
// that can submit a wager, and it additionally needs explicit real-money consent (see config).
const PIPELINE_DEPTHS = Object.freeze({
  identify: 'ODDS_VERIFIED',
  select: 'SELECTION_ADDED',
  slip: 'AWAITING_AUTHORIZATION',
  place: 'WAGER_ACCEPTED',
});

// The stages are tracked PER OPTION. The existing state machine is RUN-LEVEL: the run is in
// MATCH_VERIFICATION / STRATEGY_INSTRUCTION_READY while the fixture and options are resolved,
// and stays in READY_FOR_ACTION while any option moves through the market stages up to
// AWAITING_AUTHORIZATION. No second state machine exists.
const STAGE_MACHINE_STATE = Object.freeze({
  FIXTURE_CONFIRMED: STATES.MATCH_VERIFICATION,
  STRATEGY_OPTIONS_RESOLVED: STATES.STRATEGY_INSTRUCTION_READY,
  MARKET_CATEGORY_OPENED: STATES.READY_FOR_ACTION,
  MARKET_SELECTION_IDENTIFIED: STATES.READY_FOR_ACTION,
  ODDS_VERIFIED: STATES.READY_FOR_ACTION,
  SELECTION_ADDED: STATES.READY_FOR_ACTION,
  BET_SLIP_VERIFIED: STATES.READY_FOR_ACTION,
  AWAITING_AUTHORIZATION: STATES.READY_FOR_ACTION,
  WAGER_SUBMITTED: STATES.EXECUTING,
  WAGER_ACCEPTED: STATES.WAITING_FOR_RESULT,
});

// Failure codes (see FAILURE_POLICIES in operationalWorkflow.js).
const PIPELINE_FAILURES = Object.freeze({
  MARKET_CATEGORY_NOT_OPENED: 'MARKET_CATEGORY_NOT_OPENED',
  MARKET_SELECTION_NOT_FOUND: 'MARKET_SELECTION_NOT_FOUND',
  FIXTURE_ROW_NOT_AVAILABLE: 'FIXTURE_ROW_NOT_AVAILABLE',
  ODDS_UNAVAILABLE: 'ODDS_UNAVAILABLE',
  ODDS_CHANGED: 'ODDS_CHANGED',
  SLIP_NOT_EMPTY: 'SLIP_NOT_EMPTY',
  SELECTION_NOT_ADDED: 'SELECTION_NOT_ADDED',
  BET_SLIP_MISMATCH: 'BET_SLIP_MISMATCH',
  SLIP_EXPIRING: 'SLIP_EXPIRING',
  WAGER_NOT_AUTHORIZED: 'WAGER_NOT_AUTHORIZED',
  WAGER_REJECTED: 'WAGER_REJECTED',
  WAGER_UNCONFIRMED: 'WAGER_UNCONFIRMED',
  PLACE_BUTTON_NOT_FOUND: 'PLACE_BUTTON_NOT_FOUND',
});

const ODDS_TOLERANCE = 0.005;
const MIN_SECONDS_REMAINING = 10;

function norm(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function isOdds(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 1;
}

// Per-stage validators: return null when the evidence is acceptable, otherwise a reason.
const VALIDATORS = Object.freeze({
  FIXTURE_CONFIRMED(evidence) {
    if (!evidence?.verified) return 'The fixture is not verified.';
    if (!evidence.home || !evidence.away) return 'Home and away teams are required.';
    if (evidence.arsenalSide !== 'HOME' && evidence.arsenalSide !== 'AWAY') return 'Arsenal home/away position is required.';
    return null;
  },
  STRATEGY_OPTIONS_RESOLVED(evidence) {
    if (evidence?.mappingStatus !== 'VERIFIED') return 'The option has no VERIFIED market mapping.';
    if (!evidence.category || !evidence.selection) return 'A market category and an exact selection are required.';
    return null;
  },
  MARKET_CATEGORY_OPENED(evidence) {
    if (!evidence?.category) return 'No category recorded.';
    if (norm(evidence.observedCategory) !== norm(evidence.category)) {
      return 'The page does not show the requested category as active.';
    }
    if (evidence.market && norm(evidence.market) !== norm(evidence.category)
      && !(evidence.observedMarkets ?? []).some((name) => norm(name) === norm(evidence.market))) {
      return `The market ${evidence.market} is not shown inside the ${evidence.category} category.`;
    }
    if (!Array.isArray(evidence.labelsInFixture) || evidence.labelsInFixture.length === 0) {
      return 'No selection labels are visible for the fixture in this category.';
    }
    return null;
  },
  MARKET_SELECTION_IDENTIFIED(evidence) {
    if (!evidence?.selection) return 'No selection recorded.';
    if (norm(evidence.matchedLabel) !== norm(evidence.selection)) return 'The matched label is not the required selection.';
    if (norm(normalizeTeamCode(evidence.home)) !== norm(normalizeTeamCode(evidence.expectedHome))
      || norm(normalizeTeamCode(evidence.away)) !== norm(normalizeTeamCode(evidence.expectedAway))) {
      return 'The selection belongs to a different fixture.';
    }
    return null;
  },
  ODDS_VERIFIED(evidence) {
    if (!isOdds(evidence?.odds)) return 'The odds are missing or not a valid decimal price.';
    if (isOdds(evidence.previousOdds) && Math.abs(evidence.odds - evidence.previousOdds) > ODDS_TOLERANCE) {
      return `The odds changed from ${evidence.previousOdds} to ${evidence.odds}.`;
    }
    return null;
  },
  SELECTION_ADDED(evidence) {
    if (!evidence?.selectedStateObserved) return 'No observable selected state (slip count or highlighted odd).';
    if (evidence.slipCountBefore !== 0) return 'The slip was not empty before selecting.';
    if (evidence.slipCountAfter !== 1) return `Expected exactly 1 selection in the slip, saw ${evidence.slipCountAfter}.`;
    return null;
  },
  BET_SLIP_VERIFIED(evidence) {
    if (!evidence?.comparison) return 'No slip comparison recorded.';
    if (!evidence.comparison.ok) return `The slip does not match the strategy: ${evidence.comparison.problems.join(', ')}.`;
    return null;
  },
  AWAITING_AUTHORIZATION(evidence) {
    if (evidence?.submitted) return 'A wager must never be marked submitted at this stage.';
    return null;
  },
  WAGER_SUBMITTED(evidence) {
    if (!evidence?.authorized) return 'The wager was not explicitly authorized.';
    if (!evidence.clickedAt) return 'No record of when the place-bet control was used.';
    return null;
  },
  WAGER_ACCEPTED(evidence) {
    if (!evidence?.siteConfirmationText) return 'The site gave no confirmation text; a click is not acceptance.';
    return null;
  },
});

function createOptionPipeline({ strategyKey } = {}) {
  if (!strategyKey) throw new TypeError('A strategy key is required.');
  const state = { strategyKey, reached: -1, history: [], failure: null };

  function advance(stage, evidence) {
    if (state.failure) return { ok: false, reason: `Pipeline already failed (${state.failure.code}).` };
    const index = STAGES.indexOf(stage);
    if (index === -1) return { ok: false, reason: `Unknown stage ${stage}.` };
    if (index !== state.reached + 1) {
      return {
        ok: false,
        reason: `Stage ${stage} cannot be reached before ${STAGES[state.reached + 1] ?? 'completion'}.`,
      };
    }
    const problem = VALIDATORS[stage](evidence);
    if (problem) return { ok: false, reason: problem };
    state.reached = index;
    state.history.push({ stage, at: new Date().toISOString(), evidence });
    return { ok: true, stage };
  }

  function fail(code, details = {}) {
    state.failure = { code, details, afterStage: STAGES[state.reached] ?? null };
    return state.failure;
  }

  return Object.freeze({
    advance,
    fail,
    get stage() { return STAGES[state.reached] ?? null; },
    get failure() { return state.failure; },
    get history() { return state.history; },
    get strategyKey() { return state.strategyKey; },
    hasReached(stage) { return STAGES.indexOf(stage) <= state.reached && state.reached >= 0; },
    snapshot() {
      return {
        strategyKey: state.strategyKey,
        stage: STAGES[state.reached] ?? null,
        failure: state.failure,
        history: state.history.map(({ stage, at }) => ({ stage, at })),
      };
    },
  });
}

// RULE-006: an odd may be selected only after category, selection, fixture, and odds
// have all been verified (stage ODDS_VERIFIED reached) and nothing has failed.
function canSelectOdd(pipeline) {
  const allowed = Boolean(pipeline) && !pipeline.failure && pipeline.hasReached('ODDS_VERIFIED');
  return {
    allowed,
    reason: allowed
      ? 'Category opened, selection identified for the confirmed fixture, and odds verified.'
      : `Not allowed yet: the pipeline is at ${pipeline?.stage ?? 'no stage'}${pipeline?.failure ? ` and failed (${pipeline.failure.code})` : ''}.`,
  };
}

// ---- bet slip parsing and comparison ------------------------------------------------

function parseMoney(text) {
  const match = /(?:₦|N)?\s*([\d,]+(?:\.\d+)?)/.exec(String(text ?? ''));
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

function parseCountdownSeconds(text) {
  const match = /(\d{1,2}):(\d{2})/.exec(String(text ?? ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// Parses the visible text of the "VIRTUALS BETSLIP" page. Two layouts have been seen:
//   one selection (recording):  fixture line, odds, "<market> - <selection>"
//   several selections (owner screenshots): fixture line, then repeated
//     "<market> - <selection>" followed by its odds, then the Singles / Stake rows.
// The stake input value is supplied separately because it is not part of the page text.
function parseBetSlipText(text, { stakeInputValue = null } = {}) {
  const source = String(text ?? '');
  const lines = source.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const fixturePattern = /^([A-Za-z0-9]{2,5})\s*-\s*([A-Za-z0-9]{2,5})$/;
  const oddsPattern = /^\d[\d,]*(?:\.\d+)?$/;
  const leaguePattern = /league.*week\s*\d+|week\s*\d+/i;
  const stopPattern = /^(Group|Com|Stake|Total Stake|Singles|Multiple|Winnings|Total Odds|Net Potential|PLACE BET|Clear All|Next event|VIRTUALS BETSLIP)/i;
  const toNumber = (value) => Number(String(value).replace(/,/g, ''));
  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    const fixture = fixturePattern.exec(lines[index]);
    if (!fixture) continue;
    let league = null;
    for (let back = 1; back <= 3 && index - back >= 0; back += 1) {
      if (leaguePattern.test(lines[index - back])) { league = lines[index - back]; break; }
    }
    const week = league ? Number((/week\s*(\d+)/i.exec(league) || [])[1]) || null : null;
    let pendingOdds = null;
    let cursor = index + 1;
    for (; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (fixturePattern.test(line) || stopPattern.test(line) || (leaguePattern.test(line) && /league/i.test(line))) break;
      if (oddsPattern.test(line)) {
        const last = items[items.length - 1];
        if (last && last.odds === null && last.home === fixture[1].toUpperCase() && last.away === fixture[2].toUpperCase()) {
          last.odds = toNumber(line);
        } else {
          pendingOdds = toNumber(line);
        }
        continue;
      }
      // The live slip prints "HT/FT · 1/X" (owner recording, Oct 23 2026); older slips used "HT/FT - 1/X".
      const split = /^(.+?)\s*[\u00b7\u2022]\s*(.+)$/.exec(line) || /^(.+?)\s+-\s+(.+)$/.exec(line);
      if (split) {
        items.push({
          home: fixture[1].toUpperCase(),
          away: fixture[2].toUpperCase(),
          market: split[1].trim(),
          selection: split[2].trim(),
          odds: pendingOdds,
          league,
          week,
        });
        pendingOdds = null;
      }
    }
    index = cursor - 1;
  }

  const find = (pattern) => {
    const match = pattern.exec(source);
    return match ? match[1] : null;
  };
  const expiryText = find(/Next event will expire in:\s*([\d:]+)/i);
  return {
    items,
    stake: stakeInputValue === null || stakeInputValue === '' ? null : parseMoney(stakeInputValue),
    totalOdds: parseMoney(find(/Total Odds\s*([\d.,]+)/i)),
    potentialWinnings: parseMoney(find(/Net Potential Winnings\s*(?:\u20a6|N)?\s*([\d.,]+)/i)),
    expirySeconds: expiryText ? parseCountdownSeconds(expiryText) : null,
    isBetSlipPage: /VIRTUALS BETSLIP/i.test(source),
  };
}

// Compares the slip with what the strategy intends. Blocking problems make ok=false;
// WINNINGS_INCONSISTENT is a warning only (the recording shows winnings = stake x odds).
function compareSlipToExpected({ slip, expected, minSecondsRemaining = MIN_SECONDS_REMAINING } = {}) {
  const problems = [];
  const warnings = [];
  const details = {};
  if (!slip || !Array.isArray(slip.items) || slip.items.length === 0) {
    return { ok: false, problems: ['SLIP_EMPTY'], warnings, details };
  }
  if (slip.items.length > 1) problems.push('EXTRA_SELECTIONS');

  const matching = slip.items.filter((item) => (
    normalizeTeamCode(item.home) === normalizeTeamCode(expected.home)
    && normalizeTeamCode(item.away) === normalizeTeamCode(expected.away)
    && norm(item.market) === norm(expected.market ?? expected.category)
    && norm(item.selection) === norm(expected.selection)
  ));
  if (matching.length > 1) problems.push('DUPLICATE_SELECTION');

  const item = matching[0] ?? slip.items[0];
  if (matching.length === 0) {
    const sameFixture = normalizeTeamCode(item.home) === normalizeTeamCode(expected.home)
      && normalizeTeamCode(item.away) === normalizeTeamCode(expected.away);
    if (!sameFixture) problems.push('WRONG_FIXTURE');
    else if (norm(item.market) !== norm(expected.market ?? expected.category)) problems.push('WRONG_MARKET');
    else problems.push('WRONG_SELECTION');
  }
  if (expected.week && item.week && item.week !== expected.week) problems.push('WRONG_WEEK');
  details.item = item;

  if (isOdds(expected.odds) && isOdds(item.odds) && Math.abs(item.odds - expected.odds) > ODDS_TOLERANCE) {
    problems.push('ODDS_CHANGED');
  }
  if (slip.stake === null || slip.stake === undefined || Math.abs(slip.stake - expected.stake) > 0.001) {
    problems.push('STAKE_MISMATCH');
  }
  if (typeof slip.expirySeconds === 'number' && slip.expirySeconds < minSecondsRemaining) {
    problems.push('SLIP_EXPIRING');
  }
  if (typeof slip.stake === 'number' && isOdds(item.odds) && typeof slip.potentialWinnings === 'number') {
    const expectedWinnings = slip.stake * item.odds;
    if (Math.abs(slip.potentialWinnings - expectedWinnings) > Math.max(0.02, expectedWinnings * 0.001)) {
      warnings.push('WINNINGS_INCONSISTENT');
    }
  }
  return { ok: problems.length === 0, problems, warnings, details };
}

// The human-readable request shown at the authorization boundary. Submission is not
// implemented anywhere in this project; this text exists so a person can decide.
function describeAuthorizationRequest({ week, home, away, arsenalSide, category, selection, odds, stake, potentialWinnings, expirySeconds }) {
  return [
    `Week ${week}: ${home} v ${away} (Arsenal ${arsenalSide === 'HOME' ? 'home' : 'away'})`,
    `Market: ${category}   Selection: ${selection}   Odds: ${odds}`,
    `Stake: N${stake}   Potential winnings shown: ${potentialWinnings === null || potentialWinnings === undefined ? 'n/a' : `N${potentialWinnings}`}`,
    `Slip expires in ${expirySeconds === null || expirySeconds === undefined ? 'unknown' : `${expirySeconds}s`}.`,
    'Nothing has been submitted. Placing the bet requires your own explicit action.',
  ].join('\n');
}

const AUTHORIZATION_BOUNDARY = Object.freeze({
  submissionImplemented: false,
  note: 'No code path submits a wager. AWAITING_AUTHORIZATION is the last stage this project reaches.',
});

module.exports = {
  AUTHORIZATION_BOUNDARY,
  MIN_SECONDS_REMAINING,
  ODDS_TOLERANCE,
  PIPELINE_DEPTHS,
  PIPELINE_FAILURES,
  STAGES,
  STAGE_MACHINE_STATE,
  canSelectOdd,
  compareSlipToExpected,
  createOptionPipeline,
  describeAuthorizationRequest,
  parseBetSlipText,
  parseCountdownSeconds,
  parseMoney,
};
