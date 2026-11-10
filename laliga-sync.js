// Keep the strategy memory in step with your server, by hand.
//   node laliga-sync.js setup            one time: the server address and key (asks you; a connection test is done)
//   node laliga-sync.js status           what this device and the server hold
//   node laliga-sync.js push [--force]   send this device's state to the server (--force replaces a newer one)
//   node laliga-sync.js pull [--version N] [--yes]   fetch the server's state onto this device (a backup is kept)
//   node laliga-sync.js history          the older states the server kept
const path = require('node:path');
const readline = require('node:readline/promises');
const { createSyncClient, createSyncManager } = require('./automation/sync/laLigaSync');
const { createFileIo, loadSyncConfig, saveSyncConfig, getDeviceId, ensureGitignored, defaultPaths } = require('./automation/sync/syncFiles');

const paths = defaultPaths(__dirname, false);
const command = process.argv[2] || 'status';
const flag = (name) => process.argv.includes(name);
const value = (name) => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1]; };

async function ask(question) {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return (await terminal.question(question)).trim(); } finally { terminal.close(); }
}

function build() {
  const config = loadSyncConfig({ env: process.env, file: paths.configFile });
  if (!config.configured) { console.error('Sync is not set up yet. Run:  npm run laliga:sync-setup'); process.exit(1); }
  const deviceId = getDeviceId(paths.deviceFile);
  const client = createSyncClient({ url: config.url, key: config.key, deviceId });
  return { config, client, manager: createSyncManager({ client, io: createFileIo(paths), log: (line) => console.log(line), deviceId }) };
}

const describeSummary = (summary) => (summary ? `${summary.teamsWithDeficit} teams with a deficit, ${summary.bigDeficits} big deficits, bank N${summary.bank}, ${summary.settledRounds} rounds settled${summary.openRound ? ', a round is OPEN' : ''}` : '');

(async () => {
  if (command === 'setup') {
    const existing = loadSyncConfig({ env: {}, file: paths.configFile });
    const url = (await ask(`Server address (the address of your backend, e.g. https://your-backend.vercel.app)${existing.url ? ` [${existing.url}]` : ''}: `)) || existing.url;
    const key = (await ask(`Sync key, ONLY if you set LALIGA_SYNC_KEY on the backend (otherwise just press Enter)${existing.key ? ' [saved one kept: press Enter]' : ''}: `)) || existing.key || '';
    const modeAnswer = (await ask('Send the state after [r]ound (every settled round, recommended) or only after a 6-0 [w]in? [r]: ')).toLowerCase();
    const mode = modeAnswer.startsWith('w') ? 'win' : 'round';
    if (!url) { console.error('The server address is needed.'); process.exit(1); }
    const client = createSyncClient({ url, key, deviceId: getDeviceId(paths.deviceFile) });
    try {
      const response = await client.getState();
      if (response.status === 200) console.log(`Connected. ${response.body.exists ? `The server holds version ${response.body.version} (${describeSummary(response.body.summary)}).` : 'The server holds nothing yet; the first start will send this device\'s state.'}`);
      else { console.error(`The server answered ${response.status}${response.body?.message ? `: ${response.body.message}` : ''}. Nothing was saved.`); process.exit(1); }
    } catch (error) { console.error(`Could not reach the server: ${error.message}. Nothing was saved.`); process.exit(1); }
    saveSyncConfig(paths.configFile, { url, key, mode });
    const added = ensureGitignored(__dirname, 'laliga-sync.json');
    console.log(`Saved in ${paths.configFile}${added ? ' (and added to .gitignore so it never goes to GitHub)' : ''}. Mode: ${mode === 'win' ? 'after a 6-0 win only' : 'after every settled round'}.`);
    return;
  }
  const { manager, client } = build();
  if (command === 'status') {
    const status = await manager.status();
    if (status.error) console.log(`Server: ${status.error}`);
    else console.log(`Server: ${status.server.exists ? `version ${status.server.version}, saved by ${status.server.deviceId || '?'} (${status.server.reason || '-'}) ${status.server.updatedAt || ''}\n        ${describeSummary(status.server.summary)}` : 'nothing saved yet'}`);
    console.log(`This device: ${status.local ? `${status.local.settledRounds} rounds settled${status.local.openRound ? ', a round is OPEN' : ''}; ${status.local.changedSinceSync ? 'has changes not sent yet' : 'nothing unsent'}` : 'no strategy state yet'}${status.meta ? `; last synced version ${status.meta.version}` : ''}`);
    console.log(status.inSync ? 'In sync.' : 'Not in sync.');
  } else if (command === 'push') {
    const sent = await manager.push({ reason: 'manual', force: flag('--force') });
    if (sent.ok) console.log(`Sent. The server now holds version ${sent.version}.`);
    else if (sent.conflict) { console.error(`Refused: ${sent.error} (server version ${sent.serverVersion}, saved by ${sent.serverDeviceId || '?'}).\n  Fetch it first: npm run laliga:pull    or replace it: npm run laliga:push -- --force`); process.exit(2); }
    else { console.error(`Not sent: ${sent.error}`); process.exit(1); }
  } else if (command === 'pull') {
    const version = value('--version');
    if (!flag('--yes')) {
      const answer = await ask(`This replaces this device's strategy state with the server's${version ? ` (version ${version})` : ' newest'}. A backup of the current one is kept. Type YES: `);
      if (!/^\s*(y|yes)\s*$/i.test(answer)) { console.log('Cancelled.'); return; }
    }
    const pulled = await manager.pull({ version: version ? Number(version) : null });
    if (pulled.ok) console.log(`Done. This device now has ${pulled.restoredVersion ? `version ${pulled.restoredVersion}` : `the server's version ${pulled.version}`} (${describeSummary(pulled.summary)}). ${pulled.backedUp ? 'Your old state was backed up in automation/artifacts/backups/.' : ''}`.trim());
    else { console.error(`Not fetched: ${pulled.error}`); process.exit(1); }
  } else if (command === 'history') {
    const response = await client.listHistory(30);
    if (response.status !== 200) { console.error(`The server answered ${response.status}.`); process.exit(1); }
    for (const row of response.body.history) console.log(`version ${String(row.version).padEnd(4)} ${String(row.savedAt || '').slice(0, 19)}  ${(row.deviceId || '?').padEnd(18)} ${(row.reason || '-').padEnd(12)} ${describeSummary(row.summary)}`);
    if (!response.body.history.length) console.log('No older versions yet.');
  } else {
    console.error('Use: setup | status | push [--force] | pull [--version N] [--yes] | history');
    process.exit(1);
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
