// Run from the project root: node cleanup-strays.js
// Deletes the duplicate / misplaced copies from automation/ that make 12 tests fail. Nothing else is touched.
const fs = require('fs');
const stray = [
  'automation/arsenalPerspective.js',
  'automation/automation_project_guide.md',
  'automation/betkingMarketFlow.js',
  'automation/betkingPorts.js',
  'automation/betkingResultsModal.js',
  'automation/betkingResultsModal.test.js',
  'automation/canonicalBetTypes.js',
  'automation/fixtureIdentity.js',
  'automation/fixtureIdentity.test.js',
  'automation/headlessStrategy.js',
  'automation/headlessStrategy.test.js',
  'automation/mappingEvidence.js',
  'automation/mappingEvidence.test.js',
  'automation/marketFirstSequence.js',
  'automation/marketFirstSequence.test.js',
  'automation/marketMappings.js',
  'automation/marketMappings.test.js',
  'automation/operationalWorkflow.js',
  'automation/operationalWorkflow.test.js',
  'automation/resultPoller.js',
  'automation/resultPoller.test.js',
  'automation/rules.js',
  'automation/rules.test.js',
  'automation/simulatedSportsbookAdapter.js',
  'automation/sportsbook/simulatedSportsbook.test.js',
  'automation/strategy/canonicalBetTypes.test.js',
  'automation/strategy/strategyDecisionAdapter.test.js',
  'automation/strategyDecisionAdapter.js',
  'automation/winRules.js',
  'automation/winRules.test.js',
];
let removed = 0;
for (const file of stray) {
  if (fs.existsSync(file)) { fs.unlinkSync(file); removed += 1; console.log(`deleted ${file}`); }
}
console.log(`Done: ${removed} stray files deleted. Now run: npm run automation:test (expect 359 passing).`);
