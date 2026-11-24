// Small things both programs (the results recorder and the odds collector) need.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const argValue = (argv, name) => { const index = argv.indexOf(name); return index === -1 ? undefined : argv[index + 1]; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lagosClock = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

// prints and also appends to <dir>/<name>.log
function createLog(dir, name = 'observer') {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.log`);
  return (line) => { console.log(line); try { fs.appendFileSync(file, `${new Date().toISOString()} ${String(line).replace(/\n/g, ' / ')}\n`); } catch (error) { /* the screen has it */ } };
}

// the backend address and key written by `npm run laliga:sync-setup` (laliga-sync.json) — or null
function loadBackend(rootDir, argv) {
  if (argv.includes('--no-sync')) return null;
  try {
    const { loadSyncConfig, defaultPaths } = require('../sync/syncFiles');
    const config = loadSyncConfig({ env: process.env, file: defaultPaths(rootDir).configFile });
    return config.configured ? { url: config.url, key: config.key } : null;
  } catch (error) { return null; }
}

// "started / resumed / ended" notices (email + Telegram) through the backend; silently nothing when not set up
function createAnnouncer({ backend, projectName, account, log }) {
  if (!backend) return async () => false;
  let events;
  try { events = require('../sync/backendEvents'); } catch (error) { return async () => false; }
  if (typeof events.announceLifecycle !== 'function') return async () => false;
  const client = events.createEventsClient({ url: backend.url, key: backend.key });
  return (kind, detail) => events.announceLifecycle({
    client, log,
    event: { eventId: `${projectName}|${account}|${kind}|${Date.now()}`, project: projectName, event: kind, occurredAt: new Date().toISOString(), account: { name: account, device: os.hostname() }, detail },
  });
}

// the browser, with its own saved profile per program (never your betting profile)
async function launchBrowser({ config, account, headless, viewport = { width: 1280, height: 800 } }) {
  const { chromium } = require('playwright');
  const channel = process.env.OBSERVER_BROWSER_CHANNEL !== undefined ? (process.env.OBSERVER_BROWSER_CHANNEL || undefined) : config.browserChannel;
  const profileDir = `${config.profileDir}-${account}`;
  // OBSERVER_PROXY=http://user:pass@host:port sends the browser's traffic through that proxy (for a server whose address BetKing refuses)
  let proxy;
  if (process.env.OBSERVER_PROXY) {
    const url = new URL(process.env.OBSERVER_PROXY);
    proxy = { server: `${url.protocol}//${url.host}`, ...(url.username ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) } : {}) };
  }
  // a server has no screen: Chrome there needs these flags to start
  const args = process.env.OBSERVER_NO_SANDBOX === 'yes' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
  const context = await chromium.launchPersistentContext(profileDir, { headless, channel, timeout: config.browserLaunchTimeoutMs, viewport, proxy, args });
  return { context, profileDir };
}

const DEFAULT_LIST_URL = 'https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-liga';
const listUrlFor = (config) => process.env.OBSERVER_LIST_URL || (/\/leagues\/[^/?#]+/.test(config.targetUrl || '') ? config.targetUrl : DEFAULT_LIST_URL);

module.exports = { argValue, sleep, lagosClock, createLog, loadBackend, createAnnouncer, launchBrowser, listUrlFor };
