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

// Clock times are the machine's own: this runs next to the terminal the person
// is looking at, so its timezone is the one that answers "when does it reset".
function clock(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function weekday(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleDateString([], { weekday: 'short' });
}

// Same day: the time is enough. Further out: the weekday carries it.
function resetAt(resetsAt, now = Math.floor(Date.now() / 1000)) {
  if (!Number.isFinite(resetsAt)) return null;
  if (resetsAt - now <= 0) return 'resets now';
  const sameDay = new Date(resetsAt * 1000).toDateString() === new Date(now * 1000).toDateString();
  return `resets ${sameDay ? clock(resetsAt) : `${weekday(resetsAt)} ${clock(resetsAt)}`}`;
}

// The countdown stays beside the clock time, because "in 3d" is what you plan
// around. Kept apart from resetAt so both columns can be padded to line up.
function countdown(resetsAt, now = Math.floor(Date.now() / 1000)) {
  if (!Number.isFinite(resetsAt)) return null;
  const left = duration(resetsAt - now);
  return left ? `in ${left}` : null;
}

function resetIn(resetsAt, now = Math.floor(Date.now() / 1000)) {
  const at = resetAt(resetsAt, now);
  if (!at) return null;
  const left = countdown(resetsAt, now);
  return left ? `${at} · ${left}` : at;
}

function windowLine(window, { color = true, now, labelWidth = 8, resetWidth = 0 } = {}) {
  const left = leftPercent(window.usedPercent);
  const parts = [
    window.label.padEnd(labelWidth),
    bar(left, 10, color),
    `${String(Math.round(left)).padStart(3)}% left`,
  ];
  const at = resetAt(window.resetsAt, now);
  const left_time = countdown(window.resetsAt, now);
  if (at) {
    // Pad the clock column so the countdowns of every row start together.
    const padded = left_time ? at.padEnd(resetWidth) : at;
    parts.push(paint(`· ${padded}${left_time ? ` · ${left_time}` : ''}`, 'grey', color));
  }
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
  clock,
  paint,
  leftPercent,
  severity,
  bar,
  duration,
  resetIn,
  resetAt,
  countdown,
  windowLine,
  balanceLine,
  STATE_NOTES,
  COLORS,
};
