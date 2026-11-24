// The four leagues the observer records. Kings Champions is left out on purpose.
//   key        short name used in folders and logs
//   tabLabel   the league's tab on the Scheduled Leagues page (the tab of the league that is OPEN shows its countdown
//              instead of its name, so the tab is also found by its fixed position in the row of five)
//   tabIndex   position of the tab in that row: League 0, Liga 1, Champions 2, Italiano 3, Bundliga 4
//   titleRegex the title of the Results window ("Kings League", "Kings Liga", ...): used to check it is the right league
//   weeks      weeks in a season (38, the Bundesliga 34)
//   perRound   matches in a round: 10 with 20 teams, but 9 in the Bundesliga (18 teams)
//   roundMin   minutes per round (3, the Bundesliga 1.5): a whole season is 114 minutes (Bundesliga 51)
//   everyMin   how often the Results window is read. The window keeps only the LAST 10 ROUNDS = 30 minutes (Bundesliga 15), so
//              a visit every 25 (12) minutes leaves 5 (3) minutes of slack: a visit that fails is retried within minutes
//   watchEverySec how often the odds collector looks at the page. It STAYS on the page and takes each new round as it appears:
//              the page shows 4 rounds ahead = 12 minutes (Bundesliga 6), a new round every 3 minutes (1.5)
// The team codes seen in the owner's screen recording. They protect the record book: a card whose teams are not this
// league's (the window had not refreshed yet after switching league) is thrown away instead of recorded.
const EPL_TEAMS = ['MNU', 'SUN', 'NOT', 'BHA', 'FUL', 'COV', 'LEE', 'CHE', 'BRE', 'EVE', 'NEW', 'CRY', 'LIV', 'HUL', 'AST', 'MNC', 'BOU', 'TOT', 'ARS', 'IPS'];
const LALIGA_TEAMS = ['ATM', 'RAY', 'OSA', 'RMA', 'VIL', 'CEL', 'RSO', 'ESP', 'BET', 'ALV', 'RST', 'GET', 'ATH', 'LEV', 'MLG', 'BAR', 'DLC', 'SEV', 'ELC', 'VAL'];
const SERIEA_TEAMS = ['NAP', 'ROM', 'INT', 'ATA', 'COM', 'SAS', 'JUV', 'MIL', 'FIO', 'LAZ', 'VEN', 'TOR', 'PAR', 'LEC', 'UDI', 'CAG', 'BOL', 'FRO', 'MON', 'GEN'];

// Names for the alerts. The 3-letter codes are only unique INSIDE a league (LEV is Levante in La Liga and Leverkusen in the
// Bundesliga; BRE is Brentford and Bremen), so every league has its own list. A few names are best guesses from the badges
// (marked ?): tell me if one is wrong.
const NAMES = {
  epl: { NEW: 'Newcastle', ARS: 'Arsenal', TOT: 'Tottenham', CHE: 'Chelsea', BHA: 'Brighton', AST: 'Aston Villa', MNC: 'Manchester City', BOU: 'Bournemouth', LIV: 'Liverpool', MNU: 'Manchester United', LEE: 'Leeds', CRY: 'Crystal Palace', SUN: 'Sunderland', HUL: 'Hull City', BRE: 'Brentford', EVE: 'Everton', IPS: 'Ipswich', COV: 'Coventry', FUL: 'Fulham', NOT: 'Nottingham Forest' },
  laliga: { BAR: 'Barcelona', BET: 'Real Betis', RMA: 'Real Madrid', ATH: 'Athletic Club', VIL: 'Villarreal', RSO: 'Real Sociedad', ATM: 'Atletico Madrid', VAL: 'Valencia', CEL: 'Celta Vigo', ESP: 'Espanyol', RST: 'Racing Santander', RAY: 'Rayo Vallecano', ALV: 'Alaves', MLG: 'Malaga', ELC: 'Elche', GET: 'Getafe', SEV: 'Sevilla', DLC: 'Deportivo La Coruna', OSA: 'Osasuna', LEV: 'Levante' },
  seriea: { NAP: 'Napoli', ROM: 'Roma', INT: 'Inter', ATA: 'Atalanta', COM: 'Como', SAS: 'Sassuolo', JUV: 'Juventus', MIL: 'AC Milan', FIO: 'Fiorentina', LAZ: 'Lazio', VEN: 'Venezia', TOR: 'Torino', PAR: 'Parma', LEC: 'Lecce', UDI: 'Udinese', CAG: 'Cagliari', BOL: 'Bologna', FRO: 'Frosinone', MON: 'Monza', GEN: 'Genoa' },
  bundesliga: { LEV: 'Bayer Leverkusen', HOF: 'Hoffenheim', BVB: 'Borussia Dortmund', BMU: 'Bayern Munich', RBL: 'RB Leipzig', FRE: 'Freiburg', FRA: 'Eintracht Frankfurt', BRE: 'Werder Bremen', MNZ: 'Mainz', STU: 'Stuttgart', ELV: 'Elversberg (?)', KOE: 'Koln', AUG: 'Augsburg', SCH: 'Schalke', PAD: 'Paderborn', MGB: 'Monchengladbach', UBE: 'Union Berlin', HSV: 'Hamburg' },
};

