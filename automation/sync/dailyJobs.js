// Jobs that run at fixed times of the day (Lagos time by default). Every job runs ON ITS OWN: the clock never waits for
// a job and no job waits for another, so a wake-up call can be on its way while the betting carries on untouched.
//   job = { at: '23:55', name: 'wake the server', run: async () => ({ ok, message }) }
function clockParts(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}` };
}

// "23:55, 7:55" -> ['23:55', '07:55'] (24-hour clock; anything that is not a time is ignored)
function parseTimes(text, fallback) {
  const list = String(text ?? fallback ?? '').split(',').map((item) => item.trim()).filter((item) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(item));
  return list.map((item) => item.padStart(5, '0'));
}

function createDailyJobs({
  jobs, timeZone = 'Africa/Lagos', log = () => {}, now = () => new Date(), intervalMs = 15000,
  setIntervalFn = setInterval, clearIntervalFn = clearInterval,
}) {
  const done = new Set();

  function launch(job) {
    log(`  Scheduled (${job.at}, ${timeZone}): ${job.name}.`);
    Promise.resolve().then(() => job.run()).then(
      (result) => log(result?.ok === false ? `  Scheduled "${job.name}": NOT done (${result.message || result.error || 'no answer'}).` : `  Scheduled "${job.name}": ${result?.message || 'done'}.`),
      (error) => log(`  Scheduled "${job.name}": failed (${error.message}).`),
    );
  }

  function tick() {
    const { day, hhmm } = clockParts(now(), timeZone);
    for (const job of jobs) {
      if (job.at !== hhmm) continue;
      const key = `${day}|${job.at}|${job.name}`;
      if (done.has(key)) continue;
      done.add(key);
      launch(job);   // not awaited: nothing here can hold anything up
    }
    if (done.size > 40) for (const old of [...done].slice(0, done.size - 40)) done.delete(old);
  }

  const timer = setIntervalFn(tick, intervalMs);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return { tick, stop: () => clearIntervalFn(timer) };
}

module.exports = { createDailyJobs, parseTimes, clockParts };
