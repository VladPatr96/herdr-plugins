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
  selected: 0,
  notice: null,
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
  const lines = renderBoard({
    rows: state.rows,
    width,
    color: true,
    plans: state.plans,
    selected: state.selected,
    stateDir: resolvedStateDir(),
  });
  if (state.notice) lines.push(` ${state.notice}`);
  process.stdout.write('\u001b[2J\u001b[H');
  process.stdout.write(lines.join('\r\n'));
}

// Обновление не должно уводить курсор с агента, на который человек смотрит:
// пока он жив, выбор едет за ним, а не за номером строки.
function refresh() {
  const was = state.rows[state.selected] && state.rows[state.selected].paneId;
  try {
    state.rows = collect();
  } catch (error) {
    console.error(`agent-tasks: ${error.message}`);
  }
  const moved = was ? state.rows.findIndex((row) => row.paneId === was) : -1;
  state.selected = moved >= 0 ? moved : clamp(state.selected);
  draw();
}

function clamp(index) {
  if (!state.rows.length) return 0;
  return Math.max(0, Math.min(state.rows.length - 1, index));
}

// По кругу: с последнего вниз — на первый. Список короткий, и упереться в его
// край досаднее, чем проехать мимо.
function move(delta) {
  if (!state.rows.length) return;
  const count = state.rows.length;
  state.selected = (state.selected + delta + count) % count;
  draw();
}

// Оверлей наезжает на активный пейн и закрывается обратно в него, поэтому
// после перехода ему остаться нечем: он закрывается. Пейн сбоку человек
// поставил рядом с агентами нарочно — он остаётся открытым, иначе список
// пришлось бы звать заново после каждого перехода.
function closesOnEnter() {
  return process.env.HERDR_PLUGIN_ENTRYPOINT_ID !== 'board-side';
}

// Перейти в сессию выбранного агента — то, зачем список и открывают: увидел,
// кто спрашивает, вошёл к нему.
//
// Фокус ставится до выхода: закрытие оверлея возвращает фокус туда, откуда
// его открыли, поэтому порядок здесь решает всё.
function enter(index) {
  const at = index === undefined ? state.selected : index;
  const row = state.rows[at];
  if (!row) return;
  // Прыжок по цифре двигает и курсор: вернувшись к списку, человек должен
  // найти его там, где был сам, а не там, где оставил в прошлый раз.
  state.selected = at;
  // Пейна уже нет — переходить некуда. Молча закрыться тут нельзя: человек
  // решит, что промахнулся мимо клавиши.
  if (row.status === 'gone') {
    state.notice = `${row.title}: пейна больше нет`;
    draw();
    return;
  }
  try {
    herdr(['agent', 'focus', row.paneId]);
  } catch (error) {
    state.notice = `не удалось перейти: ${error.message}`;
    draw();
    return;
  }
  if (closesOnEnter()) quit();
  else draw();
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
      // Сообщение живёт до следующей клавиши: человек его уже прочитал.
      const had = state.notice;
      state.notice = null;
      // Стрелка приходит escape-последовательностью, поэтому её разбор идёт
      // раньше голого Esc — иначе «вверх» закрывала бы окно.
      if (key === '\u001b[A' || key === 'k') move(-1);
      else if (key === '\u001b[B' || key === 'j') move(1);
      else if (key === '\r' || key === '\n') enter();
      else if (key >= '1' && key <= '9') enter(Number(key) - 1);
      else if (key === 'r' || key === 'R') refresh();
      else if (key === 'p' || key === 'P') togglePlans();
      // q, Esc, Ctrl+C, Ctrl+D all close the window.
      else if (key === 'q' || key === 'Q' || key === '\u001b' || key === '\u0003' || key === '\u0004') quit();
      else if (had) draw();
    });
  }
  process.stdout.on('resize', draw);
  process.on('SIGINT', () => quit());
  process.on('SIGTERM', () => quit());
}

main();
