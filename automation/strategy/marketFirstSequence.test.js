const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PIPELINE_DEPTHS,
  STAGES,
  canSelectOdd,
  compareSlipToExpected,
  createOptionPipeline,
  describeAuthorizationRequest,
  parseBetSlipText,
  parseCountdownSeconds,
  parseMoney,
} = require('./marketFirstSequence');

const FIXTURE_EVIDENCE = { verified: true, home: 'ARS', away: 'AST', arsenalSide: 'HOME' };
const MAPPING_EVIDENCE = { mappingStatus: 'VERIFIED', category: 'HT/FT', selection: '1/X' };
const CATEGORY_EVIDENCE = { category: 'HT/FT', observedCategory: 'HT/FT', labelsInFixture: ['1/1', '1/X', '1/2'] };
const SELECTION_EVIDENCE = {
  selection: '1/X', matchedLabel: '1/X', home: 'ARS', away: 'AST', expectedHome: 'ARS', expectedAway: 'AST',
};

function pipelineThroughOdds() {
  const pipeline = createOptionPipeline({ strategyKey: 'oneX' });
  assert.ok(pipeline.advance('FIXTURE_CONFIRMED', FIXTURE_EVIDENCE).ok);
  assert.ok(pipeline.advance('STRATEGY_OPTIONS_RESOLVED', MAPPING_EVIDENCE).ok);
  assert.ok(pipeline.advance('MARKET_CATEGORY_OPENED', CATEGORY_EVIDENCE).ok);
  assert.ok(pipeline.advance('MARKET_SELECTION_IDENTIFIED', SELECTION_EVIDENCE).ok);
  assert.ok(pipeline.advance('ODDS_VERIFIED', { odds: 13.3 }).ok);
  return pipeline;
}

test('the stages follow the market-first order from the recording', () => {
  assert.deepEqual(STAGES, [
    'FIXTURE_CONFIRMED', 'STRATEGY_OPTIONS_RESOLVED', 'MARKET_CATEGORY_OPENED', 'MARKET_SELECTION_IDENTIFIED',
    'ODDS_VERIFIED', 'SELECTION_ADDED', 'BET_SLIP_VERIFIED', 'AWAITING_AUTHORIZATION',
    'WAGER_SUBMITTED', 'WAGER_ACCEPTED',
  ]);
  assert.equal(PIPELINE_DEPTHS.identify, 'ODDS_VERIFIED');
  assert.equal(PIPELINE_DEPTHS.slip, 'AWAITING_AUTHORIZATION');
  assert.equal(PIPELINE_DEPTHS.place, 'WAGER_ACCEPTED');
});

test('stages cannot be skipped: no odd is selectable before the category and selection are verified', () => {
  const pipeline = createOptionPipeline({ strategyKey: 'oneX' });
  assert.equal(pipeline.advance('SELECTION_ADDED', { selectedStateObserved: true, slipCountBefore: 0, slipCountAfter: 1 }).ok, false);
  assert.equal(pipeline.advance('MARKET_CATEGORY_OPENED', CATEGORY_EVIDENCE).ok, false);
  assert.equal(canSelectOdd(pipeline).allowed, false);
});

test('a stage needs observable evidence, not an attempted click', () => {
  const pipeline = createOptionPipeline({ strategyKey: 'oneX' });
  pipeline.advance('FIXTURE_CONFIRMED', FIXTURE_EVIDENCE);
  pipeline.advance('STRATEGY_OPTIONS_RESOLVED', MAPPING_EVIDENCE);
  // The page still shows another category: the category stage is refused.
  const wrong = pipeline.advance('MARKET_CATEGORY_OPENED', { ...CATEGORY_EVIDENCE, observedCategory: '1X2 & GG' });
  assert.equal(wrong.ok, false);
  const noLabels = pipeline.advance('MARKET_CATEGORY_OPENED', { ...CATEGORY_EVIDENCE, labelsInFixture: [] });
  assert.equal(noLabels.ok, false);
  assert.equal(pipeline.stage, 'STRATEGY_OPTIONS_RESOLVED');
});

test('an unresolved mapping never reaches the market stages', () => {
  const pipeline = createOptionPipeline({ strategyKey: 'tg0' });
  pipeline.advance('FIXTURE_CONFIRMED', FIXTURE_EVIDENCE);
  assert.equal(pipeline.advance('STRATEGY_OPTIONS_RESOLVED', { mappingStatus: 'UNRESOLVED_MARKET' }).ok, false);
});

