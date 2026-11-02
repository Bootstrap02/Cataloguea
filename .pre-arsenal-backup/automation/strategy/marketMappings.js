// Owner-confirmed mapping of every strategy option to its BetKing market and selection.
//
// SOURCE (owner, Oct 17, 2026): a statement of where each option is found, plus two bet-slip
// screenshots that print "<market> - <selection>" for each option: Week 16 LIV - ARS (Liverpool
// HOME) and Week 17 SUN - LIV (Liverpool AWAY). Every option is defined from LIVERPOOL's side, so
// the selection flips with Liverpool's position (correct scores are written home-away on the site):
//
//   HT/FT            home: 1/X  2/X  X/2     away: 2/X  1/X  X/1     (oneX, twoX, x2)
//   Total Goals      0  and  6                                       (tg0, tg6)
//   Correct Score    home: 6-0  4-0  4-1     away: 0-6  0-4  1-4     (winner, ft40, ft41)
//   HT Correct Score home: 3-0  2-1  1-2     away: 0-3  1-2  2-1     (ht30, ht21, ht12)
//
// CAVEATS recorded rather than hidden:
//  * ht21 / ht12 when Liverpool is away: both slips contain BOTH labels (2-1 and 1-2), so the
//    screenshots cannot show which label belongs to which key. Liverpool's side is applied for
//    consistency with ht30 (3-0 home / 0-3 away) and the correct scores.
//  * The panel category that contains "HT Correct Score" is taken to be "Half Time" (it is the
//    only half-time category in the recording). The pipeline verifies at run time that the market
//    and the selection label are really shown before any odd is touched.
//  * Whether the Total Goals label "6" means exactly six goals (as the owner says) or six or more
//    is checked in the market catalogue (a "7+" label would settle it).
//
// The run-time pipeline (marketFirstSequence) still verifies category, market, selection label,
// and fixture on the live page before selecting; a mapping here never replaces that check.

const SOURCE = 'Owner statement and slip screenshots, Oct 17 2026 (Week 16 LIV - ARS, Week 17 SUN - LIV)';

function entry(category, market, selection, note) {
  const base = { status: 'VERIFIED', category, market, evidence: `${SOURCE}.${note ? ` ${note}` : ''}` };
  return typeof selection === 'string'
    ? { ...base, selection }
    : { ...base, selectionBySide: { HOME: selection.HOME, AWAY: selection.AWAY } };
}

const OWNER_MAPPINGS = Object.freeze({
  winner: Object.freeze(entry('Correct Score', 'Correct Score', { HOME: '6-0', AWAY: '0-6' }, 'Slips: "Correct Score - 6-0" (home) and "Correct Score - 0-6" (away).')),
  oneX: Object.freeze(entry('HT/FT', 'HT/FT', { HOME: '1/X', AWAY: '2/X' }, 'oneX = Liverpool leads at half time and the match is drawn.')),
  twoX: Object.freeze(entry('HT/FT', 'HT/FT', { HOME: '2/X', AWAY: '1/X' }, 'twoX = Liverpool trails at half time and the match is drawn.')),
  x2: Object.freeze(entry('HT/FT', 'HT/FT', { HOME: 'X/2', AWAY: 'X/1' }, 'Slips: "HT/FT - X/2" (home) and "HT/FT - X/1" (away): half-time draw, then the opponent wins.')),
  tg0: Object.freeze(entry('Total Goals', 'Total Goals', '0', 'Slips: "Total Goals - 0".')),
  tg6: Object.freeze(entry('Total Goals', 'Total Goals', '6', 'Slips: "Total Goals - 6".')),
  ht21: Object.freeze(entry('Half Time', 'HT Correct Score', { HOME: '2-1', AWAY: '1-2' }, 'Away orientation inferred (both labels appear in both slips).')),
  ht12: Object.freeze(entry('Half Time', 'HT Correct Score', { HOME: '1-2', AWAY: '2-1' }, 'Away orientation inferred (both labels appear in both slips).')),
  ht30: Object.freeze(entry('Half Time', 'HT Correct Score', { HOME: '3-0', AWAY: '0-3' }, 'Slips: "HT Correct Score - 3-0" (home) and "0-3" (away).')),
  ft40: Object.freeze(entry('Correct Score', 'Correct Score', { HOME: '4-0', AWAY: '0-4' }, 'Slips: "Correct Score - 4-0" (home) and "0-4" (away).')),
  ft41: Object.freeze(entry('Correct Score', 'Correct Score', { HOME: '4-1', AWAY: '1-4' }, 'Slips: "Correct Score - 4-1" (home) and "1-4" (away).')),
});

// The owner's order of play: the most important option first, so that if the round countdown
// runs out the least important options are the ones left unplaced.
const STRATEGY_PRIORITY = Object.freeze([
  'winner', 'oneX', 'twoX', 'x2', 'tg0', 'tg6', 'ht21', 'ht12', 'ht30', 'ft40', 'ft41',
]);

// Distinct (category, market) pairs, used by the read-only market catalogue.
function distinctMarkets() {
  const seen = new Map();
  for (const key of STRATEGY_PRIORITY) {
    const mapping = OWNER_MAPPINGS[key];
    const id = `${mapping.category}|${mapping.market}`;
    if (!seen.has(id)) seen.set(id, { category: mapping.category, market: mapping.market, keys: [] });
    seen.get(id).keys.push(key);
  }
  return [...seen.values()];
}

module.exports = { OWNER_MAPPINGS, STRATEGY_PRIORITY, distinctMarkets };
