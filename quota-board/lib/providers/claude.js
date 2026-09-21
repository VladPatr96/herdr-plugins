'use strict';

// Claude Code's own OAuth token answers for its plan windows, including the
// per-model weekly pools (Fable) that the status line does not carry. The
// status line bridge stays as the fallback: that endpoint is rate limited per
// account, and several open sessions are enough to get a 429.

const path = require('node:path');
const { home, readJson, getJson, resolveDir } = require('../runtime');
const statusline = require('../statusline-store');
const { clock } = require('../format');

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const BETA = 'oauth-2025-04-20';
const USER_AGENT = 'claude-cli/2.1.278 (external, cli)';

const WINDOW_LABELS = {
  five_hour: '5h',
  seven_day: '7d',
  seven_day_opus: '7d opus',
  seven_day_oauth_apps: '7d apps',
};

// `limits[]` is what Claude Code's own /usage draws: one row per window, with
// the model named for a scoped one.
const LIMIT_KINDS = {
  session: '5h',
  weekly_all: '7d',
};

function configDir() {
  return process.env.CLAUDE_CONFIG_DIR || resolveDir(path.join(home(), '.claude'));
}

function accessToken() {
  const credentials = readJson(path.join(configDir(), '.credentials.json'));
  const oauth = credentials?.claudeAiOauth;
  if (!oauth?.accessToken) return null;
  return { token: oauth.accessToken, expiresAt: oauth.expiresAt || null };
}

function label(key) {
  return WINDOW_LABELS[key] || key.replace(/_/g, ' ');
}

function seconds(value) {
  if (!value) return null;
  const parsed = typeof value === 'number' ? value : Date.parse(value) / 1000;
  return Number.isFinite(parsed) ? parsed : null;
}

// A scoped weekly window belongs to one model ("7d Fable"); an unscoped one is
// the plan's own week.
function limitLabel(limit) {
  const model = limit.scope?.model?.display_name;
  if (limit.kind === 'weekly_scoped') return model ? `7d ${model}` : '7d scoped';
  return LIMIT_KINDS[limit.kind] || String(limit.kind).replace(/_/g, ' ');
}

function parseLimits(limits) {
  const windows = [];
  for (const limit of limits || []) {
    if (!limit || typeof limit.percent !== 'number') continue;
    windows.push({
      label: limitLabel(limit),
      usedPercent: limit.percent,
      resetsAt: seconds(limit.resets_at),
      severity: limit.severity && limit.severity !== 'normal' ? limit.severity : null,
    });
  }
  return windows;
}

// Older payloads carry one object per window at the top level instead.
function parseWindows(body) {
  const windows = [];
  for (const [key, value] of Object.entries(body || {})) {
    if (!value || typeof value !== 'object') continue;
    if (typeof value.utilization !== 'number') continue;
    windows.push({ label: label(key), usedPercent: value.utilization, resetsAt: seconds(value.resets_at) });
  }
  return windows;
}

function parseUsage(body) {
  const fromLimits = parseLimits(body?.limits);
  return fromLimits.length ? fromLimits : parseWindows(body);
}

// statusLine stdin gives `rate_limits.five_hour.used_percentage`, and only the
// two plan-wide windows — no per-model pool.
function fromStatusline() {
  const seen = statusline.load('claude');
  const limits = seen?.rate_limits;
  if (!limits) return null;
  const windows = [];
  for (const [key, value] of Object.entries(limits)) {
    if (!value || typeof value.used_percentage !== 'number') continue;
    windows.push({ label: label(key), usedPercent: value.used_percentage, resetsAt: seconds(value.resets_at) });
  }
  if (!windows.length) return null;
  return {
    state: 'ok',
    windows,
    note: `from statusLine, seen ${clock(seen.seenAt)}; no per-model pool there`,
  };
}

async function fetchQuota() {
  const credentials = accessToken();
  if (!credentials) {
    return fromStatusline() || {
      state: 'no-credentials',
      note: 'no OAuth login in ~/.claude/.credentials.json',
    };
  }
  try {
    const body = await getJson(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        'anthropic-beta': BETA,
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    });
    const windows = parseUsage(body);
    if (windows.length) return { state: 'ok', windows };
    return fromStatusline() || { state: 'error', note: 'usage response has no windows' };
  } catch (error) {
    const fallback = fromStatusline();
    if (fallback) {
      const reason = error.status === 429 ? 'usage endpoint is rate limited' : `usage endpoint: ${error.message}`;
      return { ...fallback, note: `${fallback.note}; ${reason}` };
    }
    if (credentials.expiresAt && credentials.expiresAt < Date.now()) {
      return { state: 'error', note: 'the stored OAuth token has expired — run `claude` once' };
    }
    return { state: 'error', note: `usage endpoint: ${error.message}` };
  }
}

module.exports = {
  id: 'claude',
  label: 'Claude Code',
  kind: 'subscription',
  fetchQuota,
  __test: { parseUsage, parseLimits, limitLabel, label },
};
