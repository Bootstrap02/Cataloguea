# La Liga automation: how to run it

## Start it
In a terminal, in the project folder (`cd ~/Bootworks/Cataloguea`):

| What you want | Command |
| --- | --- |
| Play round after round (real bets; asks you to type YES) | `npm run laliga:play` |
| See the plan for one round, place nothing | `npm run laliga` |
| Play one real round, then stop | `npm run laliga:one` |
| Settle a round that was left open | `npm run laliga:resume` |
| Read all 20 teams' odds, place nothing | `npm run laliga:scan` |
| Play with your other BetKing login | `bash start-laliga.sh play --account second` |

First time only: `node add-laliga-scripts.js` (creates those short commands). A desktop icon that does `play` for you:
`bash make-shortcut.sh`.

## While it runs: pause, continue, stop
Single keys in the terminal, or the buttons on the control page **http://localhost:4545** (it opens only on this computer):

| Key | Button | What it does |
| --- | --- | --- |
| `p` | Pause after this round | The round in hand is finished and settled first. Then nothing is placed, and **everything is sent to the server**. |
| `c` | Continue | The **newest state is fetched from the server first** (if another device played), then it carries on. |
| `s` | Stop after this round | Finishes and settles the round in hand, then ends. (Ctrl-C does the same.) |
| `x` | Stop now | At once. A round with bets already placed stays open. (Ctrl-C twice does the same.) |
| `u` | Send to server | Sends this device's state now. |
| `d` | Get from server | Replaces this device's state with the server's (only while paused; a backup is kept). |

## Changing the BetKing account
1. Pause. Wait until it says **paused** (the state is now on the server).
2. In the browser window it opened, log out and log in with the other account. (Its balance shows on the control page.)
3. Continue. It fetches the newest state first, then carries on with the same deficits on the new account.
Or keep two logins ready: `bash start-laliga.sh play --account second` uses its own saved login, and your first stays untouched.

## Keeping your deficits on the server (change device any time)
One time: `npm run laliga:sync-setup`. It asks only for your backend address (for example `https://your-backend.vercel.app`).
No tokens or keys. (A key is optional: only if you set `LALIGA_SYNC_KEY` on the backend.)
- Every start: the newest state is fetched if another device saved a newer one.
- After every settled round (and at once on a 6-0): the state is sent.
- Pause sends everything; Continue fetches the newest.
If two devices both changed the state, it stops and tells you which version to keep. The server keeps the last 100 versions.
By hand: `npm run laliga:push`, `npm run laliga:pull`, `npm run laliga:sync-status`. Skip it for one run with `--no-sync`.
The server side is your existing BetKing API (`/betking`): see `backend/README-BETKING-SYNC.md`.

## The 6-0 tone
A banner, a pop-up and a ringtone (three times) the moment a 6-0 is known. Your own sound: `LALIGA_WIN_SOUND=/home/louis/win.mp3`.
Silence it: `LALIGA_SOUND=off`.

## On an Oracle server
See `deploy/oracle/README-ORACLE.md`. It runs as a service that starts at boot (paused until you press Continue).

## Where things are saved
- Strategy memory (every deficit): `automation/artifacts/laliga-state.json`. A copy is made in `automation/artifacts/backups/`
  at each start. This folder is not in GitHub on purpose.
- Evidence for each run (screenshots, page text): `automation/artifacts/laliga-runs/<time>/`.

## If it stops
- `WAGER_UNCONFIRMED`: a bet may exist without confirmation. Check My Bets on BetKing.
- `RESULTS_UNAVAILABLE`: the round stays open. Run `npm run laliga:resume`.
- It asks you to log in: log in in the browser window and press Continue (or start again).