test('a selection belonging to another fixture is rejected', () => {
  const pipeline = createOptionPipeline({ strategyKey: 'oneX' });
  pipeline.advance('FIXTURE_CONFIRMED', FIXTURE_EVIDENCE);
  pipeline.advance('STRATEGY_OPTIONS_RESOLVED', MAPPING_EVIDENCE);
  pipeline.advance('MARKET_CATEGORY_OPENED', CATEGORY_EVIDENCE);
  assert.equal(pipeline.advance('MARKET_SELECTION_IDENTIFIED', { ...SELECTION_EVIDENCE, home: 'BHA', away: 'MNU' }).ok, false);
  assert.equal(pipeline.advance('MARKET_SELECTION_IDENTIFIED', { ...SELECTION_EVIDENCE, matchedLabel: '2/X' }).ok, false);
});

test('odds must be valid and unchanged since they were first read', () => {
  const pipeline = createOptionPipeline({ strategyKey: 'oneX' });
  pipeline.advance('FIXTURE_CONFIRMED', FIXTURE_EVIDENCE);
  pipeline.advance('STRATEGY_OPTIONS_RESOLVED', MAPPING_EVIDENCE);
  pipeline.advance('MARKET_CATEGORY_OPENED', CATEGORY_EVIDENCE);
  pipeline.advance('MARKET_SELECTION_IDENTIFIED', SELECTION_EVIDENCE);
  assert.equal(pipeline.advance('ODDS_VERIFIED', { odds: null }).ok, false);
  assert.equal(pipeline.advance('ODDS_VERIFIED', { odds: 12.4, previousOdds: 13.3 }).ok, false);
  assert.equal(pipeline.advance('ODDS_VERIFIED', { odds: 13.3, previousOdds: 13.3 }).ok, true);
});

test('RULE-006 gate opens only after ODDS_VERIFIED', () => {
  const pipeline = pipelineThroughOdds();
  assert.equal(canSelectOdd(pipeline).allowed, true);
  pipeline.fail('ODDS_CHANGED');
  assert.equal(canSelectOdd(pipeline).allowed, false);
});

test('selecting needs an empty slip before and exactly one selection after', () => {
  const pipeline = pipelineThroughOdds();
  assert.equal(pipeline.advance('SELECTION_ADDED', { selectedStateObserved: true, slipCountBefore: 1, slipCountAfter: 2 }).ok, false);
  assert.equal(pipeline.advance('SELECTION_ADDED', { selectedStateObserved: false, slipCountBefore: 0, slipCountAfter: 1 }).ok, false);
  assert.equal(pipeline.advance('SELECTION_ADDED', { selectedStateObserved: true, slipCountBefore: 0, slipCountAfter: 1 }).ok, true);
});

test('submission is never recorded at the authorization stage', () => {
  const pipeline = pipelineThroughOdds();
  pipeline.advance('SELECTION_ADDED', { selectedStateObserved: true, slipCountBefore: 0, slipCountAfter: 1 });
  pipeline.advance('BET_SLIP_VERIFIED', { comparison: { ok: true, problems: [] } });
  assert.equal(pipeline.advance('AWAITING_AUTHORIZATION', { submitted: true }).ok, false);
  assert.equal(pipeline.advance('AWAITING_AUTHORIZATION', { submitted: false }).ok, true);
  assert.equal(pipeline.stage, 'AWAITING_AUTHORIZATION');
});

const SLIP_TEXT = [
  'VIRTUALS BETSLIP', 'Clear All', 'Next event will expire in: 00:31', 'Kings League - Week 1',
  'ARS - AST', '13.30', 'HT/FT - 1/X', 'Total Stake Amount', 'Total Odds', '13.30',
  'Net Potential Winnings', '₦1,330.00', 'PLACE BET',
].join('\n');

test('parses the betslip text shown in the recording', () => {
  const slip = parseBetSlipText(SLIP_TEXT, { stakeInputValue: '100' });
  assert.equal(slip.isBetSlipPage, true);
  assert.equal(slip.items.length, 1);
  assert.deepEqual(
    { home: slip.items[0].home, away: slip.items[0].away, market: slip.items[0].market, selection: slip.items[0].selection, odds: slip.items[0].odds, week: slip.items[0].week },
    { home: 'ARS', away: 'AST', market: 'HT/FT', selection: '1/X', odds: 13.3, week: 1 },
  );
  assert.equal(slip.stake, 100);
  assert.equal(slip.totalOdds, 13.3);
  assert.equal(slip.potentialWinnings, 1330);
  assert.equal(slip.expirySeconds, 31);
});

