'use strict';

// Pure rendering: numbers in, strings out. No colour decisions are made
// anywhere else, and no provider knows how it will be drawn.

const RESET = '\u001b[0m';
const COLORS = {
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  grey: '\u001b[90m',
  bold: '\u001b[1m',
  cyan: '\u001b[36m',
};

function paint(text, color, enabled = true) {
  if (!enabled || !COLORS[color]) return text;
  return `${COLORS[color]}${text}${RESET}`;
}

function leftPercent(usedPercent) {
  const left = 100 - usedPercent;
  return Math.max(0, Math.min(100, left));
}

// Severity follows what is left, never what is used: 18% left is red whether
// the provider reports 82% used or 18% remaining.
function severity(left) {
  if (left <= 10) return 'red';
  if (left <= 25) return 'yellow';
  return 'green';
}

function bar(left, width = 10, color = true) {
  const filled = Math.round((left / 100) * width);
  const body = '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
  return paint(body, severity(left), color);
}

function duration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function resetIn(resetsAt, now = Math.floor(Date.now() / 1000)) {
  if (!Number.isFinite(resetsAt)) return null;
  const left = duration(resetsAt - now);
  return left ? `resets in ${left}` : 'resets now';
}

function windowLine(window, { color = true, now } = {}) {
  const left = leftPercent(window.usedPercent);
  const parts = [
    window.label.padEnd(8),
    bar(left, 10, color),
    `${String(Math.round(left)).padStart(3)}% left`,
  ];
  const reset = resetIn(window.resetsAt, now);
  if (reset) parts.push(paint(`· ${reset}`, 'grey', color));
  if (window.degraded) parts.push(paint(`· ${window.degraded}`, 'yellow', color));
  return parts.join(' ');
}

function balanceLine(balance, { color = true } = {}) {
  const symbol = balance.currency === 'USD' ? '$' : `${balance.currency} `;
  const text = `balance ${symbol}${balance.total}`;
  return paint(text, balance.available === false ? 'red' : 'green', color);
}

const STATE_NOTES = {
  'no-credentials': 'no credentials',
  'setup-needed': 'needs setup',
  unsupported: 'no plan quota',
  error: 'no data',
};

module.exports = {
  paint,
  leftPercent,
  severity,
  bar,
  duration,
  resetIn,
  windowLine,
  balanceLine,
  STATE_NOTES,
  COLORS,
};
