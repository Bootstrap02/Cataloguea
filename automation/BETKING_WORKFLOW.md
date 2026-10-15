# Cataloguea BetKing Operational Workflow

Status: Stage 27-29 implementation. **Nothing in this document has been executed or
tested by the implementer** (no tests, builds, POC, or real-site inspection were
run). Real-site behaviour described as "observed" comes from earlier stages
(see `AUTOMATION_PROGRESS.md`, Stages 23-24) and must be re-verified.

## A. Purpose

Connect the existing Solo Matrix strategy (React app, `src/`) to the real BetKing
virtual football Kings League so that, for each game week, the workflow can:
identify the Liverpool fixture, read the strategy's stakes, decide which options
qualify, prepare auditable betting instructions, watch the match, evaluate each
option, settle the strategy exactly once, and move to the next week.

It does not place wagers. It does not replace any strategy formula.

## B. System architecture

| Piece | File | Role |
| --- | --- | --- |
| Strategy engine | `src/strategy/soloMatrixSettlement.js`, `src/Catalogued.js`, `src/Scores.js` | Source of truth for stakes and state. `submitSoloMatrixFixture` computes stakes; `settleSoloMatrixState` applies marks. |
| Persistence | `localStorage["virt-epl-solo-v1"]` (React app) | Runtime authority; backend is best-effort backup only. |
| Decision adapter | `automation/strategy/strategyDecisionAdapter.js` | Boundary between strategy and sportsbook. Calls the strategy, merges components (RULE-002), filters (RULE-001), attaches mapping status. |
| Rules | `automation/strategy/rules.js` | RULE-001 minimum stake, RULE-002 merge, RULE-003 per-option evaluation, RULE-004 Liverpool orientation, RULE-005 skipped options settle as non-winning. Single definition of option semantics. |
| Liverpool perspective | `automation/strategy/liverpoolPerspective.js` | Home/away to Liverpool/opponent conversion; X2/X1 orientation. |
| Season weeks | `automation/strategy/seasonWeek.js` | Weeks 1-38, rollover, alignment of required/visible/selected week. |
| Canonical mapping | `automation/strategy/canonicalBetTypes.js` | Strategy key to canonical type, semantics status, BetKing mapping status. |
| Fixture identity | `automation/strategy/fixtureIdentity.js` | Confidence scoring between strategy and BetKing fixtures. |
| Workflow | `automation/strategy/operationalWorkflow.js` | Step definitions, failure policies, planning functions, coordinator for steps 1-9 over injected ports. |
| State machine | `automation/stateMachine.js` | Existing machine, extended additively (see section G). |
| Settlement integration | `automation/strategy/settlementIntegration.js` | Evaluates options, checks duplicates and stale state, hands marks to the strategy port, verifies the receipt. |
| Real-site ports | `automation/sportsbook/betkingPorts.js`, `betkingSelectors.js` | Playwright implementations of schedule, week, live, results, selection-check, and (opt-in) bet-slip stake entry. No submission code exists. |
| Real-site controller | `automation/betkingController.js`, `betkingRun.js`, `betkingLiveConfig.js`, `betkingRunJournal.js`, `betkingReport.js` | One controlled lifecycle per week over the real site; explicit `AUTOMATION_MODE=betking-live`. |
| Strategy bridge | `automation/strategy/strategyBridge.js` | Reads stakes and settles through the strategy running in a browser tab (development hook). |
| Result handling | `automation/result/*`, `automation/strategy/resultPoller.js`, `settlementAdapter.js` | Result observation, bounded polling, settlement receipts. `resultPoller` now delegates option evaluation to `rules.js`. |
| BetKing adapter | `automation/sportsbook/betkingAdapter.js` | Read-only snapshot normalisation and page classification. |

## C. Strategy options

Keys: `winner`, `oneX`, `twoX`, `x2`, `tg0`, `tg6`, `ht12`, `ht21`, `ht30`, `ft40`, `ft41`.
The strategy source (`Catalogued.js`, `Scores.js`, `soloMatrixSettlement.js`) does
**not** define score conditions: winners are marked manually in the UI. Meanings
below come from the user's instructions (Stage 27) or are flagged.

