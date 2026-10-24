const test = require('node:test');
const assert = require('node:assert/strict');
const { createSettlementRequest } = require('./strategy/settlementAdapter');
const {
  RESULT_PHASES,
  RESULT_STATUSES,
  createLiveResultObserver,
  parseMatchClock,
  verifyResultsPageResult,
} = require('./result/resultObserver');

const NOW = Date.parse('2026-10-08T22:00:00.000Z');
const EXPECTED_FIXTURE = {
  id: 'ARS-COV',
  domId: 'matchup-statistics-button-ARS-COV',
  home: 'ARS',
  away: 'COV',
  roundId: '21',
  roundName: 'Week 20',
};

function snapshot({
  fixture = EXPECTED_FIXTURE,
  clock = '12',
  homeScore = '0',
  awayScore = '0',
  status = 'IN_PROGRESS',
  observedAt = new Date(NOW).toISOString(),
  ...extra
} = {}) {
  return {
    fixture: { ...fixture },
    clock,
    homeScore,
    awayScore,
    status,
    observedAt,
    ...extra,
  };
}

function createObserver(options = {}) {
  return createLiveResultObserver(EXPECTED_FIXTURE, {
    now: () => NOW,
    staleAfterMs: 5000,
    ...options,
  });
}

test('reads a first-half score as an observation, not a verified result', () => {
  const observation = createObserver().observe(snapshot({
    clock: '12',
    homeScore: '1',
    awayScore: '0',
  }));
  assert.equal(observation.phase, RESULT_PHASES.FIRST_HALF);
  assert.deepEqual([observation.homeScore, observation.awayScore], [1, 0]);
  assert.equal(observation.verified, false);
  assert.equal(observation.result, null);
});

test('preserves changing scores during the first half', () => {
  const observer = createObserver();
  observer.observe(snapshot({ clock: '12', homeScore: '1', awayScore: '0' }));
  const changed = observer.observe(snapshot({ clock: '30', homeScore: '1', awayScore: '1' }));
  assert.equal(changed.phase, RESULT_PHASES.FIRST_HALF);
  assert.deepEqual([changed.homeScore, changed.awayScore], [1, 1]);
  assert.equal(changed.halfTime, null);
});

test('captures the half-time snapshot at 45 and retains it after the live score changes', () => {
  const observer = createObserver();
  observer.observe(snapshot({ clock: '44', homeScore: '2', awayScore: '1' }));
  const halfTime = observer.observe(snapshot({ clock: '45', homeScore: '2', awayScore: '1' }));
  const secondHalf = observer.observe(snapshot({ clock: '46', homeScore: '3', awayScore: '1' }));
  assert.deepEqual(halfTime.halfTime, { home: 2, away: 1, verified: true });
  assert.equal(secondHalf.phase, RESULT_PHASES.SECOND_HALF);
  assert.deepEqual(secondHalf.halfTime, { home: 2, away: 1, verified: true });
  assert.deepEqual([secondHalf.homeScore, secondHalf.awayScore], [3, 1]);
});

test('captures scores after 45 as second-half changes without replacing the HT score', () => {
  const observer = createObserver();
  observer.observe(snapshot({ clock: '44', homeScore: '2', awayScore: '1' }));
  const secondHalf = observer.observe(snapshot({ clock: '47', homeScore: '3', awayScore: '1' }));
  assert.equal(secondHalf.phase, RESULT_PHASES.SECOND_HALF);
  assert.deepEqual(secondHalf.halfTime, { home: 2, away: 1, verified: true });
  assert.deepEqual([secondHalf.homeScore, secondHalf.awayScore], [3, 1]);
});

test('captures separate verified HT and FT scores only when status explicitly says finished', () => {
  const observer = createObserver();
  observer.observe(snapshot({ clock: '44', homeScore: '2', awayScore: '1' }));
  observer.observe(snapshot({ clock: '46', homeScore: '2', awayScore: '1' }));
  const finished = observer.observe(snapshot({
    clock: '90',
    homeScore: '4',
    awayScore: '1',
    status: 'FINISHED',
  }));
  assert.equal(finished.phase, RESULT_PHASES.FINISHED);
  assert.deepEqual(finished.halfTime, { home: 2, away: 1, verified: true });
  assert.deepEqual(finished.fullTime, { home: 4, away: 1, verified: true });
  assert.deepEqual(finished.result, { homeScore: 4, awayScore: 1 });
  assert.equal(finished.status, 'verified');
  assert.equal(finished.verified, true);
  assert.equal(finished.timestamp, finished.observedAt);
});

