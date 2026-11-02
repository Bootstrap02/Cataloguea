// Win rules for the 11 strategy options, written from Arsenal's point of view (owner, Oct 23 2026).
//
// HALVES: first half = minutes 1 to 45, second half = minutes 46 to 90. There is no break between
// them, so any goal after 45 minutes belongs to the second half. The half-time score used for
// settlement is the HT column of BetKing's Results window, which is the score at the end of 45.
//
// All scores are Arsenal first, opponent second, whether Arsenal is home or away. The home/away
// position only decides which cell the site labels the option with (see marketMappings.js):
//   oneX   Arsenal ahead at half-time, level at full-time       (HT/FT "1/X" at home, "2/X" away)
//   twoX   Arsenal behind at half-time, level at full-time      ("2/X" at home, "1/X" away)
//   x2     level at half-time, Arsenal lose at full-time        ("X/2" at home, "X/1" away)
//   tg0    exactly 0 goals in the match (both teams)
//   tg6    exactly 6 goals in the match (both teams)
//   winner Arsenal win 6-0 at full-time
//   ft40   Arsenal 4-0 at full-time          ft41  Arsenal 4-1 at full-time
//   ht30   Arsenal 3-0 at half-time          ht21  Arsenal 2-1 at half-time
//   ht12   Arsenal 1-2 at half-time (Arsenal behind)
// One result can win several options at once, for example a 6-0 win wins both winner and tg6.

const FIRST_HALF_MINUTES = Object.freeze({ from: 1, to: 45 });
const SECOND_HALF_MINUTES = Object.freeze({ from: 46, to: 90 });

const RULE_TEXT = Object.freeze({
  winner: 'Arsenal win 6-0',
  oneX: 'Arsenal ahead at half-time, level at full-time',
  twoX: 'Arsenal behind at half-time, level at full-time',
  x2: 'level at half-time, Arsenal lose at full-time',
  tg0: '0 goals in the match',
  tg6: '6 goals in the match',
  ht21: 'Arsenal 2-1 at half-time',
  ht12: 'Arsenal 1-2 at half-time',
  ht30: 'Arsenal 3-0 at half-time',
  ft40: 'Arsenal 4-0 at full-time',
  ft41: 'Arsenal 4-1 at full-time',
});

// First or second half of a goal, from its minute (for any display that lists goal minutes).
function halfOfMinute(minute) {
  const value = Number(minute);
  if (!Number.isInteger(value) || value < FIRST_HALF_MINUTES.from || value > SECOND_HALF_MINUTES.to) return null;
  return value <= FIRST_HALF_MINUTES.to ? 1 : 2;
}

module.exports = { FIRST_HALF_MINUTES, SECOND_HALF_MINUTES, RULE_TEXT, halfOfMinute };
