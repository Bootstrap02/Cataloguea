# Cataloguea Project Audit

Scope: static reading of the uploaded archive (`Cataloguea-automation-build.zip`).
No tests, builds, POC, or real-site runs were performed, so nothing below is a
test result. Evidence is cited as file and function. Category labels follow the
brief: **IMPL-APP** (in the application), **IMPL-TEST** (covered by automated
tests, not run by me), **MOCK** (mocks/simulation only), **REAL-SITE** (observed
on BetKing in an earlier stage, historical), **DESIGNED** (not implemented),
**UNRESOLVED**.

## 1. What Cataloguea currently does

A Create React App (React 19, JavaScript) application, `src/Catalogued.js`
(706 lines), that runs the Solo Matrix strategy: the user selects a Liverpool
fixture, the app computes a winner (6-0) stake and ten asset stakes, the user
marks which options won, and "Next" settles the state. `src/Trash.js` (1158
lines) is a second, older component that also imports the odds table and a
backend URL; only its header was read. `src/App.test.js` is the only app-side
test file.

## 2. How the strategy works (IMPL-APP)

- `src/Scores.js` exports `odds`: flat rows per fixture (`id`, `home`, `away`, `winner`, `oneX` ... `ft41`), grouped by opponent tier. `winner` is a separate odds field alongside the ten asset keys.
- `submitSoloMatrixFixture` (`src/strategy/soloMatrixSettlement.js`) computes `winnerStake`, `gameStakes[key]`, and `bigStakes[key]` from base stake, deficits, private deficits, broken targets, and odds. The winner stake is floored at 10 by the strategy itself.
- `settleSoloMatrixState` applies the user's marks (`winners`, `bigWinners`) and produces the next state. **The strategy has no score-to-outcome logic**: outcomes come from manual button presses (`markWin`, `markBigWin`, `handleJackpot` for 6-0).
- Ten asset keys: `oneX`, `twoX`, `x2`, `tg0`, `tg6`, `ht12`, `ht21`, `ht30`, `ft40`, `ft41` (`ALL_ASSETS`, `ASSET_LABELS`). `winner` is the eleventh key, handled separately.
- The archive contains no `src/assets` directory, so icon/asset names could not be compared with keys.

## 3. State storage (IMPL-APP)

`localStorage["virt-epl-solo-v1"]` (`LS_KEY`) holds the strategy state including `automationSettlements` receipts (`persistStrategyState`, `readStoredStrategyState`). A backend backup exists and must not overwrite newer local state. The Playwright browser is a different browser context from the user's own, so it cannot read that storage; the development-only hook `window.catalogueaAutomation` (set only when `NODE_ENV === "development"`) is the bridge.

## 4. Strategy option meanings

| Key | Source of meaning | Status |
| --- | --- | --- |
| `oneX` | User instruction (Stage 27): Liverpool leads at HT and FT is a draw | USER_SPECIFIED |
| `twoX` | User instruction: Liverpool trails at HT and FT is a draw | USER_SPECIFIED |
| `x2` | User instruction: Liverpool home -> X2, away -> X1 (label only) | ORIENTATION_ONLY, settlement UNRESOLVED |
| `winner` | "the 6-0 option"; exact condition not defined in code | UNRESOLVED |
| `tg0`, `tg6` | UI labels only | UNRESOLVED |
| `ht12`, `ht21`, `ht30`, `ft40`, `ft41` | Earlier-stage inference from the key names | ASSUMED_FROM_LABEL (home-away order, not confirmed Liverpool-relative) |

Observation, not a conclusion: `winner` odds in `Scores.js` are lower for Liverpool-home rows than for Liverpool-away rows, which is consistent with "Liverpool wins 6-0", but the code does not say so.

## 5. Business rules (IMPL-TEST, not run)

RULE-001 minimum stake (10 or more qualifies), RULE-002 merge normal and big-deficit of the same option, RULE-003 per-option evaluation, RULE-004 Liverpool orientation for `x2`, RULE-005 skipped options settle as non-winning and receive no marks (confirmed by the user). All in `automation/strategy/rules.js`.

## 6. Automation modules and status

| Module | Status |
| --- | --- |
| `automation/controller.js`, `stateMachine.js`, `persistence/runStore.js`, recovery | MOCK / local simulation. `config.js` allows only `local` and `test` environments (`liveSiteEnabled: false`). |
| `sportsbook/betkingAdapter.js`, `betkingInspect.js` | Read-only snapshot normalisation and classification; inspector exercised against the real site in earlier stages (REAL-SITE, historical). |
| `strategy/strategyDecisionAdapter.js` | IMPL-TEST. Now reuses `rules.js` and the strategy's own `winnerStake`. |
| `strategy/fixtureIdentity.js` | IMPL-TEST. Confidence scoring; workflow requires HIGH. |
| `strategy/canonicalBetTypes.js` | IMPL-TEST. Every BetKing mapping is UNRESOLVED. |
| `strategy/seasonWeek.js`, `liverpoolPerspective.js`, `operationalWorkflow.js` | New in Stage 27, tests written, not run. |
| `strategy/settlementIntegration.js` | New in Stage 28, tests written, not run. |
| `betkingController.js`, `betkingRun.js`, `sportsbook/betkingPorts.js`, `sportsbook/betkingSelectors.js`, `strategy/strategyBridge.js` | New in Stage 29: real-site controller and ports. Implemented, **no tests, never run**; live/results/bet-slip selectors are user-supplied and unverified. |
| `strategy/resultPoller.js`, `result/liveResultObserver.js` | Logic implemented against mocks; no verified real live/results selector. `resultPoller` previously held a second, conventional-market settlement definition; it now delegates to `rules.js`. |
| `src/strategy/catalogueaAutomationPort.js` | Settlement port with receipts; now accepts optional evaluated marks. |

## 7. Verified against the real BetKing site (historical, re-verify)

Scheduled Kings League page opened in a visible Chromium session; rounds, fixtures (ids like `matchup-statistics-button-LIV-COV`), 1X2 selections, and market-tab categories (Double Chance, O/U 2.5, GG/NG, Correct Score) observed; other tab labels rendered blank. Not established: live score or clock selectors, halftime or full-time score source, Results history route, selection-level market mappings, bet-slip behaviour.

## 8. Test inventory (not run)

23 test files: 20 under `automation/` (adapters, boundary, config, persistence, recovery, simulation, state machine, strategy rules/identity/poller/workflow/week/settlement, stress) and `src/App.test.js`. The progress report historically cites 200+ passing tests and 10 failing in `resultPoller.test.js`; those failing tests asserted settlement semantics that were never specified and have been rewritten. Which tests launch a real browser or touch the real site was not determined by reading; treat all as mock-level until shown otherwise.

## 9. Blockers, in priority order

1. Meaning of `winner` (6-0), `x2` settlement, `tg0`, `tg6`; confirmation of the `ht`/`ft` score keys and their orientation.
2. Real BetKing result source: live score/clock, halftime and full-time selectors, Results history.
3. Selection-level market mappings and odds extraction.
4. (Stage 29 implemented, untested) A real-site controller command wiring ports to the Playwright page and the strategy hook; needs your first real run and selector evidence.
5. Bet-slip steps (selection, stake entry, verification, acceptance) if ever authorised.

## 10. Shortest path

Settle the semantics questions (1), then run the inspector in interactive mode against a live round to capture (2) and (3), then implement the real-site ports for `createOperationalWorkflow` and `settlePlannedFixture`, which already contain the week, fixture, rule, stale-state, duplicate-settlement, and persistence logic.
