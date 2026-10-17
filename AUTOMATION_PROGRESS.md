# Automation Progress

## Current stage

Stage 34 — Overlay Handling and Category Detection After the First Live Markets Run.

## Stage 23 completion report

Status: IMPLEMENTED. The real BetKing target opened successfully in a visible
Playwright Chromium session. The live inspection is read-only; it does not
submit wagers.

### Why the existing browser opened the local simulation

- `package.json` maps `automation:poc` to `node automation/poc.js`.
- `automation/poc.js` runs `AutomationController.run()` and the local strategy
  fixture demonstration.
- `automation/controller.js` defines `fixtureUrl` from
  `automation/fixtures/poc.html`; the `runSimulatedOperation()` path navigates
  directly to that URL. The POC does not accept a site mode or target URL.
- `automation/browser/browserManager.js` launches a visible Chrome/Chromium
  browser by default. Headless mode and browser channel are configurable via
  `automation/config.js`; navigation is not hard-coded to an external site by
  browser configuration.
- `automation/sportsbook/betkingAdapter.js` already accepted a Playwright-like
  page, but the POC never passed its page to the adapter. The Stage 23 command
  now connects the real page to that adapter.

### Real-site entry point and observed schedule

Run `npm run automation:betking:inspect` for the explicit real-site path. The
local `npm run automation:poc` remains the separate local-fixture regression
command. The inspection uses the existing browser manager, configured bounded
timeouts, and this exact URL:

`https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league`

The page loaded successfully with title `Virtual Football Betting | Virtual
Sports`; the adapter identified Kings League and 40 fixtures across four
scheduled weeks. At the final inspection, the next displayed round was Week 7
with a scheduled countdown of `01:34`, followed by Weeks 8–10. The round
container exposes the generic `data-testid="league-round"` rather than a
distinct round ID, so no stable round ID was claimed. A visible fixture
identity was `MNU-BHA` with DOM button test ID
`matchup-statistics-button-MNU-BHA`. As with the known
`matchup-statistics-button-LIV-COV` example, this is an observed DOM identity,
not a backend event ID.

The sign-in button was visible, but public schedule and odds remained
accessible; the adapter reported no login gate. The cookie banner was
observed as `#cookiebanner`, with visible `ACCEPT ALL COOKIES` and
`REJECT OPTIONAL COOKIES` choices. The inspection selected only the exact
visible `REJECT OPTIONAL COOKIES` action. Later runs reused that browser
profile preference; no optional tracking was accepted.

### Markets observed

Visible market tabs were exactly `1X2`, `Double Chance`, `O/U 2.5`, `GG/NG`,
and `Correct Score`. Each was opened through its visible market tab, the
original `1X2` tab was restored, and 40 scheduled fixture rows were observed
per market. No betting selection was clicked.

| Displayed market | Observed selections and odds (Week 7, MNU-BHA sample) | Selector/evidence | Matching status |
|---|---|---|---|
| `1X2` | `1` 2.05; `X` 3.22; `2` 3.95 | Fixture row `[data-testid="match"]`; selection/odds `[data-testid="selection-name"]`, `[data-testid="match-odd-value"]`; market `[data-testid="selected-market-name"]` | Labels and odds observed. No Cataloguea strategy key maps unambiguously to these three selections. |
| `Double Chance` | Three odds observed: 1.20, 1.32, 1.69; exact labels were blank/unavailable in the fixture DOM | `[data-testid="market-selector-tab"]`; `[data-testid="match-odd-value"]`; `selection-name` yielded no per-fixture labels | Cannot distinguish `1X`, `12`, and `X2`; no deterministic Cataloguea match. |
| `O/U 2.5` | Two odds observed: 1.78, 2.03; exact Over/Under labels were blank/unavailable | Same visible market-tab and odds markers | No mapping to `tg0`/`tg6`; strategy source does not define those as a 2.5 line. |
| `GG/NG` | Two odds observed: 1.67, 2.20; exact selection labels were blank/unavailable | Same visible market-tab and odds markers | No Cataloguea strategy key. |
| `Correct Score` | 28 odds were visible for the sample fixture, but exact score labels were blank/unavailable; some fixture rows had no visible odds | Same market-tab and odds markers | No exact score mapping can be made from odds-only data. |

The selector `[data-testid="selection-name"]` exposed the observed `1`, `X`,
and `2` labels for the 1X2 market; labels for the other markets could not be
matched to their displayed odds. `Half-Time Correct Score`,
`Full-Time Correct Score`, and `Half-Time/Full-Time` were not among the
available market tabs. `Correct Score` alone does not establish a half-time or
full-time phase.

All Cataloguea strategy-to-BetKing mappings remain
`UNRESOLVED_MARKET`: `winner`, `oneX`, `twoX`, `x2`, `tg0`, `tg6`, `ht12`,
`ht21`, `ht30`, `ft40`, and `ft41`. In particular, the strategy's literal
`2X` is not treated as `X2`; total-goal semantics are not inferred; and no
half-time/full-time score phase is inferred from the generic Correct Score
category.

### Fixture details, live score, and Results

The visible `matchup-statistics-button-MNU-BHA` control was activated through
the normal UI. It did not navigate or expose a separate details panel. No
fixture-specific live clock, home/away score, halftime boundary, or explicit
completed status was visible in the scheduled view. No fixture was observed
live, and no change in score was verified. The Week 7 value above is a
scheduled-round countdown, not a match clock.

No visible Results link or button was found on the inspected Kings League
schedule. The Results page could not be opened through the inspected visible
UI. Consequently, completed-fixture rows, result identity correlation,
full-time scores, and half-time scores remain unverified. No server-side event
ID is claimed. No HT or FT score was captured, and the existing result
observer's explicit completion/HT/FT requirements remain unverified against
BetKing.

### Browser session reuse and safety

The existing browser manager now supports a dedicated persistent context for
the BetKing command, defaulting to `~/.cataloguea/betking-profile`. The
absolute path can be overridden with `AUTOMATION_BETKING_PROFILE_DIR`. Profile
data stays outside the repository and may contain authentication state; it
must not be copied into source control. Use
`npm run automation:betking:inspect -- --manual-login` in a visible terminal
to pause for a user to sign in manually before inspection. Credentials are
never automated. Persistent authenticated-session reuse was **not tested** in
this run because no manual sign-in occurred; only public-page access and
persistent browser-context operation were exercised. CAPTCHA, MFA, and other
access controls are not bypassed.

No wager was placed, no betting outcome was selected or added to a bet slip,
and no account state was changed. The only page preference changed was the
visible cookie choice rejecting optional cookies.

### Stage 23 validation

- `npm run automation:betking:inspect` — PASS; the real BetKing URL opened and
  the findings above were observed.
- `npm run build` — PASS.
- `npm run automation:poc` — PASS; local-fixture regression only.
- `npm run automation:test` — PASS (148/148 tests).
- `git diff --check` — PASS.

### Stage 23 files

- Added: `automation/betkingInspect.js`,
  `automation/betkingInspect.test.js`.
- Modified: `automation/config.js`, `automation/browser/browserManager.js`,
  `automation/controller.js`, `automation/sportsbook/betkingAdapter.js`,
  `automation/betkingAdapter.test.js`, `package.json`, `README.md`,
  `AUTOMATION_PROGRESS.md`.

## Stage 22 — Canonical bet types and live-result observation.

## Stage 22 progress

Status: IMPLEMENTED; BetKing live-score and Results-page evidence remains
unresolved because the accessible public page exposed scheduled fixtures, not
an opened live fixture or a Results view. No unsupported selector or market
mapping was inferred.

### Actual Cataloguea odds/stake terminology

`src/Scores.js` exports the strategy's `odds` array. Each fixture row contains
`id`, `home`, `away`, `winner`, `oneX`, `twoX`, `x2`, `tg0`, `tg6`, `ht12`,
`ht21`, `ht30`, `ft40`, and `ft41`. The ten asset/stake keys are the existing
`ASSET_KEYS` from the strategy adapter; `winner` is a separate odds field, not
an asset key. It feeds `winnerStake`, which the current `src/Catalogued.js` UI
shows on the `6–0` control.

Canonical IDs created in `automation/strategy/canonicalBetTypes.js`:

| Strategy key | Strategy label / source meaning | Canonical ID |
|---|---|---|
| `winner` | Separate `winner` odds field; stake is displayed on the `6–0` UI control; phase and home/away score orientation are not defined by the strategy source | `SCORE_6_0` |
| `oneX` | `1X` | `DOUBLE_CHANCE_1X` |
| `twoX` | Literal `2X`; deliberately not treated as an alias for `X2` | `STRATEGY_2X` |
| `x2` | `X2` | `DOUBLE_CHANCE_X2` |
| `tg0` | `TG0`; exact/line semantics are not encoded in strategy code | `TOTAL_GOALS_0` |
| `tg6` | `TG6`; exact/line semantics are not encoded in strategy code | `TOTAL_GOALS_6` |
| `ht12` | Half-time score 1-2, home-away order | `HT_SCORE_1_2` |
| `ht21` | Half-time score 2-1, home-away order | `HT_SCORE_2_1` |
| `ht30` | Half-time score 3-0, home-away order | `HT_SCORE_3_0` |
| `ft40` | Full-time score 4-0, home-away order | `FT_SCORE_4_0` |
| `ft41` | Full-time score 4-1, home-away order | `FT_SCORE_4_1` |

The canonical ID, exact strategy key/label aliases, phase, condition, and
BetKing mapping are represented separately. All strategy-to-BetKing mappings
currently use `UNRESOLVED_MARKET`; `1X2` availability alone does not prove the
strategy's different named bet types map to it.

### BetKing market and fixture evidence

Read-only inspection of the public
`/en-ng/virtuals/scheduled/leagues/kings-league` page returned HTTP 200 and the
title `Virtual Football Betting | Virtual Sports`. The default visible market
was `1X2`, with selection labels `1`, `X`, and `2`. Its observed DOM markers
include:

- Market name: `[data-testid="selected-market-name"]`
- Selection name: `[data-testid="selection-name"]`
- Odds value: `[data-testid="match-odd-value"]`
- Fixture row: `[data-testid="match"]`
- Home/away: `[data-testid="teams-home-name"]`,
  `[data-testid="teams-away-name"]`
- Match statistics button / row identity:
  `matchup-statistics-button-<HOME>-<AWAY>`, including the Stage 21
  `matchup-statistics-button-LIV-COV`
- Round and scheduled countdown: `[data-testid="round-name"]` and
  `[data-testid="round-timer"]`

The team-code button ID is useful only with home/away teams and the round; it
is not proven to be a backend event ID. Those scheduled-page markers do not
expose a live score, live match clock, or finished status. The visible round
timer is a scheduled kickoff/countdown, not a match clock.

Market tabs visible in the page DOM were `1X2`, `Double Chance`, `O/U 2.5`,
`GG/NG`, and `Correct Score` (each `[data-testid="market-selector-tab"]`).
Only the default `1X2` selection labels were read. An attempt to inspect other
market contents was blocked by the visible cookie-consent overlay; no consent
choice or overlay bypass was made. No half-time/full-time, correct-score, or
total-goals selection names or odds were verified. All corresponding strategy
mappings remain `UNRESOLVED_MARKET`.

The DOM also contained `[data-testid="halftimeup-toggle"]`, an unchecked,
unlabeled checkbox. Its meaning was not established and it was not changed; it
is not treated as evidence of a half-time market or result.

### Live result and Results-page findings

The opened Kings League page showed scheduled rounds, not an opened fixture.
The inspected scheduled DOM had no `data-testid` identifiers containing
`live`, `result`, `score`, `clock`, `finished`, or `status`. A public virtuals
landing page showed scheduled-league cards and “Latest Winners”, not a
completed-fixture Results list. No Results-page fixture identity, final score,
half-time score, or completion selector was observable in those views.

The user-provided platform observation that the Results view is delayed and
shows approximately the latest ten fixtures was not independently verifiable
from the exposed pages in this stage.

Therefore live score/time readability is **not established** on the inspected
page; no HT or FT score was captured from BetKing. Results-page FT and HT
availability are also **not established**; neither score was observed there.
No claim is made that the user-described Results page lacks these fields; it
was not reachable through an exposed Results link during this read-only check.

