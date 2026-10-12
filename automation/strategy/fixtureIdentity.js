const { ASSET_KEYS } = require('./catalogueaAdapter');

const FIXTURE_IDENTITY_CONFIDENCE = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  AMBIGUOUS: 'AMBIGUOUS',
});

const FIXTURE_IDENTITY_SOURCES = Object.freeze({
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  RESULTS: 'results',
});

function normalizeTeamCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeTeamName(value) {
  return String(value ?? '').trim().toUpperCase();
}

function extractBetKingFixtureId(rawId) {
  if (!rawId || typeof rawId !== 'string') return null;
  const match = rawId.match(/matchup-statistics-button-(.+)-(.+)/);
  if (match) {
    return {
      fullId: rawId,
      home: normalizeTeamCode(match[1]),
      away: normalizeTeamCode(match[2]),
    };
  }
  const parts = rawId.split('-').filter(Boolean);
  if (parts.length >= 2) {
    return {
      fullId: rawId,
      home: normalizeTeamCode(parts[0]),
      away: normalizeTeamCode(parts[1]),
    };
  }
  return null;
}

function parseRoundIdentifier(roundName) {
  if (!roundName || typeof roundName !== 'string') return null;
  const match = roundName.match(/week\s*(\d+)/i);
  if (match) return { type: 'week', number: parseInt(match[1], 10) };
  const roundMatch = roundName.match(/round\s*(\d+)/i);
  if (roundMatch) return { type: 'round', number: parseInt(roundMatch[1], 10) };
  return { type: 'unknown', label: roundName };
}

function createCatalogueaFixtureIdentity(fixture) {
  if (!fixture) return null;
  return {
    source: 'cataloguea',
    id: fixture.id,
    home: normalizeTeamCode(fixture.home),
    away: normalizeTeamCode(fixture.away),
    homeName: normalizeTeamName(fixture.home),
    awayName: normalizeTeamName(fixture.away),
    oddsKeys: Object.keys(fixture).filter((k) => ASSET_KEYS.includes(k) || k === 'winner'),
  };
}

function createBetKingFixtureIdentity(fixture, roundInfo = {}) {
  if (!fixture) return null;
  const extracted = extractBetKingFixtureId(fixture.fixtureId ?? fixture.scheduledMatchId ?? '');
  const home = normalizeTeamCode(fixture.home ?? extracted?.home ?? '');
  const away = normalizeTeamCode(fixture.away ?? extracted?.away ?? '');
  const round = parseRoundIdentifier(roundInfo.roundName ?? roundInfo.roundId ?? '');
  return {
    source: 'betking',
    fixtureId: fixture.fixtureId,
    scheduledMatchId: fixture.scheduledMatchId,
    home,
    away,
    homeName: normalizeTeamName(fixture.home),
    awayName: normalizeTeamName(fixture.away),
    market: fixture.market,
    round: round,
    roundName: roundInfo.roundName,
    roundId: roundInfo.roundId,
    timer: roundInfo.timer,
    selectors: fixture.selectors,
  };
}

function calculateIdentityMatch(catalogueaIdentity, betKingIdentity) {
  if (!catalogueaIdentity || !betKingIdentity) {
    return { matched: false, confidence: FIXTURE_IDENTITY_CONFIDENCE.LOW, reasons: ['Missing identity'] };
  }

  const reasons = [];
  let score = 0;
  const maxScore = 4;

  if (catalogueaIdentity.home === betKingIdentity.home && catalogueaIdentity.away === betKingIdentity.away) {
    score += 2;
    reasons.push('Home and away teams match exactly');
  } else if (
    catalogueaIdentity.home === betKingIdentity.away && catalogueaIdentity.away === betKingIdentity.home
  ) {
    score += 1;
    reasons.push('Home and away teams match but reversed');
  } else {
    reasons.push('Team mismatch');
  }

  if (catalogueaIdentity.id && betKingIdentity.fixtureId) {
    const catId = catalogueaIdentity.id.toUpperCase();
    // Cataloguea fixture IDs are concatenated 3-char team codes (e.g., 'livmnu' = LIV + MNU)
    let catParts = [];
    if (catId.length === 6) {
      catParts = [catId.slice(0, 3), catId.slice(3, 6)];
    } else {
      catParts = catId.split('-').filter(Boolean);
    }
    
    // Extract team codes from BetKing fixtureId (handles matchup-statistics-button-LIV-COV format)
    let bkParts = betKingIdentity.fixtureId.toUpperCase().split('-').filter(Boolean);
    if (bkParts.length >= 4 && bkParts[0] === 'MATCHUP' && bkParts[1] === 'STATISTICS' && bkParts[2] === 'BUTTON') {
      bkParts = bkParts.slice(3); // Take LIV, COV
    }
    
    if (catParts.length >= 2 && bkParts.length >= 2) {
      if (catParts[0] === bkParts[0] && catParts[1] === bkParts[1]) {
        score += 1;
        reasons.push('Fixture ID components match');
      } else if (catParts[0] === bkParts[1] && catParts[1] === bkParts[0]) {
        score += 0.5;
        reasons.push('Fixture ID components match but reversed');
      }
    }
  }

  if (catalogueaIdentity.homeName && betKingIdentity.homeName &&
      catalogueaIdentity.homeName === betKingIdentity.homeName) {
    score += 0.5;
    reasons.push('Home team name matches');
  }
  if (catalogueaIdentity.awayName && betKingIdentity.awayName &&
      catalogueaIdentity.awayName === betKingIdentity.awayName) {
    score += 0.5;
    reasons.push('Away team name matches');
  }

  let confidence;
  if (score >= 3.5) confidence = FIXTURE_IDENTITY_CONFIDENCE.HIGH;
  else if (score >= 2.5) confidence = FIXTURE_IDENTITY_CONFIDENCE.MEDIUM;
  else if (score >= 1.5) confidence = FIXTURE_IDENTITY_CONFIDENCE.LOW;
  else confidence = FIXTURE_IDENTITY_CONFIDENCE.AMBIGUOUS;

  return {
    matched: score >= 2,
    confidence,
    score,
    maxScore,
    reasons,
    cataloguea: catalogueaIdentity,
    betKing: betKingIdentity,
  };
}

