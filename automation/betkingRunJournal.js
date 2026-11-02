// Per-run journal and artifacts for the real BetKing run. Contains only what the
// program itself decided or read (never cookies, tokens, or credentials).

const fs = require('node:fs');
const path = require('node:path');

function writeAtomic(filePath, contents) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, contents);
  fs.renameSync(temporary, filePath);
}

function createRunJournal({ dir, runId, now = () => new Date().toISOString() }) {
  if (!dir || !runId) throw new TypeError('A journal directory and run id are required.');
  const runDir = path.join(dir, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const journal = { runId, startedAt: now(), events: [], summary: {} };

  function save() {
    writeAtomic(path.join(runDir, 'journal.json'), `${JSON.stringify(journal, null, 2)}\n`);
  }

  return Object.freeze({
    runDir,
    startedAt: journal.startedAt,
    append(type, details = {}) {
      journal.events.push({ at: now(), type, details });
      save();
    },
    setSummary(patch) {
      journal.summary = { ...journal.summary, ...patch };
      save();
    },
    writeArtifact(name, contents) {
      const filePath = path.join(runDir, name);
      writeAtomic(filePath, contents);
      return filePath;
    },
    getJournal: () => journal,
  });
}

module.exports = { createRunJournal };
