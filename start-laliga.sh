#!/usr/bin/env bash
# Start the RESULTS RECORDER (records the results of the four BetKing virtual leagues, sends signals; it never bets).
#   bash start-laliga.sh            records round after round until you press Ctrl-C (starts at once, no question)
#   bash start-laliga.sh one        one visit to every league, then stops (a quick check)
#   anything after the mode is passed on, for example:  bash start-laliga.sh play --league epl,laliga
# Stop it at any time with Ctrl-C (once: it finishes the visit it is on safely).
set -u
cd "$(dirname "$0")" || exit 1
MODE="${1:-play}"
shift || true
EXTRA=("$@")

if ! command -v node >/dev/null 2>&1; then echo "Node.js is not installed or not on the PATH."; exit 1; fi
[ -f observer-run.js ] || { echo "observer-run.js not found here. Run this from the project folder."; exit 1; }

echo "Checking the installation..."
node check-install.js | tail -1

case "$MODE" in
  play)   echo; echo "Starting the RESULTS RECORDER: it records results and sends signals, it never bets."; exec node observer-run.js ${EXTRA[@]+"${EXTRA[@]}"} ;;
  one)    exec node observer-run.js --once ${EXTRA[@]+"${EXTRA[@]}"} ;;
  server) exec node observer-run.js --headless ${EXTRA[@]+"${EXTRA[@]}"} ;;   # no browser window (for the Oracle server)
  probe)  exec node observer-run.js --odds-probe ${EXTRA[@]+"${EXTRA[@]}"} ;;
  *)      echo "Unknown mode '$MODE'. Use: play | one | server"; exit 1 ;;
esac
