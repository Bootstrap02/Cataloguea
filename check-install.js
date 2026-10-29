// Run from the project root:  node check-install.js
// Tells you, file by file, whether the newest versions are really in your project.
const fs = require('fs');
const checks = [
  ['automation/betkingController.js', ['formatOutcomeSummary', 'watchSelectors', 'recoverSlip', 'setResultsCaptureDirectory', 'dismissBetPlaced', 'From the match panel', 'placed NO bet', 'summarizeTracking', 'ranItsCourse', 'Kick-off!', 'liveEndMarginMs']],
  ['automation/betkingLiveConfig.js', ['liveTrackIntervalMs', 'liveEndMarginMs', 'watchMode', 'minStartSeconds', 'onlyOptions', 'strategyMode', 'retryRounds']],
  ['automation/betkingRun.js', ['retryRounds', 'READ-ONLY RUN']],
  ['automation/sportsbook/betkingMarketFlow.js', ['dismissBetPlaced', 'resetBetSlip', 'accordion-details', 'captureStep', 'dismissCoverOverlay']],
  ['automation/sportsbook/betkingResultsModal.js', ['setResultsCaptureDirectory', 'standings-button', 'readPanelScore', 'markWindow', 'clickWithFallback', 'readMatchClock']],
  ['automation/sportsbook/betkingPorts.js', ['createResultsModalReader', 'readPanelScore', 'readMatchClock', 'readPanelDebug']],
  ['automation/strategy/marketFirstSequence.js', ['KNOWN_SLIP_MARKETS', 'Top picks']],
  ['automation/strategy/headlessStrategy.js', ['createHeadlessStrategyBridge']],
  ['automation/strategy/winRules.js', ['RULE_TEXT']],
  ['automation/strategy/liveTracking.js', ['deriveHalfTime', 'summarizeTracking']],
  ['automation/strategy/arsenalPerspective.js', ['isArsenal']],
];
let missing = 0;
for (const [file, markers] of checks) {
  if (!fs.existsSync(file)) { console.log(`MISSING FILE   ${file}`); missing += 1; continue; }
  const text = fs.readFileSync(file, 'utf8');
  const absent = markers.filter((marker) => !text.includes(marker));
  if (absent.length) { console.log(`OLD VERSION    ${file}  (lacks: ${absent.join(', ')})`); missing += 1; } else console.log(`ok             ${file}`);
}
console.log(missing === 0 ? '\nEverything is the newest version.' : `\n${missing} file(s) need replacing with the newest version before the next run.`);
