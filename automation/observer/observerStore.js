// The record book. One folder per league under automation/artifacts/observer/<league>/:
//   matches.ndjson   one line per match, never rewritten: season, week, round clock, teams, half-time, full-time
//   state.json       where the observer stopped: the season, the last week recorded, and the cards already seen
// "Start from where you stopped": a card that was already recorded is recognised by what it shows and skipped, so each
// visit adds only the new weeks. A week number that goes DOWN means a new season has begun.
const fs = require('node:fs');
const path = require('node:path');

function createObserverStore({ dir, league, now = () => new Date() }) {
  const folder = path.join(dir, league.key);
  const matchesFile = path.join(folder, 'matches.ndjson');
  const stateFile = path.join(folder, 'state.json');
  fs.mkdirSync(folder, { recursive: true });

  function load() {
    try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (error) {
      return { season: 0, lastWeek: 0, leagueId: null, seen: [], seasons: {} };
    }
  }
  function save(state) {
    const temporary = `${stateFile}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(temporary, stateFile);   // never a half-written state file
  }

  // cards: as parsed (newest first). Returns what was recorded.
  function ingest(cards) {
    const state = load();
    const seen = new Set(state.seen);
    const fresh = cards.filter((card) => card.complete && !seen.has(card.key)).reverse();   // oldest first
    const events = [];
    const lines = [];
    for (const card of fresh) {
      if (state.season === 0 || card.week <= state.lastWeek) {
        // the first card ever, or a week number that did not go up: a new season
        if (state.season > 0 && state.seasons[state.season]) state.seasons[state.season].endedAt = now().toISOString();
        state.season += 1;
        state.seasons[state.season] = { startedAt: now().toISOString(), firstWeek: card.week, partial: card.week > 1, complete: false, weeks: 0 };
        events.push({ type: 'season-started', season: state.season, firstWeek: card.week, partial: card.week > 1 });
      }
      const season = state.seasons[state.season];
      state.lastWeek = card.week;
      state.leagueId = card.leagueId;
      season.weeks += 1;
      if (card.week >= league.weeks) { season.complete = true; events.push({ type: 'season-complete', season: state.season }); }
      for (const row of card.rows) {
        lines.push(JSON.stringify({
          season: state.season, week: card.week, leagueId: card.leagueId, clock: card.clock, position: row.position,
          home: row.home, away: row.away, ht: row.ht, ft: row.ft, observedAt: now().toISOString(),
        }));
      }
      seen.add(card.key);
      events.push({ type: 'week', season: state.season, week: card.week, matches: card.rows.length });
    }
    if (lines.length) fs.appendFileSync(matchesFile, `${lines.join('\n')}\n`);
    state.seen = [...seen].slice(-80);   // the cards of the last ~8 visits are enough to recognise a repeat
    state.lastVisitAt = now().toISOString();
    save(state);
    return { added: fresh.length, matches: lines.length, events, state };
  }

  return { ingest, load, folder, matchesFile };
}

module.exports = { createObserverStore };
