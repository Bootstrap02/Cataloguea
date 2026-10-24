# CATALOGUEA AUTOMATION PROJECT GUIDE

## 1. Project Mission

Extend the existing Cataloguea React application into a reliable, observable, recoverable browser-automation system that connects the existing Solo Matrix betting strategy with permitted browser interactions and match-result observation.

The project must be developed incrementally, tested at every stage, and designed to survive temporary internet interruptions without corrupting the existing strategy state.

The goal is a deterministic, locally runnable system that does not depend on paid AI APIs.

## 2. Existing Project — Source of Truth

Cataloguea is a React sports-betting strategy application focused on virtual EPL matches and Liverpool-related match odds.

Existing technology:

* React 19
* Create React App / react-scripts
* JavaScript
* Tailwind CSS
* Axios
* Framer Motion
* React Icons

Important existing files:

* `src/App.js`: application entry point
* `src/Catalogued.js`: main Solo Matrix strategy engine
* `src/Scores.js`: odds lookup table
* `src/Trash.js`: legacy/experimental implementation
* `src/index.js`: React rendering entry point

Existing persistence:

* Browser localStorage key: `virt-epl-solo-v1`
* Backend synchronization API: `campusbuy-backend.onrender.com/betking`
* Manual synchronization through existing UI controls

Existing strategy concepts:

* Ten betting assets
* Starting base stake
* Shared deficit accumulator
* Winnings pool
* Per-asset private deficits
* Large/overflow deficits
* Broken-target distributions
* Winner processing and NEXT game settlement
* Special jackpot/reset behavior

The exact current implementation in the repository takes precedence over this summary. Inspect the source code before making technical decisions.

## 3. Non-Negotiable Rules

1. Preserve the existing Solo Matrix calculations and working user interface.
2. Do not rewrite the strategy engine merely to make automation easier.
3. Do not modify `Trash.js` unless a specific, approved requirement needs it.
4. Use plain JavaScript, not TypeScript.
5. Keep existing React/Create React App architecture unless a documented technical reason requires a change.
6. Do not introduce another frontend framework or rewrite the application.
7. Do not add unnecessary dependencies.
8. Do not introduce an LLM, OpenRouter, Gemini, or paid AI API in the initial implementation.
9. Do not add AWS, cloud hosting, or a separate backend unless justified by a specific requirement.
10. Never commit passwords, authentication secrets, tokens, or private session data.
11. Never blindly repeat an operation when its completion status is uncertain.
12. Do not bypass CAPTCHA, anti-bot controls, access restrictions, or website security mechanisms.
13. Check applicable website rules before enabling interactions that could submit real-money wagers.
14. ~~Use test pages, mock pages, and simulated operations before testing against live betting pages.~~ **Superseded by the owner's decision (Stage 31):** the built-in sample sportsbook page is retired and never used; all browser work happens on the real BetKing site, read-only until each step is verified. Unit tests with in-memory stand-ins remain allowed.
15. Keep the browser visible during initial development and debugging.
16. **Market-first selection.** Never select an odd until the correct market category is open and the exact selection has been identified for the confirmed fixture (stages `MARKET_CATEGORY_OPENED` then `MARKET_SELECTION_IDENTIFIED` then `ODDS_VERIFIED`). Category, selection, and stake are separate operations, and every option uses its own verified category and selection. A stage is entered only on observable evidence, never because a click was attempted. Details: `automation/BETKING_WORKFLOW.md` sections G1-G4 (rules RULE-006 and RULE-007).
17. **Authorization boundary.** Selecting an odd and preparing the slip are different from submitting a wager. Only `--through place` can submit, and only with `AUTOMATION_ALLOW_REAL_MONEY=yes`, a per-bet stake cap, a confirmation for each bet (or `--auto-confirm`), a verified slip, and a last slip check immediately before one click. A click is never acceptance: only the site's own confirmation text counts, and an unconfirmed click pauses the run. See `automation/BETKING_WORKFLOW.md` section G7.

## 4. Git and Change Safety

The `original-strategy` branch is a protected reference copy of the working strategy.

All automation development takes place on `automation-build`.

Never intentionally modify the original reference branch.

Before significant changes:

* Check Git status.
* Confirm the active branch.
* Review relevant existing files.
* Keep changes small and understandable.
* Report any unexpected existing modifications before overwriting files.

Never discard user changes or perform destructive Git operations without explicit approval.

## 5. Target Architecture

Adapt these responsibilities to the existing repository rather than forcing an unnecessary folder structure.

### A. Existing Strategy Engine

Responsibilities:

* Calculate strategy stakes and instructions.
* Maintain existing deficit and winnings calculations.
* Preserve existing asset and settlement logic.
* Expose or adapt strategy outputs for the automation controller without duplicating calculations.

### B. Automation Controller

Responsibilities:

* Coordinate the automation lifecycle.
* Request or consume strategy instructions.
* Track the current game and operation.
* Decide which stage should run next.
* Pause safely when an action fails.
* Resume only after verifying current state.

### C. Browser Manager

Responsibilities:

* Launch and manage a visible Chromium browser through Playwright.
* Manage pages and tabs.
* Detect navigation failures and browser crashes.
* Support graceful shutdown.

### D. Cataloguea Adapter

Responsibilities:

* Observe the strategy website.
* Read relevant game, strategy, and settlement state.
* Interact with the existing interface when appropriate.
* Avoid duplicating or independently reimplementing strategy mathematics.

### E. BetKing Adapter

Responsibilities:

* Observe the permitted website interface.
* Identify and verify the intended match and market.
* Use centralized, maintainable selectors.
* Detect loading, unavailable pages, session expiration, and unexpected page state.
* Verify actions using observable evidence.
* Stop safely when the page cannot be interpreted reliably.

Do not assume a particular page layout, selector, API, or market identifier without inspecting the actual website.

### F. Observation Layer

Preferred order:

1. DOM and accessible page information.
2. Semantic Playwright locators.
3. Screenshots for diagnostics and visual verification.
4. OCR only when necessary.
5. No coordinate-based clicking unless a documented limitation requires it.

### G. State Machine

Use explicit states appropriate to the discovered workflow, such as:

* IDLE
* INITIALIZING
* OBSERVING_STRATEGY
* FINDING_MATCH
* MATCH_VERIFICATION
* READY_FOR_ACTION
* EXECUTING
* VERIFYING
* WAITING_FOR_RESULT
* RESULT_DETECTED
* SETTLING_STRATEGY
* RECOVERING
* PAUSED
* ERROR
* STOPPED

Implement only the states required for each development stage.

### H. Persistence and Recovery

Responsibilities:

* Persist the current workflow checkpoint.
* Track the current game and operation.
* Record timestamps and operation identifiers.
* Record confirmed, failed, and uncertain outcomes.
* Recover from temporary internet disconnection.
* Detect stale checkpoints and unexpected browser state.
* Avoid duplicate operations after ambiguous failures.
* Resume only after verifying the actual page and operation status.

Never store credentials or private session material in ordinary application logs.

### I. Logging and Diagnostics

Record:

* State transitions.
* Navigation attempts.
* Relevant page observations.
* Retry attempts.
* Errors and recovery actions.
* Operation verification outcomes.
* Strategy settlement results.

Use timestamps and operation IDs where appropriate. Avoid logging sensitive information.

## 6. Reliability Requirements

Network interruptions are expected.

Implement:

* Connection and navigation failure detection.
* Bounded retries with backoff.
* Timeouts for page operations.
* Browser/page health checks.
* Session-expiration detection where observable.
* Recovery checkpoints.
* Graceful pause and resume.
* Diagnostic screenshots when useful.

A network failure does not prove that an action failed.

If an operation may have succeeded:

1. Mark its status as uncertain.
2. Inspect the current page and available evidence.
3. Verify whether the operation completed.
4. Continue only when the result is sufficiently clear.
5. Otherwise pause and request manual review.

Never automatically repeat an uncertain operation that could create a duplicate wager.

## 7. Strategy Integration Requirements

The existing strategy remains the authoritative source of calculations.

Do not independently reproduce the staking formula in the automation layer.

Before integration, document:

* How a new game is submitted.
* How odds are selected.
* How each asset stake is calculated.
* How winners are recorded.
* How NEXT settles a game.
* How the jackpot/reset behavior works.
* How localStorage is updated.
* How backend synchronization works.
* What information is required to safely resume after a reload.

Create an adapter around the existing implementation only when needed.

The automation must distinguish:

* Proposed strategy instruction.
* Observed website state.
* Requested browser action.
* Confirmed browser outcome.
* Observed final match result.
* Confirmed strategy settlement.

## 8. Stage 18 Final Acceptance

Final acceptance target: the automation project is considered complete only when the strategy, browser automation, persistence, recovery, and compliance gates are all validated without bypassing site restrictions.

Validated in this stage:

* Strategy instruction acquisition remains authoritative and unchanged from the existing Solo Matrix calculations.
* Settlement gating remains tied to verified result and persisted confirmation state.
* Manual UI behavior remains intact through the local fixture tests.
* Local persistence and runtime state checkpoints remain consistent across recoveries and restarts.
* Browser automation remains local-only, visible, and bounded.
* No live-site wager submission is created by the automation path.

