// Live match tracking. While the match plays, the main page shows our fixture's score and the match minute
// (header: "39'  BRE 0 - 1 AST", and "FT" at the end). The program reads it every second or two and keeps the
// history, so it can say how the match ended and what the score was at half-time without relying on the
// Results window.
//
// Halves (owner's rule): first half = minutes 1-45, second half = 46-90, no break between them.
// Half-time score = the score at the end of minute 45. It is only reported when the history PROVES it:
// the last observation at or before minute 45 and the first observation at or after minute 46 show the same
// score, so no goal can have fallen between them. Otherwise it is left unknown (null), never guessed.

function deriveHalfTime(history) {
  const withMinute = history.filter((entry) => Number.isInteger(entry.minute));
  const firstHalf = withMinute.filter((entry) => entry.minute <= 45);
  const secondHalf = withMinute.filter((entry) => entry.minute >= 46);
  if (firstHalf.length === 0 || secondHalf.length === 0) return { halfTime: null, reason: 'The match minute was not seen on both sides of half-time.' };
  const before = firstHalf[firstHalf.length - 1];
  const after = secondHalf[0];
  if (before.home === after.home && before.away === after.away) {
    return { halfTime: { home: before.home, away: before.away }, reason: null };
  }
  return { halfTime: null, reason: `A goal fell between minute ${before.minute} and minute ${after.minute}, so the half-time score cannot be told from the live view.` };
}

// history: [{ home, away, minute|null, finished }]. Returns the tracked outcome once the match is finished.
function summarizeTracking(history) {
  const finished = history.length > 0 && history[history.length - 1].finished === true;
  if (!finished) return { finished: false, fullTime: null, halfTime: null, halfTimeReason: 'The match has not finished.' };
  const last = history[history.length - 1];
  const { halfTime, reason } = deriveHalfTime(history.filter((entry) => !entry.finished));
  return { finished: true, fullTime: { home: last.home, away: last.away }, halfTime, halfTimeReason: reason };
}

module.exports = { deriveHalfTime, summarizeTracking };
