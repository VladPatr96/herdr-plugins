#!/usr/bin/env node
'use strict';

// Opens the board. A plugin action cannot open its own pane declaratively, so
// it asks Herdr through HERDR_BIN_PATH, which works the same over a Unix
// socket and a Windows named pipe.
//
//   node bin/open.js          overlay over the active pane, closes back to it
//   node bin/open.js side     a split to the right, next to the agents
//
// The split is an ordinary Herdr pane and outlives the command that opened it,
// so a second call focuses the one already open instead of stacking another.

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { stateDir, readJson, writeJsonAtomic } = require('../lib/runtime');

const HERDR = process.env.HERDR_BIN_PATH || 'herdr';
const PLUGIN_ID = process.env.HERDR_PLUGIN_ID || 'vladpatr96.quota-board';

function herdr(args) {
  const out = execFileSync(HERDR, args, { encoding: 'utf8', windowsHide: true });
  return out.trim() ? JSON.parse(out) : null;
}

function openPaneFile() {
  return path.join(stateDir(), 'side-pane.json');
}

const PANE_TITLE = 'AI quota';

function panes() {
  try {
    return herdr(['pane', 'list'])?.result?.panes ?? [];
  } catch {
    return [];
  }
}

// Where the person pressing the key actually is. A board open in another
// workspace is invisible to them, so it must not satisfy this request.
function currentWorkspace() {
  if (process.env.HERDR_WORKSPACE_ID) return process.env.HERDR_WORKSPACE_ID;
  try {
    const context = JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || '{}');
    if (context.workspace_id) return context.workspace_id;
  } catch {
    /* fall through */
  }
  try {
    return herdr(['pane', 'current'])?.result?.pane?.workspace_id || null;
  } catch {
    return null;
  }
}

// The pane to split. Herdr passes the caller's pane to an action, so a hotkey
// pressed next to any agent splits right there; otherwise take whatever pane
// holds the focus in this workspace.
function targetPane(workspace) {
  if (process.env.HERDR_PANE_ID) return process.env.HERDR_PANE_ID;
  try {
    const context = JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || '{}');
    if (context.focused_pane_id) return context.focused_pane_id;
  } catch {
    /* fall through */
  }
  const here = panes().filter((pane) => !workspace || pane.workspace_id === workspace);
  return (here.find((pane) => pane.focused) || here[0])?.pane_id || null;
}

// Prefer the pane we opened; fall back to any board pane in this workspace, so
// a remembered id lost to a restart does not open a second one.
function existingPane(remembered, workspace) {
  const here = panes().filter((pane) => !workspace || pane.workspace_id === workspace);
  if (remembered && here.some((pane) => pane.pane_id === remembered)) return remembered;
  return here.find((pane) => pane.label === PANE_TITLE)?.pane_id || null;
}

// One board per workspace, remembered per workspace.
function remembered(workspace) {
  const saved = readJson(openPaneFile())?.byWorkspace;
  return (saved && workspace && saved[workspace]) || null;
}

function remember(workspace, paneId) {
  const saved = readJson(openPaneFile())?.byWorkspace || {};
  if (workspace) saved[workspace] = paneId;
  writeJsonAtomic(openPaneFile(), { byWorkspace: saved, updatedAt: new Date().toISOString() });
}

function openSide() {
  const workspace = currentWorkspace();
  const found = existingPane(remembered(workspace), workspace);
  if (found) {
    try {
      herdr(['plugin', 'pane', 'focus', found]);
      remember(workspace, found);
      return;
    } catch {
      // Herdr forgets which plugin owns a pane when the plugin is relinked;
      // such a pane can no longer be focused, so leave it and open a fresh one.
    }
  }
  // A split has to be cut from an existing pane: Herdr refuses `--workspace`
  // here ("split and zoomed plugin panes target an existing pane"). The pane
  // the key was pressed in is the right one, wherever that is.
  const args = ['plugin', 'pane', 'open', '--plugin', PLUGIN_ID, '--entrypoint', 'board-side', '--direction', 'right'];
  const target = targetPane(workspace);
  if (target) args.push('--target-pane', target);
  const result = herdr(args);
  const paneId = result?.result?.plugin_pane?.pane?.pane_id;
  if (paneId) remember(workspace, paneId);
}

function openOverlay() {
  herdr(['plugin', 'pane', 'open', '--plugin', PLUGIN_ID, '--entrypoint', 'board']);
}

try {
  if (process.argv.includes('side')) openSide();
  else openOverlay();
} catch (error) {
  process.stderr.write(`quota-board: could not open the board: ${error.message}\n`);
  process.exitCode = 1;
}
