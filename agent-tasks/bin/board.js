#!/usr/bin/env node
'use strict';

// The window itself: every agent this plugin launched, its task, its status
// and its plan. Refreshed on a timer and on `r`, `p` folds the checklists out,
// closed with `q`. Runs as a Herdr plugin pane (overlay by default).

const path = require('node:path');
const { progress } = require('../lib/plan');
const { boardRow } = require('../lib/labels');
const { renderBoard } = require('../lib/render-board');
const { borrowPlan, stillThere } = require('../lib/borrow');
const sidebarView = require('../lib/sidebar-view');
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

const view = readJson(viewFile()) || {};

const state = {
  rows: [],
  plans: view.plans === true,
  split: view.split === 'right' ? 'right' : null,
  hidden: sidebarView.hiddenWanted(),
  selected: 0,
  notice: null,
  borrowed: null,
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
    borrowed: state.borrowed && state.borrowed.paneId,
    split: boardSplit(),
    hidden: state.hidden,
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
  // Одолженный агент мог закрыться, пока стоял рядом: тогда возвращать домой
  // уже нечего и помнить о нём не нужно.
  const alive = stillThere(state.borrowed, state.rows);
  if (Boolean(alive) !== Boolean(state.borrowed)) rememberBorrow(alive);
  else state.borrowed = alive;
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

// Оверлей наезжает на активный пейн и закрывается обратно в него: соседа ему
// не удержать, поэтому он просто уводит фокус и закрывается. Пейн сбоку живёт
// в своей вкладке — вот он и показывает агента рядом с собой.
function isSideBoard() {
  return process.env.HERDR_PLUGIN_ENTRYPOINT_ID === 'board-side';
}

// Своя панель и своя вкладка. Переменные окружения herdr задаёт при запуске, а
// вкладка могла с тех пор смениться — панель человек волен передвинуть сам, —
// поэтому перед переездом она спрашивается заново.
const BOARD_PANE = process.env.HERDR_PANE_ID || null;

function boardTab() {
  if (BOARD_PANE) {
    try {
      const tab = herdr(['pane', 'get', BOARD_PANE])?.result?.pane?.tab_id;
      if (tab) return tab;
    } catch {
      /* fall back to the tab we started in */
    }
  }
  return process.env.HERDR_TAB_ID || null;
}

function borrowFile() {
  return path.join(resolvedStateDir(), 'board-borrow.json');
}

function rememberBorrow(borrowed) {
  state.borrowed = borrowed;
  try {
    writeJsonAtomic(borrowFile(), { borrowed, boardPane: BOARD_PANE });
  } catch {
    /* worst case the next board start does not adopt it back */
  }
}

// Отправить агента домой — в свою вкладку, под своим названием.
//
// Дом приходится заводить заново: вкладка агента закрылась сама, когда он из
// неё уехал (herdr так и сообщает — `closed_tab_id`). Новая вкладка получает
// номер вместо имени, поэтому название задачи возвращается руками.
function sendHome(borrowed) {
  if (!borrowed) return;
  let tabId = null;
  try {
    tabId = herdr(['pane', 'move', borrowed.paneId, '--new-tab'])?.result?.move_result?.pane?.tab_id;
  } catch {
    return; // панель закрылась вместе с агентом — возвращать нечего
  }
  if (tabId && borrowed.title) {
    try {
      herdr(['tab', 'rename', tabId, borrowed.title.slice(0, 40)]);
    } catch {
      /* безымянная вкладка — не повод считать переезд неудачным */
    }
  }
}

// Куда подставлять агента. Вниз — потому что список обычно стоит колонкой
// сбоку: агент занимает место под ним, в той же колонке, и оба видны разом.
// Вправо — когда список открыт во всю ширину. Переключается клавишей `d`,
// переменная среды задаёт лишь то, с чего начать.
function boardSplit() {
  if (state.split) return state.split;
  return process.env.AGENT_TASKS_BOARD_SPLIT === 'right' ? 'right' : 'down';
}

function rememberView() {
  try {
    writeJsonAtomic(viewFile(), { plans: state.plans, split: boardSplit() });
  } catch {
    /* a preference not surviving the session is not worth an error */
  }
}

// Сменить направление и тут же переложить того, кто стоит рядом: иначе
// переключатель ничего не делает, пока агента не выберут заново.
function toggleSplit() {
  state.split = boardSplit() === 'down' ? 'right' : 'down';
  rememberView();
  const shown = state.borrowed;
  if (shown) {
    const row = state.rows.find((item) => item.paneId === shown.paneId);
    const tabId = boardTab();
    if (row && tabId) {
      try {
        sendHome(shown);
        bringHere(row, tabId);
        rememberBorrow({ paneId: row.paneId, title: row.title });
      } catch (error) {
        state.notice = `не удалось переложить: ${error.message}`;
      }
    }
  }
  draw();
}

// Прятать ли этих агентов из панели «Agents». Ходит в сокет herdr, поэтому
// одна из немногих асинхронных вещей в этом окне.
function toggleSidebar() {
  sidebarView
    .toggle()
    .then((result) => {
      state.hidden = result.hidden;
      state.notice = result.hidden
        ? 'агенты задач убраны из сайдбара'
        : 'агенты задач снова в сайдбаре';
    })
    .catch((error) => {
      state.notice = `сайдбар: ${error.message}`;
    })
    .then(draw);
}

// Доля, остающаяся списку. Список — это несколько коротких строк, агенту
// нужно место.
function boardRatio() {
  const configured = Number(process.env.AGENT_TASKS_BOARD_RATIO);
  return Number.isFinite(configured) && configured > 0.1 && configured < 0.9 ? configured : 0.35;
}

function bringHere(row, tabId) {
  const args = ['pane', 'move', row.paneId, '--tab', tabId, '--split', boardSplit(), '--ratio', String(boardRatio())];
  if (BOARD_PANE) args.push('--target-pane', BOARD_PANE);
  herdr(args); // переезд сам переводит фокус на переехавшую панель
}

// Показать выбранного агента — то, зачем список и открывают: увидел, кто
// спрашивает, посмотрел на него, не теряя списка из виду.
function enter(index) {
  const at = index === undefined ? state.selected : index;
  const row = state.rows[at];
  if (!row) return;
  // Прыжок по цифре двигает и курсор: вернувшись к списку, человек должен
  // найти его там, где был сам, а не там, где оставил в прошлый раз.
  state.selected = at;
  // Панели уже нет — показывать нечего. Молча закрыться тут нельзя: человек
  // решит, что промахнулся мимо клавиши.
  if (row.status === 'gone') {
    state.notice = `${row.title}: панели больше нет`;
    draw();
    return;
  }

  if (!isSideBoard()) {
    // Оверлей: увести фокус и уйти с дороги.
    try {
      herdr(['agent', 'focus', row.paneId]);
    } catch (error) {
      state.notice = `не удалось перейти: ${error.message}`;
      draw();
      return;
    }
    quit();
    return;
  }

  const tabId = boardTab();
  if (!tabId) {
    state.notice = 'не понять, в какой я вкладке — перехожу фокусом';
    try {
      herdr(['agent', 'focus', row.paneId]);
    } catch { /* сказать уже нечего */ }
    draw();
    return;
  }

  const plan = borrowPlan({ borrowed: state.borrowed, wanted: { paneId: row.paneId, title: row.title } });
  try {
    if (plan.bring) {
      sendHome(plan.send);
      bringHere(row, tabId);
      rememberBorrow({ paneId: row.paneId, title: row.title });
    } else if (plan.focus) {
      herdr(['agent', 'focus', plan.focus]);
    }
  } catch (error) {
    state.notice = `не удалось показать: ${error.message}`;
  }
  draw();
}

// Отпустить агента: он уезжает домой, рядом со списком снова пусто.
function release() {
  if (!state.borrowed) {
    state.notice = 'рядом никого нет';
    draw();
    return;
  }
  sendHome(state.borrowed);
  rememberBorrow(null);
  if (BOARD_PANE) {
    try {
      herdr(['pane', 'focus', BOARD_PANE]);
    } catch {
      /* фокус — мелочь по сравнению с переездом */
    }
  }
  draw();
}

function togglePlans() {
  state.plans = !state.plans;
  rememberView();
  draw();
}

function quit(code = 0) {
  clearInterval(state.timer);
  // Закрываясь, список отдаёт агента обратно: иначе тот останется стоять в
  // чужой вкладке, где больше ничего нет.
  if (state.borrowed) {
    sendHome(state.borrowed);
    rememberBorrow(null);
  }
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write('\u001b[?25h\u001b[?1049l');
  process.exit(code);
}

// Доску могли закрыть вместе с herdr, оставив одолженного агента рядом с её
// местом. Новая доска в той же вкладке признаёт его своим, вместо того чтобы
// заводить второго соседа.
function adoptBorrowed() {
  const saved = readJson(borrowFile())?.borrowed;
  if (!saved) return;
  try {
    const tab = herdr(['pane', 'get', saved.paneId])?.result?.pane?.tab_id;
    if (tab && tab === boardTab()) state.borrowed = saved;
    else rememberBorrow(null);
  } catch {
    rememberBorrow(null);
  }
}

function main() {
  process.stdout.write('\u001b[?1049h\u001b[?25l');
  if (isSideBoard()) adoptBorrowed();
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
      else if (key === 'o' || key === 'O') release();
      else if (key === 'd' || key === 'D') toggleSplit();
      else if (key === 's' || key === 'S') toggleSidebar();
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
