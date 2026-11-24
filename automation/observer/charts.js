// The CHARTS: for every team and every stake option, in which seasons the option HIT (and in which weeks), and how many
// completed seasons in a row it has MISSED. Built from the record book (matches.ndjson), nothing else.
//   * a season counts for a streak only when it is COMPLETE, was seen from its first week (not "partial") and has NO GAPS
//     (a week that was never recorded could hide a hit, so such a season must not count as a miss)
//   * the streak counts back from the latest such season while the option did not hit
const fs = require('node:fs');
const { OPTIONS, optionsHit } = require('./options');

function readMatches(file) {
  try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)); } catch (error) { return []; }
}

// -> { teams: { ARS: { HTFT_1X: { 1: [{week: 12}, ...], 2: [...] } } }, seasons: [numbers seen] }
function buildOccurrences(matches) {
  const teams = {};
  const seasons = new Set();
  for (const match of matches) {
    seasons.add(match.season);
    for (const side of ['HOME', 'AWAY']) {
      const team = side === 'HOME' ? match.home : match.away;
      const hits = optionsHit(match, side);
      if (!teams[team]) teams[team] = {};
      for (const id of hits) {
        const row = teams[team][id] || (teams[team][id] = {});
        (row[match.season] || (row[match.season] = [])).push({ week: match.week, against: side === 'HOME' ? match.away : match.home, home: side === 'HOME' });
      }
    }
  }
  return { teams, seasons: [...seasons].sort((a, b) => a - b) };
}

// state = the observer's state.json (state.seasons[n] = { complete, partial, weeks })
function usableSeasons(state) {
  return Object.entries(state?.seasons || {})
    .filter(([, season]) => season.complete && !season.partial && !(season.gaps && season.gaps.length))
    .map(([number]) => Number(number))
    .sort((a, b) => a - b);
}

// consecutive completed seasons (latest first) in which the option never hit
function missedSeasons(occurrences, team, optionId, state) {
  const row = occurrences.teams[team]?.[optionId] || {};
  const usable = usableSeasons(state);
  let missed = 0;
  for (let i = usable.length - 1; i >= 0; i -= 1) {
    if (i < usable.length - 1 && usable[i] !== usable[i + 1] - 1) break;   // a season we have no record of breaks the count
    if ((row[usable[i]] || []).length > 0) break;
    missed += 1;
  }
  return missed;
}

function lastSeen(occurrences, team, optionId) {
  const row = occurrences.teams[team]?.[optionId] || {};
  const seasons = Object.keys(row).map(Number).sort((a, b) => b - a);
  if (!seasons.length) return null;
  const weeks = row[seasons[0]].map((hit) => hit.week).sort((a, b) => b - a);
  return { season: seasons[0], week: weeks[0] };
}

// One CSV per league: a row for every team and option.
function toCsv({ occurrences, state, teams }) {
  const shownSeasons = occurrences.seasons.slice(-12);   // a season is about 2 hours: a column for every season ever played would never end
  const header = ['team', 'option_id', 'option', 'missed_completed_seasons', 'hits_total', 'last_seen_season', 'last_seen_week', ...shownSeasons.map((season) => `hits_season_${season}`)];
  const rows = [header.join(',')];
  for (const team of teams) {
    for (const option of OPTIONS) {
      const row = occurrences.teams[team]?.[option.id] || {};
      const total = Object.values(row).reduce((sum, hits) => sum + hits.length, 0);
      const seen = lastSeen(occurrences, team, option.id);
      rows.push([team, option.id, `"${option.label}"`, missedSeasons(occurrences, team, option.id, state), total, seen?.season ?? '', seen?.week ?? '',
        ...shownSeasons.map((season) => (row[season] || []).length)].join(','));
    }
  }
  return `${rows.join('\n')}\n`;
}

module.exports = { readMatches, buildOccurrences, usableSeasons, missedSeasons, lastSeen, toCsv };
