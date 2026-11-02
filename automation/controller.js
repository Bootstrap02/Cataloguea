const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const browserManager = require('./browser/browserManager');
const pageActions = require('./browser/pageActions');
const navigation = require('./browser/navigation');
const pageObserver = require('./browser/pageObserver');
const selectors = require('./browser/selectors');
const { RunStore } = require('./persistence/runStore');
const { RecoveryManager } = require('./recovery/recoveryManager');
const { adaptCatalogueaState } = require('./strategy/catalogueaAdapter');
const settlementAdapter = require('./strategy/settlementAdapter');
const simulatedSportsbook = require('./sportsbook/simulatedSportsbookAdapter');
const resultObserver = require('./result/resultObserver');
const { STATES, StateMachine } = require('./stateMachine');
const { classifyFailure } = require('./recovery/recoveryManager');

const fixtureUrl = pathToFileURL(path.join(__dirname, 'fixtures', 'poc.html')).href;
const EXPECTED_HEADING = 'Playwright Local Proof of Concept';
const EXPECTED_PARAGRAPH = 'This local page verifies visible browser automation.';
const EXPECTED_STATUS = 'Button clicked successfully.';
const INPUT_VALUE = 'Playwright test input';

async function captureDiagnosticScreenshot(page, screenshotPath, takeScreenshot) {
  if (!screenshotPath || !page || (typeof page.isClosed === 'function' && page.isClosed())) {
    return false;
  }
  await takeScreenshot(page, screenshotPath, { fullPage: true });
  return true;
}

class AutomationController {
  constructor({
    onTransition,
    onError,
    dependencies = {},
    runStore = new RunStore(),
    recoveryManager = new RecoveryManager(),
    runId = randomUUID(),
  } = {}) {
    if (
      typeof runId !== 'string'
      || runId.length === 0
      || runId.length > 128
      || /[\u0000-\u001f]/.test(runId)
    ) {
      throw new TypeError('Automation run ID must be a non-empty string of at most 128 characters.');
    }
    this.onError = onError || (() => {});
    this.stateMachine = new StateMachine(onTransition);
    this.runStore = runStore;
    this.recoveryManager = recoveryManager;
    this.runId = runId;
    this.dependencies = {
      launchBrowser: browserManager.launchBrowser,
      ...pageActions,
      ...navigation,
      ...pageObserver,
      createPocSelectors: selectors.createPocSelectors,
      adaptCatalogueaState,
      prepareSimulatedSelection: simulatedSportsbook.prepareSimulatedSelection,
      verifyObservedSelection: simulatedSportsbook.verifyObservedSelection,
      observeResult: resultObserver.observeResult,
      verifyResult: resultObserver.verifyResult,
      createSettlementRequest: settlementAdapter.createSettlementRequest,
      applySettlementRequest: settlementAdapter.applySettlementRequest,
      ...dependencies,
    };
    this.error = null;
  }

  get currentState() {
    return this.stateMachine.getState();
  }

  get transitions() {
    return this.stateMachine.getTransitions();
  }

  observeStrategy(strategySnapshot) {
    return this.dependencies.adaptCatalogueaState(strategySnapshot);
  }

