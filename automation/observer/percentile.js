// The "percentile" of the owner: sort a team's odds for one option from the smallest to the biggest, cut them into 4
// equal sections, and take the AVERAGE of the 4th (highest) section. With 38 odds that is the 10 biggest (38/4 = 9.5,
// rounded up); with 34 (Bundesliga) the 9 biggest.
function topQuarterAverage(odds, { fraction = 0.25 } = {}) {
  const clean = odds.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const size = Math.max(1, Math.ceil(clean.length * fraction));
  const top = clean.slice(-size);
  return Math.round((top.reduce((sum, value) => sum + value, 0) / top.length) * 100) / 100;
}
module.exports = { topQuarterAverage };
