'use strict';

// Paths, credential lookup and the small helpers every provider shares.
// Nothing here talks to a provider; nothing here keeps a secret on disk.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function stateDir() {
  const dir = process.env.HERDR_PLUGIN_STATE_DIR || path.join(os.tmpdir(), 'herdr-quota-board');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function configDir() {
  const dir = process.env.HERDR_PLUGIN_CONFIG_DIR || stateDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// A Windows junction that points at another volume can refuse traversal
// ("untrusted mount point") while its target reads fine, and home directories
// full of offloaded agent state are exactly where that happens. Resolve the
// parent directory and try again before giving up.
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    try {
      const real = path.join(resolveDir(path.dirname(file)), path.basename(file));
      if (real !== file) return JSON.parse(fs.readFileSync(real, 'utf8'));
    } catch {
      /* fall through */
    }
    return null;
  }
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

// `KEY=value` lines in the plugin's config directory, for keys the user does
// not want in their shell profile. Quotes are stripped, `#` starts a comment.
function readEnvFile(file = path.join(configDir(), '.env')) {
  const out = {};
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('#')) continue;
    const quoted = /^(['"])(.*)\1$/.exec(value);
    value = quoted ? quoted[2] : value.replace(/\s+#.*$/, '').trim();
    if (value) out[match[1]] = value;
  }
  return out;
}

// Environment first, then the plugin's own .env; a missing key is not an error.
function secret(...names) {
  const fromFile = readEnvFile();
  for (const name of names) {
    const value = process.env[name] || fromFile[name];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

// On Windows, HOME is often a POSIX path set by Git Bash (`/c/Users/...`),
// which Node cannot resolve. The OS answer wins there.
// A junction into another volume can refuse traversal while the target reads
// fine ("untrusted mount point" on Windows). Follow the link ourselves.
function resolveDir(dir) {
  try {
    fs.readdirSync(dir);
    return dir;
  } catch {
    /* fall through */
  }
  try {
    const link = fs.readlinkSync(dir);
    return path.isAbsolute(link) ? link : path.resolve(path.dirname(dir), link);
  } catch {
    /* fall through */
  }
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}

function home() {
  if (process.platform === 'win32') return os.homedir();
  return process.env.HOME || os.homedir();
}

// XDG on every platform, because that is where OpenCode itself looks.
function xdgData() {
  return process.env.XDG_DATA_HOME || path.join(home(), '.local', 'share');
}

function opencodeAuth() {
  return readJson(path.join(xdgData(), 'opencode', 'auth.json'));
}

async function getJson(url, { headers = {}, timeoutMs = 10_000 } = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  if (!response.ok) {
    const retryAfter = response.headers.get('retry-after');
    const suffix = response.status === 429 && retryAfter ? `, retry in ${retryAfter}s` : '';
    const error = new Error(`HTTP ${response.status}${suffix}`);
    error.status = response.status;
    error.retryAfter = retryAfter ? Number(retryAfter) : null;
    error.body = text.slice(0, 200);
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('response is not JSON');
  }
}

module.exports = {
  resolveDir,
  stateDir,
  configDir,
  readJson,
  writeJsonAtomic,
  readEnvFile,
  secret,
  home,
  xdgData,
  opencodeAuth,
  getJson,
};
