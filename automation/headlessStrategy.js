// The Cataloguea strategy WITHOUT a browser tab.
//
// The strategy's real maths lives in src/strategy/soloMatrixSettlement.js (submitSoloMatrixFixture,
// settleSoloMatrixState). This module only (a) loads the odds table from src/Scores.js, (b) keeps
// the strategy's financial state in a JSON file instead of the browser's localStorage, and (c)
// exposes the same interface as strategyBridge.js: getInstructions, submitFixture and
// strategyPort. So you give it the teams (for example home ars, away mnu) and it returns the stake
// for every option, with no strategy screen open.
//
// STATE FILE (default automation/artifacts/strategy-state.json, or AUTOMATION_STRATEGY_STATE_FILE):
// same shape the app stores under localStorage key "virt-epl-solo-v1". To continue from the state
// shown in your Cataloguea app, open the app, DevTools > Application > Local Storage, copy the
// value of virt-epl-solo-v1 and save it as that file. With no file, a fresh state starts at the
// base stake AUTOMATION_BASE_STAKE (default 10000, the app's own default).

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ASSET_KEYS } = require('./catalogueaAdapter');
const { createCatalogueaAutomationPort } = require('../../src/strategy/catalogueaAutomationPort');
const {
  persistStrategyState,
  settleSoloMatrixState,
  submitSoloMatrixFixture,
} = require('../../src/strategy/soloMatrixSettlement');
const { createStrategyDecisionAdapter } = require('./strategyDecisionAdapter');

const emptyMap = () => Object.fromEntries(ASSET_KEYS.map((key) => [key, 0]));

// src/Scores.js is an ES module (export const odds = [...]); read it as data without a bundler.
function loadOddsTable(scoresFile) {
  const source = fs.readFileSync(scoresFile, 'utf8').replace(/export\s+const\s+odds\s*=/, 'const odds =');
  const table = vm.runInNewContext(`${source}\n;odds;`, {});
  if (!Array.isArray(table) || table.length === 0) throw new Error(`No odds table found in ${scoresFile}.`);
  return table;
}

function createHeadlessStrategyBridge({
  stateFile,
  scoresFile = path.join(__dirname, '..', '..', 'src', 'Scores.js'),
  baseStake = 10000,
  betKingMarketMappings = {},
  log = () => {},
} = {}) {
  if (!stateFile) throw new TypeError('A strategy state file path is required.');
  const odds = loadOddsTable(scoresFile);

  const storage = {
    getItem: () => (fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8') : null),
    setItem: (_key, value) => {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      const temporary = `${stateFile}.tmp`;
      fs.writeFileSync(temporary, value);
      fs.renameSync(temporary, stateFile);
    },
  };

  const saved = storage.getItem() ? JSON.parse(storage.getItem()) : {};
  if (!storage.getItem()) log(`No strategy state file yet; starting fresh at base stake ${baseStake} (${stateFile}).`);
  let state = {
    fixture: null,
    baseStake: saved.base ?? baseStake,
    deficit: saved.deficit ?? 0,
    winnerStake: 0,
    smallDeficit: saved.smallDeficit ?? 0,
    shadow: saved.shadow ?? 0,
    bank: saved.bank ?? 0,
    privateDef: { ...emptyMap(), ...(saved.privateDef || {}) },
    bigDef: { ...emptyMap(), ...(saved.bigDef || {}) },
    brokenTarget: { ...emptyMap(), ...(saved.brokenTarget || {}) },
    gameStakes: emptyMap(),
    bigStakes: {},
    winners: new Set(),
    bigWinners: new Set(),
    clicked: new Set(),
    automationSettlements: Array.isArray(saved.automationSettlements) ? saved.automationSettlements : [],
    observedAt: new Date().toISOString(),
  };

  const snapshot = () => ({
    ...state,
    fixture: state.fixture ? { ...state.fixture } : null,
    privateDef: { ...state.privateDef },
    bigDef: { ...state.bigDef },
    brokenTarget: { ...state.brokenTarget },
    gameStakes: { ...state.gameStakes },
    bigStakes: { ...state.bigStakes },
    winners: new Set(state.winners),
    bigWinners: new Set(state.bigWinners),
    clicked: new Set(state.clicked),
    automationSettlements: state.automationSettlements.map((receipt) => (
      typeof receipt === 'string' ? receipt : { ...receipt })),
    observedAt: new Date().toISOString(),
  });

  // Same rules as the app's own entry point: it refuses while a fixture is active and it only
  // looks up the odds row; submitSoloMatrixFixture does every calculation.
  function submitFixture({ home, away } = {}) {
    if (state.fixture) {
      return { ok: false, code: 'FIXTURE_ALREADY_SUBMITTED', reason: 'A fixture is already active.', fixture: { ...state.fixture } };
    }
    const homeCode = String(home ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const awayCode = String(away ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = odds.find((row) => row.home === homeCode && row.away === awayCode);
    if (!found) return { ok: false, code: 'NO_ODDS_FOR_FIXTURE', reason: `No odds for ${homeCode} vs ${awayCode}`, home: homeCode, away: awayCode };
    state = submitSoloMatrixFixture(state, found, ASSET_KEYS);
    return { ok: true, fixture: { ...state.fixture }, home: homeCode, away: awayCode };
  }

  const strategyPort = createCatalogueaAutomationPort({
    readSnapshot: snapshot,
    submitFixture,
    settleStrategyResult: (normalizedResult, resultId, current, actionOperationId, marks) => {
      const settlement = marks
        ? { ...current, winners: new Set(marks.winners), bigWinners: new Set(marks.bigWinners) }
        : current;
      const settled = settleSoloMatrixState(settlement, ASSET_KEYS);
      const receipts = [
        ...current.automationSettlements,
        {
          resultId,
          fixture: { id: current.fixture.id, home: current.fixture.home, away: current.fixture.away },
          result: { ...normalizedResult.result },
          actionOperationId,
        },
      ];
      persistStrategyState(storage, 'virt-epl-solo-v1', settled, receipts);
      state = { ...settled, automationSettlements: receipts, observedAt: new Date().toISOString() };
      return {
        status: 'settled',
        resultId,
        strategyState: {
          status: 'settled',
          financialState: {
            baseStake: settled.baseStake,
            deficit: settled.deficit,
            smallDeficit: settled.smallDeficit,
            shadow: settled.shadow,
            bank: settled.bank,
            privateDef: { ...settled.privateDef },
            bigDef: { ...settled.bigDef },
            brokenTarget: { ...settled.brokenTarget },
          },
        },
      };
    },
  });

  const adapter = createStrategyDecisionAdapter({
    readStrategySnapshot: async () => snapshot(),
    betKingMarketMappings,
  });

  return Object.freeze({
    headless: true,
    stateFile,
    getInstructions: () => adapter.getCurrentInstructionsAsync(),
    submitFixture: async (input) => submitFixture(input),
    strategyPort: Object.freeze({
      getStrategySnapshot: async () => strategyPort.getStrategySnapshot(),
      settleVerifiedResult: async (input) => strategyPort.settleVerifiedResult(input),
    }),
  });
}

module.exports = { createHeadlessStrategyBridge, loadOddsTable };
