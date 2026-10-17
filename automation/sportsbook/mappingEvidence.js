// Checks the proposed strategy-to-market mappings against what the live page actually showed
// (the read-only market catalogue), and builds VERIFIED entries only where the evidence exists.
//
// What this proves: the exact selection labels are present, with valid odds, in the proposed
// category for the Liverpool fixture. The meaning (for example that HT/FT "1/X" is oneX) comes
// from the owner's oneX definition plus the HT/FT notation (home-side symbols). x2 is never
// written automatically: its meaning has not been confirmed by the owner.

const fs = require('node:fs');
const path = require('node:path');
const { MARKET_PROPOSALS } = require('../strategy/canonicalBetTypes');

// Keys whose meaning the owner has defined and whose label can therefore be verified here.
const AUTO_VERIFIABLE_KEYS = Object.freeze(['oneX', 'twoX']);

function norm(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function checkProposalsAgainstCatalogue(catalogue) {
  const results = [];
  for (const [strategyKey, proposal] of Object.entries(MARKET_PROPOSALS)) {
    if (!proposal.selectionBySide) continue;
    const needed = [...new Set(Object.values(proposal.selectionBySide))];
    const fixtures = [];
    for (const fixture of catalogue?.fixtures ?? []) {
      const row = (fixture.categories ?? []).find((category) => (
        norm(category.category) === norm(proposal.category) && category.status === 'READ'
      ));
      const observed = needed.map((label) => {
        const index = row ? row.labels.findIndex((candidate) => norm(candidate) === norm(label)) : -1;
        const odds = index >= 0 ? Number(String(row.odds[index]).replace(/,/g, '')) : null;
        return { label, present: index >= 0 && Number.isFinite(odds) && odds > 1, odds };
      });
      fixtures.push({
        roundName: fixture.roundName,
        home: fixture.home,
        away: fixture.away,
        side: fixture.side,
        categoryRead: Boolean(row),
        observed,
        allPresent: Boolean(row) && observed.every((entry) => entry.present),
      });
    }
    results.push({
      strategyKey,
      category: proposal.category,
      needed,
      fixtures,
      labelsConfirmed: fixtures.some((fixture) => fixture.allPresent),
      autoVerifiable: AUTO_VERIFIABLE_KEYS.includes(strategyKey),
    });
  }
  return results;
}

function buildVerifiedEntries(results, { generatedAt, reportFolder }) {
  const entries = {};
  for (const result of results) {
    if (!result.autoVerifiable || !result.labelsConfirmed) continue;
    const proof = result.fixtures.find((fixture) => fixture.allPresent);
    const proposal = MARKET_PROPOSALS[result.strategyKey];
    entries[result.strategyKey] = {
      status: 'VERIFIED',
      market: result.category,
      selectionBySide: { HOME: proposal.selectionBySide.HOME, AWAY: proposal.selectionBySide.AWAY },
      evidence: `Labels ${result.needed.join(' and ')} observed with valid odds in ${result.category} for ${proof.home} v ${proof.away} (${proof.roundName}) on ${generatedAt} (report: ${reportFolder}). Meaning: ${proposal.basis}`,
    };
  }
  return entries;
}

// Existing VERIFIED entries are never overwritten; everything else in the file is preserved.
function mergeIntoMappingsFile(filePath, entries) {
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    existing = {};
  }
  const written = [];
  const skipped = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (existing[key]?.status === 'VERIFIED') {
      skipped.push(key);
      continue;
    }
    existing[key] = entry;
    written.push(key);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(existing, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
  return { written, skipped };
}

module.exports = {
  AUTO_VERIFIABLE_KEYS,
  buildVerifiedEntries,
  checkProposalsAgainstCatalogue,
  mergeIntoMappingsFile,
};
