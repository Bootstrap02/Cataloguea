#!/usr/bin/env bash
# Start the La Liga automation.
#   bash start-laliga.sh            plays round after round until you press Ctrl-C (starts at once, no question)
#   bash start-laliga.sh dry        reads the odds and shows the plan for one round; places NOTHING
#   bash start-laliga.sh one        plays ONE real round, then stops
#   bash start-laliga.sh resume     settles a round that was left open (reads its result), then stops
#   bash start-laliga.sh scan       reads all 20 teams' odds and the stakes the strategy would give; places nothing
#   bash start-laliga.sh sync-setup | push | pull   keep the strategy memory on your server (see README-LALIGA.md)
# Stop it at any time with Ctrl-C (once: it finishes the step it is on safely).
set -u
cd "$(dirname "$0")" || exit 1
MODE="${1:-play}"
shift || true
# anything else you type after the mode is passed on, e.g.  bash start-laliga.sh play --no-sync   or   --account second
EXTRA=("$@")

if ! command -v node >/dev/null 2>&1; then echo "Node.js is not installed or not on the PATH."; exit 1; fi
[ -f laliga-run.js ] || { echo "laliga-run.js not found here. Run this from the project folder."; exit 1; }

# keep a copy of the strategy memory before every start (it is the record of all deficits)
STATE="automation/artifacts/laliga-state.json"
if [ -f "$STATE" ]; then
  mkdir -p automation/artifacts/backups
  cp "$STATE" "automation/artifacts/backups/laliga-state-$(date +%Y%m%d-%H%M%S).json"
  # keep only the 30 newest copies
  ls -1t automation/artifacts/backups/laliga-state-*.json 2>/dev/null | tail -n +31 | xargs -r rm -f
fi

echo "Checking the installation..."
node check-install.js | tail -1

confirm_real_money() {
  # No question any more: it starts at once. Log in to BetKing in the browser window if it asks (it remembers you).
  echo
  echo "Starting: REAL bets on BetKing, no stake cap. Leave the browser window alone."
}

case "$MODE" in
  # play = the daily cycle: work until 23:59, finish the round, save, rest, and start again every 72 hours (laliga-cycle.js)
  play)   confirm_real_money; AUTOMATION_ALLOW_REAL_MONEY=yes exec node laliga-cycle.js --auto-confirm --forever ${EXTRA[@]+"${EXTRA[@]}"} ;;
  one)    confirm_real_money; AUTOMATION_ALLOW_REAL_MONEY=yes exec node laliga-run.js --auto-confirm --rounds 1 ${EXTRA[@]+"${EXTRA[@]}"} ;;
  dry)    exec node laliga-run.js ${EXTRA[@]+"${EXTRA[@]}"} ;;
  resume) exec node laliga-run.js --resume ${EXTRA[@]+"${EXTRA[@]}"} ;;
  scan)   exec node laliga-scan.js ;;
  sync-setup) exec node laliga-sync.js setup ;;
  push)   exec node laliga-sync.js push ${EXTRA[@]+"${EXTRA[@]}"} ;;
  pull)   exec node laliga-sync.js pull ${EXTRA[@]+"${EXTRA[@]}"} ;;
  *)      echo "Unknown mode '$MODE'. Use: play | one | dry | resume | scan"; exit 1 ;;
esac