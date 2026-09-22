'use strict';

// What to write so the pane shows the new frame, given what it already shows.
//
// The board's own work is free — building a frame costs a third of a
// millisecond — but handing one to a herdr pane costs between two and twenty,
// and herdr then has every row of it to parse and render again. So the frame
// that is written is the difference, not the picture: moving the cursor down a
// row sends two rows instead of fifty-five.
//
// Every row the board produces is padded to the full width of the pane, so a
// row can be overwritten in place and there is nothing left of the old one to
// erase.

function paintFrame(previous, next) {
  // Nothing trustworthy on screen — first frame, or the pane changed shape and
  // the rows no longer line up with what was there.
  if (!previous || previous.length !== next.length) {
    return `\u001b[H${next.join('\r\n')}`;
  }
  let written = '';
  for (let at = 0; at < next.length; at += 1) {
    if (next[at] !== previous[at]) written += `\u001b[${at + 1};1H${next[at]}`;
  }
  return written;
}

module.exports = { paintFrame };
