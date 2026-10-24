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
    : (record.marketProposal?.category
      ? `proposal only: ${record.marketProposal.category}${record.marketProposal.selection ? ` / ${record.marketProposal.selection}` : ''} (${record.marketProposal.status})`
      : 'unresolved');
  const stage = record.pipeline?.stage ?? record.pipelineStatus ?? '-';
  return `| ${record.strategyKey} | ${stake} | ${record.eligibilityStatus} | ${selection} | ${stage} | ${odds} | ${record.reason ?? ''} |`;
}

function section(title, records) {
  if (!records || !records.length) return `### ${title}\n\nNone.\n`;
  return `### ${title}\n\n| Option | Final stake | Status | Market / selection | Stage reached | Odds | Reason |\n| --- | --- | --- | --- | --- | --- | --- |\n${records.map(row).join('\n')}\n`;
}

function renderPlanMarkdown(prep) {
  const { plan, identification } = prep;
  const authorizations = (plan.instructions ?? []).filter((record) => record.authorizationRequest);
  const lines = [
    `# Instructions for Week ${plan.week}`,
    '',
    `Fixture: ${plan.fixture.home} v ${plan.fixture.away} (Arsenal ${plan.arsenalSide === 'HOME' ? 'home' : 'away'}, opponent ${plan.opponent})`,
    `Round: ${identification.roundName}   Fixture id: ${plan.fixture.fixtureId}`,
    `Market-first pipeline went through: ${plan.pipelineThrough ?? 'not run'}`,
    '',
    '**No wager has been placed or submitted by this program.** The market-first stages (category opened, selection identified, odds verified, selection added, slip verified) are observations of the page; none of them means a bet was accepted.',
    '',
    section('Reached the configured stage', plan.instructions),
    section('Waiting for their turn in the slip (options are prepared one at a time)', plan.deferred),
    section('Stopped by the market-first pipeline', plan.pipelineFailed),
    section('Stake qualifies but market mapping is unresolved', plan.unresolved),
    section('Skipped (stake below 10; settles as non-winning in the strategy)', plan.skipped),
    section('No stake calculated', plan.noStake),
  ];
  for (const record of authorizations) {
    lines.push('', `## Awaiting your authorization: ${record.strategyKey}`, '', '```', record.authorizationRequest, '```');
  }
  return lines.join('\n');
}

module.exports = { renderPlanMarkdown };
