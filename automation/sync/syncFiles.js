// The files the sync uses: the strategy state (the one the automation plays from), a small note of what was last
// synced, a device name, backups of the state before it is replaced, and the settings (URL and key).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { return null; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function createFileIo({ stateFile, metaFile, backupDir }) {
  return {
    readState: () => readJson(stateFile),
    writeState: (state) => writeJson(stateFile, state),
    readMeta: () => readJson(metaFile),
    writeMeta: (meta) => writeJson(metaFile, meta),
    backupState(label) {
      if (!fs.existsSync(stateFile)) return null;
      fs.mkdirSync(backupDir, { recursive: true });
      const target = path.join(backupDir, `laliga-state-${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      fs.copyFileSync(stateFile, target);
      return target;
    },
  };
}

// URL and key come from the environment or from laliga-sync.json (kept out of GitHub). mode: round | win | off.
function loadSyncConfig({ env = process.env, file }) {
  const saved = (file && readJson(file)) || {};
  const url = env.LALIGA_API_URL || saved.url || '';
  const key = env.LALIGA_SYNC_KEY || saved.key || '';
  const mode = String(env.LALIGA_SYNC || saved.mode || 'round').toLowerCase();
  return { configured: Boolean(url), url, key, mode: ['round', 'win', 'off'].includes(mode) ? mode : 'round' };
}

function saveSyncConfig(file, config) {
  writeJson(file, { url: config.url, key: config.key, mode: config.mode || 'round' });
  try { fs.chmodSync(file, 0o600); } catch (error) { /* not supported everywhere */ }
}

function getDeviceId(file) {
  const existing = readJson(file);
  if (existing?.deviceId) return existing.deviceId;
  const deviceId = `${require('node:os').hostname()}-${crypto.randomBytes(3).toString('hex')}`;
  writeJson(file, { deviceId });
  return deviceId;
}

function ensureGitignored(projectDir, entry) {
  const file = path.join(projectDir, '.gitignore');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current.split(/\r?\n/).includes(entry)) return false;
  fs.writeFileSync(file, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${entry}\n`);
  return true;
}

// Where everything lives for the automation in `projectDir`.
function defaultPaths(projectDir, trial = false) {
  const artifacts = path.join(projectDir, 'automation', 'artifacts');
  return {
    artifacts,
    stateFile: path.join(artifacts, trial ? 'laliga-state.trial.json' : 'laliga-state.json'),
    metaFile: path.join(artifacts, 'laliga-sync-meta.json'),
    backupDir: path.join(artifacts, 'backups'),
    deviceFile: path.join(artifacts, 'laliga-device.json'),
    configFile: path.join(projectDir, 'laliga-sync.json'),
  };
}

module.exports = { defaultPaths, createFileIo, loadSyncConfig, saveSyncConfig, getDeviceId, ensureGitignored, readJson, writeJson };
