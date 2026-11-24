// WHEN to take the odds (pure, unit tested). One RUN = one "cycle": the odds of weeks 1 .. last week of one season, for a league.
//   waiting      nothing is recorded while the league is on week 25: it waits until week 1 is on screen
//   collecting   from the moment week 1 is on screen, every week on screen that is not recorded yet is recorded
//   done         all weeks recorded (38, the Bundesliga 34): the run for this league is finished
// The collector is started by hand, at any time, and stops when every league is done.

const RESUME_WITHIN_MS = 3 * 60 * 60 * 1000;   // a season is about 2 hours: a cycle left half done longer ago than this is stale

// At the start of a run: a finished cycle is history (a new run = a new cycle); a half-done cycle is carried on only if it
// is recent, otherwise it started in a season that is long over.
function startRun(state, now) {
  const s = { status: 'waiting', cycleId: null, recorded: [], ...state, recorded: [...(state?.recorded || [])] };
  const recent = s.updatedAt && now.getTime() - Date.parse(s.updatedAt) <= RESUME_WITHIN_MS;
  if (s.status === 'collecting' && recent) return { ...s, resumed: true };
  return { ...s, status: 'waiting', cycleId: null, recorded: [], missing: [], partial: false, completedAt: null, resumed: false };
}

function planVisit(state, { weeksOnScreen: seen, now, totalWeeks = 38 }) {
  const weeksOnScreen = seen.filter((week) => Number.isInteger(week) && week >= 1 && week <= totalWeeks);   // a week outside the season is a misread: ignored
  const s = { status: 'waiting', cycleId: null, recorded: [], ...state, recorded: [...(state?.recorded || [])] };
  if (s.status === 'done') return { state: s, record: [], note: 'this league is finished' };
  let order = weeksOnScreen;
  // Week 1 is on screen again while a cycle is half way: the season has ended. A cycle with at least 90% of its weeks is kept
  // (a week or two can be missed when the page rolls over while reading); a worse one starts again with the new season.
  if (s.status === 'collecting' && order.includes(1) && s.recorded.length >= Math.ceil(totalWeeks * 0.5)) {
    if (s.recorded.length >= Math.ceil(totalWeeks * 0.9)) {
      const missing = Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((week) => !s.recorded.includes(week));
      s.status = 'done';
      s.completedAt = now.toISOString();
      s.missing = missing;
      s.partial = missing.length > 0;
      return { state: s, record: [], finished: true, note: `the season ended with ${s.recorded.length}/${totalWeeks} weeks of odds (missing: ${missing.join(', ') || 'none'})` };
    }
    s.cycleId = now.toISOString();
    s.recorded = [];
    order = order.slice(order.indexOf(1));
    return { state: s, record: order, restarted: true, note: 'too many weeks were missed; starting again with the new season' };
  }
  if (s.status === 'waiting') {
    const first = order.indexOf(1);
    if (first === -1) return { state: s, record: [], note: `waiting for week 1 (on screen: ${weeksOnScreen.length ? `Week ${weeksOnScreen.join(', ')}` : 'nothing'})` };
    s.status = 'collecting';
    s.cycleId = now.toISOString();
    s.recorded = [];
    order = order.slice(first);   // only the new season: weeks before the 1 belong to the old one
  }
  return { state: s, record: order.filter((week) => !s.recorded.includes(week)) };
}

function markRecorded(state, weeks, totalWeeks, now) {
  const recorded = [...new Set([...state.recorded, ...weeks])].sort((a, b) => a - b);
  const finished = recorded.length >= totalWeeks;
  return { ...state, recorded, status: finished ? 'done' : state.status, missing: finished ? [] : state.missing, partial: finished ? false : state.partial, completedAt: finished ? now.toISOString() : state.completedAt || null, updatedAt: now.toISOString() };
}

module.exports = { planVisit, markRecorded, startRun, RESUME_WITHIN_MS };
