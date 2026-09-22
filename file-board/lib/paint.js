'use strict';

// Colour, and the arithmetic that keeps it from breaking the frame.
//
// A pane line is described as segments — `{ text, sgr }` — and assembled here,
// in the one place that knows the difference between a column the reader sees
// and a byte that went down the wire. Colour codes are zero columns wide; a
// `fit`-style helper that measured `line.length` would count them and cut the
// row in the wrong place, which is how a coloured TUI ends up with a frame that
// walks sideways.

const path = require('node:path');

// Standard ANSI 16 only: the terminal supplies the actual shades, so the board
// follows the theme herdr is running under instead of arguing with it.
const STYLES = {
  directory: '1;34',
  code: '33',
  script: '32',
  data: '36',
  text: '',
  media: '35',
  binary: '31',
  noise: '2',
  guide: '2',

  // Inside a file rather than beside it. Same sixteen colours, same reason:
  // four kinds of token is as much as a pane can show before the highlighting
  // becomes the thing you are reading.
  comment: '2',
  string: '32',
  number: '36',
  keyword: '35',
  key: '34',
  heading: '1;36',
};

// Extension → group. Data, not code: a file type nobody thought of is one more
// entry here and nothing else. `paint.test.js` fails if an extension lands in
// two groups.
const GROUPS = {
  code: [
    'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'rs', 'go', 'c', 'h', 'cpp', 'hpp', 'cs',
    'java', 'kt', 'rb', 'php', 'lua', 'swift', 'vue', 'svelte', 'html', 'css', 'scss',
  ],
  script: ['sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'bat', 'cmd'],
  data: ['json', 'toml', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'xml', 'csv', 'tsv', 'sql'],
  text: ['md', 'markdown', 'txt', 'rst', 'adoc', 'log', 'pdf'],
  media: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico', 'mp4', 'mkv', 'mov', 'mp3', 'wav', 'flac', 'ttf', 'otf', 'woff', 'woff2'],
  binary: ['exe', 'dll', 'so', 'dylib', 'node', 'wasm', 'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'jar', 'bin', 'o', 'a', 'lib', 'pdb'],
};

const BY_EXTENSION = new Map();
for (const [group, extensions] of Object.entries(GROUPS)) {
  for (const extension of extensions) BY_EXTENSION.set(extension, group);
}

// Files that are generated, not written. They are the bulk of a repository's
// row count and almost never what anyone is looking for, so they get out of the
// way rather than compete for attention.
const NOISE_NAMES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'go.sum']);
const NOISE_SUFFIXES = ['.lock', '.map', '.min.js', '.min.css'];

function groupFor(name, isDirectory) {
  if (isDirectory) return 'directory';
  if (NOISE_NAMES.has(name)) return 'noise';
  if (NOISE_SUFFIXES.some((suffix) => name.endsWith(suffix))) return 'noise';
  // A dotfile is configuration for a tool, not the work itself.
  if (name.startsWith('.')) return 'noise';
  const extension = path.extname(name).slice(1).toLowerCase();
  return BY_EXTENSION.get(extension) ?? 'text';
}

function styleFor(group) {
  return STYLES[group] ?? '';
}

// `NO_COLOR` is the convention every other terminal tool honours; the plugin's
// own switch is there for a terminal that lies about what it can do.
function colorEnabled(env) {
  if (env.NO_COLOR) return false;
  if (env.FILE_BOARD_COLOR === '0') return false;
  return true;
}

// Exactly `width` visible columns, always: padded if the segments fall short,
// cut with an ellipsis if they run over. A segment that begins past the right
// edge is dropped whole — writing its colour code and no text would leave the
// terminal in that colour for whatever the next frame puts there.
function line(segments, width, { color = true } = {}) {
  if (width <= 0) return '';
  const out = [];
  let used = 0;
  for (const segment of segments) {
    if (used >= width) break;
    const room = width - used;
    const text = segment.text.length > room ? `${segment.text.slice(0, room - 1)}…` : segment.text;
    if (text === '') continue;
    out.push(color && segment.sgr ? `\u001b[${segment.sgr}m${text}\u001b[0m` : text);
    used += text.length;
  }
  if (used < width) out.push(' '.repeat(width - used));
  return out.join('');
}

// A range of visible columns, cut out of the segments that cover it. A cut
// landing inside a coloured piece leaves both halves coloured; an empty result
// still comes back as a row, because the caller has a row of the pane to fill.
function slice(segments, from, to) {
  const out = [];
  let at = 0;
  for (const segment of segments) {
    const start = at;
    at += segment.text.length;
    if (at <= from) continue;
    if (start >= to) break;
    const text = segment.text.slice(Math.max(0, from - start), Math.min(segment.text.length, to - start));
    if (text !== '') out.push({ text, sgr: segment.sgr });
  }
  return out.length > 0 ? out : [{ text: '', sgr: '' }];
}

// One line of a file across as many rows of the pane as it needs. The break
// goes after the last space that fits, so words stay whole; a run with no space
// in it — a path, a long identifier, a base64 blob — is cut where the pane ends,
// because the alternative is a row with nothing on it.
function wrap(segments, width) {
  if (width <= 0) return [segments];
  const text = segments.map((segment) => segment.text).join('');
  if (text.length <= width) return [segments];

  const rows = [];
  let at = 0;
  while (text.length - at > width) {
    // One character past the edge, so a space sitting exactly on the boundary
    // is seen as a place to break rather than pushed to the next row.
    const space = text.slice(at, at + width + 1).lastIndexOf(' ');
    const end = space > 0 ? at + space : at + width;
    rows.push(slice(segments, at, end));
    at = space > 0 ? end + 1 : end;
  }
  rows.push(slice(segments, at, text.length));
  return rows;
}

// The same line seen from `columns` to the right. Used when wrapping is off and
// the pane is driven sideways instead.
function shift(segments, columns) {
  if (columns <= 0) return segments;
  return slice(segments, columns, Infinity);
}

module.exports = { line, wrap, shift, groupFor, styleFor, colorEnabled, GROUPS, STYLES };
