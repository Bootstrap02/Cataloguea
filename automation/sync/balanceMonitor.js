// Watches the BetKing wallet balance and tells you (one email, naming the account) when it falls under the alert level.
//   * the balance is read from the page every 30 seconds (reading only: nothing is clicked)
//   * two readings in a row under the level are needed, so one odd reading never sends a false alarm
//   * after the alert, the next one only comes if the balance went back to the level or above and fell again
function createBalanceMonitor({
  readBalance, send, threshold = 5000, intervalMs = 30000, confirmReads = 2, log = () => {},
  now = () => new Date(), setIntervalFn = setInterval, clearIntervalFn = clearInterval,
}) {
  let lows = 0;
  let alerted = false;
  let crossingId = null;
  let busy = false;
  let lastBalance = null;

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const balance = await Promise.resolve().then(readBalance).catch(() => null);
      if (balance === null || balance === undefined || !Number.isFinite(balance)) return;
      lastBalance = balance;
      if (balance >= threshold) {
        if (alerted) log(`  Balance is back at N${balance}: the low-balance alert is armed again.`);
        lows = 0; alerted = false; crossingId = null;
        return;
      }
      lows += 1;
      if (!crossingId) crossingId = now().toISOString();   // the same id on every retry of this drop: the backend never emails it twice
      if (lows >= confirmReads && !alerted) {
        log(`  Balance N${balance} is under N${threshold}: sending the low-balance email.`);
        alerted = (await send({ balance, threshold, crossingId })) === true;
      }
    } finally { busy = false; }
  }

  const timer = setIntervalFn(tick, intervalMs);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return { tick, stop: () => clearIntervalFn(timer), last: () => lastBalance };
}

module.exports = { createBalanceMonitor };