  async runSimulatedOperation({
    strategySnapshot,
    assetKey,
    failureMode = null,
    resultScenario = 'complete',
    duplicateResultObservation = false,
    strategySettlementPort,
    screenshotPath,
    diagnosticScreenshotPath,
  } = {}) {
    this.diagnosticScreenshotCaptured = false;
    let browserSession;
    let operation;
    let actionMayHaveRun = false;
    let workflowError;
    let preparedSelection;
    let instruction;
    let expectedSelection;
    let confirmedOperationId = null;
    let confirmation = null;
    let pendingResult = null;
    let normalizedResult = null;
    let resultDisposition = null;
    let strategyState = null;
    let settlement = null;
    let settlementActionOperationId = null;

    try {
      await this.transition(STATES.INITIALIZING);
      await this.runStore.recordEvent(this.runId, 'run_started', {
        scope: 'local_simulated_sportsbook',
      });
      const priorStore = await this.runStore.snapshot();
      const priorAction = priorStore.operations.find(
        ({ runId, name }) => runId === this.runId
          && name === 'simulated_sportsbook_selection',
      );
      if (priorAction) {
        await this.transition(STATES.PAUSED);
        await this.runStore.recordEvent(this.runId, 'run_paused', {
          reason: 'existing_action_operation_requires_recovery',
          operationId: priorAction.id,
          operationStatus: priorAction.status,
        });
        return {
          runId: this.runId,
          state: this.currentState,
          operationId: priorAction.id,
          operationStatus: priorAction.status,
          transitions: this.transitions,
        };
      }
      await this.transition(STATES.OBSERVING_STRATEGY);
      instruction = this.observeStrategy(strategySnapshot);
      if (instruction.strategyState.status !== 'stakes_available') {
        throw new Error(
          `Strategy is not ready for a simulated selection: ${instruction.strategyState.status}.`,
        );
      }
      const asset = instruction.assets.find(({ key }) => key === assetKey);
      if (!asset || asset.stake <= 0) {
        throw new Error(`Instruction has no positive precomputed stake for "${assetKey}".`);
      }
      const odds = instruction.fixture?.odds?.[assetKey];
      if (!Number.isFinite(odds) || odds <= 1) {
        throw new Error(`Instruction has no usable precomputed odds for "${assetKey}".`);
      }

      await this.transition(STATES.STRATEGY_INSTRUCTION_READY);
      await this.transition(STATES.FINDING_MATCH);
      browserSession = await this.dependencies.launchBrowser();
      await this.transition(STATES.MATCH_VERIFICATION);
      const prepareSelection = async () => {
        preparedSelection = await this.dependencies.prepareSimulatedSelection(
          browserSession.page,
          instruction,
          { assetKey, failureMode, resultScenario },
        );
        expectedSelection = {
          fixtureId: instruction.fixture.id,
          market: assetKey,
          assetKey,
          stake: asset.stake,
          odds,
        };
        this.dependencies.verifyObservedSelection(instruction, preparedSelection.selection);
      };
      try {
        await prepareSelection();
      } catch (matchError) {
        const retryableFailure = matchError.code !== 'NON_RETRYABLE_MATCH'
          && [
            'timeout',
            'page_closed',
            'browser_disconnected',
            'navigation_or_connection_failure',
          ].includes(classifyFailure(matchError));
        if (!retryableFailure) throw matchError;

        await this.transition(STATES.RECOVERING);
        const recovery = await this.recoveryManager.recover({
          runId: this.runId,
          error: matchError,
          browserSession,
          runStore: this.runStore,
          retrySafe: true,
          retry: prepareSelection,
        });
        await this.runStore.recordEvent(this.runId, 'match_recovery_attempted', recovery);
        if (recovery.status !== 'recovered') {
          throw new Error(
            `Match preparation recovery ${recovery.status}: ${recovery.reason}`,
            { cause: matchError },
          );
        }
        await this.transition(STATES.MATCH_VERIFICATION);
      }

      await this.transition(STATES.READY_FOR_ACTION);
      operation = await this.runStore.startOperation(
        this.runId,
        'simulated_sportsbook_selection',
        {
          selection: expectedSelection,
          fixture: {
            id: instruction.fixture.id,
            home: instruction.fixture.home,
            away: instruction.fixture.away,
          },
          strategyInstruction: {
            observedAt: instruction.observedAt,
            recommendedAction: instruction.recommendedAction,
            assetKey,
            stake: asset.stake,
            odds,
          },
          target: 'local_simulated_sportsbook',
        },
      );
      await this.transition(STATES.EXECUTING);
      operation = await this.runStore.beginOperation(this.runId, operation.id);
      actionMayHaveRun = true;
      const outcome = await preparedSelection.execute();

      await this.transition(STATES.VERIFYING);
      assert.equal(typeof outcome.confirmation, 'string');
      assert.ok(outcome.confirmation.length > 0);
      await this.runStore.finishOperation(this.runId, operation.id, 'confirmed', {
        confirmation: outcome.confirmation,
        selection: expectedSelection,
      });
      confirmedOperationId = operation.id;
      confirmation = outcome.confirmation;
      operation = null;
      actionMayHaveRun = false;

      await this.transition(STATES.CONFIRMED);
      await this.transition(STATES.WAITING_FOR_RESULT);
      const observation = await this.dependencies.observeResult(browserSession.page);
      if (observation.status === 'pending') {
        pendingResult = this.dependencies.verifyResult(observation, instruction.fixture);
        await this.runStore.recordResultObservation(this.runId, {
          operationId: confirmedOperationId,
          fixture: instruction.fixture,
          status: 'pending',
          observation: pendingResult,
        });
      } else {
        await this.transition(STATES.RESULT_DETECTED);
        normalizedResult = this.dependencies.verifyResult(observation, instruction.fixture);
        const storedResult = await this.runStore.recordVerifiedResult(this.runId, {
          operationId: confirmedOperationId,
          normalizedResult,
        });
        resultDisposition = storedResult.disposition;
        if (duplicateResultObservation) {
          const duplicate = await this.runStore.recordVerifiedResult(this.runId, {
            operationId: confirmedOperationId,
            normalizedResult,
          });
          resultDisposition = duplicate.disposition;
        }
        await this.transition(STATES.RESULT_VERIFIED);
        settlementActionOperationId = storedResult.result.operationId;
        settlement = await this.settleVerifiedResult({
          instruction,
          normalizedResult,
          actionOperationId: settlementActionOperationId,
          strategySettlementPort,
        });
        strategyState = settlement.strategyState || null;
      }

      if (screenshotPath) {
        await this.dependencies.takeScreenshot(browserSession.page, screenshotPath, {
          fullPage: true,
        });
      }
      if (pendingResult || settlement?.status === 'unknown') {
        await this.runStore.recordEvent(this.runId, 'run_paused', {
          scope: 'local_simulated_sportsbook',
          operationId: confirmedOperationId,
          settlementOperationId: settlement?.settlementOperationId || null,
          resultObservationStatus: pendingResult ? 'pending' : 'verified',
        });
      } else {
        await this.runStore.recordEvent(this.runId, 'run_completed', {
          scope: 'local_simulated_sportsbook',
          operationId: confirmedOperationId,
          settlementOperationId: settlement?.settlementOperationId || null,
          resultObservationStatus: 'verified',
        });
      }
    } catch (error) {
      workflowError = error;
      try {
        this.diagnosticScreenshotCaptured = await captureDiagnosticScreenshot(
          browserSession?.page,
          diagnosticScreenshotPath,
          this.dependencies.takeScreenshot,
        );
      } catch (diagnosticError) {
        workflowError = new AggregateError(
          [workflowError, diagnosticError],
          'Automation failed and diagnostic screenshot capture also failed.',
        );
      }
    } finally {
      if (browserSession) {
        try {
          await browserSession.close();
        } catch (closeError) {
          workflowError = workflowError
            ? new AggregateError(
              [workflowError, closeError],
              'Simulated operation and browser cleanup both failed.',
            )
            : closeError;
        }
      }
    }

    this.error = workflowError;
    if (workflowError) {
      if (
        confirmedOperationId
        && [STATES.WAITING_FOR_RESULT, STATES.RESULT_DETECTED].includes(this.currentState)
      ) {
        await this.runStore.recordResultObservation(this.runId, {
          operationId: confirmedOperationId,
          fixture: instruction.fixture,
          status: 'rejected',
          observation: { error: workflowError.message },
        });
        await this.transition(STATES.ERROR);
        await this.runStore.recordEvent(this.runId, 'run_failed', {
          scope: 'simulated_result_observation',
          operationId: confirmedOperationId,
          error: workflowError.message,
          diagnosticScreenshotCaptured: this.diagnosticScreenshotCaptured || false,
        });
        this.onError(workflowError, this.currentState);
        throw workflowError;
      }
      if (
        this.currentState === STATES.RESULT_VERIFIED
        || this.currentState === STATES.SETTLING_STRATEGY
      ) {
        if (this.currentState === STATES.SETTLING_STRATEGY) {
          const latest = await this.runStore.snapshot();
          const activeSettlement = latest.settlements.find(
            ({ runId, status }) => runId === this.runId && status === 'executing',
          );
          if (activeSettlement) {
            await this.runStore.finishSettlement(
              this.runId,
              activeSettlement.resultId,
              'unknown',
              { reason: workflowError.message },
            );
            await this.transition(STATES.SETTLEMENT_UNKNOWN);
            await this.transition(STATES.PAUSED);
            this.onError(workflowError, this.currentState);
            return {
              runId: this.runId,
              state: this.currentState,
              error: workflowError,
              operationStatus: 'unknown',
              transitions: this.transitions,
            };
          }
        }
        await this.transition(STATES.ERROR);
        await this.runStore.recordEvent(this.runId, 'run_failed', {
          scope: 'strategy_settlement_setup',
          error: workflowError.message,
          diagnosticScreenshotCaptured: this.diagnosticScreenshotCaptured || false,
        });
        this.onError(workflowError, this.currentState);
        throw workflowError;
      }

      if (operation && actionMayHaveRun) {
        await this.runStore.finishOperation(this.runId, operation.id, 'unknown', {
          reason: workflowError.message,
          selection: preparedSelection?.selection,
          simulatedActionCount: workflowError.simulatedActionCount ?? null,
        });
        await this.transition(STATES.PAUSED);
        await this.runStore.recordEvent(this.runId, 'run_paused', {
          reason: 'simulated_confirmation_unknown',
          operationId: operation.id,
          diagnosticScreenshotCaptured: this.diagnosticScreenshotCaptured,
        });
        this.onError(workflowError, this.currentState);
        return {
          runId: this.runId,
          state: this.currentState,
          error: workflowError,
          operationStatus: 'unknown',
          transitions: this.transitions,
        };
      }

      if (operation) {
        await this.runStore.finishOperation(this.runId, operation.id, 'failed', {
          reason: workflowError.message,
        });
      }
      if (this.currentState !== STATES.ERROR) {
        await this.transition(STATES.ERROR);
      }
      await this.runStore.recordEvent(this.runId, 'run_failed', {
        scope: 'local_simulated_sportsbook',
        error: workflowError.message,
        diagnosticScreenshotCaptured: this.diagnosticScreenshotCaptured || false,
      });
      this.onError(workflowError, this.currentState);
      throw workflowError;
    }

    if (pendingResult) {
      return {
        runId: this.runId,
        state: this.currentState,
        instruction,
        selection: expectedSelection,
        confirmation,
        operationId: confirmedOperationId,
        resultObservation: pendingResult,
        resultDisposition: 'pending',
        transitions: this.transitions,
      };
    }
    return {
      runId: this.runId,
      state: this.currentState,
      instruction,
      selection: expectedSelection,
      confirmation,
      operationId: confirmedOperationId,
      normalizedResult,
      resultDisposition,
      actionOperationId: settlementActionOperationId || confirmedOperationId,
      settlementOperationId: settlement?.settlementOperationId || null,
      settlementStatus: settlement?.status || null,
      settlementDisposition: settlement?.disposition || null,
      strategyState,
      transitions: this.transitions,
    };
  }

