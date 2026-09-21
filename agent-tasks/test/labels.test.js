'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { clamp, tokensFor, diff, planUpdates, MAX_TOKEN } = require('../lib/labels');
const { progress } = require('../lib/plan');

const ENTRY = { paneId: 'w8:pS', title: 'Починить парсер дат', kind: 'claude', model: 'sonnet' };
const PLAN = progress('## План\n- [x] раз\n- [ ] два\n- [ ] три');

test('значение токена не длиннее того, что герdr хранит', () => {
  const long = 'я'.repeat(200);
  const short = clamp(long);
  assert.strictEqual(short.length, MAX_TOKEN);
  assert.ok(short.endsWith('…'), 'обрубок должен выглядеть намеренным');
  assert.strictEqual(clamp('  две   строки\nодна  '), 'две строки одна');
  assert.strictEqual(clamp('   '), null, 'пустое значение убирает токен');
});

test('токены агента — задача, прогресс и текущий шаг', () => {
  assert.deepStrictEqual(tokensFor(ENTRY, PLAN), {
    task: 'Починить парсер дат',
    task_progress: '1/3',
    task_step: 'два',
  });
});

test('без плана прогресс и шаг пропадают, задача остаётся', () => {
  const tokens = tokensFor(ENTRY, progress('# Задача'));
  assert.strictEqual(tokens.task, 'Починить парсер дат');
  assert.strictEqual(tokens.task_progress, null);
  assert.strictEqual(tokens.task_step, null);
});

test('шлём только расхождения, а не всё разом', () => {
  const wanted = { task: 'А', task_progress: '1/3', task_step: null };
  assert.deepStrictEqual(diff(wanted, { task: 'А', task_progress: '0/3' }), { task_progress: '1/3' });
  assert.deepStrictEqual(diff(wanted, { task: 'А', task_progress: '1/3' }), {});
});

test('чужой токен не трогаем, свой ушедший — снимаем', () => {
  const wanted = { task: 'А', task_progress: null, task_step: null };
  // hotkey ставит другой плагин, и его в патч попасть не должно.
  const patch = diff(wanted, { task: 'Б', task_progress: '1/3', hotkey: 'Alt+7' });
  assert.deepStrictEqual(patch, { task: 'А', task_progress: null });
});

test('агент, которого нет в списке, уходит из реестра', () => {
  const entries = { 'w8:pS': ENTRY, 'w8:pZ': { ...ENTRY, paneId: 'w8:pZ', title: 'Закрытая' } };
  const agents = [{ pane_id: 'w8:pS', agent_status: 'working', tokens: {} }];
  const { updates, forget } = planUpdates({ entries, agents, plans: { 'w8:pS': PLAN } });
  assert.deepStrictEqual(forget, ['w8:pZ']);
  assert.strictEqual(updates.length, 1);
  assert.strictEqual(updates[0].paneId, 'w8:pS');
  assert.strictEqual(updates[0].tokens.task_progress, '1/3');
});

test('живой агент с законченной задачей остаётся: это разные вещи', () => {
  const entries = { 'w8:pS': ENTRY };
  const agents = [{ pane_id: 'w8:pS', agent_status: 'idle', tokens: {} }];
  const done = progress('## План\n- [x] раз\n- [x] два');
  const { forget, updates } = planUpdates({ entries, agents, plans: { 'w8:pS': done } });
  assert.deepStrictEqual(forget, []);
  assert.strictEqual(updates[0].tokens.task_progress, '2/2');
});

test('ничего не изменилось — ни одного отчёта', () => {
  const entries = { 'w8:pS': ENTRY };
  const agents = [{ pane_id: 'w8:pS', agent_status: 'working', tokens: tokensFor(ENTRY, PLAN) }];
  const { updates } = planUpdates({ entries, agents, plans: { 'w8:pS': PLAN } });
  assert.deepStrictEqual(updates, []);
});
