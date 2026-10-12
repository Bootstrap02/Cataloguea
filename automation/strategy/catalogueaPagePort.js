function createCatalogueaPagePort(page) {
  if (!page || typeof page.evaluate !== 'function') {
    throw new TypeError('A browser page is required for the Cataloguea strategy port.');
  }

  async function evaluatePort(method, argument) {
    return page.evaluate(
      ({ portMethod, portArgument }) => {
        const port = window.catalogueaAutomation;
        if (!port || typeof port[portMethod] !== 'function') {
          throw new Error('The development Cataloguea strategy port is not available on this page.');
        }
        return port[portMethod](portArgument);
      },
      { portMethod: method, portArgument: argument },
    );
  }

  return {
    getStrategySnapshot: () => evaluatePort('getStrategySnapshot'),
    getCurrentInstruction: () => evaluatePort('getCurrentInstruction'),
    strategySettlementPort: async (request) => {
      const result = await evaluatePort('settleVerifiedResult', {
        normalizedResult: request.normalizedResult,
        actionOperationId: request.actionOperationId,
      });
      if (result.status === 'already_settled') {
        return {
          strategyState: {
            status: result.status,
            resultId: result.resultId,
          },
        };
      }
      return { strategyState: result.strategyState };
    },
  };
}

module.exports = { createCatalogueaPagePort };
