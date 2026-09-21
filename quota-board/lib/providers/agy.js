'use strict';

// Antigravity keeps no quota file on disk: the CLI's own status line is the
// only local surface that carries it, so the bridge has to be turned on once
// inside `agy` (`/statusline`). Until then this row says so instead of
// inventing a number.

const statusline = require('../statusline-store');

const POOL_LABELS = {
  five_hour: '5h',
  weekly: '7d',
  weekly_native: '7d gemini',
  weekly_third_party: '7d other',
  monthly: '30d',
};

function parseQuota(quota) {
  const windows = [];
  for (const [key, value] of Object.entries(quota || {})) {
    if (!value || typeof value !== 'object') continue;
    const used = typeof value.used_percentage === 'number'
      ? value.used_percentage
      : typeof value.usedPercent === 'number'
        ? value.usedPercent
        : typeof value.remaining_percentage === 'number'
          ? 100 - value.remaining_percentage
          : null;
    if (used === null) continue;
    const rawReset = value.resets_at ?? value.resetsAt ?? null;
    const reset = typeof rawReset === 'number' ? rawReset : rawReset ? Date.parse(rawReset) / 1000 : null;
    windows.push({
      label: POOL_LABELS[key] || key.replace(/_/g, ' '),
      usedPercent: used,
      resetsAt: Number.isFinite(reset) ? reset : null,
    });
  }
  return windows;
}

async function fetchQuota() {
  const seen = statusline.load('agy');
  if (!seen) {
    return {
      state: 'setup-needed',
      note: 'run /statusline inside agy and point it at bin/statusline.js agy',
    };
  }
  const windows = parseQuota(seen.quota);
  if (!windows.length) {
    return { state: 'setup-needed', note: 'agy statusLine sent no quota block yet' };
  }
  return {
    state: 'ok',
    windows,
    note: `from statusLine, seen ${new Date(seen.seenAt * 1000).toISOString().slice(11, 16)} UTC`,
  };
}

module.exports = { id: 'agy', label: 'agy / Antigravity', kind: 'subscription', fetchQuota, __test: { parseQuota } };
