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
  assert.match(plain(renderBoard({ rows: ROWS, color: false, width: 60 })), /Enter показать/);
  const empty = plain(renderBoard({ rows: [], color: false, width: 60 }));
  assert.ok(!empty.includes('Enter показать'), 'в пустом списке показывать некого');
  assert.match(empty, /Ни одного запущенного агента/);
});

test('в узкой колонке подсказка ужимается до клавиш, а не переносится', () => {
  const wide = plain(renderBoard({ rows: ROWS, color: false, width: 60 }));
  assert.match(wide, /↑↓ выбрать · Enter показать/);
  const narrow = renderBoard({ rows: ROWS, color: false, width: 24 });
  for (const hint of narrow.filter((line) => /Enter|q закрыть|· q/.test(line))) {
    assert.ok(hint.length <= 24, `подсказка шире колонки: ${JSON.stringify(hint)}`);
  }
  assert.ok(!plain(narrow).includes('выбрать'), 'слова уходят, клавиши остаются');
});

test('каждый переключатель назван тем, что он сделает', () => {
  const folded = plain(renderBoard({ rows: ROWS, color: false, width: 90, plans: false, split: 'down', hidden: false }));
  assert.match(folded, /p показать план/);
  assert.match(folded, /d вправо/);
  assert.match(folded, /s убрать из сайдбара/);
  const open = plain(renderBoard({ rows: ROWS, color: false, width: 90, plans: true, split: 'right', hidden: true }));
  assert.match(open, /p свернуть план/);
  assert.match(open, /d вниз/);
  assert.match(open, /s вернуть в сайдбар/);
});

test('подсказка ужимается по ширине, но направление не теряет', () => {
  const mid = renderBoard({ rows: ROWS, color: false, width: 60, split: 'right' }).find((l) => l.includes('q закрыть'));
  assert.ok(mid.length <= 60, `не влезло: ${mid.length}`);
  assert.match(mid, /d вниз/, 'куда переложит — видно на любой ширине');
});

test('отпустить предлагается только когда есть кого', () => {
  assert.ok(!plain(renderBoard({ rows: ROWS, color: false, width: 60 })).includes('o отпустить'));
  assert.match(plain(renderBoard({ rows: ROWS, color: false, width: 60, borrowed: 'w8:p2' })), /o отпустить/);
});

test('агент, стоящий рядом со списком, помечен отдельно от выбранного', () => {
  const lines = renderBoard({ rows: ROWS, color: false, width: 60, selected: 0, borrowed: 'w8:p2' });
  const first = lines.findIndex((line) => line.includes('Починить парсер дат'));
  assert.ok(!lines[first + 1].includes('рядом'), 'выбранный курсором — ещё не показанный');
  assert.ok(!plain(lines).includes('рядом'), 'подробности показываются только под курсором');

  const moved = renderBoard({ rows: ROWS, color: false, width: 60, selected: 1, borrowed: 'w8:p2' });
  const second = moved.findIndex((line) => line.includes('Собрать отчёт'));
  assert.ok(moved[second + 1].includes('рядом'), 'встали на него — видно, что он тут же');
  assert.match(plain(moved), /o отпустить/);
});

test('прогресс рисуется полоской, а его отсутствие — словами', () => {
  const text = plain(renderBoard({ rows: ROWS, color: false }));
  assert.match(text, /██░░░░  2[/]5/, 'полоска и счётчик стоят в своей колонке');
  assert.match(plain(renderBoard({ rows: ROWS, color: false, selected: 1 })), /плана ещё нет/);
  assert.strictEqual(bar(0, 4, 6), '░░░░░░');
  assert.strictEqual(bar(4, 4, 6), '██████');
  assert.strictEqual(bar(1, 0), '', 'без плана полоски нет');
});