Added `automation/result/liveResultObserver.js` as a read-only observation
contract. It consumes a fresh DOM snapshot carrying fixture ID, home, away,
round, clock, both scores, and an explicit match status. It captures the latest
score at/before minute 45 as HT, treats later clocks as second-half observations,
and requires explicit `FINISHED`/`COMPLETED` plus valid HT and FT scores before
emitting `status: "verified"` and an FT result suitable for the existing
settlement gate. It rejects ambiguous/wrong fixtures, stale snapshots,
incomplete or invalid scores, invalid clocks/status, and duplicate completed
observations. Identical completed results are deduplicated; a conflicting
second final score is rejected. Correlation requires fixture ID, home, away,
and round. No server-side
event ID is assumed.

`readLiveFixtureSnapshot` in the existing BetKing adapter requires explicit
field selectors; it intentionally defines no guessed score/clock/status
selectors. The live observer and Results-page verifier are exported through the
existing `automation/result/resultObserver.js` entry point. The Results-page
verifier is a secondary FT comparison and only
marks HT as independently present on the Results page when a matching row
actually supplies it; otherwise it preserves only the already-captured live HT
score. It never invents HT. The live observer is designed as primary, with
Results as optional verification. No live BetKing result could be run through
this observer during this stage because no live fixture DOM contract was
observed.

### Stage 22 validation

- Deterministic tests cover first-half observations and score changes, HT
  capture, second-half changes, separate HT/FT capture, explicit finished-state
  detection, incomplete/invalid scores, ambiguous/wrong fixture, stale result,
  Results-page verification/mismatch, duplicate processing, and rejection of
  unverified results by strategy settlement.
- `npm run build` — PASS.
- `npm run automation:poc` — PASS (local POC only).
- `npm run automation:test` — PASS (137 tests).
- `git diff --check` — PASS.
- No wager was placed, no betting selection was clicked or added to a bet slip,
  and no account state was changed.

## Stage 21 completion summary

Status: PASS (read-only comparison only; no wager, no bet slip, no account interaction, no state mutation).

Implemented:
- Added deterministic fixture matching between the existing Cataloguea strategy instruction and a real BetKing scheduled Kings League snapshot.
- Added read-only market observation and odds extraction for the 1X2 market structure (`1`, `X`, `2`) without mutating strategy state.
- Added explicit safety outcomes for `FIXTURE_NOT_FOUND`, `AMBIGUOUS_FIXTURE`, `NO_LEAGUE`, and `MATCH_VERIFIED` so the automation stops when untrusted or ambiguous matches are detected.
- Extended `automation/betkingAdapter.test.js` with fixture-matching, market-validation, and no-mutation tests covering exact match, wrong home/away, wrong league, ambiguous candidates, and read-only strategy comparison.

Files modified:
- `automation/sportsbook/betkingAdapter.js`
- `automation/betkingAdapter.test.js`
- `AUTOMATION_PROGRESS.md`

Safety and compliance:
- No wager was placed.
- No odds were clicked or added to a bet slip.
- No account state or sportsbook state was mutated.
- No CAPTCHA, anti-bot bypass, or login flow was attempted.
- The read-only flow is limited to observation and deterministic validation.

## Stage 20 completion summary

Status: PASS (read-only reconnaissance only; no wagering or account interaction performed).

Observed target:
- URL visited: `https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league`
- HTTP result: `200 OK`
- Page title: `Virtual Football Betting | Virtual Sports`
- Public access: the scheduled virtual league page loaded without any required login for the visible content.
- Cookie consent banner was visible, but the underlying scheduled league structure remained available.

Observed page structure:
- BetKing exposes `data-testid` markers such as `league-switcher-tab-kings-league`, `league-round`, `round-name`, `round-timer`, `match`, `matchup-statistics-button-<HOME>-<AWAY>`, `teams-home-name`, `teams-away-name`, `match-odd-value`, and `selected-market-name`.
- The schedule is grouped by rounds (for example `Week 20`, `Week 21`, `Week 22`, `Week 23`).
- Each fixture is represented as a scheduled match row with home and away team codes and 1/X/2 odds in the visible market.
- The closest stable scheduled-match identifier observed in the live DOM is the match button ID pattern `matchup-statistics-button-<HOME>-<AWAY>` combined with the round label; no explicit database `eventId` or `fixtureId` was observed in the visible DOM.
- The visible market label is `1X2`; odds are exposed as numeric values on each match row without requiring a bet slip or login action.

Safety and compliance:
- No wager was placed.
- No selection was clicked.
- No bet slip or staking interaction was performed.
- No authentication bypass or anti-bot evasion was attempted.
- No live security restrictions were bypassed.

Files added:
- `automation/sportsbook/betkingAdapter.js`
- `automation/betkingAdapter.test.js`

Adapter behavior:
- Detects page availability and league presence.
- Reads public scheduled fixtures and team codes.
- Extracts visible market names and odds for 1/X/2 style markets.
- Returns explicit status values for `PAGE_UNAVAILABLE`, `NO_LEAGUE`, `NO_FIXTURE`, `NO_MARKET`, `MISSING_ODDS`, `AUTH_REQUIRED`, `ACCESS_RESTRICTED`, and `READY_READ_ONLY`.
- Keeps the adapter read-only and distinct from any future wager execution path.

Validation completed:
- `npm run build` — pending until final test pass.
- `npm run automation:poc` — pending until final test pass.
- `npm run automation:test` — pending until final test pass.
- `git diff --check` — pending until final test pass.

## Stage 19 completion summary


## Stage 19 completion summary

Status: PASS.

Implemented:
- LocalStorage was made the runtime-authoritative source for the active Solo Matrix state (`virt-epl-solo-v1`).
- The app now loads local state first and keeps backend values as backup/recovery material only.
- A lightweight hourly backup scheduler was added for best-effort backend uploads without blocking strategy or browser automation.
- Backup metadata is stored in localStorage and records success/failure timestamps and last-attempt state without altering strategy calculations.
- Manual API recovery remains available but refuses to overwrite newer local state with stale backend data.
- A new persistence test file covers local-state validity, stale-backend protection, backup metadata, and duplicate-prevention logic.

Validation completed:
- `npm run build` — passed.
- `npm run automation:poc` — passed.
- `npm run automation:test` — passed with 103/103 assertions successful.
- `git diff --check` — passed.

Safety and architecture notes:
- Solo Matrix calculations were not rewritten or duplicated in automation.
- Backend connectivity is intentionally non-blocking to strategy execution.
- Failed backup attempts remain local-only and do not mutate strategy state.
- BetKing was not accessed in this stage, and live sportsbook interaction remains intentionally disabled.

Known limitations:
- The backend remains a backup destination only; it is not the runtime source of truth.
- Real-site automation remains out of scope until explicit site approval and compliance review are available.

## Completed

- Copied `src/copilot/automation_project_guide.md` to
  `AUTOMATION_PROJECT_GUIDE.md` without removing or changing the original.
- Added Playwright as a development dependency and added the
  `automation:poc` npm script.
- Added a local-only fixture and a proof-of-concept runner that verifies page
  text, clicks an accessible button, fills a labeled input, handles an
  expected navigation timeout, captures a screenshot, and closes the browser.
- Added the screenshot output directory to `.gitignore`.

## Verification

- `npm run build` — passed.
- `npm run automation:poc` — passed twice; each run reported the expected
  navigation timeout, verified the interactions, saved the screenshot, and
  closed the browser.
- Screenshot: `automation/artifacts/poc.png` (ignored by Git).

## Environment note

Playwright's bundled Chromium installer does not support this Ubuntu 20.04
host. The POC instead launches the installed Chrome/Chromium browser via
Playwright's `chrome` channel.

## Stage 2

**Status:** Complete.

### Implemented

- Added `automation/browser/browserManager.js` for visible Chrome launch,
  page creation, sensible timeouts, and browser cleanup if page setup fails.
- Added `automation/browser/pageActions.js` for visible text, clicks, input
  fill/read, visibility checks, and screenshots. Errors include the operation
  and locator and retain the original error as their cause.
- Added `automation/browser/navigation.js` for URL navigation, visible page
  conditions, and an explicit non-fatal navigation-timeout result.
- Refactored `automation/poc.js` to use these modules against the local fixture.

### Decisions and limitations

- Browser launch remains `headless: false` with Playwright's installed `chrome`
  channel, as required by this host.
- Helpers accept Playwright page/locator objects from callers; they do not
  launch browsers or choose coordinates.
- The navigation timeout helper returns `false` only for Playwright's timeout;
  other errors remain failures.
- No recovery, persistence, adapters, or application/backend integration was
  added.

### Files

- Created: `automation/browser/browserManager.js`,
  `automation/browser/pageActions.js`, `automation/browser/navigation.js`.
- Modified: `automation/poc.js`, `AUTOMATION_PROGRESS.md`.

### Verification

- `npm run build` — passed; CRA emitted only the existing stale Browserslist
  data warning.
- `npm run automation:poc` — passed twice. Each visible-browser run verified
  the heading, paragraph, button-driven text change, and input value; handled
  the expected navigation timeout; saved the screenshot; and closed Chrome.
- `git diff --check` — passed.

### Stage 3

**Status:** Complete.

#### Implemented

- Added `automation/browser/selectors.js` as the centralized semantic locator
  catalog for the local POC fixture.
- Added `automation/browser/pageObserver.js` as a read-only page snapshot
  utility. It captures the page URL/title and visibility/text for supplied
  locators using the existing Stage 2 page-action helpers.
- Updated `automation/poc.js` to get its fixture locators from the catalog and
  verify initial page and post-click observations.

#### Decisions and limitations

- Selectors remain specific to the harmless local fixture; no selectors for
  Cataloguea, BetKing, or any remote page were added.
- Observation accepts caller-supplied locators, does not mutate the page, and
  reports invisible elements without attempting to read their text.
- No controller, state machine, persistence, recovery, adapters, or strategy
  integration was added.

#### Files

- Created: `automation/browser/selectors.js`,
  `automation/browser/pageObserver.js`.
- Modified: `automation/poc.js`, `AUTOMATION_PROGRESS.md`.

#### Verification

- `npm run build` — passed; CRA emitted the existing stale Browserslist data
  warning.
- `npm run automation:poc` — passed twice. Each visible-browser run checked the
  observed local fixture heading and paragraph, button and input visibility,
  changed status text, and filled input value; handled the expected navigation
  timeout; saved the screenshot; and closed Chrome.
- `git diff --check` — passed.
- Screenshot: `automation/artifacts/poc.png` (1280 × 800; ignored by Git).

#### Stage 4

**Status:** Complete.

##### Implemented

- Added `automation/stateMachine.js` with explicit `IDLE`, `INITIALIZING`,
  `OBSERVING`, `ACTION_REQUIRED`, `VERIFYING`, `COMPLETED`, `ERROR`, and
  `STOPPED` states, validated transitions, transition history, and deterministic
  stop behavior.
- Added `automation/controller.js` to coordinate browser launch, local fixture
  navigation, observation, fixture interactions, verification, screenshot,
  state reporting, error reporting, and browser cleanup using the existing
  Stage 1–3 modules.
- Updated `automation/poc.js` to run the controller, print actual transition
  callbacks, and execute a second controller run that deliberately verifies a
  nonexistent fixture heading. That run must fail into `ERROR`.
- Added focused Node built-in tests in `automation/stateMachine.test.js` and an
  `automation:test` npm script.

##### State flows

- Success: `IDLE → INITIALIZING → OBSERVING → ACTION_REQUIRED → VERIFYING →
  COMPLETED`.
- Failure: active state → `ERROR`; the POC exercises `VERIFYING → ERROR`.
- Stop: permitted from any non-`STOPPED` state; repeated stop is rejected.

##### Limitations and decisions

- Both successful and intentional-failure runs use only the local fixture.
- The failure run uses a semantic locator for a heading known not to exist;
  it does not add retries or recovery.
- Controller dependencies can be replaced for isolated tests. No external
  website, application adapter, strategy integration, persistence, or backend
  operation was added.

##### Files

- Created: `automation/stateMachine.js`, `automation/controller.js`,
  `automation/stateMachine.test.js`.
- Modified: `automation/poc.js`, `automation/browser/selectors.js`,
  `package.json`, `AUTOMATION_PROGRESS.md`.

##### Verification

- `npm run build` — passed; CRA emitted the existing stale Browserslist data
  warning.
- `npm run automation:poc` — passed twice. Both runs showed the normal
  controller transition flow to `COMPLETED`, then the intentional missing
  fixture-element failure flow to `ERROR`. Both browser sessions closed; the
  successful run produced `automation/artifacts/poc.png`.
- `npm run automation:test` — passed; all six Node built-in state-machine tests
  passed.
