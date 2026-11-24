// The PERCENTILE TABLE.   node observer-table.js [--league epl,laliga] [--top 15]
// For every team and every stake option of a league it shows the odds it has (a season's worth: 38, Bundesliga 34), the
// percentile (the average of the highest quarter of those odds), the band that percentile falls in, how many completed seasons
// without the option that band needs, how many it has missed, how many are still to go, and the stake target.
// It writes percentile-table.csv (open it in a spreadsheet) and percentile-table.json in each league's folder. It sends nothing.
const fs = require('node:fs');
const path = require('node:path');
const { resolveLeagues } = require('./automation/observer/leagues');
const { readMatches } = require('./automation/observer/charts');
const { createOddsStore } = require('./automation/observer/oddsStore');
const { buildPercentileTable, tableToCsv, signalsFrom } = require('./automation/observer/rulesEngine');

const argValue = (name) => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1]; };
const dir = path.join(__dirname, 'automation', 'artifacts', 'observer');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'automation', 'observer', 'rules-of-engagement', 'rules.json'), 'utf8'));
const top = Number(argValue('--top')) || 15;

for (const league of resolveLeagues(argValue('--league'))) {
  const folder = path.join(dir, league.key);
  let state = null;
  try { state = JSON.parse(fs.readFileSync(path.join(folder, 'state.json'), 'utf8')); } catch (error) { /* no results yet */ }
  const oddsRecords = createOddsStore({ dir, league }).latestCompleteRecords();
  if (!oddsRecords.length) { console.log(`\n[${league.key}] no complete odds cycle has been received yet, so there are no percentiles. (The odds collector sends them to the database; the recorder fetches them.)`); continue; }
  const rows = buildPercentileTable({ league, matches: readMatches(path.join(folder, 'matches.ndjson')), state: state || { seasons: {} }, oddsRecords, rules });
  fs.writeFileSync(path.join(folder, 'percentile-table.csv'), tableToCsv(rows));
  fs.writeFileSync(path.join(folder, 'percentile-table.json'), `${JSON.stringify({ league: league.key, builtAt: new Date().toISOString(), rows }, null, 2)}\n`);
  const count = (status) => rows.filter((row) => row.status === status).length;
  const teams = new Set(rows.map((row) => row.team)).size;
  console.log(`\n[${league.key}] ${teams} teams x stake options = ${rows.length} rows. TRIGGERED: ${count('TRIGGERED')}, waiting: ${count('waiting')}, odds incomplete: ${count('odds incomplete')}. Multiplier ${rules.multiplier}.`);
  const sig = signalsFrom(rows);
  for (const row of sig.slice(0, top)) console.log(`  TRIGGERED  ${row.teamName}  ${row.optionShort}: missed ${row.missed} (needs ${row.seasons}), percentile ${row.percentile}, stake N${row.stake}`);
  const close = rows.filter((row) => row.status === 'waiting').sort((a, b) => a.seasonsToGo - b.seasonsToGo || b.missed - a.missed).slice(0, top);
  if (close.length) console.log(`  Closest to triggering:`);
  for (const row of close) console.log(`    ${row.teamName}  ${row.optionShort}: missed ${row.missed} of ${row.seasons} (${row.seasonsToGo} to go), percentile ${row.percentile}, stake N${row.stake}`);
  console.log(`  Table written: ${path.join(folder, 'percentile-table.csv')}`);
}
