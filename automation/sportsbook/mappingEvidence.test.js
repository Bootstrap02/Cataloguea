const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildVerifiedEntries,
  checkProposalsAgainstCatalogue,
  mergeIntoMappingsFile,
} = require('./mappingEvidence');

const HTFT_LABELS = ['1/1', '1/X', '1/2', 'X/1', 'X/X', 'X/2', '2/1', '2/X', '2/2'];
const HTFT_ODDS = ['3.01', '13.30', '58.10', '7.32', '5.94', '12.40', '35.40', '13.30', '6.19'];

function catalogue(overrides = {}) {
  return {
    fixtures: [{
      roundName: 'Week 1', home: 'LIV', away: 'AST', side: 'HOME',
      categories: [{ category: 'HT/FT', status: 'READ', labels: HTFT_LABELS, odds: HTFT_ODDS, ...overrides }],
    }],
  };
}

test('the oneX and twoX labels are confirmed when the HT/FT grid shows them with valid odds', () => {
  const results = checkProposalsAgainstCatalogue(catalogue());
  const oneX = results.find((result) => result.strategyKey === 'oneX');
  const twoX = results.find((result) => result.strategyKey === 'twoX');
  assert.equal(oneX.labelsConfirmed, true);
  assert.equal(twoX.labelsConfirmed, true);
  assert.deepEqual(oneX.needed.sort(), ['1/X', '2/X']);
});

test('nothing is confirmed when the category was not read or a label is missing', () => {
  assert.equal(checkProposalsAgainstCatalogue(catalogue({ status: 'MARKET_CATEGORY_NOT_OPENED' })).find((r) => r.strategyKey === 'oneX').labelsConfirmed, false);
  const missing = catalogue({ labels: HTFT_LABELS.filter((label) => label !== '2/X'), odds: HTFT_ODDS.slice(0, 8) });
  assert.equal(checkProposalsAgainstCatalogue(missing).find((r) => r.strategyKey === 'oneX').labelsConfirmed, false);
  const badOdds = catalogue({ odds: ['', ...HTFT_ODDS.slice(1)] });
  assert.equal(checkProposalsAgainstCatalogue(badOdds).find((r) => r.strategyKey === 'oneX').labelsConfirmed, true);
});

test('only oneX and twoX are ever written as VERIFIED; x2 is never written automatically', () => {
  const results = checkProposalsAgainstCatalogue(catalogue());
  assert.equal(results.find((r) => r.strategyKey === 'x2').labelsConfirmed, true);
  const entries = buildVerifiedEntries(results, { generatedAt: '2026-10-16T10:00:00Z', reportFolder: '/tmp/report' });
  assert.deepEqual(Object.keys(entries).sort(), ['oneX', 'twoX']);
  assert.equal(entries.oneX.status, 'VERIFIED');
  assert.deepEqual(entries.oneX.selectionBySide, { HOME: '1/X', AWAY: '2/X' });
  assert.deepEqual(entries.twoX.selectionBySide, { HOME: '2/X', AWAY: '1/X' });
  assert.match(entries.oneX.evidence, /LIV v AST/);
});

test('an existing VERIFIED entry is never overwritten and other entries are preserved', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mappings-'));
  const file = path.join(directory, 'sub', 'mappings.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ oneX: { status: 'VERIFIED', market: 'Other', selection: 'Z', evidence: 'mine' }, tg0: { status: 'PENDING' } }));
  const entries = buildVerifiedEntries(checkProposalsAgainstCatalogue(catalogue()), { generatedAt: 'now', reportFolder: 'x' });
  const outcome = mergeIntoMappingsFile(file, entries);
  assert.deepEqual(outcome.skipped, ['oneX']);
  assert.deepEqual(outcome.written, ['twoX']);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.oneX.market, 'Other');
  assert.equal(saved.twoX.status, 'VERIFIED');
  assert.equal(saved.tg0.status, 'PENDING');
});
