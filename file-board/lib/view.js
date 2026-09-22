'use strict';

// What the board is willing to show. The limits are borrowed from herdr-sidebar,
// where they are load-bearing: past them a pane redraw costs more than the file
// is worth, and a file the viewer cannot render faithfully must not pretend it
// can be edited either.

const fs = require('node:fs');

const MAX_BYTES = 1024 * 1024; // 1 MiB
const MAX_LINES = 5000;
const TAB_STOP = 8;

// Cheap and decisive: a NUL byte means nobody meant this to be read as text.
function hasNulByte(buffer) {
  return buffer.includes(0);
}

// Node's decoder replaces bad bytes with U+FFFD rather than failing, so the
// round trip is the test: text that survives re-encoding was really UTF-8.
// Windows-1251 and friends land here and are shown as binary instead of mojibake.
function isValidUtf8(buffer) {
  const text = buffer.toString('utf8');
  return Buffer.compare(Buffer.from(text, 'utf8'), buffer) === 0;
}

// A tab is one character and eight columns. Everything downstream measures a
// line in characters, so the two have to be made the same thing here — before
// the board decides where the right edge of the pane falls.
function expandTabs(line) {
  if (!line.includes('\t')) return line;
  let out = '';
  for (const character of line) {
    if (character !== '\t') {
      out += character;
      continue;
    }
    out += ' '.repeat(TAB_STOP - (out.length % TAB_STOP));
  }
  return out;
}

function toLines(text) {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (withoutBom === '') return [];
  const lines = withoutBom.split('\n');
  // A trailing newline ends the last line, it does not start an empty one.
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.map((line) => expandTabs(line.endsWith('\r') ? line.slice(0, -1) : line));
}

// Every answer carries `readOnly`, because the one thing the caller must never
// get wrong is offering to edit what cannot be edited safely.
function openFile(file) {
  let contents;
  try {
    contents = fs.readFileSync(file);
  } catch {
    return { kind: 'unreadable', lines: [], readOnly: true };
  }

  if (contents.length > MAX_BYTES) {
    return { kind: 'too-big', lines: [], readOnly: true, bytes: contents.length };
  }
  if (hasNulByte(contents) || !isValidUtf8(contents)) {
    return { kind: 'binary', lines: [], readOnly: true, bytes: contents.length };
  }

  const lines = toLines(contents.toString('utf8'));
  if (lines.length > MAX_LINES) {
    return { kind: 'too-long', lines: lines.slice(0, MAX_LINES), readOnly: true, totalLines: lines.length };
  }
  return { kind: 'text', lines, readOnly: false };
}

module.exports = { openFile, expandTabs, MAX_BYTES, MAX_LINES, TAB_STOP };
