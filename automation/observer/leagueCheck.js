// Does a card really belong to the league that was asked for? (pure, unit tested)
const { LEAGUES } = require('./leagues');

function belongsToLeague(league, card, leagues = LEAGUES) {
  const codes = new Set(card.rows.flatMap((row) => [row.home, row.away]));
  if (!codes.size) return false;
  if (league.teams) {
    const mine = [...codes].filter((code) => league.teams.includes(code)).length;
    return mine / codes.size >= 0.8;
  }
  // a league whose teams are not known yet must not look like any of the others
  for (const other of leagues) {
    if (other.key === league.key || !other.teams) continue;
    const overlap = [...codes].filter((code) => other.teams.includes(code)).length;
    if (overlap > 3) return false;
  }
  return true;
}

module.exports = { belongsToLeague };