test('money and countdown helpers', () => {
  assert.equal(parseMoney('₦1,330.00'), 1330);
  assert.equal(parseMoney('50'), 50);
  assert.equal(parseMoney(''), null);
  assert.equal(parseCountdownSeconds('00:31'), 31);
  assert.equal(parseCountdownSeconds('01:02'), 62);
});

const EXPECTED = { home: 'ARS', away: 'AST', category: 'HT/FT', selection: '1/X', stake: 100, odds: 13.3, week: 1 };

test('a correct slip passes', () => {
  const slip = parseBetSlipText(SLIP_TEXT, { stakeInputValue: '100' });
  const result = compareSlipToExpected({ slip, expected: EXPECTED });
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
});

test('the slip check detects a wrong selection, fixture, stake, odds, extra or missing items, and expiry', () => {
  const base = parseBetSlipText(SLIP_TEXT, { stakeInputValue: '100' });
  const check = (slip, expected = EXPECTED) => compareSlipToExpected({ slip, expected }).problems;
  assert.ok(check(base, { ...EXPECTED, selection: '2/X' }).includes('WRONG_SELECTION'));
  assert.ok(check(base, { ...EXPECTED, category: '1X2 & GG' }).includes('WRONG_MARKET'));
  assert.ok(check(base, { ...EXPECTED, home: 'BHA', away: 'MNU' }).includes('WRONG_FIXTURE'));
  assert.ok(check(base, { ...EXPECTED, week: 2 }).includes('WRONG_WEEK'));
  assert.ok(check(base, { ...EXPECTED, stake: 50 }).includes('STAKE_MISMATCH'));
  assert.ok(check(base, { ...EXPECTED, odds: 12.4 }).includes('ODDS_CHANGED'));
  assert.ok(check({ ...base, expirySeconds: 5 }).includes('SLIP_EXPIRING'));
  assert.ok(check({ ...base, items: [] }).includes('SLIP_EMPTY'));
  assert.ok(check({ ...base, items: [base.items[0], { ...base.items[0], selection: 'X/2' }] }).includes('EXTRA_SELECTIONS'));
  assert.ok(check({ ...base, items: [base.items[0], { ...base.items[0] }] }).includes('DUPLICATE_SELECTION'));
  assert.ok(check({ ...base, stake: null }).includes('STAKE_MISMATCH'));
});

test('inconsistent potential winnings is a warning, not a blocker', () => {
  const slip = { ...parseBetSlipText(SLIP_TEXT, { stakeInputValue: '100' }), potentialWinnings: 999 };
  const result = compareSlipToExpected({ slip, expected: EXPECTED });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, ['WINNINGS_INCONSISTENT']);
});

test('the authorization request states that nothing has been submitted', () => {
  const text = describeAuthorizationRequest({
    week: 1, home: 'ARS', away: 'AST', arsenalSide: 'HOME', category: 'HT/FT', selection: '1/X',
    odds: 13.3, stake: 100, potentialWinnings: 1330, expirySeconds: 31,
  });
  assert.match(text, /Nothing has been submitted/);
  assert.match(text, /HT\/FT/);
});


test('a wager counts as submitted only with explicit authorization, and accepted only with the site\'s own text', () => {
  const pipeline = pipelineThroughOdds();
  pipeline.advance('SELECTION_ADDED', { selectedStateObserved: true, slipCountBefore: 0, slipCountAfter: 1 });
  pipeline.advance('BET_SLIP_VERIFIED', { comparison: { ok: true, problems: [] } });
  pipeline.advance('AWAITING_AUTHORIZATION', { submitted: false });
  assert.equal(pipeline.advance('WAGER_SUBMITTED', { authorized: false, clickedAt: 'now' }).ok, false);
  assert.equal(pipeline.advance('WAGER_SUBMITTED', { authorized: true }).ok, false);
  assert.equal(pipeline.advance('WAGER_SUBMITTED', { authorized: true, clickedAt: 'now' }).ok, true);
  assert.equal(pipeline.advance('WAGER_ACCEPTED', { siteConfirmationText: '' }).ok, false);
  assert.equal(pipeline.advance('WAGER_ACCEPTED', { siteConfirmationText: 'Bet placed successfully' }).ok, true);
  assert.equal(pipeline.stage, 'WAGER_ACCEPTED');
});

