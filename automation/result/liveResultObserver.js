const RESULT_PHASES = Object.freeze({
  FIRST_HALF: 'FIRST_HALF',
  SECOND_HALF: 'SECOND_HALF',
  FINISHED: 'FINISHED',
});

const RESULT_STATUSES = Object.freeze({
  OBSERVING: 'OBSERVING',
  VERIFIED: 'VERIFIED',
  AMBIGUOUS_FIXTURE: 'AMBIGUOUS_FIXTURE',
  WRONG_FIXTURE: 'WRONG_FIXTURE',
  STALE_RESULT: 'STALE_RESULT',
  INCOMPLETE_SCORE: 'INCOMPLETE_SCORE',
  INVALID_SCORE: 'INVALID_SCORE',
  INVALID_CLOCK: 'INVALID_CLOCK',
  INVALID_STATUS: 'INVALID_STATUS',
  RESULTS_NOT_FOUND: 'RESULTS_NOT_FOUND',
  RESULTS_AMBIGUOUS: 'RESULTS_AMBIGUOUS',
  RESULTS_MISMATCH: 'RESULTS_MISMATCH',
  CONFLICTING_RESULT: 'CONFLICTING_RESULT',
});

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseMatchClock(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  const text = normalizeText(value);
  const match = /^(\d{1,3})(?::(\d{1,2}))?(?:\+(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = match[2] === undefined ? 0 : Number(match[2]);
  const stoppageMinutes = match[3] === undefined ? 0 : Number(match[3]);
  if (seconds > 59) return null;
  return minutes + (seconds / 60) + stoppageMinutes;
}

function parseScore(value) {
  if (value === null || value === undefined || normalizeText(value) === '') {
    return { status: RESULT_STATUSES.INCOMPLETE_SCORE, score: null };
  }
  const score = typeof value === 'number' ? value : Number(normalizeText(value));
  if (!Number.isSafeInteger(score) || score < 0) {
    return { status: RESULT_STATUSES.INVALID_SCORE, score: null };
  }
  return { status: null, score };
}

function parseScorePair(homeValue, awayValue) {
  const home = parseScore(homeValue);
  const away = parseScore(awayValue);
  if (home.status === RESULT_STATUSES.INVALID_SCORE || away.status === RESULT_STATUSES.INVALID_SCORE) {
    return { status: RESULT_STATUSES.INVALID_SCORE, score: null };
  }
  if (home.status || away.status) {
    return { status: RESULT_STATUSES.INCOMPLETE_SCORE, score: null };
  }
  return { status: null, score: { home: home.score, away: away.score } };
}

function normalizeRound(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeTeam(value) {
  return normalizeText(value).toUpperCase();
}

function fixtureMatches(observed, expected) {
  const observedDomId = normalizeText(observed?.domId);
  const expectedDomId = normalizeText(expected?.domId);
  return normalizeText(observed?.id) === normalizeText(expected?.id)
    && normalizeTeam(observed?.home) === normalizeTeam(expected?.home)
    && normalizeTeam(observed?.away) === normalizeTeam(expected?.away)
    && normalizeRound(observed?.roundId ?? observed?.roundName)
      === normalizeRound(expected?.roundId ?? expected?.roundName)
    && (!observedDomId || !expectedDomId || observedDomId === expectedDomId);
}

function timestampMilliseconds(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null;
  return Date.parse(value);
}

function readNow(now) {
  const value = now();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const milliseconds = timestampMilliseconds(value);
  if (milliseconds === null) {
    throw new TypeError('Live result observer clock must return a timestamp or epoch milliseconds.');
  }
  return milliseconds;
}

function copyScore(score) {
  return score ? { home: score.home, away: score.away } : null;
}

function createLiveResultObserver(expectedFixture, {
  now = () => Date.now(),
  staleAfterMs = 90_000,
} = {}) {
  if (
    !expectedFixture
    || !normalizeText(expectedFixture.id)
    || !normalizeText(expectedFixture.home)
    || !normalizeText(expectedFixture.away)
    || !normalizeText(expectedFixture.roundId ?? expectedFixture.roundName)
  ) {
    throw new TypeError('Expected fixture identity must include ID, home, away, and round.');
  }
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < 0) {
    throw new TypeError('Live result maximum age must be a non-negative integer.');
  }

  let lastClock = null;
  let lastFirstHalfScore = null;
  let halfTime = null;
  let completedResultId = null;
  let lastFingerprint = null;
  let lastChangedAt = null;

  function unverified(status, snapshot) {
    return {
      status,
      fixture: snapshot?.fixture ? { ...snapshot.fixture } : null,
      clock: snapshot?.clock ?? null,
      phase: null,
      homeScore: null,
      awayScore: null,
      halfTime: copyScore(halfTime),
      fullTime: null,
      verified: false,
      duplicate: false,
      observedAt: snapshot?.observedAt ?? null,
      source: 'betking-live-fixture-dom',
    };
  }

  function observe(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new TypeError('A live fixture observation object is required.');
    }
    if (snapshot.ambiguous === true || snapshot.candidateCount > 1) {
      return unverified(RESULT_STATUSES.AMBIGUOUS_FIXTURE, snapshot);
    }
    if (!fixtureMatches(snapshot.fixture, expectedFixture)) {
      return unverified(RESULT_STATUSES.WRONG_FIXTURE, snapshot);
    }

    const observedAt = timestampMilliseconds(snapshot.observedAt);
    const currentTime = readNow(now);
    if (
      observedAt === null
      || currentTime - observedAt > staleAfterMs
      || observedAt > currentTime
    ) {
      return unverified(RESULT_STATUSES.STALE_RESULT, snapshot);
    }

    const clock = parseMatchClock(snapshot.clock);
    if (clock === null) return unverified(RESULT_STATUSES.INVALID_CLOCK, snapshot);

    const score = parseScorePair(snapshot.homeScore, snapshot.awayScore);
    if (score.status) return unverified(score.status, snapshot);

    const status = normalizeText(snapshot.status).toUpperCase();
    const finished = snapshot.isFinished === true
      || status === 'FINISHED'
      || status === 'COMPLETED';
    const inProgress = ['LIVE', 'IN_PROGRESS', 'IN PROGRESS', 'RUNNING'].includes(status);
    if (!finished && !inProgress) {
      return unverified(RESULT_STATUSES.INVALID_STATUS, snapshot);
    }
    if (lastClock !== null && clock < lastClock) {
      return unverified(RESULT_STATUSES.STALE_RESULT, snapshot);
    }
    const fingerprint = JSON.stringify([clock, score.score.home, score.score.away, status]);
    if (
      !finished
      && fingerprint === lastFingerprint
      && lastChangedAt !== null
      && currentTime - lastChangedAt > staleAfterMs
    ) {
      return unverified(RESULT_STATUSES.STALE_RESULT, snapshot);
    }
    if (fingerprint !== lastFingerprint) {
      lastFingerprint = fingerprint;
      lastChangedAt = currentTime;
    }

    if (!halfTime && clock < 45) {
      lastFirstHalfScore = { score: copyScore(score.score), clock };
    } else if (!halfTime && clock === 45) {
      if (finished && lastFirstHalfScore) {
        halfTime = copyScore(lastFirstHalfScore.score);
      } else if (!finished) {
        halfTime = copyScore(score.score);
      }
    } else if (!halfTime && clock > 45 && lastFirstHalfScore) {
      halfTime = copyScore(lastFirstHalfScore.score);
    }
    lastClock = clock;

    const phase = finished
      ? RESULT_PHASES.FINISHED
      : clock > 45
        ? RESULT_PHASES.SECOND_HALF
        : RESULT_PHASES.FIRST_HALF;
    const fullTime = finished ? copyScore(score.score) : null;
    const verified = Boolean(finished && halfTime && fullTime);
    const resultId = verified
      ? `${expectedFixture.id}:${normalizeRound(expectedFixture.roundId ?? expectedFixture.roundName)}:`
        + `${fullTime.home}-${fullTime.away}`
      : null;
    if (resultId && completedResultId && completedResultId !== resultId) {
      return unverified(RESULT_STATUSES.CONFLICTING_RESULT, snapshot);
    }
    const duplicate = Boolean(resultId && completedResultId === resultId);
    if (resultId && !completedResultId) completedResultId = resultId;

    return {
      status: verified ? 'verified' : RESULT_STATUSES.OBSERVING,
      observationStatus: verified ? RESULT_STATUSES.VERIFIED : RESULT_STATUSES.OBSERVING,
      fixture: { ...snapshot.fixture },
      clock: snapshot.clock,
      clockMinutes: clock,
      phase,
      homeScore: score.score.home,
      awayScore: score.score.away,
      halfTime: halfTime ? { ...halfTime, verified: true } : null,
      fullTime: fullTime ? { ...fullTime, verified: true } : null,
      result: verified
        ? { homeScore: fullTime.home, awayScore: fullTime.away }
        : null,
      verified,
      duplicate,
      resultId,
      timestamp: snapshot.observedAt,
      observedAt: snapshot.observedAt,
      source: 'betking-live-fixture-dom',
    };
  }

  return Object.freeze({
    observe,
    getProcessedResultCount: () => Number(completedResultId !== null),
  });
}

function verifyResultsPageResult(liveResult, resultsSnapshot) {
  if (
    !liveResult?.verified
    || !liveResult.halfTime?.verified
    || !liveResult.fullTime?.verified
  ) {
    return { status: RESULT_STATUSES.RESULTS_MISMATCH, verified: false, reason: 'LIVE_RESULT_UNVERIFIED' };
  }

  const entries = Array.isArray(resultsSnapshot?.results) ? resultsSnapshot.results : [];
  const matches = entries.filter((entry) => fixtureMatches(entry?.fixture, liveResult.fixture));
  if (matches.length === 0) {
    return { status: RESULT_STATUSES.RESULTS_NOT_FOUND, verified: false };
  }
  if (matches.length > 1) {
    return { status: RESULT_STATUSES.RESULTS_AMBIGUOUS, verified: false };
  }

  const [entry] = matches;
  if (!['FINISHED', 'COMPLETED'].includes(normalizeText(entry.status).toUpperCase())) {
    return { status: RESULT_STATUSES.RESULTS_MISMATCH, verified: false, reason: 'RESULT_NOT_COMPLETE' };
  }
  const finalScore = parseScorePair(entry.fullTime?.home, entry.fullTime?.away);
  if (finalScore.status || finalScore.score.home !== liveResult.fullTime.home
    || finalScore.score.away !== liveResult.fullTime.away) {
    return { status: RESULT_STATUSES.RESULTS_MISMATCH, verified: false, reason: 'FULL_TIME_SCORE_MISMATCH' };
  }

  let halfTime = null;
  if (entry.halfTime !== undefined && entry.halfTime !== null) {
    const halfTimeScore = parseScorePair(entry.halfTime.home, entry.halfTime.away);
    if (halfTimeScore.status || halfTimeScore.score.home !== liveResult.halfTime.home
      || halfTimeScore.score.away !== liveResult.halfTime.away) {
      return { status: RESULT_STATUSES.RESULTS_MISMATCH, verified: false, reason: 'HALF_TIME_SCORE_MISMATCH' };
    }
    halfTime = { ...halfTimeScore.score, verified: true };
  }

  return {
    status: 'verified',
    observationStatus: RESULT_STATUSES.VERIFIED,
    verified: true,
    fixture: { ...entry.fixture },
    fullTime: { ...finalScore.score, verified: true },
    halfTime: halfTime || (liveResult.halfTime ? { ...liveResult.halfTime } : null),
    halfTimeProvided: halfTime !== null,
    timestamp: liveResult.timestamp ?? liveResult.observedAt,
    result: {
      homeScore: finalScore.score.home,
      awayScore: finalScore.score.away,
    },
    source: 'betking-live-plus-results-page',
  };
}

module.exports = {
  RESULT_PHASES,
  RESULT_STATUSES,
  createLiveResultObserver,
  parseMatchClock,
  verifyResultsPageResult,
};
