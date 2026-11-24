// The rules of engagement (rules-of-engagement/rules.json), applied to the charts and the odds database.
// A SIGNAL needs both: the option missed for enough completed seasons (charts) AND the percentile of its odds (odds database).
const { OPTIONS, BY_ID, oddsFor } = require('./options');
const { buildOccurrences, missedSeasons } = require('./charts');
const { topQuarterAverage } = require('./percentile');

// percentile -> { band, seasons, stake }
function ruleFor(percentile, rules) {
  const band = percentile <= rules.firstBandUpTo ? 0 : Math.ceil((percentile - rules.firstBandUpTo) / rules.bandWidth);
  const seasons = rules.firstBandSeasons + band * rules.extraSeasonsPerBand;
  const ladder = rules.baseStake + band * rules.stakeStep;
  const stake = rules.capAppliesTo === 'final'
    ? Math.min(ladder * rules.multiplier, rules.stakeCap)
    : Math.min(ladder, rules.stakeCap) * rules.multiplier;
  return { band, seasons, stake, base: Math.min(ladder, rules.stakeCap) };
}

// odds records of ONE complete odds cycle -> { TEAM: { OPTION_ID: [odds in each of its fixtures] } }
function teamOptionOdds(records) {
  const fixtures = new Map();
  for (const record of records) {
    const key = `${record.week}|${record.home}|${record.away}`;
    const fixture = fixtures.get(key) || { home: record.home, away: record.away, odds: {} };
    (fixture.odds[record.group] || (fixture.odds[record.group] = {}))[record.sel] = record.odd;
    fixtures.set(key, fixture);
  }
  const teams = {};
  for (const fixture of fixtures.values()) {
    for (const [side, team] of [['HOME', fixture.home], ['AWAY', fixture.away]]) {
      for (const option of OPTIONS) {
        const odd = oddsFor(option.id, fixture.odds, side);
        if (odd === null) continue;
        ((teams[team] || (teams[team] = {}))[option.id] || (teams[team][option.id] = [])).push(odd);
      }
    }
  }
  return teams;
}

// THE PERCENTILE TABLE: one row for EVERY team and EVERY stake option of a league, with its odds, its percentile, the rule
// that percentile falls in, how many completed seasons the option has missed, and whether it is TRIGGERED right now.
function buildPercentileTable({ league, matches, state, oddsRecords, rules, minOddsShare = 0.9 }) {
  const occurrences = buildOccurrences(matches);
  const odds = teamOptionOdds(oddsRecords);
  const rows = [];
  for (const team of Object.keys(odds).sort()) {
    for (const option of OPTIONS) {
      const list = odds[team][option.id];
      if (!list) continue;
      const missed = missedSeasons(occurrences, team, option.id, state);
      const base = { league: league.key, leagueName: league.name, team, teamName: league.names?.[team] || team, optionId: option.id, option: option.label, optionShort: option.label.replace(/ \((leads|trails)[^)]*\)$/, ''), odds: list.length, missed, multiplier: rules.multiplier };
      const percentile = list.length >= league.weeks * minOddsShare ? topQuarterAverage(list) : null;   // the odds of a whole season are needed
      if (percentile === null) { rows.push({ ...base, percentile: null, band: null, seasons: null, stake: null, base: null, seasonsToGo: null, status: 'odds incomplete' }); continue; }
      const rule = ruleFor(percentile, rules);
      rows.push({ ...base, percentile, ...rule, seasonsToGo: Math.max(0, rule.seasons - missed), status: missed >= rule.seasons ? 'TRIGGERED' : 'waiting' });
    }
  }
  return rows;
}

const signalsFrom = (rows) => rows.filter((row) => row.status === 'TRIGGERED').sort((a, b) => b.missed - a.missed || a.team.localeCompare(b.team));

// -> signals (every team/option whose rule is met right now)
function evaluate(input) { return signalsFrom(buildPercentileTable(input)); }

const CSV_COLUMNS = ['league', 'team', 'teamName', 'optionId', 'option', 'odds', 'percentile', 'band', 'seasons', 'stake', 'multiplier', 'missed', 'seasonsToGo', 'status'];
const CSV_HEADER = ['league', 'team', 'team_name', 'option_id', 'option', 'odds_count', 'percentile', 'band', 'seasons_needed', 'stake_target', 'multiplier', 'missed_seasons', 'seasons_to_go', 'status'];
function tableToCsv(rows) {
  const cell = (value) => (value === null || value === undefined ? '' : /[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
  return `${[CSV_HEADER.join(','), ...rows.map((row) => CSV_COLUMNS.map((column) => cell(row[column])).join(','))].join('\n')}\n`;
}

// Alert once when a signal appears, again only when it grows (one more season missed) or its stake changes.
// `sent` = { "league|team|option": { missed, stake } }. Signals that are no longer true are forgotten.
function decideToSend(signals, sent) {
  const next = {};
  const toSend = [];
  for (const signal of signals) {
    const key = `${signal.league}|${signal.team}|${signal.optionId}`;
    const before = sent[key];
    next[key] = { missed: signal.missed, stake: signal.stake };
    if (!before || signal.missed > before.missed || signal.stake !== before.stake) toSend.push({ key, signal });
  }
  return { toSend, next };
}

function describe(signal) {
  return [
    `${signal.teamName || signal.team} (${signal.leagueName}): no ${signal.option} for ${signal.missed} completed season(s).`,
    `Percentile (average of the highest quarter of its ${signal.odds} odds): ${signal.percentile}  ->  band ${signal.band}: needs ${signal.seasons} season(s) missed.`,
    `Stake target: N${signal.stake} (base N${signal.base} x multiplier ${signal.multiplier}).`,
  ];
}

module.exports = { ruleFor, teamOptionOdds, buildPercentileTable, signalsFrom, tableToCsv, evaluate, decideToSend, describe };
