const test = require('node:test');
const assert = require('node:assert/strict');
const { CLICK_ALLOWLIST, renderProbeMarkdown, summarizeProbe } = require('./betkingProbe');

test('the probe can only click navigation controls, never odds or bet-slip controls', () => {
  const selectors = CLICK_ALLOWLIST.map((entry) => entry.selector).join(' ');
  assert.ok(selectors.includes('round-switcher-button'));
  assert.ok(selectors.includes('market-selector-tab'));
  assert.ok(!/odd|selection|slip|bet/i.test(selectors.replace(/round-switcher-button|market-selector-tab/g, '')));
});

test('probe summary reports usable buttons only when every click succeeded', () => {
  const base = { controls: { roundSwitchers: { visible: 4 } }, startedAt: 'a', finishedAt: 'b', url: 'u' };
  const good = { ...base, clicks: [{ control: 'market tab', text: 'GG/NG', ok: true, pageChanged: true }] };
  assert.equal(summarizeProbe(good).buttonsUsable, true);
  const bad = { ...base, clicks: [{ control: 'market tab', text: 'GG/NG', ok: false, error: 'x' }] };
  assert.equal(summarizeProbe(bad).buttonsUsable, false);
  assert.equal(summarizeProbe({ ...base, clicks: [] }).buttonsUsable, false);
});

test('probe report states what was and was not clicked', () => {
  const markdown = renderProbeMarkdown({
    controls: { marketTabs: { visible: 5 } },
    clicks: [{ control: 'market tab', text: 'O/U 2.5', ok: true, pageChanged: true }],
    startedAt: 'a', finishedAt: 'b', url: 'https://m.betking.com/x',
  });
  assert.match(markdown, /never clicked/);
  assert.match(markdown, /Buttons usable: YES/);
});
