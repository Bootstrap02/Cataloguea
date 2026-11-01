// READ-ONLY La Liga scan: opens BetKing, switches to the Kings Liga tab, opens HT/FT, reads every fixture's grid and
// prints, for all 20 teams, the odds of its own 1/X (home) or 2/X (away) and the stake the strategy would give it
// right now (a fresh strategy at 10000, split 5000 + 5000 between Barcelona and Real Madrid). It also reads the 6-0
// odds of Barcelona and Real Madrid from Correct Score. It places NOTHING and clicks only the league tab, the market
// chips and the fixture accordions.
//   node laliga-scan.js
// Everything it saw is saved in automation/artifacts/laliga-scan-<time>/ (page text and screenshots).

process.env.AUTOMATION_MODE = 'betking-live';
const fs = require('node:fs');
const path = require('node:path');
const { createBetKingLiveConfig } = require('./automation/betkingLiveConfig');
const { createMarketFlow } = require('./automation/sportsbook/betkingMarketFlow');
const reader = require('./automation/sportsbook/laLigaReader');
const { createState, planRound } = require('./automation/strategy/laLigaStrategy');

async function main() {
  const config = createBetKingLiveConfig(process.env);
  const outDir = path.join(__dirname, 'automation', 'artifacts', `laliga-scan-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(outDir, { recursive: true });
  const { chromium } = require('playwright');
  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false, channel: config.browserChannel, timeout: config.browserLaunchTimeoutMs, viewport: { width: 420, height: 900 },
  });
  let step = 0;
  const page = context.pages()[0] || await context.newPage();
  const evidence = async (label) => {
    step += 1;
    const base = path.join(outDir, `${String(step).padStart(2, '0')}-${label}`);
    fs.writeFileSync(`${base}.txt`, await page.evaluate(() => document.body.innerText || '').catch(() => ''));
    await page.screenshot({ path: `${base}.png` }).catch(() => {});
  };
  try {
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('[data-testid="league-round"]', { timeout: 20000 }).catch(() => {});
    const flow = createMarketFlow({ page, config });
    await flow.clearOverlays().catch(() => {});

    const switched = await reader.switchToLiga(page);
    console.log(`League tabs seen: ${(switched.tabs || []).map((tab) => `${tab.testid}${tab.text ? ` ("${tab.text}")` : ''}`).join(', ') || 'none'}`);
    if (!switched.ok) throw new Error('Could not find the Kings Liga tab.');
    console.log(`Clicked: ${switched.clicked.testid}`);
    const loaded = await reader.waitForLigaRound(page);
    await evidence('liga-tab');
    if (!loaded.ok) throw new Error(`The Liga fixtures did not appear (only ${loaded.known} La Liga teams recognised). See ${outDir}.`);
    const round = loaded.rounds.find((item) => item.matches.length >= 8) || loaded.rounds[0];
    console.log(`Round: ${round.name}  countdown: ${round.timer || 'n/a'}  fixtures: ${round.matches.map((match) => `${match.home}-${match.away}`).join(', ')}`);

    // HT/FT for every fixture
    const first = round.matches[0];
    const opened = await flow.openMarketCategory('HT/FT', { roundName: round.name, home: first.home, away: first.away }, { market: 'HT/FT' });
    await evidence('ht-ft-opened');
    if (opened.status !== 'MARKET_CATEGORY_OPENED') throw new Error(`Could not open HT/FT (${opened.status}). See ${outDir}.`);
    const fixtures = [];
    for (const match of round.matches) {
      const result = await reader.readFixtureGrid(page, round.name, match.home, match.away, { expectedLabels: reader.HT_FT_LABELS });
      fixtures.push({ home: match.home, away: match.away, grid: result.grid, ok: result.ok });
      console.log(`  ${match.home} v ${match.away}: ${Object.keys(result.grid).length} odds read${result.ok ? '' : ` (${result.reason})`}`);
    }
    await evidence('ht-ft-read');
    const { teams, missing } = reader.teamOddsFromFixtures(fixtures);

    // 6-0 for Barcelona and Real Madrid
    const winnerOdds = {};
    for (const code of ['BAR', 'RMA']) {
      const fixture = round.matches.find((match) => match.home === code || match.away === code);
      if (!fixture) { console.log(`  ${code}: not playing this round.`); continue; }
      const side = fixture.home === code ? 'HOME' : 'AWAY';
      const csOpened = await flow.openMarketCategory('Correct Score', { roundName: round.name, home: fixture.home, away: fixture.away }, { market: 'Correct Score' });
      if (csOpened.status !== 'MARKET_CATEGORY_OPENED') { console.log(`  ${code}: Correct Score would not open (${csOpened.status}).`); continue; }
      const grid = await reader.readFixtureGrid(page, round.name, fixture.home, fixture.away, { expectedLabels: [side === 'HOME' ? '6-0' : '0-6'] });
      winnerOdds[code] = reader.winnerOddsFromGrid(grid.grid, side);
      await evidence(`correct-score-${code}`);
    }

    // What the strategy would stake now (fresh state; nothing is placed)
    const plan = planRound(createState({ baseStake: 10000 }), {
      roundId: `scan-${round.name}`,
      winnerOdds: Object.fromEntries(Object.entries(winnerOdds).filter(([, odds]) => odds)),
      teamOdds: Object.fromEntries(Object.entries(teams).map(([code, team]) => [code, team.odds])),
    });
    console.log('\nWINNERS (6-0 correct score, base 5000 each)');
    for (const code of ['BAR', 'RMA']) {
      const entry = plan.open.winnerPlans[code];
      console.log(`  ${code}: odds ${winnerOdds[code] ?? 'not read'}  stake N${entry.stake}`);
    }
    console.log('\nPROTECTING OPTIONS (HT/FT: ahead at half-time, level at full time)   team  bet   odds   stake  play?');
    for (const [code, team] of Object.entries(teams).sort((a, b) => plan.open.options[b[0]].stake - plan.open.options[a[0]].stake)) {
      const option = plan.open.options[code];
      console.log(`  ${code.padEnd(4)} ${team.selection}  ${String(team.odds).padStart(7)}  N${String(option.stake).padStart(5)}  ${option.playable ? 'PLAY' : 'below N10: not bet, carried'}   (${team.fixture})`);
    }
    if (missing.length) console.log(`\nCould not read: ${missing.join(', ')}`);
    console.log(`\nTeams read: ${Object.keys(teams).length} of 20. Playable now: ${Object.values(plan.open.options).filter((option) => option.playable).length}. Nothing was placed. Evidence: ${outDir}`);
  } catch (error) {
    await evidence('error');
    console.error(`\nSTOPPED: ${error.message}\nEvidence saved in ${outDir}`);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

main();
