const ASSET_KEYS = Object.freeze([
  'oneX',
  'twoX',
  'x2',
  'tg0',
  'tg6',
  'ht12',
  'ht21',
  'ht30',
  'ft40',
  'ft41',
]);

const ODDS_KEYS = Object.freeze(['winner', ...ASSET_KEYS]);
const FINANCIAL_STATE_KEYS = Object.freeze([
  'baseStake',
  'deficit',
  'smallDeficit',
  'shadow',
  'bank',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, name) {
  if (!isRecord(value)) {
    throw new TypeError(`Cataloguea snapshot "${name}" must be an object.`);
  }
  return value;
}

function requireNonNegativeNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`Cataloguea snapshot "${name}" must be a finite non-negative number.`);
  }
  return value;
}

function readAssetMap(value, name) {
  const map = requireRecord(value, name);
  const normalized = {};

  for (const key of ASSET_KEYS) {
    if (Object.hasOwn(map, key)) {
      normalized[key] = requireNonNegativeNumber(map[key], `${name}.${key}`);
    }
  }
  for (const key of Object.keys(map)) {
    if (!ASSET_KEYS.includes(key)) {
      throw new TypeError(`Cataloguea snapshot "${name}" contains unknown asset "${key}".`);
    }
  }
  return normalized;
}

function readMarks(value, name) {
  if (!(value instanceof Set) && !Array.isArray(value)) {
    throw new TypeError(`Cataloguea snapshot "${name}" must be a Set or array.`);
  }
  const marks = [...value];
  for (const mark of marks) {
    if (typeof mark !== 'string' || !ASSET_KEYS.includes(mark)) {
      throw new TypeError(`Cataloguea snapshot "${name}" contains unknown asset "${mark}".`);
    }
  }
  return [...new Set(marks)];
}

function readFixture(value) {
  if (value === null) return null;
  const fixture = requireRecord(value, 'fixture');
  for (const key of ['id', 'home', 'away']) {
    if (typeof fixture[key] !== 'string' || fixture[key].length === 0) {
      throw new TypeError(`Cataloguea snapshot "fixture.${key}" must be a non-empty string.`);
    }
  }

  const odds = {};
  for (const key of ODDS_KEYS) {
    if (Object.hasOwn(fixture, key)) {
      odds[key] = requireNonNegativeNumber(fixture[key], `fixture.${key}`);
    }
  }

  return {
    id: fixture.id,
    home: fixture.home,
    away: fixture.away,
    odds,
  };
}

function adaptCatalogueaState(snapshot, { clock = () => new Date().toISOString() } = {}) {
  requireRecord(snapshot, 'root');
  const fixture = readFixture(snapshot.fixture);
  const gameStakes = readAssetMap(snapshot.gameStakes, 'gameStakes');
  const bigStakes = readAssetMap(snapshot.bigStakes, 'bigStakes');
  const manualWinnerMarks = readMarks(snapshot.winners, 'winners');
  const manualBigWinnerMarks = readMarks(snapshot.bigWinners, 'bigWinners');
  const financialState = {};

  for (const key of FINANCIAL_STATE_KEYS) {
    financialState[key] = requireNonNegativeNumber(snapshot[key], key);
  }
  const winnerStake = requireNonNegativeNumber(snapshot.winnerStake, 'winnerStake');

  const assets = ASSET_KEYS
    .filter((key) => Object.hasOwn(gameStakes, key) || Object.hasOwn(bigStakes, key))
    .map((key) => ({
      key,
      stake: gameStakes[key] || 0,
      bigDeficitStake: bigStakes[key] || 0,
    }));

  const hasFixture = fixture !== null;
  const hasCalculatedStakes = winnerStake > 0
    || assets.some(({ stake, bigDeficitStake }) => stake > 0 || bigDeficitStake > 0);
  const hasManualResultMarks = manualWinnerMarks.length > 0 || manualBigWinnerMarks.length > 0;

  let status = 'no_active_fixture';
  let recommendedAction = 'await_fixture_submission';
  if (hasFixture && hasCalculatedStakes) {
    status = hasManualResultMarks ? 'manual_result_marked' : 'stakes_available';
    recommendedAction = hasManualResultMarks
      ? 'manual_settlement_available'
      : 'manual_result_entry';
  } else if (hasFixture) {
    status = 'fixture_submitted';
    recommendedAction = 'await_strategy_stakes';
  }

  const timestamp = snapshot.observedAt === undefined ? clock() : snapshot.observedAt;
  if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError('Cataloguea snapshot "observedAt" must be a valid timestamp string.');
  }

  return {
    fixture,
    assets,
    winnerStake,
    recommendedAction,
    strategyState: {
      status,
      resultState: hasManualResultMarks ? 'manual_selection_recorded' : 'not_observed',
      settlementReady: hasFixture && hasManualResultMarks,
      manualWinnerMarks,
      manualBigWinnerMarks,
      financialState,
    },
    observedAt: timestamp,
  };
}

module.exports = { ASSET_KEYS, adaptCatalogueaState };
