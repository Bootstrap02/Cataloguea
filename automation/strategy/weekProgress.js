// Which game week is about to be played, and whether it follows the last week this
// project settled. The week comes from the round LABEL on the real schedule ("Week 7"),
// never from a countdown alone, and is reconciled with persisted progress (1-38, 38 -> 1).

const fs = require('node:fs');
const path = require('node:path');
const { nextWeek, parseWeek } = require('./seasonWeek');

const WEEK_RECONCILIATION = Object.freeze({
  FIRST_RUN: 'FIRST_RUN',
  EXPECTED: 'EXPECTED',
  REPEAT: 'REPEAT',
  GAP: 'GAP',
});

// The upcoming round is the FIRST listed round with a parseable week label (the page lists
// rounds soonest first, and the first carries the running countdown). The countdown text is
// reported for the person to compare; it is never used to choose the week.
function detectUpcomingRound(snapshot) {
  const rounds = Array.isArray(snapshot?.rounds) ? snapshot.rounds : [];
  for (let index = 0; index < rounds.length; index += 1) {
    const label = rounds[index].roundName ?? rounds[index].name ?? rounds[index].round ?? '';
    const week = parseWeek(String(label));
    if (week !== null) {
      return {
        status: 'DETECTED',
        week,
        roundName: String(label),
        timer: String(rounds[index].timer ?? rounds[index].countdown ?? ''),
        position: index,
        visibleWeeks: rounds.map((round) => parseWeek(String(round.roundName ?? round.name ?? ''))).filter((value) => value !== null),
      };
    }
  }
  return { status: 'NONE', week: null, visibleWeeks: [] };
}

// lastSettledWeek is the last week this project settled (null on a first run).
function reconcileWeek({ detectedWeek, lastSettledWeek = null }) {
  if (parseWeek(detectedWeek) === null) {
    return { status: 'INVALID', ok: false, reason: `Detected week ${detectedWeek} is not a valid game week.` };
  }
  if (lastSettledWeek === null || lastSettledWeek === undefined) {
    return { status: WEEK_RECONCILIATION.FIRST_RUN, ok: true, expectedWeek: null, reason: 'No earlier progress is recorded; the visible upcoming week is taken as the starting point.' };
  }
  const expected = nextWeek(lastSettledWeek).week;
  if (detectedWeek === expected) {
    return { status: WEEK_RECONCILIATION.EXPECTED, ok: true, expectedWeek: expected, reason: `Week ${detectedWeek} follows the last settled week ${lastSettledWeek}.` };
  }
  if (detectedWeek === lastSettledWeek) {
    return { status: WEEK_RECONCILIATION.REPEAT, ok: false, expectedWeek: expected, reason: `Week ${detectedWeek} was already settled; the schedule has not advanced.` };
  }
  return { status: WEEK_RECONCILIATION.GAP, ok: false, expectedWeek: expected, reason: `The upcoming week is ${detectedWeek} but week ${expected} was expected after week ${lastSettledWeek}; weeks may have passed unprocessed.` };
}

function readProgress(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const week = parseWeek(data?.lastSettledWeek);
    return { lastSettledWeek: week, updatedAt: data?.updatedAt ?? null };
  } catch (error) {
    return { lastSettledWeek: null, updatedAt: null };
  }
}

function writeProgress(filePath, lastSettledWeek) {
  if (parseWeek(lastSettledWeek) === null) throw new RangeError(`Cannot record invalid week ${lastSettledWeek}.`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify({ lastSettledWeek, updatedAt: new Date().toISOString() }, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

module.exports = {
  WEEK_RECONCILIATION,
  detectUpcomingRound,
  readProgress,
  reconcileWeek,
  writeProgress,
};
