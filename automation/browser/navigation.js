const { errors } = require('playwright');
const { createAutomationConfig } = require('../config');

async function navigateTo(page, url, options = {}) {
  const config = createAutomationConfig();
  try {
    await page.goto(url, {
      waitUntil: 'load',
      timeout: config.navigationTimeoutMs,
      ...options,
    });
  } catch (error) {
    throw new Error(`Navigation to ${url} failed: ${error.message}`, {
      cause: error,
    });
  }
}

async function waitForPageCondition(locator, options = {}) {
  const config = createAutomationConfig();
  try {
    await locator.waitFor({ state: 'visible', timeout: config.conditionTimeoutMs, ...options });
  } catch (error) {
    throw new Error(`Waiting for page condition ${locator} failed: ${error.message}`, {
      cause: error,
    });
  }
}

async function waitForNavigation(page, options = {}) {
  const config = createAutomationConfig();
  try {
    await page.waitForNavigation({
      waitUntil: 'domcontentloaded',
      timeout: config.navigationWaitTimeoutMs,
      ...options,
    });
    return true;
  } catch (error) {
    if (error instanceof errors.TimeoutError) {
      return false;
    }
    throw new Error(`Waiting for navigation failed: ${error.message}`, {
      cause: error,
    });
  }
}

module.exports = { navigateTo, waitForNavigation, waitForPageCondition };
