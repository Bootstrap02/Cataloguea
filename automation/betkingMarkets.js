// Market catalogue for the Liverpool fixture(s) on the REAL BetKing page:
//   npm run automation:betking:markets [-- --week N]
//
// Waits for you to sign in (no Enter needed), then, for each market category in the More
// Markets panel, opens the category and records the selection labels and odds shown for each
// visible Liverpool fixture. It is READ ONLY: it opens categories (navigation) but never clicks
// an odd, never touches the bet slip, and never places a bet. The saved report is the evidence
// you need to confirm the owner's strategy-to-market mappings: for every option it reports
// whether the exact labels were seen with valid odds in the mapped category and market.

process.env.AUTOMATION_MODE = 'betking-live';

const fs = require('node:fs');
const path = require('node:path');
const { createBetKingLiveConfig } = require('./betkingLiveConfig');
const { loadBetKingSelectors } = require('./sportsbook/betkingSelectors');
const { createMarketFlow } = require('./sportsbook/betkingMarketFlow');
const { distinctMarkets } = require('./strategy/marketMappings');
const { determineLiverpoolSide } = require('./strategy/liverpoolPerspective');
const { parseWeek } = require('./strategy/seasonWeek');
const { waitForAccess } = require('./betkingProbe');
const { checkMappingsAgainstCatalogue } = require('./sportsbook/mappingEvidence');

// The catalogue reads exactly the (category, market) pairs the strategy options map to.
const CATALOGUE_TARGETS = distinctMarkets();

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function renderCatalogueMarkdown(catalogue, proposalResults = []) {
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
        const why = row.evidence?.error ?? row.evidence?.reason ?? '';
        lines.push(`- ${row.category}: NOT READ (${row.status}${why ? `: ${why}` : ''})`);
        continue;
      }
      const pairs = row.labels.map((label, index) => `${label} ${row.odds[index] ?? '?'}`).join(' | ');
      lines.push(`- ${row.category}: ${pairs || '(no selections shown)'}`);
    }
    lines.push('');
  }
  lines.push('## Mapping check (labels seen on the page)', '');
  for (const result of proposalResults) {
    const proof = result.fixtures.find((fixture) => fixture.allPresent);
    lines.push(`- ${result.strategyKey} -> ${result.category}${result.market !== result.category ? ` / ${result.market}` : ''} ${result.needed.join(' / ')}: ${result.labelsConfirmed ? `labels CONFIRMED on ${proof.home} v ${proof.away}` : 'labels NOT confirmed'}`);
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

    const directory = path.join(config.runsDir, `markets-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(directory, { recursive: true });

    const cleared = await flow.clearOverlays();
    console.log(`Overlay check: ${cleared.status}${cleared.via ? ` (${cleared.via})` : ''}`);
    if (!cleared.ok) {
      console.log('A pop-up is covering the page and could not be closed safely. Close it yourself; the run waits for it.');
    }

    const initial = await flow.readMarketState(targets[0]);
    const initialCategory = initial.selectedMarketName || initial.headerCategory;
    const catalogue = { generatedAt: new Date().toISOString(), url: page.url(), fixtures: [] };
    let diagnosticsSaved = false;
    for (const target of targets) {
      console.log(`Reading categories for ${target.roundName}: ${target.home} v ${target.away}`);
      const categories = [];
      let rowFailures = 0;
      for (const entry of CATALOGUE_TARGETS) {
        const category = entry.market === entry.category ? entry.category : `${entry.category} / ${entry.market}`;
        const rows = await flow.catalogueCategories([entry], target);
        categories.push(...rows);
        console.log(`  ${category} (${entry.keys.join(', ')}): ${rows[0].status}${rows[0].labels.length ? ` (${rows[0].labels.length} selections)` : ''}`);
        rowFailures = rows[0].status === 'FIXTURE_ROW_NOT_AVAILABLE' ? rowFailures + 1 : 0;
        if (rows[0].status !== 'READ' && !diagnosticsSaved) {
          diagnosticsSaved = true;
          const diagnostics = await flow.captureDiagnostics(target);
          fs.writeFileSync(path.join(directory, 'diagnostics.json'), `${JSON.stringify({ category, row: rows[0], diagnostics }, null, 2)}\n`);
          try {
            await page.screenshot({ path: path.join(directory, 'diagnostics.png') });
          } catch (error) {
            console.log(`  (screenshot failed: ${error.message.split('\n')[0]})`);
          }
          console.log(`  Saved diagnostics.json and diagnostics.png in ${directory}`);
        }
        if (rowFailures >= 2) {
          console.log('  The fixture row disappeared twice in a row; stopping this fixture (see diagnostics).');
          break;
        }
      }
      catalogue.fixtures.push({ ...target, categories });
    }
    if (initialCategory && !/^favourites$/i.test(initialCategory)) await flow.openMarketCategory(initialCategory, targets[0]);

    fs.writeFileSync(path.join(directory, 'market-catalogue.json'), `${JSON.stringify(catalogue, null, 2)}\n`);
    const proposalResults = checkMappingsAgainstCatalogue(catalogue);
    fs.writeFileSync(path.join(directory, 'market-catalogue.md'), `${renderCatalogueMarkdown(catalogue, proposalResults)}\n`);
    console.log(`Catalogue saved in ${directory}`);
    for (const result of proposalResults) {
      console.log(`  ${result.strategyKey} -> ${result.category}${result.market !== result.category ? ` / ${result.market}` : ''} ${result.needed.join(' / ')}: ${result.labelsConfirmed ? 'labels confirmed on the page' : 'labels NOT confirmed'}`);
    }
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
