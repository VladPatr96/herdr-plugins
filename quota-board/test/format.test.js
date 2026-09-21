'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { leftPercent, severity, bar, duration, resetIn, sidebarToken } = require('../lib/format');

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

test('reset countdown is relative to now', () => {
  assert.strictEqual(resetIn(1000 + 7200, 1000), 'resets in 2h 0m');
  assert.strictEqual(resetIn(null, 1000), null);
});

test('the sidebar token names the tightest window', () => {
  const snapshot = {
    state: 'ok',
    windows: [
      { label: '5h', usedPercent: 10 },
      { label: '7d', usedPercent: 85 },
    ],
  };
  assert.strictEqual(sidebarToken(snapshot), '7d 15%');
});

test('the sidebar token shows a balance when there is no window', () => {
  assert.strictEqual(sidebarToken({ state: 'ok', balance: { currency: 'USD', total: '7.23' } }), '$7.23');
});

test('a provider without data is marked, never guessed', () => {
  assert.strictEqual(sidebarToken({ state: 'no-credentials' }), 'n/a');
  assert.strictEqual(sidebarToken({ state: 'setup-needed' }), 'n/a');
  assert.strictEqual(sidebarToken(null), 'n/a');
});
