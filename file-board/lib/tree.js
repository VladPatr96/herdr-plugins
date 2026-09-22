'use strict';

// Reading one folder, lazily: the board asks for a folder's children only when
// that folder is open on screen. Nothing walks the tree ahead of time, so a
// repository with a quarter of a million files costs the same as a small one.

const fs = require('node:fs');

// `.git` is never shown. It is machinery, not work, and on Windows it is also
// the folder most likely to be huge.
const ALWAYS_HIDDEN = new Set(['.git']);

function isHidden(name) {
  return name.startsWith('.');
}

// Directories first, then files, each group by name. A plain comparison keeps
// the order the same on every machine, which the tests can rely on.
function byKind(a, b) {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}

// A folder that cannot be read — gone, denied, or a junction pointing nowhere —
// reads as empty. The board keeps its shape instead of dying inside a pane.
function readEntries(dir, { showHidden = false } = {}) {
  let dirents;
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return dirents
    .filter((dirent) => !ALWAYS_HIDDEN.has(dirent.name))
    .filter((dirent) => showHidden || !isHidden(dirent.name))
    .map((dirent) => ({
      name: dirent.name,
      // Taken from the directory entry itself: no stat call, and a junction or
      // symlink is not followed just to draw a row.
      isDirectory: dirent.isDirectory(),
    }))
    .sort(byKind);
}

module.exports = { readEntries };