| Key | Meaning | Status | Settlement condition |
| --- | --- | --- | --- |
| `oneX` | Liverpool leads at half time AND full time is a draw | USER_SPECIFIED | `HT_LIV > HT_OPP AND FT_LIV = FT_OPP` |
| `twoX` | Liverpool trails at half time AND full time is a draw | USER_SPECIFIED | `HT_LIV < HT_OPP AND FT_LIV = FT_OPP` |
| `x2` | Liverpool home: selection X2. Liverpool away: selection X1 | ORIENTATION_ONLY | **UNRESOLVED** (only the label is specified) |
| `winner` | "the 6-0 option" | UNRESOLVED | **UNRESOLVED** (exact score vs margin, whose perspective) |
| `tg0`, `tg6` | UI categories TG0 / TG6 | UNRESOLVED | **UNRESOLVED** |
| `ht12`, `ht21`, `ht30` | Half-time score in home-away order | ASSUMED_FROM_LABEL | Exact HT score match (earlier-stage assumption, unconfirmed, orientation unconfirmed) |
| `ft40`, `ft41` | Full-time score in home-away order | ASSUMED_FROM_LABEL | Exact FT score match (same caveats) |

`oneX`/`twoX` are never evaluated from the final score alone and never treated as
conventional Double Chance. There is no `x1` strategy key; `x1` exists only as
the oriented selection label for `x2` when Liverpool is away.

## D. Stake calculations

