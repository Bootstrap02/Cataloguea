const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { celebrate, playSound, playerCommands } = require('./notify');

// a fake spawn: commands listed in `working` succeed, anything else "is not installed"
function fakeSpawn(working, calls) {
  return (command, args) => {
    calls.push([command, ...args]);
    const child = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => (working.includes(command) ? child.emit('close', 0) : child.emit('error', new Error('ENOENT'))));
    return child;
  };
}

test('the ringtone plays three times with the first player that works', async () => {
  const calls = [];
  const result = await playSound({ platform: 'linux', exists: (file) => file.endsWith('complete.oga'), spawnFn: fakeSpawn(['ffplay'], calls), env: {} });
  assert.equal(result.played, 'ffplay');
  assert.equal(calls.filter((call) => call[0] === 'ffplay').length, 3);
  assert.ok(calls.some((call) => call[0] === 'paplay'), 'paplay was tried first');
});

test('your own sound file is used when LALIGA_WIN_SOUND is set and exists', async () => {
  const calls = [];
  const result = await playSound({ platform: 'linux', exists: () => true, spawnFn: fakeSpawn(['paplay'], calls), env: { LALIGA_WIN_SOUND: '/home/louis/win.mp3' }, repeat: 1 });
  assert.equal(result.file, '/home/louis/win.mp3');
  assert.deepEqual(calls[0], ['paplay', '/home/louis/win.mp3']);
});

test('LALIGA_SOUND=off keeps it silent', async () => {
  const calls = [];
  assert.deepEqual(await playSound({ env: { LALIGA_SOUND: 'off' }, spawnFn: fakeSpawn(['paplay'], calls) }), { played: 'off' });
  assert.equal(calls.length, 0);
});

test('with no player installed the terminal bell still sounds, and the banner and desktop notice are shown', async () => {
  const calls = [];
  let output = '';
  const result = await celebrate({
    title: '6-0 WIN!', lines: ['BAR 6-0 at LEV: N69 @ 72.8 returns N5023'],
    write: (text) => { output += text; },
    soundOptions: { platform: 'linux', exists: () => false, spawnFn: fakeSpawn([], calls), env: {} },
    noticeOptions: { platform: 'linux', spawnFn: fakeSpawn(['notify-send'], calls) },
  });
  assert.match(output, /6-0 WIN!/);
  assert.match(output, /BAR 6-0 at LEV/);
  assert.match(output, /\x07/);
  assert.equal(result.bell, true);
  assert.equal(result.notified, true);
  assert.ok(calls.some((call) => call[0] === 'notify-send' && call[2] === '6-0 WIN!'));
});

test('each platform has a player command', () => {
  assert.equal(playerCommands('a.wav', 'darwin')[0][0], 'afplay');
  assert.equal(playerCommands('a.wav', 'win32')[0][0], 'powershell');
  assert.equal(playerCommands('a.wav', 'linux')[0][0], 'paplay');
});
