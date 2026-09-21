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

// Prefer the pane we opened; fall back to any board pane that is already
// there, so a remembered id lost to a restart does not open a second one.
function existingPane(remembered) {
  const open = panes();
  if (remembered && open.some((pane) => pane.pane_id === remembered)) return remembered;
  return open.find((pane) => pane.label === PANE_TITLE)?.pane_id || null;
}

function openSide() {
  const found = existingPane(readJson(openPaneFile())?.paneId);
  if (found) {
    try {
      herdr(['plugin', 'pane', 'focus', found]);
      writeJsonAtomic(openPaneFile(), { paneId: found, openedAt: new Date().toISOString() });
      return;
    } catch {
      // Herdr forgets which plugin owns a pane when the plugin is relinked;
      // such a pane can no longer be focused, so leave it and open a fresh one.
    }
  }
  const result = herdr([
    'plugin', 'pane', 'open',
    '--plugin', PLUGIN_ID,
    '--entrypoint', 'board-side',
    '--direction', 'right',
  ]);
  const paneId = result?.result?.plugin_pane?.pane?.pane_id;
  if (paneId) writeJsonAtomic(openPaneFile(), { paneId, openedAt: new Date().toISOString() });
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
