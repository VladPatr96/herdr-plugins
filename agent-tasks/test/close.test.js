'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { closePlan } = require('../lib/close');

const LIVE = { paneId: 'w8:p1', tabId: 'w8:t1', title: 'Починить парсер дат', status: 'idle' };

test('живого агента закрывают только с подтверждением', () => {
  const plan = closePlan({ row: LIVE });
  assert.strictEqual(plan.confirm, true);
  assert.match(plan.question, /Починить парсер дат/, 'спрашивают про конкретного, а не «этого»');
  assert.strictEqual(plan.closeTab, null, 'до ответа ничего не закрывается');
});

test('подтверждённое закрытие называет вкладку, а не панель: уходит вся', () => {
  const plan = closePlan({ row: LIVE, confirmed: true });
  assert.strictEqual(plan.confirm, false);
  assert.strictEqual(plan.closeTab, 'w8:t1');
  assert.strictEqual(plan.closePane, null);
  assert.strictEqual(plan.forget, 'w8:p1', 'строка уходит из реестра');
});

test('вкладка неизвестна — закрывается панель', () => {
  const plan = closePlan({ row: { ...LIVE, tabId: null }, confirmed: true });
  assert.strictEqual(plan.closeTab, null);
  assert.strictEqual(plan.closePane, 'w8:p1');
});

test('агент стоит под списком — закрывается панель, а не вкладка', () => {
  // Одолженная панель переехала во вкладку доски. Закрыть вкладку — закрыть
  // вместе с ним и сам список.
  const row = { ...LIVE, tabId: 'w8:board' };
  const plan = closePlan({ row, confirmed: true, boardTab: 'w8:board', borrowed: { paneId: 'w8:p1' } });
  assert.strictEqual(plan.closeTab, null, 'вкладка доски остаётся');
  assert.strictEqual(plan.closePane, 'w8:p1');
  assert.strictEqual(plan.release, true);
});

test('чужая вкладка закрывается целиком', () => {
  const plan = closePlan({ row: LIVE, confirmed: true, boardTab: 'w8:board' });
  assert.strictEqual(plan.closeTab, 'w8:t1');
  assert.strictEqual(plan.closePane, null);
});

test('у мёртвого агента спрашивать нечего: строка просто уходит', () => {
  const plan = closePlan({ row: { ...LIVE, status: 'gone' } });
  assert.strictEqual(plan.confirm, false, 'закрывать нечего — и подтверждать нечего');
  assert.strictEqual(plan.closeTab, null);
  assert.strictEqual(plan.closePane, null);
  assert.strictEqual(plan.forget, 'w8:p1');
});

test('агента, стоящего рядом со списком, сперва отпускают', () => {
  const borrowed = { paneId: 'w8:p1', title: 'Починить парсер дат' };
  assert.strictEqual(closePlan({ row: LIVE, confirmed: true, borrowed }).release, true);
  assert.strictEqual(closePlan({ row: LIVE, confirmed: true, borrowed: { paneId: 'w8:p9' } }).release, false);
});

test('закрывать некого — плана нет', () => {
  const plan = closePlan({ row: null });
  assert.strictEqual(plan.confirm, false);
  assert.strictEqual(plan.forget, null);
});
