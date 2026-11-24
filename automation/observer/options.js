// THE 22 STAKE OPTIONS the owner wants recorded, seen from ONE TEAM's point of view ("Arsenal 4-0" = Arsenal won 4-0,
// "0-2" = the team LOST 0-2). Each option says (a) when a finished match counts as a hit for a team, and (b) which
// selection of the fixture's odds list holds the odds for that team, depending on whether the team is home or away.
//   HT/FT      1X  leads at half-time, draw at full time     12  leads at half-time, loses     21  trails at half-time, wins
//   Total goals 0 goals, 6 goals (the match total at full time: the same for both teams)
//   Correct score  draws 2-2, 3-3 | wins 4-0 4-1 4-2 5-0 5-1 6-0 3-2 | losses 0-2 0-3 1-3 2-3 0-4 1-4   (team goals first)
//   HT correct score  the team trails 0-3 or 1-2 at half-time
const flip = (score) => score.split('-').reverse().join('-');

const OPTIONS = [];
const add = (option) => OPTIONS.push(Object.freeze(option));

// HT/FT. Selections on the site are written home/away: 1 = home, X = draw, 2 = away.
add({ id: 'HTFT_1X', group: 'HTFT', label: 'HT/FT 1X (leads at half-time, draw at full time)', hit: (t) => t.ht.diff > 0 && t.ft.diff === 0, selection: (side) => (side === 'HOME' ? '1/X' : '2/X') });
add({ id: 'HTFT_12', group: 'HTFT', label: 'HT/FT 12 (leads at half-time, loses at full time)', hit: (t) => t.ht.diff > 0 && t.ft.diff < 0, selection: (side) => (side === 'HOME' ? '1/2' : '2/1') });
add({ id: 'HTFT_21', group: 'HTFT', label: 'HT/FT 21 (trails at half-time, wins at full time)', hit: (t) => t.ht.diff < 0 && t.ft.diff > 0, selection: (side) => (side === 'HOME' ? '2/1' : '1/2') });

// Total goals
add({ id: 'TG_0', group: 'TG', label: 'Total goals 0', hit: (t) => t.ft.total === 0, selection: () => '0' });
add({ id: 'TG_6', group: 'TG', label: 'Total goals 6', hit: (t) => t.ft.total === 6, selection: () => '6' });

// Full-time correct score, in the team's own direction
const scoreOption = (group, prefix, kind, score, usesHalf) => add({
  id: `${prefix}_${score}`,
  group,
  label: `${usesHalf ? 'HT correct score' : 'Correct score'} ${score} (${kind})`,
  hit: (t) => `${(usesHalf ? t.ht : t.ft).own}-${(usesHalf ? t.ht : t.ft).opp}` === score,
  selection: (side) => (side === 'HOME' ? score : flip(score)),
});
for (const score of ['2-2', '3-3']) scoreOption('CS', 'CS', 'draw', score, false);
for (const score of ['4-0', '4-1', '4-2', '5-0', '5-1', '6-0', '3-2']) scoreOption('CS', 'CS', 'win', score, false);
for (const score of ['0-2', '0-3', '1-3', '2-3', '0-4', '1-4']) scoreOption('CS', 'CS', 'loss', score, false);
// Half-time correct score: the team trails
for (const score of ['0-3', '1-2']) scoreOption('HTCS', 'HTCS', 'trails at half-time', score, true);

const BY_ID = Object.freeze(Object.fromEntries(OPTIONS.map((option) => [option.id, option])));

// Every selection that has to be read from the page, per market group (home and away views together).
const SELECTIONS = {};
for (const option of OPTIONS) {
  const set = SELECTIONS[option.group] || (SELECTIONS[option.group] = new Set());
  set.add(option.selection('HOME'));
  set.add(option.selection('AWAY'));
}
const SELECTION_LIST = Object.freeze(Object.fromEntries(Object.entries(SELECTIONS).map(([group, set]) => [group, [...set]])));

// One finished match, from one team's side -> the ids of the options that hit
function teamView(match, side) {
  const [htHome, htAway] = match.ht;
  const [ftHome, ftAway] = match.ft;
  const own = side === 'HOME' ? [htHome, ftHome] : [htAway, ftAway];
  const opp = side === 'HOME' ? [htAway, ftAway] : [htHome, ftHome];
  return {
    ht: { own: own[0], opp: opp[0], diff: own[0] - opp[0], total: htHome + htAway },
    ft: { own: own[1], opp: opp[1], diff: own[1] - opp[1], total: ftHome + ftAway },
  };
}
function optionsHit(match, side) {
  const view = teamView(match, side);
  return OPTIONS.filter((option) => option.hit(view)).map((option) => option.id);
}

// The odds of an option for a team in one fixture: fixtureOdds = { HTFT: { '1/X': 13.7 }, CS: { '6-0': 424 }, ... }
function oddsFor(optionId, fixtureOdds, side) {
  const option = BY_ID[optionId];
  const value = fixtureOdds?.[option.group]?.[option.selection(side)];
  return Number.isFinite(value) ? value : null;
}

module.exports = { OPTIONS, BY_ID, SELECTION_LIST, optionsHit, oddsFor, flip, teamView };