const BUNDESLIGA_TEAMS = ['BMU', 'HOF', 'BRE', 'LEV', 'RBL', 'ELV', 'BVB', 'PAD', 'FRA', 'MGB', 'AUG', 'STU', 'HSV', 'FRE', 'KOE', 'MNZ', 'SCH', 'UBE'];

const LEAGUES = [
  { key: 'epl', name: 'Premier League (Kings League)', tabLabel: /^KINGS\s+LEAGUE$/i, tabIndex: 0, titleRegex: /Kings\s+League/i, teams: EPL_TEAMS, perRound: 10, weeks: 38, roundMin: 3, everyMin: 25, watchEverySec: 20 },
  { key: 'laliga', name: 'La Liga (Kings Liga)', tabLabel: /^KINGS\s+LIGA$/i, tabIndex: 1, titleRegex: /Kings\s+Liga/i, teams: LALIGA_TEAMS, perRound: 10, weeks: 38, roundMin: 3, everyMin: 25, watchEverySec: 20 },
  { key: 'seriea', name: 'Serie A (Kings Italiano)', tabLabel: /^KINGS\s+ITALIANO$/i, tabIndex: 3, titleRegex: /Kings\s+Italiano/i, teams: SERIEA_TEAMS, perRound: 10, weeks: 38, roundMin: 3, everyMin: 25, watchEverySec: 20 },
  { key: 'bundesliga', name: 'Bundesliga (Kings Bundliga)', tabLabel: /^KINGS\s+BUNDL?IGA$/i, tabIndex: 4, titleRegex: /Kings\s+Bund/i, teams: BUNDESLIGA_TEAMS, perRound: 9, weeks: 34, roundMin: 1.5, everyMin: 12, watchEverySec: 10 },
];

// OBSERVER_EVERY_<KEY>_MIN changes a league's results interval (for example OBSERVER_EVERY_EPL_MIN=20);
// OBSERVER_WATCH_<KEY>_SEC changes how often the odds collector looks (seconds)
function resolveLeagues(selection, env = process.env) {
  const wanted = selection ? String(selection).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean) : null;
  return LEAGUES
    .filter((league) => !wanted || wanted.includes(league.key))
    .map((league) => ({
      ...league,
      names: NAMES[league.key],
      everyMin: Number(env[`OBSERVER_EVERY_${league.key.toUpperCase()}_MIN`]) || league.everyMin,
      watchEverySec: Number(env[`OBSERVER_WATCH_${league.key.toUpperCase()}_SEC`]) || league.watchEverySec,
    }));
}

module.exports = { LEAGUES, NAMES, resolveLeagues };
