'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openFile, MAX_BYTES, MAX_LINES } = require('../lib/view');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-board-view-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

test('a text file comes back as its lines', () => {
  const view = openFile(tmpFile('note.md', '# title\nsecond line\n'));
  assert.strictEqual(view.kind, 'text');
  assert.deepStrictEqual(view.lines, ['# title', 'second line']);
  assert.strictEqual(view.readOnly, false);
});

test('CRLF does not leave carriage returns in the lines', () => {
  const view = openFile(tmpFile('crlf.txt', 'one\r\ntwo\r\n'));
  assert.deepStrictEqual(view.lines, ['one', 'two']);
});

test('a file over the byte limit is refused, not truncated', () => {
  const view = openFile(tmpFile('big.log', 'x'.repeat(MAX_BYTES + 1)));
  assert.strictEqual(view.kind, 'too-big');
  assert.strictEqual(view.readOnly, true);
  assert.deepStrictEqual(view.lines, []);
});

test('a file over the line limit shows its first lines and says so', () => {
  const view = openFile(tmpFile('long.txt', 'line\n'.repeat(MAX_LINES + 10)));
  assert.strictEqual(view.kind, 'too-long');
  assert.strictEqual(view.lines.length, MAX_LINES);
  assert.strictEqual(view.readOnly, true);
});

test('a file with a NUL byte is binary and stays read-only', () => {
  const view = openFile(tmpFile('image.bin', Buffer.from([0x89, 0x50, 0x00, 0x1a])));
  assert.strictEqual(view.kind, 'binary');
  assert.strictEqual(view.readOnly, true);
});

test('bytes that are not valid UTF-8 count as binary', () => {
  const view = openFile(tmpFile('cp1251.txt', Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2])));
  assert.strictEqual(view.kind, 'binary');
});

test('a UTF-8 BOM is not shown as a character', () => {
  const view = openFile(tmpFile('bom.txt', Buffer.from('﻿hello\n', 'utf8')));
  assert.deepStrictEqual(view.lines, ['hello']);
});

test('a file that cannot be read says so instead of throwing', () => {
  const view = openFile(path.join(os.tmpdir(), 'file-board-no-such-file-9271'));
  assert.strictEqual(view.kind, 'unreadable');
  assert.strictEqual(view.readOnly, true);
});

test('an empty file is text with no lines', () => {
  const view = openFile(tmpFile('empty.txt', ''));
  assert.strictEqual(view.kind, 'text');
  assert.deepStrictEqual(view.lines, []);
});

// A tab is one character and eight columns. Left alone, the board measures it
// as one, the terminal draws it as eight, the row overflows and wraps, and
// every row below it is off by one for the rest of the frame.
test('a tab is spelled out in spaces before the board ever measures the line', () => {
  const view = openFile(tmpFile('tabbed.js', 'if (x) {\n\treturn 1;\n}\n'));
  assert.deepStrictEqual(view.lines, ['if (x) {', '        return 1;', '}']);
});

test('a tab stops at the next stop, it is not eight spaces wherever it lands', () => {
  const view = openFile(tmpFile('stops.txt', 'ab\tc\n'));
  assert.deepStrictEqual(view.lines, ['ab      c']);
});
