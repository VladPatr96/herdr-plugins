'use strict';

// Прятать ли агентов этого плагина из панели «Agents» в сайдбаре herdr.
//
// Когда агент показан под списком, вторая его строка в панели рядом только
// мешает. Прячет не плагин, а сам herdr: у него есть отбор этой панели
// (`agent.view.set`), и отбирает он по токену `$task` — его ставит только этот
// плагин, поэтому чужие агенты остаются на месте. Уходит одна строка: агента
// по-прежнему отдают `agent list`, события и хоткеи.
//
// Отбор живёт в памяти сервера: после перезапуска его ставят заново по
// запомненному выбору. Владелец у отбора один на сессию — наш вытеснит чужой.

const path = require('node:path');
const { request } = require('./socket');
const { PLUGIN_ID, resolvedStateDir, readJson, writeJsonAtomic } = require('./runtime');

const LABEL = 'без агентов задач';

// Панель показывает агента, у которого нет токена `$task`.
const FILTER = { op: 'not', filter: { op: 'exists', field: { token: 'task' } } };

function prefFile() {
  return path.join(resolvedStateDir(), 'sidebar.json');
}

function hiddenWanted() {
  return readJson(prefFile())?.hidden === true;
}

function remember(hidden) {
  try {
    writeJsonAtomic(prefFile(), { hidden, updatedAt: new Date().toISOString() });
  } catch {
    /* выбор не переживёт перезапуск — не повод считать команду неудачной */
  }
}

async function hide() {
  const view = await request('agent.view.set', { source: PLUGIN_ID, label: LABEL, filter: FILTER });
  remember(true);
  return { hidden: true, view };
}

async function show() {
  const view = await request('agent.view.clear', { source: PLUGIN_ID });
  remember(false);
  return { hidden: false, view };
}

async function toggle() {
  return hiddenWanted() ? show() : hide();
}

// Зовётся из хука запуска и молчит, если прятать не просили.
async function restore() {
  if (!hiddenWanted()) return { hidden: false, skipped: true };
  const view = await request('agent.view.set', { source: PLUGIN_ID, label: LABEL, filter: FILTER });
  return { hidden: true, restored: true, view };
}

module.exports = { LABEL, FILTER, hide, show, toggle, restore, hiddenWanted, prefFile };
