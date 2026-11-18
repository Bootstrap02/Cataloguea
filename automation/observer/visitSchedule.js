// Who is due next. Each league is visited every `everyMin` minutes, counted from the START of its last visit.
function createVisitSchedule(leagues, now = () => Date.now()) {
  const next = new Map(leagues.map((league) => [league.key, now()]));   // everything is due at once on launch
  return {
    due: () => leagues.filter((league) => next.get(league.key) <= now()).sort((a, b) => next.get(a.key) - next.get(b.key)),
    done: (league, startedAt) => next.set(league.key, startedAt + league.everyMin * 60000),
    nextAt: (league) => next.get(league.key),
    soonest: () => Math.min(...leagues.map((league) => next.get(league.key))),
  };
}
module.exports = { createVisitSchedule };
