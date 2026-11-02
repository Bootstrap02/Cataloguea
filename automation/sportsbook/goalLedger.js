// Which side scored each goal. The live list prints the goal minutes under each score, but in the page text a home
// minute looks exactly like an away minute (both "43'"), so the side cannot be read from the minute itself.
// Instead it is learned while the match is watched: whenever one new minute appears at the same moment one side's
// score goes up by one, that minute belongs to that side. At full time, the minutes that were never seen being
// scored are placed by the counts (all to one side when the other scored nothing), and only when both sides
// scored and nothing was learned are they split in the order the page prints them (home first).

function createGoalLedger() {
  const fixtures = new Map();   // 'HOME-AWAY' -> { score, tokens, learned: [{ minute, side }] }

  const countOf = (list, minute) => list.filter((value) => value === minute).length;

  function observe(items) {
    for (const item of items) {
      const key = `${item.home}-${item.away}`;
      const tokens = item.tokens ?? null;
      const entry = fixtures.get(key) ?? { score: { home: 0, away: 0 }, tokens: [], learned: [] };
      if (tokens) {
        const added = [];
        for (const minute of new Set(tokens)) {
          const extra = countOf(tokens, minute) - countOf(entry.tokens, minute);
          for (let i = 0; i < extra; i += 1) added.push(minute);
        }
        const dHome = item.score.home - entry.score.home;
        const dAway = item.score.away - entry.score.away;
        if (added.length === 1 && dHome + dAway === 1 && dHome >= 0 && dAway >= 0) {
          entry.learned.push({ minute: added[0], side: dHome === 1 ? 'home' : 'away' });
        } else if (added.length === 2 && dHome + dAway === 2 && ((dHome === 2 && dAway === 0) || (dHome === 0 && dAway === 2))) {
          const side = dHome === 2 ? 'home' : 'away';
          for (const minute of added) entry.learned.push({ minute, side });
        }
        entry.tokens = [...tokens];
      }
      entry.score = { ...item.score };
      fixtures.set(key, entry);
    }
  }

  // { home: [minutes], away: [minutes] } or null when the minutes cannot be matched to the score.
  function resolve(item) {
    const tokens = item.tokens ?? null;
    if (!tokens || tokens.length !== item.score.home + item.score.away) return null;
    const entry = fixtures.get(`${item.home}-${item.away}`);
    const home = [];
    const away = [];
    const unknown = [...tokens];
    for (const { minute, side } of entry ? entry.learned : []) {
      const index = unknown.indexOf(minute);
      if (index === -1) continue;
      unknown.splice(index, 1);
      (side === 'home' ? home : away).push(minute);
    }
    const needHome = item.score.home - home.length;
    const needAway = item.score.away - away.length;
    if (needHome < 0 || needAway < 0 || needHome + needAway !== unknown.length) return null;
    if (needHome === 0) away.push(...unknown);
    else if (needAway === 0) home.push(...unknown);
    else { home.push(...unknown.slice(0, needHome)); away.push(...unknown.slice(needHome)); }
    return { home: home.sort((a, b) => a - b), away: away.sort((a, b) => a - b) };
  }

  return { observe, resolve };
}

module.exports = { createGoalLedger };
