#!/usr/bin/env node
'use strict';

// Убирает агентов этого плагина из панели «Agents» в сайдбаре herdr — и
// возвращает их обратно.
//
//   node bin/sidebar.js hide     спрятать
//   node bin/sidebar.js show     вернуть
//   node bin/sidebar.js restore  применить сохранённый выбор (хук запуска)
//
// Когда агент показывается под списком, в сайдбаре он второй раз не нужен:
// человек и так на него смотрит. Прячется он отбором `agent.view.set` — тем
// же, которым herdr вообще фильтрует эту панель, — по токену `$task`: его
// ставит только этот плагин, поэтому чужие агенты остаются на месте.
//
// Отбор живёт в сервере и держится одним владельцем: наш вытеснит чужой, если
// такой кто-то поставил. Панель он меняет только на вид — `agent list` и
// события отдают всех, поэтому ни плагин, ни хоткеи от этого не страдают.

const path = require('node:path');
const { request } = require('../lib/socket');
const { PLUGIN_ID, resolvedStateDir, readJson, writeJsonAtomic } = require('../lib/runtime');

const LABEL = 'без агентов задач';

// Панель показывает агента, у которого нет токена `$task`.
const FILTER = { op: 'not', filter: { op: 'exists', field: { token: 'task' } } };

function prefFile() {
  return path.join(resolvedStateDir(), 'sidebar.json');
}

function remember(hidden) {
  try {
    writeJsonAtomic(prefFile(), { hidden, updatedAt: new Date().toISOString() });
  } catch {
    /* выбор не переживёт перезапуск — не повод считать команду неудачной */
  }
}

function wanted() {
  return readJson(prefFile())?.hidden === true;
}

async function hide() {
  const result = await request('agent.view.set', { source: PLUGIN_ID, label: LABEL, filter: FILTER });
  remember(true);
  return { hidden: true, view: result };
}

async function show() {
  const result = await request('agent.view.clear', { source: PLUGIN_ID });
  remember(false);
  return { hidden: false, view: result };
}

// Отбор живёт в памяти сервера, поэтому после его перезапуска его нужно
// поставить заново. Зовётся из хука запуска и молчит, если прятать не просили.
async function restore() {
  if (!wanted()) return { hidden: false, skipped: true };
  const result = await request('agent.view.set', { source: PLUGIN_ID, label: LABEL, filter: FILTER });
  return { hidden: true, restored: true, view: result };
}

const MODES = { hide, show, restore };

(async () => {
  const mode = process.argv[2] || 'hide';
  const run = MODES[mode];
  if (!run) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: `unknown mode ${mode}; expected hide, show or restore` })}\n`);
    process.exitCode = 1;
    return;
  }
  try {
    const result = await run();
    process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
  } catch (error) {
    // Хук запуска не должен падать из-за того, что сервер ещё не поднял сокет.
    const quiet = mode === 'restore';
    process.stdout.write(`${JSON.stringify({ ok: false, mode, error: error.message })}\n`);
    if (!quiet) process.exitCode = 1;
  }
})();
