'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { languageFor, highlight } = require('../lib/syntax');
const { styleFor } = require('../lib/paint');

// The colour a given piece of text came out as. Asserting on this rather than
// on segment boundaries keeps the tests about what a reader sees, so splitting
// a token differently does not break them.
function styleOf(segments, needle) {
  const found = segments.find((segment) => segment.text.includes(needle));
  return found ? found.sgr : null;
}

function one(line, language, previous) {
  return highlight(previous ? [...previous, line] : [line], language).pop();
}

test('a file is matched to a language by its extension', () => {
  assert.strictEqual(languageFor('board.js'), 'c-like');
  assert.strictEqual(languageFor('package.json'), 'json');
  assert.strictEqual(languageFor('herdr-plugin.toml'), 'toml');
  assert.strictEqual(languageFor('README.md'), 'markdown');
  assert.strictEqual(languageFor('install.sh'), 'shell');
  assert.strictEqual(languageFor('main.py'), 'python');
});

test('a file in no language the board knows is left alone', () => {
  assert.strictEqual(languageFor('notes.xyz'), null);
  const [segments] = highlight(['whatever this is'], null);
  assert.deepStrictEqual(segments, [{ text: 'whatever this is', sgr: '' }]);
});

test('a line with nothing in it still comes back as a line', () => {
  assert.deepStrictEqual(highlight([''], 'c-like'), [[{ text: '', sgr: '' }]]);
});

test('a comment is dimmed to the end of the line', () => {
  const segments = one('const x = 1; // why', 'c-like');
  assert.strictEqual(styleOf(segments, '// why'), styleFor('comment'));
});

test('what looks like a comment inside a string is still a string', () => {
  const segments = one("const url = 'http://example.com';", 'c-like');
  assert.strictEqual(styleOf(segments, 'http://example.com'), styleFor('string'));
});

test('a quote inside a string does not end it when it is escaped', () => {
  const segments = one("const s = 'it\\'s here'; // after", 'c-like');
  assert.strictEqual(styleOf(segments, '// after'), styleFor('comment'));
});

test('a keyword is coloured and a name that merely contains one is not', () => {
  const segments = one('function constant() {}', 'c-like');
  assert.strictEqual(styleOf(segments, 'function'), styleFor('keyword'));
  assert.strictEqual(styleOf(segments, 'constant'), '');
});

test('a number is coloured, and a number inside a name is not', () => {
  assert.strictEqual(styleOf(one('const x = 42;', 'c-like'), '42'), styleFor('number'));
  assert.strictEqual(styleOf(one('const utf8 = y;', 'c-like'), 'utf8'), '');
});

test('a block comment runs on until it is closed', () => {
  const lines = highlight(['/* opens', 'still inside', 'closes */ const x = 1;'], 'c-like');
  assert.strictEqual(styleOf(lines[1], 'still inside'), styleFor('comment'));
  assert.strictEqual(styleOf(lines[2], 'closes */'), styleFor('comment'));
  assert.strictEqual(styleOf(lines[2], 'const'), styleFor('keyword'));
});

test('a json key is told apart from a string value', () => {
  const segments = one('  "name": "file-board",', 'json');
  assert.strictEqual(styleOf(segments, '"name"'), styleFor('key'));
  assert.strictEqual(styleOf(segments, '"file-board"'), styleFor('string'));
});

test('a toml section stands out from the keys under it', () => {
  assert.strictEqual(styleOf(one('[plugin]', 'toml'), '[plugin]'), styleFor('key'));
  assert.strictEqual(styleOf(one('name = "board"', 'toml'), 'name'), styleFor('key'));
  assert.strictEqual(styleOf(one('# a note', 'toml'), '# a note'), styleFor('comment'));
});

test('a markdown heading is a heading and a bullet is a bullet', () => {
  assert.strictEqual(styleOf(one('## Keys', 'markdown'), '## Keys'), styleFor('heading'));
  assert.strictEqual(styleOf(one('- a point', 'markdown'), '-'), styleFor('keyword'));
});

test('a fenced block in markdown stays code until the fence closes', () => {
  const lines = highlight(['```sh', 'npm test', '```', 'back to prose'], 'markdown');
  assert.strictEqual(styleOf(lines[1], 'npm test'), styleFor('string'));
  assert.strictEqual(styleOf(lines[3], 'back to prose'), '');
});

test('inline code in markdown is marked without eating the words around it', () => {
  const segments = one('run `npm test` first', 'markdown');
  assert.strictEqual(styleOf(segments, '`npm test`'), styleFor('string'));
  assert.strictEqual(styleOf(segments, 'first'), '');
});

test('a shell comment is a comment and its keywords are keywords', () => {
  assert.strictEqual(styleOf(one('# build it', 'shell'), '# build it'), styleFor('comment'));
  assert.strictEqual(styleOf(one('if [ -f x ]; then', 'shell'), 'if'), styleFor('keyword'));
});

test('highlighting never changes the text, only how it is coloured', () => {
  const source = ['const x = "a"; // note', '/* block', 'inside */', '- bullet `code`'];
  for (const language of ['c-like', 'json', 'toml', 'markdown', 'shell', 'python', null]) {
    const painted = highlight(source, language);
    assert.deepStrictEqual(
      painted.map((segments) => segments.map((segment) => segment.text).join('')),
      source,
      `${language} changed the text`,
    );
  }
});
