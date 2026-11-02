// The live view of a round, as it looks on BetKing while the matches are played (your Oct 26 screenshots): a header
// with the selected fixture ("FT  CHE 0 - 1 ARS  89'" at the end) and, under "All Fixtures this round", ALL ten
// fixtures at once, each with its score and the minute of every goal ('35 for a home goal, 62' for an away goal).
// All ten matches run together, so the single FT badge means every match is over.

const { parseGoalMinutes, squash } = require('./betkingResultsModal');
const { halfTimeFromGoals } = require('../strategy/liveTracking');

const SCORE = /(?:^|\s)([A-Z]{2,4})\s+(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Z]{2,4})(?=\s|$)/g;

// Pure: every fixture on the page with its score and goal minutes, plus whether FT is showing and the match minute.
function parseBoard(text) {
  const flat = squash(text);
  const headingAt = flat.search(/All Fixtures this round/i);
  const scope = headingAt === -1 ? flat : flat.slice(headingAt);
  const found = new Map();
  for (const match of scope.matchAll(SCORE)) {
    const home = match[1];
    const away = match[4];
    const score = { home: Number(match[2]), away: Number(match[3]) };
    const goals = parseGoalMinutes(scope, match, score.home, score.away);
    const key = `${home}-${away}`;
    const previous = found.get(key);
    if (!previous || (!previous.goals && goals)) found.set(key, { home, away, score, goals });
  }
  const fullTime = /\bFT\b\s+[A-Z]{2,4}\s+\d{1,2}\s*-\s*\d{1,2}\s+[A-Z]{2,4}/.test(flat);
  const minuteMatch = /(\d{1,2})'\s+[A-Z]{2,4}\s+\d{1,2}\s*-\s*\d{1,2}\s+[A-Z]{2,4}/.exec(flat);
  return { fixtures: [...found.values()], fullTime, minute: !fullTime && minuteMatch ? Number(minuteMatch[1]) : null };
}

// results map { 'HOME-AWAY': { ft, ht } } for every fixture on the board (ht from the goal minutes; null when they
// could not be matched to the score).
function resultsFromBoard(board) {
  const results = {};
  for (const item of board.fixtures) {
    results[`${item.home}-${item.away}`] = { ft: { ...item.score }, ht: item.goals ? halfTimeFromGoals(item.goals) : null };
  }
  return results;
}

async function readBoard(page) {
  const text = await page.evaluate(() => document.body.innerText || '');
  return parseBoard(text);
}

module.exports = { parseBoard, resultsFromBoard, readBoard };
