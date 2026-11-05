# La Liga automation: how to use it

## Start it
In a terminal, from the project folder (`cd ~/Bootworks/Cataloguea`):

| What you want | Command |
| --- | --- |
| Play round after round until you stop it | `npm run laliga:play` |
| Play one real round, then stop | `npm run laliga:one` |
| See the plan for a round, place nothing | `npm run laliga` |
| Read all 20 teams' odds, place nothing | `npm run laliga:scan` |
| Settle a round that was left open | `npm run laliga:resume` |

(One time only, to create those short commands: `node add-laliga-scripts.js`. Without it, use `bash start-laliga.sh play` and the same words.)

**Stop it:** press Ctrl-C once. It finishes the step it is on safely, then stops.

## Every time
1. Run the command. For real play it asks you to type `YES`.
2. A browser window opens. If BetKing asks you to log in, log in there (it remembers you afterwards). Then leave that window alone.
3. Watch the terminal: the plan, the bets placed, the countdown, the live scores, then the full report and "CARRIED FORWARD".

## Where things are saved
- Strategy memory (every deficit): `automation/artifacts/laliga-state.json`. A copy is made in `automation/artifacts/backups/` every time you start. This folder is not in GitHub on purpose, so copy it yourself if you move to another computer.
- Evidence for each run (screenshots, page text): `automation/artifacts/laliga-runs/<time>/`.

## If it stops
- `WAGER_UNCONFIRMED`: a bet may exist without confirmation. Check My Bets on BetKing. The next start sets that round aside.
- `RESULTS_UNAVAILABLE`: the round stays open. Run `npm run laliga:resume`.
- It asks you to log in: log in in the browser window and start it again.

## Keeping your deficits on the server (change device any time)
One time: `npm run laliga:sync-setup` (it asks for your backend address and the sync key, and tests the connection).
After that, automatically:
- **At every start** the newest state is fetched from the server when another device has saved a newer one.
- **After every settled round** (and at once on a 6-0 win) the strategy state is sent to the server.
By hand: `npm run laliga:push` (send), `npm run laliga:pull` (fetch; your old state is backed up), `npm run laliga:sync-status`.
If two devices both changed the state, it stops and tells you which version to keep. The server keeps the last 100 versions.
Add `--no-sync` to a run to skip syncing.
The server side is your existing BetKing API (`/betking`), edited to hold this state. See `README-BETKING-SYNC.md` in the backend files.

## The 6-0 tone
When a 6-0 comes in you get a banner, a pop-up and a ringtone (three times). Your own sound: `LALIGA_WIN_SOUND=/home/louis/win.mp3`. Silence it: `LALIGA_SOUND=off`.
