// Writes the CHARTS and prints what stands out.   node observer-report.js [--league epl,laliga]
//   automation/artifacts/observer/<league>/charts.csv   a row for every team and stake option: how many completed seasons
//   in a row it missed, how often it hit, when it was last seen, and the hits in each season. Open it in a spreadsheet.
const fs = require('node:fs');
const path = require('node:path');
const { resolveLeagues } = require('./automation/observer/leagues');
const { readMatches, buildOccurrences, missedSeasons, toCsv } = require('./automation/observer/charts');
const { OPTIONS } = require('./automation/observer/options');

const argIndex = process.argv.indexOf('--league');
const dir = path.join(__dirname, 'automation', 'artifacts', 'observer');
for (const league of resolveLeagues(argIndex === -1 ? undefined : process.argv[argIndex + 1])) {
  const folder = path.join(dir, league.key);
  const matches = readMatches(path.join(folder, 'matches.ndjson'));
  if (!matches.length) { console.log(`[${league.key}] no records yet.`); continue; }
  let state = {};
  try { state = JSON.parse(fs.readFileSync(path.join(folder, 'state.json'), 'utf8')); } catch (error) { /* no state */ }
  const occurrences = buildOccurrences(matches);
  const teams = Object.keys(occurrences.teams).sort();
  fs.writeFileSync(path.join(folder, 'charts.csv'), toCsv({ occurrences, state, teams }));
  const seasons = Object.entries(state.seasons || {}).map(([n, s]) => `${n}${s.complete ? (s.partial ? ' (complete, partial start)' : ' (complete)') : ' (in progress)'}`).join(', ');
  console.log(`\n[${league.key}] ${matches.length} matches, ${teams.length} teams. Seasons: ${seasons || 'none'}.`);
  const worst = [];
  for (const team of teams) for (const option of OPTIONS) {
    const missed = missedSeasons(occurrences, team, option.id, state);
    if (missed > 0) worst.push({ team, option: option.label, missed });
  }
  worst.sort((a, b) => b.missed - a.missed);
  console.log(worst.length ? `  Longest misses (completed seasons in a row):` : '  No option has a miss streak yet (it needs completed seasons).');
  for (const row of worst.slice(0, 12)) console.log(`    ${row.team}  ${row.option}: ${row.missed} season(s)`);
  console.log(`  Chart written: ${path.join(folder, 'charts.csv')}`);
}
