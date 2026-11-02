// Loaders for the two user-supplied, evidence-backed configuration files:
//   * selectors file: live / results / bet-slip selectors observed on the real site
//   * mappings file : strategy key -> BetKing market + selection the user VERIFIED
//
// Nothing here guesses. A missing or incomplete file means the capability is
// reported as not configured, and the workflow stops with a clear reason.

const fs = require('node:fs');
const { LIVE_RESULT_SELECTOR_KEYS } = require('./betkingAdapter');
const { STRATEGY_BET_TYPES } = require('../strategy/canonicalBetTypes');

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { exists: false, data: null, problem: null };
  try {
    return { exists: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')), problem: null };
  } catch (error) {
    return { exists: true, data: null, problem: `Could not parse ${filePath}: ${error.message}` };
  }
}

function isSelectorEntry(entry) {
  if (typeof entry === 'string') return entry.trim().length > 0;
  return Boolean(entry) && typeof entry === 'object'
    && typeof entry.selector === 'string' && entry.selector.trim().length > 0
    && (entry.attribute === undefined || (typeof entry.attribute === 'string' && entry.attribute.length > 0));
}

const RESULTS_FIELD_KEYS = Object.freeze([
  'fixtureId', 'home', 'away', 'roundId', 'status', 'homeScoreFT', 'awayScoreFT',
]);
const RESULTS_OPTIONAL_FIELD_KEYS = Object.freeze(['homeScoreHT', 'awayScoreHT']);

function loadBetKingSelectors(filePath) {
  const file = readJsonFile(filePath);
  const problems = [];
  if (file.problem) problems.push(file.problem);
  const data = file.data && typeof file.data === 'object' ? file.data : {};

  let live = null;
  if (data.live !== undefined) {
    const missing = LIVE_RESULT_SELECTOR_KEYS.filter((key) => !isSelectorEntry(data.live[key]));
    if (missing.length === 0) live = data.live;
    else problems.push(`live selectors incomplete; missing: ${missing.join(', ')}`);
  }

  let results = null;
  if (data.results !== undefined) {
    const fields = data.results.fields || {};
    const missing = RESULTS_FIELD_KEYS.filter((key) => !isSelectorEntry(fields[key]));
    const optionalInvalid = RESULTS_OPTIONAL_FIELD_KEYS.filter((key) => fields[key] !== undefined && !isSelectorEntry(fields[key]));
    if (!isSelectorEntry(data.results.rowSelector)) missing.push('rowSelector');
    if (missing.length === 0 && optionalInvalid.length === 0) results = data.results;
    else problems.push(`results selectors incomplete or invalid: ${[...missing, ...optionalInvalid].join(', ')}`);
  }

  let betSlip = null;
  if (data.betSlip !== undefined) {
    if (isSelectorEntry(data.betSlip.stakeInput)) betSlip = data.betSlip;
    else problems.push('betSlip.stakeInput selector is required when betSlip is configured');
  }

  return {
    exists: file.exists,
    filePath,
    problems,
    live,
    liveNavigation: data.liveNavigation && typeof data.liveNavigation === 'object' ? data.liveNavigation : null,
    // Maps the site's own status text to LIVE / FINISHED (keys are upper-cased site text).
    liveStatusMap: data.liveStatusMap && typeof data.liveStatusMap === 'object' ? data.liveStatusMap : {},
    results,
    betSlip,
    configured: { live: live !== null, results: results !== null, betSlip: betSlip !== null },
  };
}

// Only entries the user marked VERIFIED, naming a market, a selection, and the
// evidence they rely on, are accepted. Everything else stays UNRESOLVED.
function loadVerifiedMarketMappings(filePath) {
  const file = readJsonFile(filePath);
  const known = new Set(STRATEGY_BET_TYPES.map((betType) => betType.strategyKey));
  const accepted = {};
  const rejected = [];
  if (file.problem) rejected.push({ key: null, reason: file.problem });
  const data = file.data && typeof file.data === 'object' ? file.data : {};

  for (const [key, entry] of Object.entries(data)) {
    if (key.startsWith('_')) continue;
    if (!known.has(key)) {
      rejected.push({ key, reason: 'Unknown strategy key.' });
      continue;
    }
    const market = typeof entry?.market === 'string' && entry.market.trim()
      ? entry.market.trim()
      : (typeof entry?.category === 'string' ? entry.category.trim() : '');
    const bySide = entry?.selectionBySide && typeof entry.selectionBySide === 'object' ? entry.selectionBySide : null;
    const sideSelectionsValid = bySide
      && typeof bySide.HOME === 'string' && bySide.HOME.trim()
      && typeof bySide.AWAY === 'string' && bySide.AWAY.trim();
    const singleSelectionValid = typeof entry?.selection === 'string' && entry.selection.trim();
    const valid = entry && entry.status === 'VERIFIED'
      && market
      && (singleSelectionValid || sideSelectionsValid)
      && typeof entry.evidence === 'string' && entry.evidence.trim();
    if (!valid) {
      rejected.push({
        key,
        reason: 'Requires status VERIFIED, a market category, a selection (or selectionBySide with HOME and AWAY), and evidence.',
      });
      continue;
    }
    accepted[key] = sideSelectionsValid
      ? {
        status: 'VERIFIED',
        market,
        selectionBySide: { HOME: bySide.HOME.trim(), AWAY: bySide.AWAY.trim() },
        evidence: entry.evidence.trim(),
      }
      : {
        status: 'VERIFIED',
        market,
        selection: entry.selection.trim(),
        evidence: entry.evidence.trim(),
      };
  }
  return { exists: file.exists, filePath, mappings: accepted, rejected };
}

module.exports = {
  RESULTS_FIELD_KEYS,
  loadBetKingSelectors,
  loadVerifiedMarketMappings,
};
