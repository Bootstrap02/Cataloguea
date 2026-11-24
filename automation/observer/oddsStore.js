// The ODDS DATABASE, kept on this computer (not in the backend). One folder per league under
// automation/artifacts/observer/<league>/:
//   odds.ndjson       one line per fixture selection: cycle, week, home, away, group, selection, odd
//   odds-state.json   where the current cycle stands, and the list of complete cycles
// groups: HTFT, TG (total goals), CS (correct score), HTCS (half-time correct score)
const fs = require('node:fs');
const path = require('node:path');

function createOddsStore({ dir, league }) {
  const folder = path.join(dir, league.key);
  const oddsFile = path.join(folder, 'odds.ndjson');
  const stateFile = path.join(folder, 'odds-state.json');
  fs.mkdirSync(folder, { recursive: true });

  const loadState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (error) { return { status: 'waiting', day: null, cycleId: null, recorded: [], completeCycles: [] }; } };
  function saveState(state) {
    const temporary = `${stateFile}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(temporary, stateFile);
  }

  // fixtures: [{ week, home, away, odds: { HTFT: { '1/X': 13.7 }, ... } }]
  function append(cycleId, fixtures, now = new Date()) {
    const lines = [];
    for (const fixture of fixtures) {
      for (const [group, selections] of Object.entries(fixture.odds)) {
        for (const [sel, odd] of Object.entries(selections)) {
          lines.push(JSON.stringify({ cycle: cycleId, week: fixture.week, home: fixture.home, away: fixture.away, group, sel, odd, observedAt: now.toISOString() }));
        }
      }
    }
    if (lines.length) fs.appendFileSync(oddsFile, `${lines.join('\n')}\n`);
    return lines.length;
  }

  function readCycle(cycleId) {
    try {
      return fs.readFileSync(oddsFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((record) => record.cycle === cycleId);
    } catch (error) { return []; }
  }

  // every cycle id that has odds in the file, oldest first
  function cycleIds() {
    try {
      const ids = [];
      for (const line of fs.readFileSync(oddsFile, 'utf8').split('\n')) {
        if (!line) continue;
        const id = JSON.parse(line).cycle;
        if (!ids.includes(id)) ids.push(id);
      }
      return ids;
    } catch (error) { return []; }
  }

  // The recorder receives a finished cycle from the shared database: stored here as a complete cycle (once).
  function importCycle(cycleId, records) {
    const state = loadState();
    if ((state.completeCycles || []).includes(cycleId)) return false;
    fs.appendFileSync(oddsFile, `${records.map((record) => JSON.stringify({ ...record, cycle: cycleId })).join('\n')}\n`);
    saveState({ ...state, completeCycles: [...(state.completeCycles || []), cycleId], pulledCycleId: cycleId });
    return true;
  }

  // keep only the lines of the cycles in `keep` (the file would otherwise grow for ever)
  function prune(keep) {
    try {
      const lines = fs.readFileSync(oddsFile, 'utf8').split('\n').filter(Boolean).filter((line) => keep.includes(JSON.parse(line).cycle));
      fs.writeFileSync(oddsFile, lines.length ? `${lines.join('\n')}\n` : '');
    } catch (error) { /* nothing to prune */ }
  }

  // The newest complete cycle: its odds are the ones the percentiles use.
  function latestCompleteRecords() {
    const state = loadState();
    const id = state.completeCycles[state.completeCycles.length - 1];
    return id ? readCycle(id) : [];
  }

  return { loadState, saveState, append, readCycle, cycleIds, importCycle, prune, latestCompleteRecords, folder, oddsFile };
}

module.exports = { createOddsStore };
