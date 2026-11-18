// The four leagues the observer records. Kings Champions is left out on purpose.
//   key        short name used in folders and logs
//   tabLabel   the league's tab on the Scheduled Leagues page (the tab of the league that is OPEN shows its countdown
//              instead of its name, so the tab is also found by its fixed position in the row of five)
//   tabIndex   position of the tab in that row: League 0, Liga 1, Champions 2, Italiano 3, Bundliga 4
//   titleRegex the title of the Results window ("Kings League", "Kings Liga", ...): used to check it is the right league
//   weeks      weeks in a season (38, the Bundesliga 34)
//   perRound   matches in a round: 10 with 20 teams, but 9 in the Bundesliga (18 teams)
//   everyMin   how often the Results window is read (the round lasts 30 minutes, the Bundesliga 15)
// The team codes seen in the owner's screen recording. They protect the record book: a card whose teams are not this
// league's (the window had not refreshed yet after switching league) is thrown away instead of recorded.
const EPL_TEAMS = ['MNU', 'SUN', 'NOT', 'BHA', 'FUL', 'COV', 'LEE', 'CHE', 'BRE', 'EVE', 'NEW', 'CRY', 'LIV', 'HUL', 'AST', 'MNC', 'BOU', 'TOT', 'ARS', 'IPS'];
const LALIGA_TEAMS = ['ATM', 'RAY', 'OSA', 'RMA', 'VIL', 'CEL', 'RSO', 'ESP', 'BET', 'ALV', 'RST', 'GET', 'ATH', 'LEV', 'MLG', 'BAR', 'DLC', 'SEV', 'ELC', 'VAL'];
const BUNDESLIGA_TEAMS = ['BMU', 'HOF', 'BRE', 'LEV', 'RBL', 'ELV', 'BVB', 'PAD', 'FRA', 'MGB', 'AUG', 'STU', 'HSV', 'FRE', 'KOE', 'MNZ', 'SCH', 'UBE'];

const LEAGUES = [
  { key: 'epl', name: 'Premier League (Kings League)', tabLabel: /^KINGS\s+LEAGUE$/i, tabIndex: 0, titleRegex: /Kings\s+League/i, teams: EPL_TEAMS, perRound: 10, weeks: 38, everyMin: 25 },
  { key: 'laliga', name: 'La Liga (Kings Liga)', tabLabel: /^KINGS\s+LIGA$/i, tabIndex: 1, titleRegex: /Kings\s+Liga/i, teams: LALIGA_TEAMS, perRound: 10, weeks: 38, everyMin: 25 },
  { key: 'seriea', name: 'Serie A (Kings Italiano)', tabLabel: /^KINGS\s+ITALIANO$/i, tabIndex: 3, titleRegex: /Kings\s+Italiano/i, teams: null, perRound: 10, weeks: 38, everyMin: 25 },   // Serie A: team codes not seen yet, checked against the other leagues instead
  { key: 'bundesliga', name: 'Bundesliga (Kings Bundliga)', tabLabel: /^KINGS\s+BUNDL?IGA$/i, tabIndex: 4, titleRegex: /Kings\s+Bund/i, teams: BUNDESLIGA_TEAMS, perRound: 9, weeks: 34, everyMin: 12 },
];

// OBSERVER_EVERY_<KEY>_MIN changes a league's interval (for example OBSERVER_EVERY_EPL_MIN=20)
function resolveLeagues(selection, env = process.env) {
  const wanted = selection ? String(selection).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean) : null;
  return LEAGUES
    .filter((league) => !wanted || wanted.includes(league.key))
    .map((league) => ({ ...league, everyMin: Number(env[`OBSERVER_EVERY_${league.key.toUpperCase()}_MIN`]) || league.everyMin }));
}

module.exports = { LEAGUES, resolveLeagues };