  async settleVerifiedResult({
    instruction,
    normalizedResult,
    actionOperationId,
    strategySettlementPort,
  }) {
    const request = this.dependencies.createSettlementRequest({
      instruction,
      normalizedResult,
      actionOperationId,
    });
    const canTransition = this.currentState === STATES.RESULT_VERIFIED;
    if (!canTransition) {
      const snapshot = await this.runStore.snapshot();
      const priorSettlement = snapshot.settlements.find(
        ({ resultId }) => resultId === request.resultId,
      );
      if (!priorSettlement) {
        throw new Error('Strategy settlement can only start from RESULT_VERIFIED.');
      }
    }
    if (canTransition) {
      await this.transition(STATES.SETTLING_STRATEGY);
    }

    const claim = await this.runStore.beginSettlement(this.runId, request);
    if (claim.disposition === 'already_settled') {
      if (canTransition) {
        await this.transition(STATES.SETTLEMENT_CONFIRMED);
        await this.transition(STATES.COMPLETED);
      }
      return {
        status: 'confirmed',
        disposition: 'already_settled',
        resultId: request.resultId,
        settlementOperationId: claim.settlement.settlementOperationId,
        strategyState: claim.settlement.outcome?.strategyState || null,
      };
    }
    if (claim.disposition === 'unknown') {
      if (canTransition) {
        await this.transition(STATES.SETTLEMENT_UNKNOWN);
        await this.transition(STATES.PAUSED);
      }
      return {
        status: 'unknown',
        disposition: 'unknown',
        resultId: request.resultId,
        settlementOperationId: claim.settlement.settlementOperationId,
      };
    }

    try {
      const update = await this.dependencies.applySettlementRequest(
        request,
        strategySettlementPort || this.dependencies.strategySettlementPort,
      );
      await this.runStore.finishSettlement(this.runId, request.resultId, 'confirmed', {
        strategyState: update.strategyState,
        actionOperationId,
        resultId: request.resultId,
      });
      if (canTransition) {
        await this.transition(STATES.SETTLEMENT_CONFIRMED);
        await this.transition(STATES.COMPLETED);
      }
      return {
        status: 'confirmed',
        disposition: 'settled',
        resultId: request.resultId,
        settlementOperationId: claim.operation.id,
        strategyState: update.strategyState,
      };
    } catch (error) {
      await this.runStore.finishSettlement(this.runId, request.resultId, 'unknown', {
        reason: error.message,
        actionOperationId,
        resultId: request.resultId,
      });
      if (canTransition) {
        await this.transition(STATES.SETTLEMENT_UNKNOWN);
        await this.transition(STATES.PAUSED);
      }
      this.onError(error, this.currentState);
      return {
        status: 'unknown',
        disposition: 'unknown',
        resultId: request.resultId,
        settlementOperationId: claim.operation.id,
        error,
      };
    }
  }