1. Stakes are produced by the existing `submitSoloMatrixFixture` (winner stake plus per-asset normal and big-deficit stakes). Automation does not restate or recompute the formulas; the adapter reads `winnerStake`, `gameStakes[key]`, `bigStakes[key]`.
2. RULE-002: for each option, `combined = normal + bigDeficit` (only components the strategy produced; never across options). Original components are kept in `stakeComponents`.
3. RULE-001: `combined < 10` is skipped; `10` and above qualifies. No rounding up. (This replaces the earlier strict `> 10` interpretation per the user's latest instruction.)
4. Order: calculate, merge, filter, then market mapping. A qualifying stake with an unresolved mapping is reported as `UNRESOLVED_MARKET`, not dropped.

RULE-005 (confirmed): a skipped option is not played, gets no marks, and the strategy's own settlement treats it as non-winning (loss of its stake) even if its condition would have been met.

Note: the strategy floors the winner stake at 10, so `winner` is always stake-eligible.

## E. Market mappings

All BetKing selection-level mappings remain **UNRESOLVED**. Observed market
categories (scheduled page, earlier stage): 1X2, Double Chance, O/U 2.5, GG/NG,
Correct Score. A category existing does not verify any mapping. Odds in
instruction records come from the strategy odds table (`oddsSource: STRATEGY_TABLE`),
not from BetKing.

## F. Fixture and week identification

- Required week: held by the workflow (the strategy state has no week field). Valid 1-38; Week 39 is invalid; 38 rolls over to 1.
- Three values are kept distinct: required (strategy side), visible (page), selected (confirmed by re-reading the page). They must agree.
- `identifyLiverpoolFixtureForWeek` finds the round whose label parses to the required week (position is never turned into a week number), then the single fixture where Liverpool is home or away. Zero fixtures, several fixtures, a duplicated week, or a missing week all stop processing; nothing switches week or picks one.
- Identity is checked twice: website-internal consistency (fixture id codes vs displayed teams) and strategy-vs-website match requiring HIGH confidence in the same home/away orientation.

## G. Operational workflow and state machine

`WORKFLOW_STEPS` in `operationalWorkflow.js` lists every conceptual step with its success, failure codes, and recovery, mapped onto the existing machine:

`OPEN_BETKING`, `VERIFY_PAGE_ACCESS` -> INITIALIZING; `WAIT_FOR_MANUAL_LOGIN_IF_REQUIRED` -> PAUSED; week and fixture steps -> OBSERVING / FINDING_MATCH / MATCH_VERIFICATION; strategy steps -> OBSERVING_STRATEGY; market and instruction steps -> STRATEGY_INSTRUCTION_READY / READY_FOR_ACTION; match steps -> WAITING_FOR_RESULT / RESULT_DETECTED / RESULT_VERIFIED; settlement -> SETTLING_STRATEGY / SETTLEMENT_CONFIRMED; next week -> WAITING_FOR_NEXT_FIXTURE.

Additive changes to `stateMachine.js` (no existing transition removed): new state `WAITING_FOR_NEXT_FIXTURE`; `MATCH_VERIFICATION -> OBSERVING_STRATEGY`; `STRATEGY_INSTRUCTION_READY -> READY_FOR_ACTION`; `READY_FOR_ACTION -> WAITING_FOR_RESULT | PAUSED`; `PAUSED -> RECOVERING`; `OBSERVING -> PAUSED`; `FINDING_MATCH -> RECOVERING | PAUSED`; `OBSERVING_STRATEGY -> PAUSED`; `WAITING_FOR_RESULT -> RECOVERING`; `SETTLEMENT_CONFIRMED -> WAITING_FOR_NEXT_FIXTURE`.

`createOperationalWorkflow({ stateMachine, ports }).prepareWeek({ requiredWeek })` runs steps 1-9 through ports (`readSchedule`, `readVisibleWeek`, `selectWeek`, `getStrategyInstructions`). It never returns simulated data on failure; a failing port yields a failure result and the policy-defined machine state.

Instruction lifecycle (never interchangeable): CALCULATED, ELIGIBLE, MARKET_RESOLVED, SELECTION_PREPARED, BET_SLIP_VERIFIED, SUBMITTED, ACCEPTED. This stage only ever reaches MARKET_RESOLVED.

## H. Half-time and full-time results

Scores are kept as separate `halfTime` and `fullTime` `{home, away}` objects and converted to Liverpool/opponent only in `liverpoolPerspective.js`. No live, half-time, or full-time selector has been verified on the real site. A half-time score is never inferred from the final score; a match is never assumed complete after ~30 seconds.

## I. Settlement

`settlePlannedFixture` (`settlementIntegration.js`):

1. `evaluateOptionsForResult` evaluates every stake-eligible option (RULE-003). Any undecidable option (today always `winner`, `x2`, `tg0`, `tg6`) or an unverified result returns `NOT_READY` and nothing is settled. Strategy outcomes are recorded separately from `executionStatus` (`NOT_VERIFIED`).
2. The result identity is built from the verified result plus an operation id derived from the persisted plan (`createOperationId`: week, strategy fixture id, plan observation time). If a receipt for that identity exists the answer is `ALREADY_SETTLED`; this check runs before the stale check.
3. Stale check: the stake fingerprint of the plan must equal the fingerprint of the strategy's current stakes, otherwise `STALE_STRATEGY_STATE` and nothing is applied.
4. The evaluated marks (`winners`, `bigWinners`; a merged bet that wins wins both components; skipped options get none) go to `strategyPort.settleVerifiedResult({ marks })`. The port validates them and refuses to combine them with manual marks. `Catalogued.js` `handleNext` then runs the strategy's own `settleSoloMatrixState` with those marks. Without `marks` the original manual-mark behaviour is unchanged.
5. Persistence is verified by finding the receipt in the strategy snapshot. If the port throws, a receipt still proves success (`recoveredAfterError`); otherwise the result is `SETTLEMENT_UNKNOWN` and the week cannot advance.

Half-time is stored as separate evidence in `result.halfTime`; the base result identity (`fixtureId:home-away`, plus `:op:` scope) is unchanged for compatibility.

## J. Persistence and recovery

Runtime authority stays `localStorage["virt-epl-solo-v1"]`; the settlement receipt list lives there. The Playwright browser cannot read the user's normal browser storage; the development-only `window.catalogueaAutomation` hook is the bridge. The coordinator calls an optional `onCheckpoint` per step; wiring it to `RunStore` is not done. Week advancement requires `settlementApplied` and `persistenceVerified` (`planNextWeek`).

## K. Failure handling

`FAILURE_POLICIES` defines primary and fallback actions for 28 failure codes (retry, wait, manual intervention, mark unresolved, stop fixture, resume from checkpoint, skip option, ignore duplicate, recalculate). Highlights: authentication required or expired session -> pause for manual login; ambiguous or missing Liverpool fixture, wrong or unavailable week, identity mismatch -> stop the fixture; unresolved mapping, missing odds or selection -> mark that option unresolved and continue with independent options; internet loss or browser crash -> resume from checkpoint after re-verifying page, week, and fixture; persistence failure -> pause and never advance the week. No failure falls back to simulated data.

## L. Commands (from `package.json`)

All work happens on the real BetKing Kings League scheduled page
(`https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league`). The built-in
sample sportsbook page is **retired**: no command opens it, `automation:poc` now only prints a
message, and its three browser test files are excluded from `automation:test`.

- `npm run automation:betking:open` - opens the real page (visible, persistent profile), prints what was read (classification, rounds, Liverpool fixtures) and waits for Enter. Read-only.
- `npm run automation:betking:probe` - opens the real page, waits for you to sign in (no Enter needed), then proves the platform's buttons can be used: outlines the round-switcher buttons and market tabs, clicks them (navigation only), records what changed, restores the view, and saves `probe.json` / `probe.md`. It never clicks odds, selections, or bet-slip controls. Cookie consent is never accepted automatically; if a banner blocks a click, dismiss it yourself in the window.
- `npm run automation:betking:run -- --week N [--max-weeks M] [--prompts]` - the real-site run. Sign in on the BetKing window; the run then continues by itself (it also waits by itself for a Liverpool fixture to be submitted in the Cataloguea tab). `--prompts` asks for Enter at the human checkpoints instead. It never submits a wager.
- `npm run automation:betking:inspect` (`-- --interactive` for manual login) - read-only inspection report.
- `npm run automation:test` - unit tests only (no sample page, no browser windows).
- Cataloguea must run with `npm start` (development build) so `window.catalogueaAutomation` exists; the run opens it in a second tab of the same browser.

Real-site configuration (all optional, all evidence-based):

- `~/.cataloguea/betking-selectors.json` (see `automation/betking-selectors.example.json`): live, results, and bet-slip selectors you verified. Incomplete sections are ignored and reported.
- `~/.cataloguea/betking-market-mappings.json` (see `automation/betking-market-mappings.example.json`): only entries marked `VERIFIED` with market, selection, and evidence are accepted; everything else stays `UNRESOLVED_MARKET`.
- Environment: `AUTOMATION_BETKING_URL`, `AUTOMATION_CATALOGUEA_URL` (default `http://localhost:3000`), `AUTOMATION_BETKING_PROFILE_DIR`, `AUTOMATION_BETKING_RUNS_DIR`, `AUTOMATION_POLL_INTERVAL_MS`, `AUTOMATION_LOGIN_WAIT_TIMEOUT_MS`, `AUTOMATION_STRATEGY_WAIT_TIMEOUT_MS`, `AUTOMATION_LIVE_INTERVAL_MS`, `AUTOMATION_MATCH_WAIT_TIMEOUT_MS`, `AUTOMATION_RESULTS_INITIAL_DELAY_MS`, `AUTOMATION_RESULTS_INTERVAL_MS`, `AUTOMATION_RESULTS_MAX_ATTEMPTS`, `AUTOMATION_RESULTS_CROSSCHECK_ATTEMPTS`, `AUTOMATION_MANUAL_LOGIN_MAX_ATTEMPTS`, `AUTOMATION_POPULATE_BET_SLIP=true` (opt-in stake entry in the slip; still no submission).

Run flow: launch, open both tabs, wait for sign-in, prepare the week (select week, identify Liverpool fixture, strategy stakes, merge, filter, mappings, selection check), write `week-N-instructions.md` and `week-N-plan.json` to the run directory, watch the live match, cross-check with the Results page when configured, evaluate, settle once, persist-check, report the next week. Because the program never submits wagers, place any bets yourself as soon as the instructions appear (or enable opt-in slip population). Stop with Ctrl-C.

## M. Current limitations

- No selection-level BetKing mapping is verified; mappings come only from your evidence-backed file.
- Meanings of `winner` (6-0), `x2` (settlement), `tg0`, `tg6` are undefined; any such option that is stake-eligible blocks automatic settlement (the run ends `BLOCKED_SETTLEMENT` with the verified result and per-option evaluation saved). `ht12`/`ht21`/`ht30`/`ft40`/`ft41` are assumptions from labels (home-away order, not confirmed Liverpool-relative).
- Whether the "X1" label (Liverpool away) corresponds to BetKing's `1X` notation is unconfirmed.
- Live score/clock/status, Results page, and bet-slip selectors are NOT verified on the real site; they must be supplied in the selectors file. The round-switcher selected-state attribute used to read the visible week is also unverified (falls back to the first rendered round).
- Half time is derived by the live observer from the last first-half score when the match clock passes 45; this clock-based rule is unverified against BetKing's virtual clock.
- Wager submission and acceptance detection are not implemented by design. Bet-slip stake entry exists only as an opt-in step with user-supplied selectors.
- The Cataloguea state lives in the automation browser profile (localStorage of the tab opened by the controller). Use the controller's Cataloguea tab for the strategy so its state is the state being settled.
- Nothing in Stages 27-29 has been executed or tested by the implementer.

## N. Verification evidence

Stages 27-29: none. No test, build, POC, or real-site run was performed. Earlier real-site observations (scheduled page, round and fixture selectors, market categories) are recorded in `AUTOMATION_PROGRESS.md` Stages 23-24 and are historical.
