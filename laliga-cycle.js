#!/usr/bin/env node
// The supervisor: keeps the La Liga run in its daily cycle.
//   * starts laliga-run.js (with the daily rest switched on)
//   * at 23:59 (Lagos) the run finishes the round in hand, saves, and shuts down with the "rest" exit code
//   * this supervisor then waits (checking the clock every 30 seconds, so a sleeping laptop cannot oversleep it),
//     wakes the backend, and starts the run again at 00:00 on the 3rd day: every 72 hours
//   * any other ending (an error, a halt, you pressing Ctrl-C or x) is NOT restarted: real money needs your eyes.
// Start it the same way as before:   ./launch.sh      (or  node laliga-cycle.js --auto-confirm --forever)
//   --now                  ignore a rest in progress and start at once
//   LALIGA_CYCLE_DAYS=3    days from one start to the next (3 = every 72 hours)
//   LALIGA_REST=off        no daily rest (the run just plays on)
const { spawn } = require('child_process');
const path = require('path');
const { REST_EXIT, readRest, clearRest, showTime } = require('./automation/sync/restCycle');
const { createDailyJobs, parseTimes } = require('./automation/sync/dailyJobs');
const { createEventsClient } = require('./automation/sync/backendEvents');
const { loadSyncConfig, defaultPaths } = require('./automation/sync/syncFiles');

const artifactsDir = path.join(__dirname, 'automation', 'artifacts');
const log = (message) => console.log(message);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeZone = process.env.LALIGA_TZ || 'Africa/Lagos';

const args = process.argv.slice(2);
const startNow = args.includes('--now');
const runArgs = args.filter((arg) => arg !== '--now');
if (process.env.LALIGA_REST === 'off') log('LALIGA_REST=off: no daily rest; this is the plain run.');

function backendClient() {
  try {
    const config = loadSyncConfig({ env: process.env, file: defaultPaths().configFile });
    return config?.url ? createEventsClient({ url: config.url, key: config.key }) : null;
  } catch (error) { return null; }
}

// Wake the (free-tier) backend and wait until it answers: up to 5 tries.
async function wakeBackend(client) {
  if (!client) return;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await client.wake();
    if (response.status === 200) { log(`Backend awake (database ${response.body?.database ?? '?'}).`); return; }
    log(`Backend not answering yet (${response.status || 'no connection'}); trying again (${attempt}/5).`);
    await sleep(5000);
  }
  log('The backend is still not answering; the run will keep trying when it starts.');
}

let child = null;
let leaving = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    leaving = true;
    if (child) child.kill(signal); else process.exit(130);
  });
}

function runOnce(afterRest) {
  return new Promise((resolve) => {
    child = spawn(process.execPath, [path.join(__dirname, 'laliga-run.js'), ...runArgs], {
      stdio: 'inherit',
      env: { ...process.env, LALIGA_REST: process.env.LALIGA_REST || 'on', ...(afterRest ? { LALIGA_AFTER_REST: '1' } : {}) },
    });
    child.on('exit', (code, signal) => { child = null; resolve(signal ? 130 : code ?? 1); });
  });
}

async function rest(info, client) {
  const resumeAt = new Date(info.resumeAt);
  log(`\nResting. The next start is ${showTime(resumeAt, timeZone)}. Press Ctrl-C to cancel, or start with --now to skip the rest.`);
  // while resting, the wake calls keep going (23:55 and 07:55) so the free-tier backend and the EMRAN cron jobs stay reachable
  let jobs = null;
  if (client && process.env.LALIGA_WAKE !== 'off') {
    jobs = createDailyJobs({
      timeZone, log,
      jobs: parseTimes(process.env.LALIGA_WAKE_TIMES, '23:55,07:55').map((at) => ({ at, name: 'wake the server', run: async () => { const r = await client.wake(); return { ok: r.status === 200, message: r.status === 200 ? 'the server answered' : `${r.status}` }; } })),
    });
  }
  let nextBeat = Date.now() + 3600000;
  while (!leaving && Date.now() < resumeAt.getTime()) {
    await sleep(Number(process.env.LALIGA_REST_POLL_MS || 30000));   // short sleeps: after a laptop sleep the clock is checked again at once
    if (Date.now() >= nextBeat) { log(`  Still resting. ${Math.round((resumeAt.getTime() - Date.now()) / 3600000)} hour(s) to go.`); nextBeat = Date.now() + 3600000; }
  }
  if (jobs) jobs.stop();
}

async function main() {
  const client = backendClient();
  let afterRest = false;
  let first = true;
  for (;;) {
    const info = readRest(artifactsDir);
    if (info && !(first && startNow)) {
      if (Date.parse(info.resumeAt) > Date.now()) await rest(info, client);
      if (leaving) process.exit(130);
      afterRest = true;
    }
    if (info) clearRest(artifactsDir);
    first = false;
    await wakeBackend(client);
    const code = await runOnce(afterRest);
    if (leaving) process.exit(code);
    if (code !== REST_EXIT) {
      log(code === 0 ? '\nThe run ended. Not restarting by itself.' : `\nThe run stopped with code ${code}. It is NOT restarted by itself: look at what happened, then start it again.`);
      process.exit(code);
    }
    // REST_EXIT: the run wrote the rest file; the loop above reads it and waits
  }
}

main().catch((error) => { console.error(`Cycle stopped: ${error.message}`); process.exit(1); });
