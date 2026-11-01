// Turning a finished La Liga round into what the strategy needs, and into a report you can read.
// results: { 'BAR-RMA': { ht: {home, away} | null, ft: {home, away} } }  (home/away of that fixture)

const { halfTimeFromGoals } = require('./liveTracking');

const key = (home, away) => `${home}-${away}`;

// Did this bet win? null = cannot tell yet (the result or the half-time score is missing).
function betWon(bet, result) {
  if (!result || !result.ft) return null;
  if (bet.kind === 'winner') {
    return bet.side === 'HOME' ? result.ft.home === 6 && result.ft.away === 0 : result.ft.home === 0 && result.ft.away === 6;
  }
  if (!result.ht) return null;
  const level = result.ft.home === result.ft.away;
  return bet.side === 'HOME' ? level && result.ht.home > result.ht.away : level && result.ht.away > result.ht.home;
}

// placed: [{ key, kind, code, side, fixture: {home, away}, stake, odds }]
function evaluatePlaced(placed, results) {
  const rows = [];
  const unresolved = [];
  const winnersHit = [];
  const teamWinners = [];
  let staked = 0;
  let returned = 0;
  for (const bet of placed) {
    const result = results[key(bet.fixture.home, bet.fixture.away)];
    const won = betWon(bet, result);
    staked += bet.stake;
    if (won === null) { unresolved.push(bet.key); rows.push({ ...bet, won: null, result }); continue; }
    if (won) {
      returned += Math.round(bet.stake * bet.odds);
      (bet.kind === 'winner' ? winnersHit : teamWinners).push(bet.code);
    }
    rows.push({ ...bet, won, result });
  }
  return { rows, unresolved, winnersHit, teamWinners, staked, returned };
}

// Which of the 20 teams' protecting results came in, whether or not a bet was placed (for "won but not placed").
function teamsThatWon(teams, results) {
  const won = [];
  for (const [code, team] of Object.entries(teams)) {
    const [home, away] = team.fixture.split(' v ');
    const result = results[key(home, away)];
    if (betWon({ kind: 'team', side: team.side }, result) === true) won.push(code);
  }
  return won;
}

function resultsFromLive(snapshots) {
  const results = {};
  for (const item of snapshots) {
    if (!item.finished) continue;
    results[key(item.home, item.away)] = { ft: { home: item.score.home, away: item.score.away }, ht: item.goals ? halfTimeFromGoals(item.goals) : null };
  }
  return results;
}

function resultsFromWindow(page) {
  const results = {};
  for (const row of page?.results ?? []) {
    results[key(row.fixture.home, row.fixture.away)] = { ft: { ...row.fullTime }, ht: row.halfTime ? { ...row.halfTime } : null };
  }
  return results;
}

const pad = (value, width) => String(value).padEnd(width);

function formatRoundReport({ round, plan, placed, evaluation, results, teams, notPlaced = [], wonNotPlaced = [] }) {
  const lines = [];
  lines.push(`RESULTS ${round.name}`);
  for (const match of round.matches) {
    const result = results[key(match.home, match.away)];
    lines.push(`  ${pad(`${match.home} v ${match.away}`, 11)} ${result ? `half-time ${result.ht ? `${result.ht.home}-${result.ht.away}` : '?'}, full-time ${result.ft.home}-${result.ft.away}` : 'not read'}`);
  }
  lines.push('  bet        what                         stake   odds   result');
  for (const row of evaluation.rows) {
    const what = row.kind === 'winner' ? `${row.code} wins ${row.side === 'HOME' ? '6-0' : '0-6'}` : `${row.code} ${row.selection} (ahead at HT, level at FT)`;
    lines.push(`  ${pad(row.kind === 'winner' ? 'WINNER' : 'PROTECT', 10)} ${pad(what, 28)} N${pad(row.stake, 5)} ${pad(row.odds, 6)} ${row.won === null ? 'UNKNOWN' : row.won ? 'WON' : 'LOST'}`);
  }
  if (notPlaced.length) lines.push(`  NOT PLACED: ${notPlaced.join(', ')}`);
  lines.push(`  YOU BET AND WON:    ${[...evaluation.winnersHit.map((code) => `${code} 6-0`), ...evaluation.teamWinners].join(', ') || 'none'}`);
  lines.push(`  WON BUT NOT PLACED: ${wonNotPlaced.join(', ') || 'none'}`);
  lines.push(`  STAKED: N${evaluation.staked} | RETURNED: N${evaluation.returned} | NET: ${evaluation.returned - evaluation.staked >= 0 ? '+' : '-'}N${Math.abs(evaluation.returned - evaluation.staked)}`);
  return lines.join('\n');
}

function sessionLine(session) {
  const net = session.returned - session.staked;
  return `SESSION: ${session.rounds} round(s) | staked N${session.staked} | returned N${session.returned} | net ${net >= 0 ? '+' : '-'}N${Math.abs(net)} | rounds with a winning bet: ${session.roundsWithWin}`;
}

module.exports = { betWon, evaluatePlaced, teamsThatWon, resultsFromLive, resultsFromWindow, formatRoundReport, sessionLine };
