#!/usr/bin/env node
'use strict';

// Puts the `/zapustit-agenta` skill where Claude Code looks for it, with this
// plugin's real path baked in.
//
// A Claude Code session has no way to find a Herdr plugin: `herdr plugin
// action invoke` takes no arguments of its own and returns nothing to the
// caller, so the skill has to call `bin/launch.js` by path. The path is known
// here and nowhere else, so the installer writes it into the copy.
//
//   node bin/install-skill.js              install or refresh
//   node bin/install-skill.js --uninstall  remove it again

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SKILL = 'zapustit-agenta';
const MARKER = 'PLUGIN_ROOT';

function home() {
  return process.env.USERPROFILE || process.env.HOME || os.homedir();
}

function skillsDir() {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home(), '.claude'), 'skills');
}

function pluginRoot() {
  // Herdr sets this for its own hooks; a run by hand infers it from this file.
  return process.env.HERDR_PLUGIN_ROOT || path.resolve(__dirname, '..');
}

function sourceFile() {
  return path.join(__dirname, '..', 'skills', SKILL, 'SKILL.md');
}

function targetFile() {
  return path.join(skillsDir(), SKILL, 'SKILL.md');
}

// Claude Code читает SKILL.md как текст, и путь в нём — просто строка. На
// Windows обратные слеши в пути живут внутри кавычек в команде bash, где `\p`
// съедается оболочкой, поэтому пишем прямые: node их понимает на всех системах.
function install() {
  const root = pluginRoot().replace(/\\/g, '/');
  const text = fs.readFileSync(sourceFile(), 'utf8').split(MARKER).join(root);
  const target = targetFile();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  return { installed: target, pluginRoot: root };
}

function uninstall() {
  const target = targetFile();
  try {
    fs.rmSync(path.dirname(target), { recursive: true, force: true });
    return { removed: target };
  } catch (error) {
    return { removed: null, error: error.message };
  }
}

try {
  const result = process.argv.includes('--uninstall') ? uninstall() : install();
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  process.exitCode = 1;
}
