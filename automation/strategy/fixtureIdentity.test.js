const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FIXTURE_IDENTITY_CONFIDENCE,
  FIXTURE_IDENTITY_SOURCES,
  normalizeTeamCode,
  normalizeTeamName,
  extractBetKingFixtureId,
  parseRoundIdentifier,
  createCatalogueaFixtureIdentity,
  createBetKingFixtureIdentity,
  calculateIdentityMatch,
  matchCatalogueaToBetKingFixtures,
  createCrossViewFixtureIdentity,
} = require('./fixtureIdentity');

test('normalizeTeamCode removes non-alphanumeric and uppercases', () => {
  assert.equal(normalizeTeamCode('liv'), 'LIV');
  assert.equal(normalizeTeamCode('LiVeRpOoL'), 'LIVERPOOL');
  assert.equal(normalizeTeamCode('man-u'), 'MANU');
  assert.equal(normalizeTeamCode(''), '');
});

test('normalizeTeamName uppercases and trims', () => {
  assert.equal(normalizeTeamName('  arsenal  '), 'ARSENAL');
  assert.equal(normalizeTeamName('Manchester United'), 'MANCHESTER UNITED');
});

test('extractBetKingFixtureId parses matchup-statistics-button format', () => {
  const result = extractBetKingFixtureId('matchup-statistics-button-ARS-COV');
  assert.deepEqual(result, { fullId: 'matchup-statistics-button-ARS-COV', home: 'ARS', away: 'COV' });
});

test('extractBetKingFixtureId handles alternative formats', () => {
  const result = extractBetKingFixtureId('ARS-COV');
  assert.deepEqual(result, { fullId: 'ARS-COV', home: 'ARS', away: 'COV' });
});

test('extractBetKingFixtureId returns null for invalid input', () => {
  assert.equal(extractBetKingFixtureId(null), null);
  assert.equal(extractBetKingFixtureId(''), null);
  assert.equal(extractBetKingFixtureId('ARS'), null);
});

test('parseRoundIdentifier extracts week numbers', () => {
  assert.deepEqual(parseRoundIdentifier('Week 33'), { type: 'week', number: 33 });
  assert.deepEqual(parseRoundIdentifier('week 7'), { type: 'week', number: 7 });
  assert.deepEqual(parseRoundIdentifier('Round 5'), { type: 'round', number: 5 });
  assert.deepEqual(parseRoundIdentifier('Group Stage'), { type: 'unknown', label: 'Group Stage' });
  assert.equal(parseRoundIdentifier(null), null);
});

test('createCatalogueaFixtureIdentity builds identity from fixture', () => {
  const fixture = { id: 'arsmnu', home: 'ars', away: 'mnu', winner: 325, oneX: 14.7 };
  const identity = createCatalogueaFixtureIdentity(fixture);
  assert.equal(identity.source, 'cataloguea');
  assert.equal(identity.id, 'arsmnu');
  assert.equal(identity.home, 'ARS');
  assert.equal(identity.away, 'MNU');
});

test('createBetKingFixtureIdentity builds identity from BetKing fixture', () => {
  const fixture = { fixtureId: 'matchup-statistics-button-ARS-COV', scheduledMatchId: 'matchup-statistics-button-ARS-COV', home: 'ARS', away: 'COV', market: '1X2' };
  const roundInfo = { roundName: 'Week 33', roundId: '33', timer: '01:23' };
  const identity = createBetKingFixtureIdentity(fixture, roundInfo);
  assert.equal(identity.source, 'betking');
  assert.equal(identity.home, 'ARS');
  assert.equal(identity.away, 'COV');
  assert.equal(identity.round.type, 'week');
  assert.equal(identity.round.number, 33);
});

