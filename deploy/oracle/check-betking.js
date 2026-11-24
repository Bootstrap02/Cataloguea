process.env.AUTOMATION_MODE = 'betking-live';
const { createBetKingLiveConfig } = require('../../automation/betkingLiveConfig');
const { resolveLeagues } = require('../../automation/observer/leagues');
const { createResultsWindow } = require('../../automation/observer/resultsWindow');
const { launchBrowser, listUrlFor } = require('../../automation/observer/runtime');

async function main() {
  const config = createBetKingLiveConfig(process.env);
  const league = resolveLeagues('epl')[0];
  const { context } = await launchBrowser({
    config,
    account: 'observer',
    headless: process.env.OBSERVER_HEADLESS === 'yes',
  });
  try {
    const page = context.pages()[0] || await context.newPage();
    const listUrl = listUrlFor(config);
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const reader = createResultsWindow({ page, listUrl, log: console.log });
    const { cards } = await reader.readCards(league);
    const complete = cards.filter((card) => card.complete);
    if (complete.length === 0) throw new Error('The EPL Results window opened but showed no complete round.');
    console.log(`RESULT: OK. Read ${complete.length} complete EPL round(s); no betting actions were performed.`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(`RESULT: FAILED. ${error.message}`);
  process.exitCode = 1;
});
