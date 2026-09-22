'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { borrowPlan, stillThere } = require('../lib/borrow');

const ONE = { paneId: 'w8:p1', title: 'Починить парсер дат' };
const TWO = { paneId: 'w8:p2', title: 'Собрать отчёт' };

test('первый показ: брать некого отдавать, только привести', () => {
  assert.deepStrictEqual(borrowPlan({ borrowed: null, wanted: ONE }), {
    send: null,
    bring: ONE,
    focus: 'w8:p1',
  });
});

test('смена агента: прежний уезжает домой, новый приезжает', () => {
  const plan = borrowPlan({ borrowed: ONE, wanted: TWO });
  assert.deepStrictEqual(plan.send, ONE);
  assert.deepStrictEqual(plan.bring, TWO);
  assert.strictEqual(plan.focus, 'w8:p2');
});

test('тот же агент: только фокус, панель не возят туда-сюда', () => {
  assert.deepStrictEqual(borrowPlan({ borrowed: ONE, wanted: ONE }), {
    send: null,
    bring: null,
    focus: 'w8:p1',
  });
});

test('закрытие списка отдаёт агента домой и никого не приводит', () => {
  assert.deepStrictEqual(borrowPlan({ borrowed: ONE, wanted: null }), {
    send: ONE,
    bring: null,
    focus: null,
  });
  assert.deepStrictEqual(borrowPlan({}), { send: null, bring: null, focus: null });
});

test('агент, закрывшийся рядом со списком, забывается', () => {
  const rows = [{ paneId: 'w8:p1', title: 'Починить парсер дат', status: 'working' }];
  assert.deepStrictEqual(stillThere(ONE, rows), ONE);
  assert.strictEqual(stillThere(ONE, []), null, 'агента нет в списке — возвращать нечего');
  assert.strictEqual(
    stillThere(ONE, [{ paneId: 'w8:p1', status: 'gone' }]),
    null,
    'панели нет — переезжать нечему',
  );
  assert.strictEqual(stillThere(null, rows), null);
});

test('название вкладки берётся из свежей строки', () => {
  const rows = [{ paneId: 'w8:p1', title: 'Новое имя', status: 'idle' }];
  assert.strictEqual(stillThere(ONE, rows).title, 'Новое имя');
  const nameless = [{ paneId: 'w8:p1', title: '', status: 'idle' }];
  assert.strictEqual(stillThere(ONE, nameless).title, 'Починить парсер дат', 'пустое имя не стирает прежнее');
});
