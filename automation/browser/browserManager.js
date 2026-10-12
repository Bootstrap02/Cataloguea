const { chromium } = require('playwright');
const path = require('node:path');
const { createAutomationConfig } = require('../config');

async function createPage(browser, { defaultTimeout, viewport }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(defaultTimeout);
  return page;
}

async function launchBrowser(options = {}) {
  const config = createAutomationConfig();
  const {
    timeout = config.browserLaunchTimeoutMs,
    defaultTimeout = config.pageTimeoutMs,
    headless = config.browserHeadless,
    channel = config.browserChannel,
    viewport = { width: 1280, height: 800 },
    userDataDir,
  } = options;
  let browser;
  let context;

  if (userDataDir !== undefined && (typeof userDataDir !== 'string' || !path.isAbsolute(userDataDir))) {
    throw new TypeError('Persistent browser userDataDir must be an absolute path.');
  }

  try {
    if (userDataDir) {
      context = await chromium.launchPersistentContext(userDataDir, {
        headless,
        channel,
        timeout,
        viewport,
      });
      browser = context.browser();
    } else {
      browser = await chromium.launch({
        headless,
        channel,
        timeout,
      });
    }
    let page = context
      ? (context.pages()[0] || await context.newPage())
      : await createPage(browser, { defaultTimeout, viewport });
    page.setDefaultTimeout(defaultTimeout);
    return {
      get browser() {
        return browser;
      },
      get page() {
        return page;
      },
      restorePage: async () => {
        if (context) {
          if (!browser?.isConnected()) {
            context = await chromium.launchPersistentContext(userDataDir, {
              headless,
              channel,
              timeout,
              viewport,
            });
            browser = context.browser();
          }
          page = context.pages().find((candidate) => !candidate.isClosed())
            || await context.newPage();
          page.setDefaultTimeout(defaultTimeout);
          return page;
        }
        if (!browser.isConnected()) {
          browser = await chromium.launch({ headless, channel, timeout });
        }
        page = await createPage(browser, { defaultTimeout, viewport });
        return page;
      },
      close: async () => {
        if (context) {
          await context.close();
        } else if (browser.isConnected()) {
          await browser.close();
        }
      },
    };
  } catch (error) {
    if (context) {
      try {
        await context.close();
      } catch (closeError) {
        throw new AggregateError(
          [error, closeError],
          `Browser setup failed and cleanup also failed: ${error.message}`,
        );
      }
    } else if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        throw new AggregateError(
          [error, closeError],
          `Browser setup failed and cleanup also failed: ${error.message}`,
        );
      }
    }
    throw new Error(`Browser launch or page setup failed: ${error.message}`, {
      cause: error,
    });
  }
}

module.exports = { createPage, launchBrowser };
