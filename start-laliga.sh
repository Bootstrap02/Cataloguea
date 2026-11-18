#!/usr/bin/env bash
# Start the OBSERVER (records the results of the four BetKing virtual leagues; it never bets).
#   bash start-laliga.sh            records round after round until you press Ctrl-C (starts at once, no question)
#   bash start-laliga.sh one        one visit to every league, then stops (a quick check)
#   anything after the mode is passed on, for example:  bash start-laliga.sh play --league epl,laliga
# Stop it at any time with Ctrl-C (once: it finishes the visit it is on safely).
set -u
cd "$(dirname "$0")" || exit 1
MODE="${1:-play}"
shift || true
# anything else you type after the mode is passed on, e.g.  bash start-laliga.sh play --no-sync   or   --account second
EXTRA=("$@")

if ! command -v node >/dev/null 2>&1; then echo "Node.js is not installed or not on the PATH."; exit 1; fi
[ -f observer-run.js ] || { echo "observer-run.js not found here. Run this from the project folder."; exit 1; }

echo "Checking the installation..."
node check-install.js | tail -1

case "$MODE" in
  play)   echo; echo "Starting the OBSERVER: it records the results, it never bets. Leave the browser window alone."; exec node observer-run.js ${EXTRA[@]+"${EXTRA[@]}"} ;;
  one)    exec node observer-run.js --once ${EXTRA[@]+"${EXTRA[@]}"} ;;
  *)      echo "Unknown mode '$MODE'. Use: play | one"; exit 1 ;;
esac
