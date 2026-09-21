'use strict';

// The board's text, built as an array of lines so it can be tested without a
// terminal. Colour is optional for the same reason.

const { paint, windowLine, balanceLine, clock, resetAt, countdown, usageSummary, modelLine, STATE_NOTES } = require('./format');
const { remainingBudget, estimateRequests } = require('./estimate');

const LABEL_WIDTH = 18;
const MIN_TEXT_WIDTH = 24;

// Wrap prose (a note, a reason) at the pane width so an overlay in a narrow
// pane does not break a row in the middle of a word. Bars and numbers are
// never wrapped: they are built to fit.
function wrap(text, width) {
  if (!Number.isFinite(width) || width <= 0) return [text];
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function stateText(snapshot) {
  const summary = STATE_NOTES[snapshot.state] || snapshot.state;
  return snapshot.note ? `${summary}: ${snapshot.note}` : summary;
}

// The widest window name on the board, so every bar starts in the same column
// whatever the provider. Names longer than this are rare and simply push their
// own row; they do not move anyone else's.
function labelColumn(providers) {
  const names = providers.flatMap((snapshot) => (snapshot.windows || []).map((window) => window.label.length));
  return Math.max(8, ...names);
}

// Same idea for the clock column: "resets 17:20" and "resets пт 10:00" are
// different lengths, and without padding the countdowns zigzag.
function resetColumn(providers, now) {
  const widths = providers.flatMap((snapshot) => (snapshot.windows || [])
    .filter((window) => countdown(window.resetsAt, now))
    .map((window) => (resetAt(window.resetsAt, now) || '').length));
  return widths.length ? Math.max(...widths) : 0;
}

function providerBlock(snapshot, { color = true, now, width = 80, labelWidth, resetWidth = 0, models = false, catalog = false } = {}) {
  const lines = [];
  const label = snapshot.label.padEnd(LABEL_WIDTH);
  const textWidth = Math.max(MIN_TEXT_WIDTH, width - LABEL_WIDTH - 1);
  const rows = [];

  if (snapshot.state === 'ok' && snapshot.balance) {
    rows.push(balanceLine(snapshot.balance, { color }));
  } else if (snapshot.state === 'ok' && (snapshot.windows || []).length) {
    const column = labelWidth || Math.max(8, ...snapshot.windows.map((window) => window.label.length));
    for (const window of snapshot.windows) rows.push(windowLine(window, { color, now, labelWidth: column, resetWidth }));
  } else {
    const tone = snapshot.state === 'error' ? 'red' : 'grey';
    for (const line of wrap(stateText(snapshot), textWidth)) rows.push(paint(line, tone, color));
  }

  const extras = [];
  if (snapshot.plan) extras.push(snapshot.plan);
  if (snapshot.stale) extras.push('stale');
  if (snapshot.state === 'ok' && snapshot.note) extras.push(snapshot.note);

  // What this provider actually spent locally, and — folded away unless asked
  // for — the same split per model.
  const budget = remainingBudget(snapshot);
  const spend = usageSummary(snapshot.usage, budget);
  if (spend) extras.push(models ? spend : `${spend}  [m]`);

  rows.forEach((row, index) => {
    const prefix = index === 0 ? paint(label, 'bold', color) : ' '.repeat(LABEL_WIDTH);
    lines.push(`${prefix} ${row}`);
  });
  for (const line of extras.length ? wrap(extras.join(' · '), textWidth) : []) {
    lines.push(`${' '.repeat(LABEL_WIDTH)} ${paint(line, 'grey', color)}`);
  }
  if (models) {
    const spent = snapshot.usage?.models || [];
    const used = new Set(spent.map((model) => model.model));
    // Models with history first, each with its own numbers. The rest of the
    // catalog is a second fold: it is a long list with nothing to say yet.
    const rest = (snapshot.catalog || []).filter((model) => !used.has(model)).map((model) => ({ model, requests: 0 }));
    const rows = catalog ? [...spent, ...rest] : spent;
    if (rows.length) {
      const nameWidth = Math.max(...rows.map((row) => row.model.length));
      const room = Math.max(MIN_TEXT_WIDTH, width - LABEL_WIDTH - 3);
      for (const row of rows) {
        const estimate = row.requests ? estimateRequests(row, budget) : null;
        lines.push(`${' '.repeat(LABEL_WIDTH + 2)} ${paint(modelLine(row, { nameWidth, width: room, estimate }), 'grey', color)}`);
      }
    }
    if (!catalog && rest.length) {
      lines.push(`${' '.repeat(LABEL_WIDTH + 2)} ${paint(`${rest.length} more the plan can run  [a]`, 'grey', color)}`);
    }
  }
  return lines;
}

function updatedLabel(updatedAt, now = Math.floor(Date.now() / 1000)) {
  if (!updatedAt) return 'never refreshed';
  const age = Math.max(0, now - updatedAt);
  const at = clock(updatedAt);
  if (age < 60) return `updated ${at} · ${age}s ago`;
  const minutes = Math.floor(age / 60);
  if (minutes < 60) return `updated ${at} · ${minutes}m ago`;
  return `updated ${at} · ${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

function renderBoard({ providers, updatedAt, busy = false, color = true, now, width = 80, models = false, catalog = false }) {
  const lines = [];
  const subtitle = width >= 60 ? '  ·  every subscription and API you run in Herdr' : '';
  lines.push(paint('AI quota', 'bold', color) + paint(subtitle, 'grey', color));
  lines.push('');
  const labelWidth = labelColumn(providers);
  const resetWidth = resetColumn(providers, now);
  for (const snapshot of providers) {
    lines.push(...providerBlock(snapshot, { color, now, width, labelWidth, resetWidth, models, catalog }));
    lines.push('');
  }
  const status = busy ? 'refreshing…' : updatedLabel(updatedAt, now);
  const hasModels = providers.some((snapshot) => snapshot.usage?.models?.length);
  const hasCatalog = providers.some((snapshot) => snapshot.catalog?.length);
  const keys = [
    'r refresh',
    hasModels ? `m ${models ? 'hide' : 'show'} models` : null,
    models && hasCatalog ? `a ${catalog ? 'hide' : 'show'} catalog` : null,
    'q close',
  ].filter(Boolean);
  lines.push(paint(`${status}   ${keys.join('   ')}`, 'grey', color));
  return lines;
}

module.exports = { renderBoard, providerBlock, updatedLabel, wrap, LABEL_WIDTH };
