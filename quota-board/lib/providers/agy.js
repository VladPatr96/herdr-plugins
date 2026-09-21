'use strict';

// Antigravity keeps no quota file on disk: the CLI's own status line is the
// only local surface that carries it. agy bills two model groups, and its
// /usage screen names them — Gemini models (Flash, Pro) and the third-party
// ones (Claude Opus, Claude Sonnet, GPT-OSS) — each with a five-hour and a
// weekly window. The status line abbreviates those to `gemini-*` and `3p-*`.

const path = require('node:path');
const statusline = require('../statusline-store');
const { clock } = require('../format');
const { home, readJson, resolveDir } = require('../runtime');

const SETUP_HINT = 'run the install-statusline action, or `/statusline node <plugin root>/bin/statusline.js agy` inside agy';

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
  monthly: '30d',
  '30d': '30d',
  daily: '1d',
};

const GROUP_LABELS = {
  gemini: 'Gemini',
  native: 'Gemini',
  '3p': 'Claude/GPT',
  third_party: 'Claude/GPT',
};

function normalize(key) {
  return String(key).toLowerCase().replace(/[\s-]+/g, '_');
}

function labelFor(key) {
  const normalized = normalize(key);
  return WINDOW_LABELS[normalized] || GROUP_LABELS[normalized] || String(key).replace(/_/g, ' ');
}

// `gemini-weekly` is one key carrying both halves: the group and the window.
function splitGroupAndWindow(key) {
  const match = /^([a-z0-9]+)[-_](5h|weekly|five_hour|seven_day|7d|30d|monthly|daily|hourly)$/i.exec(String(key));
  if (!match) return null;
  const normalized = normalize(match[1]);
  return {
    group: GROUP_LABELS[normalized] || match[1],
    window: WINDOW_LABELS[normalize(match[2])] || match[2],
  };
}

// Percentages arrive as used, as remaining, or as a remaining 0..1 fraction.
function usedPercentOf(value) {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object') return null;
  for (const key of ['used_percentage', 'usedPercent', 'used_percent', 'percent', 'utilization']) {
    if (typeof value[key] === 'number') return value[key];
  }
  for (const key of ['remaining_percentage', 'remainingPercent', 'percent_remaining']) {
    if (typeof value[key] === 'number') return 100 - value[key];
  }
  for (const key of ['remaining_fraction', 'remainingFraction']) {
    if (typeof value[key] === 'number') return 100 - value[key] * 100;
  }
  return null;
}

// A countdown is relative to the moment the status line was taken, not to now.
function resetOf(value, seenAt = null) {
  if (!value || typeof value !== 'object') return null;
  const raw = value.resets_at ?? value.resetsAt ?? value.reset_time ?? value.resetTime ?? null;
  if (raw !== null) {
    const parsed = typeof raw === 'number' ? raw : Date.parse(raw) / 1000;
    if (Number.isFinite(parsed)) return parsed;
  }
  const inSeconds = value.reset_in_seconds ?? value.resetInSeconds ?? null;
  if (typeof inSeconds === 'number' && seenAt) return seenAt + inSeconds;
  return null;
}

function modelNameOf(value, fallback) {
  if (value && typeof value === 'object') {
    for (const key of ['display_name', 'displayName', 'model', 'name', 'label']) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
    }
  }
  return fallback;
}

// A quota block is one of two shapes: "<group>-<window>" → bucket, or
// model → its own windows. Both end up as one row per window and group.
function parseQuota(quota, seenAt = null) {
  const windows = [];
  for (const [key, value] of Object.entries(quota || {})) {
    if (!value || typeof value !== 'object') continue;

    const direct = usedPercentOf(value);
    if (direct !== null) {
      const pair = splitGroupAndWindow(key);
      const model = modelNameOf(value, null);
      let label;
      if (pair) label = `${pair.window} ${pair.group}`;
      else if (model && normalize(key) !== normalize(model)) label = `${labelFor(key)} ${model}`;
      else label = labelFor(key);
      windows.push({ label, usedPercent: direct, resetsAt: resetOf(value, seenAt) });
      continue;
    }

    const group = modelNameOf(value, key);
    for (const [innerKey, innerValue] of Object.entries(value)) {
      const used = usedPercentOf(innerValue);
      if (used === null) continue;
      const groupLabel = labelFor(group);
      const windowLabel = labelFor(innerKey);
      const label = groupLabel === windowLabel ? windowLabel : `${windowLabel} ${groupLabel}`;
      windows.push({ label, usedPercent: used, resetsAt: resetOf(innerValue, seenAt) });
    }
  }
  return sortRows(windows);
}

// agy's own /usage lists Gemini first and the five-hour window above the week;
// the status line hands them over in key order, so put them back.
const GROUP_ORDER = ['Gemini', 'Claude/GPT'];
const WINDOW_ORDER = ['1h', '5h', '1d', '7d', '30d'];

function rank(order, value) {
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

function sortRows(windows) {
  const rows = windows.map((window, index) => {
    const [first, ...rest] = window.label.split(' ');
    return { window, index, windowPart: first, groupPart: rest.join(' ') };
  });
  // A group agy does not name keeps the position it arrived in, so an unknown
  // model list is not reshuffled alphabetically.
  const firstSeen = new Map();
  for (const row of rows) if (!firstSeen.has(row.groupPart)) firstSeen.set(row.groupPart, row.index);

  return rows
    .sort((a, b) =>
      rank(GROUP_ORDER, a.groupPart) - rank(GROUP_ORDER, b.groupPart)
      || firstSeen.get(a.groupPart) - firstSeen.get(b.groupPart)
      || rank(WINDOW_ORDER, a.windowPart) - rank(WINDOW_ORDER, b.windowPart)
      || a.index - b.index)
    .map((entry) => entry.window);
}

// Whether agy is already pointed at our bridge decides which half of "no data
// yet" this is: never set up, or set up and waiting for agy to run a turn.
function bridgeInstalled() {
  const settings = readJson(path.join(
    process.env.AGY_HOME || path.join(resolveDir(path.join(home(), '.gemini')), 'antigravity-cli'),
    'settings.json',
  ));
  const command = settings?.statusLine?.command;
  return typeof command === 'string' && command.includes('quota-board');
}

async function fetchQuota() {
  const seen = statusline.load('agy');
  if (!seen) {
    // The bridge may have run and found nothing usable — a different problem
    // from never having been set up, and worth saying which.
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

  const windows = parseQuota(seen.quota, seen.seenAt);
  if (!windows.length) {
    return { state: 'setup-needed', note: `agy's status line ran at ${clock(seen.seenAt)} with an empty quota block` };
  }
  return {
    state: 'ok',
    windows,
    note: `${modelNameOf(seen.model, null) || 'agy'} · from statusLine, seen ${clock(seen.seenAt)}`,
  };
}

module.exports = {
  id: 'agy',
  label: 'Antigravity',
  kind: 'subscription',
  fetchQuota,
  __test: { parseQuota, splitGroupAndWindow },
};
