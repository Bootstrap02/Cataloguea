# START NOW — STAGE 26: CONNECT THE REAL CATALOGUEA STRATEGY TO LIVERPOOL FIXTURE TRACKING AND RESULT SETTLEMENT

## Objective

Move Cataloguea forward from real-site reconnaissance into the actual strategy workflow.

Stages 23–25 established the real BetKing inspection command and identified the remaining live/results discovery gaps.

Do not repeat the same general website inspection. Build the next useful component using the existing strategy code and the real-site inspection infrastructure.

Use the existing repository. Preserve unrelated changes and deletions.

## PART A — AUDIT AND CONNECT THE REAL STRATEGY

Inspect the actual source code, especially:

- `src/Catalogued.js`
- `src/Scores.js`
- `automation/strategy/canonicalBetTypes.js`
- `automation/result/liveResultObserver.js`
- `automation/result/resultObserver.js`
- `automation/` strategy adapter and settlement modules
- `AUTOMATION_PROGRESS.md`

Document the actual meaning of all 11 strategy keys:

`winner`, `oneX`, `twoX`, `x2`, `tg0`, `tg6`, `ht12`, `ht21`, `ht30`, `ft40`, `ft41`.

Trace how stake amounts are calculated, displayed, changed, and settled. Determine whether the button amount represents currency units, a multiplier, or another value.

Do not infer strategy semantics from button labels alone.

## PART B — IMPLEMENT THE MINIMUM-STAKE FILTER

Implement a strategy-owned decision adapter that reads the real current strategy state and determines which instructions qualify.

The user's rule is that stakes below 10 are not to be placed.

Requirements:

1. Preserve the exact strategy calculation.
2. Filter below-minimum stakes without rounding them upward.
3. Include stakes equal to 10 if the strategy's units and rules confirm that interpretation.
4. Never assume all 11 bet types qualify in every round.
5. Preserve the strategy key, calculated amount, intended selection semantics, and reason for exclusion.
6. Do not mutate the strategy merely to prepare instructions.
7. Do not use duplicated or invented stake calculations.
8. If the strategy uses a different unit than the BetKing stake amount, identify that mismatch rather than silently converting it.

Return a clear instruction list showing:
- Qualifying instructions.
- Below-minimum instructions marked `SKIPPED_BELOW_MINIMUM`.
- Unresolved market mappings marked `UNRESOLVED_MARKET`.

## PART C — IMPLEMENT A REAL FIXTURE IDENTITY

Extend the existing BetKing adapter so that a Liverpool fixture can be identified using all reliable identity fields exposed by the site.

Use, where available:
- League.
- Round or week.
- Home team.
- Away team.
- Stable site fixture identifier.
- Scheduled kickoff or other distinguishing fields if genuinely available.

Do not identify a fixture by Liverpool's name alone.

Ensure the same fixture can be tracked across scheduled, live, and results views. If the website does not expose a stable cross-view identifier, implement an explicit confidence check and ambiguity handling.

Never settle against an ambiguous fixture.

## PART D — IMPLEMENT RESULT POLLING AS THE PRIMARY SETTLEMENT PATH

The user demonstrated that BetKing exposes completed fixtures with separate HT and FT scores and reports that results normally appear around 30 seconds after a match ends.

Implement a real-site result-polling component using the existing browser and adapter infrastructure.

Requirements:

1. Use the real results source only after it has been observed and verified. If Stage 25 has not established a working Results URL or navigation path, do not invent one. Make the result-source adapter explicit and report that live integration remains blocked until the real path is verified.
2. Start the first result check approximately 30 seconds after the expected match completion time, when that timing can be established reliably.
3. Continue polling at a configurable interval until the correct completed result appears or a configurable timeout is reached.
4. Never treat an empty result row, missing score, scheduled countdown, or live score as a final result.
5. Capture HT and FT scores separately.
6. Verify the league, round, teams, and available fixture identity before accepting a result.
7. Reject stale, ambiguous, incomplete, or mismatched results.
8. Keep the observer read-only.
9. Do not mutate the strategy until the verified HT/FT result satisfies the existing settlement contract.
10. Record timestamps, polling attempts, observed fixture identity, score completeness, and the final verification decision.
11. Handle temporary network disconnections and page reloads without duplicating settlement.
12. Persist enough state to resume polling after a process restart.