test('a finished-state sample on the boundary does not reuse its FT score as HT', () => {
  const observer = createObserver();
  observer.observe(snapshot({ clock: '44', homeScore: '2', awayScore: '1' }));
  const finished = observer.observe(snapshot({
    clock: '45',
    homeScore: '4',
    awayScore: '1',
    status: 'FINISHED',
  }));
  assert.deepEqual(finished.halfTime, { home: 2, away: 1, verified: true });
  assert.deepEqual(finished.fullTime, { home: 4, away: 1, verified: true });
  assert.equal(finished.verified, true);
});

test('does not infer full time from a high clock value', () => {
  const observer = createObserver();
  observer.observe(snapshot({ clock: '44', homeScore: '0', awayScore: '0' }));
  const highClock = observer.observe(snapshot({
    clock: '90',
    homeScore: '1',
    awayScore: '0',
    status: 'IN_PROGRESS',
  }));
  assert.equal(highClock.phase, RESULT_PHASES.SECOND_HALF);
  assert.equal(highClock.fullTime, null);
  assert.equal(highClock.verified, false);
});

test('keeps an incomplete score unverified', () => {
  const result = createObserver().observe(snapshot({ homeScore: '', awayScore: '0' }));
  assert.equal(result.status, RESULT_STATUSES.INCOMPLETE_SCORE);
  assert.equal(result.verified, false);
});

test('rejects invalid scores instead of normalizing them', () => {
  const negative = createObserver().observe(snapshot({ homeScore: '-1', awayScore: '0' }));
  const fractional = createObserver().observe(snapshot({ homeScore: '1.5', awayScore: '0' }));
  assert.equal(negative.status, RESULT_STATUSES.INVALID_SCORE);
  assert.equal(fractional.status, RESULT_STATUSES.INVALID_SCORE);
});

test('stops when fixture identity is ambiguous', () => {
  const result = createObserver().observe(snapshot({ candidateCount: 2 }));
  assert.equal(result.status, RESULT_STATUSES.AMBIGUOUS_FIXTURE);
  assert.equal(result.verified, false);
});

test('rejects results for a different fixture, teams, or round', () => {
  for (const fixture of [
    { ...EXPECTED_FIXTURE, id: 'ARS-CHE' },
    { ...EXPECTED_FIXTURE, domId: 'matchup-statistics-button-ARS-CHE' },
    { ...EXPECTED_FIXTURE, home: 'CHE' },
    { ...EXPECTED_FIXTURE, away: 'LIV' },
    { ...EXPECTED_FIXTURE, roundId: '22' },
  ]) {
    assert.equal(
      createObserver().observe(snapshot({ fixture })).status,
      RESULT_STATUSES.WRONG_FIXTURE,
    );
  }
});

test('rejects stale DOM snapshots', () => {
  const result = createObserver().observe(snapshot({
    observedAt: new Date(NOW - 5001).toISOString(),
  }));
  assert.equal(result.status, RESULT_STATUSES.STALE_RESULT);
  assert.equal(result.verified, false);
});

test('detects a live DOM whose match clock and score stop changing', () => {
  let currentTime = NOW;
  const observer = createLiveResultObserver(EXPECTED_FIXTURE, {
    now: () => currentTime,
    staleAfterMs: 5000,
  });
  const first = observer.observe(snapshot());
  currentTime += 5001;
  const frozen = observer.observe(snapshot({ observedAt: new Date(currentTime).toISOString() }));
  assert.equal(first.status, RESULT_STATUSES.OBSERVING);
  assert.equal(frozen.status, RESULT_STATUSES.STALE_RESULT);
});

test('Results page can verify a completed score but does not invent a half-time score', () => {
  const liveObserver = createObserver();
  liveObserver.observe(snapshot({ clock: '44', homeScore: '2', awayScore: '1' }));
  liveObserver.observe(snapshot({ clock: '46', homeScore: '2', awayScore: '1' }));
  const liveResult = liveObserver.observe(snapshot({
    clock: '90',
    homeScore: '4',
    awayScore: '1',
    status: 'COMPLETED',
  }));
  const verification = verifyResultsPageResult(liveResult, {
    results: [{
      fixture: EXPECTED_FIXTURE,
      status: 'FINISHED',
      fullTime: { home: 4, away: 1 },
    }],
  });
  assert.equal(verification.verified, true);
  assert.equal(verification.halfTimeProvided, false);
  assert.deepEqual(verification.halfTime, { home: 2, away: 1, verified: true });
  assert.deepEqual(verification.fullTime, { home: 4, away: 1, verified: true });
});

