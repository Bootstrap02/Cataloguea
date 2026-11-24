// Pure parser (unit tested): the text of a league's Results window -> the round cards it shows.
// The window lists the last 10 rounds, newest first. Each card looks like
//   "League: 53162839  Week 28  HT  FT   18:25   1 ATM - RAY 0 - 0 0 - 0   2 OSA - RMA 0 - 0 2 - 2 ... 10 ELC - VAL 0 - 1 1 - 2"
// (league id, week, the clock time of the round, then 10 rows: position, home, away, half-time, full-time).
const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

const HEADER = /League:\s*(\d+)\s+Week\s+(\d{1,2})\s+HT\s+FT/gi;
const ROW = /(?:^|\s)(\d{1,2})\s+([A-Z]{2,4})\s*-\s*([A-Z]{2,4})\s+(\d{1,2})\s*-\s*(\d{1,2})\s+(\d{1,2})\s*-\s*(\d{1,2})(?=\s|$)/g;
const CLOCK = /(?:^|\s)((?:[01]?\d|2[0-3]):[0-5]\d)(?=\s|$)/;

function parseBody(body) {
  const rows = [];
  let match;
  ROW.lastIndex = 0;
  while ((match = ROW.exec(body)) !== null) {
    rows.push({
      position: Number(match[1]), home: match[2], away: match[3],
      ht: [Number(match[4]), Number(match[5])], ft: [Number(match[6]), Number(match[7])],
    });
  }
  const clock = CLOCK.exec(body);
  return { rows, clock: clock ? clock[1].padStart(5, '0') : null };
}

// One card is identified by what it shows, so reading the same card twice is recognised: league id + week + every score.
const cardKey = (card) => `${card.leagueId ?? '-'}|${card.week}|${card.rows.map((row) => `${row.home}-${row.away}:${row.ht.join('-')}:${row.ft.join('-')}`).join(',')}`;

// -> [{ leagueId, week, clock, rows:[...], complete }] in the order of the page (newest first)
function parseResultsCards(text, { rowsPerRound = 10 } = {}) {
  const flat = squash(text);
  const headers = [...flat.matchAll(HEADER)];
  const cards = headers.map((header, index) => {
    const start = header.index + header[0].length;
    const end = index + 1 < headers.length ? headers[index + 1].index : flat.length;
    const { rows, clock } = parseBody(flat.slice(start, end));
    const card = { leagueId: header[1], week: Number(header[2]), clock, rows };
    card.complete = rows.length === rowsPerRound;   // 10 matches a round; the Bundesliga (18 teams) has 9
    card.key = cardKey(card);
    return card;
  });
  return cards;
}

module.exports = { parseResultsCards, cardKey, squash };
