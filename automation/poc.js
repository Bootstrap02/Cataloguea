// RETIRED. The built-in sample sportsbook page is no longer part of this project's
// workflow. All work happens on the real BetKing site:
//
//   npm run automation:betking:open    open the real scheduled page and report what was read
//   npm run automation:betking:probe   log in, then prove the buttons on BetKing can be used
//   npm run automation:betking:run -- --week N   the real-site run

console.error('The local sample page has been retired. Use the real-site commands:');
console.error('  npm run automation:betking:open');
console.error('  npm run automation:betking:probe');
console.error('  npm run automation:betking:run -- --week N');
process.exitCode = 1;