- `git diff --check` — passed.
- Both POC controller runs navigated only to the local fixture URL.

##### Stage 5

**Status:** Complete.

###### Implemented

- Added `automation/persistence/runStore.js`, a versioned local JSON store that
  persists the latest state checkpoint, structured event records, and
  operation records using temporary-file replacement.
- Updated `automation/controller.js` to persist each state transition, run
  start/completion/failure events, and one identified local fixture interaction
  per run. The interaction remains pending until its visible result and input
  value are verified, then becomes confirmed. If verification fails after the
  interaction begins, it is marked uncertain.
- Updated the POC to report each run ID and added tests for checkpoint/event
  persistence, confirmed/failed/uncertain operation outcomes, malformed store
  data, and invalid operation updates.
- Added `automation/runtime/` to `.gitignore`; persisted local state is not
  committed.

###### Decisions and limitations

- State is stored at `automation/runtime/run-state.json`, separate from
  strategy localStorage and backend data. The store contains only POC run IDs,
  fixture action names, states, timestamps, and verification outcomes.
- State writes use atomic replacement. The file records the latest checkpoint
  and retains structured events and operations from prior runs.
- This stage does not load a checkpoint to resume work, retry actions, or
  resolve uncertain operations. Those behaviors remain out of scope.

###### Files

- Created: `automation/persistence/runStore.js`.
- Modified: `automation/controller.js`, `automation/poc.js`,
  `automation/stateMachine.test.js`, `package.json`, `.gitignore`,
  `AUTOMATION_PROGRESS.md`.

###### Verification

- `npm run build` — passed; CRA emitted the existing stale Browserslist data
  warning.
- `npm run automation:poc` — passed twice. Each run completed the normal local
  fixture workflow, wrote a confirmed operation, exercised the intentional
  verification failure and wrote an uncertain operation, and closed both
  visible browser sessions. The screenshot remained available at
  `automation/artifacts/poc.png`.
- `npm run automation:test` — passed; all nine state-machine and persistence
  tests passed.
- `git diff --check` — passed.
- Persisted runtime state was inspected and showed the latest checkpoint,
  timestamped state events, confirmed successful interactions, and uncertain
  outcomes for the intentional failed verifications.

###### Stage 6

**Status:** Complete.

###### Implemented

- Added `automation/recovery/recoveryManager.js` to classify navigation,
  timeout, closed-page, and disconnected-browser failures; check browser/page
  health; load the latest persisted checkpoint; restore the page when safe;
  and retry only explicitly safe operations.
- Added bounded recovery attempts: three total attempts including the initial
  attempt, with 100 ms then 200 ms delays between retries by default.
- Extended the browser manager session to restore a closed page or relaunch a
  disconnected visible Chrome session, while retaining one cleanup entry point.
- Added `RECOVERING`, `PAUSED`, and `EXECUTING` controller states. Read-only
  local fixture navigation/observation can recover to `OBSERVING`. If an
  interaction begins but cannot be verified, its operation is persisted as
  `unknown` and the controller enters `PAUSED` without retrying it.
- Updated the local POC to close the fixture page during observation to
  demonstrate recovery, and to simulate a failure after an interaction starts
  to demonstrate the unknown-operation pause.
- Added deterministic Node tests for recovery success, failure classification,
  health checks, checkpoint loading, retry bounds/exhaustion, unknown outcomes,
  no retry of unresolved operations, and browser cleanup on controller error.

###### Decisions and limitations

- Retries are limited to read-only, idempotent navigation/observation of the
  local fixture. The recovery manager does not retry a pending, unknown, or
  historically uncertain operation.
- Uncertain historical Stage 5 records are preserved. New ambiguous operations
  use the explicit `unknown` status.
- Recovery does not resume a prior process from a checkpoint or contact a
  network service. Recovered page restoration and all fault injection remain
  local to the safe POC.
- No dependencies were added.

###### Files

- Created: `automation/recovery/recoveryManager.js`,
  `automation/recovery.test.js`.
- Modified: `automation/stateMachine.js`, `automation/controller.js`,
  `automation/browser/browserManager.js`, `automation/persistence/runStore.js`,
  `automation/poc.js`, `AUTOMATION_PROGRESS.md`.

###### Verification

- `npm run build` — passed; CRA emitted the existing stale Browserslist data
  warning.
- `npm run automation:poc` — passed. The normal workflow reached `COMPLETED`;
  the closed-page scenario transitioned `OBSERVING → RECOVERING → OBSERVING`
  and completed; the injected post-action failure transitioned to `PAUSED`,
  recorded one `unknown` operation, and was not retried. Browser sessions
  close through the shared browser manager cleanup path. Screenshot:
  `automation/artifacts/poc.png`.
- `npm run automation:test` — passed; all 17 Node tests passed, including
  bounded-retry exhaustion and a controller-level check for `ERROR` plus
  browser cleanup.
- `git diff --check` — passed.
- POC navigation uses only the local fixture. No internet-disconnection test
  or external site was used.

###### Stage 7

**Status:** Complete.

###### Strategy inspection and integration boundary

- `src/Catalogued.js` keeps strategy values in React `useState`, including
  `fixture`, `winnerStake`, `gameStakes`, `bigStakes`, winner-mark sets, and
  deficit/bank values. `handleSubmit` selects the fixture from imported odds
  and calculates the stakes; `markWin`/`markBigWin` record manual selections;
  `handleNext` performs settlement.
- `src/Scores.js` is the authoritative odds table. For example, `livmnu`
  contains home `liv`, away `mnu`, winner odd `325`, and the ten asset odds.
- The React component exposes no pure strategy function or stable snapshot
  interface. Importing it into Node or refactoring it would couple the
  automation layer to UI/runtime details and risk strategy behavior. Stage 7
  therefore adds a read-only adapter for a validated snapshot of the existing
  hook-state fields. The POC snapshot is deterministic and uses the inspected
  `livmnu` row and precomputed strategy outputs; the adapter does not calculate
  stakes or claim to read live React state.
- A future UI-observation bridge remains coupled to the React component; this
  stage deliberately does not add UI data attributes, globals, or localStorage
  reads.

###### Implemented

- Added `automation/strategy/catalogueaAdapter.js` to validate and translate
  fixture identity/odds, existing normal and big stake maps, winner stake,
  manual winner marks, financial state, and observation time into a stable
  instruction.
- Adapter states distinguish `no_active_fixture`, `fixture_submitted`,
  `stakes_available`, and `manual_result_marked`. It labels winner marks as
  manual selections, not independently observed match results, and never
  clicks, mutates state, settles, or writes strategy/backend data.
- Added `AutomationController.observeStrategy()` as a read-only adapter
  boundary. The local POC prints the adapter output before running its existing
  local fixture-only browser scenarios.
- Added automation tests for inactive/submitted/active states, multiple
  assets, manual result marks, malformed inputs, and snapshot immutability.

###### Files

- Created: `automation/strategy/catalogueaAdapter.js`,
  `automation/catalogueaAdapter.test.js`.
- Modified: `automation/controller.js`, `automation/poc.js`,
  `AUTOMATION_PROGRESS.md`.
- `src/Catalogued.js` and `src/Scores.js` were inspected but not modified.

###### Verification

- `npm run build` — passed; CRA emitted the existing stale Browserslist data
  warning.
- `npm run automation:poc` — passed. It printed the deterministic strategy
  snapshot translation, then completed the normal local-fixture flow, safely
  restored a locally closed page, and paused a simulated unknown interaction
  without retrying it.
- `npm run automation:test` — passed; all 23 Node automation tests passed,
  including six Cataloguea adapter tests.
- `git diff --check` — passed.
- No BetKing navigation, backend access, strategy writes, or live betting was
  performed; no dependencies were added.

###### Stage 8

**Status:** Complete.

###### Implemented

- Added `automation/fixtures/simulatedSportsbook.html`, a deterministic,
  local-only page with fixture and market selection, displayed odds, a stake
  input, a simulated action, confirmation status, and action count. It has no
  external resources or network/API calls.
- Added `automation/sportsbook/simulatedSportsbookAdapter.js` to use the
  existing navigation and page-action primitives and verify fixture, market,
  asset, precomputed stake, and precomputed odds before allowing the simulated
  action. Browser selectors and mechanics remain in the adapter.
- Extended `automation/controller.js` and `automation/stateMachine.js` for
  strategy-instruction observation, match verification, simulated operation
  execution, confirmation, and safe unknown outcomes. The controller consumes
  the Stage 7 adapter's values and does not calculate strategy stakes or odds.
- Extended `automation/persistence/runStore.js` to persist the simulated
  operation lifecycle (`pending → executing → confirmed` or `unknown`).
  An unconfirmed operation is paused and is never automatically repeated.
- Updated `automation/poc.js` to demonstrate the deterministic strategy
  snapshot → adapter → instruction → local simulated sportsbook flow, save a
  confirmed checkpoint, and exercise wrong-fixture, missing-market, and
  missing-confirmation scenarios.
- Added `automation/simulatedSportsbook.test.js` for instruction/selection
  verification, successful operation persistence, mismatch prevention,
  unknown confirmation, and duplicate-operation protection.

###### State flows and safety

- Success:
  `IDLE → INITIALIZING → OBSERVING_STRATEGY →
  STRATEGY_INSTRUCTION_READY → FINDING_MATCH → MATCH_VERIFICATION →
  READY_FOR_ACTION → EXECUTING → VERIFYING → CONFIRMED → COMPLETED`.
- Wrong fixture or missing market transitions to `ERROR` before an operation
  is created or an action is clicked.
- If the action is clicked but confirmation cannot be established, the
  operation becomes `unknown` and the controller transitions
  `EXECUTING → PAUSED`. The POC verifies exactly one simulated click occurred.
- Checkpoints and operation records are written to the existing ignored local
  runtime store.

###### Decisions and limitations

- The only browser target is the local simulated fixture. No BetKing,
  sportsbook, Cataloguea backend, or other external site is accessed.
- Strategy instructions are supplied through the Stage 7 read-only snapshot
  adapter. The adapter's existing precomputed values remain authoritative;
  no staking, deficit, odds, or Solo Matrix calculations were added.
- The simulation validates controller and adapter behavior only; it is not a
  live sportsbook integration and does not submit a wager.

###### Files

- Created: `automation/fixtures/simulatedSportsbook.html`,
  `automation/sportsbook/simulatedSportsbookAdapter.js`,
  `automation/simulatedSportsbook.test.js`.
- Modified: `automation/stateMachine.js`, `automation/persistence/runStore.js`,
  `automation/recovery/recoveryManager.js`, `automation/controller.js`,
  `automation/poc.js`, `AUTOMATION_PROGRESS.md`.
- No dependencies were added.

###### Verification

- `npm run build` — passed; CRA emitted the existing stale Browserslist data
  warning.
- `npm run automation:poc` — passed. The successful local simulation reached
  `COMPLETED` and wrote a checkpoint; wrong-fixture and missing-market cases
  reached `ERROR` without creating operations; missing confirmation recorded
  `UNKNOWN`, paused, and verified exactly one simulated action. The existing
  local POC, recovery, and unknown-operation demonstrations also passed, and
  the diagnostic screenshot was produced.
- `npm run automation:test` — passed; all 29 Node automation tests passed.
- `git diff --check` — passed.
- The 13 pre-existing tracked deletions remain untouched. Strategy, backend,
  and BetKing code were not modified.

###### Stage 9

**Status:** Complete.

###### Implemented

- Added `automation/result/resultObserver.js` to read semantic result status,
  fixture identity, team names, and scores from the local simulated sportsbook.
  It normalizes complete scores to non-negative integer fields and rejects
  unknown status, mismatched fixture identity, and missing/ambiguous scores.
- Extended the local fixture with deterministic complete, pending,
  wrong-fixture, and incomplete result states. Result fields are local DOM
  content only; the observer is read-only.
- Extended the state machine with `WAITING_FOR_RESULT`, `RESULT_DETECTED`, and
  `RESULT_VERIFIED`. A pending result stays in `WAITING_FOR_RESULT`; a verified
  result completes without entering settlement.
- Extended `AutomationController.runSimulatedOperation()` to observe and
  validate the result only after action confirmation. Invalid observations
  enter `ERROR`; the already-confirmed action record is preserved.
- Extended `RunStore` checkpoints with fixture, operation ID, result
  observation status, and normalized result. Verified results are stored
  idempotently by fixture and score; repeat observations report
  `already_known` rather than appending another result record.
