#!/usr/bin/env node
'use strict';

// The board itself: a pane that draws a tree, shows what is inside a file and
// hands the file to nvim when you mean to change it.
//
// It takes no arguments. The folder it opens is the pane's own working
// directory, which the opener set with `--cwd`, so nothing here depends on the
// plugin context arriving filled in — on Windows it may not.

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { resolveDir } = require('../lib/runtime');
const { createTree, rows, toggle, setShowHidden } = require('../lib/rows');
const { boardRoot } = require('../lib/start-dir');
const { openFile, MAX_LINES } = require('../lib/view');
const { rowSegments, fit, fitEnd, scrollTo, lineCount } = require('../lib/render');
const { line: paint, wrap, shift, colorEnabled, styleFor } = require('../lib/paint');
const { languageFor, highlight } = require('../lib/syntax');
const { actionsFor } = require('../lib/keys');
const { editorCommand } = require('../lib/editor');

// Asked once: whether the terminal wants colour is not going to change while
// the board is up, and every row of every frame would otherwise ask again.
const COLOR = colorEnabled(process.env);

// Resolved once, when the board starts: the answer involves asking the system
// where nvim is, and that is not worth doing on every keypress.
const EDITOR = editorCommand(process.env);

const out = process.stdout;
const root = resolveDir(boardRoot(process.env, process.cwd()));
const tree = createTree(root);

const state = {
  mode: 'tree', // 'tree' | 'view'
  cursor: 0,
  offset: 0,
  rows: rows(tree),
  // A long line is worth more than a tidy column of numbers, so wrapping starts
  // on. `w` turns it off for a file where the indentation is the point.
  wrap: true,
  file: null, // { path, view, painted, offset, column, shown }
  message: '',
};

const size = () => ({ width: out.columns || 80, height: out.rows || 24 });

// Declared here because the terminal helpers below attach and detach it, and
// the key handlers it calls are defined further down.
function onKeys(chunk) {
  let changed = false;
  for (const action of actionsFor(chunk.toString('utf8'))) {
    if (action !== 'quit') state.message = '';
    // Each press is applied in turn; the frame is drawn once at the end, so a
    // held key does not repaint the pane for every repeat.
    if (state.mode === 'view' ? onViewKey(action) : onTreeKey(action)) changed = true;
  }
  if (changed) draw();
}

function refreshRows(keepPath) {
  state.rows = rows(tree);
  if (keepPath) {
    const at = state.rows.findIndex((row) => row.path === keepPath);
    if (at >= 0) state.cursor = at;
  }
  state.cursor = Math.min(Math.max(0, state.cursor), Math.max(0, state.rows.length - 1));
}

// ── drawing ────────────────────────────────────────────────────────────────

// Where you are, and how far through it you are. In the tree that is the row
// under the cursor out of all of them; in a file, the lines on screen out of
// the whole file — the thing a scrollbar would say if a pane had one.
function counter() {
  if (state.mode === 'view') {
    // `shown` is settled by the drawing, which the frame does first: with
    // wrapping on, how many lines of the file fit is not a property of the
    // pane's height but of the lines themselves.
    const count = lineCount({
      offset: state.file.offset,
      shown: state.file.shown,
      total: state.file.view.lines.length,
    });
    // A pane driven sideways otherwise looks like a file that begins in the
    // middle of a word.
    return state.file.column > 0 ? `${count} ▸${state.file.column}` : count;
  }
  return state.rows.length === 0 ? '' : `${state.cursor + 1}/${state.rows.length}`;
}

function header(width) {
  // A file is named relative to the root the board opened on: the part of the
  // path the header shares with every other file is not worth the columns.
  const where = state.mode === 'view' ? path.relative(root, state.file.path) || state.file.path : root;
  const count = counter();
  // The leading space is the gap: a path long enough to be cut fills its side
  // exactly, and without it the counter would run straight on from the name.
  const right = count ? ` ${count} ` : '';
  // The counter only earns its place if a useful amount of the path survives.
  const room = width - right.length >= 12 ? width - right.length : width;
  const text = ` ${fitEnd(where, Math.max(0, room - 1))}${room === width ? '' : right}`;
  return `\u001b[7m${fit(text, width)}\u001b[0m`;
}

function footer(width) {
  if (state.message) return `\u001b[2m${fit(` ${state.message}`, width)}\u001b[0m`;
  // Sideways is only offered when there is somewhere sideways to go.
  const hints =
    state.mode === 'view'
      ? state.wrap
        ? 'j/k scroll · w nowrap · e nvim · Esc back · q close'
        : 'j/k scroll · ←/→ sideways · w wrap · e nvim · Esc back · q close'
      : 'j/k move · Enter open · e nvim · . hidden · r refresh · q close';
  return `\u001b[2m${fit(` ${hints}`, width)}\u001b[0m`;
}

