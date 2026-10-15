// Opens the REAL BetKing Kings League scheduled page in a visible browser (persistent
// profile) and reports what it can read. Use it to confirm which site you are on:
//   npm run automation:betking:open
// It is read-only: it places no bet and does not use the local sample page.

process.env.AUTOMATION_MODE = 'betking-live';

const { createBetKingLiveConfig } = require('./betkingLiveConfig');
const { inspectBetKingPage } = require('./sportsbook/betkingAdapter');
const { determineLiverpoolSide } = require('./strategy/liverpoolPerspective');
const { parseWeek } = require('./strategy/seasonWeek');

async function waitForEnter(message) {
  const readline = require('node:readline/promises');
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    await terminal.question(message);
  } finally {
    terminal.close();
  }
}

async function main() {
  const config = createBetKingLiveConfig(process.env);
  console.log('REAL SITE (not the sample page):');
  console.log(`  opening ${config.targetUrl}`);
  console.log(`  browser profile ${config.profileDir}`);

  const { chromium } = require('playwright');
  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    channel: config.browserChannel,
    timeout: config.browserLaunchTimeoutMs,
    viewport: { width: 1280, height: 800 },
  });
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    try {
      await page.waitForSelector('[data-testid="league-round"]', { timeout: 15000 });
    } catch (error) {
      console.log('  note: no round list appeared within 15 s (sign in or wait for the page to load).');
    }

    const result = await inspectBetKingPage(page);
    console.log(`  page URL now: ${page.url()}`);
    console.log(`  classification: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    const rounds = Array.isArray(result.snapshot?.rounds) ? result.snapshot.rounds : [];
    console.log(`  rounds visible: ${rounds.length}`);
    for (const round of rounds) {
      const week = parseWeek(String(round.roundName ?? ''));
      for (const fixture of round.fixtures ?? []) {
        const side = determineLiverpoolSide(fixture);
        if (side.side) {
          console.log(`  ${round.roundName}${week ? '' : ' (no week number)'}: ${fixture.home} v ${fixture.away} (Liverpool ${side.side === 'HOME' ? 'home' : 'away'}), id ${fixture.fixtureId}`);
        }
      }
    }
    await waitForEnter('Press Enter to close the browser. ');
  } finally {
    await context.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[BETKING OPEN ERROR] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
