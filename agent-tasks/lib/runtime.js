'use strict';

// Side-effecting helpers shared by the bin/ scripts: the Herdr CLI, the plugin
// state directory, and the registry of agents this plugin launched.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HERDR = process.env.HERDR_BIN_PATH || 'herdr';
const PLUGIN_ID = process.env.HERDR_PLUGIN_ID || 'vladpatr96.agent-tasks';
const SOURCE = 'plugin:agent-tasks';

// `stdio` keeps the CLI's own diagnostics out of our stderr: a launch retries
// on purpose, and its first failed attempt must not look like an error to the
// caller reading this process's output.
const EXEC = { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] };

function herdr(args) {
  const out = execFileSync(HERDR, args, EXEC);
  const parsed = out.trim() ? JSON.parse(out) : null;
  // The CLI answers errors with a JSON body and exit code 0, so a caller that
  // only catches exceptions would read an error as a result.
  if (parsed?.error) {
    const error = new Error(parsed.error.message || parsed.error.code || 'herdr error');
    error.code = parsed.error.code;
    throw error;
  }
  return parsed;
}

// `herdr pane read` answers with the terminal's own text, not JSON, so it
// cannot go through herdr() above.
function herdrText(args) {
  return execFileSync(HERDR, args, EXEC);
}

// Same default as the other plugins here: Herdr sets the variable, and a
// command run by hand still finds the same directory.
function stateDir() {
  const dir = process.env.HERDR_PLUGIN_STATE_DIR || path.join(os.tmpdir(), 'herdr-agent-tasks');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// `bin/launch.js` is called from a Claude Code session, which never sees
// Herdr's environment. The plugin leaves a note at a fixed place so the
// launcher and the event hooks agree on one registry.
function pointerFile() {
  return path.join(os.tmpdir(), 'herdr-agent-tasks.state-dir');
}

function rememberStateDir() {
  const dir = stateDir();
  try {
    if (fs.readFileSync(pointerFile(), 'utf8').trim() !== dir) fs.writeFileSync(pointerFile(), dir);
  } catch {
    try {
      fs.writeFileSync(pointerFile(), dir);
    } catch {
      /* a read-only temp dir is not worth failing a launch over */
    }
  }
  return dir;
}

function resolvedStateDir() {
  if (process.env.HERDR_PLUGIN_STATE_DIR) return stateDir();
  try {
    const dir = fs.readFileSync(pointerFile(), 'utf8').trim();
    if (dir) {
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    }
  } catch {
    /* fall through to the default */
  }
  return stateDir();
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Write-then-rename, so a sync running next to a launch never reads half a file.
function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function registryFile(dir = resolvedStateDir()) {
  return path.join(dir, 'agents.json');
}

function taskFile(paneId, dir = resolvedStateDir()) {
  // A pane id is `w8:pS`; a colon is not a filename on Windows.
  return path.join(dir, 'tasks', `${String(paneId).replace(/[^\w.-]+/g, '-')}.md`);
}

function loadRegistry(dir) {
  const saved = readJson(registryFile(dir));
  return saved && typeof saved === 'object' && saved.agents ? saved.agents : {};
}

function saveRegistry(agents, dir) {
  writeJsonAtomic(registryFile(dir), { agents, updatedAt: new Date().toISOString() });
}

function readTask(paneId, dir) {
  try {
    return fs.readFileSync(taskFile(paneId, dir), 'utf8');
  } catch {
    return null;
  }
}

module.exports = {
  HERDR,
  PLUGIN_ID,
  SOURCE,
  herdr,
  herdrText,
  stateDir,
  rememberStateDir,
  resolvedStateDir,
  readJson,
  writeJsonAtomic,
  registryFile,
  taskFile,
  loadRegistry,
  saveRegistry,
  readTask,
};
