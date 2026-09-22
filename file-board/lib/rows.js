'use strict';

// The tree as the pane sees it: a flat list of rows, rebuilt on demand from the
// set of open folders. Nothing is cached between redraws, so a file created in
// another pane shows up on the next keystroke, and an open folder deep inside a
// closed one keeps its state for when the parent opens again.

const path = require('node:path');
const { readEntries } = require('./tree');

function createTree(root, { showHidden = false } = {}) {
  return { root, showHidden, expanded: new Set() };
}

function setShowHidden(tree, showHidden) {
  tree.showHidden = showHidden;
}

function toggle(tree, target) {
  if (tree.expanded.has(target)) {
    tree.expanded.delete(target);
    return;
  }
  // Only folders open. Asking the filesystem keeps the caller from having to
  // know what it is pressing Enter on.
  const parent = path.dirname(target);
  const name = path.basename(target);
  const entry = readEntries(parent, { showHidden: true }).find((candidate) => candidate.name === name);
  if (entry && entry.isDirectory) tree.expanded.add(target);
}

// `trail` is what the guides are drawn from: for each level above this folder,
// whether that ancestor was the last of its siblings. A trunk is drawn beside a
// row for every ancestor that still has rows coming after it.
function collect(tree, dir, depth, trail, out) {
  const entries = readEntries(dir, { showHidden: tree.showHidden });
  entries.forEach((entry, at) => {
    const full = path.join(dir, entry.name);
    const expanded = entry.isDirectory && tree.expanded.has(full);
    const lastAt = [...trail, at === entries.length - 1];
    out.push({ name: entry.name, path: full, depth, isDirectory: entry.isDirectory, expanded, lastAt });
    if (expanded) collect(tree, full, depth + 1, lastAt, out);
  });
  return out;
}

function rows(tree) {
  return collect(tree, tree.root, 0, [], []);
}

module.exports = { createTree, rows, toggle, setShowHidden };
