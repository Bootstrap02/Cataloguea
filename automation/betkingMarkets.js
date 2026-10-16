// Market catalogue for the Liverpool fixture(s) on the REAL BetKing page:
//   npm run automation:betking:markets [-- --week N]
//
// Waits for you to sign in (no Enter needed), then, for each market category in the More
// Markets panel, opens the category and records the selection labels and odds shown for each
// visible Liverpool fixture. It is READ ONLY: it opens categories (navigation) but never clicks
// an odd, never touches the bet slip, and never places a bet. The saved report is the evidence
// you need to verify the strategy-to-market mappings.

process.env.AUTOMATION_MODE = 'betking-live';

const fs = require('node:fs');
const path = require('node:path');
const { createBetKingLiveConfig } = require('./betkingLiveConfig');
const { loadBetKingSelectors } = require('./sportsbook/betkingSelectors');
const { createMarketFlow } = require('./sportsbook/betkingMarketFlow');
const { OBSERVED_BETKING_MARKET_CATEGORIES } = require('./strategy/canonicalBetTypes');
const { determineLiverpoolSide } = require('./strategy/liverpoolPerspective');
const { parseWeek } = require('./strategy/seasonWeek');
const { waitForAccess } = require('./betkingProbe');

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function renderCatalogueMarkdown(catalogue) {
  const lines = [
    '# BetKing market catalogue (read only)',
    '',
    `Generated: ${catalogue.generatedAt}`,
    'No odd was clicked and nothing was added to the bet slip.',
    '',
  ];
  for (const fixture of catalogue.fixtures) {
    lines.push(`## ${fixture.roundName}: ${fixture.home} v ${fixture.away} (Liverpool ${fixture.side === 'HOME' ? 'home' : 'away'})`, '');
    for (const row of fixture.categories) {
      if (row.status !== 'READ') {
        lines.push(`- ${row.category}: NOT READ (${row.status})`);
        continue;
      }
      const pairs = row.labels.map((label, index) => `${label} ${row.odds[index] ?? '?'}`).join(' | ');
      lines.push(`- ${row.category}: ${pairs || '(no selections shown)'}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const config = createBetKingLiveConfig(process.env);
  const selectors = loadBetKingSelectors(config.selectorsFile);
  const onlyWeek = readArgument('--week') === undefined ? null : parseWeek(readArgument('--week'));
  console.log('REAL SITE (read only; no odd is clicked):');
  console.log(`  opening ${config.targetUrl}`);

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
    const access = await waitForAccess(page, config);
    if (!access) {
      console.log('The page did not become accessible in time.');
      process.exitCode = 1;
      return;
    }

    const flow = createMarketFlow({ page, config, selectors });
    const rounds = Array.isArray(access.snapshot?.rounds) ? access.snapshot.rounds : [];
    const targets = [];
    for (const round of rounds) {
      const week = parseWeek(String(round.roundName ?? ''));
      if (onlyWeek !== null && week !== onlyWeek) continue;
      for (const fixture of round.fixtures ?? []) {
        const side = determineLiverpoolSide(fixture);
        if (side.side) targets.push({ roundName: round.roundName, home: fixture.home, away: fixture.away, side: side.side });
      }
    }
    if (targets.length === 0) {
      console.log('No Liverpool fixture is visible in the selected rounds.');
      process.exitCode = 1;
      return;
    }

    const initial = await flow.readMarketState(targets[0]);
    const catalogue = { generatedAt: new Date().toISOString(), url: page.url(), fixtures: [] };
    for (const target of targets) {
      console.log(`Reading categories for ${target.roundName}: ${target.home} v ${target.away}`);
      const categories = [];
      for (const category of OBSERVED_BETKING_MARKET_CATEGORIES) {
        const rows = await flow.catalogueCategories([category], target);
        categories.push(...rows);
        console.log(`  ${category}: ${rows[0].status}${rows[0].labels.length ? ` (${rows[0].labels.length} selections)` : ''}`);
      }
      catalogue.fixtures.push({ ...target, categories });
    }
    if (initial.selectedMarketName) await flow.openMarketCategory(initial.selectedMarketName, targets[0]);

    const directory = path.join(config.runsDir, `markets-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'market-catalogue.json'), `${JSON.stringify(catalogue, null, 2)}\n`);
    fs.writeFileSync(path.join(directory, 'market-catalogue.md'), `${renderCatalogueMarkdown(catalogue)}\n`);
    console.log(`Catalogue saved in ${directory}`);
  } finally {
    await context.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[BETKING MARKETS ERROR] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main, renderCatalogueMarkdown };
