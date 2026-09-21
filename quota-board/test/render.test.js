'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { renderBoard, updatedLabel } = require('../lib/render-board');

const NOW = 1_790_000_000;

function board(providers, extra = {}) {
  return renderBoard({ providers, updatedAt: NOW, color: false, now: NOW, ...extra }).join('\n');
}

test('a provider with data shows every window', () => {
  const text = board([
    {
      id: 'codex',
      label: 'Codex',
      state: 'ok',
      windows: [{ label: '7d', usedPercent: 22, resetsAt: NOW + 86400 }],
    },
  ]);
  assert.match(text, /Codex/);
  assert.match(text, /78% left/);
  assert.match(text, /resets .* in 1d 0h/);
});

test('a provider without data says why instead of showing a number', () => {
  const text = board([
    { id: 'agy', label: 'agy / Antigravity', state: 'setup-needed', note: 'run /statusline inside agy' },
  ]);
  assert.match(text, /needs setup: run \/statusline inside agy/);
  assert.doesNotMatch(text, /%/);
});

test('a stale reading is labelled stale', () => {
  const text = board([
    {
      id: 'claude',
      label: 'Claude Code',
      state: 'ok',
      stale: true,
      note: 'last good reading; HTTP 429',
      windows: [{ label: '5h', usedPercent: 50, resetsAt: null }],
    },
  ]);
  assert.match(text, /stale/);
  assert.match(text, /HTTP 429/);
});

test('the balance row has no bar', () => {
  const text = board([
    { id: 'deepseek', label: 'DeepSeek API', state: 'ok', balance: { currency: 'USD', total: '7.23', available: true } },
  ]);
  assert.match(text, /balance \$7\.23/);
  assert.doesNotMatch(text, /█/);
});

test('the footer says when the reading was taken, in local time', () => {
  assert.match(updatedLabel(NOW - 30, NOW), /^updated \d{2}:\d{2} · 30s ago$/);
  assert.match(updatedLabel(NOW - 600, NOW), /^updated \d{2}:\d{2} · 10m ago$/);
  assert.strictEqual(updatedLabel(null, NOW), 'never refreshed');
});

test('a long reason wraps at the pane width instead of breaking a word', () => {
  const lines = renderBoard({
    providers: [{ id: 'claude', label: 'Claude Code', state: 'error', note: 'usage endpoint is rate limited — install the statusLine bridge (see README)' }],
    updatedAt: NOW,
    color: false,
    now: NOW,
    width: 56,
  });
  const body = lines.filter((line) => line.includes('rate limited') || line.trim().startsWith('bridge') || line.includes('statusLine'));
  assert.ok(body.length >= 2, 'the reason takes more than one line');
  for (const line of lines) assert.ok(line.length <= 56, `line too wide: ${line}`);
});