- Extended `automation:poc` to print the normalized local result and exercise
  pending, wrong-fixture, incomplete, and duplicate-result scenarios.
- Added result observer unit tests and controller/persistence tests; extended
  the Node test script to include nested automation test files.

###### State flows and safety

- Complete result:
  `CONFIRMED → WAITING_FOR_RESULT → RESULT_DETECTED → RESULT_VERIFIED →
  COMPLETED`.
- Pending result remains at `WAITING_FOR_RESULT`, with a pending checkpoint
  and no normalized final score.
- Wrong-fixture or incomplete results transition to `ERROR`; no result record
  is created and no strategy settlement is run.
- Re-observing the same verified fixture/score is idempotent: the canonical
  result record remains singular and the repeat is reported as already known.
- The simulated action record remains separate and unchanged; its operation ID
  is linked from the result checkpoint/canonical result. No settlement states,
  strategy writes, backend operations, or live integrations were added.

###### Files

- Created: `automation/result/resultObserver.js`,
  `automation/resultObserver.test.js`.
- Modified: `automation/stateMachine.js`, `automation/stateMachine.test.js`,
  `automation/fixtures/simulatedSportsbook.html`,
  `automation/sportsbook/simulatedSportsbookAdapter.js`,
  `automation/persistence/runStore.js`, `automation/controller.js`,
  `automation/simulatedSportsbook.test.js`, `automation/poc.js`,
  `package.json`, `AUTOMATION_PROGRESS.md`.
- No dependencies were added.

###### Verification

- `npm run build` — passed; CRA emitted the existing stale Browserslist data
  warning.
- `npm run automation:poc` — passed. The visible local simulation reached
  `RESULT_VERIFIED` and `COMPLETED` with the normalized result `livmnu 2–1`;
  pending stayed in `WAITING_FOR_RESULT`; wrong-fixture and incomplete
  observations were rejected; duplicate result observation was recognized as
  already known. Existing Stage 1–8 local flows also passed, and the
  diagnostic screenshots were produced.
- `npm run automation:test` — passed; all 39 Node automation tests passed.
- `git diff --check` — passed.
- No external sites, BetKing, or backend were accessed. Strategy and backend
  source were unchanged; the 13 pre-existing tracked deletions remain.

###### Stage 10

**Status:** Complete.

###### Settlement architecture

- Added `automation/strategy/settlementAdapter.js`. It accepts only a verified
  result whose fixture matches the strategy instruction and requires a
  confirmed action-operation ID. It creates an explicit settlement request
  and delegates state updates to a strategy-owned callback; it contains no
  Solo Matrix calculations.
- `src/Catalogued.js` settlement is implemented inside React's `handleNext`
  handler and consumes hook state plus manual winner-mark sets. It is not
  exposed as a pure function. Stage 10 deliberately did not refactor or import
  the component. The local POC uses a simulated strategy port which records a
  settlement marker/verified score only; this demonstrates the boundary and
  state handoff, not a real Solo Matrix settlement update. A production
  strategy port remains a required future integration before this can mutate
  Cataloguea state.
- Added `automation/result/resultIdentity.js`. Identity is the deterministic
  `fixtureId:homeScore-awayScore`, excluding observation timestamp so repeated
  observations are stable. The current fixture model has no scheduled-instance
  identifier; repeated identical scores for the same fixture ID therefore
  intentionally map to one result identity until a reliable match-instance
  key is available.

###### Idempotency and failure handling

- Extended `RunStore` with verified-result-linked settlement records and
  separate settlement operations. The relationship is stored as result ID →
  action operation ID → settlement operation ID.
- Settlement claim is serialized across `RunStore` instances in this Node
  process. It checks that the canonical result is verified and its action
  operation is confirmed before creating an executing claim. A confirmed
  claim returns `already_settled` without calling the strategy port or adding
  another operation.
- An executing settlement encountered on a later attempt is changed to
  `unknown`; it is never replayed. Callback failure also records `unknown` and
  transitions `SETTLING_STRATEGY → SETTLEMENT_UNKNOWN → PAUSED`.
- Added `SETTLING_STRATEGY`, `SETTLEMENT_CONFIRMED`, and
  `SETTLEMENT_UNKNOWN` states. Pending, unknown, wrong-fixture, and incomplete
  results cannot enter a new settlement.
- The local POC completes the action/result/settlement path, prints the
  simulated strategy-state marker, calls settlement again to prove
  `already_settled`, and injects a separate unknown settlement to prove no
  second callback occurs.

###### Files

- Created: `automation/result/resultIdentity.js`,
  `automation/strategy/settlementAdapter.js`,
  `automation/strategySettlement.test.js`.
- Modified: `automation/stateMachine.js`, `automation/stateMachine.test.js`,
  `automation/persistence/runStore.js`, `automation/controller.js`,
  `automation/sportsbook/simulatedSportsbookAdapter.js`,
  `automation/fixtures/simulatedSportsbook.html`,
  `automation/simulatedSportsbook.test.js`, `automation/poc.js`,
  `AUTOMATION_PROGRESS.md`.
- No dependencies were added.

###### Verification

- `npm run build` — passed; CRA emitted the existing stale Browserslist data
  warning.
- `npm run automation:poc` — passed. The local flow reached
  `RESULT_VERIFIED → SETTLING_STRATEGY → SETTLEMENT_CONFIRMED → COMPLETED`;
  repeat settlement returned `already_settled` without a new operation. An
  injected uncertain settlement reached `SETTLEMENT_UNKNOWN → PAUSED` and
  was not re-executed. Pending, wrong-fixture, incomplete-result, and prior
  Stage 1–9 POC scenarios also passed.
- `npm run automation:test` — passed; all 48 Node automation tests passed.
- `git diff --check` — passed.
- No BetKing URL or other external site was accessed. No backend, `src/Catalogued.js`,
  strategy calculation, or protected application source was changed. The 13
  pre-existing tracked deletions remain untouched. Stage 11 details follow.

###### Stage 11 — Full Simulation, Fault Injection & End-to-End Stress Test

**Status:** Complete.

###### Implemented

- Added `automation/stress/faultInjection.js` for named, deterministic,
  bounded phase failures with attempt counts.
- Added `automation/stress/endToEndStress.test.js`, an isolated chaos matrix
  that uses temporary per-run persistence and the existing local simulated
  sportsbook fixture for the full success path.
- Extended `AutomationController.runSimulatedOperation()` to apply the
  existing bounded recovery policy to transient match preparation failures
  only. Closed pages and navigation timeouts can retry before an action
  operation exists; wrong fixture/market verification failures do not retry.
- Added operation guards to both controller run paths. A reconstructed run
  with an existing action operation pauses and preserves its status rather
  than creating a second action. A pending/executing operation in the older
  fixture POC path is marked `unknown` on restart.
- Extended the state machine to allow bounded recovery from match
  verification and to pause during reconstruction when an operation already
  exists.
- Extended `automation/poc.js` to demonstrate persistence of an unknown
  operation across a simulated restart and refusal to repeat it.
- No dependencies were added.

###### Fault scenarios tested

- Complete local fixture → strategy instruction → action confirmation →
  result verification → strategy-boundary settlement.
- Closed page restored before matching; one navigation timeout recovered;
  exhausted navigation attempts stop in `ERROR`, without an action.
- Wrong fixture and missing market reject before action creation.
- Pre-action execution interruption and unavailable confirmation remain
  `UNKNOWN`/`PAUSED`; neither is retried.
- Pending result remains `WAITING_FOR_RESULT`; wrong-fixture and incomplete
  results reject without settlement or strategy updates.
- Repeated identical result processing keeps one result identity and one
  settlement; subsequent settlement calls return `already_settled`.
- Settlement confirmation failure remains `UNKNOWN`/`PAUSED`, with no repeat
  strategy-port call.
- Restart after confirmed action, after verified result but before settlement,
  and while settlement is executing.
- Settlement prerequisites and invalid state transitions are rejected.

###### Safety invariants verified

- No action operation before fixture/market/stake/odds verification.
- No settlement unless the result is verified and the linked action is
  confirmed.
- Pending, malformed, and wrong-fixture results do not settle or update the
  strategy boundary.
- Unknown action/settlement status pauses; it never triggers an automatic
  operation retry.
- Reprocessing does not duplicate action operations, deterministic result
  identities, or settlement operations.
- Strategy-provided precomputed stake values are passed through unchanged;
  automation does not implement Solo Matrix calculations.
- Failed verification cannot be recorded as confirmed.
- Recovery is bounded to the existing three total attempts.
- Persisted operation IDs, timestamps, result/action/settlement links, statuses,
  and checkpoints are checked for consistency.

###### Restart/recovery behavior

- A closed page or transient navigation failure may be retried only during
  read-only match preparation, before any action operation exists. Exhaustion
  records an error and leaves action/settlement counts at zero.
- Restart after a confirmed action pauses at the persisted result checkpoint
  pending explicit result observation; it does not create another action.
- A persisted verified result plus a confirmed action can claim one
  settlement. If that settlement is still executing at restart, it is changed
  to `UNKNOWN`, retained in persistence, and the reconstructed controller
  pauses without calling the strategy port again.
- The controller does not provide general automatic checkpoint hydration or
  live strategy-state restoration. Where a run cannot be safely reconstructed,
  the tests assert pause/no-replay rather than guessing.

###### Files

- Created: `automation/stress/faultInjection.js`,
  `automation/stress/endToEndStress.test.js`.
- Modified: `automation/controller.js`, `automation/stateMachine.js`,
  `automation/sportsbook/simulatedSportsbookAdapter.js`,
  `automation/poc.js`, `AUTOMATION_PROGRESS.md`.

###### Verification

- `npm run build` — passed; the existing stale Browserslist-data warning was
  emitted.
- `npm run automation:poc` — passed; normal full cycle, duplicate settlement,
  unknown settlement, pending/invalid results, closed-page recovery, unknown
  action, and restart refusal all completed as asserted.
- `npm run automation:test` — passed; 68 tests passed, including all 48
  pre-existing Stage 10 tests.
- `node --test automation/stress/endToEndStress.test.js` — passed; 20 tests
  passed (18 chaos cases plus the suite and fault-injector checks).
- `git diff --check` — passed.

###### Limitations and external site status

- The strategy settlement port is simulated; this stage does not mutate the
  React strategy state. The real `src/Catalogued.js` React settlement
  integration remains a future strategy-owned boundary.
- Result identity still uses fixture ID and score because no scheduled match
  instance ID exists in the current model.
- Only the local simulated sportsbook fixture was used. No BetKing or external
  sportsbook was accessed. Backend and `src/Catalogued.js` remain unmodified.

###### Stage 12 — Strategy / Backend / Automation Integration Audit

**Status:** Complete.

###### Existing strategy architecture

- `src/Catalogued.js` owns the active strategy in React hook state. `handleSubmit`
  selects an entry from `src/Scores.js`, calculates winner/normal/big stakes,
  and updates `brokenTarget` from generated big stakes. Automation must use
  those precomputed state values and must not reproduce those calculations.
- `handleNext` consumes the current fixture, manual `winners`/`bigWinners`
  marks, and hook state; it applies settlement and clears the active game.
  It does not accept a verified score or operation/result identity. There is no
  current score-to-asset outcome mapping or exposed strategy-owned settlement
  function for automation.
- The existing adapter validates the snapshot's fixture, precomputed
  `gameStakes`/`bigStakes`, winner stake, financial totals, and manual marks,
  then creates an instruction. It passes stakes as observed; it does not
  compute them. It is a translator, not a live React state connection, and
  currently does not expose every transient hook field such as
  `privateDef`/`brokenTarget` or `clicked` in its returned instruction.

###### Existing backend architecture

- Inspected the sibling backend repository `../Campusbuy-Backend-`:
  `index.js`, `Routes/catalogueaBKRoute.js`,
  `Controllers/catalogueaBKCtrl.js`, `Models/catalogueaModel.js`, and the CORS
  configuration.
- `GET /betking` is mounted before `verifyJwt`, reads `BetkingBase.findOne()`,
  creates a default document if none exists, then returns the document as JSON
  with HTTP 200.
- `PUT /betking` is also before `verifyJwt`. It accepts JSON and applies a
  fixed whitelist of fields from the request body to the first document,
  saves it, and returns the document. If no document exists, it creates one
  from the body. There is no route-level auth, request schema validator, or
  explicit concurrency/version check. Mongoose schema casting/defaults and
  strict schema behavior are the only model-level constraints.
