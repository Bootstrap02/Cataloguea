const { isElementVisible, readVisibleText } = require('./pageActions');

async function observePage(page, textLocators) {
  const elements = {};

  for (const [name, locator] of Object.entries(textLocators)) {
    const visible = await isElementVisible(locator);
    elements[name] = {
      visible,
      text: visible ? await readVisibleText(locator) : null,
    };
  }

  return {
    url: page.url(),
    title: await page.title(),
    elements,
  };
}

module.exports = { observePage };
