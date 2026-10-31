// node settle-round.js --home ars --away bre --score 3-3 --winners oneX
// Feeds one finished round to the strategy by hand. --winners are the options you PLACED that WON (comma
// separated; leave out or use "none" when none won). The strategy state file is the one the automation uses
// (automation/artifacts/strategy-state.json); add --trial to use the trial file instead.
const path = require('path');
const { settleRound } = require('./automation/strategy/settleRound');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

(async () => {
  const home = arg('--home');
  const away = arg('--away');
  const score = arg('--score');
  const winnersArg = arg('--winners');
  if (!home || !away || !score) {
    console.error('Usage: node settle-round.js --home ars --away bre --score 3-3 --winners oneX[,more]   (add --trial for the trial state)');
    process.exit(1);
  }
  const winners = !winnersArg || winnersArg === 'none' ? [] : winnersArg.split(',').map((item) => item.trim()).filter(Boolean);
  const stateFile = path.join(__dirname, 'automation', 'artifacts', process.argv.includes('--trial') ? 'strategy-state.trial.json' : 'strategy-state.json');
  const outcome = await settleRound({ stateFile, baseStake: Number(process.env.AUTOMATION_BASE_STAKE) || 10000, home, away, score, winners, log: console.log });
  console.log(`Settled ${home.toUpperCase()} v ${away.toUpperCase()} ${score} with winners: ${winners.join(', ') || 'none'}.`);
  console.log(`State saved in ${stateFile}. Stakes that round were:`, outcome.stakes);
})().catch((error) => { console.error(error.message); process.exit(1); });
