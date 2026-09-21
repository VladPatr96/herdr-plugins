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
