# Cataloguea RESULTS RECORDER

Reads the results of the four BetKing virtual leagues, keeps the record book, and turns it into signals (email + Telegram) using the
rules of engagement. **It never places a bet, never types, never logs in.** It does not take odds: the odds collector (the other
project) does that and uploads them to the shared database, and this program fetches them.

## Set up once (on your laptop to try it, then on Oracle)
1. `npm install`   (and `npx playwright install chromium` only if Chrome is not installed)
2. `npm run laliga:sync-setup`   (the backend address and the sync key: the SAME key the odds collector uses)
3. The backend needs the odds routes (see the backend folder) and `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
4. **On Oracle:** the Oracle project (`cataloguea-oracle`) builds the server and runs `deploy/oracle/setup-server.sh` for you. See its RUNBOOK.md.

## Run
- `./launch.sh`                  records until Ctrl-C (starts at once, asks nothing)
- `bash start-laliga.sh one`     ONE visit to every league, then stops. **Do this first and watch the browser.**
- `bash start-laliga.sh server`  no browser window (on a laptop; the Oracle service uses a virtual screen instead, see deploy/oracle/run-server.sh)
- `npm run table`                the PERCENTILE TABLE: every team x every stake option (CSV + a summary of what is closest to triggering)
- `npm run report`               the charts (a CSV per league of how many seasons each option has missed)
- `npm run check:betking`        can THIS machine reach BetKing? (run it on the Oracle server first)
- on Oracle only: `deploy/oracle/watchdog.sh` checks every 10 minutes that the recorder is running AND recording, restarts it if stuck, and tells you by Telegram + email
- `npm run test:observer`        35 focused recorder tests

## What it does
- Every 25 minutes (Bundesliga 12) it opens each league's Results window and records the rounds it has not recorded. The window keeps
  only the last 10 rounds = 30 minutes (Bundesliga 15), so a visit that fails is retried after 2 minutes.
- A season missing any week (a "GAP") is kept, but never counts as a season without a result, so it can never cause a false signal.
- At start and then every 30 minutes (so also at 12 a.m. every day) it asks the database for the odds the collector completed, and keeps
  them in its own local odds state. A new cycle replaces the old one.
- THE PERCENTILE TABLE: for each team and each of the 22 stake options, the percentile = the average of the highest quarter of the team's
  odds (38 odds -> the 10 biggest, 34 -> the 9 biggest). Bands of 8: 16 and below needs 2 seasons without the option and a stake target
  of N500, 17-24 needs 3 and N1000, 25-32 needs 4 and N1500, ... The seasons keep growing, the stake stops at N2500. `multiplier` in
  `automation/observer/rules-of-engagement/rules.json` multiplies the stakes. The table is rebuilt after every new odds cycle and every completed season.
- When a row is TRIGGERED a signal goes out (email + Telegram) with the team's full name. It is sent once, and again only if it grows
  (one more season missed) or the stake changes.
- RETENTION: every day it checks the age of the records. When they span more than 183 days (about 6 months) the OLDEST 30 days are
  removed, so about once a month. The newest records are never touched.
- Own browser profile `observer`, never logged in to your betting account.

## Where things are
`automation/artifacts/observer/<epl|laliga|seriea|bundesliga>/`: matches.ndjson, state.json, odds.ndjson, percentile-table.csv/.json,
charts.csv. `observer.log`. `evidence/` (screenshots and page text when a visit fails: send me these if a league fails).

## Tested / not tested
Tested: the parser, record book (resume, repeats, seasons, gaps), odds cycle, percentile table, rules, signals, retention, the
collector -> database -> recorder hand-over, and this program in a real browser against a mock page built from your video.
NOT tested: the real BetKing site (the first `one` run is the test), the Oracle server (run `check:betking` there), and whether the
Results window opens without a login.
**Never push `laliga-sync.json` to GitHub: it holds the sync key. It is in `.gitignore`.**
