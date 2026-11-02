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

function resultLabel(won) {
  return won === null || won === undefined ? 'UNKNOWN' : won ? 'WON' : 'LOST';
}

// The round report. With `plan` (the strategy's open round) it lists EVERY option, placed or not, with WON/LOST:
// the two 6-0 winners and all 20 protecting HT/FT options.
function formatRoundReport({ round, plan = null, placed, evaluation, results, teams = {}, notPlaced = [], wonNotPlaced = [] }) {
  const lines = [];
  lines.push(`RESULTS ${round.name}`);
  for (const match of round.matches) {
    const result = results[key(match.home, match.away)];
    lines.push(`  ${pad(`${match.home} v ${match.away}`, 11)} ${result ? `half-time ${result.ht ? `${result.ht.home}-${result.ht.away}` : '?'}, full-time ${result.ft.home}-${result.ft.away}` : 'not read'}`);
  }
  const placedKeys = new Set(placed.map((bet) => bet.key));
  const head = `  ${pad('', 8)} ${pad('option', 31)} ${pad('stake', 7)} ${pad('odds', 7)} ${pad('bet', 21)} result`;
  if (plan) {
    lines.push('  EVERY OPTION THIS ROUND (placed or not):');
    lines.push(head);
    const rows = [];
    for (const code of Object.keys(plan.winnerPlans)) {
      const winnerPlan = plan.winnerPlans[code];
      const fixture = round.matches.find((match) => match.home === code || match.away === code);
      if (!fixture) continue;
      const side = fixture.home === code ? 'HOME' : 'AWAY';
      rows.push({ order: 0, code, text: `${pad('WINNER', 8)} ${pad(`${code} wins ${side === 'HOME' ? '6-0' : '0-6'}`, 31)} ${pad(`N${winnerPlan.stake}`, 7)} ${pad(winnerPlan.odds || '-', 7)} ${pad(placedKeys.has(code) ? 'PLACED' : winnerPlan.playable ? 'NOT PLACED' : 'no stake', 21)} ${resultLabel(betWon({ kind: 'winner', side }, results[key(fixture.home, fixture.away)]))}` });
    }
    for (const [code, option] of Object.entries(plan.options)) {
      const team = teams[code];
      if (!team) continue;
      const [home, away] = team.fixture.split(' v ');
      const result = results[key(home, away)];
      const won = betWon({ kind: 'team', side: team.side }, result);
      const state = placedKeys.has(code) ? 'PLACED' : option.playable ? 'NOT PLACED (time)' : 'below N10';
      const detail = result ? `   [${team.fixture}: HT ${result.ht ? `${result.ht.home}-${result.ht.away}` : '?'}, FT ${result.ft.home}-${result.ft.away}]` : '';
      rows.push({ order: won === true ? 1 : won === false ? 2 : 3, code, text: `${pad('PROTECT', 8)} ${pad(`${code} ${team.selection} (HT lead, FT draw)`, 31)} ${pad(`N${option.stake}`, 7)} ${pad(option.odds, 7)} ${pad(state, 21)} ${resultLabel(won)}${detail}` });
    }
    rows.sort((first, second) => first.order - second.order || first.code.localeCompare(second.code));
    for (const row of rows) lines.push(`  ${row.text}`);
  } else {
    lines.push('  bet        what                         stake   odds   result');
    for (const row of evaluation.rows) {
      const what = row.kind === 'winner' ? `${row.code} wins ${row.side === 'HOME' ? '6-0' : '0-6'}` : `${row.code} ${row.selection} (ahead at HT, level at FT)`;
      lines.push(`  ${pad(row.kind === 'winner' ? 'WINNER' : 'PROTECT', 10)} ${pad(what, 28)} N${pad(row.stake, 5)} ${pad(row.odds, 6)} ${resultLabel(row.won)}`);
    }
  }
  if (notPlaced.length) lines.push(`  NOT PLACED: ${notPlaced.join(', ')}`);
  const lost = evaluation.rows.filter((row) => row.won === false).map((row) => (row.kind === 'winner' ? `${row.code} 6-0` : row.code));
  lines.push(`  YOU BET AND WON:    ${[...evaluation.winnersHit.map((code) => `${code} 6-0`), ...evaluation.teamWinners].join(', ') || 'none'}`);
  lines.push(`  YOU BET AND LOST:   ${lost.join(', ') || 'none'}`);
  lines.push(`  WON BUT NOT PLACED: ${wonNotPlaced.join(', ') || 'none'}`);
  lines.push(`  STAKED: N${evaluation.staked} | RETURNED: N${evaluation.returned} | NET: ${evaluation.returned - evaluation.staked >= 0 ? '+' : '-'}N${Math.abs(evaluation.returned - evaluation.staked)}`);
  return lines.join('\n');
}

// What the strategy carries into the next round: each winner's base and running cost, every option's deficit,
// the big deficits, the broken targets (the pressure that reaches N1000 is added to the winners' bases) and the bank.
function formatCarried(state) {
  const nonZero = (map) => Object.entries(map || {}).filter(([, value]) => value).sort((a, b) => b[1] - a[1]).map(([code, value]) => `${code} N${Math.round(value)}`);
  const lines = ['CARRIED FORWARD'];
  lines.push(`  winners:        ${state.winners.map((code) => `${code} base N${Math.round(state.bases[code])}, running cost N${Math.round(state.smallDeficits[code])}`).join(' | ')}`);
  lines.push(`  deficits:       ${nonZero(state.privateDef).join(', ') || 'none'}`);
  lines.push(`  big deficits:   ${nonZero(state.bigDef).join(', ') || 'none'}`);
  lines.push(`  broken targets: ${nonZero(state.brokenTarget).join(', ') || 'none'}  (at N1000 a target is added to the winners' bases, shared equally)`);
  lines.push(`  bank:           N${Math.round(state.bank || 0)}`);
  return lines.join('\n');
}

function sessionLine(session) {
  const net = session.returned - session.staked;
  return `SESSION: ${session.rounds} round(s) | staked N${session.staked} | returned N${session.returned} | net ${net >= 0 ? '+' : '-'}N${Math.abs(net)} | rounds with a winning bet: ${session.roundsWithWin}`;
}

module.exports = { betWon, evaluatePlaced, teamsThatWon, resultsFromLive, resultsFromWindow, formatRoundReport, formatCarried, sessionLine };
