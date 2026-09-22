'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { line, wrap, shift, groupFor, styleFor, colorEnabled, GROUPS } = require('../lib/paint');

// What the pane actually prints, with the colour codes taken back out. Every
// width claim in this file is about what a reader sees, never about how many
// bytes went down the wire.
function visible(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

test('a short line is padded out to the full width', () => {
  assert.strictEqual(line([{ text: 'abc', sgr: '' }], 6), 'abc   ');
});

test('a long line is cut and the cut is marked', () => {
  assert.strictEqual(line([{ text: 'abcdefgh', sgr: '' }], 4), 'abc…');
});

test('colour codes do not count towards the width', () => {
  const painted = line([{ text: 'src', sgr: '1;34' }, { text: '/app.js', sgr: '33' }], 20);
  assert.strictEqual(visible(painted).length, 20);
  assert.ok(painted.includes('\u001b[1;34m'));
});

test('a coloured line too wide for the pane is still exactly the pane wide', () => {
  const painted = line([{ text: 'components', sgr: '1;34' }, { text: '/Button.tsx', sgr: '33' }], 8);
  assert.strictEqual(visible(painted).length, 8);
  assert.ok(visible(painted).endsWith('…'));
});

test('a segment that starts past the right edge is dropped, not printed', () => {
  const painted = line([{ text: 'abcdef', sgr: '' }, { text: 'ghi', sgr: '31' }], 4);
  assert.ok(!painted.includes('ghi'));
  assert.ok(!painted.includes('\u001b[31m'));
});

test('with colour off nothing but the text is written', () => {
  const painted = line([{ text: 'app.js', sgr: '33' }], 10, { color: false });
  assert.strictEqual(painted, 'app.js    ');
});

test('a pane with no room prints nothing', () => {
  assert.strictEqual(line([{ text: 'app.js', sgr: '33' }], 0), '');
});

test('a folder is a folder whatever it is called', () => {
  assert.strictEqual(groupFor('node_modules', true), 'directory');
  assert.strictEqual(groupFor('.github', true), 'directory');
});

test('a file is grouped by what kind of file it is', () => {
  assert.strictEqual(groupFor('board.js', false), 'code');
  assert.strictEqual(groupFor('install.ps1', false), 'script');
  assert.strictEqual(groupFor('herdr-plugin.toml', false), 'data');
  assert.strictEqual(groupFor('README.md', false), 'text');
  assert.strictEqual(groupFor('logo.png', false), 'media');
  assert.strictEqual(groupFor('node.exe', false), 'binary');
});

test('an extension nobody listed reads as plain text, not as an error', () => {
  assert.strictEqual(groupFor('LICENSE', false), 'text');
  assert.strictEqual(groupFor('notes.xyz', false), 'text');
});

test('the case of the extension does not matter', () => {
  assert.strictEqual(groupFor('LOGO.PNG', false), 'media');
});

test('machinery is dimmed: lockfiles, source maps and dotfiles', () => {
  assert.strictEqual(groupFor('package-lock.json', false), 'noise');
  assert.strictEqual(groupFor('board.js.map', false), 'noise');
  assert.strictEqual(groupFor('.gitignore', false), 'noise');
});

test('no extension is claimed by two groups at once', () => {
  const seen = new Set();
  for (const [group, extensions] of Object.entries(GROUPS)) {
    for (const extension of extensions) {
      assert.ok(!seen.has(extension), `${extension} is in two groups, the second is ${group}`);
      seen.add(extension);
    }
  }
});

test('every group has a style, so no group can be added without a colour', () => {
  for (const group of [...Object.keys(GROUPS), 'directory', 'noise', 'text']) {
    assert.strictEqual(typeof styleFor(group), 'string');
  }
});

test('NO_COLOR turns the colour off, as it does everywhere else', () => {
  assert.strictEqual(colorEnabled({}), true);
  assert.strictEqual(colorEnabled({ NO_COLOR: '1' }), false);
  assert.strictEqual(colorEnabled({ FILE_BOARD_COLOR: '0' }), false);
});

// ── wrapping and sliding sideways ──────────────────────────────────────────

function textOf(segments) {
  return segments.map((segment) => segment.text).join('');
}

test('a line that fits comes back as the one row it already was', () => {
  const segments = [{ text: 'short', sgr: '33' }];
  assert.deepStrictEqual(wrap(segments, 20), [segments]);
});

test('a line breaks at the last space that fits, not in the middle of a word', () => {
  const rows = wrap([{ text: 'the quick brown fox jumps', sgr: '' }], 12);
  assert.deepStrictEqual(rows.map(textOf), ['the quick', 'brown fox', 'jumps']);
});

test('a run with no space in it is cut where the pane ends', () => {
  const rows = wrap([{ text: 'aaaaaaaaaaaaaaa', sgr: '' }], 6);
  assert.deepStrictEqual(rows.map(textOf), ['aaaaaa', 'aaaaaa', 'aaa']);
});

test('no row is wider than the pane', () => {
  const rows = wrap([{ text: 'a bb ccc dddddddddddd ee', sgr: '' }], 7);
  for (const row of rows) assert.ok(textOf(row).length <= 7, `${textOf(row)} is too wide`);
});

test('a break inside a coloured piece leaves both halves coloured', () => {
  const rows = wrap([{ text: 'keep ', sgr: '' }, { text: 'red red red', sgr: '31' }], 10);
  assert.deepStrictEqual(rows.map(textOf), ['keep red', 'red red']);
  assert.strictEqual(rows[1][0].sgr, '31');
});

test('an empty line is one row, not none', () => {
  assert.deepStrictEqual(wrap([{ text: '', sgr: '' }], 10), [[{ text: '', sgr: '' }]]);
});

test('wrapping loses nothing but the spaces it broke on', () => {
  const source = 'one two three four five six seven eight';
  const rows = wrap([{ text: source, sgr: '' }], 9);
  assert.strictEqual(rows.map(textOf).join(' '), source);
});

test('sliding sideways drops columns from the left', () => {
  const moved = shift([{ text: 'abcdefgh', sgr: '' }], 3);
  assert.strictEqual(textOf(moved), 'defgh');
});

test('sliding lands mid-piece and the piece keeps its colour', () => {
  const moved = shift([{ text: 'abc', sgr: '' }, { text: 'defgh', sgr: '32' }], 4);
  assert.strictEqual(textOf(moved), 'efgh');
  assert.strictEqual(moved[0].sgr, '32');
});

test('sliding past the end of the line leaves an empty row, not nothing', () => {
  const moved = shift([{ text: 'abc', sgr: '31' }], 99);
  assert.deepStrictEqual(moved, [{ text: '', sgr: '' }]);
});

test('not sliding at all leaves the line exactly as it was', () => {
  const segments = [{ text: 'abc', sgr: '31' }];
  assert.strictEqual(shift(segments, 0), segments);
});
