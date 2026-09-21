#!/usr/bin/env node
'use strict';

// Refresh every provider and push the result into the sidebar. Backs the
// `refresh` action, the startup hook and the agent lifecycle events.

const { collect, ordered } = require('../lib/collect');
const { sidebarToken } = require('../lib/format');
const { syncSidebar } = require('../lib/sidebar');

async function main() {
  const cache = await collect();
  syncSidebar(cache);
  if (process.argv.includes('--verbose')) {
    for (const snapshot of ordered(cache)) {
      process.stdout.write(`${snapshot.label.padEnd(18)} ${snapshot.state.padEnd(15)} ${sidebarToken(snapshot).padEnd(10)} ${snapshot.note || ''}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`quota-board refresh: ${error.message}\n`);
  process.exitCode = 1;
});
