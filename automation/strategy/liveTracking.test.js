const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveHalfTime, summarizeTracking } = require('./liveTracking');

const at = (minute, home, away, finished = false) => ({ minute, home, away, finished });

test('half-time is the score at the end of minute 45 when no goal falls between the observations', () => {
  const history = [at(10, 0, 0), at(30, 1, 0), at(44, 1, 0), at(47, 1, 0), at(70, 1, 1)];
  assert.deepEqual(deriveHalfTime(history).halfTime, { home: 1, away: 0 });
});

test('a goal between the last first-half and first second-half observation leaves half-time unknown', () => {
  const history = [at(30, 0, 0), at(44, 0, 0), at(47, 1, 0)];
  const result = deriveHalfTime(history);
  assert.equal(result.halfTime, null);
  assert.match(result.reason, /between minute 44 and minute 47/);
});

test('without minutes on both sides of half-time nothing is guessed', () => {
  assert.equal(deriveHalfTime([at(10, 0, 0), at(30, 1, 0)]).halfTime, null);
  assert.equal(deriveHalfTime([{ minute: null, home: 1, away: 0 }]).halfTime, null);
});

test('the full-time score comes from the final observation and the half-time from the history before it', () => {
  const history = [at(20, 0, 0), at(44, 2, 1), at(46, 2, 1), at(80, 2, 2), at(null, 2, 2, true)];
  assert.deepEqual(summarizeTracking(history), {
    finished: true, fullTime: { home: 2, away: 2 }, halfTime: { home: 2, away: 1 }, halfTimeReason: null,
  });
  assert.equal(summarizeTracking(history.slice(0, 3)).finished, false);
});
