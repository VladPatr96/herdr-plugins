'use strict';

// The OpenCode Go subscription keeps no usage numbers on disk; opencode.ai
// answers with the three windows it bills against.

const { opencodeAuth, getJson } = require('../runtime');

const URL = 'https://opencode.ai/zen/go/v1/usage';
// The same route answers what the plan may run.
const MODELS_URL = 'https://opencode.ai/zen/go/v1/models';
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
  const headers = { Authorization: `Bearer ${key}` };
  const body = await getJson(URL, { headers });
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

  // The catalog is a nicety, not the answer: a failure here must not cost the
  // quota reading.
  let catalog = null;
  try {
    const models = await getJson(MODELS_URL, { headers });
    catalog = (models.data || []).map((model) => model.id).filter(Boolean).sort();
  } catch {
    /* leave it out */
  }

  return catalog?.length ? { state: 'ok', windows, catalog } : { state: 'ok', windows };
}

module.exports = { id: 'opencode-go', label: 'OpenCode Go', kind: 'subscription', fetchQuota };
