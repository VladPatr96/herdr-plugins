'use strict';

// DeepSeek sells credit, not a plan, so there is no window to fill: the number
// that matters is what is left on the account.
// https://api-docs.deepseek.com/api/get-user-balance

const { secret, opencodeAuth, getJson } = require('../runtime');

const URL = 'https://api.deepseek.com/user/balance';

function apiKey() {
  const fromEnv = secret('DEEPSEEK_API_KEY', 'DEEPSEEK_KEY', 'DEEPSEEK_TOKEN');
  if (fromEnv) return { key: fromEnv, source: 'DEEPSEEK_API_KEY' };
  // OpenCode keeps the key the user already pasted into it.
  const key = opencodeAuth()?.deepseek?.key;
  return key ? { key, source: 'opencode auth.json' } : null;
}

async function fetchQuota() {
  const credentials = apiKey();
  if (!credentials) {
    return {
      state: 'no-credentials',
      note: 'set DEEPSEEK_API_KEY (shell or the plugin .env)',
    };
  }
  const body = await getJson(URL, { headers: { Authorization: `Bearer ${credentials.key}` } });
  const info = (body.balance_infos || [])[0];
  if (!info) return { state: 'error', note: 'balance_infos is empty' };
  return {
    state: 'ok',
    balance: {
      currency: info.currency,
      total: info.total_balance,
      granted: info.granted_balance,
      toppedUp: info.topped_up_balance,
      available: body.is_available !== false,
    },
    note: credentials.source === 'opencode auth.json' ? 'key from OpenCode' : null,
  };
}

module.exports = { id: 'deepseek', label: 'DeepSeek API', kind: 'api', fetchQuota };
