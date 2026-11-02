// Arsenal-relative helpers.
//
// Several Cataloguea strategy options are defined from Arsenal's point of
// view (oneX / twoX) or depend on whether Arsenal is home or away (x2 / x1).
// Website scores are home/away; this module is the single place where the
// conversion happens.

const ARSENAL_CODES = Object.freeze(['ARS', 'ARSENAL']);

const ARSENAL_SIDE = Object.freeze({
  HOME: 'HOME',
  AWAY: 'AWAY',
});

const SIDE_STATUS = Object.freeze({
  RESOLVED: 'RESOLVED',
  NOT_FOUND: 'NOT_FOUND',
  AMBIGUOUS: 'AMBIGUOUS',
});

const { OWNER_MAPPINGS } = require('./marketMappings');

// Strategy keys whose selection depends on Arsenal's home/away position, taken from the
// owner-confirmed mapping table (marketMappings.js): for example oneX is 1/X when Arsenal is
// home and 2/X when away, and x2 is X/2 at home and X/1 away.
const ORIENTED_SELECTIONS = Object.freeze(Object.fromEntries(
  Object.entries(OWNER_MAPPINGS)
    .filter(([, mapping]) => mapping.selectionBySide)
    .map(([key, mapping]) => [key, Object.freeze({
      [ARSENAL_SIDE.HOME]: mapping.selectionBySide.HOME,
      [ARSENAL_SIDE.AWAY]: mapping.selectionBySide.AWAY,
    })]),
));

function normalizeCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isArsenal(value) {
  return ARSENAL_CODES.includes(normalizeCode(value));
}

function determineArsenalSide(fixture) {
  const home = normalizeCode(fixture?.home);
  const away = normalizeCode(fixture?.away);
  const homeIsArsenal = isArsenal(home);
  const awayIsArsenal = isArsenal(away);

  if (homeIsArsenal && awayIsArsenal) {
    return { status: SIDE_STATUS.AMBIGUOUS, side: null, opponent: null };
  }
  if (homeIsArsenal) {
    return { status: SIDE_STATUS.RESOLVED, side: ARSENAL_SIDE.HOME, opponent: away || null };
  }
  if (awayIsArsenal) {
    return { status: SIDE_STATUS.RESOLVED, side: ARSENAL_SIDE.AWAY, opponent: home || null };
  }
  return { status: SIDE_STATUS.NOT_FOUND, side: null, opponent: null };
}

function isScoreValue(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

// Converts a { home, away } score into { arsenal, opponent }.
// Returns null when the score is incomplete/invalid or the side is unknown.
function toArsenalScore(score, side) {
  if (!score || !isScoreValue(score.home) || !isScoreValue(score.away)) return null;
  if (side === ARSENAL_SIDE.HOME) return { arsenal: score.home, opponent: score.away };
  if (side === ARSENAL_SIDE.AWAY) return { arsenal: score.away, opponent: score.home };
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
      reason: 'Arsenal home/away position is not established; selection cannot be oriented.',
    };
  }
  return {
    strategyKey,
    oriented: true,
    selection,
    reason: `Arsenal is ${side === ARSENAL_SIDE.HOME ? 'home' : 'away'}, so the intended selection is ${selection}.`,
  };
}

module.exports = {
  ARSENAL_CODES,
  ARSENAL_SIDE,
  ORIENTED_SELECTIONS,
  SIDE_STATUS,
  determineArsenalSide,
  isArsenal,
  resolveOrientedSelection,
  toArsenalScore,
};
