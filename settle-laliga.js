// Settle (or discard) a La Liga round that was left open, for example when the run stopped right after the bets.
//   node settle-laliga.js --winners BAR --teams VAL,SEV      (the bets you PLACED that WON, read from My Bets)
//   node settle-laliga.js --winners none --teams none
//   node settle-laliga.js --discard-open                    (nothing was placed: forget the open round)
const path = require('node:path');
const { createFileStore } = require('./automation/laLigaStore');
const { settleRound, discardRound } = require('./automation/strategy/laLigaStrategy');

const list = (name) => {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? 'none' : process.argv[index + 1];
  return !value || value === 'none' ? [] : value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
};

const file = path.join(__dirname, 'automation', 'artifacts', process.argv.includes('--trial') ? 'laliga-state.trial.json' : 'laliga-state.json');
const store = createFileStore({ file });
if (!store.state.open) { console.log('No round is open; nothing to do.'); process.exit(0); }
if (process.argv.includes('--discard-open')) {
  store.state = discardRound(store.state);
  store.save();
  console.log('The open round was discarded (its winner stakes were taken back out of the running cost).');
} else {
  const winners = list('--winners');
  const teams = list('--teams');
  console.log(`Settling ${store.state.open.roundId} with winners ${winners.join(', ') || 'none'} and protecting wins ${teams.join(', ') || 'none'}.`);
  store.state = settleRound(store.state, { winnersHit: winners, teamWinners: teams });
  store.save();
  console.log(`Settled and saved in ${file}.`);
}
