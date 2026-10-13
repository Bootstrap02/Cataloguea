// Bridge between the workflow and the existing Cataloguea strategy running in a
// browser page (the development hook window.catalogueaAutomation). No strategy
// logic lives here: stakes come from submitSoloMatrixFixture via the decision
// adapter, settlement from the strategy's own settleSoloMatrixState via the page.

const { createCatalogueaPagePort } = require('./catalogueaPagePort');
const { createStrategyDecisionAdapter } = require('./strategyDecisionAdapter');

function createStrategyBridge({ page, betKingMarketMappings = {} } = {}) {
  const pagePort = createCatalogueaPagePort(page);
  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: () => pagePort.getStrategySnapshot(),
    betKingMarketMappings,
  });
  return Object.freeze({
    getInstructions: () => adapter.getCurrentInstructionsAsync(),
    strategyPort: Object.freeze({
      getStrategySnapshot: () => pagePort.getStrategySnapshot(),
      settleVerifiedResult: (input) => pagePort.settleVerifiedResult(input),
    }),
  });
}

module.exports = { createStrategyBridge };
