'use strict';

// The board's text, built as an array of lines so it can be tested without a
// terminal. Colour is optional for the same reason.

const { paint, windowLine, balanceLine, clock, STATE_NOTES } = require('./format');

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

function providerBlock(snapshot, { color = true, now, width = 80 } = {}) {
  const lines = [];
  const label = snapshot.label.padEnd(LABEL_WIDTH);
  const textWidth = Math.max(MIN_TEXT_WIDTH, width - LABEL_WIDTH - 1);
  const rows = [];

  if (snapshot.state === 'ok' && snapshot.balance) {
    rows.push(balanceLine(snapshot.balance, { color }));
  } else if (snapshot.state === 'ok' && (snapshot.windows || []).length) {
    for (const window of snapshot.windows) rows.push(windowLine(window, { color, now }));
  } else {
    const tone = snapshot.state === 'error' ? 'red' : 'grey';
    for (const line of wrap(stateText(snapshot), textWidth)) rows.push(paint(line, tone, color));
  }

  const extras = [];
  if (snapshot.plan) extras.push(snapshot.plan);
  if (snapshot.stale) extras.push('stale');
  if (snapshot.state === 'ok' && snapshot.note) extras.push(snapshot.note);

  rows.forEach((row, index) => {
    const prefix = index === 0 ? paint(label, 'bold', color) : ' '.repeat(LABEL_WIDTH);
    lines.push(`${prefix} ${row}`);
  });
  for (const line of extras.length ? wrap(extras.join(' · '), textWidth) : []) {
    lines.push(`${' '.repeat(LABEL_WIDTH)} ${paint(line, 'grey', color)}`);
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

function renderBoard({ providers, updatedAt, busy = false, color = true, now, width = 80 }) {
  const lines = [];
  const subtitle = width >= 60 ? '  ·  every subscription and API you run in Herdr' : '';
  lines.push(paint('AI quota', 'bold', color) + paint(subtitle, 'grey', color));
  lines.push('');
  for (const snapshot of providers) {
    lines.push(...providerBlock(snapshot, { color, now, width }));
    lines.push('');
  }
  const status = busy ? 'refreshing…' : updatedLabel(updatedAt, now);
  lines.push(paint(`${status}   r refresh   q close`, 'grey', color));
  return lines;
}

module.exports = { renderBoard, providerBlock, updatedLabel, wrap, LABEL_WIDTH };
