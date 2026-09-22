'use strict';

// Turning rows into what a pane can print. Everything here is arithmetic on
// strings: no terminal, no filesystem, so the awkward cases — a cursor at the
// last row, a name wider than a narrow split — are settled in tests rather than
// by squinting at a pane.

const { groupFor, styleFor } = require('./paint');

// A pane is as wide as it is. A name that does not fit is cut with an ellipsis,
// never wrapped: a wrapped row would push every row below it out of place.
function fit(line, width) {
  if (width <= 0) return '';
  if (line.length === width) return line;
  if (line.length < width) return line + ' '.repeat(width - line.length);
  return line.slice(0, width - 1) + '…';
}

// A row as the pane draws it: guides, then the arrow, then the name. Each part
// is a segment with its own colour, and only `paint.line` decides where the
// right edge falls — see the note at the top of `paint.js` for why the width is
// not settled here.
// The same job as `fit`, from the other end: a path is read backwards, so what
// has to survive the cut is the file name, not the drive letter.
function fitEnd(line, width) {
  if (width <= 0) return '';
  if (line.length <= width) return fit(line, width);
  return `…${line.slice(-(width - 1))}`;
}

function rowSegments(row) {
  const trail = row.lastAt;
  let guide = '';
  // A trunk for every level above this one that still has rows to come, blank
  // where the branch has already finished.
  for (let i = 0; i < row.depth; i += 1) guide += trail[i] ? '  ' : '│ ';
  guide += trail[row.depth] ? '└─' : '├─';

  const group = groupFor(row.name, row.isDirectory);
  const marker = row.isDirectory ? (row.expanded ? '▾' : '▸') : ' ';
  return [
    { text: guide, sgr: styleFor('guide') },
    { text: `${marker} `, sgr: row.isDirectory ? styleFor('directory') : '' },
    { text: row.name, sgr: styleFor(group) },
  ];
}

// The smallest move that brings the cursor back into view, clamped so the last
// screenful is the end of the list and a short list never scrolls at all.
function scrollTo({ cursor, offset, height, total }) {
  const last = Math.max(0, total - height);
  let next = offset;
  if (cursor < next) next = cursor;
  if (cursor >= next + height) next = cursor - height + 1;
  return Math.min(Math.max(0, next), last);
}

// Which lines of the file are on screen, for the header. `shown` is how many
// rows the text itself has, which is a row less than the pane whenever a note
// about the file is sitting above it — count by the pane instead and the last
// line of a long file is claimed to be visible when it is not.
function lineCount({ offset, shown, total }) {
  if (total === 0) return '';
  return `${offset + 1}-${Math.min(offset + shown, total)}/${total}`;
}

module.exports = { fit, fitEnd, rowSegments, scrollTo, lineCount };