test('calculateIdentityMatch returns HIGH confidence for exact match', () => {
  const cat = { id: 'arscov', home: 'ARS', away: 'COV', homeName: 'ARSENAL', awayName: 'COVENTRY' };
  const bk = { fixtureId: 'matchup-statistics-button-ARS-COV', home: 'ARS', away: 'COV', homeName: 'ARSENAL', awayName: 'COVENTRY' };
  const match = calculateIdentityMatch(cat, bk);
  assert.equal(match.matched, true);
  assert.equal(match.confidence, FIXTURE_IDENTITY_CONFIDENCE.HIGH);
  assert.ok(match.score >= 3.5);
});

test('calculateIdentityMatch returns MEDIUM for team match only', () => {
  const cat = { id: 'arscov', home: 'ARS', away: 'COV', homeName: 'ARSENAL', awayName: 'COVENTRY' };
  const bk = { fixtureId: 'matchup-statistics-button-ARS-CHE', home: 'ARS', away: 'COV', homeName: 'ARSENAL', awayName: 'COVENTRY' };
  const match = calculateIdentityMatch(cat, bk);
  assert.equal(match.matched, true);
  assert.equal(match.confidence, FIXTURE_IDENTITY_CONFIDENCE.MEDIUM);
});

test('calculateIdentityMatch returns AMBIGUOUS for low score', () => {
  const cat = { id: 'arscov', home: 'ARS', away: 'COV' };
  const bk = { fixtureId: 'matchup-statistics-button-MNU-CHE', home: 'MNU', away: 'CHE' };
  const match = calculateIdentityMatch(cat, bk);
  assert.equal(match.matched, false);
  assert.equal(match.confidence, FIXTURE_IDENTITY_CONFIDENCE.AMBIGUOUS);
});

test('calculateIdentityMatch handles reversed home/away with low confidence', () => {
  const cat = { id: 'arscov', home: 'ARS', away: 'COV' };
  const bk = { fixtureId: 'matchup-statistics-button-COV-ARS', home: 'COV', away: 'ARS' };
  const match = calculateIdentityMatch(cat, bk);
  // Reversed teams give 1 point, fixture ID reversed gives 0.5 = 1.5 total (LOW confidence)
  assert.equal(match.matched, false);
  assert.equal(match.confidence, FIXTURE_IDENTITY_CONFIDENCE.LOW);
  assert.ok(match.reasons.some(r => r.includes('reversed')));
});

test('matchCatalogueaToBetKingFixtures finds exact match in scheduled data', () => {
  const catalogueaFixture = { id: 'arsmnu', home: 'ars', away: 'mnu', winner: 325 };
  const betKingSnapshot = {
    rounds: [{
      roundName: 'Week 33',
      roundId: '33',
      timer: '01:23',
      fixtures: [
        { fixtureId: 'matchup-statistics-button-ARS-MNU', home: 'ARS', away: 'MNU', market: '1X2' },
        { fixtureId: 'matchup-statistics-button-COV-IPS', home: 'COV', away: 'IPS', market: '1X2' },
      ],
    }],
  };
  const result = matchCatalogueaToBetKingFixtures(catalogueaFixture, betKingSnapshot);
  assert.equal(result.status, 'MATCHED_HIGH_CONFIDENCE');
  assert.equal(result.bestMatch.betKing.home, 'ARS');
  assert.equal(result.bestMatch.betKing.away, 'MNU');
  assert.equal(result.ambiguous, false);
});

test('matchCatalogueaToBetKingFixtures detects ambiguous fixtures across rounds', () => {
  const catalogueaFixture = { id: 'arscov', home: 'ars', away: 'cov', winner: 325 };
  const betKingSnapshot = {
    rounds: [
      { roundName: 'Week 33', roundId: '33', timer: '01:23', fixtures: [{ fixtureId: 'matchup-statistics-button-ARS-COV', home: 'ARS', away: 'COV', market: '1X2' }] },
      { roundName: 'Week 34', roundId: '34', timer: '04:23', fixtures: [{ fixtureId: 'matchup-statistics-button-ARS-COV', home: 'ARS', away: 'COV', market: '1X2' }] },
    ],
  };
  const result = matchCatalogueaToBetKingFixtures(catalogueaFixture, betKingSnapshot);
  assert.equal(result.status, 'AMBIGUOUS_HIGH_CONFIDENCE');
  assert.equal(result.ambiguous, true);
  assert.equal(result.allMatches.length, 2);
});

