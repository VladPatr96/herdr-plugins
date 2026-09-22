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

// Ширина полоски прогресса. Короткая: в строке рядом с задачей она — не
// диаграмма, а намёк, сколько осталось; точное число стоит тут же.
const BAR = 6;

function counterOf(row) {
  return row.total ? `${row.done}/${row.total}` : '';
}

// Колонки считаются по всему списку сразу: счётчик и хоткей у всех агентов
// стоят столбиком, иначе `2/5` и `12/12` разъезжаются и список читается как
// куча, а не как таблица.
function columnsFor(rows) {
  const width = (values) => values.reduce((max, value) => Math.max(max, value.length), 0);
  return {
    counter: width(rows.map(counterOf)),
    hotkey: width(rows.map((row) => row.hotkey || '')),
  };
}

// Агент — это строка: курсор, номер, значок состояния, задача, полоска со
// счётчиком и хоткей. Всё, что нужно, чтобы выбрать глазами.
//
// Подробности — род, модель, состояние и план — показываются **только у того,
// на ком курсор**. Так десять агентов помещаются на экран, а про того, кем
// занят, видно всё.
function agentBlock(row, { width, color, plans, selected = false, number = null, here = false, columns = null } = {}) {
  const status = statusOf(row.status);
  const counter = counterOf(row);
  const cw = columns ? columns.counter : counter.length;
  const hotkey = row.hotkey || '';
  const hw = columns ? columns.hotkey : hotkey.length;

  // Курсор и номер — одна колонка: номер жмут, чтобы перейти, и глаз ищет его
  // там же, где курсор.
  const lead = `${selected ? '▸' : ' '}${number === null ? ' ' : number} ${status.icon} `;
  const bars = row.total ? bar(row.done, row.total, BAR) : ' '.repeat(BAR);
  const tail = `${bars}  ${counter.padStart(cw)}  ${hotkey.padStart(hw)}`;
  const room = Math.max(8, width - lead.length - tail.length - 1);
  const title = clip(row.title, room);

  const head = [
    paint(`${selected ? '▸' : ' '}${number === null ? ' ' : number}`, selected ? 'blue' : 'grey', color),
    ' ',
    paint(status.icon, status.color, color),
    ' ',
    selected ? paint(title, 'bold', color) : title,
    ' '.repeat(Math.max(1, room - title.length + 1)),
    row.total ? paint(bars, row.done === row.total ? 'green' : 'yellow', color) : bars,
    '  ',
    paint(counter.padStart(cw), row.done === row.total ? 'green' : 'yellow', color),
    '  ',
    paint(hotkey.padStart(hw), 'grey', color),
  ].join('');

  const lines = [head];
  if (!selected) return lines;

  // «рядом» — тот, чья панель стоит сейчас у списка. Без этой пометки не
  // отличить «выбран курсором» от «показан на экране», а это разные вещи.
  const meta = [row.kind, row.model, status.text, here ? 'рядом' : null].filter(Boolean).join(' · ');
  lines.push(`   ${paint(clip(meta, width - 4), 'dim', color)}`);

  if (!row.total) {
    lines.push(`   ${paint('плана ещё нет', 'grey', color)}`);
    return lines;
  }

  // Чек-лист идёт под полоской — той самой, что стоит в строке агента: сперва
  // «сколько», потом «что именно». `p` его сворачивает, оставляя текущий шаг:
  // в низкой панели нужнее увидеть всех, чем одного целиком.
  if (plans) {
    for (const item of row.items || []) {
      const mark = item.done ? paint('✓', 'green', color) : paint('·', 'grey', color);
      const text = item.done ? paint(clip(item.text, width - 6), 'dim', color) : clip(item.text, width - 6);
      lines.push(`   ${mark} ${text}`);
    }
  } else if (row.step) {
    lines.push(`   ${paint(`→ ${clip(row.step, width - 6)}`, 'grey', color)}`);
  }

  return lines;
}