function matchCatalogueaToBetKingFixtures(catalogueaFixture, betKingSnapshot, options = {}) {
  const { source = FIXTURE_IDENTITY_SOURCES.SCHEDULED, minConfidence = FIXTURE_IDENTITY_CONFIDENCE.MEDIUM } = options;
  const catalogueaIdentity = createCatalogueaFixtureIdentity(catalogueaFixture);
  if (!catalogueaIdentity) {
    return { status: 'NO_CATALOGUEA_FIXTURE', matches: [] };
  }

  if (!betKingSnapshot?.rounds || !Array.isArray(betKingSnapshot.rounds)) {
    return { status: 'NO_BETKING_ROUNDS', matches: [] };
  }

  const matches = [];
  for (const round of betKingSnapshot.rounds) {
    const roundInfo = { roundName: round.roundName, roundId: round.roundId, timer: round.timer };
    for (const fixture of round.fixtures || []) {
      const betKingIdentity = createBetKingFixtureIdentity(fixture, roundInfo);
      const match = calculateIdentityMatch(catalogueaIdentity, betKingIdentity);
      if (match.matched) {
        matches.push({
          ...match,
          source,
          roundName: round.roundName,
          roundId: round.roundId,
          timer: round.timer,
          fixture: betKingIdentity,
        });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);

  const highConfidence = matches.filter((m) => m.confidence === FIXTURE_IDENTITY_CONFIDENCE.HIGH);
  const mediumConfidence = matches.filter((m) => m.confidence === FIXTURE_IDENTITY_CONFIDENCE.MEDIUM);
  const lowConfidence = matches.filter((m) => m.confidence === FIXTURE_IDENTITY_CONFIDENCE.LOW);

  let status = 'NO_MATCH';
  let bestMatch = null;
  let ambiguous = false;

  if (highConfidence.length === 1) {
    status = 'MATCHED_HIGH_CONFIDENCE';
    bestMatch = highConfidence[0];
  } else if (highConfidence.length > 1) {
    status = 'AMBIGUOUS_HIGH_CONFIDENCE';
    ambiguous = true;
    bestMatch = highConfidence[0];
  } else if (mediumConfidence.length === 1 && minConfidence <= FIXTURE_IDENTITY_CONFIDENCE.MEDIUM) {
    status = 'MATCHED_MEDIUM_CONFIDENCE';
    bestMatch = mediumConfidence[0];
  } else if (mediumConfidence.length > 1) {
    status = 'AMBIGUOUS_MEDIUM_CONFIDENCE';
    ambiguous = true;
    bestMatch = mediumConfidence[0];
  } else if (lowConfidence.length === 1 && minConfidence <= FIXTURE_IDENTITY_CONFIDENCE.LOW) {
    status = 'MATCHED_LOW_CONFIDENCE';
    bestMatch = lowConfidence[0];
  } else if (lowConfidence.length > 0) {
    status = 'AMBIGUOUS_LOW_CONFIDENCE';
    ambiguous = true;
    bestMatch = lowConfidence[0];
  }

  return {
    status,
    ambiguous,
    bestMatch,
    allMatches: matches,
    catalogueaFixture: catalogueaIdentity,
  };
}

function createCrossViewFixtureIdentity(scheduledMatch, liveMatch, resultsMatch) {
  const identities = [scheduledMatch, liveMatch, resultsMatch].filter(Boolean);
  if (identities.length === 0) return null;

  const base = identities[0];
  const crossView = {
    id: base.fixtureId ?? base.id,
    home: base.home,
    away: base.away,
    homeName: base.homeName,
    awayName: base.awayName,
    sources: {
      scheduled: scheduledMatch ? { fixtureId: scheduledMatch.fixtureId, roundName: scheduledMatch.roundName, roundId: scheduledMatch.roundId } : null,
      live: liveMatch ? { fixtureId: liveMatch.fixtureId, roundName: liveMatch.roundName, roundId: liveMatch.roundId } : null,
      results: resultsMatch ? { fixtureId: resultsMatch.fixtureId, roundName: resultsMatch.roundName, roundId: resultsMatch.roundId } : null,
    },
    confidence: FIXTURE_IDENTITY_CONFIDENCE.MEDIUM,
  };

  if (scheduledMatch && liveMatch) {
    if (scheduledMatch.home === liveMatch.home && scheduledMatch.away === liveMatch.away) {
      crossView.confidence = FIXTURE_IDENTITY_CONFIDENCE.HIGH;
    } else {
      crossView.confidence = FIXTURE_IDENTITY_CONFIDENCE.LOW;
    }
  }

  return crossView;
}

module.exports = {
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
};