test('matchCatalogueaToBetKingFixtures returns NO_MATCH when no fixture found', () => {
  const catalogueaFixture = { id: 'arsars', home: 'ars', away: 'liv', winner: 325 };
  const betKingSnapshot = {
    rounds: [{
      roundName: 'Week 33',
      roundId: '33',
      timer: '01:23',
      fixtures: [{ fixtureId: 'matchup-statistics-button-ARS-MNU', home: 'ARS', away: 'MNU', market: '1X2' }],
    }],
  };
  const result = matchCatalogueaToBetKingFixtures(catalogueaFixture, betKingSnapshot);
  assert.equal(result.status, 'NO_MATCH');
  assert.equal(result.allMatches.length, 0);
});

test('matchCatalogueaToBetKingFixtures respects minConfidence threshold', () => {
  const catalogueaFixture = { id: 'arsmnu', home: 'ars', away: 'mnu', winner: 325 };
  const betKingSnapshot = {
    rounds: [{
      roundName: 'Week 33',
      roundId: '33',
      timer: '01:23',
      fixtures: [{ fixtureId: 'matchup-statistics-button-ARS-MNU', home: 'ARS', away: 'MNU', market: '1X2' }],
    }],
  };
  // With HIGH minConfidence, a MEDIUM match should not be returned
  const result = matchCatalogueaToBetKingFixtures(catalogueaFixture, betKingSnapshot, { minConfidence: FIXTURE_IDENTITY_CONFIDENCE.HIGH });
  // Since this is an exact match, it should be HIGH confidence
  assert.equal(result.status, 'MATCHED_HIGH_CONFIDENCE');
});

test('createCrossViewFixtureIdentity builds cross-view identity', () => {
  const scheduled = { fixtureId: 'matchup-statistics-button-ARS-COV', home: 'ARS', away: 'COV', roundName: 'Week 33', roundId: '33' };
  const live = { fixtureId: 'matchup-statistics-button-ARS-COV', home: 'ARS', away: 'COV', roundName: 'Week 33', roundId: '33' };
  const results = { fixtureId: 'matchup-statistics-button-ARS-COV', home: 'ARS', away: 'COV', roundName: 'Week 33', roundId: '33' };
  const crossView = createCrossViewFixtureIdentity(scheduled, live, results);
  assert.equal(crossView.confidence, FIXTURE_IDENTITY_CONFIDENCE.HIGH);
  assert.equal(crossView.id, 'matchup-statistics-button-ARS-COV');
  assert.ok(crossView.sources.scheduled);
  assert.ok(crossView.sources.live);
  assert.ok(crossView.sources.results);
});

test('createCrossViewFixtureIdentity handles partial views', () => {
  const scheduled = { fixtureId: 'matchup-statistics-button-ARS-COV', home: 'ARS', away: 'COV', roundName: 'Week 33', roundId: '33' };
  const crossView = createCrossViewFixtureIdentity(scheduled, null, null);
  assert.equal(crossView.confidence, FIXTURE_IDENTITY_CONFIDENCE.MEDIUM);
  assert.ok(crossView.sources.scheduled);
  assert.equal(crossView.sources.live, null);
  assert.equal(crossView.sources.results, null);
});

test('createCrossViewFixtureIdentity detects mismatch between views', () => {
  const scheduled = { fixtureId: 'matchup-statistics-button-ARS-COV', home: 'ARS', away: 'COV', roundName: 'Week 33', roundId: '33' };
  const live = { fixtureId: 'matchup-statistics-button-ARS-MNU', home: 'ARS', away: 'MNU', roundName: 'Week 33', roundId: '33' };
  const crossView = createCrossViewFixtureIdentity(scheduled, live, null);
  assert.equal(crossView.confidence, FIXTURE_IDENTITY_CONFIDENCE.LOW);
});