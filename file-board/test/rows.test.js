'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createTree, rows, toggle, setShowHidden } = require('../lib/rows');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-board-rows-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'src', 'lib'));
  fs.writeFileSync(path.join(root, 'src', 'index.js'), '');
  fs.writeFileSync(path.join(root, 'src', 'lib', 'deep.js'), '');
  fs.writeFileSync(path.join(root, 'readme.md'), '');
  fs.writeFileSync(path.join(root, '.env'), '');
  return root;
}

test('a fresh tree shows only the top folder', () => {
  const tree = createTree(fixture());
  assert.deepStrictEqual(
    rows(tree).map((row) => [row.name, row.depth]),
    [
      ['src', 0],
      ['readme.md', 0],
    ],
  );
});

test('opening a folder puts its children right under it, one level in', () => {
  const root = fixture();
  const tree = createTree(root);
  toggle(tree, path.join(root, 'src'));
  assert.deepStrictEqual(
    rows(tree).map((row) => [row.name, row.depth]),
    [
      ['src', 0],
      ['lib', 1],
      ['index.js', 1],
      ['readme.md', 0],
    ],
  );
});

test('a folder knows it is open', () => {
  const root = fixture();
  const tree = createTree(root);
  toggle(tree, path.join(root, 'src'));
  assert.strictEqual(rows(tree).find((row) => row.name === 'src').expanded, true);
});

test('nested folders stack up', () => {
  const root = fixture();
  const tree = createTree(root);
  toggle(tree, path.join(root, 'src'));
  toggle(tree, path.join(root, 'src', 'lib'));
  assert.deepStrictEqual(
    rows(tree).map((row) => [row.name, row.depth]),
    [
      ['src', 0],
      ['lib', 1],
      ['deep.js', 2],
      ['index.js', 1],
      ['readme.md', 0],
    ],
  );
});

test('closing a folder takes its children away, and what was open inside stays open', () => {
  const root = fixture();
  const tree = createTree(root);
  toggle(tree, path.join(root, 'src'));
  toggle(tree, path.join(root, 'src', 'lib'));
  toggle(tree, path.join(root, 'src'));
  assert.deepStrictEqual(
    rows(tree).map((row) => row.name),
    ['src', 'readme.md'],
  );
  toggle(tree, path.join(root, 'src'));
  assert.deepStrictEqual(
    rows(tree).map((row) => row.name),
    ['src', 'lib', 'deep.js', 'index.js', 'readme.md'],
  );
});

test('toggling a file changes nothing', () => {
  const root = fixture();
  const tree = createTree(root);
  const before = rows(tree).map((row) => row.name);
  toggle(tree, path.join(root, 'readme.md'));
  assert.deepStrictEqual(
    rows(tree).map((row) => row.name),
    before,
  );
});

test('dotfiles appear when the switch is flipped and go away again', () => {
  const tree = createTree(fixture());
  setShowHidden(tree, true);
  assert.ok(rows(tree).some((row) => row.name === '.env'));
  setShowHidden(tree, false);
  assert.ok(!rows(tree).some((row) => row.name === '.env'));
});

test('a row carries the full path, so the viewer needs nothing else', () => {
  const root = fixture();
  const tree = createTree(root);
  assert.strictEqual(
    rows(tree).find((row) => row.name === 'readme.md').path,
    path.join(root, 'readme.md'),
  );
});

// The guides `│ ├ └` are drawn from this: for every level above a row, whether
// that ancestor was the last of its siblings, and last of all whether the row
// itself is. The renderer needs nothing else to draw the tree's shape.
test('a row knows whether it is the last of its siblings', () => {
  const tree = createTree(fixture());
  assert.deepStrictEqual(
    rows(tree).map((row) => [row.name, row.lastAt]),
    [
      ['src', [false]],
      ['readme.md', [true]],
    ],
  );
});

test('a child carries its parents answers before its own', () => {
  const root = fixture();
  const tree = createTree(root);
  toggle(tree, path.join(root, 'src'));
  toggle(tree, path.join(root, 'src', 'lib'));
  assert.deepStrictEqual(
    rows(tree).map((row) => [row.name, row.lastAt]),
    [
      ['src', [false]],
      ['lib', [false, false]],
      // `src` is not the last row at the top, so the trunk beside `deep.js`
      // must still be drawn: that is what the leading `false` says.
      ['deep.js', [false, false, true]],
      ['index.js', [false, true]],
      ['readme.md', [true]],
    ],
  );
});
