// Test runner for `npm run automation:test`.
//
// The three files below drove a built-in SAMPLE sportsbook page in a visible browser.
// That simulation has been retired from the normal workflow: the project now works only
// on the real BetKing site. The files are kept on disk (not deleted) but are never run
// or opened by this command.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RETIRED_SIMULATION_TESTS = Object.freeze([
  'simulatedSportsbook.test.js',
  'strategyRealLoop.test.js',
  'stress/endToEndStress.test.js',
]);

function listTests(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => path.join(directory, entry.name));
}

function selectTestFiles(root = __dirname) {
  const retired = new Set(RETIRED_SIMULATION_TESTS.map((relative) => path.join(root, relative)));
  const directories = [root, ...fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'artifacts')
    .map((entry) => path.join(root, entry.name))];
  return directories
    .flatMap(listTests)
    .filter((file) => !retired.has(file))
    .sort();
}

function main() {
  const files = selectTestFiles();
  console.log(`Running ${files.length} test files (sample-page simulation tests are retired and not run).`);
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}

if (require.main === module) main();

module.exports = { RETIRED_SIMULATION_TESTS, selectTestFiles };
