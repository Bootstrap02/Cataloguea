// The ODDS HUNTER for one league. Every visit (every 10 minutes): look at which weeks are on screen, let the cycle rules
// decide what is still needed (oddsCycle.js), read exactly those weeks' odds, store them, and finish the cycle when every
// week is in. The page itself is behind `reader` (oddsPage.js), so all of this logic can be tested without a browser.
//   reader.peekWeeks(league)          -> [29, 30, 31, 32]   the weeks on screen, oldest first
//   reader.readOdds(league, [29, 30]) -> [{ week, home, away, odds: { HTFT: {...}, TG: {...}, CS: {...}, HTCS: {...} } }]
const { planVisit, markRecorded, startRun } = require('./oddsCycle');
const { SELECTION_LIST } = require('./options');


// A week is stored only when every fixture of the round is there with every market group read completely.
function completeWeeks(fixtures, league) {
  const byWeek = new Map();
  for (const fixture of fixtures) (byWeek.get(fixture.week) || byWeek.set(fixture.week, []).get(fixture.week)).push(fixture);
  const good = [];
  for (const [week, list] of byWeek) {
    const whole = list.length === league.perRound && list.every((fixture) => Object.entries(SELECTION_LIST).every(([group, labels]) => labels.every((label) => Number.isFinite(fixture.odds?.[group]?.[label]))));
    if (whole) good.push(week);
  }
  return good;
}

function createOddsHunter({ league, store, reader, log = () => {}, now = () => new Date(), onStored = () => {}, onFinished = () => {}, noteEveryMs = 5 * 60 * 1000 }) {
  let lastNote = null;
  let lastNoteAt = 0;
  // the collector looks every few seconds: the same waiting note is printed again only every 5 minutes
  const say = (note) => { const at = now().getTime(); if (note !== lastNote || at - lastNoteAt >= noteEveryMs) { lastNote = note; lastNoteAt = at; log(`  [odds ${league.key}] ${note}.`); } };
  // A new run begins: a finished cycle is history, a recent half-done one is carried on (see oddsCycle.startRun)
  function begin() {
    const state = startRun(store.loadState(), now());
    store.saveState(state);
    return state;
  }

  async function visit() {
    const current = now();
    const state = store.loadState();
    const weeks = await reader.peekWeeks(league);
    const plan = planVisit(state, { weeksOnScreen: weeks, now: current, totalWeeks: league.weeks });
    if (plan.finished) {
      const completeCycles = [...(state.completeCycles || []), plan.state.cycleId];
      store.saveState({ ...plan.state, completeCycles });
      log(`  [odds ${league.key}] CYCLE COMPLETE: ${plan.note}.`);
      onFinished({ cycleId: plan.state.cycleId, recorded: plan.state.recorded, missing: plan.state.missing, partial: plan.state.partial });
      return { status: 'done', recorded: 0, justFinished: true, cycleId: plan.state.cycleId };
    }
    if (!plan.record.length) {
      store.saveState({ ...state, ...plan.state });
      if (plan.note) say(plan.note);
      return { status: plan.state.status, recorded: 0 };
    }
    if (plan.restarted) log(`  [odds ${league.key}] ${plan.note}.`);
    const fixtures = await reader.readOdds(league, plan.record);
    const good = completeWeeks(fixtures, league);
    const toStore = fixtures.filter((fixture) => good.includes(fixture.week));
    const lines = store.append(plan.state.cycleId, toStore, current);
    const next = markRecorded(plan.state, good, league.weeks, current);
    const completeCycles = [...(state.completeCycles || [])];
    const justFinished = next.status === 'done' && plan.state.status !== 'done';
    if (justFinished) completeCycles.push(next.cycleId);
    store.saveState({ ...next, completeCycles });
    if (toStore.length) onStored({ cycleId: next.cycleId, fixtures: toStore });
    if (justFinished) onFinished({ cycleId: next.cycleId, recorded: next.recorded, missing: [], partial: false });
    const missing = plan.record.filter((week) => !good.includes(week));
    log(`  [odds ${league.key}] ${current.toISOString().slice(11, 16)}Z recorded Week ${good.join(', ') || '-'} (${lines} odds). Cycle ${next.recorded.length}/${league.weeks} weeks.${missing.length ? ` Not complete yet: Week ${missing.join(', ')} (tried again next visit).` : ''}`);
    if (justFinished) log(`  [odds ${league.key}] CYCLE COMPLETE: all ${league.weeks} weeks of odds are in. Nothing more until tomorrow.`);
    return { status: next.status, recorded: good.length, justFinished, cycleId: next.cycleId };
  }
  return { visit, begin };
}

module.exports = { createOddsHunter, completeWeeks };