// Подсказка по клавишам — двумя строками: сверху то, чем ходят по списку,
// снизу переключатели. Одной строкой они уже не помещаются ни в одну колонку,
// а переключатель, которого не видно, всё равно что отсутствует.
//
// Каждый переключатель называет то, что он сделает, а не то, как сейчас:
// «свернуть план» понятнее, чем «план: развёрнут».
//
// В узкой колонке слова уходят, клавиши остаются: строка, переносимая на три,
// съедает сам список.
// Первый вариант, который влезает. Последний — голые клавиши, и если уж не
// влезли и они, разделители сжимаются до пробела.
function fit(variants, width) {
  for (const variant of variants) {
    if (variant.length + 2 <= width) return variant;
  }
  return variants[variants.length - 1].replace(/ · /g, ' ');
}

function keyHints(width, hasRows, { plans, borrowed, split, hidden } = {}) {
  const lines = [];
  if (hasRows) {
    // Слова уходят не все разом: у ходьбы по списку клавиша говорит сама за
    // себя, а `x` и `o` делают то, чего не ждёшь, — им слово оставляют дольше.
    lines.push(fit([
      ['↑↓ выбрать', 'Enter показать', '1-9 сразу', 'x закрыть', borrowed ? 'o отпустить' : null]
        .filter(Boolean).join(' · '),
      ['↑↓ выбрать', 'Enter', '1-9', 'x закрыть', borrowed ? 'o отпустить' : null]
        .filter(Boolean).join(' · '),
      ['↑↓', 'Enter', '1-9', 'x закрыть', borrowed ? 'o' : null].filter(Boolean).join(' · '),
      ['↑↓', 'Enter', '1-9', 'x', borrowed ? 'o' : null].filter(Boolean).join(' · '),
    ], width));
  }
  lines.push(fit([
    [
      plans ? 'p свернуть план' : 'p показать план',
      split === 'right' ? 'd вниз' : 'd вправо',
      hidden ? 's вернуть в сайдбар' : 's убрать из сайдбара',
      'r обновить',
      'q закрыть',
    ].join(' · '),
    ['p план', split === 'right' ? 'd вниз' : 'd вправо', 's сайдбар', 'r обновить', 'q закрыть'].join(' · '),
    ['p', 'd', 's', 'r', 'q'].join(' · '),
  ], width));
  return lines;
}

// Меньше, чем на имя задачи с её состоянием, список ужать нельзя: это тот
// минимум, ради которого его и открывают.
const ROOM_FOR_ONE = 2;

// Сколько агентов влезет, если начать с `first` и отвести под них `room`
// строк. Возвращает индекс последнего влезшего — или `first - 1`, когда не
// влезает даже он один.
function fitFrom(blocks, first, room) {
  let used = 0;
  let last = first - 1;
  for (let i = first; i < blocks.length; i += 1) {
    if (used + blocks[i].length > room) break;
    used += blocks[i].length;
    last = i;
  }
  return last;
}

// Срез списка с пометками о спрятанном. Числа считают агентов, а не строки:
// человеку важно, скольких он не видит, а не сколько строк ушло за край.
function framed(blocks, first, last, budget, color) {
  const above = first;
  const below = blocks.length - 1 - last;
  const top = above ? [paint(`  ↑ ещё ${above} выше`, 'grey', color)] : [];
  let full = blocks.slice(first, last + 1).flat();
  let room = budget - top.length - (below ? 1 : 0);
  // Один агент бывает выше всего окна — длинный план в низкой панели. Показать
  // его обрезанным лучше, чем не показать вовсе.
  if (full.length > room) {
    // Раз пошла обрезка, место на счету: пустая строка-разделитель уходит
    // первой, иначе она съест ту самую строку, где написано имя задачи.
    if (full[0] === '') full = full.slice(1);
    // Обрезать молча нельзя, поэтому внизу появляется своя пометка — но
    // только если её ещё нет.
    if (!below) room -= 1;
  }
  const bottom = below
    ? [paint(`  ↓ ещё ${below} ниже`, 'grey', color)]
    : (full.length > room ? [paint('  ↓ не поместилось', 'grey', color)] : []);
  return [...top, ...full.slice(0, Math.max(0, room)), ...bottom];
}

