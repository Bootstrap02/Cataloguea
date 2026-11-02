# La Liga strategy: the rules, in plain words

**Winners.** Two independent 6-0 bets: Barcelona (BAR) and Real Madrid (RMA), each on its own correct score (a home team
wins 6-0, an away team wins 0-6). The total base is 10000, so each winner starts at 5000.

**Each round, each winner:** stake = base / odds (never below 10). That cost is added to the winner's OWN running cost.

**Protecting options:** up to 20, one per La Liga team: the team's own HT/FT result "ahead at half-time, level at full
time" (1/X when the team is home, 2/X when it is away). Odds come from the page that round.
stake = (option's broken target + the winners' total running cost + the option's own past losses) / (odds - 1).
A stake under 10 is not bet. It still counts as a loss for that option and carries forward.

**When a protecting option wins (and was placed):** its own losses reset, and every winner's running cost resets
(the profit repaid them). A second winner in the same round adds the round's cost to the bank.
**When it loses:** its losses grow by its stake. At 1000 or more they move to its big deficit (the bank eases it by up
to 500 first). Big deficits add a "big" stake (big deficit / odds) and raise every option's broken target by that stake divided by 20, the number of teams; a broken target of 1000 or more
raises the winners' bases, shared equally.

**When a winner hits 6-0:** only that winner resets (base back to 5000, running cost to zero). The other keeps its own.

**Same match twice:** Barcelona and Madrid are also among the 20 protecting teams, so they can have both a 6-0 and a
1/X in the same match. If they play each other, both 6-0 bets are placed; at most one can win.

**One round never settles twice,** and a round whose bets could not be placed is discarded, not settled.

## How a round runs (laliga-run.js)
1. Wait for a round with at least 70 seconds on its countdown (the next one after full time has about 2:30).
2. Read the odds from the page: the 6-0 for Barcelona and Madrid (Correct Score) and every fixture's HT/FT grid.
3. Plan the stakes with the rules above. Print the plan.
4. Place the winners first, then the protecting options from the biggest stake down, until about 20 seconds remain.
   A winner that cannot be placed costs nothing. If neither winner can be placed, the round is left unplayed.
5. Watch: the league countdown reaches zero, the matches play for 30 seconds, full time.
6. Read the results (live view, or the Results window when the live view cannot prove both halves).
7. Settle the strategy, save the state, print the report and the running session total, and start again.
A bet that may exist but could not be confirmed stops the whole run (check My Bets, then settle-laliga.js).
