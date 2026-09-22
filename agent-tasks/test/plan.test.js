'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { progress, progressLabel, currentItem, planSection } = require('../lib/plan');

const FILE = [
  '# Починить парсер дат',
  '',
  'Даты вида 31.02 роняют импорт. Проверка: `npm test` зелёный.',
  '',
  '- [x] этот чекбокс в тексте задачи, а не в плане',
  '',
  '## План',
  '',
  '- [x] Воспроизвести падение тестом',
  '- [ ] Починить разбор',
  '- [ ] Прогнать весь набор',
  '',
].join('\n');

test('план читается из своего раздела, а не из всего файла', () => {
  const plan = progress(FILE);
  assert.strictEqual(plan.total, 3, 'чекбокс из текста задачи в план не попадает');
  assert.strictEqual(plan.done, 1);
  assert.strictEqual(plan.items[0].text, 'Воспроизвести падение тестом');
});

test('раздел плана кончается на следующем заголовке того же уровня', () => {
  const text = ['## План', '- [ ] один', '## Что вышло', '- [x] не пункт плана'].join('\n');
  const plan = progress(text);
  assert.strictEqual(plan.total, 1);
});

test('вложенный заголовок раздел не закрывает', () => {
  const text = ['## План', '- [ ] один', '### Подробности', '- [x] всё ещё план'].join('\n');
  assert.strictEqual(progress(text).total, 2);
});

test('без раздела плана — не ноль пунктов, а отсутствие плана', () => {
  const plan = progress('# Задача\n\nПросто текст.');
  assert.strictEqual(plan.total, 0);
  assert.strictEqual(plan.hasPlan, false);
  assert.strictEqual(progressLabel(plan), null, 'токен должен пропасть, а не показать 0/0');
  assert.strictEqual(planSection('# Задача'), null);
});

test('подпись прогресса и текущий шаг', () => {
  const plan = progress(FILE);
  assert.strictEqual(progressLabel(plan), '1/3');
  assert.strictEqual(currentItem(plan), 'Починить разбор');
});

test('когда всё отмечено, текущего шага нет', () => {
  const plan = progress('## План\n- [x] раз\n- [X] два');
  assert.strictEqual(progressLabel(plan), '2/2');
  assert.strictEqual(currentItem(plan), null);
});

test('пункты узнаются в разной разметке и с отступом', () => {
  const plan = progress(['## План', '* [ ] звёздочкой', '+ [x] плюсом', '  - [ ] с отступом'].join('\n'));
  assert.strictEqual(plan.total, 3);
  assert.strictEqual(plan.done, 1);
});

test('пустой пункт всё равно пункт', () => {
  const plan = progress('## План\n- [ ]\n- [x] подписанный');
  assert.strictEqual(plan.total, 2);
  assert.strictEqual(plan.items[0].text, '');
});

test('текст без файла и мусор не роняют разбор', () => {
  assert.strictEqual(progress(null).total, 0);
  assert.strictEqual(progress(undefined).hasPlan, false);
  assert.strictEqual(progress('## План\n- [y] не чекбокс').total, 0);
});
