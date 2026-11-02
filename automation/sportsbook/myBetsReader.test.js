const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSettledBets, settledResultsFor } = require('./myBetsReader');

const PAGE = `Single 1
2/X - HT/FT
Kings League | Week 38 | ARS 3-3 BRE (HT: 2-0) | Event Ended
Stake: N13.00
Single 1/1
0-6 - Correct Score
Kings Liga | Week 29 | OSA 0-2 RMA (HT: 0-1) | Event Ended
Single 1/1
0-6 - Correct Score
Kings Liga | Week 29 | LEV 1-4 BAR (HT: 0-3) | Event Ended`;

test('settled bets give the fixture, the full-time score and the half-time score exactly as BetKing prints them', () => {
  const found = parseSettledBets(PAGE);
  assert.equal(found.length, 3);
  assert.deepEqual(found[0], { week: 38, home: 'ARS', away: 'BRE', ft: { home: 3, away: 3 }, ht: { home: 2, away: 0 } });
  assert.deepEqual(found[1], { week: 29, home: 'OSA', away: 'RMA', ft: { home: 0, away: 2 }, ht: { home: 0, away: 1 } });
});

test('only the wanted fixtures of the wanted week are returned', () => {
  const found = parseSettledBets(PAGE);
  const results = settledResultsFor(found, [{ home: 'OSA', away: 'RMA' }, { home: 'LEV', away: 'BAR' }, { home: 'ATM', away: 'GET' }], 29);
  assert.deepEqual(Object.keys(results).sort(), ['LEV-BAR', 'OSA-RMA']);
  assert.deepEqual(results['LEV-BAR'], { ft: { home: 1, away: 4 }, ht: { home: 0, away: 3 } });
  assert.deepEqual(settledResultsFor(found, [{ home: 'OSA', away: 'RMA' }], 30), {}, 'a different week is not the same fixture');
});
