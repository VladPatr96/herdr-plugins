#!/usr/bin/env node
'use strict';

// The action behind the hotkey. It works out which folder the person is looking
// at, then asks herdr for a split next to them with that folder as the pane's
// cwd — so the board itself needs no context and no arguments.
//
// A second press focuses the board already open in this workspace instead of
// stacking another one.

const path = require('node:path');
const { stateDir, readJson, writeJsonAtomic, herdr } = require('../lib/runtime');
const { resolveStartDir } = require('../lib/start-dir');

const PLUGIN_ID = process.env.HERDR_PLUGIN_ID || 'vladpatr96.file-board';
const PANE_TITLE = 'Files';

function openPaneFile() {
  return path.join(stateDir(), 'side-pane.json');
}

function panes() {
  try {
    return herdr(['pane', 'list'])?.result?.panes ?? [];
  } catch {
    return [];
  }
}

function context() {
  try {
    return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || '{}');
  } catch {
    return {};
  }
}

// Where the person pressing the key actually is: a board open in another
// workspace is invisible to them and must not satisfy this request.
function currentWorkspace(ctx) {
  if (process.env.HERDR_WORKSPACE_ID) return process.env.HERDR_WORKSPACE_ID;
  if (ctx.workspace_id) return ctx.workspace_id;
  try {
    return herdr(['pane', 'current'])?.result?.pane?.workspace_id || null;
  } catch {
    return null;
  }
}

// herdr hands an action the caller's pane, so a hotkey pressed next to any
// agent splits right there.
function callerPane(ctx) {
  return process.env.HERDR_PANE_ID || ctx.focused_pane_id || null;
}

function remembered(workspace) {
  const saved = readJson(openPaneFile())?.byWorkspace;
  return (saved && workspace && saved[workspace]) || null;
}

function remember(workspace, paneId) {
  const saved = readJson(openPaneFile())?.byWorkspace || {};
  if (workspace) saved[workspace] = paneId;
  writeJsonAtomic(openPaneFile(), { byWorkspace: saved, updatedAt: new Date().toISOString() });
}

function existingPane(workspace) {
  const here = panes().filter((pane) => !workspace || pane.workspace_id === workspace);
  const saved = remembered(workspace);
  if (saved && here.some((pane) => pane.pane_id === saved)) return saved;
  return here.find((pane) => pane.label === PANE_TITLE)?.pane_id || null;
}

function open() {
  const ctx = context();
  const workspace = currentWorkspace(ctx);

  const found = existingPane(workspace);
  if (found) {
    try {
      herdr(['plugin', 'pane', 'focus', found]);
      remember(workspace, found);
      return;
    } catch {
      // herdr forgets which plugin owns a pane when the plugin is relinked;
      // such a pane can no longer be focused, so open a fresh one beside it.
    }
  }

  const paneId = callerPane(ctx);
  const cwd = resolveStartDir({
    paneId,
    panes: panes(),
    workspace,
    context: ctx,
    fallback: process.cwd(),
  });

  // A split has to be cut from an existing pane: herdr refuses `--workspace`
  // here ("split and zoomed plugin panes target an existing pane").
  const args = ['plugin', 'pane', 'open', '--plugin', PLUGIN_ID, '--entrypoint', 'board', '--direction', 'right'];
  if (paneId) args.push('--target-pane', paneId);
  // Not `--cwd`: the pane command is `node bin/board.js`, relative to the
  // plugin root, and herdr resolves it against the pane's working directory.
  // Moving that directory to the folder being browsed kills the pane before it
  // draws anything. The folder goes in the environment instead.
  if (cwd) args.push('--env', `FILE_BOARD_ROOT=${cwd}`);
  // The board is a pane, and panes do not inherit the plugin state dir.
  if (process.env.HERDR_PLUGIN_STATE_DIR) {
    args.push('--env', `HERDR_PLUGIN_STATE_DIR=${process.env.HERDR_PLUGIN_STATE_DIR}`);
  }

  const opened = herdr(args)?.result?.plugin_pane?.pane?.pane_id;
  if (opened) remember(workspace, opened);
}

try {
  open();
} catch (error) {
  process.stderr.write(`file-board: could not open the board: ${error.message}\n`);
  process.exitCode = 1;
}
