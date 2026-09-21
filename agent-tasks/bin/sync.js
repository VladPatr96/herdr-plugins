#!/usr/bin/env node
'use strict';

// Keeps the sidebar honest: every agent this plugin launched shows its task
// and its place in the plan, and agents that are gone leave the registry.
//
// Runs from the startup hook (Herdr does not restore token metadata after a
// server restart), from the pane and tab events, and by hand from the `sync`
// action.

const fs = require('node:fs');
const path = require('node:path');
const { progress } = require('../lib/plan');
const { planUpdates } = require('../lib/labels');
const {
  SOURCE,
  herdr,
  resolvedStateDir,
  rememberStateDir,
  loadRegistry,
  saveRegistry,
  readTask,
} = require('../lib/runtime');

function sync() {
  const dir = rememberStateDir();
  const entries = loadRegistry(dir);
  if (!Object.keys(entries).length) return;

  const agents = herdr(['agent', 'list'])?.result?.agents ?? [];
  const plans = {};
  for (const paneId of Object.keys(entries)) {
    const text = readTask(paneId, dir);
    if (text !== null) plans[paneId] = progress(text);
  }

  const { updates, forget } = planUpdates({ entries, agents, plans });

  // Номер отчёта берётся до рассылки, чтобы отчёт, посчитанный по старому
  // снимку, не переехал поверх более свежего.
  let seq = Date.now() * 1000;
  for (const { paneId, tokens } of updates) {
    const args = ['pane', 'report-metadata', paneId, '--source', SOURCE, '--seq', String(seq++)];
    for (const [name, value] of Object.entries(tokens)) {
      args.push(...(value === null ? ['--clear-token', name] : ['--token', `${name}=${value}`]));
    }
    try {
      herdr(args);
    } catch (error) {
      // Пейн мог закрыться между списком и отчётом; следующее событие поправит.
      process.stderr.write(`agent-tasks: ${paneId}: ${error.message}\n`);
    }
  }

  if (forget.length) {
    const kept = { ...entries };
    for (const paneId of forget) {
      delete kept[paneId];
      // Файл задачи с планом переживает пейн нарочно: по нему видно, чем
      // кончилось. Из реестра запись уходит, файл остаётся.
    }
    saveRegistry(kept, dir);
  }

  if (process.argv.includes('--verbose')) {
    process.stdout.write(`${JSON.stringify({ dir, agents: agents.length, updates, forget }, null, 2)}\n`);
  }
}

// Одно событие поднимает сразу несколько хуков (pane.created, agent_detected,
// agent_status_changed). Прогоны выстраиваются в очередь: каждый вызов метит
// состояние грязным, а держатель замка синхронизирует, пока грязное есть.
const STALE_LOCK_MS = 30_000;

function acquire(lock) {
  try {
    fs.closeSync(fs.openSync(lock, 'wx'));
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  try {
    if (Date.now() - fs.statSync(lock).mtimeMs > STALE_LOCK_MS) {
      fs.rmSync(lock, { force: true });
      return acquire(lock);
    }
  } catch {
    /* the holder released it between the two calls */
  }
  return false;
}

function main() {
  const dir = resolvedStateDir();
  const lock = path.join(dir, 'sync.lock');
  const dirty = path.join(dir, 'sync.dirty');

  fs.writeFileSync(dirty, String(Date.now()));
  while (fs.existsSync(dirty)) {
    if (!acquire(lock)) return; // the holder will see our dirty mark
    try {
      while (fs.existsSync(dirty)) {
        fs.rmSync(dirty, { force: true });
        sync();
      }
    } finally {
      fs.rmSync(lock, { force: true });
    }
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`agent-tasks: sync failed: ${error.message}\n`);
  process.exitCode = 1;
}

module.exports = { sync };
