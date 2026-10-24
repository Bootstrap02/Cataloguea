# Cataloguea BetKing Operational Workflow

Status: Stage 27-35. Evidence is labelled throughout with four classes:

- **VIDEO**: visibly demonstrated in the owner's screen recording (Oct 15, 2026, mobile site).
- **PROBE**: observed by a computer-run `automation:betking:probe` (owner's report, Oct 15).
- **CODE**: implemented in this repository.
- **DOM-VERIFIED**: confirmed against the live page DOM by a person-run inspection. Only the items
  explicitly marked so; everything else is not verified.

Stage 32 (market-first sequence) was written without running any test, build, or browser
automation. Do not treat any live-browser behaviour in this document as proven until the
controlled trial in section O has been done.

## A. Purpose

Connect the existing Solo Matrix strategy (React app, `src/`) to the real BetKing
virtual football Kings League so that, for each game week, the workflow can:
identify the Arsenal fixture, read the strategy's stakes, decide which options
qualify, prepare auditable betting instructions, watch the match, evaluate each
option, settle the strategy exactly once, and move to the next week.

It does not place wagers. It does not replace any strategy formula.

## B. System architecture

| Piece | File | Role |
| --- | --- | --- |
| Strategy engine | `src/strategy/soloMatrixSettlement.js`, `src/Catalogued.js`, `src/Scores.js` | Source of truth for stakes and state. `submitSoloMatrixFixture` computes stakes; `settleSoloMatrixState` applies marks. |
| Persistence | `localStorage["virt-epl-solo-v1"]` (React app) | Runtime authority; backend is best-effort backup only. |
| Decision adapter | `automation/strategy/strategyDecisionAdapter.js` | Boundary between strategy and sportsbook. Calls the strategy, merges components (RULE-002), filters (RULE-001), attaches mapping status. |
| Rules | `automation/strategy/rules.js` | RULE-001 minimum stake, RULE-002 merge, RULE-003 per-option evaluation, RULE-004 Arsenal orientation, RULE-005 skipped options settle as non-winning, RULE-006 market-first navigation, RULE-007 one selection per slip. Single definition of option semantics. |
| Arsenal perspective | `automation/strategy/arsenalPerspective.js` | Home/away to Arsenal/opponent conversion; X2/X1 orientation. |
| Season weeks | `automation/strategy/seasonWeek.js` | Weeks 1-38, rollover, alignment of required/visible/selected week. |
| Canonical mapping | `automation/strategy/canonicalBetTypes.js` | Strategy key to canonical type, semantics status, BetKing mapping status. |
| Fixture identity | `automation/strategy/fixtureIdentity.js` | Confidence scoring between strategy and BetKing fixtures. |
| Workflow | `automation/strategy/operationalWorkflow.js` | Step definitions, failure policies, planning functions, coordinator for steps 1-9 over injected ports. |
| State machine | `automation/stateMachine.js` | Existing machine, extended additively (see section G). |
| Settlement integration | `automation/strategy/settlementIntegration.js` | Evaluates options, checks duplicates and stale state, hands marks to the strategy port, verifies the receipt. |
| Real-site ports | `automation/sportsbook/betkingPorts.js`, `betkingSelectors.js` | Playwright implementations of schedule, week, live, and results reading, and the loaders for the selectors and mappings files. |
| Market-first sequence | `automation/strategy/marketFirstSequence.js` | Per-option stages with observable-evidence validators, bet-slip text parsing and comparison, the authorization boundary. No browser code. |
| Market-first flow | `automation/sportsbook/betkingMarketFlow.js` | Playwright operations: open category, identify selection, select odd, open slip, enter stake, read slip, read-only category catalogue. No submission code exists. |
| Real-site controller | `automation/betkingController.js`, `betkingRun.js`, `betkingLiveConfig.js`, `betkingRunJournal.js`, `betkingReport.js` | One controlled lifecycle per week over the real site; explicit `AUTOMATION_MODE=betking-live`. |
| Strategy bridge | `automation/strategy/strategyBridge.js` | Reads stakes and settles through the strategy running in a browser tab (development hook). |
| Result handling | `automation/result/*`, `automation/strategy/resultPoller.js`, `settlementAdapter.js` | Result observation, bounded polling, settlement receipts. `resultPoller` now delegates option evaluation to `rules.js`. |
| BetKing adapter | `automation/sportsbook/betkingAdapter.js` | Read-only snapshot normalisation and page classification. |

## C. Strategy options (owner definitions, Oct 17, 2026)

Keys: `winner`, `oneX`, `twoX`, `x2`, `tg0`, `tg6`, `ht12`, `ht21`, `ht30`, `ft40`, `ft41`. The strategy code
(`Catalogued.js`, `Scores.js`, `soloMatrixSettlement.js`) does not define score conditions (winners are marked
by hand), so the definitions below are the owner's, taken from his statement and two slip screenshots
(Week 16 ARS - LIV with Arsenal home, Week 17 SUN - ARS with Arsenal away). **Every option is defined from
Arsenal's side.** Keys are NOT renamed: persisted state, the odds table, and the UI use them.

Order of play (owner): `winner`, `oneX`, `twoX`, `x2`, `tg0`, `tg6`, `ht21`, `ht12`, `ht30`, `ft40`, `ft41`.

| Key | Wins when (L = Arsenal, O = opponent) | Category / market | Selection: Arsenal home | Arsenal away |
| --- | --- | --- | --- | --- |
| `winner` | FT: L 6, O 0 | Correct Score | `6-0` | `0-6` |
| `oneX` | L leads at HT and FT is a draw | HT/FT | `1/X` | `2/X` |
| `twoX` | L trails at HT and FT is a draw | HT/FT | `2/X` | `1/X` |
| `x2` | HT level, then L loses | HT/FT | `X/2` | `X/1` |
| `tg0` | FT total goals = 0 | Total Goals | `0` | `0` |
| `tg6` | FT total goals = 6 | Total Goals | `6` | `6` |
| `ht21` | HT: L 2, O 1 | Half Time / HT Correct Score | `2-1` | `1-2` |
| `ht12` | HT: L 1, O 2 | Half Time / HT Correct Score | `1-2` | `2-1` |
| `ht30` | HT: L 3, O 0 | Half Time / HT Correct Score | `3-0` | `0-3` |
| `ft40` | FT: L 4, O 0 | Correct Score | `4-0` | `0-4` |
| `ft41` | FT: L 4, O 1 | Correct Score | `4-1` | `1-4` |

Single source of truth: `automation/strategy/marketMappings.js` (mappings, order) and `rules.js` (win
conditions). Correct scores are written home-away on the site, so the label flips with Arsenal's position.

Recorded caveats (not hidden): (1) for `ht21` and `ht12` with Arsenal away, both slips contain both labels,
so the screenshots cannot show which label belongs to which key; Arsenal's side is applied for consistency with
`ht30`. (2) The panel category holding "HT Correct Score" is taken to be "Half Time" (the only half-time chip
in the recording); the run verifies at run time that the market and label are really shown before touching an
odd. (3) The Total Goals label "6" is taken to mean exactly six goals; the market catalogue shows whether a
"7+" or "6+" label exists.

## D. Stake calculations

1. Stakes are produced by the existing `submitSoloMatrixFixture` (winner stake plus per-asset normal and big-deficit stakes). Automation does not restate or recompute the formulas; the adapter reads `winnerStake`, `gameStakes[key]`, `bigStakes[key]`.
2. RULE-002: for each option, `combined = normal + bigDeficit` (only components the strategy produced; never across options). Original components are kept in `stakeComponents`.
3. RULE-001: `combined < 10` is skipped; `10` and above qualifies. No rounding up. (This replaces the earlier strict `> 10` interpretation per the user's latest instruction.)
4. Order: calculate, merge, filter, then market mapping. A qualifying stake with an unresolved mapping is reported as `UNRESOLVED_MARKET`, not dropped.

RULE-005 (confirmed): a skipped option is not played, gets no marks, and the strategy's own settlement treats it as non-winning (loss of its stake) even if its condition would have been met.

Note: the strategy floors the winner stake at 10, so `winner` is always stake-eligible.

## E. Market and selection mappings

The mappings are the table in section C, built into `strategy/marketMappings.js` as `VERIFIED` by the owner
(evidence: his statement and the two slip screenshots). A mapping in `~/.cataloguea/betking-market-mappings.json`
replaces the built-in one for that key. The run-time pipeline still verifies the live page every time: the
category must be shown as active, the market title must be shown, and exactly one label equal to the mapped
selection must exist in the row of the confirmed fixture. `automation:betking:markets` additionally reports, for
all eleven options, whether the exact labels were seen with valid odds on the real page.

HT/FT symbols are written from the home team's side (1 home, X draw, 2 away); first symbol = half-time result,
second = full-time result. The recording's category list has no "Double Chance"; `x2` is HT/FT, not Double Chance.

**Odds differ from the strategy table.** The slips show BetKing's current prices, and they differ from the odds
table in `src/Scores.js`: ARS - LIV shows `oneX` 14.70 against 13.7 in the table, and `winner` 1,431.00 against
563. The strategy calculates stakes from the table, so stakes can be off by several percent. Every plan records
`oddsComparison` (table, BetKing, percent difference) and the journal logs `ODDS_DIFFER_FROM_STRATEGY_TABLE` above
5 percent. Decide whether to refresh the table; feeding live odds into the strategy is not done.

## F. Fixture and week identification

- Required week: held by the workflow (the strategy state has no week field). Valid 1-38; Week 39 is invalid; 38 rolls over to 1.
- Three values are kept distinct: required (strategy side), visible (page), selected (confirmed by re-reading the page). They must agree.
- `identifyArsenalFixtureForWeek` finds the round whose label parses to the required week (position is never turned into a week number), then the single fixture where Arsenal is home or away. Zero fixtures, several fixtures, a duplicated week, or a missing week all stop processing; nothing switches week or picks one.
- Identity is checked twice: website-internal consistency (fixture id codes vs displayed teams) and strategy-vs-website match requiring HIGH confidence in the same home/away orientation.

## G. Operational workflow and state machine

`WORKFLOW_STEPS` in `operationalWorkflow.js` lists every conceptual step with its success, failure codes, and recovery, mapped onto the existing machine:

`OPEN_BETKING`, `VERIFY_PAGE_ACCESS` -> INITIALIZING; `WAIT_FOR_MANUAL_LOGIN_IF_REQUIRED` -> PAUSED; week and fixture steps -> OBSERVING / FINDING_MATCH / MATCH_VERIFICATION; strategy steps -> OBSERVING_STRATEGY; market and instruction steps -> STRATEGY_INSTRUCTION_READY / READY_FOR_ACTION; match steps -> WAITING_FOR_RESULT / RESULT_DETECTED / RESULT_VERIFIED; settlement -> SETTLING_STRATEGY / SETTLEMENT_CONFIRMED; next week -> WAITING_FOR_NEXT_FIXTURE.

Additive changes to `stateMachine.js` (no existing transition removed): new state `WAITING_FOR_NEXT_FIXTURE`; `MATCH_VERIFICATION -> OBSERVING_STRATEGY`; `STRATEGY_INSTRUCTION_READY -> READY_FOR_ACTION`; `READY_FOR_ACTION -> WAITING_FOR_RESULT | PAUSED`; `PAUSED -> RECOVERING`; `OBSERVING -> PAUSED`; `FINDING_MATCH -> RECOVERING | PAUSED`; `OBSERVING_STRATEGY -> PAUSED`; `WAITING_FOR_RESULT -> RECOVERING`; `SETTLEMENT_CONFIRMED -> WAITING_FOR_NEXT_FIXTURE`.

`createOperationalWorkflow({ stateMachine, ports }).prepareWeek({ requiredWeek })` runs steps 1-9 through ports (`readSchedule`, `readVisibleWeek`, `selectWeek`, `getStrategyInstructions`). It never returns simulated data on failure; a failing port yields a failure result and the policy-defined machine state.

Instruction lifecycle (never interchangeable): CALCULATED, ELIGIBLE, MARKET_RESOLVED, SELECTION_PREPARED, BET_SLIP_VERIFIED, SUBMITTED, ACCEPTED. This stage only ever reaches MARKET_RESOLVED.

## G1. Market-first selection sequence (required for every option)

Rule (VIDEO): an odd is never selected until the correct market **category** is open and the exact
**selection** inside it has been identified for the confirmed fixture. Category, selection, and
stake are separate operations. This applies to all options; each uses its own verified category
(HT/FT is only the example shown). One option is processed through these stages at a time:

| Stage (per option) | Observable condition required to enter it (CODE: `marketFirstSequence.js` validators) | Run-level machine state |
| --- | --- | --- |
| `FIXTURE_CONFIRMED` | fixture verified against the strategy fixture; home/away and Arsenal side known | MATCH_VERIFICATION |
| `STRATEGY_OPTIONS_RESOLVED` | mapping status `VERIFIED` with a category and an exact selection | STRATEGY_INSTRUCTION_READY |
| `MARKET_CATEGORY_OPENED` | the page reports that category as active AND lists selection labels for the fixture | READY_FOR_ACTION |
| `MARKET_SELECTION_IDENTIFIED` | exactly one label equals the required selection, in the row whose home/away equal the confirmed fixture | READY_FOR_ACTION |
| `ODDS_VERIFIED` | the odd is a valid decimal price and has not changed since first read | READY_FOR_ACTION |
| `SELECTION_ADDED` | slip was empty before; summary bar then shows exactly 1 selection at that price (RULE-006 gate must allow; RULE-007) | READY_FOR_ACTION |
| `BET_SLIP_VERIFIED` | slip text matches fixture, market, selection, week, odds, and stake; one selection; enough time left | READY_FOR_ACTION |
| `AWAITING_AUTHORIZATION` | nothing submitted; a person decides | READY_FOR_ACTION |
| `WAGER_SUBMITTED` | `--through place` only: real-money consent, stake within the cap, confirmation, a last slip check, then the place-bet control used once | EXECUTING |
| `WAGER_ACCEPTED` | the site's own confirmation text appeared after the click (a click is never acceptance) | WAITING_FOR_RESULT |

The stages are per option; the existing state machine is run-level (no second machine). A stage is
reached only with observable evidence: a click attempt is never evidence, and any failure leaves the
option at its last reached stage with a failure code (`FAILURE_POLICIES`).

How far a run goes is controlled by `--through`:

- `identify` (default, read only): open category, identify selection, verify odds. **No odd is ever clicked.**
- `select`: also add the odd to the slip (slip must be empty).
- `slip`: also open the slip, enter the strategy stake, and verify it; stops at `AWAITING_AUTHORIZATION`.
- `place`: also places the bet (see G7). The only depth that can submit a wager.

Because a second outcome of the same fixture and market replaces the first (VIDEO: 1/X, then 2/X, then
X/2 each showed "1 Selection"), and because the slip's Singles group applies ONE stake to every selection
(owner screenshots: "Singles 11x", stake 9.09 = total 100 / 11, "Stake (Min 10)"), options with different
stakes are prepared **one at a time**; the rest wait (`PENDING_SLIP_TURN`). BetKing's own minimum is 10 per
bet, the same as RULE-001. Another person's slip selections are
never cleared automatically.

## G2. How different market categories are handled

The category is data, not code: it comes from each option's `VERIFIED` mapping (`market`), and the
selection from `selection` or `selectionBySide` (HOME/AWAY). `openMarketCategory` works for any
category by name: it uses a visible category chip if present, otherwise opens "More Markets" and picks
the category from the grid, and then requires the page to report that category as active. An option
whose category or selection cannot be established is `UNRESOLVED` and never touches an odd. Nothing is
forced through HT/FT.

## G3. What the recording shows, and what is and is not established

| Item | VIDEO | PROBE (Oct 15) | CODE | DOM-VERIFIED |
| --- | --- | --- | --- | --- |
| Mobile site `m.betking.com`, Kings League with Week 1-4 tabs | yes | 4 round-switcher buttons found (Weeks 33, 35, 36, 37) | week selection via those buttons | no |
| "More Markets" / "Close Markets" toggle and the 12 category chips | yes | not probed | located by visible text, overridable | no |
| Favourites chips ("1X2 & GG", "HT/FT") | yes | 2 `market-selector-tab` found; HT/FT and 1X2 & GG clicked OK | used as a first try for a category | partly (probe) |
| Per-fixture selection grid, labels above odds (HT/FT: 9 labels) | yes | 36 odds buttons, 40 matches found | `match`, `selection-name`, `match-odd-value` test ids (earlier inspector) | partly |
| Selecting an odd highlights it; "N Selection / Odds" bar; Betslip badge | yes | not probed | summary bar read from page text | no |
| Another outcome in the same market replaces the first | yes | n/a | RULE-007; one option at a time | no |
| "VIRTUALS BETSLIP": item "ARS - AST / HT/FT - 1/X / 13.30", Total Stake Amount, Total Odds, Net Potential Winnings, PLACE BET | yes | n/a | parsed from page text (`parseBetSlipText`) | no |
| Stake box prefilled 100; chips 50/100/200/500/1,000 (then +50...); winnings = stake x odds (1 -> 13.30, 50 -> 665.00, 100 -> 1,330.00) | yes | n/a | stake typed with fill and read back; winnings consistency is a warning | no |
| "Next event will expire in mm:ss", orange at 00:20 | yes | n/a | slip rejected below 10 s remaining | no |
| PLACE BET was not pressed | yes | n/a | no code path submits | n/a |
| A "FreeToPlay" promotional dialog (`.dialog__backdrop`) intercepted the click on "More Markets" | n/a | seen in the owner-run markets command (Oct 16) | overlays are detected and closed only through a control that clearly just closes them; otherwise a person is given time | observed once |
| `matchup-statistics-button-*` ids | n/a | **0 found** in the current DOM | fixture ids fall back to team codes; identity uses teams, round, side | gap |
| Probe click failure on round switcher "Week 35" (opacity-60 class), timeout 3 s | n/a | 5 of 6 clicks worked | probe now records what covers the control | unresolved cause |

## G4. Operating phases A-I

- **A. Startup and readiness.** `automation:betking:run` opens the real page in a visible persistent-profile browser and waits for you to sign in (no password handling). It proceeds only when the page classification supports access (not `AUTH_REQUIRED`, not `PAGE_UNAVAILABLE`). No simulated sportsbook exists; if the site is unreachable the run fails (`BETKING_UNAVAILABLE`).
- **B. Fixture identification.** Required week 1-38 (rollover 38 to 1) from the workflow checkpoint, never from a countdown; exactly one Arsenal fixture; home/away and opponent recorded; an ambiguous fixture stops the run (sections F, G).
- **C. Strategy evaluation.** Stakes come from the existing strategy; normal and big-deficit are combined per option only (RULE-002); 10 or more qualifies, below 10 is skipped, applied to the final amount (RULE-001).
- **D. Market and selection resolution.** From `VERIFIED` mappings only (section E); otherwise the option is unresolved and the proposal is shown for review.
- **E. Market-first navigation.** Section G1 (RULE-006).
- **F. Bet-slip review.** Section G1 stages `SELECTION_ADDED` and `BET_SLIP_VERIFIED`. `compareSlipToExpected` detects: empty slip, extra selections, duplicate selection, wrong fixture, wrong market, wrong selection, wrong week, changed odds, stake mismatch, expiring slip; winnings inconsistency is a warning. A populated slip is never reported as a placed bet.
- **G. Authorized submission.** Not implemented, deliberately. `AWAITING_AUTHORIZATION` is the last stage; `describeAuthorizationRequest` prints what a person would be authorizing. Recording an accepted wager would require the site's own confirmation, which no code reads yet.
- **H. Result observation and settlement.** Section H and I: separate half-time and full-time scores, strategy outcome kept separate from whether any wager was accepted, idempotent settlement.
- **I. Recovery.** Section K plus: after any interruption the fixture and category are re-verified before a stage is repeated; `SELECTION_NOT_ADDED` means "re-read the slip first, never click again blindly"; no fabricated odds, results, or submissions.

## G5. Handing the week and fixture to the strategy (Stage 33)

1. **Week.** With `--week auto` (the default) the controller reads the schedule, takes the FIRST listed round that has a readable "Week N" label as the upcoming round, and prints it with its countdown and the other visible weeks for you to compare. The countdown never chooses the week. The week is reconciled with `~/.cataloguea/betking-progress.json` (the last week this project settled): next week = accepted; the same week = refused (`WEEK_REPEAT`); anything else = refused (`WEEK_GAP`); 38 is followed by 1. On a first run with no progress file the week is accepted for `--through identify`, but `--through select|slip` is refused until you confirm it yourself with `--week N` (`WEEK_NOT_CONFIRMED`). An explicit `--week N` is still verified against the schedule. The progress file is written only after a settlement is confirmed and persisted.
2. **Arsenal fixture.** Exactly one Arsenal fixture in that round; home or away and the opponent are recorded; ambiguity stops the run.
3. **Feeding the strategy.** If the strategy has no active fixture, the controller submits the identified home and away team codes (lower case, e.g. `ars`, `mnu`) through the strategy's own submit routine (`submitFixture` on the development hook, which is the same code as the Submit button). The strategy then calculates every stake itself. The fixture counts as fed only when the strategy reports it back. An already-active fixture is never replaced: if it differs from the website fixture the run stops (`FIXTURE_IDENTITY_MISMATCH`). If the opponent has no odds row in `src/Scores.js` (for example BetKing teams such as Coventry or Hull are not in the 20-team table) the run stops with `STRATEGY_FEED_FAILED`; odds are never invented. Set `AUTOMATION_FEED_STRATEGY=false` to submit the fixture in the Cataloguea tab yourself instead.
4. **Stake plan.** `week-N-instructions.md` lists, per option, the final stake (normal + big-deficit for that option only), whether it is 10 or more, the market and selection, and how far the market-first pipeline got.

## G6. Readiness for the first controlled rehearsal

| Capability | Code | Run on the real site |
| --- | --- | --- |
| Login hand-off (you sign in, the run continues) | yes | probe confirmed page access after login |
| Week detection and reconciliation (1-38, rollover) | yes | not run |
| Arsenal fixture, home/away, opponent | yes | not run |
| Feeding the fixture to the strategy and stake calculation | yes | not run (needs `npm start`) |
| 10-or-more rule applied to the final stake | yes | n/a |
| Category-first navigation and selection check | yes | not run |
| Adding the odd, entering the stake, verifying the slip | yes (`--through select` / `slip`) | not run |
| Placing the bet and detecting acceptance | **not built** | needs a recording of the post-placement screens |
| Result observation and settlement | partly (live/results selectors not supplied) | not run |
| Automatic settlement of every option | blocked until `winner`, `tg0`, `tg6`, `x2` are defined | n/a |

Timing risk: options are prepared one at a time and the slip carries an expiry countdown, so the time per option (journal event `PIPELINE_TIMING`) must be measured against the round countdown. Whether BetKing offers single bets with their own stakes when several selections are in the slip is unknown.

## G7. Placing the bet (`--through place`)

The only code that can submit a wager is `placeBet` in `sportsbook/betkingMarketFlow.js`. It is reached only
through the controller, only at depth `place`, and only when ALL of these hold:

1. `AUTOMATION_ALLOW_REAL_MONEY=yes` is set (otherwise nothing is placed and the run ends `NO_BETS_PLACED`).
2. The option's final stake is within `AUTOMATION_MAX_STAKE` (default 1000) and is at least 10.
3. Each bet is confirmed: you type `PLACE <stake>` for that bet, or the run was started with `--auto-confirm`.
4. The pipeline reached `BET_SLIP_VERIFIED`: category and market open, exact label for the confirmed fixture,
   odds unchanged, slip holds exactly that one selection with the strategy stake.
5. A last slip check immediately before the click: no mismatch, at least 15 seconds left on the countdown.
6. The slip page shows exactly one visible, enabled "PLACE BET" control (matched by its visible text; it is
   NOT DOM-verified). It is clicked once and never retried.

After the click only what the page shows counts. New text matching a placed/accepted pattern gives
`ACCEPTED_BY_SITE_TEXT`; text matching a rejection pattern (insufficient, failed, error, rejected, expired...)
gives `REJECTED_BY_SITE_TEXT`; anything else is `SUBMITTED_UNCONFIRMED` and the run PAUSES (a bet may exist; check
My Bets). Screenshots before and after are saved in the run folder. The acceptance and rejection patterns are
guesses until a real placement has been observed.

After an accepted bet the slip is closed with the X beside its title and the next option (in the owner's order)
starts. Settlement then marks only options whose bet was accepted (`NOT_PLACED` options get no mark, like skipped
ones). Your balance in the screenshots was N0.09: the site will reject real bets until the account is funded.

## H. Half-time and full-time results

Scores are kept as separate `halfTime` and `fullTime` `{home, away}` objects and converted to Arsenal/opponent only in `arsenalPerspective.js`. No live, half-time, or full-time selector has been verified on the real site. A half-time score is never inferred from the final score; a match is never assumed complete after ~30 seconds.

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

`FAILURE_POLICIES` defines primary and fallback actions for 28 failure codes (retry, wait, manual intervention, mark unresolved, stop fixture, resume from checkpoint, skip option, ignore duplicate, recalculate). Highlights: authentication required or expired session -> pause for manual login; ambiguous or missing Arsenal fixture, wrong or unavailable week, identity mismatch -> stop the fixture; unresolved mapping, missing odds or selection -> mark that option unresolved and continue with independent options; internet loss or browser crash -> resume from checkpoint after re-verifying page, week, and fixture; persistence failure -> pause and never advance the week. No failure falls back to simulated data.

## L. Commands (from `package.json`)

All work happens on the real BetKing Kings League scheduled page
(`https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league`). The built-in
sample sportsbook page is **retired**: no command opens it, `automation:poc` now only prints a
message, and its three browser test files are excluded from `automation:test`.

- `npm run automation:betking:open` - opens the real page (visible, persistent profile), prints what was read (classification, rounds, Arsenal fixtures) and waits for Enter. Read-only.
- `npm run automation:betking:probe` - opens the real page, waits for you to sign in (no Enter needed), then proves the platform's buttons can be used: outlines the round-switcher buttons and market tabs, clicks them (navigation only), records what changed, restores the view, and saves `probe.json` / `probe.md`. It never clicks odds, selections, or bet-slip controls. Cookie consent is never accepted automatically; if a banner blocks a click, dismiss it yourself in the window.
- `npm run automation:betking:markets [-- --week N]` - read only: for each category in the More Markets panel, opens it and records the selection labels and odds for each visible Arsenal fixture (`market-catalogue.json` / `.md`). Never clicks an odd. This is the evidence for verifying mappings.  It reports, for all eleven options, whether the exact mapped labels were seen with valid odds.
- `npm run automation:betking:run [-- --week N|auto] [--through identify|select|slip|place] [--auto-confirm] [--max-weeks M] [--prompts]` - the real-site run (week defaults to auto, see G5). `place` also needs `AUTOMATION_ALLOW_REAL_MONEY=yes`; `AUTOMATION_MAX_STAKE` sets the per-bet cap. Sign in on the BetKing window; the run then continues by itself (it also waits by itself for an Arsenal fixture to be submitted in the Cataloguea tab). `--through` sets how far the market-first pipeline goes (default `identify`, read only). `--prompts` asks for Enter at the human checkpoints instead. It never submits a wager.
- `npm run automation:betking:inspect` (`-- --interactive` for manual login) - read-only inspection report.
- `npm run automation:test` - unit tests only (no sample page, no browser windows).
- Cataloguea must run with `npm start` (development build) so `window.catalogueaAutomation` exists; the run opens it in a second tab of the same browser.

Real-site configuration (all optional, all evidence-based):

- `~/.cataloguea/betking-selectors.json` (see `automation/betking-selectors.example.json`): live and results selectors you verified, plus optional `marketFlow` overrides for the market-first locators. Incomplete sections are ignored and reported.
- `~/.cataloguea/betking-market-mappings.json` (see `automation/betking-market-mappings.example.json`): only entries marked `VERIFIED` with a market category, a selection (or `selectionBySide` with HOME and AWAY), and evidence are accepted; everything else stays `UNRESOLVED_MARKET`. The example file holds the HT/FT proposals for oneX, twoX, and x2, marked not yet verified.
- Environment: `AUTOMATION_BETKING_URL`, `AUTOMATION_CATALOGUEA_URL` (default `http://localhost:3000`), `AUTOMATION_BETKING_PROFILE_DIR`, `AUTOMATION_BETKING_RUNS_DIR`, `AUTOMATION_POLL_INTERVAL_MS`, `AUTOMATION_LOGIN_WAIT_TIMEOUT_MS`, `AUTOMATION_STRATEGY_WAIT_TIMEOUT_MS`, `AUTOMATION_LIVE_INTERVAL_MS`, `AUTOMATION_MATCH_WAIT_TIMEOUT_MS`, `AUTOMATION_RESULTS_INITIAL_DELAY_MS`, `AUTOMATION_RESULTS_INTERVAL_MS`, `AUTOMATION_RESULTS_MAX_ATTEMPTS`, `AUTOMATION_RESULTS_CROSSCHECK_ATTEMPTS`, `AUTOMATION_MANUAL_LOGIN_MAX_ATTEMPTS`, `AUTOMATION_MARKET_WAIT_MS`, `AUTOMATION_FEED_STRATEGY` (`false` to submit the fixture yourself), `AUTOMATION_BETKING_PROGRESS_FILE`, `AUTOMATION_PIPELINE_THROUGH` (`identify` | `select` | `slip` | `place`; same as `--through`), `AUTOMATION_ALLOW_REAL_MONEY` (`yes`), `AUTOMATION_MAX_STAKE`, `AUTOMATION_AUTO_CONFIRM` (`true`, same as `--auto-confirm`), `AUTOMATION_PLACE_OBSERVE_MS`.

Run flow: launch, open both tabs, wait for sign-in, prepare the week (select week, identify Arsenal fixture, strategy stakes, merge, filter, mappings, selection check), write `week-N-instructions.md` and `week-N-plan.json` to the run directory, watch the live match, cross-check with the Results page when configured, evaluate, settle once, persist-check, report the next week. Because the program never submits wagers, place any bets yourself while the slip is open; the slip expires with the round (VIDEO: "Next event will expire in"). Stop with Ctrl-C.

## M. Current limitations

- No selection-level BetKing mapping is DOM-verified; mappings come only from your evidence-backed file. The HT/FT proposals for oneX/twoX/x2 come from the recording.
- All eleven options are defined by the owner (section C). The caveats listed there remain: the ht21/ht12 away orientation, the Half Time category holding HT Correct Score, and whether Total Goals "6" means exactly six.
- Overlays: a promotional dialog can cover the page. The flow presses Escape and clicks only a control labelled like close, dismiss, not now, or skip (never one containing play, join, claim, deposit, bet, accept, or similar); cookie and consent dialogs are never accepted. If it cannot be closed safely the flow waits for you to close it, then continues.
- The active category is read from the `selected-market-name` test id when present, otherwise from the title next to the More Markets toggle (as in the recording). The first live run suggests the test id may be missing on the mobile layout; this is unconfirmed.
- The market-first locators (More Markets toggle, category chips, Betslip tab, slip text, stake input) are located by visible text from the recording and are not DOM-verified. The summary bar and slip are read from page text.
- How BetKing treats several slip selections (single bets or one combined bet) is unknown, so one selection at a time is enforced.
- Whether the slip clears itself after a bet is placed or the event expires is unknown.
- The strategy odds table covers 20 teams; BetKing's league also has teams outside it (e.g. COV, HUL). An Arsenal fixture against such a team cannot be fed to the strategy until its odds row is added.
- The place-bet step is built (G7) but has never been run. The PLACE BET control is found by its visible text, and the acceptance and rejection patterns are guesses until a real placement has been observed. Until then an unconfirmed click pauses the run.
- BetKing's Singles group applies one stake to all selections in the slip, so options with different stakes are placed one at a time; the time per option against the round countdown is unmeasured (journal event `PIPELINE_TIMING`).
- The strategy odds table differs from BetKing's current prices (section E); stakes use the table.
- `matchup-statistics-button-*` ids are absent (PROBE), so fixture ids are team codes; identity relies on teams, round, and home/away.
- Round switcher "Week 35" could not be clicked in the probe; cause unknown (diagnostics added).
- Live score/clock/status and Results selectors are NOT verified; supply them in the selectors file. Half time is derived from the live clock passing 45, unverified against BetKing's virtual clock.
- The Cataloguea state lives in the automation browser profile; use the controller's Cataloguea tab.

## N. Verification evidence

- Stage 31 probe (owner-run, Oct 15): page opened and login detected; 4 round switchers, 2 market tabs, 5 league tabs, 40 matches, 36 odds buttons, 93 of 94 buttons visible, 0 statistics buttons; 5 of 6 navigation clicks worked; "Week 35" timed out.
- Owner-run `npm run automation:test` (Oct 15): 278 passed, 0 failed, sample page not opened.
- Owner-run `automation:betking:markets` (Oct 16, before the Stage 34 fixes): the real schedule showed Week 23 LIV v ARS (Arsenal away) and Week 24 ARS v BRE; the round and fixture rows were found on the real page (the first category read passed the row check); then "Favourites" was reported not opened, later categories reported the fixture row unavailable, and a FreeToPlay dialog blocked the More Markets click. No mappings were written.
- Stage 32: the recording was studied; no test, build, browser automation, or live-site interaction was run. Everything in G1-G3 awaits the controlled trial.

## O. Next controlled trial (computer)

1. `npm run automation:betking:probe`: read the diagnostics for the "Week 35" failure.
2. `npm run automation:betking:markets`: confirm the HT/FT labels are exactly `1/1 1/X 1/2 X/1 X/X X/2 2/1 2/X 2/2` for the Arsenal fixture and read what Half Time, Total Goals, and Correct Score offer (evidence for the unresolved mappings).
3. Create `~/.cataloguea/betking-market-mappings.json` from the example; set oneX and twoX to `VERIFIED` only if step 2 matches. Leave x2 until you confirm its meaning.
4. `npm run automation:betking:run -- --week N --through identify`: check that, for each option, the category opens, the right selection is found for the right fixture, and the odds equal what you see. **This must be reliable before anything else.**
5. `--through select` for one option: check the slip shows exactly that selection; clear the slip yourself.
6. `--through slip`: check the stake is entered, the slip comparison passes, and the run stops at `AWAITING_AUTHORIZATION`. Do not place the bet.
7. Only after steps 4-6 are reliable, discuss whether and how submission could be authorized.

## P. Conflicts and decisions needed

- **Strategy code vs user-defined rules:** the strategy code has no score-to-outcome logic (winners are marked by hand), so `oneX`/`twoX` are additions in `rules.js`, not overrides. No existing settlement logic was changed.
- **`x2` reading:** "Arsenal home -> X2, away -> X1" is read here as HT/FT `X/2` and `X/1`. A conventional Double Chance `X2` (draw or away win) is a different bet and does not appear in the recording's category list. Please confirm which you mean and define the win condition.
- **`AUTOMATION_PROJECT_GUIDE.md` rule 14** ("use test pages first") conflicts with your decision to retire the sample page; it is amended there.
- **Skipped options (RULE-005)** settle as non-winning in the strategy even if their condition would have been met (confirmed by you).

## Opening a market (rewritten Oct 23, 2026, from the owner's walkthrough and diagnostics.json)

The page opens on Popular or Favourites, so the category chips only exist inside **More Markets**. The tool now always does:

1. Click **More Markets** (the header toggle).
2. Click the category chip inside the panel: **HT/FT** (oneX, twoX, x2), **Total Goals** (tg0, tg6) or **Correct Score** (winner, ft40, ft41).
3. For the halftime options, click the **HT Correct Score** chip, which sits INSIDE Correct Score (ht21, ht12, ht30). It is not under "Half Time".
4. If the fixture row is collapsed, open it (teams row only; never an odd, never the stats icon).
5. Read each odd with the label printed directly above it (for example 1-0, 1/X, 6) and confirm the page header names the category.

Why the earlier runs failed (diagnostics.json): the old code clicked the "Correct Score" shortcut chip in the Popular row, so the header stayed on Popular and the check failed; and it looked for a `selection-name` test id that this page does not have, so it always read 0 labels (the real labels are `typography-caption--inherit` captions above each odd). A screenshot is saved after every step (`step-NNN-*.png`) next to the run's journal.

Orientation (confirmed by the HT Correct Score screenshot): labels are written home-away. When Arsenal is away, ht21 is the 1-2 cell (Away To Win column), ht12 is 2-1, ht30 is 0-3.

## Win rules (owner, Oct 23, 2026) — see automation/strategy/winRules.js and rules.js

First half = minutes 1-45, second half = 46-90 (no break). The half-time score is the HT column of BetKing's Results window. Scores below are Arsenal first, opponent second, home or away.

| Option | Wins when |
|---|---|
| oneX | Arsenal ahead at half-time and level at full-time |
| twoX | Arsenal behind at half-time and level at full-time |
| x2 | level at half-time and Arsenal lose at full-time (X/2 at home, X/1 away) |
| tg0 / tg6 | exactly 0 / exactly 6 goals in the match |
| winner | Arsenal win 6-0 |
| ft40 / ft41 | Arsenal 4-0 / 4-1 at full-time |
| ht30 / ht21 / ht12 | Arsenal 3-0 / 2-1 / 1-2 at half-time |

Several options can win together (a 6-0 win wins winner and tg6). After each match the run prints the half-time and full-time scores and WON/LOST for every option bet on.

## Placing bets and watching results (Oct 23, 2026)

Default depth is identify (read only). Use `--through slip` to fill the slip without placing, and `--through place` to place:
`AUTOMATION_ALLOW_REAL_MONEY=yes AUTOMATION_MAX_STAKE=50 npm run automation:betking:run -- --through place`
The strategy runs inside the program (no strategy tab); its state is in automation/artifacts/strategy-state.json. Results come from the Results window (list icon, Results tab); rows appear about 30 seconds after full time.
