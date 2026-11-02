// Checks the owner-confirmed mappings (strategy/marketMappings.js) against what the live page
// actually showed in the read-only market catalogue.
//
// What this proves: for each strategy option, the exact selection labels are present, with valid
// odds, inside the mapped category and market for a visible Arsenal fixture. The mappings
// themselves come from the owner; this is the live-page confirmation that the labels exist.

const { OWNER_MAPPINGS, STRATEGY_PRIORITY } = require('../strategy/marketMappings');

function norm(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function neededLabels(mapping) {
  return mapping.selectionBySide
    ? [...new Set([mapping.selectionBySide.HOME, mapping.selectionBySide.AWAY])]
    : [mapping.selection];
}

function checkMappingsAgainstCatalogue(catalogue, mappings = OWNER_MAPPINGS) {
  return STRATEGY_PRIORITY.filter((key) => mappings[key]).map((strategyKey) => {
    const mapping = mappings[strategyKey];
    const needed = neededLabels(mapping);
    const fixtures = (catalogue?.fixtures ?? []).map((fixture) => {
      const row = (fixture.categories ?? []).find((candidate) => (
        norm(candidate.category) === norm(mapping.category)
        && norm(candidate.market ?? candidate.category) === norm(mapping.market)
        && candidate.status === 'READ'
      ));
      const observed = needed.map((label) => {
        const index = row ? row.labels.findIndex((candidate) => norm(candidate) === norm(label)) : -1;
        const odds = index >= 0 ? Number(String(row.odds[index]).replace(/,/g, '')) : null;
        return { label, present: index >= 0 && Number.isFinite(odds) && odds > 1, odds };
      });
      return {
        roundName: fixture.roundName,
        home: fixture.home,
        away: fixture.away,
        side: fixture.side,
        categoryRead: Boolean(row),
        observed,
        allPresent: Boolean(row) && observed.every((entry) => entry.present),
      };
    });
    return {
      strategyKey,
      category: mapping.category,
      market: mapping.market,
      needed,
      fixtures,
      labelsConfirmed: fixtures.some((fixture) => fixture.allPresent),
    };
  });
}

module.exports = { checkMappingsAgainstCatalogue, neededLabels };
