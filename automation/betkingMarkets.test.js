const test = require('node:test');
const assert = require('node:assert/strict');
const { renderCatalogueMarkdown } = require('./betkingMarkets');

test('the catalogue report explains why a category could not be read and checks the proposals', () => {
  const markdown = renderCatalogueMarkdown({
    generatedAt: 'now',
    fixtures: [{
      roundName: 'Week 23', home: 'ARS', away: 'LIV', side: 'AWAY',
      categories: [
        { category: 'HT/FT', status: 'READ', labels: ['1/X', '2/X'], odds: ['13.30', '13.30'] },
        { category: 'Correct Score', status: 'MARKET_CATEGORY_NOT_OPENED', labels: [], odds: [], evidence: { reason: 'OVERLAY_BLOCKING' } },
      ],
    }],
  }, [{ strategyKey: 'oneX', category: 'HT/FT', needed: ['1/X', '2/X'], labelsConfirmed: true, autoVerifiable: true, fixtures: [{ allPresent: true, home: 'ARS', away: 'LIV' }] }]);
  assert.match(markdown, /HT\/FT: 1\/X 13.30 \| 2\/X 13.30/);
  assert.match(markdown, /Correct Score: NOT READ \(MARKET_CATEGORY_NOT_OPENED: OVERLAY_BLOCKING\)/);
  assert.match(markdown, /oneX -> HT\/FT 1\/X \/ 2\/X: labels CONFIRMED/);
  assert.match(markdown, /No odd was clicked/);
});
