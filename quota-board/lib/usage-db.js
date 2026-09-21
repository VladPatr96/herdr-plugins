'use strict';

// Per-model spend, read straight from OpenCode's own database. Every assistant
// message it stores carries the model, the provider it was billed to, the token
// counts (including cache reads and writes) and the cost OpenCode computed, so
// "what did that request cost" needs no API of ours.
//
// node:sqlite is experimental; if it is missing, or the database is not there,
// the board simply shows no breakdown rather than failing.

const os = require('node:os');
const path = require('node:path');
const { xdgData } = require('./runtime');

// Wide enough that a subscription's own 30-day window is covered; OpenCode Go
// bills monthly, and a week of history says nothing about it.
// Override with QUOTA_BOARD_USAGE_DAYS.
const DEFAULT_WINDOW_DAYS = 30;

function windowDays() {
  const configured = Number(process.env.QUOTA_BOARD_USAGE_DAYS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WINDOW_DAYS;
}

function databaseFile() {
  return process.env.OPENCODE_DB_PATH || path.join(xdgData(), 'opencode', 'opencode.db');
}

function open() {
  let sqlite;
  try {
    sqlite = require('node:sqlite');
  } catch {
    return null;
  }
  try {
    return new sqlite.DatabaseSync(databaseFile(), { readOnly: true });
  } catch {
    return null;
  }
}

function emptyTotals() {
  return { requests: 0, cost: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, lastAt: null };
}

function add(totals, message) {
  const tokens = message.tokens || {};
  const cache = tokens.cache || {};
  totals.requests += 1;
  totals.cost += Number(message.cost) || 0;
  totals.input += Number(tokens.input) || 0;
  totals.output += Number(tokens.output) || 0;
  totals.reasoning += Number(tokens.reasoning) || 0;
  totals.cacheRead += Number(cache.read) || 0;
  totals.cacheWrite += Number(cache.write) || 0;
  const completed = message.time?.completed || message.time?.created || null;
  if (completed && (!totals.lastAt || completed > totals.lastAt)) totals.lastAt = completed;
}

// One pass over the window, grouped by provider and model. Rows come back
// sorted by cost, because that is the question being asked.
function readUsage({ days = windowDays(), now = Date.now() } = {}) {
  const db = open();
  if (!db) return null;
  const since = now - days * 86400_000;
  try {
    const rows = db.prepare('SELECT data FROM message WHERE time_created >= ?').all(since);
    const byProvider = new Map();
    for (const row of rows) {
      let message;
      try {
        message = JSON.parse(row.data);
      } catch {
        continue;
      }
      if (message.role !== 'assistant' || !message.providerID) continue;
      const provider = byProvider.get(message.providerID) || { totals: emptyTotals(), models: new Map() };
      add(provider.totals, message);
      const model = message.modelID || 'unknown';
      const totals = provider.models.get(model) || emptyTotals();
      add(totals, message);
      provider.models.set(model, totals);
      byProvider.set(message.providerID, provider);
    }

    const out = {};
    for (const [providerId, provider] of byProvider) {
      out[providerId] = {
        ...provider.totals,
        days,
        models: [...provider.models.entries()]
          .map(([model, totals]) => ({ model, ...totals }))
          .sort((a, b) => b.cost - a.cost || b.requests - a.requests),
      };
    }
    return out;
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {
      /* already gone */
    }
  }
}

module.exports = { readUsage, databaseFile, windowDays };
