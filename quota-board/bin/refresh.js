#!/usr/bin/env node
'use strict';

// Refresh every provider into the cache. Runs from the `refresh` action, from
// the startup hook, and from the agent lifecycle events with `--if-stale`, so
// picking up a different model or harness updates the numbers by itself
// without hammering a provider on every keystroke.

const { collect, readCache } = require('../lib/collect');
const { ordered } = require('../lib/collect');
const { rememberStateDir } = require('../lib/runtime');

const DEFAULT_TTL_SECONDS = 120;

function ttl() {
  const configured = Number(process.env.QUOTA_BOARD_TTL_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_SECONDS;
}

function isStale() {
  const cache = readCache();
  if (!cache.updatedAt) return true;
  return Math.floor(Date.now() / 1000) - cache.updatedAt > ttl();
}

async function main() {
  // Leave the note the statusLine bridges follow to find this directory.
  rememberStateDir();

  if (process.argv.includes('--if-stale') && !isStale()) return;

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
