// One-time tidy of the merged project: removes the loose copies of files that ended up in the project's top folder
// (the real ones live in automation/...), and two empty files named "node" and "cataloguea@0.1.0".
// It only deletes a loose copy when the real file exists where it belongs. Run:   node cleanup-main.js
const fs = require('node:fs');
const path = require('node:path');

const loose = {
  'betkingResultsModal.js': 'automation/sportsbook/betkingResultsModal.js',
  'laLigaPorts.js': 'automation/sportsbook/laLigaPorts.js',
  'liveBoard.js': 'automation/sportsbook/liveBoard.js',
  'liveBoard.test.js': 'automation/sportsbook/liveBoard.test.js',
  'laLigaController.js': 'automation/laLigaController.js',
  'laLigaController.test.js': 'automation/laLigaController.test.js',
  'notify.js': 'automation/notify.js',
  'laLigaSync.js': 'automation/sync/laLigaSync.js',
  'syncFiles.js': 'automation/sync/syncFiles.js',
  'betkingSync.test.js': null,   // a BACKEND test: it belongs in the backend project, not here
};
let removed = 0;
for (const [name, home] of Object.entries(loose)) {
  const file = path.join(__dirname, name);
  if (!fs.existsSync(file)) continue;
  if (home && !fs.existsSync(path.join(__dirname, home))) { console.log(`kept ${name}: ${home} is missing, so this may be the only copy`); continue; }
  fs.unlinkSync(file); removed += 1; console.log(`removed loose copy: ${name}${home ? ` (the real one is ${home})` : ' (belongs in the backend project)'}`);
}
for (const name of ['node', 'cataloguea@0.1.0']) {
  const file = path.join(__dirname, name);
  if (fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size === 0) { fs.unlinkSync(file); removed += 1; console.log(`removed empty file: ${name}`); }
}
console.log(removed ? `Tidied ${removed} file(s).` : 'Nothing to tidy.');
