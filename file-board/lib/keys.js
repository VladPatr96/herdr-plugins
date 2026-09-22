'use strict';

// What a keypress means. Kept apart from the pane so the escape sequences can
// be pinned down in tests instead of by pressing keys and hoping.
//
// No binding uses Alt: herdr resolves prefix-less bindings before a pane sees
// them, and this machine has 36 of them on Alt (agent-hotkeys, quota-board).
// An Alt key would simply never arrive here.

const BY_KEY = new Map([
  ['j', 'down'],
  ['k', 'up'],
  ['h', 'close'],
  ['l', 'open'],
  ['\u001b[B', 'down'],
  ['\u001b[A', 'up'],
  ['\u001b[D', 'close'],
  ['\u001b[C', 'open'],
  ['\r', 'enter'],
  ['\n', 'enter'],
  ['e', 'edit'],
  ['.', 'hidden'],
  ['w', 'wrap'],
  ['r', 'refresh'],
  ['q', 'quit'],
  // Esc steps out of the viewer back to the tree. It must never close the pane:
  // `pane close` kills the process outright, and a pane that vanishes under a
  // stray Escape is the fastest way to lose unsaved work later on.
  ['\u001b', 'back'],
  ['\u0003', 'quit'],
  ['\u001b[6~', 'page-down'],
  ['\u001b[5~', 'page-up'],
  ['g', 'top'],
  ['G', 'bottom'],
]);

function actionFor(key) {
  return BY_KEY.get(key) ?? null;
}

// A pane delivers whatever arrived since the last read, so holding `j` or
// scripting a few presses lands them in one chunk. Split it back into presses:
// an escape sequence runs to its final byte, anything else is one key.
function splitKeys(chunk) {
  const keys = [];
  let at = 0;
  while (at < chunk.length) {
    if (chunk[at] === '\u001b' && chunk[at + 1] === '[') {
      let end = at + 2;
      while (end < chunk.length && !/[@-~]/.test(chunk[end])) end += 1;
      keys.push(chunk.slice(at, end + 1));
      at = end + 1;
    } else {
      keys.push(chunk[at]);
      at += 1;
    }
  }
  return keys;
}

function actionsFor(chunk) {
  return splitKeys(chunk)
    .map((key) => actionFor(key))
    .filter((action) => action !== null);
}

module.exports = { actionFor, actionsFor };
