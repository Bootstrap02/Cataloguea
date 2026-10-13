// Liverpool-relative helpers.
//
// Several Cataloguea strategy options are defined from Liverpool's point of
// view (oneX / twoX) or depend on whether Liverpool is home or away (x2 / x1).
// Website scores are home/away; this module is the single place where the
// conversion happens.

const LIVERPOOL_CODES = Object.freeze(['LIV', 'LIVERPOOL']);

const LIVERPOOL_SIDE = Object.freeze({
  HOME: 'HOME',
  AWAY: 'AWAY',
});

const SIDE_STATUS = Object.freeze({
  RESOLVED: 'RESOLVED',
  NOT_FOUND: 'NOT_FOUND',
  AMBIGUOUS: 'AMBIGUOUS',
});

// Strategy keys whose selection depends on Liverpool's home/away position.
// The user's rule: Liverpool home -> "X2"; Liverpool away -> "X1".
// Only the selection LABEL is specified. The settlement condition and the
// mapping to a BetKing market label are NOT specified and stay unresolved.
const ORIENTED_SELECTIONS = Object.freeze({
  x2: Object.freeze({
    [LIVERPOOL_SIDE.HOME]: 'X2',
    [LIVERPOOL_SIDE.AWAY]: 'X1',
  }),
});

function normalizeCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isLiverpool(value) {
  return LIVERPOOL_CODES.includes(normalizeCode(value));
}

function determineLiverpoolSide(fixture) {
  const home = normalizeCode(fixture?.home);
  const away = normalizeCode(fixture?.away);
  const homeIsLiverpool = isLiverpool(home);
  const awayIsLiverpool = isLiverpool(away);

  if (homeIsLiverpool && awayIsLiverpool) {
    return { status: SIDE_STATUS.AMBIGUOUS, side: null, opponent: null };
  }
  if (homeIsLiverpool) {
    return { status: SIDE_STATUS.RESOLVED, side: LIVERPOOL_SIDE.HOME, opponent: away || null };
  }
  if (awayIsLiverpool) {
    return { status: SIDE_STATUS.RESOLVED, side: LIVERPOOL_SIDE.AWAY, opponent: home || null };
  }
  return { status: SIDE_STATUS.NOT_FOUND, side: null, opponent: null };
}

function isScoreValue(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

// Converts a { home, away } score into { liverpool, opponent }.
// Returns null when the score is incomplete/invalid or the side is unknown.
function toLiverpoolScore(score, side) {
  if (!score || !isScoreValue(score.home) || !isScoreValue(score.away)) return null;
  if (side === LIVERPOOL_SIDE.HOME) return { liverpool: score.home, opponent: score.away };
  if (side === LIVERPOOL_SIDE.AWAY) return { liverpool: score.away, opponent: score.home };
  return null;
}

function resolveOrientedSelection(strategyKey, side) {
  const table = ORIENTED_SELECTIONS[strategyKey];
  if (!table) {
    return { strategyKey, oriented: false, selection: null, reason: 'Strategy key is not orientation dependent.' };
  }
  const selection = table[side] ?? null;
  if (!selection) {
    return {
      strategyKey,
      oriented: true,
      selection: null,
      reason: 'Liverpool home/away position is not established; selection cannot be oriented.',
    };
  }
  return {
    strategyKey,
    oriented: true,
    selection,
    reason: `Liverpool is ${side === LIVERPOOL_SIDE.HOME ? 'home' : 'away'}, so the intended selection is ${selection}.`,
  };
}

module.exports = {
  LIVERPOOL_CODES,
  LIVERPOOL_SIDE,
  ORIENTED_SELECTIONS,
  SIDE_STATUS,
  determineLiverpoolSide,
  isLiverpool,
  resolveOrientedSelection,
  toLiverpoolScore,
};