test('the category stage requires the market name when it differs from the category (HT Correct Score inside Half Time)', () => {
  const pipeline = createOptionPipeline({ strategyKey: 'ht21' });
  pipeline.advance('FIXTURE_CONFIRMED', FIXTURE_EVIDENCE);
  pipeline.advance('STRATEGY_OPTIONS_RESOLVED', { mappingStatus: 'VERIFIED', category: 'Correct Score', selection: '2-1' });
  const base = { category: 'Correct Score', market: 'HT Correct Score', observedCategory: 'Correct Score', labelsInFixture: ['2-1', '1-2'] };
  assert.equal(pipeline.advance('MARKET_CATEGORY_OPENED', { ...base, observedMarkets: ['HT 1X2'] }).ok, false);
  assert.equal(pipeline.advance('MARKET_CATEGORY_OPENED', { ...base, observedMarkets: ['HT Correct Score'] }).ok, true);
});

test('parses a multi-selection slip like the owner screenshots and detects extra selections', () => {
  const text = [
    'VIRTUALS BETSLIP', 'Clear All', 'Next event will expire in: 00:56', 'Singles', 'Kings League - Week 16',
    'ARS - LIV', 'HT/FT - 1/X', '14.70', 'HT/FT - 2/X', '14.70', 'Correct Score - 6-0', '1,431.00',
    'Group', 'Com', 'Stake (Min 10)', 'Winnings', 'Singles', '11x', '9.09', 'Total Stake Amount', '100',
  ].join('\n');
  const slip = parseBetSlipText(text, { stakeInputValue: '100' });
  assert.equal(slip.items.length, 3);
  assert.deepEqual(slip.items.map((item) => `${item.market}|${item.selection}|${item.odds}`), ['HT/FT|1/X|14.7', 'HT/FT|2/X|14.7', 'Correct Score|6-0|1431']);
  assert.equal(slip.items[0].week, 16);
  const check = compareSlipToExpected({ slip, expected: { home: 'ARS', away: 'LIV', market: 'HT/FT', selection: '1/X', stake: 100, odds: 14.7, week: 16 } });
  assert.ok(check.problems.includes('EXTRA_SELECTIONS'));
});

test('the live slip layout "market · selection" is read (it was read as an empty slip before)', () => {
  const { parseBetSlipText, compareSlipToExpected } = require('./marketFirstSequence');
  const text = [
    'VIRTUALS BETSLIP', 'Clear All', 'Next event will expire in: 00:30',
    'Kings League - Week 3', 'ARS - BHA', '143.00', 'Correct Score · 6-0',
    'Total Stake Amount', 'Total Odds 143.00', 'Net Potential Winnings ₦10,010.00', 'PLACE BET',
  ].join('\n');
  const slip = parseBetSlipText(text, { stakeInputValue: '70' });
  assert.equal(slip.items.length, 1);
  assert.deepEqual([slip.items[0].home, slip.items[0].away, slip.items[0].market, slip.items[0].selection, slip.items[0].odds, slip.items[0].week],
    ['ARS', 'BHA', 'Correct Score', '6-0', 143, 3]);
  assert.equal(slip.stake, 70);
  const comparison = compareSlipToExpected({ slip, expected: { home: 'ARS', away: 'BHA', market: 'Correct Score', selection: '6-0', stake: 70, odds: 143, week: 3 } });
  assert.equal(comparison.ok, true, JSON.stringify(comparison.problems));
  // the older dash layout still works
  const older = parseBetSlipText('ARS - BHA\n143.00\nCorrect Score - 6-0', { stakeInputValue: '70' });
  assert.equal(older.items[0].selection, '6-0');
});

test('the slip is read whether the market and the pick are on one line, two lines or have no separator', () => {
  const { parseBetSlipText } = require('./marketFirstSequence');
  const wrap = (middle) => ['VIRTUALS BETSLIP', 'Clear All', 'Next event will expire in: 00:30', 'Kings League - Week 9', 'ARS - LEE', '65.60', ...middle, 'Total Stake Amount', 'Total Odds 65.60', 'PLACE BET'].join('\n');
  for (const middle of [
    ['Correct Score · 6-0'],
    ['Correct Score', '6-0'],
    ['Correct Score', '·', '6-0'],
    ['Correct Score 6-0'],
    ['Correct Score - 6-0'],
  ]) {
    const slip = parseBetSlipText(wrap(middle), { stakeInputValue: '152' });
    assert.equal(slip.items.length, 1, JSON.stringify(middle));
    assert.deepEqual([slip.items[0].market, slip.items[0].selection, slip.items[0].odds], ['Correct Score', '6-0', 65.6], JSON.stringify(middle));
  }
  const half = parseBetSlipText(wrap(['HT Correct Score', '2-1']), { stakeInputValue: '30' });
  assert.deepEqual([half.items[0].market, half.items[0].selection], ['HT Correct Score', '2-1']);
  assert.ok(typeof parseBetSlipText(wrap(['Correct Score · 6-0'])).rawText === 'string');
});
