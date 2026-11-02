const { createAutomationConfig } = require('../config');

async function withLocatorError(operation, locator, action) {
  try {
    return await action();
  } catch (error) {
    throw new Error(`${operation} failed for ${locator}: ${error.message}`, {
      cause: error,
    });
  }
}

function readVisibleText(locator) {
  return withLocatorError('Reading visible text', locator, async () => {
    if (!(await locator.isVisible())) {
      throw new Error('element is not visible');
    }
    return locator.innerText({ timeout: createAutomationConfig().actionTimeoutMs });
  });
}

function clickElement(locator, options = {}) {
  return withLocatorError('Clicking element', locator, () => locator.click({
    timeout: createAutomationConfig().actionTimeoutMs,
    ...options,
  }));
}

function fillInput(locator, value, options = {}) {
  return withLocatorError('Filling input', locator, () => locator.fill(value, {
    timeout: createAutomationConfig().actionTimeoutMs,
    ...options,
  }));
}

function readInputValue(locator, options = {}) {
  return withLocatorError('Reading input value', locator, () => locator.inputValue({
    timeout: createAutomationConfig().actionTimeoutMs,
    ...options,
  }));
}

function isElementVisible(locator) {
  return withLocatorError('Checking element visibility', locator, () => locator.isVisible());
}

async function takeScreenshot(page, screenshotPath, options = {}) {
  try {
    await page.screenshot({ path: screenshotPath, ...options });
  } catch (error) {
    throw new Error(`Taking screenshot at ${screenshotPath} failed: ${error.message}`, {
      cause: error,
    });
  }
}

module.exports = {
  clickElement,
  fillInput,
  isElementVisible,
  readInputValue,
  readVisibleText,
  takeScreenshot,
};
