const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  WEEK_RECONCILIATION,
  detectUpcomingRound,
  readProgress,
  reconcileWeek,
  writeProgress,
} = require('./weekProgress');

test('the upcoming round is the first listed round with a readable week label', () => {
  const detected = detectUpcomingRound({
    rounds: [{ roundName: 'Week 36', timer: '01:12' }, { roundName: 'Week 37' }, { roundName: 'Week 38' }],
  });
  assert.equal(detected.status, 'DETECTED');
  assert.equal(detected.week, 36);
  assert.equal(detected.timer, '01:12');
  assert.deepEqual(detected.visibleWeeks, [36, 37, 38]);
});

test('rounds without a week label are skipped and a countdown never decides the week', () => {
  const detected = detectUpcomingRound({ rounds: [{ roundName: 'Kings League', timer: '00:30' }, { roundName: 'Week 9', timer: '09:59' }] });
  assert.equal(detected.week, 9);
  assert.equal(detectUpcomingRound({ rounds: [{ roundName: '01:12' }] }).status, 'NONE');
  assert.equal(detectUpcomingRound({}).status, 'NONE');
});

test('reconciliation: first run, expected next week, repeat, gap, and rollover', () => {
  assert.equal(reconcileWeek({ detectedWeek: 7 }).status, WEEK_RECONCILIATION.FIRST_RUN);
  assert.equal(reconcileWeek({ detectedWeek: 8, lastSettledWeek: 7 }).status, WEEK_RECONCILIATION.EXPECTED);
  assert.equal(reconcileWeek({ detectedWeek: 7, lastSettledWeek: 7 }).ok, false);
  assert.equal(reconcileWeek({ detectedWeek: 7, lastSettledWeek: 7 }).status, WEEK_RECONCILIATION.REPEAT);
  assert.equal(reconcileWeek({ detectedWeek: 12, lastSettledWeek: 7 }).status, WEEK_RECONCILIATION.GAP);
  assert.equal(reconcileWeek({ detectedWeek: 1, lastSettledWeek: 38 }).status, WEEK_RECONCILIATION.EXPECTED);
  assert.equal(reconcileWeek({ detectedWeek: 39 }).status, 'INVALID');
});

test('progress is saved atomically and a missing or damaged file reads as no progress', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-'));
  const file = path.join(directory, 'nested', 'progress.json');
  assert.equal(readProgress(file).lastSettledWeek, null);
  writeProgress(file, 12);
  assert.equal(readProgress(file).lastSettledWeek, 12);
  fs.writeFileSync(file, '{not json');
  assert.equal(readProgress(file).lastSettledWeek, null);
  assert.throws(() => writeProgress(file, 39), RangeError);
});
