'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readEntries } = require('../lib/tree');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-board-'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, '.config'));
  fs.writeFileSync(path.join(root, 'readme.md'), '# hello\n');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1\n');
  fs.writeFileSync(path.join(root, 'app.js'), 'console.log(1)\n');
  return root;
}

test('directories come before files, each group by name', () => {
  const root = fixture();
  const names = readEntries(root).map((entry) => entry.name);
  assert.deepStrictEqual(names, ['src', 'app.js', 'readme.md']);
});

test('.git stays hidden even when dotfiles are shown', () => {
  const root = fixture();
  const names = readEntries(root, { showHidden: true }).map((entry) => entry.name);
  assert.ok(!names.includes('.git'), `.git leaked into ${names.join(', ')}`);
});

test('dotfiles appear only when asked for', () => {
  const root = fixture();
  const names = readEntries(root, { showHidden: true }).map((entry) => entry.name);
  assert.deepStrictEqual(names, ['.config', 'src', '.env', 'app.js', 'readme.md']);
});

test('an entry knows whether it is a directory', () => {
  const root = fixture();
  const entries = readEntries(root);
  assert.strictEqual(entries.find((entry) => entry.name === 'src').isDirectory, true);
  assert.strictEqual(entries.find((entry) => entry.name === 'app.js').isDirectory, false);
});

test('an unreadable directory reads as empty instead of throwing', () => {
  const root = fixture();
  assert.deepStrictEqual(readEntries(path.join(root, 'no-such-folder')), []);
});