Safety model:
- No action is executed without a verified fixture and confirmed browser state.
- No settlement is created without a verified result and persisted state check.
- Unknown outcomes are paused and never retried automatically.
- Duplicate actions and duplicate settlements are refused.
- Recovery is bounded and restart-safe.

Configuration and testing:
- `npm run build` passes.
- `npm run automation:poc` passes.
- `npm run automation:test` passes.
- `git diff --check` passes.

Real-site status:
- BetKing interaction remains intentionally non-automatic and not enabled by default in this codebase.
- The project respects read-only observation, local fixture validation, and explicit compliance boundaries.
- A live-site automation path is only acceptable when the target site permits it, the selectors are verified, and the action model is explicitly documented and safety-tested.

Do not infer a winning or losing result from incomplete data.

## 8. Development and Testing Strategy

Build in small, approved stages.

Each stage follows:

1. Inspect relevant code.
2. Explain the proposed change.
3. Implement only the approved scope.
4. Run relevant tests and build checks.
5. Review the diff.
6. Report files changed and behavior affected.
7. Document known limitations.
8. Wait for approval before moving to the next major stage.

Prefer deterministic tests and mock pages for failure scenarios.

Test cases should eventually include:

* Normal navigation.
* Missing selectors.
* Slow page loads.
* Temporary internet loss.
* Browser closure.
* Page reload.
* Session expiration.
* Unknown operation status.
* Duplicate-operation prevention.
* Invalid or unavailable match.
* Incomplete match result.
* Application state restoration.

Never test the complete workflow with real money during early development.

## 9. Planned Development Stages

Stage 0: Repository inspection, architecture confirmation, and baseline checks.

Stage 1: Minimal Playwright setup and visible-browser proof of concept.

Stage 2: Browser lifecycle, navigation, reading page text, clicking, typing, and screenshots on safe test pages.

Stage 3: Centralized selectors and page-observation utilities.

Stage 4: Automation controller and explicit state machine.

Stage 5: Persistent checkpoints, structured logs, and operation tracking.

Stage 6: Network interruption detection, retries, recovery, and safe resume.

Stage 7: Cataloguea strategy adapter and read-only strategy observation.

Stage 8: Controlled strategy integration using simulated operations.

Stage 9: Match observation and result verification using reliable, permitted data sources.

Stage 10: Strategy settlement integration and duplicate-operation protection.

Stage 11: End-to-end simulation, fault injection, and recovery testing.

Stage 12: Compliance review and carefully controlled live-environment validation, only where permitted.

Optional later stage: A monitoring dashboard, if the existing interface and logs are insufficient.

Do not implement all stages in one change.

## 10. Initial Browser Proof of Concept

The first working demonstration should:

* Run locally.
* Launch a visible Chromium browser.
* Open a safe test page.
* Read page text.
* Click a test control.
* Enter text into a form.
* Capture a screenshot.
* Close the browser gracefully.
* Handle a simple navigation timeout.

This demonstration must not place bets or change the existing strategy state.

## 11. Documentation

Maintain:

* `AUTOMATION_PROJECT_GUIDE.md`: permanent architecture and development rules.
* `AUTOMATION_PROGRESS.md`: completed stages, current stage, test results, decisions, and next steps.
* `README.md`: setup and run instructions.

Update progress documentation after each completed stage.

## 12. Definition of Done

The project is not complete merely because the browser can click buttons.

The eventual system must demonstrate:

* Existing strategy behavior remains intact.
* Strategy instructions are integrated without duplicated calculations.
* Browser actions are observable and verifiable.
* State persists across reloads and temporary outages.
* Uncertain operations are not blindly repeated.
* Failures are logged and recoverable.
* Results are only accepted when sufficiently verified.
* Strategy settlement is consistent with the existing implementation.
* Tests cover normal operation and failure recovery.
* The system can run locally without paid AI APIs.

## 13. Coding Assistant Instructions

Whether using GitHub Copilot or Kilo:

* Read this guide before making changes.
* Inspect existing files before proposing modifications.
* Never assume an undocumented feature exists.
* Explain architectural decisions in plain language.
* Keep changes minimal and reviewable.
* Do not skip tests or claim tests passed when they were not run.
* Do not advance to the next major stage without user approval.
* If the current architecture conflicts with this guide, explain the conflict and propose the smallest safe adjustment.

The priority order is:

1. Preserve the working strategy.
2. Ensure correctness.
3. Ensure verifiability.
4. Ensure recovery and state consistency.
5. Add automation gradually.
6. Add convenience features only after reliability is established.