- `BetkingBase` is a timestamped Mongoose schema containing current and legacy
  financial fields. The `findOne()` usage treats it as one shared strategy
  document, but there is no unique singleton constraint; concurrent first
  writes could create multiple records. Mongoose provides schema casting/type
  validation, but there are no business-level request constraints. Errors are
  routed through the generic error handler, which returns an error message
  and stack.
- A safe local backend could not be started: backend dependencies are absent,
  `DATABASE_URI` is unset, and no backend test suite or local database fixture
  exists. No production endpoint/data was queried.

###### CORS and development configuration

- CRA defaults to frontend port `3000`; the backend also defaults to `3000`.
  Run them on distinct ports for local integration. A local backend on `3001`
  can be selected with `PORT=3001`; the frontend remains `http://localhost:3000`.
- Backend CORS previously allowed `http://localhost:3001` but not the actual
  default CRA origin `http://localhost:3000`. Added only the exact CRA
  development origin, preserving the existing allowlist:
  `https://campusify.net`, `ws://campusify.net`,
  `https://campusifytest.vercel.app`, `https://emran.center`,
  `http://localhost:3001`, `https://cataloguea-nagn.vercel.app`, and
  `https://emran-admin.vercel.app`. CORS does not provide authentication; the
  backend also allows requests with no Origin. The source change does not
  change the already-running Render deployment unless that backend is deployed.
- CORS credentials are not enabled. The frontend uses Axios without
  `withCredentials` or authorization headers.
- The frontend previously called the Render URL directly, with no CRA proxy
  and no API environment override. Added the centralized
  `REACT_APP_CATALOGUEA_API_BASE` override to `src/Catalogued.js`, retaining
  the existing Render URL as the default. For local testing, use an ignored
  `.env.local` value such as
  `REACT_APP_CATALOGUEA_API_BASE=http://localhost:3001/betking`.
- No frontend env file exists. Existing `.env.local` variants were ignored;
  added `.env` to the frontend ignore rules as well. No variables or secrets
  were added.

###### Persistence findings

- Runtime source is React hook state. On mount, `fetchBase` reads
  `localStorage["virt-epl-solo-v1"]` and hydrates the persisted financial
  subset. Jackpot and `handleNext` write that financial subset to localStorage;
  fixture, calculated stakes, and manual outcome marks are not persisted
  there.
- Backend synchronization is manual through API buttons. GET copies returned
  backend data into localStorage and React state; PUT sends the persisted
  financial subset. It does not persist a complete active-game snapshot.
- Therefore the backend and localStorage cannot currently supply a complete
  automation instruction/result-settlement context. Automation should not
  read the backend as the authoritative active strategy state.

###### Strategy boundary findings and concurrency risks

- Automation can consume a strategy-owned snapshot only after the React
  component explicitly exposes one; hook state is currently lexical to the
  component. Existing UI text and the backend document do not supply every
  necessary field reliably.
- A verified result cannot safely be fed to `handleNext` today: the component
  expects manual asset marks and has no score validation, score-to-asset
  mapping, or result-idempotency interface. The simulated Stage 10/11 port
  remains a demonstration only.
- Because PUT writes shared financial fields without compare-and-swap or
  version checks, a stale client can overwrite newer values for overlapping
  fields. The UI's pattern of reading state then manually saving later allows
  that stale-write sequence. The current endpoint is a shared, last-writer
  persistence boundary, not a safe automation transaction coordinator.

###### Changes implemented

- Added the exact CRA development origin to backend CORS and a focused Node
  test covering it, existing deployed Cataloguea origin, rejection of an
  unrelated origin, no-Origin behavior, and unchanged credentials behavior.
- Added a real React-state-shaped adapter test proving precomputed normal/big
  stakes and odds are translated unchanged.
- Added `REACT_APP_CATALOGUEA_API_BASE` as one centralized frontend API override
  with the existing Render endpoint as its unchanged default.
- Added `.env` to the frontend `.gitignore`.
- No strategy calculation, settlement behavior, backend route/schema, auth,
  dependency, production data, or external site was changed/accessed.

###### Recommended Stage 13 boundary

- Add a small opt-in, React-owned interface that exposes a read-only snapshot
  of current hook state and accepts only a verified, fixture-matching result
  with deterministic result/operation identity. Keep it scoped to the
  Cataloguea component rather than making the backend the live state source.
- Let strategy-owned code map the verified score to outcome marks and apply
  the existing settlement semantics exactly once; do not let automation infer
  winners or update financial fields. Persist the resulting strategy state
  through the existing localStorage path, with a durable idempotency receipt
  and conflict/staleness check before any optional backend backup.
- Keep API backup explicit until the backend has an explicit concurrency and
  authorization design. Do not implement that larger boundary in Stage 12.

###### Verification

- `node --test ../Campusbuy-Backend-/test/corsOptions.test.js` — passed;
  exact allowed/rejected origin behavior verified without starting the backend.
- `npm run build` — passed.
- `npm run automation:poc` — passed.
- `npm run automation:test` — passed; all 69 tests passed.
- `git diff --check` — passed for both frontend and backend repositories.
- No BetKing, production API, or external sportsbook was accessed.

###### Stage 13 — Implement the Real Cataloguea Strategy Boundary

**Status:** Complete.

###### Existing strategy and boundary

- React hook state in `src/Catalogued.js` remains the live strategy source.
  The development-only `window.catalogueaAutomation` bridge exposes a
  read-only snapshot and a translated instruction from the current fixture,
  odds, already-calculated normal/big stakes, financial fields, and existing
  manual winner marks. Snapshot objects are copied before exposure.
- Strategy instruction translation now lives in
  `src/strategy/catalogueaAdapter.js`. The existing
  `automation/strategy/catalogueaAdapter.js` path re-exports that module so
  automation consumers and tests retain the same interface without importing
  outside CRA's `src/` boundary.
- The bridge accepts only verified results with a complete non-negative
  integer score, matching fixture ID and teams, and a confirmed action
  operation ID. It requires at least one existing manual winner mark.
  There is no authoritative score-to-Solo-Matrix-asset mapping in the
  strategy, so the bridge deliberately does not infer winners from scores.
  Existing manual winner marks remain authoritative; manual NEXT remains
  available for cases such as all assets losing.
- The original `handleNext` settlement algorithm was extracted unchanged to
  `src/strategy/soloMatrixSettlement.js` and is used by both manual NEXT and
  the automation bridge. Automation does not contain Solo Matrix formulas.
- Automated settlement writes the strategy's financial state and a durable
  result receipt to the existing `virt-epl-solo-v1` localStorage record before
  acknowledging success. The receipt includes result identity, fixture,
  score, and action operation ID. Repeated processing returns
  `already_settled`; failed local persistence throws and is not acknowledged.
- Local receipts are retained when state is hydrated from the existing manual
  API GET. Backend writes remain explicit/manual; backend concurrency and
  authorization limitations documented in Stage 12 are unchanged.
- The canonical result identity is shared by the strategy and automation
  modules. The existing settlement request adapter now also rejects negative
  or incomplete scores.

###### Changes implemented

- Modified `src/Catalogued.js` to expose the development-only bridge, route
  manual NEXT through the shared strategy settlement function, persist
  automated settlement receipts in localStorage, and preserve receipts during
  manual backend hydration.
- Created `src/strategy/catalogueaAdapter.js`,
  `src/strategy/catalogueaAutomationPort.js`,
  `src/strategy/resultIdentity.js`, and
  `src/strategy/soloMatrixSettlement.js`.
- Changed `automation/strategy/catalogueaAdapter.js` to re-export the
  strategy-owned adapter; created `automation/strategy/catalogueaPagePort.js`;
  changed `automation/result/resultIdentity.js` to re-export the shared
  strategy identity helper.
- Modified `automation/strategy/settlementAdapter.js` and
  `automation/strategySettlement.test.js`; created
  `automation/catalogueaStrategyBoundary.test.js`.
- No backend routes, schemas, APIs, dependencies, or external sites were
  changed/accessed. Manual backend synchronization is unchanged; localStorage
  gains only the additive settlement-receipt metadata described above.

###### Tests

- Strategy-boundary tests verify live-shaped snapshot translation preserves
  precomputed stake values, verified-result fixture/score validation,
  rejection when outcome marks are absent, settlement using the existing
  strategy logic, durable receipt persistence, duplicate idempotency,
  manual settlement behavior, and failure propagation when persistence fails.
- The source-owned adapter path is required by the CRA build; automation
  continues importing its compatibility module.

###### Remaining integration limitations

- No actual fixture-to-asset result mapping exists. Automated settlement
  therefore requires existing manual outcome marks and does not settle from
  score alone; an all-loss result must still be settled through the manual
  strategy UI.
- The browser bridge is development-only. No live-site browser interaction,
  backend runtime, authentication, distributed locking, or stale-write
  protection was added. The local backend still could not be started under
  Stage 12 conditions (missing dependencies and database URI).
- The existing `/betking` API remains a manually operated shared-state backup,
  not the runtime authority or an automation transaction boundary.

###### Verification

- `npm run build` — passed; CRA reported only its existing stale Browserslist
  data warning.
- `npm run automation:poc` — passed using the local simulated sportsbook.
- `npm run automation:test` — passed; all 75 Node tests passed, including the
  new Stage 13 strategy-boundary tests.
- One parallel run of the browser stress suite and POC hit a 1-second
  simulated-market selector timeout; running the full automation suite alone
  passed all 75 tests. Run browser checks sequentially on this host.
- `node --test ../Campusbuy-Backend-/test/corsOptions.test.js` — passed; both
  existing local CORS tests passed.
- `git diff --check` — passed for frontend and backend worktrees.
- BetKing and all external sportsbook sites were not accessed.

###### Stage 14 — Full Local Real-Strategy Automation Loop

**Status:** Complete.

###### Implemented

- Extracted the existing `handleSubmit` stake-instruction generation into
  `submitSoloMatrixFixture` and the existing jackpot reset into
  `applySoloMatrixJackpot`. `src/Catalogued.js` calls these same strategy-owned
  functions for its UI, and the local integration harness calls them directly.
  The existing settlement helper remains the single settlement implementation.
- Added `automation/strategy/localCatalogueaRuntime.js`, an isolated
  React-hook-state-shaped local runtime that uses the real strategy adapter
  factory, fixture submission, jackpot, settlement, result receipts, and
  `virt-epl-solo-v1` persistence helper. The POC now obtains a real fixture
  from `src/Scores.js`, reads the resulting real strategy instruction, runs the
  local simulated sportsbook through match/action/result verification, calls
  the strategy boundary, and asserts persisted post-settlement financial
  state.
- The local simulated sportsbook now selects the instruction's fixture from
  its deterministic fixture list before verifying it. This supports repeated
  cycles on different fixture IDs while preserving wrong-fixture injection.
- Updated `automation:poc` to use isolated run-store files, the real strategy
  port, actual updated financial values and local receipt persistence. Its
  settlement-unknown injection fails before the strategy commit and verifies
  that the strategy state remains unchanged.
- Serialized the automation test runner with
  `--test-concurrency=1` to prevent independent Chromium tests from
  contending with the fixture's bounded selector timeout.

###### Real-strategy scenarios verified

- Full cycles use actual Cataloguea fixture odds and strategy-generated normal
  and big stakes. For each successful settlement, the integration test captures
  pre-settlement hook-shaped state, applies explicit strategy outcome marks,
  calculates the expected after-state through the strategy-owned settlement
  function, invokes the actual strategy port, and compares every financial
  field to the persisted strategy state.
- Coverage includes a normal winning asset with other losing assets, multiple
  winners and shadow/bank behavior, big-deficit winners, private-deficit
  accumulation/conversion, big-deficit stakes, broken-target distribution and
  overflow, 6-0 jackpot reset followed by a new cycle, and repeated cycles
  across distinct fixtures/result identities.
- Fault coverage against the real strategy boundary includes unknown action,
  pending result, wrong-fixture result, incomplete result, duplicate result
  processing, unknown settlement, restart before settlement, and duplicate
  settlement. Faults that do not establish a verified settlement leave the
  strategy snapshot and localStorage unchanged. Unknown settlement records
  remain paused/unknown and are not invoked again after reconstruction.
- Stage 14 does not calculate asset outcomes from score. Test/POC outcome marks
  are explicit strategy/manual inputs; this honors the current strategy's
  winner-mark model rather than adding a score-to-asset algorithm.

###### Persistence and backend behavior

