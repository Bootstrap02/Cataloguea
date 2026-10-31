const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBalance, balanceDroppedBy } = require('./betkingMarketFlow');

test('the wallet balance is the first money figure in the page header text', () => {
  assert.equal(parseBalance('BetKing\n101.65\nVIRTUALS BETSLIP\nTotal Odds 14.40'), 101.65);
  assert.equal(parseBalance('BetKing\n1,234.50\nWeek 14'), 1234.5);
  assert.equal(parseBalance('Menu\nVirtuals'), null);
});

test('a bet is proven by the balance falling by the stake, even if no confirmation text is new', () => {
  assert.equal(balanceDroppedBy(101.65, 57.65, 44), true);
  assert.equal(balanceDroppedBy(101.65, 101.65, 44), false);
  assert.equal(balanceDroppedBy(101.65, 90.0, 44), false);
  assert.equal(balanceDroppedBy(null, 57.65, 44), false);
  assert.equal(balanceDroppedBy(57.65, 57.65, 0), false);
});
