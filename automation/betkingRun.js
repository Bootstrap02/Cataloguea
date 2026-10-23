// Entry point for the REAL BetKing run (the real site only; there is no simulation):
//   npm run automation:betking:run -- --week 5
// Sign in on the BetKing window that opens; the run then continues by itself.
//
// Options:  --week N|auto   game week (1-38). Default auto: the upcoming round on the real
//                           schedule, reconciled with the last settled week
//           --max-weeks N   weeks to process before stopping (default 1)
//           --through STEP  how far the market-first pipeline goes: identify (default, read only),
//                           select (adds the odd to the slip), slip (also enters and verifies the stake)
//                           place (also places the bet; needs AUTOMATION_ALLOW_REAL_MONEY=yes)
//           --auto-confirm  place every verified bet without typing a confirmation for each
//           --prompts       ask for Enter at the human checkpoints (default: fully automatic)

process.env.AUTOMATION_MODE = 'betking-live';

const { createBetKingLiveConfig } = require('./betkingLiveConfig');
const { loadBetKingSelectors, loadVerifiedMarketMappings } = require('./sportsbook/betkingSelectors');
const { createBetKingController } = require('./betkingController');
const { parseWeek } = require('./strategy/seasonWeek');
const { OWNER_MAPPINGS } = require('./strategy/marketMappings');

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
  const environment = {
    ...process.env,
    ...(through === undefined ? {} : { AUTOMATION_PIPELINE_THROUGH: through }),
    ...(process.argv.includes('--auto-confirm') ? { AUTOMATION_AUTO_CONFIRM: 'true' } : {}),
  };
  const effectiveConfig = createBetKingLiveConfig(environment);
  if (effectiveConfig.pipelineThrough === 'place' && !effectiveConfig.allowRealMoney) {
    throw new Error('Placing real-money bets needs AUTOMATION_ALLOW_REAL_MONEY=yes (and AUTOMATION_MAX_STAKE to set your per-bet cap).');
  }
  const selectors = loadBetKingSelectors(effectiveConfig.selectorsFile);
  const mappingFile = loadVerifiedMarketMappings(effectiveConfig.mappingsFile);
  // Owner-confirmed mappings are built in; a mapping in your own file replaces the built-in one.
  const mappings = { ...OWNER_MAPPINGS, ...mappingFile.mappings };

  console.log('BetKing live run (real site; no simulation).');
  console.log(`  live selectors configured:    ${selectors.configured.live}`);
  console.log(`  results selectors configured: ${selectors.configured.results}`);
  console.log(`  market-first pipeline goes through: ${effectiveConfig.pipelineThrough}`);
  console.log(`  market mappings in use:       ${Object.keys(mappings).length} (${Object.keys(mappingFile.mappings).length} from your file)`);
  if (effectiveConfig.pipelineThrough === 'place') {
    console.log(`  REAL MONEY: bets WILL be placed (cap per bet: N${effectiveConfig.maxStake}; confirmation: ${effectiveConfig.autoConfirm ? 'automatic' : 'typed for each bet'}).`);
  }
  for (const problem of selectors.problems) console.log(`  selectors problem: ${problem}`);
  for (const rejected of mappingFile.rejected) console.log(`  mapping ignored: ${rejected.key ?? '(file)'}: ${rejected.reason}`);

  const controller = createBetKingController({ config: effectiveConfig, selectors, mappings });
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