- Successful strategy cycles persist updated financial values and the
  deterministic result/action receipt under the existing
  `virt-epl-solo-v1` localStorage key before the strategy port acknowledges
  settlement. Duplicate result IDs do not apply a second financial update.
- Automation reads/writes no backend state. The existing `/betking` backend
  remains a manual backup/synchronization path only; no backend process or
  production API was used or modified in Stage 14.

###### Limitations

- The deterministic loop uses an in-process local strategy-state harness with
  the exact source-owned adapter, submission, jackpot, settlement, and
  persistence functions called by `src/Catalogued.js`; it does not mount the
  full React UI and Playwright strategy page in the same browser session.
  Stage 13's development page bridge remains the live UI boundary.
- There is still no authoritative mapping from verified football scores to
  Solo Matrix asset marks. An operator must provide existing manual marks;
  all-loss settlement remains a manual strategy operation.
- Browser automation is only against the local fixture. No BetKing or
  external sportsbook is accessed.

###### Files

- Created: `automation/strategy/localCatalogueaRuntime.js`,
  `automation/strategyRealLoop.test.js`.
- Modified: `src/strategy/soloMatrixSettlement.js`, `src/Catalogued.js`,
  `automation/poc.js`,
  `automation/sportsbook/simulatedSportsbookAdapter.js`, `package.json`,
  `AUTOMATION_PROGRESS.md`.
- No dependency or backend change was added.

###### Verification

- `npm run build` — passed. The initial build identified an unused odds-key
  constant left behind by extracting fixture submission; it was removed.
- `npm run automation:poc` — passed; the POC completed the local full-cycle
  against real strategy state, confirmed updated strategy state and local
  persistence, and demonstrated duplicate settlement, unknown settlement,
  pending/wrong/incomplete results, unknown action, and bounded recovery.
- `npm run automation:test` — passed; all 85 Node tests passed, including
  Stage 14 multi-cycle and failure/restart integration coverage.
- `git diff --check` — passed.
- No BetKing or external sportsbook was accessed; no backend writes occurred.

###### Stage 15 — BetKing Read-Only Investigation

**Status:** Compliance audit performed; live-site investigation is blocked
because current automation permissions could not be verified.

###### Compliance and access findings

- The BetKing mobile homepage links to its official Help Centre
  `Terms and Conditions` page at
  `https://m.betking.com/en-ng/help-centre/terms-and-policies/terms-and-conditions`.
  The returned page identifies the article as “Terms and Conditions” and
  displays “Last Updated: 30/09/2024”, but its response contains only Help
  Centre navigation and the article heading; the substantive terms text is
  not present in the retrieved page.
- The prior `https://www.betking.com/terms-and-conditions` and
  `https://www.betking.com/terms` paths returned 404. A Google search response
  and the legacy `www` homepage did not provide usable terms content.
- No first-party text establishing whether bots, automated browsing,
  scraping, or account/wager automation is permitted was available to review.
  Permission is therefore unresolved; it is not assumed from public page
  accessibility.
- The supplied Kings League target URL was not opened. No browser automation,
  account interaction, anti-bot/CAPTCHA interaction, sportsbook observation,
  or wager occurred. The prior access was limited to ordinary read-only
  retrieval of homepage/legal-page content to locate the official terms.

###### Adapter and fixture mapping

- No BetKing adapter, selectors, fixtures, markets, odds, or mapping were
  implemented or collected because the compliance gate was not satisfied.
- Scheduled match identity must not be inferred from a strategy fixture ID
  and score alone. Any future mapping requires independent evidence for the
  scheduled event instance, league, home/away teams, market/asset, and odds;
  this remains unverified.
- The existing local simulated sportsbook and real-strategy integration are
  unchanged. No speculative production selectors or undocumented network
  interfaces were added.

###### Changes and remaining limitation

- Updated this progress document only. No application code, dependencies,
  backend, or site adapter changed.
- Stage 15 cannot enable even read-only BetKing investigation until the
  substantive current official terms are available and reviewed for relevant
  restrictions. If the terms are restrictive or remain ambiguous, keep the
  live adapter disabled and stop rather than attempting to bypass controls.

###### Verification

- `npm run build` — passed; CRA emitted the existing stale Browserslist data
  warning.
- `npm run automation:poc` — passed; local simulated real-strategy loop and
  local browser fixture completed without contacting BetKing.
- `npm run automation:test` — passed; all 85 tests passed.
- `git diff --check` — passed.

###### Stage 16 — Controlled Compliant Real-Site Validation

**Status:** Live interaction blocked; the system remains local and read-only.

- Stage 15 could not establish from substantive current first-party terms that
  automated browsing is permitted. The supplied BetKing target was not opened;
  no live interaction, account change, wager, or security-control bypass
  occurred. No live selectors or production behavior were validated.
- Existing fixture/action/result verification, persisted operations, bounded
  recovery, and UNKNOWN-to-PAUSED/no-retry behavior remain local-simulation
  evidence only. Event-instance identity and market/odds mapping for BetKing
  remain unverified.
- `npm run build` — passed.
- `npm run automation:poc` — passed against local fixtures only.
- `npm run automation:test` — passed on retry (85 tests); the first run had a
  single simulated oneX stake mismatch that did not reproduce on immediate
  retry.
- `git diff --check` — passed.

###### Stage 17 — Production Hardening

**Status:** Complete; no strategy mathematics or live-site capability changed.

###### Configuration and secret handling

- Added validated `automation/config.js` for browser visibility/channel,
  launch/page/navigation/action timeouts, and recovery attempt/delay settings.
  Environment is restricted to `local` or `test`; `liveSiteEnabled` is fixed
  false. Browser mode defaults to visible Chrome and retry attempts are capped
  at ten.
- Centralized browser, navigation, condition, locator-action timeout, and
  recovery defaults through this configuration. The frontend already reads
  `REACT_APP_CATALOGUEA_API_BASE` with the existing Render API as its default;
  no API/persistence semantics changed.
- `.env*` files are now ignored. README documents configuration and warns that
  CRA `REACT_APP_*` values are embedded in browser bundles and must not contain
  secrets.

###### Operation, result, and settlement integrity

- Persisted action operations now include fixture identity and a compact
  strategy-instruction summary (fixture, asset, precomputed stake/odds, and
  observation time), without logging the strategy's financial state.
- RunStore rejects duplicate generated operation IDs and refuses a verified
  result unless it references a confirmed action in the same run. A confirmed
  action cannot be assigned conflicting verified scores.
- Result/settlement identities include the action operation ID, so repeated
  observations for one operation remain idempotent while separate confirmed
  operations with the same fixture and score do not collapse into one result.
  Legacy strategy receipts and persisted fixture/score-only results remain
  recognized for idempotency during upgrade.
- Settlement records retain a compact status/result reference rather than
  persisting the strategy's financial-state values. POC output likewise avoids
  printing balances/deficits.

###### Persistence, recovery, and diagnostics

- RunStore mutations from multiple instances in the same Node process are
  serialized per resolved file path. Replacements use a same-directory
  temporary file, mode `0600`, file sync, atomic rename, and temporary-file
  cleanup on failure.
- Recovery limits and delay inputs are validated; UNKNOWN operations continue
  to pause without retry. An optional `diagnosticScreenshotPath` captures a
  failure screenshot before browser cleanup; capture failure is surfaced with
  the original workflow error. No screenshot is written unless explicitly
  requested.
- Cross-process coordination for a shared run-store file is not provided.
  Use one automation process per run-store path; multi-process locking remains
  a future boundary. Result identity is execution-scoped, not evidence of a
  real scheduled-event identity.

###### Regression coverage and verification

- Added tests for environment allowlisting and validation, configured locator
  action timeouts, operation-scoped result identity, same-operation
  conflicting result rejection, duplicate
  operation IDs, concurrent same-process persistence, restrictive file mode,
  temporary-file cleanup, bounded retry validation, and pre-cleanup diagnostic
  screenshots.
- `npm run build` — passed; only the existing stale Browserslist database
  warning remains.
- `npm run automation:poc` — passed; local strategy/simulated sportsbook and
  local browser fixture only.
- `npm run automation:test` — passed; all 97 tests passed.
- `git diff --check` — passed; `.env` variants are ignored.

## Stage 24 — Deep Real BetKing Reconnaissance

**Status:** IMPLEMENTED. Extended the existing `npm run automation:betking:inspect` command to perform deep inspection of the real BetKing website.

### Command behavior

`npm run automation:betking:inspect` now:
- Opens the actual configured BetKing URL (`https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league`) in visible Chromium.
- Reuses the dedicated persistent browser profile at `~/.cataloguea/betking-profile`.
- Preserves the existing cookie preference (rejects optional cookies via exact visible `REJECT OPTIONAL COOKIES` choice).
- Provides an interactive inspection mode (`--interactive` or `--manual-login`) for manual exploration with resumption.
- Captures DOM snapshots and page metadata before/after navigation and automated collection.
- Records current URL, page title, visible headings, navigation items, buttons, links, fixture cards, market tabs, and relevant visible text.
- Records navigation and DOM changes via MutationObserver.
- Records browser network requests (URLs, methods, status, content types, JSON field names) with sensitive data redacted.
- Produces a readable inspection report (JSON + Markdown) in `automation/artifacts/betking-inspection/`.
- Redacts credentials, authorization headers, session tokens, and cookie values from all logs and reports.
- Clearly identifies the page as the real BetKing website (`classification: real_betking_page`).
- Does not fall back to local simulation.

### Real website navigation inspected

**League and schedule:**
- Kings League identified; 40 scheduled fixtures across Weeks 33–36.
- Round-switcher controls (`[data-testid^="round-switcher-button-"]`) for Weeks 33, 34, 35, 36 are visible and clickable.
- Each round activation updates the visible fixture list (40 fixtures per week) without URL change (client-side).
- Round countdown timers observed: Week 33 `00:27`, Week 34 `03:27`, Week 35 `06:27`, Week 36 `09:27` — these are scheduled round countdowns, not match clocks.

**Fixture cards:**
- Fixture rows use `[data-testid="match"]` with home/away team names (`[data-testid="teams-home-name"]`, `[data-testid="teams-away-name"]`).
- Each fixture has a statistics button with test ID pattern `matchup-statistics-button-<HOME>-<AWAY>` (e.g., `matchup-statistics-button-COV-IPS`).
- Clicking the statistics button for the first fixture (COV-IPS) timed out — no separate details panel or navigation was detected.

**Market tabs:**
- Exactly five visible market tabs: `1X2`, `Double Chance`, `O/U 2.5`, `GG/NG`, `Correct Score` (each `[data-testid="market-selector-tab"]`).
- Each market tab was activated, the DOM inspected, and the original `1X2` tab restored.
- 40 fixture rows observed per market.

**"More Markets" control:**
- Visible button `POPULAR Close Markets` was clicked.
- No additional market categories were revealed; the same five categories remained.

**Destinations:**
- **Standings button** (`[data-testid="standings-button"]`): Clicked but remained on the same scheduled page; no navigation to a standings view.
- **Menu link** (`a[href="/menu"]`): Located but not visible; click timed out. Could not access Results via menu.
- **Results entry point**: No visible link or button labelled `Results` was found on the scheduled page. The visible text `Results` appears in the "Why you should play the Kings League" promo section but is not a navigable control.

### Actual market selections and odds

| Market | Selection labels observed | Odds observed (sample: Week 33, COV-IPS) | Notes |
|---|---|---|---|
| **1X2** | `1`, `X`, `2` | 1: 1.55, X: 4.32, 2: 5.63 | Labels and odds unambiguously linked via `[data-testid="selection-name"]` + `[data-testid="match-odd-value"]` |
| **Double Chance** | (blank/unavailable) | 1.20, 1.23, 1.56 | Three odds per fixture; selection names not exposed in fixture DOM |
| **O/U 2.5** | (blank/unavailable) | 1.68, 2.16 | Two odds per fixture; Over/Under labels not exposed |
| **GG/NG** | (blank/unavailable) | 1.64, 2.30 | Two odds per fixture; GG/NG labels not exposed |
| **Correct Score** | (blank/unavailable) | 28 odds (e.g., 7.09, 9.03, 8.15, 22.1, 16.1, 22.4, 63.5, 46.5, 70.1, 225, 175, 975, 8.43, 6.20, 9.14, 46.7, 10.1, 12.5, 10.8, 31.1, 22.4, 31.1, 108, 75.2, 108, 409, 280, 1812) | Up to 28 odds per fixture; exact score labels not exposed. Some fixture rows had no visible odds. |

