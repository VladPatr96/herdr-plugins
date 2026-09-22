'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { resolveStartDir } = require('../lib/start-dir');

const PANES = [
  { pane_id: 'w8:p1', cwd: 'D:\\projects\\alpha', workspace_id: 'w8', focused: false },
  { pane_id: 'w8:p2', cwd: 'D:\\projects\\beta', workspace_id: 'w8', focused: true },
];

test('the folder is the one the key was pressed in', () => {
  const dir = resolveStartDir({ paneId: 'w8:p1', panes: PANES, fallback: 'C:\\fallback' });
  assert.strictEqual(dir, 'D:\\projects\\alpha');
});

test('an unknown pane falls back to the focused pane of the workspace', () => {
  const dir = resolveStartDir({ paneId: 'w8:p9', panes: PANES, workspace: 'w8', fallback: 'C:\\fallback' });
  assert.strictEqual(dir, 'D:\\projects\\beta');
});

test('the context folder is used when herdr lists no panes', () => {
  const dir = resolveStartDir({
    panes: [],
    context: { focused_pane_cwd: 'D:\\projects\\gamma', workspace_cwd: 'D:\\projects' },
    fallback: 'C:\\fallback',
  });
  assert.strictEqual(dir, 'D:\\projects\\gamma');
});

test('the workspace folder is used when no pane folder is known', () => {
  const dir = resolveStartDir({ panes: [], context: { workspace_cwd: 'D:\\projects' }, fallback: 'C:\\fallback' });
  assert.strictEqual(dir, 'D:\\projects');
});

test('an empty cwd is not a folder', () => {
  const dir = resolveStartDir({
    paneId: 'w8:p1',
    panes: [{ pane_id: 'w8:p1', cwd: '' }],
    context: { workspace_cwd: 'D:\\projects' },
    fallback: 'C:\\fallback',
  });
  assert.strictEqual(dir, 'D:\\projects');
});

test('knowing nothing at all leaves the fallback', () => {
  assert.strictEqual(resolveStartDir({ fallback: 'C:\\fallback' }), 'C:\\fallback');
});

test('a focused pane in another workspace is not ours', () => {
  const dir = resolveStartDir({
    paneId: 'w9:p1',
    panes: PANES,
    workspace: 'w9',
    context: { workspace_cwd: 'D:\\projects' },
    fallback: 'C:\\fallback',
  });
  assert.strictEqual(dir, 'D:\\projects');
});

// The pane command is `node bin/board.js`, a path relative to the plugin root.
// Herdr resolves it against the pane's working directory, so the opener must
// not move that directory — the folder to show travels in the environment.
const { boardRoot } = require('../lib/start-dir');

test('the board shows the folder the opener put in the environment', () => {
  assert.strictEqual(boardRoot({ FILE_BOARD_ROOT: 'D:\\projects\\alpha' }, 'C:\\plugin'), 'D:\\projects\\alpha');
});

test('with nothing in the environment the board shows its own working directory', () => {
  assert.strictEqual(boardRoot({}, 'C:\\plugin'), 'C:\\plugin');
});

test('an empty variable is not a folder', () => {
  assert.strictEqual(boardRoot({ FILE_BOARD_ROOT: '' }, 'C:\\plugin'), 'C:\\plugin');
});
