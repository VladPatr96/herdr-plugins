#!/usr/bin/env node
'use strict';

// The window itself: every agent this plugin launched, its task, its status
// and its plan. Refreshed on a timer and on `r`, `p` folds the checklists out,
// closed with `q`. Runs as a Herdr plugin pane (overlay by default).

const path = require('node:path');
const { progress } = require('../lib/plan');
const { boardRow } = require('../lib/labels');
const { renderBoard } = require('../lib/render-board');
const { herdr, resolvedStateDir, loadRegistry, readTask, readJson, writeJsonAtomic } = require('../lib/runtime');

const DEFAULT_INTERVAL_SECONDS = 5;

function interval() {
  const configured = Number(process.env.AGENT_TASKS_INTERVAL_SECONDS);
  return (Number.isFinite(configured) && configured >= 1 ? configured : DEFAULT_INTERVAL_SECONDS) * 1000;
}

// Развёрнут ли чек-лист. Это предпочтение, а не режим, поэтому переживает
// закрытие окна.
function viewFile() {
  return path.join(resolvedStateDir(), 'board-view.json');
}

const state = {
  rows: [],
  plans: readJson(viewFile())?.plans === true,
  timer: null,
};

// Строки доски: реестр плагина, живые статусы от herdr и план из файла задачи.
function collect() {
  const dir = resolvedStateDir();
  const entries = loadRegistry(dir);
  let agents = [];
  try {
    agents = herdr(['agent', 'list'])?.result?.agents ?? [];
  } catch {
    /* a board that cannot reach the server still shows the last rows */
  }
  const byPane = new Map(agents.map((agent) => [agent.pane_id, agent]));

  return Object.values(entries)
    .map((entry) => {
      const text = readTask(entry.paneId, dir);
      const plan = text === null ? null : progress(text);
      return { ...boardRow(entry, byPane.get(entry.paneId), plan), items: plan?.items ?? [] };
    })
    .sort((a, b) => String(a.launchedAt).localeCompare(String(b.launchedAt)));
}

function draw() {
  const width = process.stdout.columns || 80;
  const lines = renderBoard({ rows: state.rows, width, color: true, plans: state.plans, stateDir: resolvedStateDir() });
  process.stdout.write('\u001b[2J\u001b[H');
  process.stdout.write(lines.join('\r\n'));
}

function refresh() {
  try {
    state.rows = collect();
  } catch (error) {
    process.stderr.write(`agent-tasks: ${error.message}\n`);
  }
  draw();
}

function togglePlans() {
  state.plans = !state.plans;
  try {
    writeJsonAtomic(viewFile(), { plans: state.plans });
  } catch {
    /* a preference not surviving the session is not worth an error */
  }
  draw();
}

function quit(code = 0) {
  clearInterval(state.timer);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write('\u001b[?25h\u001b[?1049l');
  process.exit(code);
}

function main() {
  process.stdout.write('\u001b[?1049h\u001b[?25l');
  refresh();
  state.timer = setInterval(refresh, interval());

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key) => {
      if (key === 'r' || key === 'R') refresh();
      else if (key === 'p' || key === 'P') togglePlans();
      // q, Esc, Ctrl+C, Ctrl+D all close the window.
      else if (key === 'q' || key === 'Q' || key === '\u001b' || key === '\u0003' || key === '\u0004') quit();
    });
  }
  process.stdout.on('resize', draw);
  process.on('SIGINT', () => quit());
  process.on('SIGTERM', () => quit());
}

main();
