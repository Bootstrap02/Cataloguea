// One-time setup: adds short commands to package.json so you can start the automation with
//   npm run laliga:play      round after round until Ctrl-C (asks you to confirm)
//   npm run laliga:one       one real round
//   npm run laliga           dry run: plan only, nothing placed
//   npm run laliga:resume    settle a round left open
//   npm run laliga:scan      read all 20 teams' odds
//   npm run laliga:sync-setup / laliga:sync-status / laliga:push / laliga:pull   keep the strategy memory on your server
// Safe to run more than once.
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.scripts = pkg.scripts || {};
const wanted = {
  'laliga': 'bash start-laliga.sh dry',
  'laliga:play': 'bash start-laliga.sh play',
  'laliga:one': 'bash start-laliga.sh one',
  'laliga:resume': 'bash start-laliga.sh resume',
  'laliga:scan': 'bash start-laliga.sh scan',
  'laliga:sync-setup': 'node laliga-sync.js setup',
  'laliga:sync-status': 'node laliga-sync.js status',
  'laliga:push': 'node laliga-sync.js push',
  'laliga:pull': 'node laliga-sync.js pull',
};
let changed = 0;
for (const [name, command] of Object.entries(wanted)) {
  if (pkg.scripts[name] !== command) { pkg.scripts[name] = command; changed += 1; }
}
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(changed ? `Added ${changed} command(s) to package.json:` : 'package.json already has the commands:');
for (const name of Object.keys(wanted)) console.log(`  npm run ${name}`);
