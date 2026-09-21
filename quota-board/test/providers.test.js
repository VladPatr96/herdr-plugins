'use strict';

const test = require('node:test');
const assert = require('node:assert');
const codex = require('../lib/providers/codex');
const claude = require('../lib/providers/claude');
const agy = require('../lib/providers/agy');
const grok = require('../lib/providers/grok');

test('codex window labels follow the duration it reports', () => {
  const { windowLabel } = codex.__test;
  assert.strictEqual(windowLabel(300), '5h');
  assert.strictEqual(windowLabel(10080), '7d');
  assert.strictEqual(windowLabel(45), '45m');
});

test('codex reads both limit windows', () => {
  const windows = codex.__test.parseRateLimits({
    rateLimits: {
      primary: { usedPercent: 22, windowDurationMins: 10080, resetsAt: 1790324036 },
      secondary: { usedPercent: 4, windowDurationMins: 300, resetsAt: 1790000000 },
    },
  });
  assert.deepStrictEqual(windows, [
    { label: '7d', usedPercent: 22, resetsAt: 1790324036 },
    { label: '5h', usedPercent: 4, resetsAt: 1790000000 },
  ]);
});

test('claude usage payload turns into windows', () => {
  const windows = claude.__test.parseUsage({
    five_hour: { utilization: 58, resets_at: '2026-09-21T14:00:00Z' },
    seven_day: { utilization: 27, resets_at: '2026-09-28T00:00:00Z' },
    account: { email: 'someone@example.com' },
  });
  assert.strictEqual(windows.length, 2);
  assert.deepStrictEqual(windows.map((w) => w.label), ['5h', '7d']);
  assert.strictEqual(windows[0].usedPercent, 58);
});

test('agy accepts either used or remaining percentages', () => {
  const windows = agy.__test.parseQuota({
    weekly_native: { used_percentage: 40, resets_at: 1790324036 },
    weekly_third_party: { remaining_percentage: 25 },
    model: 'gemini',
  });
  assert.deepStrictEqual(windows, [
    { label: '7d gemini', usedPercent: 40, resetsAt: 1790324036 },
    { label: '7d other', usedPercent: 75, resetsAt: null },
  ]);
});

test('grok billing periods are never relabelled', () => {
  const { windowKind } = grok.__test;
  assert.strictEqual(windowKind('USAGE_PERIOD_TYPE_WEEKLY'), '7d');
  assert.strictEqual(windowKind('USAGE_PERIOD_TYPE_MONTHLY'), '30d');
  assert.strictEqual(windowKind('USAGE_PERIOD_TYPE_UNKNOWN'), null);
});
