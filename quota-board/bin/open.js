#!/usr/bin/env node
'use strict';

// Opens the board pane. A plugin action cannot open its own pane declaratively,
// so the action asks Herdr for it through HERDR_BIN_PATH, which works the same
// on a Unix socket and a Windows named pipe.

const { execFileSync } = require('node:child_process');

const HERDR = process.env.HERDR_BIN_PATH || 'herdr';
const PLUGIN_ID = process.env.HERDR_PLUGIN_ID || 'vladpatr96.quota-board';

try {
  execFileSync(HERDR, ['plugin', 'pane', 'open', '--plugin', PLUGIN_ID, '--entrypoint', 'board'], {
    stdio: 'inherit',
    windowsHide: true,
  });
} catch (error) {
  process.stderr.write(`quota-board: could not open the board: ${error.message}\n`);
  process.exitCode = 1;
}