  async transition(nextState) {
    const transition = this.stateMachine.transition(nextState);
    await this.runStore.recordTransition(this.runId, transition);
    return transition;
  }

  async run({
    screenshotPath,
    diagnosticScreenshotPath,
    triggerFailure = false,
    failureMode = null,
  } = {}) {
    this.diagnosticScreenshotCaptured = false;
    let browserSession;
    let workflowError;
    let operation;

    await this.transition(STATES.INITIALIZING);

    try {
      await this.runStore.recordEvent(this.runId, 'run_started', {
        scope: 'local_fixture_poc',
      });
      const priorStore = await this.runStore.snapshot();
      const priorOperation = priorStore.operations.find(
        ({ runId, name }) => runId === this.runId && name === 'local_fixture_interaction',
      );
      if (priorOperation) {
        let operationStatus = priorOperation.status;
        if (['pending', 'executing'].includes(operationStatus)) {
          await this.runStore.finishOperation(this.runId, priorOperation.id, 'unknown', {
            reason: 'Restart found a local fixture interaction without a verified outcome.',
          });
          operationStatus = 'unknown';
        }
        await this.transition(STATES.PAUSED);
        await this.runStore.recordEvent(this.runId, 'run_paused', {
          reason: 'existing_operation_requires_recovery',
          operationId: priorOperation.id,
          operationStatus,
        });
        return {
          runId: this.runId,
          state: this.currentState,
          transitions: this.transitions,
          operationId: priorOperation.id,
          operationStatus,
        };
      }
      browserSession = await this.dependencies.launchBrowser();
      await this.transition(STATES.OBSERVING);

      let injectedNavigationFailure = false;
      let injectedClosedPage = false;
      const navigateFixture = async () => {
        if (failureMode === 'navigation_once' && !injectedNavigationFailure) {
          injectedNavigationFailure = true;
          throw new Error('Simulated navigation timeout for the local fixture.');
        }
        if (failureMode === 'closed_page_once' && !injectedClosedPage) {
          injectedClosedPage = true;
          await browserSession.page.close();
        }
        await this.dependencies.navigateTo(browserSession.page, fixtureUrl);
      };

      const observeFixture = async () => {
        await navigateFixture();
        const page = browserSession.page;
        const selectorsForPage = this.dependencies.createPocSelectors(page);
        const navigated = await this.dependencies.waitForNavigation(page);
        assert.equal(navigated, false, 'The local fixture unexpectedly navigated.');

        await this.dependencies.waitForPageCondition(selectorsForPage.heading);
        const initialObservation = await this.dependencies.observePage(page, {
          heading: selectorsForPage.heading,
          paragraph: selectorsForPage.paragraph,
        });
        assert.equal(initialObservation.title, 'Local Playwright Proof of Concept');
        assert.equal(initialObservation.url, fixtureUrl);
        assert.deepEqual(initialObservation.elements.heading, {
          visible: true,
          text: EXPECTED_HEADING,
        });
        assert.deepEqual(initialObservation.elements.paragraph, {
          visible: true,
          text: EXPECTED_PARAGRAPH,
        });
        assert.equal(
          await this.dependencies.isElementVisible(selectorsForPage.changeButton),
          true,
          'The fixture button must be visible.',
        );
        assert.equal(
          await this.dependencies.isElementVisible(selectorsForPage.messageInput),
          true,
          'The fixture input must be visible.',
        );
        return selectorsForPage;
      };

      let selectorsForPage;
      try {
        selectorsForPage = await observeFixture();
      } catch (observationError) {
        await this.transition(STATES.RECOVERING);
        let recoveredSelectors;
        const recovery = await this.recoveryManager.recover({
          runId: this.runId,
          error: observationError,
          browserSession,
          runStore: this.runStore,
          retrySafe: true,
          retry: async () => {
            recoveredSelectors = await observeFixture();
          },
        });
        await this.runStore.recordEvent(this.runId, 'recovery_attempted', recovery);
        if (recovery.status !== 'recovered') {
          const recoveryError = new Error(
            `Local fixture observation recovery ${recovery.status}: ${recovery.reason}`,
            { cause: observationError },
          );
          throw recoveryError;
        }
        await this.transition(STATES.OBSERVING);
        selectorsForPage = recoveredSelectors;
      }

      const page = browserSession.page;

      await this.transition(STATES.ACTION_REQUIRED);
      operation = await this.runStore.startOperation(
        this.runId,
        'local_fixture_interaction',
        { target: 'local_fixture', actions: ['click_button', 'fill_input'] },
      );
      await this.transition(STATES.EXECUTING);
      await this.dependencies.clickElement(selectorsForPage.changeButton);
      if (failureMode === 'unknown_operation') {
        throw new Error('Simulated browser failure after the fixture action was issued.');
      }
      await this.dependencies.fillInput(selectorsForPage.messageInput, INPUT_VALUE);

      await this.transition(STATES.VERIFYING);
      if (triggerFailure) {
        const missingElementVisible = await this.dependencies.isElementVisible(
          selectorsForPage.missingElement,
        );
        assert.equal(
          missingElementVisible,
          true,
          'Intentional failure test expected a nonexistent fixture element to be visible.',
        );
      }

      await this.dependencies.waitForPageCondition(selectorsForPage.status);
      const clickObservation = await this.dependencies.observePage(page, {
        status: selectorsForPage.status,
      });
      assert.deepEqual(clickObservation.elements.status, {
        visible: true,
        text: EXPECTED_STATUS,
      });
      assert.equal(
        await this.dependencies.readInputValue(selectorsForPage.messageInput),
        INPUT_VALUE,
        'The filled fixture input value did not match.',
      );
      await this.runStore.finishOperation(this.runId, operation.id, 'confirmed', {
        verification: 'button_status_and_input_value',
      });
      operation = null;

      if (screenshotPath) {
        await this.dependencies.takeScreenshot(page, screenshotPath, { fullPage: true });
      }
    } catch (error) {
      workflowError = error;
      try {
        this.diagnosticScreenshotCaptured = await captureDiagnosticScreenshot(
          browserSession?.page,
          diagnosticScreenshotPath,
          this.dependencies.takeScreenshot,
        );
      } catch (diagnosticError) {
        workflowError = new AggregateError(
          [workflowError, diagnosticError],
          'Automation failed and diagnostic screenshot capture also failed.',
        );
      }
    }

    if (browserSession) {
      try {
        await browserSession.close();
      } catch (closeError) {
        workflowError = workflowError
          ? new AggregateError(
            [workflowError, closeError],
            'Automation workflow and browser cleanup both failed.',
          )
          : closeError;
      }
    }

    if (workflowError) {
      if (operation) {
        try {
          await this.runStore.finishOperation(this.runId, operation.id, 'unknown', {
            reason: 'Workflow failed after the interaction began and before verification completed.',
          });
        } catch (operationError) {
          workflowError = new AggregateError(
            [workflowError, operationError],
            'Workflow failed and its operation outcome could not be recorded.',
          );
        }
      }
      this.error = workflowError;
      if (operation) {
        await this.transition(STATES.PAUSED);
        await this.runStore.recordEvent(this.runId, 'run_paused', {
          reason: 'operation_outcome_unknown',
          operationId: operation.id,
          diagnosticScreenshotCaptured: this.diagnosticScreenshotCaptured,
        });
        this.onError(workflowError, this.currentState);
        return {
          runId: this.runId,
          state: this.currentState,
          transitions: this.transitions,
          error: workflowError,
          operationStatus: 'unknown',
        };
      }
      if (this.currentState !== STATES.ERROR) {
        await this.transition(STATES.ERROR);
      }
      await this.runStore.recordEvent(this.runId, 'run_failed', {
        error: workflowError.message,
        diagnosticScreenshotCaptured: this.diagnosticScreenshotCaptured || false,
      });
      this.onError(workflowError, this.currentState);
      throw workflowError;
    }

    await this.transition(STATES.COMPLETED);
    await this.runStore.recordEvent(this.runId, 'run_completed', {
      scope: 'local_fixture_poc',
    });
    return {
      runId: this.runId,
      state: this.currentState,
      transitions: this.transitions,
    };
  }

  async stop() {
    const transition = await this.transition(STATES.STOPPED);
    await this.runStore.recordEvent(this.runId, 'run_stopped');
    return transition;
  }
}

module.exports = { AutomationController, fixtureUrl };
