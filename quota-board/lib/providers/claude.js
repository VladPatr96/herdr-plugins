'use strict';

// Claude Code's own OAuth token answers for its plan windows, which keeps this
// out of the user's statusLine. The statusLine bridge stays as a fallback for
// when the token is missing or the endpoint refuses.

const path = require('node:path');
const { home, readJson, getJson, resolveDir } = require('../runtime');
const statusline = require('../statusline-store');

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const BETA = 'oauth-2025-04-20';
const USER_AGENT = 'claude-cli/2.1.0 (external, cli)';

const WINDOW_LABELS = {
  five_hour: '5h',
  seven_day: '7d',
  seven_day_opus: '7d opus',
  seven_day_oauth_apps: '7d apps',
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

// The payload carries one object per window; anything with a utilization
// number is a window, whatever Anthropic adds later.
function parseUsage(body) {
  const windows = [];
  for (const [key, value] of Object.entries(body || {})) {
    if (!value || typeof value !== 'object') continue;
    const used = typeof value.utilization === 'number' ? value.utilization : null;
    if (used === null) continue;
    const reset = value.resets_at ? Date.parse(value.resets_at) / 1000 : null;
    windows.push({ label: label(key), usedPercent: used, resetsAt: Number.isFinite(reset) ? reset : null });
  }
  return windows;
}

// statusLine stdin gives `rate_limits.five_hour.used_percentage`.
function fromStatusline() {
  const seen = statusline.load('claude');
  const limits = seen?.rate_limits;
  if (!limits) return null;
  const windows = [];
  for (const [key, value] of Object.entries(limits)) {
    if (!value || typeof value.used_percentage !== 'number') continue;
    const reset = typeof value.resets_at === 'number'
      ? value.resets_at
      : value.resets_at ? Date.parse(value.resets_at) / 1000 : null;
    windows.push({ label: label(key), usedPercent: value.used_percentage, resetsAt: Number.isFinite(reset) ? reset : null });
  }
  if (!windows.length) return null;
  return { state: 'ok', windows, note: `from statusLine, seen ${new Date(seen.seenAt * 1000).toISOString().slice(11, 16)} UTC` };
}

// How fresh a statusLine reading has to be to be preferred over the endpoint.
const STATUSLINE_FRESH_SECONDS = 30 * 60;

async function fetchQuota() {
  // The status line is the cheaper and more reliable of the two: it is exactly
  // what this machine's own session was told. Use the endpoint only when that
  // reading is missing or old.
  const fresh = fromStatusline();
  if (fresh && Math.floor(Date.now() / 1000) - (statusline.load('claude')?.seenAt || 0) < STATUSLINE_FRESH_SECONDS) {
    return fresh;
  }

  const credentials = accessToken();
  if (!credentials) {
    return fresh || {
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
    if (!windows.length) return fromStatusline() || { state: 'error', note: 'usage response has no windows' };
    return { state: 'ok', windows };
  } catch (error) {
    if (fresh) return { ...fresh, note: `${fresh.note}; usage endpoint said ${error.message}` };
    const expired = credentials.expiresAt && credentials.expiresAt < Date.now();
    if (expired) return { state: 'error', note: 'the stored OAuth token has expired — run `claude` once' };
    if (error.status === 429) {
      return {
        state: 'error',
        note: 'usage endpoint is rate limited — install the statusLine bridge (see README)',
      };
    }
    return { state: 'error', note: `usage endpoint: ${error.message}` };
  }
}

module.exports = { id: 'claude', label: 'Claude Code', kind: 'subscription', fetchQuota, __test: { parseUsage, label } };
