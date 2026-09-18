'use strict';

// Side-effecting helpers shared by the bin/ scripts: herdr CLI calls and the
// slot map persisted in the plugin state directory.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HERDR = process.env.HERDR_BIN_PATH || 'herdr';

function herdr(args) {
  const out = execFileSync(HERDR, args, { encoding: 'utf8', windowsHide: true });
  return out.trim() ? JSON.parse(out) : null;
}

// Same lookup order as herdr src/config/io.rs: config_path().
function herdrConfigPath() {
  if (process.env.HERDR_CONFIG_PATH) return process.env.HERDR_CONFIG_PATH;
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'herdr', 'config.toml');
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'herdr', 'config.toml');
  }
  return path.join(os.homedir(), '.config', 'herdr', 'config.toml');
}

function stateDir() {
  const dir = process.env.HERDR_PLUGIN_STATE_DIR || path.join(os.tmpdir(), 'herdr-agent-hotkeys');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function slotsFile() {
  return path.join(stateDir(), 'slots.json');
}

function loadSlots() {
  try {
    const slots = JSON.parse(fs.readFileSync(slotsFile(), 'utf8'));
    return slots && typeof slots === 'object' ? slots : {};
  } catch {
    return {};
  }
}

// Write-then-rename so focus.js never reads a half-written file.
function saveSlots(slots) {
  const file = slotsFile();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(slots, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { herdr, herdrConfigPath, stateDir, loadSlots, saveSlots };
