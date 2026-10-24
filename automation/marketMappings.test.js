const test = require('node:test');
const assert = require('node:assert/strict');
const { OWNER_MAPPINGS, STRATEGY_PRIORITY, distinctMarkets } = require('./marketMappings');
const { determineArsenalSide, isArsenal } = require('./arsenalPerspective');

test('HT Correct Score options live inside the Correct Score category', () => {
  for (const key of ['ht21', 'ht12', 'ht30']) {
    assert.equal(OWNER_MAPPINGS[key].category, 'Correct Score');
    assert.equal(OWNER_MAPPINGS[key].market, 'HT Correct Score');
  }
});

test('every option maps to HT/FT, Total Goals or Correct Score, and the category list is those three', () => {
  const categories = new Set(STRATEGY_PRIORITY.map((key) => OWNER_MAPPINGS[key].category));
  assert.deepEqual([...categories].sort(), ['Correct Score', 'HT/FT', 'Total Goals']);
  assert.deepEqual(distinctMarkets().map((entry) => `${entry.category}|${entry.market}`).sort(),
    ['Correct Score|Correct Score', 'Correct Score|HT Correct Score', 'HT/FT|HT/FT', 'Total Goals|Total Goals']);
});

test('away labels are the home labels reversed (scores are written home-away on the site)', () => {
  assert.equal(OWNER_MAPPINGS.ht21.selectionBySide.AWAY, '1-2');
  assert.equal(OWNER_MAPPINGS.ht12.selectionBySide.AWAY, '2-1');
  assert.equal(OWNER_MAPPINGS.ft41.selectionBySide.AWAY, '1-4');
  assert.equal(OWNER_MAPPINGS.winner.selectionBySide.AWAY, '0-6');
});

test('the team is Arsenal (ARS); LIV is just an opponent', () => {
  assert.equal(isArsenal('ARS'), true);
  assert.equal(isArsenal('LIV'), false);
  assert.deepEqual(determineArsenalSide({ home: 'ARS', away: 'COV' }), { status: 'RESOLVED', side: 'HOME', opponent: 'COV' });
  assert.deepEqual(determineArsenalSide({ home: 'IPS', away: 'ARS' }), { status: 'RESOLVED', side: 'AWAY', opponent: 'IPS' });
  assert.equal(determineArsenalSide({ home: 'LIV', away: 'COV' }).status, 'NOT_FOUND');
});
