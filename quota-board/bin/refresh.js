#!/usr/bin/env node
'use strict';

// Refresh every provider into the cache, so the next time the window opens it
// has numbers to draw immediately. Backs the `refresh` action and the startup
// hook.

const { collect, ordered } = require('../lib/collect');

async function main() {
  const cache = await collect();
  if (process.argv.includes('--verbose')) {
    for (const snapshot of ordered(cache)) {
      process.stdout.write(`${snapshot.label.padEnd(18)} ${snapshot.state.padEnd(15)} ${snapshot.note || ''}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`quota-board refresh: ${error.message}\n`);
  process.exitCode = 1;
});
