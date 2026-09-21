'use strict';

// Antigravity keeps no quota file on disk: the CLI's own status line is the
// only local surface that carries it, so the bridge has to be turned on once
// inside `agy` (`/statusline`). Until then this row says so instead of
// inventing a number.

const statusline = require('../statusline-store');
const { clock } = require('../format');

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

const SETUP_HINT = 'run `/statusline node <plugin root>/bin/statusline.js agy` inside agy';

async function fetchQuota() {
  const seen = statusline.load('agy');
  if (!seen) {
    // The bridge may have run and found nothing usable — that is a different
    // problem from never having been set up, and it is worth saying which.
    const probe = statusline.loadProbe('agy');
    if (probe) {
      const shape = probe.json ? `fields: ${(probe.keys || []).join(', ') || 'none'}` : 'not JSON';
      return {
        state: 'setup-needed',
        note: `agy's status line ran at ${clock(probe.seenAt)} but carried no quota (${shape})`,
      };
    }
    return { state: 'setup-needed', note: SETUP_HINT };
  }
  const windows = parseQuota(seen.quota);
  if (!windows.length) {
    return { state: 'setup-needed', note: `agy's status line ran at ${clock(seen.seenAt)} with an empty quota block` };
  }
  return {
    state: 'ok',
    windows,
    note: `from statusLine, seen ${clock(seen.seenAt)}`,
  };
}

module.exports = { id: 'agy', label: 'agy / Antigravity', kind: 'subscription', fetchQuota, __test: { parseQuota } };
