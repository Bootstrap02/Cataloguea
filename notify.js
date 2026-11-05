// A tone, a desktop pop-up and a banner for a 6-0 win. Works on Linux (your Ubuntu), macOS and Windows, and always
// falls back to the terminal bell, so there is always at least a beep.
//   LALIGA_WIN_SOUND=/path/to/your-ringtone.mp3   plays your own sound instead (needs paplay, ffplay, mpg123 or vlc)
//   LALIGA_SOUND=off                               silences it
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const LINUX_SOUNDS = [
  '/usr/share/sounds/freedesktop/stereo/complete.oga',
  '/usr/share/sounds/freedesktop/stereo/message.oga',
  '/usr/share/sounds/freedesktop/stereo/bell.oga',
  '/usr/share/sounds/ubuntu/stereo/message.ogg',
];

function runOnce(spawnFn, command, args, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let finished = false;
    const done = (ok) => { if (!finished) { finished = true; resolve(ok); } };
    try {
      const child = spawnFn(command, args, { stdio: 'ignore' });
      child.on('error', () => done(false));
      child.on('close', (code) => done(code === 0));
      setTimeout(() => { try { child.kill(); } catch (error) { /* already gone */ } done(true); }, timeoutMs).unref?.();
    } catch (error) { done(false); }
  });
}

// The player commands to try, in order, for one sound file.
function playerCommands(file, platform) {
  if (platform === 'darwin') return [['afplay', [file]]];
  if (platform === 'win32') return [['powershell', ['-c', `(New-Object Media.SoundPlayer '${file}').PlaySync()`]]];
  return [
    ['paplay', [file]],
    ['canberra-gtk-play', ['-f', file]],
    ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', file]],
    ['mpg123', ['-q', file]],
    ['cvlc', ['--play-and-exit', '--intf', 'dummy', file]],
    ['aplay', ['-q', file]],
  ];
}

async function playSound({ env = process.env, platform = process.platform, exists = fs.existsSync, spawnFn = spawn, repeat = 3 } = {}) {
  if (String(env.LALIGA_SOUND || '').toLowerCase() === 'off') return { played: 'off' };
  const files = [];
  if (env.LALIGA_WIN_SOUND && exists(env.LALIGA_WIN_SOUND)) files.push(env.LALIGA_WIN_SOUND);
  if (platform === 'darwin') files.push('/System/Library/Sounds/Glass.aiff');
  if (platform === 'win32') files.push('C:\\Windows\\Media\\tada.wav');
  if (platform !== 'darwin' && platform !== 'win32') files.push(...LINUX_SOUNDS.filter((file) => exists(file)));
  for (const file of files) {
    for (const [command, args] of playerCommands(file, platform)) {
      if (!(await runOnce(spawnFn, command, args))) continue;
      for (let i = 1; i < repeat; i += 1) await runOnce(spawnFn, command, args);   // a ringtone: three times
      return { played: command, file };
    }
  }
  return { played: null };
}

async function desktopNotice(title, message, { platform = process.platform, spawnFn = spawn } = {}) {
  if (platform === 'darwin') return runOnce(spawnFn, 'osascript', ['-e', `display notification "${message}" with title "${title}"`]);
  if (platform === 'win32') return false;
  return runOnce(spawnFn, 'notify-send', ['--urgency=critical', title, message]);
}

// What is shown and heard the moment a 6-0 comes in. `write` is where the banner and the terminal bell go.
async function celebrate({ title = '6-0 WIN!', lines = [], write = (text) => process.stdout.write(text), soundOptions = {}, noticeOptions = {} } = {}) {
  const width = Math.max(48, title.length + 8, ...lines.map((line) => line.length + 6));
  const bar = '='.repeat(width);
  write(`\n${bar}\n   ${title}\n${lines.map((line) => `   ${line}\n`).join('')}${bar}\n`);
  const result = { bell: false, played: null, notified: false };
  const sound = await playSound(soundOptions);
  result.played = sound.played;
  if (!sound.played || sound.played === 'off') {
    if (sound.played !== 'off') { write('\x07'); await new Promise((resolve) => setTimeout(resolve, 250)); write('\x07'); result.bell = true; }
  }
  result.notified = await desktopNotice(title, lines.join(' | '), noticeOptions);
  return result;
}

module.exports = { celebrate, playSound, desktopNotice, playerCommands };