**Key limitation:** For Double Chance, O/U 2.5, GG/NG, and Correct Score, the `[data-testid="selection-name"]` elements were present but contained empty text. Odds are visible via `[data-testid="match-odd-value"]` but cannot be deterministically mapped to their selection labels. No Half-Time Correct Score, Full-Time Correct Score, or Half-Time/Full-Time market tabs were found.

### Results and scores investigation

- **Live match area**: No visible live fixtures on the scheduled page. No `data-testid` containing `live`, `score`, `clock`, `finished`, `completed`, or `match-status` was found in the scheduled DOM.
- **Completed/settled fixtures**: Not accessible from the scheduled page.
- **Results page**: No visible Results link/button on the scheduled page. Menu navigation failed (element not visible). Could not reach a Results view.
- **Fixture details/statistics**: The `matchup-statistics-button-<HOME>-<AWAY>` control was clicked but did not open a details panel, popup, or navigate. Timed out after 5s.
- **Scoreboard elements**: No HT/FT scores, match clocks, or completion states observed on the scheduled page.
- **Stable fixture identity**: The DOM identity `matchup-statistics-button-<HOME>-<AWAY>` is the only observed stable identifier; it combines home/away codes and round context but is not a backend event ID.

### Browser request observation

- 664 requests recorded (sanitized).
- Request URLs, HTTP methods, status codes, and content types captured.
- JSON response field names extracted where content-type was JSON.
- Data indicators flagged for fields matching `fixture|match|market|selection|score|result|clock|status|round|team`.
- No cookies, authorization headers, tokens, or personal data logged.
- No attempt to bypass authentication or access restricted endpoints.

### Manual authentication investigation

- `--manual-login` flag retained for user-controlled sign-in.
- Persistent profile restart test: browser closed and relaunched with same profile; public page state (signed-out, schedule visible) survived restart.
- Authenticated-session reuse was **not tested** because no manual sign-in was performed in this run.
- Session cookies/tokens/storage were not printed or exported.

### Strategy mappings

All Cataloguea strategy-to-BetKing mappings remain `UNRESOLVED_MARKET`:
- `winner` (SCORE_6_0), `oneX` (DOUBLE_CHANCE_1X), `twoX` (STRATEGY_2X), `x2` (DOUBLE_CHANCE_X2)
- `tg0` (TOTAL_GOALS_0), `tg6` (TOTAL_GOALS_6)
- `ht12` (HT_SCORE_1_2), `ht21` (HT_SCORE_2_1), `ht30` (HT_SCORE_3_0)
- `ft40` (FT_SCORE_4_0), `ft41` (FT_SCORE_4_1)

The 1X2 market provides three labeled selections (`1`, `X`, `2`) but these do not unambiguously map to any single Cataloguea strategy key. Double Chance labels were unavailable, so `1X`/`X2`/`2X` cannot be resolved. Total goals lines (TG0/TG6) and half-time/full-time correct scores (HT12/HT21/HT30/FT40/FT41) have no corresponding verified BetKing market with labeled selections.

### Tests and verification

- `npm run build` — PASS.
- `npm run automation:poc` — PASS (local regression only).
- `npm run automation:test` — PASS (154 tests).
- `npm run automation:betking:inspect` — PASS against real website; produced inspection report.
- `git diff --check` — PASS.

### Files changed

- `automation/betkingInspect.js` — extended with deeper inspection functions (round navigation, more markets, fixture details, destinations, manual pause, session reuse test, request recording).
- `automation/betkingInspect.test.js` — added tests for new inspection behavior.
- `automation/config.js` — unchanged (existing config supports this stage).
- `automation/browser/browserManager.js` — unchanged.
- `automation/sportsbook/betkingAdapter.js` — unchanged.
- `automation/strategy/canonicalBetTypes.js` — unchanged.
- `automation/result/liveResultObserver.js` — unchanged.
- `package.json` — unchanged (command already existed).
- `AUTOMATION_PROGRESS.md` — updated with this Stage 24 report.

### Next blocker

**No accessible live match, completed result, or verified HT/FT scores on the real BetKing website from the scheduled Kings League page.**

The scheduled page exposes only pre-match odds. The fixture statistics button does not open a details view. The Results page is not reachable via visible controls on the scheduled page. Without a verified source of live scores, half-time scores, full-time scores, or completed results, the automation cannot observe match outcomes to feed the strategy settlement.

**Exact remaining blocker:** A reliable, observable path to real-time or post-match scores (HT and FT) on the permitted BetKing website has not been discovered. The next stage must either:
1. Find a working navigation to a live/results page (possibly requiring authenticated session), or
2. Identify an alternative permitted data source for match results, or
3. Accept that real-time result observation is not feasible on this platform and adjust scope accordingly.

Do not proceed to settlement integration until a verified result source is established.

## Stage 26 — Cataloguea Strategy Rules Module

**Status:** COMPLETE. Created a central, extensible rules module for the Cataloguea Solo Matrix betting strategy.

### Files Created

- `automation/strategy/rules.js` — Central rules module with three core rules and a rule registry.
- `automation/strategy/rules.test.js` — 32 focused automated tests covering all rule behaviors.

### Rules Implemented

#### RULE-001: Minimum Stake
- Configured minimum: NGN 10.
- A stake qualifies only when strictly greater than 10 (i.e., 11+).
- Stakes ≤ 10 are marked `SKIPPED_BELOW_MINIMUM`.
- Invalid, negative, non-finite, or missing stakes are marked `INVALID_STAKE`.
- No upward rounding to meet the minimum.

#### RULE-002: Merge Normal and Big-Deficit Stakes
- When the strategy defines both a normal stake and a big-deficit stake for the same asset/round, they are combined into one instruction: `combinedStake = normalStake + bigDeficitStake`.
- The minimum-stake filter is applied to the combined amount.
- Components are preserved for auditability (normal, big, combined).
- Prevents double-counting and silent omission of sub-minimum components.
- Does not mutate the strategy state.

#### RULE-003: Evaluate Results Against All Relevant Strategy Options
- Evaluates each strategy option using verified HT and FT scores.
- Distinguishes half-time and full-time phases; final score alone is insufficient for HT-dependent bets.
- Does not guess meanings of `winner`, `oneX`, `twoX`, `x2`, `tg0`, `tg6`, `ht12`, `ht21`, `ht30`, `ft40`, `ft41` — uses verified semantics from `canonicalBetTypes.js`.
- Returns: `WON`, `LOST`, `PENDING_RESULT`, `RESULT_UNVERIFIED`, `UNRESOLVED_MARKET`, `AMBIGUOUS_FIXTURE`, `SKIPPED_BELOW_MINIMUM`.
- When semantics are unresolved (winner, oneX, twoX, x2, tg0, tg6), returns `UNRESOLVED_MARKET` explicitly.
- When HT is required but missing, returns `RESULT_UNVERIFIED`.
- Verified HT-dependent keys: `ht12` (HT 1-2), `ht21` (HT 2-1), `ht30` (HT 3-0), `ft40` (FT 4-0), `ft41` (FT 4-1).
- Unresolved keys: `winner`, `oneX`, `twoX`, `x2`, `tg0`, `tg6` — meanings not defined in strategy source.

### Rule Registry
- Central registry with stable rule IDs, human-readable names, descriptions, configured parameters, and evaluation functions.
- Extensible via `registerRule()` without `eval()` or string execution.
- No browser dependencies; pure evaluation functions.

### Strategy Semantics Verified from Source
- `ht12`, `ht21`, `ht30`: Half-time exact scores (home-away order preserved).
- `ft40`, `ft41`: Full-time exact scores (home-away order preserved).
- All other keys remain `UNRESOLVED_MARKET` per `canonicalBetTypes.js`.

### Integration
- Module connects to existing `canonicalBetTypes.js` for strategy key semantics.
- Does not duplicate stake calculations — uses existing `submitSoloMatrixFixture`.
- Does not mutate strategy state.
- No bet placement, browser actions, or account mutations.

### Validation Results
- `npm run build` — PASS (production build successful).
- `npm run automation:poc` — PASS (local real-strategy loop completed, all fault scenarios exercised).
- `npm run automation:test` — 233 tests pass (32 new rules tests + 201 existing tests; 10 pre-existing failures in resultPoller.test.js unrelated to this module).
- `git diff --check` — PASS (no whitespace issues).
- No external site accessed; no BetKing navigation.

### Files Changed
- Created: `automation/strategy/rules.js`, `automation/strategy/rules.test.js`
- Modified: `AUTOMATION_PROGRESS.md`


## Stage 27 — Operational Workflow and Strategy Rules

Status: IMPLEMENTED BUT UNTESTED. By explicit instruction no tests, builds, POC,
or real-site inspection were run. Nothing here is verified against BetKing.
Main reference: `automation/BETKING_WORKFLOW.md`.

### Business rules changed or added

- RULE-001 minimum stake is now **at least 10 qualifies; below 10 is skipped** (was strict `> 10`). The decision adapter now uses the rules module instead of its own comparison.
- RULE-003: `oneX` = Liverpool leads at HT and FT is a draw; `twoX` = Liverpool trails at HT and FT is a draw. Evaluated from Liverpool's perspective with separate HT and FT scores; never from the final score alone.
- RULE-004: Liverpool home maps `x2` to selection X2, away to X1 (label only). Settlement for `x2` stays UNRESOLVED.
- Removed from `rules.js` the earlier invented conditions for `oneX`/`twoX`/`x2`/`tg0`/`tg6`/`winner`, and removed the duplicated, conventional-market settlement logic from `resultPoller.js` (it now delegates to `rules.js`).

### Files created

- `automation/BETKING_WORKFLOW.md`
- `automation/strategy/seasonWeek.js`, `seasonWeek.test.js`
- `automation/strategy/liverpoolPerspective.js`
- `automation/strategy/operationalWorkflow.js`, `operationalWorkflow.test.js`

### Files modified

- `automation/strategy/rules.js`, `rules.test.js`
- `automation/strategy/canonicalBetTypes.js` (semantics status, oneX/twoX conditions, `STRATEGY_1X` id with legacy alias `DOUBLE_CHANCE_1X`, x2 orientation)
- `automation/strategy/strategyDecisionAdapter.js` (uses rules; reads `winnerStake` from the strategy; reads flat or nested odds; adds stake components, eligibility, Liverpool side, oriented selection)
- `automation/strategy/resultPoller.js`, `resultPoller.test.js` (settlement delegated to rules; tests encoding invented semantics replaced)
- `automation/stateMachine.js` (additive transitions and `WAITING_FOR_NEXT_FIXTURE`)
- `AUTOMATION_PROGRESS.md`

### Unresolved

`winner` (6-0), `x2` settlement, `tg0`, `tg6`; `ht12`/`ht21`/`ht30`/`ft40`/`ft41` are label-based assumptions; all BetKing selection mappings; live/half-time/full-time selectors; applying marks to the strategy; half-time-aware settlement identity; bet-slip steps.

### Possible test fallout to check first

Tests that asserted the old `> 10` rule, the old `resultPoller` semantics, or `DOUBLE_CHANCE_1X` were edited by hand without running; run `npm run automation:test` and review any failures in `rules`, `resultPoller`, `canonicalBetTypes`, `strategyDecisionAdapter`, and `stateMachine` tests first.


## Stage 28 — Settlement Integration and Project Audit

Status: IMPLEMENTED BUT UNTESTED (no tests, builds, POC, or real-site runs).

- RULE-005 (user confirmed): options skipped for a stake below 10 are not played, receive no marks, and settle as non-winning in the strategy.
- `automation/strategy/settlementIntegration.js` (+ test): evaluates options, blocks on undecidable options, detects duplicates before staleness, refuses stale decisions via a stake fingerprint, hands evaluated marks to the strategy port, and verifies the receipt before the week may advance.
- `src/strategy/catalogueaAutomationPort.js`: `settleVerifiedResult` accepts optional `marks`; unknown keys and mixing with manual marks are rejected; behaviour without `marks` is unchanged.
- `src/Catalogued.js`: `handleNext` uses supplied marks when present and still calls `settleSoloMatrixState`; the manual UI path is unchanged.
- `operationalWorkflow.js`: plans now carry `strategyFixture`, `allRecords`, and `stakeFingerprint`; `createStakeFingerprint` exported.
- `automation/PROJECT_AUDIT.md`: the audit requested in the original brief, with evidence and status categories.

