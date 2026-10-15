// Real-site button-access probe:  npm run automation:betking:probe
//
// Opens the REAL BetKing Kings League scheduled page (the sample page is never used),
// waits for you to sign in (no Enter needed), then proves the platform's own buttons can
// be seen and used: it outlines the controls, clicks the round-switcher buttons and
// market tabs (navigation only), records what changed, and restores the view.
// It never clicks odds, selections, or anything in the bet slip.

process.env.AUTOMATION_MODE = 'betking-live';

const fs = require('node:fs');
const path = require('node:path');
const { createBetKingLiveConfig } = require('./betkingLiveConfig');
const { inspectBetKingPage, BETKING_STATUSES } = require('./sportsbook/betkingAdapter');
const { renderProbeMarkdown, runControlProbe, summarizeProbe } = require('./sportsbook/betkingProbe');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForAccess(page, config) {
  const deadline = Date.now() + config.loginWaitTimeoutMs;
  let announced = false;
  while (Date.now() < deadline) {
    let result = null;
    try {
      result = await inspectBetKingPage(page);
    } catch (error) {
      result = null;
    }
    const status = result?.status;
    if (status && status !== BETKING_STATUSES.AUTH_REQUIRED && status !== BETKING_STATUSES.PAGE_UNAVAILABLE) {
      return result;
    }
    if (!announced) {
      console.log('Sign in to BetKing in the open browser window. The probe continues by itself once the page is accessible.');
      announced = true;
    }
    await sleep(config.pollIntervalMs);
  }
  return null;
}

async function main() {
  const config = createBetKingLiveConfig(process.env);
  console.log('REAL SITE (the sample page is retired and never used):');
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
    try {
      await page.waitForSelector('[data-testid="league-round"]', { timeout: 15000 });
    } catch (error) {
      // Classification below reports what is actually visible.
    }

    const access = await waitForAccess(page, config);
    if (!access) {
      console.log('The page did not become accessible in time (still signed out or unavailable).');
      process.exitCode = 1;
      return;
    }
    console.log(`Page accessible: ${access.status}. Probing the platform's buttons...`);

    const report = await runControlProbe(page, { log: (message) => console.log(message) });
    const directory = path.join(config.runsDir, `probe-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'probe.json'), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(directory, 'probe.md'), `${renderProbeMarkdown(report)}\n`);

    const summary = summarizeProbe(report);
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Report saved in ${directory}`);
    console.log(summary.buttonsUsable
      ? 'RESULT: the BetKing buttons can be seen and operated by the automation.'
      : 'RESULT: some controls could not be operated; see the report.');
    process.exitCode = summary.buttonsUsable ? 0 : 1;
  } finally {
    await context.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[BETKING PROBE ERROR] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
