const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FIRST_WEEK,
  LAST_WEEK,
  WEEK_ALIGNMENT,
  assessWeekAlignment,
  isValidWeek,
  nextWeek,
  parseWeek,
} = require('./seasonWeek');

test('season runs from week 1 to week 38', () => {
  assert.equal(FIRST_WEEK, 1);
  assert.equal(LAST_WEEK, 38);
  assert.ok(isValidWeek(1));
  assert.ok(isValidWeek(38));
  assert.ok(!isValidWeek(0));
  assert.ok(!isValidWeek(39));
});

test('parseWeek accepts labels and rejects invalid weeks', () => {
  assert.equal(parseWeek('Week 7'), 7);
  assert.equal(parseWeek('week 07'), 7);
  assert.equal(parseWeek(' 12 '), 12);
  assert.equal(parseWeek(38), 38);
  assert.equal(parseWeek('Week 39'), null);
  assert.equal(parseWeek('Week 0'), null);
  assert.equal(parseWeek(39), null);
  assert.equal(parseWeek(''), null);
  assert.equal(parseWeek(null), null);
  assert.equal(parseWeek('Kings League'), null);
});

test('nextWeek advances by one and rolls Week 38 over to Week 1', () => {
  assert.deepEqual(nextWeek(5), { fromWeek: 5, week: 6, rolledOver: false });
  assert.deepEqual(nextWeek(37), { fromWeek: 37, week: 38, rolledOver: false });
  assert.deepEqual(nextWeek(38), { fromWeek: 38, week: 1, rolledOver: true });
});

test('nextWeek never produces Week 39 and rejects invalid input', () => {
  assert.throws(() => nextWeek(39), RangeError);
  assert.throws(() => nextWeek(0), RangeError);
  assert.throws(() => nextWeek('5'), RangeError);
});

test('assessWeekAlignment is ALIGNED only when required, visible, and selected agree', () => {
  const result = assessWeekAlignment({ requiredWeek: 5, visibleWeek: 'Week 5', selectedWeek: 5 });
  assert.equal(result.status, WEEK_ALIGNMENT.ALIGNED);
  assert.equal(result.ok, true);
});

test('assessWeekAlignment requires navigation when the page shows another week', () => {
  const result = assessWeekAlignment({ requiredWeek: 5, visibleWeek: 6, selectedWeek: null });
  assert.equal(result.status, WEEK_ALIGNMENT.NAVIGATION_REQUIRED);
  assert.equal(result.ok, false);
});

test('assessWeekAlignment reports an unavailable week when the site does not offer it', () => {
  const result = assessWeekAlignment({ requiredWeek: 5, visibleWeek: 6, availableWeeks: [6, 7, 8] });
  assert.equal(result.status, WEEK_ALIGNMENT.WEEK_UNAVAILABLE);
});

test('assessWeekAlignment refuses to align when the page disagrees with the selection', () => {
  const result = assessWeekAlignment({ requiredWeek: 5, visibleWeek: 6, selectedWeek: 5 });
  assert.equal(result.status, WEEK_ALIGNMENT.VISIBLE_WEEK_DISAGREES);
  assert.equal(result.ok, false);
});

test('assessWeekAlignment flags an invalid required week', () => {
  assert.equal(assessWeekAlignment({ requiredWeek: 39 }).status, WEEK_ALIGNMENT.REQUIRED_WEEK_UNKNOWN);
  assert.equal(assessWeekAlignment({}).status, WEEK_ALIGNMENT.REQUIRED_WEEK_UNKNOWN);
});
