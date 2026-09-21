#!/usr/bin/env node
'use strict';

// Opens the board. A plugin action cannot open its own pane declaratively, so
// it asks Herdr through the CLI, which works the same over a Unix socket and a
// Windows named pipe.
//
//   node bin/open.js          overlay over the active pane, closes back to it
//   node bin/open.js side     a split to the right, next to the agents

const { herdr, PLUGIN_ID, resolvedStateDir, readJson, writeJsonAtomic } = require('../lib/runtime');
const path = require('node:path');

const PANE_TITLE = 'Агенты и задачи';

function openPaneFile() {
  return path.join(resolvedStateDir(), 'side-pane.json');
}

function panes() {
  try {
    return herdr(['pane', 'list'])?.result?.panes ?? [];
  } catch {
    return [];
  }
}

// Где стоит человек, нажавший клавишу. Доска, открытая в другом воркспейсе,
// для него невидима и его просьбу не закрывает.
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

function existingPane(remembered, workspace) {
  const here = panes().filter((pane) => !workspace || pane.workspace_id === workspace);
  if (remembered && here.some((pane) => pane.pane_id === remembered)) return remembered;
  return here.find((pane) => pane.label === PANE_TITLE)?.pane_id || null;
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
  const args = ['plugin', 'pane', 'open', '--plugin', PLUGIN_ID, '--entrypoint', 'board-side', '--direction', 'right'];
  const target = targetPane(workspace);
  if (target) args.push('--target-pane', target);
  const paneId = herdr(args)?.result?.plugin_pane?.pane?.pane_id;
  if (paneId) remember(workspace, paneId);
}

function openOverlay() {
  herdr(['plugin', 'pane', 'open', '--plugin', PLUGIN_ID, '--entrypoint', 'board']);
}

try {
  if (process.argv.includes('side')) openSide();
  else openOverlay();
} catch (error) {
  process.stderr.write(`agent-tasks: could not open the board: ${error.message}\n`);
  process.exitCode = 1;
}
