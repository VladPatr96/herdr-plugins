'use strict';

// Codex answers its own app-server over JSON-RPC on stdio: the same call the
// CLI's /status makes. No network request of ours, no token handling.

const { spawn } = require('node:child_process');

const REQUEST_TIMEOUT_MS = 20_000;

function windowLabel(minutes) {
  if (!Number.isFinite(minutes)) return 'window';
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function windowsOf(limit, name) {
  const windows = [];
  for (const field of ['primary', 'secondary']) {
    const window = limit?.[field];
    if (!window || typeof window.usedPercent !== 'number') continue;
    const base = windowLabel(window.windowDurationMins);
    windows.push({
      label: name ? `${base} ${name}` : base,
      usedPercent: window.usedPercent,
      resetsAt: typeof window.resetsAt === 'number' ? window.resetsAt : null,
    });
  }
  return windows;
}

// Codex bills more than one pool: the plan's own limit plus named reserves
// such as `gpt-reserve`. Each one gets its own row, the plan's first.
function parseRateLimits(result) {
  const main = result?.rateLimits || result?.rate_limits;
  const byId = result?.rateLimitsByLimitId || result?.rate_limits_by_limit_id || {};
  if (!main && !Object.keys(byId).length) return null;

  const windows = [...windowsOf(main)];
  const mainId = main?.limitId || main?.limit_id;
  for (const [id, limit] of Object.entries(byId)) {
    if (id === mainId) continue;
    windows.push(...windowsOf(limit, limit?.limitName || limit?.limit_name || id));
  }
  return windows;
}

// A reset credit clears the rate limit ahead of its window. They expire, so the
// row says how many are left and when the first one goes.
function parseResetCredits(result, now = Math.floor(Date.now() / 1000)) {
  const credits = (result?.rateLimitResetCredits?.credits || []).filter((c) => c.status === 'available');
  if (!credits.length) return null;
  const expiries = credits.map((c) => c.expiresAt).filter((value) => Number.isFinite(value));
  const soonest = expiries.length ? Math.min(...expiries) : null;
  const days = soonest ? Math.floor((soonest - now) / 86400) : null;
  const plural = credits.length === 1 ? 'reset' : 'resets';
  return days === null
    ? `${credits.length} free ${plural} available`
    : `${credits.length} free ${plural} available · first expires in ${days}d`;
}

// One short-lived app-server per refresh. Everything is torn down on the way
// out, including the timeout path, so a stuck server cannot outlive the call.
function appServer(requests) {
  return new Promise((resolve, reject) => {
    const executable = process.env.CODEX_BIN_PATH || 'codex';
    const child = spawn(executable, ['app-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
      // Windows installs Codex as a PATHEXT shim, which spawn only finds
      // through a shell. The argv is fixed, so nothing user-supplied is parsed.
      shell: process.platform === 'win32',
    });

    const answers = new Map();
    const waiting = new Map();
    let buffer = '';
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      error ? reject(error) : resolve(value);
    };

    const timer = setTimeout(() => finish(new Error('codex app-server timed out')), REQUEST_TIMEOUT_MS);
    child.on('error', (error) => finish(new Error(`codex app-server: ${error.message}`)));
    child.on('exit', () => finish(new Error('codex app-server exited early')));

    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id === undefined || message.id === null) continue;
        answers.set(message.id, message);
        const resolveOne = waiting.get(message.id);
        if (resolveOne) {
          waiting.delete(message.id);
          resolveOne(message);
        }
      }
    });

    const send = (id, method, params = {}) => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      if (answers.has(id)) return Promise.resolve(answers.get(id));
      return new Promise((resolveOne) => waiting.set(id, resolveOne));
    };
    const notify = (method, params = {}) => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    };

    requests({ send, notify })
      .then((value) => finish(null, value))
      .catch((error) => finish(error));
  });
}

async function fetchQuota() {
  return appServer(async ({ send, notify }) => {
    await send(1, 'initialize', {
      clientInfo: { name: 'herdr-quota-board', version: '0.1.0' },
      capabilities: {},
    });
    notify('initialized', {});

    const account = await send(2, 'account/read');
    const type = account?.result?.account?.type;
    if (type && type !== 'chatgpt') {
      return { state: 'unsupported', note: 'Codex is on API-key auth, which has no plan quota' };
    }

    const limits = await send(3, 'account/rateLimits/read');
    if (limits?.error) {
      return { state: 'error', note: String(limits.error.message || 'rateLimits request failed') };
    }
    const windows = parseRateLimits(limits?.result);
    if (!windows || !windows.length) {
      return { state: 'error', note: 'no rate limit windows in the response' };
    }
    const plan = limits?.result?.rateLimits?.planType || account?.result?.account?.planType || null;
    const note = parseResetCredits(limits?.result);
    return { state: 'ok', windows, plan, note };
  }).catch((error) => {
    const message = String(error.message || error);
    if (/ENOENT|not recognized|not found/i.test(message)) {
      return { state: 'no-credentials', note: 'the `codex` CLI is not on PATH' };
    }
    return { state: 'error', note: message };
  });
}

module.exports = { id: 'codex', label: 'Codex', kind: 'subscription', fetchQuota, __test: { windowLabel, parseRateLimits, parseResetCredits } };
