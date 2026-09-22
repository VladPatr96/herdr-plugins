'use strict';

// Where the board opens. The plugin context herdr hands a pane carries
// `focused_pane_cwd`, but it was never confirmed to arrive filled on Windows
// 0.9.1 — herdr-sidebar hit exactly that on 0.8 — so the pane list is asked
// first. It answers from herdr's own state and needs no context at all.

function folderOf(pane) {
  return pane && typeof pane.cwd === 'string' && pane.cwd !== '' ? pane.cwd : null;
}

function resolveStartDir({ paneId, panes = [], workspace, context = {}, fallback } = {}) {
  const here = workspace ? panes.filter((pane) => pane.workspace_id === workspace) : panes;

  // The pane the key was pressed in — the folder the person is looking at.
  const caller = folderOf(panes.find((pane) => pane.pane_id === paneId));
  if (caller) return caller;

  // The pane was closed or never told us its id: whatever holds the focus here.
  const focused = folderOf(here.find((pane) => pane.focused));
  if (focused) return focused;

  const fromContext = folderOf({ cwd: context.focused_pane_cwd });
  if (fromContext) return fromContext;

  const workspaceCwd = folderOf({ cwd: context.workspace_cwd });
  if (workspaceCwd) return workspaceCwd;

  return fallback;
}

// The folder the board should show, as the board itself sees it.
//
// The pane command is `node bin/board.js` — a path relative to the plugin root,
// which herdr resolves against the pane's working directory. Opening the pane
// with `--cwd <folder>` therefore breaks the command itself: node looks for
// `bin/board.js` inside the folder being browsed and the pane dies on the spot.
// So the folder travels in the environment and the working directory is left
// where herdr put it.
function boardRoot(env = {}, cwd) {
  const named = env.FILE_BOARD_ROOT;
  return typeof named === 'string' && named !== '' ? named : cwd;
}

module.exports = { resolveStartDir, boardRoot };
