const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateResultAgainstStrategy } = require('./rules');
const { halfOfMinute, RULE_TEXT } = require('./winRules');

// Site scores are home-away. Arsenal HOME: ht/ft are written (arsenal, opponent). Arsenal AWAY: reversed.
function winners(side, ht, ft) {
  const toSite = ([a, o]) => (side === 'HOME' ? { home: a, away: o } : { home: o, away: a });
  const result = { status: 'verified', halfTime: toSite(ht), fullTime: toSite(ft) };
  return Object.keys(RULE_TEXT).filter((key) => (
    evaluateResultAgainstStrategy(result, key, { arsenalSide: side }).outcome === 'WON'));
}

for (const side of ['HOME', 'AWAY']) {
  test(`win rules (${side}): half-time and full-time options, from Arsenal's side`, () => {
    assert.deepEqual(winners(side, [1, 0], [1, 1]), ['oneX']);          // ahead at HT, draw at FT
    assert.deepEqual(winners(side, [2, 1], [2, 2]).sort(), ['ht21', 'oneX']);
    assert.deepEqual(winners(side, [0, 1], [1, 1]), ['twoX']);          // behind at HT, draw at FT
    assert.deepEqual(winners(side, [1, 2], [2, 2]).sort(), ['ht12', 'twoX']);
    assert.deepEqual(winners(side, [1, 1], [1, 2]), ['x2']);            // level at HT, Arsenal lose
    assert.deepEqual(winners(side, [0, 0], [0, 0]).sort(), ['tg0']);    // 0-0 draw: tg0 only
    assert.deepEqual(winners(side, [0, 0], [0, 1]), ['x2']);
    assert.deepEqual(winners(side, [3, 0], [3, 0]), ['ht30']);
  });

  test(`win rules (${side}): scores, totals and double wins`, () => {
    assert.deepEqual(winners(side, [3, 0], [6, 0]).sort(), ['ht30', 'tg6', 'winner']); // 6-0 wins three options
    assert.deepEqual(winners(side, [2, 0], [4, 0]), ['ft40']);
    assert.deepEqual(winners(side, [2, 0], [4, 1]), ['ft41']);
    assert.deepEqual(winners(side, [1, 1], [3, 3]), ['tg6']);            // 3-3 is six goals
    assert.deepEqual(winners(side, [0, 0], [5, 0]), []);                 // 5-0: nothing, not 6 goals
    assert.deepEqual(winners(side, [0, 0], [0, 6]).sort(), ['tg6', 'x2']); // Arsenal lose 0-6 from level
  });
}

test('the opponent scoring 6 or 4 does not win Arsenal score options', () => {
  assert.deepEqual(winners('HOME', [0, 3], [0, 6]), ['tg6']);          // Arsenal lose 0-6: only total goals
  assert.equal(winners('HOME', [0, 0], [0, 4]).includes('ft40'), false);
  assert.equal(winners('AWAY', [0, 0], [0, 4]).includes('ft40'), false);
  assert.equal(winners('AWAY', [0, 0], [0, 6]).includes('winner'), false);
});

test('first half is minutes 1 to 45 and second half 46 to 90', () => {
  assert.equal(halfOfMinute(1), 1);
  assert.equal(halfOfMinute(45), 1);
  assert.equal(halfOfMinute(46), 2);
  assert.equal(halfOfMinute(90), 2);
  assert.equal(halfOfMinute(91), null);
  assert.equal(halfOfMinute(0), null);
});
