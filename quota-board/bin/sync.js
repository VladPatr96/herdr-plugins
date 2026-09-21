#!/usr/bin/env node
'use strict';

// Cheap path: repaint the sidebar from the cache, and only go to the network
// when the cache is older than the TTL. Agent lifecycle events fire often, so
// this must stay quiet when nothing has changed.

const { collect, readCache } = require('../lib/collect');
const { syncSidebar } = require('../lib/sidebar');

const DEFAULT_TTL_SECONDS = 300;

function ttl() {
  const configured = Number(process.env.QUOTA_BOARD_TTL_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_SECONDS;
}

async function main() {
  let cache = readCache();
  const age = cache.updatedAt ? Math.floor(Date.now() / 1000) - cache.updatedAt : Infinity;
  if (age > ttl()) cache = await collect();
  syncSidebar(cache);
}

main().catch((error) => {
  process.stderr.write(`quota-board sync: ${error.message}\n`);
  process.exitCode = 1;
});
