#!/usr/bin/env node
'use strict';

// The window itself: one screen with every provider, refreshed on a timer and
// on `r`, closed with `q`. Runs as a Herdr plugin pane (overlay by default).

const { collect, cachedOrEmpty } = require('../lib/collect');
const { renderBoard } = require('../lib/render-board');
const { syncSidebar } = require('../lib/sidebar');

const DEFAULT_INTERVAL_SECONDS = 60;

function interval() {
  const configured = Number(process.env.QUOTA_BOARD_INTERVAL_SECONDS);
  return (Number.isFinite(configured) && configured >= 15 ? configured : DEFAULT_INTERVAL_SECONDS) * 1000;
}

const state = { busy: false, view: cachedOrEmpty(), timer: null };

function draw() {
  const width = process.stdout.columns || 80;
  const lines = renderBoard({ ...state.view, busy: state.busy, color: true, width });
  process.stdout.write('\u001b[2J\u001b[H');
  process.stdout.write(lines.join('\r\n'));
}

async function refresh() {
  if (state.busy) return;
  state.busy = true;
  draw();
  try {
    const cache = await collect();
    state.view = cachedOrEmpty();
    syncSidebar(cache);
  } catch (error) {
    process.stderr.write(`quota-board: ${error.message}\n`);
  } finally {
    state.busy = false;
    draw();
  }
}

function quit(code = 0) {
  clearInterval(state.timer);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write('\u001b[?25h\u001b[?1049l');
  process.exit(code);
}

function main() {
  process.stdout.write('\u001b[?1049h\u001b[?25l');
  draw();
  refresh();
  state.timer = setInterval(refresh, interval());

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key) => {
      if (key === 'r' || key === 'R') refresh();
      // q, Esc, Ctrl+C, Ctrl+D all close the window.
      else if (key === 'q' || key === 'Q' || key === '\u001b' || key === '\u0003' || key === '\u0004') quit();
    });
  }
  process.stdout.on('resize', draw);
  process.on('SIGINT', () => quit());
  process.on('SIGTERM', () => quit());
}

main();
