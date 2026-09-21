'use strict';

// Ask every provider at once, never let one hang the rest, and keep the last
// good answer so a failed refresh degrades to "stale" instead of "unknown".

const path = require('node:path');
const { stateDir, readJson, writeJsonAtomic } = require('./runtime');
const { readUsage } = require('./usage-db');

const PROVIDERS = [
  require('./providers/claude'),
  require('./providers/codex'),
  require('./providers/agy'),
  require('./providers/grok'),
  require('./providers/opencode-go'),
  require('./providers/deepseek'),
];

const CACHE_VERSION = 1;
// How long a previous good reading is still worth showing when a refresh fails.
const STALE_MAX_SECONDS = 6 * 3600;

function cacheFile() {
  return path.join(stateDir(), 'quota.json');
}

function readCache() {
  const cache = readJson(cacheFile());
  if (!cache || cache.version !== CACHE_VERSION) return { version: CACHE_VERSION, providers: {} };
  return cache;
}

function writeCache(cache) {
  writeJsonAtomic(cacheFile(), cache);
}

async function withTimeout(promise, ms, id) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${id} timed out after ${ms / 1000}s`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function collect({ timeoutMs = 25_000, only = null } = {}) {
  const wanted = only ? PROVIDERS.filter((p) => only.includes(p.id)) : PROVIDERS;
  const now = Math.floor(Date.now() / 1000);
  const previous = readCache();

  const results = await Promise.all(
    wanted.map(async (provider) => {
      try {
        const snapshot = await withTimeout(provider.fetchQuota(), timeoutMs, provider.id);
        const fresh = { ...snapshot, id: provider.id, label: provider.label, kind: provider.kind, fetchedAt: now };
        if (fresh.state === 'ok') return fresh;
        // A provider that answered badly once should not erase what it
        // answered well a minute ago: show the last good reading as stale.
        const stale = previous.providers[provider.id];
        if (stale?.state === 'ok' && now - (stale.fetchedAt || 0) < STALE_MAX_SECONDS) {
          return { ...stale, stale: true, note: `last good reading; ${fresh.note || fresh.state}` };
        }
        return fresh;
      } catch (error) {
        const stale = previous.providers[provider.id];
        if (stale?.state === 'ok' && now - (stale.fetchedAt || 0) < STALE_MAX_SECONDS) {
          return { ...stale, stale: true, note: `last good reading; ${error.message}` };
        }
        return {
          id: provider.id,
          label: provider.label,
          kind: provider.kind,
          state: 'error',
          note: String(error.message || error),
          fetchedAt: now,
        };
      }
    }),
  );

  // Local spend per model, for the providers whose requests OpenCode records.
  const usage = readUsage() || {};

  const cache = { version: CACHE_VERSION, updatedAt: now, providers: { ...previous.providers } };
  for (const result of results) {
    cache.providers[result.id] = usage[result.id] ? { ...result, usage: usage[result.id] } : result;
  }
  writeCache(cache);
  return cache;
}

function cachedOrEmpty() {
  const cache = readCache();
  const providers = PROVIDERS.map((provider) => cache.providers[provider.id] || {
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    state: 'unknown',
    note: 'not refreshed yet',
  });
  return { updatedAt: cache.updatedAt || null, providers };
}

function ordered(cache) {
  return PROVIDERS.map((provider) => cache.providers[provider.id]).filter(Boolean);
}

module.exports = { PROVIDERS, collect, readCache, cachedOrEmpty, ordered, cacheFile };
