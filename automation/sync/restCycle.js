// The daily rest cycle: work until 23:59 (Lagos), finish the round in hand, save, shut down, and start again at 00:00
// on the 3rd day (72 hours after the day began). These are the small, testable pieces; laliga-cycle.js uses them.
const fs = require('fs');
const path = require('path');
const { clockParts } = require('./dailyJobs');

const REST_EXIT = 10;   // the exit code of laliga-run.js that means "scheduled rest, start me again later"

function addDays(day, count) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + count)).toISOString().slice(0, 10);
}

// The instant at which the clock of `timeZone` reads 00:00 on `day` ("YYYY-MM-DD").
function zonedMidnight(day, timeZone) {
  const [y, m, d] = day.split('-').map(Number);
  const wanted = Date.UTC(y, m - 1, d);
  let guess = wanted;
  for (let i = 0; i < 4; i += 1) {
    const shown = clockParts(new Date(guess), timeZone);
    const diff = wanted - Date.parse(`${shown.day}T${shown.hhmm}:00Z`);
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

// restDay = the working day that just ended. With cycleDays = 3 the next working day is 3 days later (72 hours between starts).
function computeResumeAt({ restDay, cycleDays = 3, timeZone = 'Africa/Lagos' }) {
  return zonedMidnight(addDays(restDay, Math.max(1, cycleDays)), timeZone);
}

const showTime = (date, timeZone = 'Africa/Lagos') => `${new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'full', timeStyle: 'short' }).format(date)} (Lagos time)`;

const restFile = (dir) => path.join(dir, 'laliga-rest.json');
function writeRest(dir, info) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(restFile(dir), `${JSON.stringify(info, null, 2)}\n`); }
function readRest(dir) { try { return JSON.parse(fs.readFileSync(restFile(dir), 'utf8')); } catch (error) { return null; } }
function clearRest(dir) { try { fs.unlinkSync(restFile(dir)); } catch (error) { /* nothing to remove */ } }

module.exports = { REST_EXIT, addDays, zonedMidnight, computeResumeAt, showTime, writeRest, readRest, clearRest };
