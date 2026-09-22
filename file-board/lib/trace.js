'use strict';

// A record of what the board did and how long it took, for the times the board
// is slow somewhere it cannot be watched.
//
// Everything the board does measures fast on the bench — a frame costs a fifth
// of a millisecond and two kilobytes. When a pane nonetheless feels slow, the
// question is no longer how much the work costs but where the time actually
// goes, and that can only be answered on the machine where it goes missing.
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

function openTrace(env) {
  const file = env.FILE_BOARD_TRACE;
  if (!file) return { write() {} };
  return {
    write(event) {
      try {
        fs.appendFileSync(file, `${traceLine(new Date(), event)}\n`);
      } catch {
        // A pane that cannot write its log still has a job to do.
      }
    },
  };
}

module.exports = { traceLine, openTrace };
