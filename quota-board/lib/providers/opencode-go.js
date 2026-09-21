'use strict';

// The OpenCode Go subscription keeps no usage numbers on disk; opencode.ai
// answers with the three windows it bills against.

const { opencodeAuth, getJson } = require('../runtime');

const URL = 'https://opencode.ai/zen/go/v1/usage';
const WINDOWS = [
  ['rolling', '5h'],
  ['weekly', '7d'],
  ['monthly', '30d'],
];

async function fetchQuota() {
  const key = opencodeAuth()?.['opencode-go']?.key;
  if (!key) {
    return { state: 'no-credentials', note: 'run `opencode auth login` for the Go plan' };
  }
  const body = await getJson(URL, { headers: { Authorization: `Bearer ${key}` } });
  const usage = body.usage || {};
  const windows = [];
  for (const [field, label] of WINDOWS) {
    const window = usage[field];
    if (!window || typeof window.percent !== 'number') continue;
    windows.push({
      label,
      usedPercent: window.percent,
      resetsAt: window.resetsAt ? Date.parse(window.resetsAt) / 1000 : null,
      degraded: window.status && window.status !== 'ok' ? window.status : null,
    });
  }
  if (!windows.length) return { state: 'error', note: 'no usage windows in the response' };
  return { state: 'ok', windows };
}

module.exports = { id: 'opencode-go', label: 'OpenCode Go', kind: 'subscription', fetchQuota };
