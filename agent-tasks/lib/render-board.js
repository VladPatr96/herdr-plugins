'use strict';

// The board's text, built as an array of lines so it can be tested without a
// terminal. Colour is optional for the same reason.
//
// The sidebar has room for a task and a `3/7`. The board is where the plan
// itself lives: which step the agent is on, and what it has already crossed off.

const COLORS = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  bold: '\u001b[1m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  blue: '\u001b[34m',
  grey: '\u001b[90m',
};

function paint(text, color, on) {
  if (!on || !color || !COLORS[color]) return text;
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

// Те же значки, которыми herdr рисует состояние в сайдбаре, чтобы доска и
// сайдбар не расходились в словах.
const STATUS = {
  working: { icon: '◐', color: 'yellow', text: 'работает' },
  idle: { icon: '✳', color: 'green', text: 'ждёт' },
  blocked: { icon: '◼', color: 'red', text: 'спрашивает' },
  done: { icon: '✓', color: 'blue', text: 'закончил' },
  unknown: { icon: '·', color: 'grey', text: 'не понять' },
  gone: { icon: '×', color: 'grey', text: 'пейна нет' },
};

function statusOf(status) {
  return STATUS[status] || STATUS.unknown;
}

function clip(text, width) {
  const value = String(text ?? '');
  if (!Number.isFinite(width) || width <= 1 || value.length <= width) return value;
  return `${value.slice(0, width - 1).trimEnd()}…`;
}

// Прогресс как полоска: глазу нужнее «сколько осталось», чем два числа.
function bar(done, total, width = 10) {
  if (!total) return '';
  const filled = Math.max(0, Math.min(width, Math.round((done / total) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function agentBlock(row, { width, color, plans }) {
  const lines = [];
  const status = statusOf(row.status);
  const head = [
    paint(status.icon, status.color, color),
    paint(clip(row.title, Math.max(20, width - 28)), 'bold', color),
  ].join(' ');
  lines.push(head);

  const meta = [row.kind, row.model, row.hotkey, status.text].filter(Boolean).join(' · ');
  lines.push(`  ${paint(clip(meta, width - 2), 'dim', color)}`);

  if (row.total) {
    const progress = `${bar(row.done, row.total)} ${row.done}/${row.total}`;
    lines.push(`  ${paint(progress, row.done === row.total ? 'green' : 'yellow', color)}`);
  } else {
    lines.push(`  ${paint('плана ещё нет', 'grey', color)}`);
  }

  // Развёрнутый чек-лист — по `p`; свёрнутый показывает только текущий шаг,
  // иначе десять агентов не помещаются на экран.
  const plan = plans && row.total ? row.items : null;
  if (plan) {
    for (const item of plan) {
      const mark = item.done ? paint('✓', 'green', color) : paint('·', 'grey', color);
      const text = item.done ? paint(clip(item.text, width - 6), 'dim', color) : clip(item.text, width - 6);
      lines.push(`    ${mark} ${text}`);
    }
  } else if (row.step) {
    lines.push(`  ${paint(`→ ${clip(row.step, width - 6)}`, 'grey', color)}`);
  }

  return lines;
}

function renderBoard({ rows = [], width = 80, color = true, plans = false, stateDir = null } = {}) {
  const lines = [];
  const title = paint(' Агенты и их задачи ', 'bold', color);
  lines.push(title);
  lines.push(paint('─'.repeat(Math.max(10, Math.min(width, 100))), 'dim', color));

  if (!rows.length) {
    lines.push('');
    lines.push(paint('  Ни одного запущенного агента.', 'grey', color));
    lines.push('');
    lines.push(paint('  Задачу ставит скилл из Claude Code, а запускает', 'grey', color));
    lines.push(paint('  bin/launch.js: агент заводится отдельной вкладкой', 'grey', color));
    lines.push(paint('  и появляется здесь.', 'grey', color));
  }

  for (const row of rows) {
    lines.push('');
    lines.push(...agentBlock(row, { width, color, plans }));
  }

  lines.push('');
  lines.push(paint('─'.repeat(Math.max(10, Math.min(width, 100))), 'dim', color));
  const keys = plans ? 'p свернуть план · r обновить · q закрыть' : 'p показать план · r обновить · q закрыть';
  lines.push(paint(` ${keys}`, 'dim', color));
  if (stateDir) lines.push(paint(` задачи: ${clip(stateDir, width - 10)}`, 'grey', color));
  return lines;
}

module.exports = { renderBoard, agentBlock, bar, clip, statusOf, paint, STATUS };
