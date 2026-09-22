'use strict';

// Paths and the one call into herdr. Small on purpose: everything here touches
// the machine, and everything that does not lives in the modules with tests.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// herdr passes HERDR_PLUGIN_STATE_DIR to hooks and actions but not to panes,
// so the opener hands it to the board in the pane's own env.
function stateDir() {
  const dir = process.env.HERDR_PLUGIN_STATE_DIR || path.join(os.tmpdir(), 'herdr-file-board');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* a state dir we cannot create only costs us the remembered pane */
  }
  return dir;
}

// A Windows junction pointing at another volume can refuse traversal while its
// target reads fine. Follow the link ourselves before giving up.
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

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
  } catch {
    /* nothing here is worth failing an open over */
  }
}

// HERDR_BIN_PATH is the running herdr; it speaks the same JSON over a Unix
// socket and a Windows named pipe.
function herdr(args) {
  const bin = process.env.HERDR_BIN_PATH || 'herdr';
  const out = execFileSync(bin, args, { encoding: 'utf8', windowsHide: true });
  return out.trim() ? JSON.parse(out) : null;
}

module.exports = { stateDir, resolveDir, readJson, writeJsonAtomic, herdr };
