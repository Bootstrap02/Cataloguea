const { readVisibleText } = require('../browser/pageActions');
const liveResultObserver = require('./liveResultObserver');

const RESULT_SOURCE = 'local_simulated_sportsbook';

async function observeResult(page, { clock = () => new Date().toISOString() } = {}) {
  const status = (await readVisibleText(page.getByLabel('Result status'))).trim();
  const fixture = {
    id: (await readVisibleText(page.getByLabel('Result fixture'))).trim(),
    home: (await readVisibleText(page.getByLabel('Result home team'))).trim(),
    away: (await readVisibleText(page.getByLabel('Result away team'))).trim(),
  };
  const timestamp = clock();

  if (status === 'pending') {
    return {
      fixture,
      status,
      result: null,
      timestamp,
      source: RESULT_SOURCE,
    };
  }
  if (status !== 'complete') {
    throw new Error(`Unrecognized simulated result status "${status}".`);
  }

  const homeScore = (await readVisibleText(page.getByLabel('Result home score'))).trim();
  const awayScore = (await readVisibleText(page.getByLabel('Result away score'))).trim();
  return {
    fixture,
    status,
    result: { homeScore, awayScore },
    timestamp,
    source: RESULT_SOURCE,
  };
}

function verifyResult(observation, expectedFixture) {
  if (!observation || !expectedFixture) {
    throw new TypeError('An observed result and expected fixture are required.');
  }
  if (
    observation.fixture?.id !== expectedFixture.id
    || observation.fixture?.home !== expectedFixture.home
    || observation.fixture?.away !== expectedFixture.away
  ) {
    throw new Error(
      `Result fixture mismatch: expected ${expectedFixture.id} (${expectedFixture.home} vs ${expectedFixture.away}), `
      + `observed ${observation.fixture?.id} (${observation.fixture?.home} vs ${observation.fixture?.away}).`,
    );
  }
  if (observation.status === 'pending') {
    if (observation.result !== null) {
      throw new Error('Pending result observation unexpectedly contains a score.');
    }
    return { ...observation, fixture: { ...observation.fixture }, result: null };
  }
  if (observation.status !== 'complete') {
    throw new Error(`Result is not complete: ${observation.status}.`);
  }

  const scores = [observation.result?.homeScore, observation.result?.awayScore];
  if (!scores.every((score) => typeof score === 'string' && /^\d+$/.test(score))) {
    throw new Error('Completed result has missing or ambiguous scores.');
  }
  const [homeScore, awayScore] = scores.map(Number);
  if (!Number.isSafeInteger(homeScore) || !Number.isSafeInteger(awayScore)) {
    throw new Error('Completed result scores are outside the supported integer range.');
  }

  return {
    fixture: { ...observation.fixture },
    status: 'verified',
    result: { homeScore, awayScore },
    timestamp: observation.timestamp,
    source: observation.source,
  };
}

module.exports = {
  ...liveResultObserver,
  RESULT_SOURCE,
  observeResult,
  verifyResult,
};
