// Read-only page capture, so the La Liga reader can be written against the REAL page.
//   node capture-page.js
// It opens BetKing in a visible browser (same saved login as the automation). YOU move around by hand, exactly as in
// your recordings. Whenever the page shows something worth capturing, come back to this terminal and press Enter;
// type q + Enter to finish. It never clicks, types or places anything.
//
// Please capture, in this order (Enter after each):
//   1. Kings Liga tab, HT/FT market, all fixtures collapsed
//   2. the same, with ONE fixture expanded (its 9 outcomes visible)
//   3. the betslip with 2 or 3 La Liga picks added (do NOT place them)
//   4. the Kings Liga page while a match is playing (LIVE) and 5. right after full time (FT)
// Everything is saved in automation/artifacts/page-capture-<time>/ . The HTML includes whatever is on your screen
// (your balance, for example), so look at it before you share it.

process.env.AUTOMATION_MODE = 'betking-live';
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { createBetKingLiveConfig } = require('./automation/betkingLiveConfig');

async function main() {
  const config = createBetKingLiveConfig(process.env);
  const { chromium } = require('playwright');
  const outDir = path.join(__dirname, 'automation', 'artifacts', `page-capture-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(outDir, { recursive: true });
  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    channel: config.browserChannel,
    timeout: config.browserLaunchTimeoutMs,
    viewport: { width: 1280, height: 800 },
  });
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log(`Browser open. Captures go to ${outDir}`);
    let count = 0;
    for (;;) {
      const answer = await terminal.question('Move the page to what you want captured, then press Enter (q + Enter to finish): ');
      if (answer.trim().toLowerCase() === 'q') break;
      count += 1;
      const label = (answer.trim() || `capture-${count}`).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40);
      const base = path.join(outDir, `${String(count).padStart(2, '0')}-${label}`);
      const text = await page.evaluate(() => document.body.innerText || '');
      fs.writeFileSync(`${base}.txt`, text);
      const html = await page.evaluate(() => document.documentElement.outerHTML);
      fs.writeFileSync(`${base}.html`, html.slice(0, 4_000_000));
      const testids = await page.evaluate(() => {
        const counts = {};
        document.querySelectorAll('[data-testid]').forEach((element) => {
          const id = element.getAttribute('data-testid');
          counts[id] = (counts[id] || 0) + 1;
        });
        return { url: location.href, testids: counts };
      });
      fs.writeFileSync(`${base}-testids.json`, JSON.stringify(testids, null, 2));
      await page.screenshot({ path: `${base}.png` }).catch(() => {});
      console.log(`  saved capture ${count} (${text.split('\n').length} lines of text, ${Object.keys(testids.testids).length} kinds of element).`);
    }
    console.log(`Done. Zip the folder ${outDir} and send it.`);
  } finally {
    terminal.close();
    await context.close();
  }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
