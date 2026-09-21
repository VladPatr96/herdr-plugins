#!/usr/bin/env node
'use strict';

// The window itself: one screen with every provider, refreshed on a timer and
// on `r`, closed with `q`. Runs as a Herdr plugin pane (overlay by default).

const { collect, cachedOrEmpty } = require('../lib/collect');
const { renderBoard } = require('../lib/render-board');
const { stateDir, readJson, writeJsonAtomic } = require('../lib/runtime');
const path = require('node:path');

const DEFAULT_INTERVAL_SECONDS = 60;

function interval() {
  const configured = Number(process.env.QUOTA_BOARD_INTERVAL_SECONDS);
  return (Number.isFinite(configured) && configured >= 15 ? configured : DEFAULT_INTERVAL_SECONDS) * 1000;
}

// Whether the per-model breakdown is folded out. Kept between openings,
// because it is a preference, not a mode.
function modelsFile() {
  return path.join(stateDir(), 'view.json');
}

const state = {
  busy: false,
  view: cachedOrEmpty(),
  timer: null,
  models: readJson(modelsFile())?.models === true,
  catalog: readJson(modelsFile())?.catalog === true,
};

function remember() {
  try {
    writeJsonAtomic(modelsFile(), { models: state.models, catalog: state.catalog });
  } catch {
    /* a preference not surviving the session is not worth an error */
  }
}

function toggleModels() {
  state.models = !state.models;
  remember();
  draw();
}

// The catalog only makes sense inside the model fold, so asking for it opens
// that fold too.
function toggleCatalog() {
  state.catalog = !state.catalog;
  if (state.catalog) state.models = true;
  remember();
  draw();
}

function draw() {
  const width = process.stdout.columns || 80;
  const lines = renderBoard({ ...state.view, busy: state.busy, color: true, width, models: state.models, catalog: state.catalog });
  process.stdout.write('\u001b[2J\u001b[H');
  process.stdout.write(lines.join('\r\n'));
}

async function refresh() {
  if (state.busy) return;
  state.busy = true;
  draw();
  try {
    await collect();
    state.view = cachedOrEmpty();
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
      else if (key === 'm' || key === 'M') toggleModels();
      else if (key === 'a' || key === 'A') toggleCatalog();
      // q, Esc, Ctrl+C, Ctrl+D all close the window.
      else if (key === 'q' || key === 'Q' || key === '\u001b' || key === '\u0003' || key === '\u0004') quit();
    });
  }
  process.stdout.on('resize', draw);
  process.on('SIGINT', () => quit());
  process.on('SIGTERM', () => quit());
}

main();
