// Entry point for the REAL BetKing run (the real site only; there is no simulation):
//   npm run automation:betking:run -- --week 5
// Sign in on the BetKing window that opens; the run then continues by itself.
//
// Options:  --week N|auto   game week (1-38). Default auto: the upcoming round on the real
//                           schedule, reconciled with the last settled week
//           --max-weeks N   weeks to process before stopping (default 1)
//           --through STEP  how far the market-first pipeline goes: identify (default, read only),
//                           select (adds the odd to the slip), slip (also enters and verifies the stake)
//           --prompts       ask for Enter at the human checkpoints (default: fully automatic)

process.env.AUTOMATION_MODE = 'betking-live';

const { createBetKingLiveConfig } = require('./betkingLiveConfig');
const { loadBetKingSelectors, loadVerifiedMarketMappings } = require('./sportsbook/betkingSelectors');
const { createBetKingController } = require('./betkingController');
const { parseWeek } = require('./strategy/seasonWeek');

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const config = createBetKingLiveConfig(process.env);
  const weekArgument = readArgument('--week');
  const automaticWeek = weekArgument === undefined || weekArgument === 'auto';
  const requiredWeek = automaticWeek ? null : parseWeek(weekArgument);
  if (!automaticWeek && requiredWeek === null) {
    throw new Error('--week must be a number between 1 and 38, or auto.');
  }
  const maxWeeksRaw = readArgument('--max-weeks');
  const maxWeeks = maxWeeksRaw === undefined ? 1 : Number(maxWeeksRaw);
  if (!Number.isInteger(maxWeeks) || maxWeeks < 1 || maxWeeks > 38) {
    throw new Error('--max-weeks must be an integer between 1 and 38.');
  }

  const through = readArgument('--through');
  const effectiveConfig = through === undefined
    ? config
    : createBetKingLiveConfig({ ...process.env, AUTOMATION_PIPELINE_THROUGH: through });
  const selectors = loadBetKingSelectors(effectiveConfig.selectorsFile);
  const mappingFile = loadVerifiedMarketMappings(effectiveConfig.mappingsFile);

  console.log('BetKing live run (real site; no simulation).');
  console.log(`  live selectors configured:    ${selectors.configured.live}`);
  console.log(`  results selectors configured: ${selectors.configured.results}`);
  console.log(`  market-first pipeline goes through: ${effectiveConfig.pipelineThrough}`);
  console.log(`  verified market mappings:     ${Object.keys(mappingFile.mappings).length}`);
  for (const problem of selectors.problems) console.log(`  selectors problem: ${problem}`);
  for (const rejected of mappingFile.rejected) console.log(`  mapping ignored: ${rejected.key ?? '(file)'}: ${rejected.reason}`);

  const controller = createBetKingController({ config: effectiveConfig, selectors, mappings: mappingFile.mappings });
  const outcome = await controller.run({
    requiredWeek,
    maxWeeks,
    prompts: process.argv.includes('--prompts'),
  });
  console.log(JSON.stringify(outcome, null, 2));
  if (outcome.status !== 'COMPLETED') process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[BETKING RUN ERROR] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
