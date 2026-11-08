const test = require('node:test');
const assert = require('node:assert/strict');
const { createControlPanel, keyAction } = require('./controlPanel');

async function boot(actions) {
  const controller = { status: () => ({ state: 'running', phase: 'watching the matches', round: { name: 'Week 9' }, session: { rounds: 2, staked: 100, returned: 40 }, lastReport: 'RESULTS Week 8', strategy: { winners: ['BAR', 'RMA'], bases: { BAR: 5000, RMA: 5000 }, teamsWithDeficit: 3, bigDeficits: 0, bank: 0, roundsSettled: 2, openRound: false } }) };
  const panel = createControlPanel({ controller, actions, extras: async () => ({ account: 'main' }), getLog: () => ['line 1', 'line 2'], port: 0 });
  const port = await panel.start();
  return { panel, base: `http://127.0.0.1:${port}` };
}

test('the page and the status come back, with the log and the extras', async () => {
  const { panel, base } = await boot({});
  const page = await (await fetch(`${base}/`)).text();
  assert.match(page, /Pause after this round/);
  assert.match(page, /Continue/);
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.state, 'running');
  assert.equal(status.account, 'main');
  assert.deepEqual(status.log, ['line 1', 'line 2']);
  await panel.stop();
});

test('the buttons run the actions; a request without the panel header (another web page) is refused', async () => {
  const calls = [];
  const { panel, base } = await boot({ pause: async () => { calls.push('pause'); return { ok: true, message: 'Pausing after this round.' }; } });
  const refused = await fetch(`${base}/api/pause`, { method: 'POST' });
  assert.equal(refused.status, 403);
  assert.deepEqual(calls, []);
  const done = await (await fetch(`${base}/api/pause`, { method: 'POST', headers: { 'X-Panel': '1' } })).json();
  assert.equal(done.message, 'Pausing after this round.');
  assert.deepEqual(calls, ['pause']);
  assert.equal((await fetch(`${base}/api/nothing`, { method: 'POST', headers: { 'X-Panel': '1' } })).status, 404);
  await panel.stop();
});

test('a request that names another host (a rebinding trick) is refused', async () => {
  const { panel, base } = await boot({});
  const response = await fetch(`${base}/api/status`, { headers: { host: 'evil.example.com' } }).catch(() => null);
  // fetch may not allow overriding Host; talk to the socket directly
  const net = require('node:net');
  const port = Number(base.split(':').pop());
  const answer = await new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write('GET /api/status HTTP/1.1\r\nHost: evil.example.com\r\nConnection: close\r\n\r\n'));
    let data = '';
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => resolve(data));
  });
  assert.match(answer, /403/);
  void response;
  await panel.stop();
});

test('terminal keys map to the same actions', () => {
  assert.equal(keyAction('p'), 'pause');
  assert.equal(keyAction('C'), 'resume');
  assert.equal(keyAction('s'), 'stop');
  assert.equal(keyAction('x'), 'stop-now');
  assert.equal(keyAction('u'), 'push');
  assert.equal(keyAction('d'), 'pull');
  assert.equal(keyAction('z'), null);
});