test('Results-page identity and score mismatches cannot verify a live result', () => {
  const liveObserver = createObserver();
  liveObserver.observe(snapshot({ clock: '44', homeScore: '2', awayScore: '1' }));
  liveObserver.observe(snapshot({ clock: '46', homeScore: '2', awayScore: '1' }));
  const liveResult = liveObserver.observe(snapshot({
    clock: '90',
    homeScore: '4',
    awayScore: '1',
    status: 'FINISHED',
  }));
  const wrongFixture = verifyResultsPageResult(liveResult, {
    results: [{
      fixture: { ...EXPECTED_FIXTURE, roundId: '22' },
      status: 'FINISHED',
      fullTime: { home: 4, away: 1 },
    }],
  });
  const wrongScore = verifyResultsPageResult(liveResult, {
    results: [{
      fixture: EXPECTED_FIXTURE,
      status: 'FINISHED',
      fullTime: { home: 4, away: 0 },
    }],
  });
  assert.equal(wrongFixture.status, RESULT_STATUSES.RESULTS_NOT_FOUND);
  assert.equal(wrongScore.status, RESULT_STATUSES.RESULTS_MISMATCH);
});

test('Results page cannot complete a live result missing a verified half-time score', () => {
  const verification = verifyResultsPageResult({
    fixture: EXPECTED_FIXTURE,
    verified: true,
    fullTime: { home: 4, away: 1, verified: true },
    halfTime: null,
  }, {
    results: [{
      fixture: EXPECTED_FIXTURE,
      status: 'FINISHED',
      fullTime: { home: 4, away: 1 },
    }],
  });
  assert.equal(verification.verified, false);
  assert.equal(verification.reason, 'LIVE_RESULT_UNVERIFIED');
});

test('matching Results-page HT and FT scores verify against the same fixture identity', () => {
  const liveObserver = createObserver();
  liveObserver.observe(snapshot({ clock: '44', homeScore: '2', awayScore: '1' }));
  liveObserver.observe(snapshot({ clock: '46', homeScore: '2', awayScore: '1' }));
  const liveResult = liveObserver.observe(snapshot({
    clock: '90',
    homeScore: '4',
    awayScore: '1',
    status: 'FINISHED',
  }));
  const verification = verifyResultsPageResult(liveResult, {
    results: [{
      fixture: EXPECTED_FIXTURE,
      status: 'COMPLETED',
      halfTime: { home: 2, away: 1 },
      fullTime: { home: 4, away: 1 },
    }],
  });
  assert.equal(verification.verified, true);
  assert.equal(verification.halfTimeProvided, true);
  assert.deepEqual(verification.halfTime, { home: 2, away: 1, verified: true });
});

test('repeated completed observations are idempotent', () => {
  const observer = createObserver();
  observer.observe(snapshot({ clock: '44', homeScore: '2', awayScore: '1' }));
  observer.observe(snapshot({ clock: '46', homeScore: '2', awayScore: '1' }));
  const finalSnapshot = snapshot({
    clock: '90',
    homeScore: '4',
    awayScore: '1',
    status: 'FINISHED',
  });
  const first = observer.observe(finalSnapshot);
  const duplicate = observer.observe(finalSnapshot);
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(observer.getProcessedResultCount(), 1);
});

test('a conflicting second final score is rejected rather than replacing the first', () => {
  const observer = createObserver();
  observer.observe(snapshot({ clock: '44', homeScore: '2', awayScore: '1' }));
  observer.observe(snapshot({ clock: '46', homeScore: '2', awayScore: '1' }));
  observer.observe(snapshot({ clock: '90', homeScore: '4', awayScore: '1', status: 'FINISHED' }));
  const conflict = observer.observe(snapshot({
    clock: '90',
    homeScore: '3',
    awayScore: '1',
    status: 'FINISHED',
  }));
  assert.equal(conflict.status, RESULT_STATUSES.CONFLICTING_RESULT);
  assert.equal(conflict.verified, false);
  assert.equal(observer.getProcessedResultCount(), 1);
});

test('an unverified live result cannot be passed to Cataloguea strategy settlement', () => {
  const observation = createObserver().observe(snapshot({ clock: '30' }));
  assert.equal(observation.verified, false);
  assert.throws(() => createSettlementRequest({
    instruction: {
      fixture: { id: 'ARS-COV', home: 'ARS', away: 'COV' },
      strategyState: { status: 'stakes_available' },
    },
    normalizedResult: observation,
    actionOperationId: 'read-only-observation',
  }), /Only a verified result/);
});

test('match clock parser supports minutes, elapsed seconds, and stoppage-time notation', () => {
  assert.equal(parseMatchClock('44'), 44);
  assert.equal(parseMatchClock('45:30'), 45.5);
  assert.equal(parseMatchClock('45+2'), 47);
  assert.equal(parseMatchClock('45:99'), null);
});
