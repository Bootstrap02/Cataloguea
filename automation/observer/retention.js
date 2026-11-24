// RETENTION: the record book must not grow for ever.
//   * when the matches on file span MORE than `keepDays` (183 days, about 6 months), the OLDEST `dropDays` (30 days) are removed
//   * it is checked once a day, so in practice it happens about once a month: 183 days -> 153 days -> 183 days -> ...
//   * the newest records are never touched; the state's list of seasons is trimmed to the seasons that still have matches
// "Days" are measured from the time each match was recorded (observedAt).
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const DAY = 86400000;

// Streams the file (it can be 100 MB+), so memory stays small.
async function pruneMatchesFile({ file, now = new Date(), keepDays = 183, dropDays = 30 }) {
  if (!fs.existsSync(file)) return { pruned: 0, kept: 0, spanDays: 0 };
  // pass 1: the oldest and newest record times
  let oldest = Infinity;
  let newest = -Infinity;
  let total = 0;
  const first = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of first) {
    if (!line) continue;
    let time;
    try { time = Date.parse(JSON.parse(line).observedAt); } catch (error) { continue; }
    if (!Number.isFinite(time)) continue;
    total += 1;
    if (time < oldest) oldest = time;
    if (time > newest) newest = time;
  }
  const spanDays = total ? (Math.max(newest, now.getTime()) - oldest) / DAY : 0;
  if (!total || spanDays <= keepDays) return { pruned: 0, kept: total, spanDays: Math.round(spanDays * 10) / 10 };
  // pass 2: keep everything from (oldest + dropDays) on
  const cutoff = oldest + dropDays * DAY;
  const temporary = `${file}.tmp`;
  const out = fs.createWriteStream(temporary, 'utf8');
  let kept = 0;
  let pruned = 0;
  let minSeason = Infinity;
  const second = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of second) {
    if (!line) continue;
    let record;
    try { record = JSON.parse(line); } catch (error) { continue; }
    if (Date.parse(record.observedAt) < cutoff) { pruned += 1; continue; }
    out.write(`${line}\n`);
    kept += 1;
    if (record.season < minSeason) minSeason = record.season;
  }
  await new Promise((resolve, reject) => { out.end(resolve); out.on('error', reject); });
  fs.renameSync(temporary, file);   // never a half-written file
  return { pruned, kept, spanDays: Math.round(spanDays * 10) / 10, cutoff: new Date(cutoff).toISOString(), minSeason: Number.isFinite(minSeason) ? minSeason : null };
}

// One league's folder: the matches file and the list of seasons in state.json
async function pruneObserverRecords({ dir, league, now = new Date(), keepDays = 183, dropDays = 30 }) {
  const folder = path.join(dir, league.key);
  const result = await pruneMatchesFile({ file: path.join(folder, 'matches.ndjson'), now, keepDays, dropDays });
  if (result.pruned > 0 && result.minSeason !== null) {
    const stateFile = path.join(folder, 'state.json');
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      for (const number of Object.keys(state.seasons || {})) if (Number(number) < result.minSeason) delete state.seasons[number];
      state.lastPruneAt = now.toISOString();
      const temporary = `${stateFile}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
      fs.renameSync(temporary, stateFile);
    } catch (error) { /* no state yet */ }
  }
  return result;
}

module.exports = { pruneMatchesFile, pruneObserverRecords, DAY };
