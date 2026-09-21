'use strict';

// Antigravity keeps no quota file on disk: the CLI's own status line is the
// only local surface that carries it, so the bridge has to be turned on once
// inside `agy` (`/statusline`). Until then this row says so instead of
// inventing a number.

const path = require('node:path');
const statusline = require('../statusline-store');
const { clock } = require('../format');
const { home, readJson, resolveDir } = require('../runtime');

// agy names its pools differently depending on the build, and a pool can be
// per-model. Everything below maps what it sent onto "<window> <model>" without
// inventing either half: a key that is not recognised is printed as it came.
const WINDOW_LABELS = {
  five_hour: '5h',
  fivehour: '5h',
  '5h': '5h',
  hourly: '1h',
  session: '5h',
  weekly: '7d',
  seven_day: '7d',
  sevenday: '7d',
  '7d': '7d',
  weekly_native: '7d gemini',
  weekly_third_party: '7d other',
  native: 'gemini',
  third_party: 'other',
  monthly: '30d',
  '30d': '30d',
  daily: '1d',
};

function normalize(key) {
  return String(key).toLowerCase().replace(/[\s-]+/g, '_');
}

function labelFor(key) {
  const normalized = normalize(key);
  return WINDOW_LABELS[normalized] || String(key).replace(/_/g, ' ');
}

// Percentages arrive as used or as remaining, flat or wrapped in a bucket.
function usedPercentOf(value) {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object') return null;
  for (const key of ['used_percentage', 'usedPercent', 'used_percent', 'percent', 'utilization']) {
    if (typeof value[key] === 'number') return value[key];
  }
  for (const key of ['remaining_percentage', 'remainingPercent', 'percent_remaining']) {
    if (typeof value[key] === 'number') return 100 - value[key];
  }
  return null;
}

function resetOf(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = value.resets_at ?? value.resetsAt ?? value.reset_time ?? value.resetTime ?? null;
  if (raw === null) return null;
  const seconds = typeof raw === 'number' ? raw : Date.parse(raw) / 1000;
  return Number.isFinite(seconds) ? seconds : null;
}

function modelNameOf(value, fallback) {
  if (value && typeof value === 'object') {
    for (const key of ['display_name', 'displayName', 'model', 'name', 'label']) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
    }
  }
  return fallback;
}

// A quota block is one of two shapes: window → bucket, or model → windows.
// Both end up as one row per (window, model) pair.
function parseQuota(quota) {
  const windows = [];
  for (const [key, value] of Object.entries(quota || {})) {
    if (!value || typeof value !== 'object') continue;

    const direct = usedPercentOf(value);
    if (direct !== null) {
      const model = modelNameOf(value, null);
      const label = model && normalize(key) !== normalize(model) ? `${labelFor(key)} ${model}` : labelFor(key);
      windows.push({ label, usedPercent: direct, resetsAt: resetOf(value) });
      continue;
    }

    // Nested: this key names a model (or a pool) and holds its own windows.
    const group = modelNameOf(value, key);
    for (const [innerKey, innerValue] of Object.entries(value)) {
      const used = usedPercentOf(innerValue);
      if (used === null) continue;
      const groupLabel = labelFor(group);
      const windowLabel = labelFor(innerKey);
      const label = groupLabel === windowLabel ? windowLabel : `${windowLabel} ${groupLabel}`;
      windows.push({ label, usedPercent: used, resetsAt: resetOf(innerValue) });
    }
  }
  return windows;
}

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
    return bridgeInstalled()
      ? { state: 'setup-needed', note: 'status line is wired up — restart agy and send it one turn' }
      : { state: 'setup-needed', note: SETUP_HINT };
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
