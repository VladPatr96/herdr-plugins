#!/usr/bin/env node
'use strict';

// Убирает агентов этого плагина из панели «Agents» в сайдбаре herdr — и
// возвращает их обратно.
//
//   node bin/sidebar.js hide     спрятать
//   node bin/sidebar.js show     вернуть
//   node bin/sidebar.js toggle   переключить
//   node bin/sidebar.js restore  применить сохранённый выбор (хук запуска)
//
// То же самое переключает клавиша `s` в окне со списком; здесь оно вынесено
// действием — для клавиши herdr и для тех, кто список не открывает.

const { hide, show, toggle, restore } = require('../lib/sidebar-view');

const MODES = { hide, show, toggle, restore };

(async () => {
  const mode = process.argv[2] || 'toggle';
  const run = MODES[mode];
  if (!run) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: `unknown mode ${mode}; expected hide, show, toggle or restore` })}\n`);
    process.exitCode = 1;
    return;
  }
  try {
    const result = await run();
    process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
  } catch (error) {
    // Хук запуска не должен падать из-за того, что сервер ещё не поднял сокет.
    process.stdout.write(`${JSON.stringify({ ok: false, mode, error: error.message })}\n`);
    if (mode !== 'restore') process.exitCode = 1;
  }
})();