test('у выбранного свёрнутый план — текущий шаг, развёрнутый — весь чек-лист', () => {
  const row = { ...ROWS[0], items: [{ done: true, text: 'воспроизвести' }, { done: false, text: 'починить' }] };
  const folded = plain(agentBlock(row, { width: 80, color: false, plans: false, selected: true }));
  assert.match(folded, /→ Починить разбор/);
  assert.ok(!folded.includes('воспроизвести'), 'свёрнутый чек-лист не показывает пунктов');
  const open = plain(agentBlock(row, { width: 80, color: false, plans: true, selected: true }));
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

const MANY = Array.from({ length: 10 }, (_, i) => ({
  paneId: `w8:p${i}`,
  title: `Задача ${i}`,
  kind: 'claude',
  model: 'sonnet',
  hotkey: `Alt+${i}`,
  status: 'working',
  done: 1,
  total: 3,
  step: `Шаг ${i}`,
  items: [],
}));

test('список не вылезает за высоту панели', () => {
  for (const height of [30, 20, 12, 8]) {
    const lines = renderBoard({ rows: MANY, color: false, width: 80, height });
    assert.ok(lines.length <= height, `при height=${height} строк ${lines.length}`);
  }
});

test('в обрезанном списке остаются и шапка, и подсказки', () => {
  const text = plain(renderBoard({ rows: MANY, color: false, width: 80, height: 14 }));
  assert.match(text, /Агенты и их задачи/);
  assert.match(text, /q закрыть/);
});

test('окно едет за выбранным: выбранный агент виден всегда', () => {
  for (const selected of [0, 4, 9]) {
    const text = plain(renderBoard({ rows: MANY, color: false, width: 80, height: 16, selected }));
    assert.match(text, new RegExp(`Задача ${selected}`), `выбранный ${selected} не виден`);
  }
});

test('спрятанное названо числом, а не молчанием', () => {
  const top = plain(renderBoard({ rows: MANY, color: false, width: 80, height: 16, selected: 0 }));
  assert.ok(!top.includes('↑ ещё'), 'сверху прятать нечего');
  assert.match(top, /↓ ещё \d+ ниже/);
  const bottom = plain(renderBoard({ rows: MANY, color: false, width: 80, height: 16, selected: 9 }));
  assert.match(bottom, /↑ ещё \d+ выше/);
  assert.ok(!bottom.includes('↓ ещё'), 'снизу прятать нечего');
});

test('окно прилипает к началу, пока выбранный виден', () => {
  const text = plain(renderBoard({ rows: MANY, color: false, width: 80, height: 20, selected: 1 }));
  assert.match(text, /Задача 0/, 'ради второго агента первый не уезжает');
});

test('агент, который сам выше окна, показывается обрезанным, а не пропадает', () => {
  const huge = [{ ...MANY[0], title: 'Длинный план', total: 20, done: 1, items: Array.from({ length: 20 }, (_, i) => ({ done: false, text: `пункт ${i}` })) }];
  const lines = renderBoard({ rows: huge, color: false, width: 80, height: 12, plans: true });
  assert.ok(lines.length <= 12, `строк ${lines.length}`);
  assert.match(plain(lines), /Длинный план/);
  assert.match(plain(lines), /↓ не поместилось/);
});

test('без заданной высоты список как был — целиком', () => {
  const text = plain(renderBoard({ rows: MANY, color: false, width: 80 }));
  for (let i = 0; i < 10; i += 1) assert.match(text, new RegExp(`Задача ${i}`));
  assert.ok(!text.includes('ещё'), 'резать нечего — и говорить не о чем');
});

test('в низкой панели выбранный агент назван, а не съеден обрезкой', () => {
  for (const height of [12, 10, 9, 8, 7, 6]) {
    const lines = renderBoard({ rows: MANY, color: false, width: 80, height, plans: true, stateDir: 'C:\tasks' });
    assert.ok(lines.length <= height, `при height=${height} строк ${lines.length}`);
    assert.match(plain(lines), /Задача 0/, `при height=${height} выбранного не видно`);
  }
});

test('когда места нет совсем, подсказки уступают его списку', () => {
  const lines = renderBoard({ rows: MANY, color: false, width: 80, height: 6, plans: true, stateDir: 'C:\tasks' });
  assert.ok(lines.length <= 6);
  assert.match(plain(lines), /Агенты и их задачи/, 'шапка остаётся: по ней видно, куда смотришь');
  assert.match(plain(lines), /Задача 0/);
});

test('высота ровно в размер списка ничего не режет', () => {
  const whole = renderBoard({ rows: MANY, color: false, width: 80, plans: true, stateDir: 'C:\tasks' });
  const exact = renderBoard({ rows: MANY, color: false, width: 80, plans: true, stateDir: 'C:\tasks', height: whole.length });
  assert.deepStrictEqual(exact, whole, 'впритык — это ещё «влезло»');
  assert.ok(!plain(exact).includes('ещё'), 'прятать нечего — и пометок нет');
});

const CREW = [
  { paneId: 'p1', tabId: 't1', title: 'Починить парсер дат', kind: 'claude', model: 'sonnet', hotkey: 'Alt+1', status: 'working', done: 2, total: 5, step: 'Починить разбор', items: [{ done: true, text: 'воспроизвести' }, { done: false, text: 'починить разбор' }] },
  { paneId: 'p2', tabId: 't2', title: 'Собрать отчёт', kind: 'codex', model: null, hotkey: 'Alt+Shift+O', status: 'blocked', done: 0, total: 0, step: null, items: [] },
  { paneId: 'p3', tabId: 't3', title: 'Выгрузка за март', kind: 'agy', model: 'gemini-3.1-pro-high', hotkey: 'Alt+3', status: 'done', done: 12, total: 12, step: null, items: [{ done: true, text: 'раз' }] },
];

function titleLines(lines) {
  return CREW.map((row) => lines.find((line) => line.includes(row.title)));
}

test('невыбранный агент занимает ровно строку', () => {
  assert.strictEqual(agentBlock(CREW[0], { width: 80, color: false, plans: true, selected: false }).length, 1);
  assert.ok(agentBlock(CREW[0], { width: 80, color: false, plans: true, selected: true }).length > 1);
});

test('колонки стоят на одном месте у всех агентов', () => {
  const lines = renderBoard({ rows: CREW, color: false, width: 76, selected: 0 });
  const heads = titleLines(lines);
  const widths = new Set(heads.map((line) => line.length));
  assert.strictEqual(widths.size, 1, `строки разной длины: ${[...widths].join(', ')}`);
  for (const [i, line] of heads.entries()) {
    assert.ok(line.endsWith(CREW[i].hotkey), `хоткей не у правого края: ${JSON.stringify(line)}`);
  }
  // Счётчик прижат вправо, поэтому 2/5 и 12/12 кончаются в одной колонке.
  assert.strictEqual(heads[0].indexOf('2/5') + '2/5'.length, heads[2].indexOf('12/12') + '12/12'.length);
});

test('агент без плана колонку не ломает', () => {
  const heads = titleLines(renderBoard({ rows: CREW, color: false, width: 76, selected: 0 }));
  assert.ok(!heads[1].includes('/'), 'нечего считать — счётчика нет');
  assert.ok(heads[1].endsWith('Alt+Shift+O'), 'а колонка хоткея на месте');
});

test('план идёт под шкалой и только у того, на ком курсор', () => {
  const lines = renderBoard({ rows: CREW, color: false, width: 76, selected: 0, plans: true });
  const head = lines.findIndex((line) => line.includes('Починить парсер дат'));
  assert.match(lines[head], /██░░░░[ ]+2[/]5/, 'шкала — в строке агента');
  assert.match(lines[head + 1], /claude · sonnet · работает/, 'под ней — кто он и что с ним');
  assert.match(lines[head + 2], /✓ воспроизвести/, 'а следом план');
  assert.match(lines[head + 3], /· починить разбор/);

  const other = lines.findIndex((line) => line.includes('Выгрузка за март'));
  assert.ok(!lines[other + 1] || !lines[other + 1].includes('раз'), 'у невыбранного плана не видно');
});

test('закрытие названо в подсказке', () => {
  assert.match(plain(renderBoard({ rows: CREW, color: false, width: 76 })), /x закрыть/);
  assert.ok(!plain(renderBoard({ rows: [], color: false, width: 76 })).includes('x закрыть'), 'закрывать некого');
});