Do not use hard-coded scores or simulated results as evidence that the real observer works.

## PART E — REPORT EACH STRATEGY INSTRUCTION'S OUTCOME

Create or extend the settlement/reporting boundary so that each qualifying strategy instruction can ultimately be reported as:

- `WON`
- `LOST`
- `PENDING_RESULT`
- `UNRESOLVED_MARKET`
- `AMBIGUOUS_FIXTURE`
- `RESULT_UNVERIFIED`
- `SKIPPED_BELOW_MINIMUM`

Only classify a bet as won or lost when its selection semantics and required score phase are verified.

For each instruction, retain:
- Strategy key.
- Stake amount.
- Minimum-stake decision.
- Intended market and selection.
- Fixture identity.
- HT score and FT score when available.
- Outcome.
- Explanation for any skipped or unresolved instruction.

Respect the actual strategy settlement logic. Do not invent new progression rules.

## PART F — LIVE MATCH MONITORING IS OPTIONAL, NOT A BLOCKER

Do not make continuous live-match observation a prerequisite for settlement if verified completed results can supply the necessary HT and FT scores.

However, preserve the ability to inspect a live Liverpool fixture using the actual BetKing Live interface when that view is available.

Do not assume the current scheduled page and live page have the same DOM structure.

If the live view is not available, record the exact missing selector or navigation requirement without blocking the result-polling implementation.

## PART G — BET SLIP PREPARATION

Do not implement or trigger automatic real-money bet submission in this stage.

Prepare the verified instruction data needed by a later bet-slip integration, but do not click selections, submit wagers, or mutate account state during tests.

Keep market selection mappings unresolved unless verified from the actual BetKing interface.

## PART H — BROWSER SECURITY AND PROCESS CONTROL

Investigate why Chromium is launched with `--no-sandbox`.

Determine whether the real-site browser works with the normal Chromium sandbox enabled in the current Ubuntu environment. Remove `--no-sandbox` if feasible.

Do not launch duplicate browser processes or run the local POC and live-site inspection concurrently without a clear reason.

Keep the persistent profile at `~/.cataloguea/betking-profile` and preserve the existing optional-cookie rejection preference.

Keep credentials, cookies, tokens, and account data out of reports.

## PART I — VALIDATION

Add focused tests for:

- Stake filtering at below, equal to, and above the minimum.
- All 11 strategy keys.
- Ambiguous Liverpool fixtures across different rounds.
- Separate HT and FT score handling.
- Missing or incomplete results.
- Results that appear only after repeated polling.
- Network interruption and polling recovery.
- Prevention of duplicate settlement.
- Preservation of unresolved market mappings.
- Prevention of strategy mutation before verified settlement.

Run:

- `npm run build`
- `npm run automation:poc`
- `npm run automation:test`
- `git diff --check`

Run the real-site inspection separately if necessary, but do not claim real result polling works unless the actual Results source has been verified.

## COMPLETION REPORT

Update `AUTOMATION_PROGRESS.md`.

Report:
1. The actual strategy calculation and settlement behavior.
2. How the minimum-stake filter works.
3. The qualifying instruction list and skipped-instruction behavior.
4. Fixture identity rules.
5. Whether a real Results source was verified.
6. Whether HT/FT extraction was verified against actual page data.
7. What the polling component can and cannot currently do.
8. Files changed and all validation results.
9. The precise remaining blockers before reliable real-site operation.

STOP after Stage 26.