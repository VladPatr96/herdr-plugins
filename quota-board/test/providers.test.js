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

test('agy quota from its status line: both groups, both windows', () => {
  const seenAt = 1_789_988_252;
  const windows = agy.__test.parseQuota({
    '3p-5h': { remaining_fraction: 1, reset_in_seconds: 17984 },
    '3p-weekly': { remaining_fraction: 0.8016915, reset_time: '2026-09-21T17:04:35Z' },
    'gemini-5h': { remaining_fraction: 1, reset_in_seconds: 17984 },
    'gemini-weekly': { remaining_fraction: 0.7424428, reset_time: '2026-09-23T02:32:58Z' },
  }, seenAt);
  assert.deepStrictEqual(
    windows.map((w) => w.label),
    ['5h Gemini', '7d Gemini', '5h Claude/GPT', '7d Claude/GPT'],
    'Gemini first and the short window on top, the way agy lists them',
  );
  assert.strictEqual(Math.round((100 - windows[1].usedPercent) * 100) / 100, 74.24);
  assert.strictEqual(windows[0].resetsAt, seenAt + 17984, 'a countdown is anchored to when the line was taken');
});

test('agy accepts either used or remaining percentages', () => {
  const windows = agy.__test.parseQuota({
    weekly: { used_percentage: 40, resets_at: 1790324036 },
    five_hour: { remaining_percentage: 25 },
  });
  assert.deepStrictEqual(windows, [
    { label: '5h', usedPercent: 75, resetsAt: null },
    { label: '7d', usedPercent: 40, resetsAt: 1790324036 },
  ]);
});

test('grok billing periods are never relabelled', () => {
  const { windowKind } = grok.__test;
  assert.strictEqual(windowKind('USAGE_PERIOD_TYPE_WEEKLY'), '7d');
  assert.strictEqual(windowKind('USAGE_PERIOD_TYPE_MONTHLY'), '30d');
  assert.strictEqual(windowKind('USAGE_PERIOD_TYPE_UNKNOWN'), null);
});

test('codex lists every pool it bills, the plan first', () => {
  const windows = codex.__test.parseRateLimits({
    rateLimits: {
      limitId: 'codex',
      primary: { usedPercent: 23, windowDurationMins: 10080, resetsAt: 1790324036 },
      secondary: null,
    },
    rateLimitsByLimitId: {
      base_model_inference: {
        limitId: 'base_model_inference',
        limitName: 'gpt-reserve',
        primary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: 1790590864 },
      },
      codex: {
        limitId: 'codex',
        primary: { usedPercent: 23, windowDurationMins: 10080, resetsAt: 1790324036 },
      },
    },
  });
  assert.deepStrictEqual(windows.map((w) => w.label), ['7d', '7d Luna Reserve'], 'the plan pool is not repeated, and the reserve gets its readable name');
});

test('codex counts the reset credits that are still usable', () => {
  const now = 1_790_000_000;
  const note = codex.__test.parseResetCredits({
    rateLimitResetCredits: {
      credits: [
        { status: 'available', expiresAt: now + 12 * 86400 },
        { status: 'available', expiresAt: now + 20 * 86400 },
        { status: 'used', expiresAt: now + 2 * 86400 },
      ],
    },
  }, now);
  assert.strictEqual(note, '2 free resets available · first expires in 12d');
  assert.strictEqual(codex.__test.parseResetCredits({}, now), null);
});

test('claude reads the per-model weekly pool from limits[]', () => {
  const windows = claude.__test.parseUsage({
    five_hour: { utilization: 11, resets_at: '2026-09-21T14:20:00Z' },
    limits: [
      { kind: 'session', group: 'session', percent: 11, resets_at: '2026-09-21T14:20:00Z', scope: null },
      { kind: 'weekly_all', group: 'weekly', percent: 25, resets_at: '2026-09-25T07:00:00Z', scope: null },
      {
        kind: 'weekly_scoped',
        group: 'weekly',
        percent: 40,
        resets_at: '2026-09-25T07:00:00Z',
        scope: { model: { id: null, display_name: 'Fable' } },
      },
    ],
  });
  assert.deepStrictEqual(windows.map((w) => w.label), ['5h', '7d', '7d Fable']);
  assert.strictEqual(windows[2].usedPercent, 40);
});

test('agy quota keyed by model gives a row per window and model', () => {
  const windows = agy.__test.parseQuota({
    'gemini-3-pro': { five_hour: { used_percentage: 20 }, weekly: { used_percentage: 55, resets_at: 1790000000 } },
    'claude-opus': { weekly: { used_percentage: 5 } },
  });
  assert.deepStrictEqual(windows.map((w) => w.label), ['5h gemini-3-pro', '7d gemini-3-pro', '7d claude-opus']);
  assert.strictEqual(windows[1].resetsAt, 1790000000);
});

test('agy model names come from display_name when it is there', () => {
  const windows = agy.__test.parseQuota({
    pool_a: { display_name: 'Gemini 3 Pro', five_hour: { used_percentage: 33 }, seven_day: { used_percentage: 44 } },
  });
  assert.deepStrictEqual(windows.map((w) => w.label), ['5h Gemini 3 Pro', '7d Gemini 3 Pro']);
});

test('an agy pool we have no name for is printed as it came, not dropped', () => {
  const windows = agy.__test.parseQuota({ surprise_pool: { used_percentage: 7 } });
  assert.deepStrictEqual(windows, [{ label: 'surprise pool', usedPercent: 7, resetsAt: null }]);
});
