#!/usr/bin/env node
'use strict';

// Claude Code and agy report their plan windows to their own status line and
// nowhere else on this machine, so the bridge has to sit there. This wires it
// into both, keeping whatever status line was already configured: the previous
// command is stored and run through, and the settings file is backed up first.
//
//   node bin/install-statusline.js                  both agents
//   node bin/install-statusline.js --agent agy      one of them
//   node bin/install-statusline.js --uninstall      put the originals back

const fs = require('node:fs');
const path = require('node:path');
const { home, resolveDir, stateDir, readJson, writeJsonAtomic, rememberStateDir } = require('../lib/runtime');

const MARKER = 'quota-board';

const AGENTS = {
  claude: {
    label: 'Claude Code',
    settings: () => path.join(process.env.CLAUDE_CONFIG_DIR || resolveDir(path.join(home(), '.claude')), 'settings.json'),
    // Claude Code takes { type: "command", command: "<shell string>" }.
    wrap: (command) => ({ type: 'command', command }),
  },
  agy: {
    label: 'agy / Antigravity',
    settings: () => path.join(
      process.env.AGY_HOME || path.join(resolveDir(path.join(home(), '.gemini')), 'antigravity-cli'),
      'settings.json',
    ),
    // agy keeps an `enabled` flag next to the command; a disabled status line
    // never runs, so the bridge turns it on.
    wrap: (command) => ({ type: 'command', command, enabled: true }),
  },
};

function bridgeCommand(agent, original) {
  const base = `node ${path.join(__dirname, 'statusline.js')} ${agent}`;
  return original ? `${base} -- ${original}` : base;
}

// Only wrap a status line that can actually run. agy writes the placeholder
// "to enable" into its settings, and wrapping that would keep a broken command
// alive forever.
function isRunnable(command) {
  if (!command) return false;
  const first = command.trim().replace(/^"([^"]+)"/, '$1').split(/\s+/)[0];
  if (!first) return false;
  if (first.includes('/') || first.includes('\\')) return fs.existsSync(first);
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
    : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const extension of extensions) {
      if (fs.existsSync(path.join(dir, first + extension))) return true;
    }
  }
  return false;
}

function originalFile(agent) {
  return path.join(stateDir(), `statusline-${agent}-original.json`);
}

function install(agent) {
  const spec = AGENTS[agent];
  const file = spec.settings();
  const settings = readJson(file);
  if (!settings) {
    process.stdout.write(`${spec.label}: no settings file at ${file} — skipped\n`);
    return 0;
  }

  const current = settings.statusLine;
  const currentCommand = typeof current?.command === 'string' ? current.command : null;

  if (currentCommand?.includes(MARKER)) {
    const wrapped = currentCommand.split(' -- ').slice(1).join(' -- ') || null;
    const repaired = bridgeCommand(agent, wrapped);
    if (repaired === currentCommand && current.enabled !== false) {
      process.stdout.write(`${spec.label}: bridge already installed\n`);
      return 0;
    }
    settings.statusLine = spec.wrap(repaired);
    writeJsonAtomic(file, settings);
    process.stdout.write(`${spec.label}: bridge repaired in ${file}\n`);
    return 0;
  }

  const original = isRunnable(currentCommand) ? currentCommand : null;
  writeJsonAtomic(originalFile(agent), { statusLine: current ?? null, installedAt: new Date().toISOString() });
  fs.copyFileSync(file, `${file}.bak-quota-board`);

  settings.statusLine = spec.wrap(bridgeCommand(agent, original));
  writeJsonAtomic(file, settings);

  process.stdout.write(`${spec.label}: bridge installed in ${file}\n`);
  if (original) process.stdout.write(`  the previous status line still runs: ${original}\n`);
  else if (currentCommand) process.stdout.write(`  the previous command "${currentCommand}" could not run and was replaced\n`);
  process.stdout.write(`  backup: ${file}.bak-quota-board\n`);
  process.stdout.write('  restart that agent for the change to take effect\n');
  return 0;
}

function uninstall(agent) {
  const spec = AGENTS[agent];
  const file = spec.settings();
  const settings = readJson(file);
  if (!settings) return 0;
  if (!settings.statusLine?.command?.includes(MARKER)) {
    process.stdout.write(`${spec.label}: bridge is not installed\n`);
    return 0;
  }
  const saved = readJson(originalFile(agent));
  if (saved?.statusLine) settings.statusLine = saved.statusLine;
  else delete settings.statusLine;
  writeJsonAtomic(file, settings);
  process.stdout.write(`${spec.label}: bridge removed\n`);
  return 0;
}

function main() {
  // The bridge finds the state directory through this pointer.
  rememberStateDir();

  const flag = process.argv.indexOf('--agent');
  const wanted = flag >= 0 && process.argv[flag + 1] ? [process.argv[flag + 1]] : Object.keys(AGENTS);
  const uninstalling = process.argv.includes('--uninstall');

  let code = 0;
  for (const agent of wanted) {
    if (!AGENTS[agent]) {
      process.stderr.write(`quota-board: unknown agent ${agent}\n`);
      code = 2;
      continue;
    }
    code = (uninstalling ? uninstall(agent) : install(agent)) || code;
  }
  return code;
}

process.exitCode = main();
