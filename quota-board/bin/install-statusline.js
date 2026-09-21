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
  const script = path.join(__dirname, 'statusline.js');
  const base = `node "${script}" claude`;
  return original ? `${base} -- ${original}` : base;
}

function install() {
  const file = settingsFile();
  const settings = readJson(file);
  if (!settings) {
    process.stderr.write(`quota-board: cannot read ${file}\n`);
    return 1;
  }
  const current = settings.statusLine;
  if (current?.command?.includes(MARKER)) {
    process.stdout.write('statusLine bridge is already installed\n');
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