function treeLines(width, height) {
  state.offset = scrollTo({ cursor: state.cursor, offset: state.offset, height, total: state.rows.length });
  const lines = [];
  for (let i = 0; i < height; i += 1) {
    const row = state.rows[state.offset + i];
    if (!row) {
      lines.push(' '.repeat(width));
      continue;
    }
    const segments = rowSegments(row);
    const selected = state.offset + i === state.cursor;
    // The cursor row drops its own colours and goes inverse instead. Colour
    // under a reversed background is a guess about the theme; inverse is not.
    lines.push(
      selected
        ? `\u001b[7m${paint(segments, width, { color: false })}\u001b[0m`
        : paint(segments, width, { color: COLOR }),
    );
  }
  if (state.rows.length === 0) lines[0] = fit('  (empty folder)', width);
  return lines;
}

function noteFor(view) {
  if (view.kind === 'binary') return '(binary file — read only)';
  if (view.kind === 'too-big') return `(${Math.round(view.bytes / 1024)} KiB — too big to show)`;
  if (view.kind === 'too-long') return `(showing the first ${MAX_LINES} of ${view.totalLines} lines)`;
  if (view.kind === 'unreadable') return '(cannot be read)';
  return null;
}

// The number column. Its width follows the file, so a short file does not pay
// for a long one's margin, and it never shrinks while you scroll — the text
// would shift sideways under the cursor. A wrapped line keeps the bar and
// loses the number: the number is where a line starts, and a continuation is
// not a start.
function gutter(number, digits) {
  const label = number === null ? ' '.repeat(digits) : String(number).padStart(digits);
  return { text: ` ${label} │ `, sgr: styleFor('guide') };
}

function marginWidth(digits) {
  return digits + 4;
}

// How many rows of the pane the file itself gets. A note about the file takes
// the top row, and the scrolling has to know: counting by the height of the
// pane instead puts the last line of a long file one row below the bottom,
// where it can never be scrolled to.
function textRows(height, view) {
  return height - (noteFor(view) ? 1 : 0);
}

function viewLines(width, height) {
  const { view, painted } = state.file;
  const body = view.lines;
  const note = noteFor(view);
  const room = textRows(height, view);
  state.file.offset = scrollTo({
    cursor: state.file.offset,
    offset: state.file.offset,
    // With wrapping on, how many lines fill the pane depends on the lines, so
    // there is no screenful to clamp the end to. Any line may sit at the top
    // instead — otherwise a file of long lines keeps its last one out of reach.
    height: state.wrap ? 1 : room,
    total: Math.max(body.length, 1),
  });

  const digits = String(Math.max(body.length, 1)).length;
  const text = Math.max(1, width - marginWidth(digits));
  const lines = [];
  if (note) lines.push(paint([{ text: ` ${note}`, sgr: '33' }], width, { color: COLOR }));

  let shown = 0;
  for (let at = state.file.offset; at < body.length && lines.length < height; at += 1) {
    const pieces = state.wrap ? wrap(painted[at], text) : [shift(painted[at], state.file.column)];
    for (let piece = 0; piece < pieces.length && lines.length < height; piece += 1) {
      const head = gutter(piece === 0 ? at + 1 : null, digits);
      lines.push(paint([head, ...pieces[piece]], width, { color: COLOR }));
    }
    shown += 1;
  }
  state.file.shown = shown;

  while (lines.length < height) lines.push(' '.repeat(width));
  return lines;
}

function draw() {
  const { width, height } = size();
  const body = Math.max(1, height - 2);
  // The body is drawn before the header, which reads what the drawing settled:
  // how far the file scrolled, and how much of it ended up on screen.
  const lines = state.mode === 'view' ? viewLines(width, body) : treeLines(width, body);
  // One write per frame: a pane redrawn line by line flickers.
  out.write(`\u001b[H${[header(width), ...lines, footer(width)].join('\r\n')}`);
}

// ── the terminal ───────────────────────────────────────────────────────────

// Reading the keyboard is started and stopped as a whole. Pausing alone is not
// enough around a child process: with the listener still attached, the tty
// stream does not come back to life after the child gives the terminal up, and
// the board goes deaf while still drawing.
function startReading() {
  process.stdin.ref();
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('data', onKeys);
  process.stdin.resume();
}

// Order matters on Windows: leave raw mode while the stream is still live,
// then stop it. Pausing first and switching the mode afterwards re-arms the
// reader, and it goes on eating keys that were meant for the child process.
function stopReading() {
  process.stdin.off('data', onKeys);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdin.unref();
}

function enterScreen() {
  out.write('\u001b[?1049h\u001b[?25l\u001b[2J');
  startReading();
}

function leaveScreen() {
  stopReading();
  out.write('\u001b[?25h\u001b[?1049l');
}

function quit() {
  leaveScreen();
  process.exit(0);
}

