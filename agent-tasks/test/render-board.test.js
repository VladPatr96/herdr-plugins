'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { renderBoard, agentBlock, bar, clip } = require('../lib/render-board');

const ROWS = [
  { paneId: 'w8:p1', title: 'Починить парсер дат', kind: 'claude', model: 'sonnet', hotkey: 'Alt+1', status: 'working', done: 2, total: 5, step: 'Починить разбор', items: [] },
  { paneId: 'w8:p2', title: 'Собрать отчёт', kind: 'codex', model: null, hotkey: 'Alt+2', status: 'blocked', done: 0, total: 0, step: null, items: [] },
];

function plain(lines) {
  return lines.join('\n');
}

test('выбранный агент помечен курсором, остальные нет', () => {
  const text = plain(renderBoard({ rows: ROWS, color: false, selected: 1 }));
  const lines = text.split('\n');
  const first = lines.find((line) => line.includes('Починить парсер дат'));
  const second = lines.find((line) => line.includes('Собрать отчёт'));
  assert.ok(!first.startsWith('▸'), 'невыбранный агент без курсора');
  assert.ok(second.startsWith('▸'), 'выбранный агент с курсором');
});

test('у каждого агента свой номер — им же и переходят', () => {
  const text = plain(renderBoard({ rows: ROWS, color: false, selected: 0 }));
  assert.match(text, /1 ◐ Починить парсер дат/);
  assert.match(text, /2 ◼ Собрать отчёт/);
});

test('десятому агенту номера нет: нажимать нечего', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ ...ROWS[0], paneId: `p${i}`, title: `Задача ${i}` }));
  const text = plain(renderBoard({ rows: many, color: false }));
  assert.ok(text.includes('9 ◐ Задача 8'));
  assert.ok(!text.includes('10 ◐ Задача 9'));
  assert.ok(text.includes('Задача 9'), 'но сам агент из списка не пропадает');
});

test('подсказка называет переход, пока есть куда переходить', () => {
  assert.match(plain(renderBoard({ rows: ROWS, color: false })), /Enter перейти/);
  const empty = plain(renderBoard({ rows: [], color: false }));
  assert.ok(!empty.includes('Enter перейти'), 'в пустом списке переходить некуда');
  assert.match(empty, /Ни одного запущенного агента/);
});

test('прогресс рисуется полоской, а его отсутствие — словами', () => {
  const text = plain(renderBoard({ rows: ROWS, color: false }));
  assert.match(text, /████░░░░░░ 2\/5/);
  assert.match(text, /плана ещё нет/);
  assert.strictEqual(bar(0, 4), '░░░░░░░░░░');
  assert.strictEqual(bar(4, 4), '██████████');
  assert.strictEqual(bar(1, 0), '', 'без плана полоски нет');
});

test('свёрнутый блок показывает текущий шаг, развёрнутый — весь чек-лист', () => {
  const row = { ...ROWS[0], items: [{ done: true, text: 'воспроизвести' }, { done: false, text: 'починить' }] };
  const folded = plain(agentBlock(row, { width: 80, color: false, plans: false }));
  assert.match(folded, /→ Починить разбор/);
  assert.ok(!folded.includes('воспроизвести'), 'свёрнутый чек-лист не показывает пунктов');
  const open = plain(agentBlock(row, { width: 80, color: false, plans: true }));
  assert.match(open, /✓ воспроизвести/);
  assert.match(open, /· починить/);
  assert.ok(!open.includes('→ Починить разбор'), 'развёрнутому плану отдельный «текущий шаг» не нужен');
});

test('длинное не ломает вёрстку', () => {
  const text = clip('я'.repeat(50), 20);
  assert.strictEqual(text.length, 20);
  assert.ok(text.endsWith('…'));
  assert.strictEqual(clip('коротко', 20), 'коротко');
});
