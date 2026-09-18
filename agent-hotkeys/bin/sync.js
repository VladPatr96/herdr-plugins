#!/usr/bin/env node
'use strict';

// Hands hotkey slots to newly started agents, frees the slots of agents that
// are gone and writes each agent's `$hotkey` / `$hotkey_line` tokens. Runs from
// the startup hook, from event hooks and from the manual `sync` action.

const fs = require('node:fs');
const path = require('node:path');
const { assignSlots, wantedTokens, planUpdates, readTomlTable, fixedSidebarWidth } = require('../lib/hotkeys');
const { herdr, herdrConfigPath, stateDir, loadSlots, saveSlots } = require('../lib/runtime');

const SOURCE = 'plugin:agent-hotkeys';

function sidebarWidth() {
  try {
    return fixedSidebarWidth(readTomlTable(fs.readFileSync(herdrConfigPath(), 'utf8'), 'ui'));
  } catch {
    return 0;
  }
}

function sync() {
  // Sequence numbers are taken when the snapshot is read, so a report computed
  // from an older snapshot can never override one computed from a newer one.
  let seq = Date.now() * 1000;
  const agents = herdr(['agent', 'list'])?.result?.agents ?? [];
  const panes = herdr(['pane', 'list'])?.result?.panes ?? [];

  const slots = assignSlots(agents, loadSlots());
  saveSlots(slots);
  const wanted = wantedTokens({ agents, slots, sidebarWidth: sidebarWidth() });
  const updates = planUpdates({ wanted, panes, agents });

  for (const { paneId, tokens } of updates) {
    // The CLI parser wants the pane id first, whatever `--help` shows.
    const args = ['pane', 'report-metadata', paneId, '--source', SOURCE, '--seq', String(seq++)];
    for (const [name, value] of Object.entries(tokens)) {
      args.push(...(value === null ? ['--clear-token', name] : ['--token', `${name}=${value}`]));
    }
    try {
      herdr(args);
    } catch (err) {
      // The pane may have closed between list and report; the next event fixes it.
      process.stderr.write(`agent-hotkeys: ${paneId}: ${err.message}\n`);
    }
  }

  if (process.argv.includes('--verbose')) {
    process.stdout.write(JSON.stringify({ agents: agents.length, slots, updates }, null, 2) + '\n');
  }
}

// One event often fires several hooks at once (pane.created, agent_detected,
// agent_status_changed). Runs are serialized: every invocation marks the state
// dirty, and whoever holds the lock keeps syncing until nothing is dirty.
const STALE_LOCK_MS = 30_000;

function main() {
  const dir = stateDir();
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
    // A mark written between our last check and the unlock is still ours to handle.
  }
}

function acquire(lock) {
  try {
    fs.closeSync(fs.openSync(lock, 'wx'));
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  try {
    if (Date.now() - fs.statSync(lock).mtimeMs > STALE_LOCK_MS) {
      fs.rmSync(lock, { force: true });
      return acquire(lock);
    }
  } catch {}
  return false;
}

main();
