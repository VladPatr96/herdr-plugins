'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { scrollTo, rowSegments, fit, fitEnd, lineCount } = require('../lib/render');
const { styleFor } = require('../lib/paint');

// The shape of a row, with the colour set aside. Every assertion about the
// guides is about what the reader sees, so it is made on the text alone.
function text(row) {
  return rowSegments(row).map((segment) => segment.text).join('');
}

test('a cursor already on screen does not move the window', () => {
  assert.strictEqual(scrollTo({ cursor: 3, offset: 0, height: 10, total: 40 }), 0);
});

test('a cursor below the window pulls it down by just enough', () => {
  assert.strictEqual(scrollTo({ cursor: 12, offset: 0, height: 10, total: 40 }), 3);
});

test('a cursor above the window pulls it up to the cursor', () => {
  assert.strictEqual(scrollTo({ cursor: 4, offset: 10, height: 10, total: 40 }), 4);
});

test('the window never scrolls past the last row', () => {
  assert.strictEqual(scrollTo({ cursor: 39, offset: 0, height: 10, total: 40 }), 30);
});

test('a list shorter than the window starts at the top', () => {
  assert.strictEqual(scrollTo({ cursor: 2, offset: 5, height: 10, total: 4 }), 0);
});

test('a folder is drawn with an arrow that shows whether it is open', () => {
  const row = { name: 'src', depth: 0, isDirectory: true, lastAt: [false] };
  assert.strictEqual(text({ ...row, expanded: false }), '├─▸ src');
  assert.strictEqual(text({ ...row, expanded: true }), '├─▾ src');
});

test('a file has no arrow but lines up with the folders beside it', () => {
  assert.strictEqual(text({ name: 'app.js', depth: 0, isDirectory: false, lastAt: [false] }), '├─  app.js');
});

test('the last row of a folder closes the branch instead of continuing it', () => {
  assert.strictEqual(text({ name: 'readme.md', depth: 0, isDirectory: false, lastAt: [true] }), '└─  readme.md');
});

test('a level that still has rows coming keeps its trunk beside the ones below', () => {
  const row = { name: 'deep.js', depth: 2, isDirectory: false, lastAt: [false, true, true] };
  assert.strictEqual(text(row), '│   └─  deep.js');
});

test('the name is coloured by what kind of file it is', () => {
  const segments = rowSegments({ name: 'app.js', depth: 0, isDirectory: false, lastAt: [true] });
  const name = segments[segments.length - 1];
  assert.strictEqual(name.text, 'app.js');
  assert.strictEqual(name.sgr, styleFor('code'));
});

test('the guides are drawn dim, so the tree reads as a tree and not as text', () => {
  const [guide] = rowSegments({ name: 'app.js', depth: 1, isDirectory: false, lastAt: [false, true] });
  assert.strictEqual(guide.sgr, styleFor('guide'));
});

test('fit pads a short line to the full width', () => {
  assert.strictEqual(fit('abc', 6), 'abc   ');
});

test('fit cuts a long line and marks the cut', () => {
  assert.strictEqual(fit('abcdefgh', 4), 'abc…');
});

test('fit leaves a line that is exactly the width alone', () => {
  assert.strictEqual(fit('abcd', 4), 'abcd');
});

// A path is read from its end. Cutting the tail off `D:\projects\…\render.js`
// leaves the part every row already shares and takes away the only part that
// says which file this is.
test('a path too long for the header keeps its end, not its beginning', () => {
  const cut = fitEnd('D:\\projects\\my_projects\\file-board\\lib\\render.js', 14);
  assert.strictEqual(cut.length, 14);
  assert.ok(cut.startsWith('…'));
  assert.ok(cut.endsWith('render.js'));
});

test('a path that fits is padded like any other line', () => {
  assert.strictEqual(fitEnd('lib.js', 8), 'lib.js  ');
});

// What the header says about where you are in a file. `shown` is the number of
// file lines on screen, which is not the height of the pane whenever a note
// about the file is taking the first row.
test('the counter names the lines actually on screen', () => {
  assert.strictEqual(lineCount({ offset: 0, shown: 22, total: 152 }), '1-22/152');
});

test('the counter stops at the last line, not at the bottom of the pane', () => {
  assert.strictEqual(lineCount({ offset: 140, shown: 22, total: 152 }), '141-152/152');
});

test('a note above the text takes a row from the count, not from the file', () => {
  assert.strictEqual(lineCount({ offset: 0, shown: 21, total: 152 }), '1-21/152');
});

test('a file with nothing in it has no lines to count', () => {
  assert.strictEqual(lineCount({ offset: 0, shown: 22, total: 0 }), '');
});
