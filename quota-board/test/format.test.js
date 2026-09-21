'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { leftPercent, severity, bar, duration, resetIn } = require('../lib/format');

test('remaining quota is what is left of the window', () => {
  assert.strictEqual(leftPercent(22), 78);
  assert.strictEqual(leftPercent(0), 100);
  assert.strictEqual(leftPercent(140), 0, 'a provider over 100% used still shows 0 left, never negative');
});

test('severity tracks what is left, not what is used', () => {
  assert.strictEqual(severity(90), 'green');
  assert.strictEqual(severity(25), 'yellow');
  assert.strictEqual(severity(10), 'red');
});

test('the bar fills with the remaining share', () => {
  assert.strictEqual(bar(100, 10, false), '██████████');
  assert.strictEqual(bar(0, 10, false), '░░░░░░░░░░');
  assert.strictEqual(bar(50, 10, false), '█████░░░░░');
});

test('durations read as a person would say them', () => {
  assert.strictEqual(duration(90), '1m');
  assert.strictEqual(duration(3 * 3600 + 20 * 60), '3h 20m');
  assert.strictEqual(duration(2 * 86400 + 4 * 3600), '2d 4h');
  assert.strictEqual(duration(-5), null, 'a window in the past has no countdown');
});

test('a reset shows the local clock time and the countdown', () => {
  const now = 1_790_000_000;
  assert.match(resetIn(now + 7200, now), /^resets \d{2}:\d{2} · in 2h 0m$/);
  assert.strictEqual(resetIn(null, now), null);
});

test('a reset on another day names the weekday', () => {
  const now = 1_790_000_000;
  // The weekday comes from the machine's locale, so only its shape is checked.
  assert.match(resetIn(now + 3 * 86400, now), /^resets \S+,? \d{2}:\d{2} · in 3d 0h$/);
});

test('token counts are readable, not exact', () => {
  const { tokens, money } = require('../lib/format');
  assert.strictEqual(tokens(950), '950');
  assert.strictEqual(tokens(232555), '233k');
  assert.strictEqual(tokens(1_500_000), '1.5M');
  assert.strictEqual(tokens(20_492_928), '20M');
  assert.strictEqual(money(0), '$0');
  assert.strictEqual(money(0.000858), '$0.0009');
  assert.strictEqual(money(0.2075), '$0.21');
});

test('the cache share counts reads against fresh input, not writes', () => {
  const { cacheShare } = require('../lib/format');
  assert.strictEqual(cacheShare({ input: 1000, cacheRead: 9000, cacheWrite: 5000 }), 90);
  assert.strictEqual(cacheShare({ input: 0, cacheRead: 0 }), null, 'nothing sent yet is not 0% cached');
});

test('a provider with no requests in the window has no spend line', () => {
  const { usageSummary } = require('../lib/format');
  assert.strictEqual(usageSummary({ requests: 0, cost: 0, days: 7 }), null);
  assert.strictEqual(
    usageSummary({ requests: 225, cost: 0.2075, input: 233000, cacheRead: 20_492_928, days: 7 }),
    '7d: 225 req · $0.21 · 99% cached',
  );
});
