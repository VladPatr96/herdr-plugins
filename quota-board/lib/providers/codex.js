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

function parseRateLimits(result) {
  const limits = result?.rateLimits || result?.rate_limits;
  if (!limits) return null;
  const windows = [];
  for (const field of ['primary', 'secondary']) {
    const window = limits[field];
    if (!window || typeof window.usedPercent !== 'number') continue;
    windows.push({
      label: windowLabel(window.windowDurationMins),
      usedPercent: window.usedPercent,
      resetsAt: typeof window.resetsAt === 'number' ? window.resetsAt : null,
    });
  }
  return windows;
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
    return { state: 'ok', windows, plan };
  }).catch((error) => {
    const message = String(error.message || error);
    if (/ENOENT|not recognized|not found/i.test(message)) {
      return { state: 'no-credentials', note: 'the `codex` CLI is not on PATH' };
    }
    return { state: 'error', note: message };
  });
}

module.exports = { id: 'codex', label: 'Codex', kind: 'subscription', fetchQuota, __test: { windowLabel, parseRateLimits } };
