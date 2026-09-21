'use strict';

// The board's text, built as an array of lines so it can be tested without a
// terminal. Colour is optional for the same reason.

const { paint, windowLine, balanceLine, STATE_NOTES } = require('./format');

const LABEL_WIDTH = 18;

function stateLine(snapshot, color) {
  const summary = STATE_NOTES[snapshot.state] || snapshot.state;
  const detail = snapshot.note ? `: ${snapshot.note}` : '';
  const tone = snapshot.state === 'error' ? 'red' : 'grey';
  return paint(`${summary}${detail}`, tone, color);
}

function providerBlock(snapshot, { color = true, now } = {}) {
  const lines = [];
  const label = snapshot.label.padEnd(LABEL_WIDTH);
  const rows = [];

  if (snapshot.state === 'ok' && snapshot.balance) {
    rows.push(balanceLine(snapshot.balance, { color }));
  } else if (snapshot.state === 'ok' && (snapshot.windows || []).length) {
    for (const window of snapshot.windows) rows.push(windowLine(window, { color, now }));
  } else {
    rows.push(stateLine(snapshot, color));
  }

  const extras = [];
  if (snapshot.plan) extras.push(snapshot.plan);
  if (snapshot.stale) extras.push('stale');
  if (snapshot.state === 'ok' && snapshot.note) extras.push(snapshot.note);

  rows.forEach((row, index) => {
    const prefix = index === 0 ? paint(label, 'bold', color) : ' '.repeat(LABEL_WIDTH);
    lines.push(`${prefix} ${row}`);
  });
  if (extras.length) {
    lines.push(`${' '.repeat(LABEL_WIDTH)} ${paint(extras.join(' · '), 'grey', color)}`);
  }
  return lines;
}

function updatedLabel(updatedAt, now = Math.floor(Date.now() / 1000)) {
  if (!updatedAt) return 'never refreshed';
  const age = Math.max(0, now - updatedAt);
  if (age < 60) return `updated ${age}s ago`;
  const minutes = Math.floor(age / 60);
  if (minutes < 60) return `updated ${minutes}m ago`;
  return `updated ${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

function renderBoard({ providers, updatedAt, busy = false, color = true, now }) {
  const lines = [];
  lines.push(paint('AI quota', 'bold', color) + paint('  ·  every subscription and API you run in Herdr', 'grey', color));
  lines.push('');
  for (const snapshot of providers) {
    lines.push(...providerBlock(snapshot, { color, now }));
    lines.push('');
  }
  const status = busy ? 'refreshing…' : updatedLabel(updatedAt, now);
  lines.push(paint(`${status}   r refresh   q close`, 'grey', color));
  return lines;
}

module.exports = { renderBoard, providerBlock, updatedLabel, LABEL_WIDTH };