// ── actions ────────────────────────────────────────────────────────────────

function show(file) {
  const view = openFile(file);
  // Highlighted once, when the file opens: a block comment that starts on line
  // ten colours line eleven, so the answer for a screenful depends on the lines
  // above it. At 5000 lines — the viewer's ceiling — doing it per frame instead
  // would cost a full pass on every keypress.
  const painted = highlight(view.lines, languageFor(file));
  state.file = { path: file, view, painted, offset: 0, column: 0, shown: 0 };
  state.mode = 'view';
  state.message = '';
}

function edit(file) {
  // nvim wants the pane to itself: leave raw mode and the alternate screen,
  // let it run on the same PTY, then take the screen back when it exits.
  leaveScreen();
  const result = spawnSync(EDITOR, [file], { stdio: 'inherit', windowsHide: true });
  enterScreen();
  if (result.error) {
    state.message =
      result.error.code === 'ENOENT'
        ? `${EDITOR} is not on PATH — install it, or set FILE_BOARD_EDITOR`
        : `${EDITOR}: ${result.error.message}`;
  } else if (state.mode === 'view') {
    // The file may have changed under us; read it again rather than show a
    // stale copy.
    show(file);
  }
  refreshRows(state.rows[state.cursor]?.path);
}

function current() {
  return state.rows[state.cursor] || null;
}

function moveTo(index) {
  if (state.rows.length === 0) return;
  state.cursor = Math.min(Math.max(0, index), state.rows.length - 1);
}

function onTreeKey(action) {
  const row = current();
  const { height } = size();
  const page = Math.max(1, height - 3);

  switch (action) {
    case 'down':
      moveTo(state.cursor + 1);
      break;
    case 'up':
      moveTo(state.cursor - 1);
      break;
    case 'page-down':
      moveTo(state.cursor + page);
      break;
    case 'page-up':
      moveTo(state.cursor - page);
      break;
    case 'top':
      moveTo(0);
      break;
    case 'bottom':
      moveTo(state.rows.length - 1);
      break;
    case 'open':
    case 'enter':
      if (!row) break;
      if (row.isDirectory) {
        toggle(tree, row.path);
        refreshRows(row.path);
      } else {
        show(row.path);
      }
      break;
    case 'close':
      if (!row) break;
      if (row.isDirectory && row.expanded) {
        toggle(tree, row.path);
        refreshRows(row.path);
      } else {
        // Step out to the folder this row lives in.
        const parent = state.rows.findIndex((candidate) => candidate.path === path.dirname(row.path));
        if (parent >= 0) moveTo(parent);
      }
      break;
    case 'edit':
      if (row && !row.isDirectory) edit(row.path);
      break;
    case 'hidden':
      setShowHidden(tree, !tree.showHidden);
      refreshRows(row?.path);
      break;
    case 'refresh':
      refreshRows(row?.path);
      state.message = '';
      break;
    case 'quit':
      quit();
      break;
    default:
      return false;
  }
  return true;
}

function onViewKey(action) {
  const { width, height } = size();
  const page = Math.max(1, height - 3);
  const last = Math.max(0, state.file.view.lines.length - 1);

  switch (action) {
    case 'down':
      state.file.offset = Math.min(state.file.offset + 1, last);
      break;
    case 'up':
      state.file.offset = Math.max(state.file.offset - 1, 0);
      break;
    case 'page-down':
      state.file.offset = Math.min(state.file.offset + page, last);
      break;
    case 'page-up':
      state.file.offset = Math.max(state.file.offset - page, 0);
      break;
    case 'top':
      state.file.offset = 0;
      break;
    case 'bottom':
      state.file.offset = last;
      break;
    case 'edit':
      edit(state.file.path);
      break;
    case 'refresh':
      show(state.file.path);
      break;
    case 'wrap':
      state.wrap = !state.wrap;
      // Wrapping puts the whole line on screen, so whatever it was shifted by
      // is no longer meaningful — and would be a surprise on the way back.
      state.file.column = 0;
      break;
    case 'open':
      if (state.wrap) return false;
      state.file.column += Math.max(1, Math.floor(width / 2));
      break;
    case 'close':
      // The same step out as in the tree: sideways while there is a left to go
      // back to, and out of the file once there is not.
      if (!state.wrap && state.file.column > 0) {
        state.file.column = Math.max(0, state.file.column - Math.max(1, Math.floor(width / 2)));
        break;
      }
      state.mode = 'tree';
      state.file = null;
      break;
    case 'back':
      state.mode = 'tree';
      state.file = null;
      break;
    case 'quit':
      quit();
      break;
    default:
      return false;
  }
  return true;
}

// ── running ────────────────────────────────────────────────────────────────

out.on('resize', draw);
process.on('exit', leaveScreen);
process.on('SIGINT', quit);
process.on('SIGTERM', quit);

enterScreen();
draw();
