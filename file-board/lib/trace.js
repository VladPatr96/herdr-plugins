'use strict';

// A record of what the board did and how long it took, for the times the board
// is slow somewhere it cannot be watched.
//
// Everything the board does measures fast on the bench — a frame costs a third
// of a millisecond to build. When a pane nonetheless feels slow, the question
// is no longer what the work costs but where the time goes, and that can only
// be answered on the machine where it goes missing.
//
// Off unless `FILE_BOARD_TRACE` names a file, and never a reason for the board
// to fall over: a tool for finding out why something is broken must not be a
// way to break it.

const fs = require('node:fs');

function value(text) {
  const written = String(text);
  return /\s/.test(written) ? `"${written}"` : written;
}

function traceLine(at, event) {
  const fields = Object.entries(event)
    .filter(([, given]) => given !== undefined && given !== null)
    .map(([name, given]) => `${name}=${value(given)}`);
  return [at.toISOString(), ...fields].join(' ');
}

// The file is opened once and kept. Appending by name instead opens, writes and
// closes on every line: one such write cost 143 ms in a pane while this was
// being hunted, more than everything it was there to time. Holding the file
// also keeps the log readable while the board is still running, which is the
// whole point when what is being chased is a pane that has stopped answering.
function openTrace(env) {
  const file = env.FILE_BOARD_TRACE;
  if (!file) return { write() {}, close() {} };

  let handle = null;
  try {
    handle = fs.openSync(file, 'a');
  } catch {
    return { write() {}, close() {} };
  }

  return {
    write(event) {
      try {
        fs.writeSync(handle, `${traceLine(new Date(), event)}\n`);
      } catch {
        // A pane that cannot write its log still has a job to do.
      }
    },
    close() {
      try {
        fs.closeSync(handle);
      } catch {
        // Nothing left to do about it.
      }
    },
  };
}

module.exports = { traceLine, openTrace };