// Окно списка, когда список выше панели. Прокрутка идёт целыми агентами:
// план, разрезанный посередине, читается хуже, чем честное «ещё 3 ниже».
//
// Окно прилипает к началу — берётся самый ранний срез, в который выбранный
// агент ещё попадает. Поэтому прокрутку не нужно ни помнить, ни хранить между
// перерисовками: список сам возвращается наверх, когда курсор идёт обратно.
function windowed(blocks, budget, selected, color) {
  if (budget <= 0) return [];
  const total = blocks.reduce((sum, block) => sum + block.length, 0);
  if (total <= budget) return blocks.flat();

  const at = Math.max(0, Math.min(blocks.length - 1, selected));
  for (let first = 0; first <= at; first += 1) {
    const room = budget - (first > 0 ? 1 : 0);
    let last = fitFrom(blocks, first, room);
    // Влезли не все — значит, снизу будет своя пометка, и строку под неё
    // нужно отнять, иначе окно вылезет за панель ровно на неё.
    if (last < blocks.length - 1) last = fitFrom(blocks, first, room - 1);
    if (last >= at) return framed(blocks, first, last, budget, color);
  }
  // Выбранный не влезает и один: показываем его обрезанным.
  return framed(blocks, at, at, budget, color);
}

// `height` — высота панели. Без неё список рисуется целиком, как раньше: так
// его удобно проверять и так им пользуются не-терминальные вызовы.
function renderBoard({
  rows = [],
  width = 80,
  color = true,
  plans = false,
  stateDir = null,
  selected = 0,
  borrowed = null,
  split = 'down',
  hidden = false,
  height = null,
} = {}) {
  const rule = paint('─'.repeat(Math.max(10, Math.min(width, 100))), 'dim', color);
  const head = [paint(' Агенты и их задачи ', 'bold', color), rule];

  // Пустая строка перед чертой — часть подвала: её тоже надо на что-то
  // отвести, иначе подсказка уедет за край панели.
  const foot = ['', rule];
  for (const hint of keyHints(width, rows.length > 0, { plans, borrowed, split, hidden })) {
    foot.push(paint(` ${hint}`, 'dim', color));
  }
  if (stateDir) foot.push(paint(` задачи: ${clip(stateDir, width - 10)}`, 'grey', color));

  // Панель бывает ниже, чем шапка с подвалом. Тогда подвал ужимается снизу
  // вверх — путь к задачам, подсказки, черта, — потому что список агентов
  // нужнее любой подсказки о нём. Ниже этого уже не ужать: шапка остаётся,
  // чтобы человек видел, на что смотрит.
  while (Number.isFinite(height) && foot.length && head.length + foot.length + ROOM_FOR_ONE > height) {
    foot.pop();
  }

  if (!rows.length) {
    return [
      ...head,
      '',
      paint('  Ни одного запущенного агента.', 'grey', color),
      '',
      paint('  Задачу ставит скилл из Claude Code, а запускает', 'grey', color),
      paint('  bin/launch.js: агент заводится отдельной вкладкой', 'grey', color),
      paint('  и появляется здесь.', 'grey', color),
      ...foot,
    ];
  }

  const columns = columnsFor(rows);
  const blocks = rows.map((row, index) => agentBlock(row, {
    width,
    color,
    plans,
    columns,
    selected: index === selected,
    here: Boolean(borrowed) && borrowed === row.paneId,
    number: index < 9 ? index + 1 : null,
  }));

  const body = Number.isFinite(height)
    ? windowed(blocks, height - head.length - foot.length, selected, color)
    : blocks.flat();

  const lines = [...head, ...body, ...foot];
  // Последняя застава: панель ниже собственной шапки — всё равно панель, а
  // вылезший за край список уносит наверх её первые строки.
  return Number.isFinite(height) ? lines.slice(0, Math.max(0, height)) : lines;
}

module.exports = { renderBoard, agentBlock, columnsFor, bar, clip, statusOf, paint, STATUS };
