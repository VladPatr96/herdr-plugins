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

test('every bar starts in the same column, whatever the provider', () => {
  const lines = renderBoard({
    providers: [
      { id: 'grok', label: 'Grok', state: 'ok', windows: [{ label: '7d', usedPercent: 0, resetsAt: null }] },
      {
        id: 'agy',
        label: 'agy',
        state: 'ok',
        windows: [
          { label: '5h Claude/GPT', usedPercent: 0, resetsAt: null },
          { label: '7d Gemini', usedPercent: 26, resetsAt: null },
        ],
      },
    ],
    updatedAt: NOW,
    color: false,
    now: NOW,
  });
  const columns = lines.filter((line) => line.includes('█')).map((line) => line.indexOf('█'));
  assert.ok(columns.length >= 3, 'all three windows drew a bar');
  assert.strictEqual(new Set(columns).size, 1, `bars start at ${[...new Set(columns)].join(', ')}`);
});

test('the countdowns line up too, whatever the clock time looks like', () => {
  const lines = renderBoard({
    providers: [
      { id: 'a', label: 'Same day', state: 'ok', windows: [{ label: '5h', usedPercent: 10, resetsAt: NOW + 3600 }] },
      { id: 'b', label: 'Next week', state: 'ok', windows: [{ label: '7d', usedPercent: 10, resetsAt: NOW + 5 * 86400 }] },
    ],
    updatedAt: NOW,
    color: false,
    now: NOW,
  });
  const columns = lines.filter((line) => line.includes('· in ')).map((line) => line.indexOf('· in '));
  assert.strictEqual(columns.length, 2);
  assert.strictEqual(new Set(columns).size, 1, `countdowns start at ${[...new Set(columns)].join(', ')}`);
});

const USAGE_PROVIDER = {
  id: 'deepseek',
  label: 'DeepSeek API',
  state: 'ok',
  balance: { currency: 'USD', total: '7.23', available: true },
  usage: {
    days: 7,
    requests: 225,
    cost: 0.2075,
    input: 233_000,
    output: 47_000,
    cacheRead: 20_492_928,
    cacheWrite: 0,
    models: [
      { model: 'deepseek-flash', requests: 222, cost: 0.1855, input: 232_555, output: 47_477, cacheRead: 20_492_928, cacheWrite: 0 },
      { model: 'deepseek-v4-pro', requests: 3, cost: 0.022, input: 44_018, output: 1247, cacheRead: 66_688, cacheWrite: 0 },
    ],
  },
};

test('the per-model breakdown is folded away until asked for', () => {
  const folded = board([USAGE_PROVIDER]);
  assert.match(folded, /225 req · \$0\.21 · 99% cached/);
  assert.match(folded, /\[m\]/, 'the fold says how to open it');
  assert.doesNotMatch(folded, /deepseek-flash/);
  assert.match(folded, /m show models/);
});

test('opened, it lists every model with cost, tokens and cache', () => {
  const opened = renderBoard({ providers: [USAGE_PROVIDER], updatedAt: NOW, color: false, now: NOW, models: true }).join('\n');
  assert.match(opened, /deepseek-flash\s+222 req\s+\$0\.19/);
  assert.match(opened, /deepseek-v4-pro\s+3 req\s+\$0\.02/);
  assert.match(opened, /cache\s+20M \(99%\)/);
  assert.match(opened, /m hide models/);
  assert.doesNotMatch(opened, /\[m\]/);
});

test('the catalog lists what the plan can run but you have not', () => {
  const provider = {
    id: 'opencode-go',
    label: 'OpenCode Go',
    state: 'ok',
    windows: [{ label: '30d', usedPercent: 20, resetsAt: null }],
    catalog: ['glm-5.2', 'kimi-k3', 'minimax-m3'],
    usage: {
      days: 30,
      requests: 4,
      cost: 0.01,
      input: 100,
      cacheRead: 900,
      models: [{ model: 'glm-5.2', requests: 4, cost: 0.01, input: 100, output: 20, cacheRead: 900, cacheWrite: 0 }],
    },
  };
  const opened = renderBoard({ providers: [provider], updatedAt: NOW, color: false, now: NOW, models: true }).join('\n');
  assert.match(opened, /also available \(2 of 3\)/);
  assert.match(opened, /kimi-k3/);
  assert.doesNotMatch(opened, /also available[^\n]*glm-5\.2/, 'a model already listed above is not repeated');

  const folded = renderBoard({ providers: [provider], updatedAt: NOW, color: false, now: NOW, models: false }).join('\n');
  assert.doesNotMatch(folded, /also available/, 'the catalog is part of the fold');
});
