#!/usr/bin/env node
'use strict';

// statusLine bridge. Claude Code and agy hand their status line command a JSON
// blob on stdin; that blob is the only local place their plan quota appears.
// This stores the quota part and then behaves like the status line it replaced:
// anything after `--` is run with the same stdin and its output is passed
// through, so an existing status line keeps working.
//
//   node bin/statusline.js agy
//   node bin/statusline.js claude -- powershell -File C:\path\to\your-statusline.ps1

const { spawn } = require('node:child_process');
const statusline = require('../lib/statusline-store');

function readStdin() {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
    // A status line always gets stdin; do not hang forever if it does not.
    setTimeout(() => resolve(input), 5000).unref();
  });
}

function store(provider, input) {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return;
  }
  const snapshot = {};
  if (payload.rate_limits) snapshot.rate_limits = payload.rate_limits;
  if (payload.quota) snapshot.quota = payload.quota;
  if (payload.model) snapshot.model = payload.model;
  if (Object.keys(snapshot).length) statusline.save(provider, snapshot);
}

// One argument is the original status line as a single shell string (that is
// how Claude Code stores it); several arguments are a plain argv.
function passThrough(argv, input) {
  return new Promise((resolve) => {
    const asShellString = argv.length === 1;
    const child = asShellString
      ? spawn(argv[0], { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true, shell: true })
      : spawn(argv[0], argv.slice(1), {
        stdio: ['pipe', 'inherit', 'inherit'],
        windowsHide: true,
        shell: process.platform === 'win32',
      });
    child.on('error', () => resolve());
    child.on('close', () => resolve());
    child.stdin.end(input);
  });
}

async function main() {
  const [provider, ...rest] = process.argv.slice(2);
  if (!provider) {
    process.stderr.write('usage: statusline.js <claude|agy> [-- <original status line command>]\n');
    process.exitCode = 2;
    return;
  }
  const input = await readStdin();
  store(provider, input);

  const separator = rest.indexOf('--');
  const wrapped = separator >= 0 ? rest.slice(separator + 1) : rest;
  if (wrapped.length) await passThrough(wrapped, input);
}

main();