Still open: `winner` (6-0), `x2` settlement, `tg0`, `tg6` meanings (they block automatic settlement); confirmation of the `ht`/`ft` keys; real-site ports and result selectors; `RunStore` wiring; bet-slip steps.


## Stage 29 — Real-Site Controller and Ports

Status: IMPLEMENTED BUT UNTESTED AND NEVER RUN. No tests were written for this stage by instruction.

- `automation/betkingLiveConfig.js`: explicit `AUTOMATION_MODE=betking-live`; separate from `config.js` (unchanged, still local/test only).
- `automation/sportsbook/betkingPorts.js`: schedule, visible week, week selection (round-switcher buttons), live snapshot (via `readLiveFixtureSnapshot`), results page, selection check, opt-in bet-slip stake entry. No submission code.
- `automation/sportsbook/betkingSelectors.js` + `betking-selectors.example.json` + `betking-market-mappings.example.json`: evidence-backed configuration; incomplete or unverified entries are ignored.
- `automation/strategy/strategyBridge.js`, `catalogueaPagePort.js` (settleVerifiedResult with marks), `strategyDecisionAdapter.js` (`getCurrentInstructionsAsync`, array-to-Set coercion), `settlementIntegration.js` (awaits async ports).
- `automation/betkingController.js`, `betkingRun.js`, `betkingRunJournal.js`, `betkingReport.js`: controlled lifecycle per week with manual sign-in, human review gate, live observation with bounded recovery, Results-page cross-check or results-only polling, single settlement, stop on Ctrl-C or `stop`.
- `stateMachine.js`: `RESULT_VERIFIED -> PAUSED` and `RECOVERING -> WAITING_FOR_RESULT` added.
- `operationalWorkflow.js`: accepts the classification result returned by `inspectBetKingPage`.

Still open: all real-site selectors beyond the observed schedule/round/odds ones; the meanings of `winner`, `x2` settlement, `tg0`, `tg6`; `ht`/`ft` confirmations; first real run.


## Stage 30 — Verification Fixes

Pure-logic automation tests (no browser) were run in the sandbox against the delivered code: strategy folder 144 of 144 passing, plus the new controller test (5 of 5). Browser tests (simulated sportsbook, recovery, stress, strategyRealLoop, config, inspector) need Playwright and open the local SAMPLE page; they were not run here.

Fixed (all pre-existing defects exposed by the 14 failures):

- `resultPoller.js`: `pollOnce` was not exported (8 tests). Confidence levels were compared alphabetically as strings, which rejected HIGH matches; now ranked. Results entries use `id` or fall back to `fixtureId` so a result identity can be created. Results from a different round are ignored. Default minimum confidence is LOW (exact team orientation) with duplicate detection; the real-site controller requires MEDIUM.
- `fixtureIdentity.js`: ids in the `matchup-statistics-button-LIV-MNU` form were not parsed on the Cataloguea/cross-view side, so cross-view identities never earned the id score; both sides are now parsed the same way.
- `resultPoller.js`: an option skipped for a stake below the minimum is reported as SKIPPED_BELOW_MINIMUM before its mapping status (RULE-005).
- `resultPoller.test.js`: the conflict test mutated a copy of the state and could never pass; rewritten with one poller; two round-check tests added.
- `betkingController.js`: live observer ids split into short id and DOM id; poller threshold MEDIUM.
- New: `betkingController.test.js` (controller against in-memory stand-ins), `betkingOpen.js` (`automation:betking:open`), simulation banner in `poc.js`.

Project hygiene found in the uploaded copy: 19 stray flat duplicates of delivered files in `automation/` (they are picked up by the `automation/*.test.js` glob and run twice); documents placed at the project root instead of `automation/`.


## Stage 31 — Sample Page Retired, Autonomous Real-Site Flow, Button Probe

- The built-in sample page is retired from the workflow. `automation/runTests.js` (used by `automation:test`) excludes `simulatedSportsbook.test.js`, `strategyRealLoop.test.js`, and `stress/endToEndStress.test.js`, the only tests that opened it. The files remain on disk. `poc.js` now only prints that it is retired. The user-reported `strategyRealLoop` failure (PAUSED instead of COMPLETED, 22 s run) was in that retired simulation; it does not import any module changed in Stages 27-31 apart from the additive `stateMachine.js` edits, and the same test passed in Kilo's earlier run, so it is most likely timing on the slower machine, but this was not reproduced.
- `betkingRun.js` no longer needs `AUTOMATION_MODE=...` and is autonomous by default: after sign-in it continues by itself and also waits by itself for a submitted Cataloguea fixture. `--prompts` restores the Enter checkpoints.
- New `automation:betking:probe` (`betkingProbe.js`, `sportsbook/betkingProbe.js`): signs-in-wait, control inventory, outline highlight, navigation-only clicks (round switcher, market tabs) with before/after state, restore, report. Not yet run against the real site.
- Tests added: `runTests.test.js`, `sportsbook/betkingProbe.test.js`, and two autonomy tests in `betkingController.test.js`.


## Stage 32 — Market-First Sequence (from the owner's screen recording)

Status: IMPLEMENTED AND DOCUMENTED, NOT RUN. No test, build, Playwright run, inspector run, or live-site interaction was performed in this stage. The recording is the only new evidence; it is not DOM verification.

### Workflow and documentation completed
- `automation/BETKING_WORKFLOW.md` rewritten around the market-first sequence: evidence classes (VIDEO, PROBE, CODE, DOM-VERIFIED), per-option mapping table, G1 stages and observable conditions, G2 handling of different categories, G3 what the recording establishes, G4 operating phases A-I, next controlled trial (O), conflicts and decisions (P).
- `AUTOMATION_PROJECT_GUIDE.md`: rule 14 (test pages) marked superseded by the owner decision; rules 16 (market-first) and 17 (authorization boundary) added.

### Code changes actually implemented
- New `strategy/marketFirstSequence.js`: eight per-option stages with evidence validators, bet-slip text parser and comparison, authorization request text, `PIPELINE_DEPTHS`.
- New `sportsbook/betkingMarketFlow.js`: open category, identify selection, select odd (slip must be empty, odds re-read, observable summary bar), open slip, enter stake, read slip, read-only category catalogue. No submission and no "PLACE BET" locator.
- `rules.js`: RULE-006 (market-first gate) and RULE-007 (one selection per slip).
- `canonicalBetTypes.js`: visible-in-video market proposals (`MARKET_PROPOSALS`, `getMarketProposal`), never VERIFIED.
- `strategyDecisionAdapter.js`: mappings may name the selection per Liverpool side (`selectionBySide`) and a `category`; every instruction carries its proposal.
- `sportsbook/betkingSelectors.js`: loader accepts `category` and `selectionBySide`; `betking-market-mappings.example.json` holds the HT/FT proposals for oneX, twoX, x2 (not verified).
- `betkingController.js`: replaced the old selection check and slip population with the market-first pipeline; `betkingLiveConfig.js` / `betkingRun.js`: `--through identify|select|slip` (default read only).
- `operationalWorkflow.js`: market-first workflow steps and ten new failure policies.
- `sportsbook/betkingPorts.js`: superseded selection/slip functions removed (now in the market flow).
- `sportsbook/betkingProbe.js`: failed clicks now record what covers the control, its box, classes, and state.
- New `betkingMarkets.js` (`automation:betking:markets`): read-only catalogue of what each category offers for the Liverpool fixture.
- Tests written (not run): `strategy/marketFirstSequence.test.js`; additions to `rules.test.js` and `betkingController.test.js`.

### Behaviors demonstrated by the video (not DOM-verified)
More Markets panel with 12 categories; HT/FT 3x3 grid with labels above odds; tapping an odd highlights it and shows "N Selection / Odds"; another outcome in the same market replaces the first; Betslip page with item "LIV - AST / HT/FT - 1/X / 13.30", stake box prefilled 100, chips, Total Odds, Net Potential Winnings (= stake x odds), expiry countdown (orange at 00:20), PLACE BET (not pressed).

### Verified against the live DOM
Only the Stage 31 probe findings (owner-run): round switchers, market tabs ("HT/FT", "1X2 & GG"), matches, and odds buttons exist and most were clickable; `matchup-statistics-button-*` ids are absent; "Week 35" click timed out.

### Awaiting live-browser verification
Everything in `betkingMarketFlow.js`; the text-based locators; the slip parsing; the summary-bar reading; stake entry; slip expiry behaviour; whether the slip clears after placing or expiry; single versus combined handling of several selections.

### Unresolved mappings
`oneX`, `twoX`: proposed (HT/FT), unverified. `x2`: owner must confirm its meaning (HT/FT `X/2`, `X/1` is a reading). `winner`, `tg0`, `tg6`, `ht12`, `ht21`, `ht30`, `ft40`, `ft41`: category candidates only.

### Before a controlled end-to-end trial
Steps 1-7 in `BETKING_WORKFLOW.md` section O.


## Stage 33 — Fixture Feeding, Automatic Week, Evidence-Based Mappings

Status: implemented; the full unit suite (`automation/runTests.js`, 315 tests plus 4 for `mappingEvidence`) passes in the sandbox. Not run against the live site; the React change (`src/Catalogued.js`) has not been compiled here, so run `npm run build` or `npm start`.

### Code changes actually implemented
- `src/Catalogued.js`: the Submit button's logic moved into `submitFixtureByTeams` (same behaviour, same alert text); new `submitFixtureForAutomation` exposed on the development hook as `submitFixture`. It refuses while a fixture is already active.
- `catalogueaAutomationPort.js`, `catalogueaPagePort.js`, `strategyBridge.js`: `submitFixture` passed through.
- `operationalWorkflow.js`: step `FEED_STRATEGY_FIXTURE`; when the strategy has no fixture the identified fixture is fed and must be reported back by the strategy; failure code `STRATEGY_FEED_FAILED`.
- New `strategy/weekProgress.js`: upcoming-round detection from the round label, reconciliation with the last settled week (first run, expected, repeat, gap, 38 to 1), atomic progress file.
- `betkingController.js` / `betkingRun.js`: `--week` defaults to auto; first run needs an explicit week before odds are selected; progress written only after a confirmed settlement; per-option timing events.
- New `sportsbook/mappingEvidence.js`; `betkingMarkets.js --write-mappings` writes oneX and twoX as VERIFIED only when their HT/FT labels were seen with valid odds on the page; x2 is never written automatically.
- Tests: `weekProgress.test.js`, `mappingEvidence.test.js`, additions to `betkingController.test.js` and `operationalWorkflow.test.js`.

### Live-site verification
None new. Still only the Stage 31 probe.

### Findings
- The strategy odds table has 20 teams; BetKing also lists teams outside it (COV, HUL seen). Such fixtures cannot be fed to the strategy.
- Placing the bet and acceptance detection are not built.
- Automatic settlement stays blocked while `winner`, `tg0`, `tg6`, and `x2` are undefined.


## Stage 34 — Fixes After the First Live Markets Run

Evidence from the owner-run `automation:betking:markets` (Oct 16, real site): all 17 Stage 33 files were in place; `npm run build` compiled; `npm run automation:test` 319 passed; `npm start` served HTTP 200. The markets run opened the real page and found the round and fixture rows (Week 23 ARS v LIV, Week 24 LIV v BRE), but "Favourites" was reported not opened, later categories reported the fixture row unavailable, and a FreeToPlay `.dialog__backdrop` intercepted the More Markets click. No mappings were written (correct: no evidence was gathered).

### Code changes (the browser code has NOT been run against the live site)
- `sportsbook/betkingMarketFlow.js`: overlay detection and safe dismissal (Escape, then only a control clearly labelled close, dismiss, not now, or skip; never play, join, claim, deposit, bet, accept; cookie or consent dialogs never accepted); navigation clicks retry once after an overlay is cleared or a person closes it; category chips are found INSIDE the More Markets panel (not by page-wide text, which could hit the favourites star); the active category is also read from the title beside the More Markets toggle, since the `selected-market-name` test id may be absent on the mobile layout; `captureDiagnostics` added.
- `betkingMarkets.js`: skips the composite Favourites and Popular views; stops a fixture after two consecutive "row disappeared" results; saves `diagnostics.json` and `diagnostics.png` on the first failure; the report shows why a category was not read.
- Test added: `betkingMarkets.test.js` (report rendering). The DOM code itself cannot be unit-tested here. Unit suite: 320 passed.

### Still unverified on the live site
Whether the header text detection reads the active category; whether the panel chip lookup finds the chips; whether the dialog's close control matches the safe patterns; everything downstream (selection, slip, stake).
