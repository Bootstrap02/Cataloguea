// Human-readable rendering of an operational plan (the bet preparation record).
// It states plainly that no wager is placed by this program.

function money(value) {
  return typeof value === 'number' ? String(value) : '-';
}

function row(record) {
  const stake = `${money(record.stake)} (normal ${money(record.stakeComponents?.normal)} + big ${money(record.stakeComponents?.bigDeficit)})`;
  const odds = record.oddsSource === 'BETKING'
    ? `${record.betKingOdds} (BetKing)`
    : record.odds !== null && record.odds !== undefined ? `${record.odds} (strategy table)` : 'missing';
  const selection = record.betKingMarket
    ? `${record.betKingMarket} / ${record.betKingSelection}`
    : (record.orientedSelection ? `label ${record.orientedSelection} (unverified)` : 'unresolved');
  return `| ${record.strategyKey} | ${stake} | ${record.eligibilityStatus} | ${selection} | ${odds} | ${record.reason ?? ''} |`;
}

function section(title, records) {
  if (!records.length) return `### ${title}\n\nNone.\n`;
  return `### ${title}\n\n| Option | Final stake | Status | BetKing market / selection | Odds | Reason |\n| --- | --- | --- | --- | --- | --- |\n${records.map(row).join('\n')}\n`;
}

function renderPlanMarkdown(prep) {
  const { plan, identification } = prep;
  const lines = [
    `# Instructions for Week ${plan.week}`,
    '',
    `Fixture: ${plan.fixture.home} v ${plan.fixture.away} (Liverpool ${plan.liverpoolSide === 'HOME' ? 'home' : 'away'}, opponent ${plan.opponent})`,
    `Round: ${identification.roundName}   Fixture id: ${plan.fixture.fixtureId}`,
    '',
    '**No wager has been placed or submitted by this program.** Status "verified" below means a mapping you supplied was confirmed visible on the page, not that a bet was accepted.',
    '',
    section('Ready for review (stake qualifies and mapping is verified)', plan.instructions),
    section('Stake qualifies but market mapping is unresolved', plan.unresolved),
    section('Skipped (stake below 10; settles as non-winning in the strategy)', plan.skipped),
    section('No stake calculated', plan.noStake),
  ];
  return lines.join('\n');
}

module.exports = { renderPlanMarkdown };
