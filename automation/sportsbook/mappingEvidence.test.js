const test = require('node:test');
const assert = require('node:assert/strict');
const { checkMappingsAgainstCatalogue } = require('./mappingEvidence');

const HTFT = { category: 'HT/FT', market: 'HT/FT', status: 'READ', labels: ['1/1', '1/X', '1/2', 'X/1', 'X/X', 'X/2', '2/1', '2/X', '2/2'], odds: ['3.01', '13.30', '58.10', '7.32', '5.94', '12.40', '35.40', '13.30', '6.19'] };
const GOALS = { category: 'Total Goals', market: 'Total Goals', status: 'READ', labels: ['0', '1', '2', '6'], odds: ['13.90', '8', '5', '20.00'] };
const SCORES = { category: 'Correct Score', market: 'Correct Score', status: 'READ', labels: ['6-0', '0-6', '4-0', '0-4', '4-1', '1-4'], odds: ['1,431.00', '469.00', '95.30', '47.70', '66.80', '37.50'] };
const HTSCORE = { category: 'Half Time', market: 'HT Correct Score', status: 'READ', labels: ['2-1', '1-2', '3-0', '0-3'], odds: ['18.50', '16.90', '59.80', '32.70'] };

function catalogue(...categories) {
  return { fixtures: [{ roundName: 'Week 16', home: 'LIV', away: 'ARS', side: 'HOME', categories }] };
}
const find = (results, key) => results.find((result) => result.strategyKey === key);

test('every option is confirmed when its market shows its labels with valid odds', () => {
  const results = checkMappingsAgainstCatalogue(catalogue(HTFT, GOALS, SCORES, HTSCORE));
  assert.equal(results.length, 11);
  assert.ok(results.every((result) => result.labelsConfirmed));
});

test('the results follow the owner order of play', () => {
  const results = checkMappingsAgainstCatalogue(catalogue(HTFT));
  assert.deepEqual(results.map((result) => result.strategyKey), ['winner', 'oneX', 'twoX', 'x2', 'tg0', 'tg6', 'ht21', 'ht12', 'ht30', 'ft40', 'ft41']);
});

test('options whose market was not read or whose label is missing are not confirmed', () => {
  const results = checkMappingsAgainstCatalogue(catalogue(HTFT, { ...GOALS, labels: ['1', '2'], odds: ['8', '5'] }));
  assert.equal(find(results, 'oneX').labelsConfirmed, true);
  assert.equal(find(results, 'tg0').labelsConfirmed, false);
  assert.equal(find(results, 'ft40').labelsConfirmed, false);
  const notRead = checkMappingsAgainstCatalogue(catalogue({ ...HTFT, status: 'MARKET_CATEGORY_NOT_OPENED' }));
  assert.equal(find(notRead, 'oneX').labelsConfirmed, false);
});

test('a market with the right category but a different market name does not confirm', () => {
  const results = checkMappingsAgainstCatalogue(catalogue({ ...HTSCORE, market: 'HT 1X2' }));
  assert.equal(find(results, 'ht21').labelsConfirmed, false);
});

test('a label with no valid odds is not confirmed', () => {
  const results = checkMappingsAgainstCatalogue(catalogue({ ...HTFT, odds: HTFT.odds.map((value, index) => (index === 1 ? '' : value)) }));
  assert.equal(find(results, 'oneX').labelsConfirmed, false);
  assert.equal(find(results, 'x2').labelsConfirmed, true);
});
