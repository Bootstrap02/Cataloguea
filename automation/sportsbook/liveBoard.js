// The live view of a round, as it looks on BetKing while the matches are played (your Oct 26 screenshots): a header
// with the selected fixture ("FT  CHE 0 - 1 ARS  89'" at the end) and, under "All Fixtures this round", ALL ten
// fixtures at once, each with its score and the minute of every goal ('35 for a home goal, 62' for an away goal).
// All ten matches run together, so the single FT badge means every match is over.

const { squash } = require('./betkingResultsModal');
const { halfTimeFromGoals } = require('../strategy/liveTracking');
const { createGoalLedger } = require('./goalLedger');

const SCORE = /(?:^|\s)([A-Z]{2,4})\s+(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Z]{2,4})(?=\s|$)/g;

// Every goal minute printed under a score, in the order the page prints them. A home minute and an away minute look
// the same in the page text ("43'"), so which side scored is decided later (see goalLedger.js).
function goalTokens(scope, match, score) {
  const after = scope.slice(match.index + match[0].length, match.index + match[0].length + 140);
  const tail = after.split(/[A-Z]{2,4}\s+\d{1,2}\s*-\s*\d{1,2}\s+[A-Z]{2,4}/)[0].replace(/[\u2019\u2032\u00b4`]/g, "'");
  const tokens = [...tail.matchAll(/(?<![\d'])(?:'(\d{1,2})(?![\d'])|(\d{1,2})'(?!\d))/g)].map((item) => Number(item[1] ?? item[2]));
  return tokens.length === score.home + score.away ? tokens : null;
}

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
    const tokens = goalTokens(scope, match, score);
    const key = `${home}-${away}`;
    const previous = found.get(key);
    if (!previous || (!previous.tokens && tokens)) found.set(key, { home, away, score, tokens });
  }
  const fullTime = /\bFT\b\s+[A-Z]{2,4}\s+\d{1,2}\s*-\s*\d{1,2}\s+[A-Z]{2,4}/.test(flat);
  const minuteMatch = /(\d{1,2})'\s+[A-Z]{2,4}\s+\d{1,2}\s*-\s*\d{1,2}\s+[A-Z]{2,4}/.exec(flat);
  return { fixtures: [...found.values()], fullTime, minute: !fullTime && minuteMatch ? Number(minuteMatch[1]) : null };
}

// results map { 'HOME-AWAY': { ft, ht } } for every fixture on the board. The goal ledger (learned while the match
// was watched) says which side scored each minute; without one the minutes are split home first.
function resultsFromBoard(board, ledger = createGoalLedger()) {
  const results = {};
  for (const item of board.fixtures) {
    const goals = ledger.resolve(item);
    results[`${item.home}-${item.away}`] = { ft: { ...item.score }, ht: goals ? halfTimeFromGoals(goals) : null, goals };
  }
  return results;
}

async function readBoard(page) {
  const text = await page.evaluate(() => document.body.innerText || '');
  return parseBoard(text);
}

module.exports = { parseBoard, resultsFromBoard, readBoard, createGoalLedger };
