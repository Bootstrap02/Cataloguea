// Run from the project root:  node check-install.js
// Tells you, file by file, whether the newest versions are really in your project.
const fs = require('fs');
const checks = [
  ['automation/betkingController.js', ['formatOutcomeSummary', 'watchSelectors', 'recoverSlip', 'setResultsCaptureDirectory', 'dismissBetPlaced', 'From the match panel', 'placed NO bet', 'summarizeTracking', 'ranItsCourse', 'Kick-off!', 'liveEndMarginMs', 'sessionLine']],
  ['automation/betkingLiveConfig.js', ['liveTrackIntervalMs', 'liveEndMarginMs', 'confirmWithResultsWindow', 'continuous', 'No cap unless', 'watchMode', 'minStartSeconds', 'onlyOptions', 'strategyMode', 'retryRounds']],
  ['automation/betkingRun.js', ['retryRounds', 'READ-ONLY RUN', '--forever']],
  ['automation/sportsbook/betkingMarketFlow.js', ['dismissBetPlaced', 'resetBetSlip', 'accordion-details', 'captureStep', 'dismissCoverOverlay', 'balanceDroppedBy']],
  ['automation/sportsbook/betkingResultsModal.js', ['setResultsCaptureDirectory', 'standings-button', 'readPanelScore', 'markWindow', 'clickWithFallback', 'readMatchClock']],
  ['automation/sportsbook/betkingPorts.js', ['createResultsModalReader', 'readPanelScore', 'readMatchClock', 'readPanelDebug']],
  ['automation/strategy/marketFirstSequence.js', ['KNOWN_SLIP_MARKETS', 'Top picks']],
  ['automation/strategy/headlessStrategy.js', ['createHeadlessStrategyBridge']],
  ['automation/strategy/winRules.js', ['RULE_TEXT']],
  ['automation/strategy/settleRound.js', ['settleRound']],
  ['automation/strategy/laLigaStrategy.js', ['planRound', 'markPlacement', 'settleRound', 'discardRound', 'previous']],
  ['capture-page.js', ['page-capture']],
  ['laliga-scan.js', ['laliga-scan']],
  ['automation/sportsbook/myBetsReader.js', ['parseSettledBets', 'readSettledBets']],
  ['laliga-run.js', ['laliga-run', '--auto-confirm', '--resume']],
  ['settle-laliga.js', ['discard-open']],
  ['automation/laLigaController.js', ['createLaLigaController', 'placeAll', 'collectResults', 'resume']],
  ['automation/laLigaStore.js', ['createFileStore']],
  ['automation/sportsbook/laLigaPorts.js', ['createLaLigaPorts', 'placeBet']],
  ['automation/strategy/laLigaOutcome.js', ['evaluatePlaced', 'formatRoundReport']],
  ['automation/sportsbook/laLigaReader.js', ['switchToLiga', 'readFixtureGrid', 'teamOddsFromFixtures']],
  ['automation/strategy/liveTracking.js', ['deriveHalfTime', 'summarizeTracking', 'halfTimeFromGoals']],
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
