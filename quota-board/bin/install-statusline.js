#!/usr/bin/env node
'use strict';

// Claude Code only reports its plan windows to its own status line, so the
// bridge has to sit there. This wraps whatever status line is already
// configured instead of replacing it, keeps the original in the plugin's state
// directory and backs the settings file up before touching it.
//
//   node bin/install-statusline.js             install (or repair)
//   node bin/install-statusline.js --uninstall  put the original back

const fs = require('node:fs');
const path = require('node:path');
const { home, resolveDir, stateDir, readJson, writeJsonAtomic } = require('../lib/runtime');

const MARKER = 'quota-board';

function settingsFile() {
  const dir = process.env.CLAUDE_CONFIG_DIR || resolveDir(path.join(home(), '.claude'));
  return path.join(dir, 'settings.json');
}

function originalFile() {
  return path.join(stateDir(), 'statusline-claude-original.json');
}

function bridgeCommand(original) {
  const base = `node "${path.join(__dirname, 'statusline.js')}" claude --state-dir "${stateDir()}"`;
  return original ? `${base} -- ${original}` : base;
}

// agy has no settings file to edit: its status line is set from inside the CLI.
function agyCommand() {
  return `node "${path.join(__dirname, 'statusline.js')}" agy --state-dir "${stateDir()}"`;
}

function install() {
  const file = settingsFile();
  const settings = readJson(file);
  if (!settings) {
    process.stderr.write(`quota-board: cannot read ${file}\n`);
    return 1;
  }
  const current = settings.statusLine;
  const wanted = current?.command?.includes(MARKER)
    // Already ours: keep whatever it wraps and rebuild the rest, so a moved
    // plugin path or state directory repairs itself.
    ? bridgeCommand(current.command.split(' -- ').slice(1).join(' -- ') || null)
    : null;
  if (wanted && wanted === current.command) {
    process.stdout.write('statusLine bridge is already installed\n');
    return 0;
  }
  if (wanted) {
    settings.statusLine = { type: 'command', command: wanted };
    writeJsonAtomic(file, settings);
    process.stdout.write(`statusLine bridge repaired in ${file}\n`);
    process.stdout.write(`for agy, run /statusline inside it and paste:\n  ${agyCommand()}\n`);
    return 0;
  }

  const original = current?.type === 'command' && current.command ? current.command : null;
  writeJsonAtomic(originalFile(), { statusLine: current ?? null, installedAt: new Date().toISOString() });
  fs.copyFileSync(file, `${file}.bak-quota-board`);

  settings.statusLine = { type: 'command', command: bridgeCommand(original) };
  writeJsonAtomic(file, settings);
  process.stdout.write(`statusLine bridge installed in ${file}\n`);
  if (original) process.stdout.write(`the previous status line still runs: ${original}\n`);
  process.stdout.write('backup: ' + `${file}.bak-quota-board\n`);
  process.stdout.write(`for agy, run /statusline inside it and paste:\n  ${agyCommand()}\n`);
  return 0;
}

function uninstall() {
  const file = settingsFile();
  const settings = readJson(file);
  if (!settings) {
    process.stderr.write(`quota-board: cannot read ${file}\n`);
    return 1;
  }
  if (!settings.statusLine?.command?.includes(MARKER)) {
    process.stdout.write('statusLine bridge is not installed\n');
    return 0;
  }
  const saved = readJson(originalFile());
  if (saved?.statusLine) settings.statusLine = saved.statusLine;
  else delete settings.statusLine;
  writeJsonAtomic(file, settings);
  process.stdout.write('statusLine bridge removed\n');
  return 0;
}

process.exitCode = process.argv.includes('--uninstall') ? uninstall() : install();
