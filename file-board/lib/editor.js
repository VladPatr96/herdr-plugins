'use strict';

// Which editor to hand the file to.
//
// The awkward case is Windows: an editor installed while herdr was already
// running is not on the PATH herdr inherited, so `nvim` fails with ENOENT until
// the whole session restarts. Before reporting that, look where the installers
// actually put it.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function onPathReally(name) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(probe, [name], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function existsReally(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function knownInstalls(env) {
  const places = [];
  if (env.ProgramFiles) places.push(path.join(env.ProgramFiles, 'Neovim', 'bin', 'nvim.exe'));
  if (env.LOCALAPPDATA) places.push(path.join(env.LOCALAPPDATA, 'Programs', 'Neovim', 'bin', 'nvim.exe'));
  places.push('/opt/homebrew/bin/nvim', '/usr/local/bin/nvim', '/usr/bin/nvim');
  return places;
}

function editorCommand(env = {}, { onPath = onPathReally, exists = existsReally } = {}) {
  if (env.FILE_BOARD_EDITOR) return env.FILE_BOARD_EDITOR;
  if (env.EDITOR) return env.EDITOR;
  if (onPath('nvim')) return 'nvim';
  const installed = knownInstalls(env).find((file) => exists(file));
  // Falling back to the bare name keeps the failure legible: "nvim is not on
  // PATH" is the right thing to read when nothing was found.
  return installed || 'nvim';
}

module.exports = { editorCommand };
