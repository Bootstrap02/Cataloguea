const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fillInput, clickElement, readInputValue, readVisibleText } = require('../browser/pageActions');
const { navigateTo, waitForPageCondition } = require('../browser/navigation');
const { createAutomationConfig } = require('../config');

const FIXTURE_URL = pathToFileURL(
  path.join(__dirname, '..', 'fixtures', 'simulatedSportsbook.html'),
).href;
const RESULT_SCENARIOS = new Set([
  'complete',
  'alternate_complete',
  'pending',
  'wrong_fixture',
  'incomplete',
]);

function requireInstruction(instruction, assetKey) {
  if (!instruction || !instruction.fixture || !Array.isArray(instruction.assets)) {
    throw new Error('A complete strategy instruction is required for simulated matching.');
  }

  const asset = instruction.assets.find(({ key }) => key === assetKey);
  if (!asset || !Number.isFinite(asset.stake) || asset.stake <= 0) {
    throw new Error(`Strategy instruction has no positive precomputed stake for "${assetKey}".`);
  }
  const odds = instruction.fixture.odds?.[assetKey];
  if (!Number.isFinite(odds) || odds <= 1) {
    throw new Error(`Strategy instruction has no usable precomputed odds for "${assetKey}".`);
  }
  return { asset, odds };
}

function verifyObservedSelection(instruction, observed) {
  const expected = requireInstruction(instruction, observed.assetKey);
  const comparisons = [
    ['fixtureId', instruction.fixture.id],
    ['market', observed.assetKey],
    ['assetKey', observed.assetKey],
    ['stake', expected.asset.stake],
    ['odds', expected.odds],
  ];
  for (const [field, expectedValue] of comparisons) {
    if (observed[field] !== expectedValue) {
      throw new Error(
        `Simulated ${field} mismatch: expected ${expectedValue}, observed ${observed[field]}.`,
      );
    }
  }
  return true;
}

async function prepareSimulatedSelection(page, instruction, {
  assetKey,
  failureMode = null,
  resultScenario = 'complete',
  actionTimeoutMs = createAutomationConfig().actionTimeoutMs,
} = {}) {
  const { asset, odds } = requireInstruction(instruction, assetKey);
  if (!RESULT_SCENARIOS.has(resultScenario)) {
    throw new Error(`Unsupported simulated result scenario "${resultScenario}".`);
  }
  await navigateTo(page, FIXTURE_URL);

  const fixtureLocator = page.getByLabel('Fixture', { exact: true });
  await fixtureLocator.selectOption(
    failureMode === 'wrong_fixture'
      ? (instruction.fixture.id === 'livmnu' ? 'livche' : 'livmnu')
      : instruction.fixture.id,
    { timeout: actionTimeoutMs },
  );
  if (failureMode === 'missing_market') {
    await page.getByLabel('Market / asset').evaluate((select, key) => {
      select.querySelector(`option[value="${key}"]`)?.remove();
    }, assetKey);
  }

  const marketLocator = page.getByLabel('Market / asset');
  const stakeLocator = page.getByLabel('Simulated stake');
  const observedFixtureId = await fixtureLocator.inputValue();
  if (observedFixtureId !== instruction.fixture.id) {
    throw new Error(
      `Fixture mismatch: strategy expects ${instruction.fixture.id}, local page shows ${observedFixtureId}.`,
    );
  }

  try {
    await marketLocator.selectOption(assetKey, { timeout: actionTimeoutMs });
  } catch (error) {
    const unavailableMarket = new Error(
      `Expected market "${assetKey}" is unavailable: ${error.message}`,
      {
        cause: error,
      },
    );
    unavailableMarket.code = 'NON_RETRYABLE_MATCH';
    throw unavailableMarket;
  }
  const observedMarket = await marketLocator.inputValue();
  if (observedMarket !== assetKey) {
    throw new Error(`Market mismatch: expected ${assetKey}, local page shows ${observedMarket}.`);
  }
  const observedOdds = Number(await readVisibleText(page.getByLabel('Displayed odds')));
  if (!Number.isFinite(observedOdds) || observedOdds !== odds) {
    throw new Error(`Odds mismatch for ${assetKey}: expected ${odds}, local page shows ${observedOdds}.`);
  }

  await fillInput(stakeLocator, String(asset.stake));
  const observedStake = Number(await readInputValue(stakeLocator));
  if (!Number.isFinite(observedStake) || observedStake !== asset.stake) {
    throw new Error(
      `Stake mismatch for ${assetKey}: expected ${asset.stake}, local page shows ${observedStake}.`,
    );
  }

  const selection = {
    fixtureId: observedFixtureId,
    market: observedMarket,
    assetKey,
    stake: observedStake,
    odds: observedOdds,
  };
  verifyObservedSelection(instruction, selection);
  return {
    selection,
    execute: async () => {
      if (failureMode === 'confirmation_missing') {
        await page.locator('body').evaluate((body) => {
          body.dataset.confirmationMode = 'silent';
        });
      }
      await page.locator('body').evaluate((body, { scenario, fixtureId }) => {
        body.dataset.resultMode = scenario;
        body.dataset.resultFixtureId =
          scenario === 'wrong_fixture' ? 'livche' : fixtureId;
      }, { scenario: resultScenario, fixtureId: instruction.fixture.id });
      await clickElement(page.getByRole('button', { name: 'Simulate selection' }));
      const actionCount = await readSimulatedActionCount(page);
      try {
        const confirmation = page.locator('#confirmation');
        await waitForPageCondition(confirmation, { timeout: actionTimeoutMs });
        const text = await readVisibleText(confirmation);
        const expectedText =
          `Simulation confirmed: ${selection.fixtureId} ${selection.market} stake ${selection.stake}`;
        if (text !== expectedText) {
          throw new Error(`Simulation confirmation mismatch: expected "${expectedText}", got "${text}".`);
        }
        return { confirmation: text, actionCount };
      } catch (error) {
        error.simulatedActionCount = actionCount;
        throw error;
      }
    },
  };
}

async function readSimulatedActionCount(page) {
  return Number(await readVisibleText(page.getByLabel('Simulated action count')));
}

module.exports = {
  FIXTURE_URL,
  prepareSimulatedSelection,
  readSimulatedActionCount,
  verifyObservedSelection,
};
