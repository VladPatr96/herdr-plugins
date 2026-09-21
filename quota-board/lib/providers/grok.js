'use strict';

// The Grok CLI reads its own credits through a proxy of its own; this is the
// same request the CLI makes, with the CLI's headers. It is not a documented
// public API, so treat a shape change as "no data", never as zero usage.

const path = require('node:path');
const { home, readJson, getJson, resolveDir } = require('../runtime');

const URL = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits';

function authFile() {
  if (process.env.GROK_AUTH_FILE) return process.env.GROK_AUTH_FILE;
  const grokHome = process.env.GROK_HOME || resolveDir(path.join(home(), '.grok'));
  return path.join(grokHome, 'auth.json');
}

// auth.json keys sessions by issuer; take the first entry that carries a key.
function credentials() {
  const file = readJson(authFile());
  if (!file || typeof file !== 'object') return null;
  const found = [];
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.key === 'string' && value.key.trim()) {
      found.push({ key: value.key.trim(), userId: value.user_id || null, expiresAt: value.expires_at || null });
    }
    for (const nested of Object.values(value)) walk(nested);
  };
  walk(file);
  return found[0] || null;
}

function windowKind(periodType = '') {
  if (periodType.includes('WEEKLY')) return '7d';
  if (periodType.includes('MONTHLY')) return '30d';
  return null;
}

async function fetchQuota() {
  const found = credentials();
  if (!found) return { state: 'no-credentials', note: 'run `grok` once and sign in' };

  const headers = {
    Authorization: `Bearer ${found.key}`,
    'X-XAI-Token-Auth': 'xai-grok-cli',
    Accept: 'application/json',
  };
  if (found.userId) headers['x-userid'] = found.userId;

  const body = await getJson(URL, { headers });
  const config = body.config;
  if (!config) return { state: 'error', note: 'billing response has no config' };

  const label = windowKind(config.currentPeriod?.type || '');
  if (!label) return { state: 'error', note: `unknown billing period ${config.currentPeriod?.type}` };

  // proto3 omits zero scalars: a fresh period simply has no creditUsagePercent.
  const used = typeof config.creditUsagePercent === 'number' ? config.creditUsagePercent : 0;
  const end = config.currentPeriod?.end ? Date.parse(config.currentPeriod.end) / 1000 : null;
  return {
    state: 'ok',
    windows: [{ label, usedPercent: used, resetsAt: Number.isFinite(end) ? end : null }],
  };
}

module.exports = { id: 'grok', label: 'Grok', kind: 'subscription', fetchQuota, __test: { windowKind } };
