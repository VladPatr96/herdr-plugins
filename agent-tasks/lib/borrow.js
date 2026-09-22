'use strict';

// Кто стоит рядом со списком и кого туда поставить.
//
// Агент живёт в своей вкладке — со своим хоткеем и своей строкой в сайдбаре,
// как любой другой агент herdr. Чтобы показать его рядом со списком, его
// панель переезжает во вкладку списка, а та, что стояла там до него, уезжает
// обратно к себе. В окне всегда список и ровно один агент, и вкладки при этом
// не плодятся.
//
// Здесь только решение о переезде; сами переезды делает `bin/board.js`.

// `borrowed` — кто занят сейчас (или null), `wanted` — кого просят показать.
//
// Просить того, кто уже стоит рядом, — обычное дело: человек жмёт Enter на
// выбранном, чтобы просто перевести в него фокус. Возить панель туда-сюда
// ради этого нельзя: экран моргнёт, а ничего не изменится.
function borrowPlan({ borrowed = null, wanted = null } = {}) {
  if (!wanted) return { send: borrowed, bring: null, focus: null };
  if (borrowed && borrowed.paneId === wanted.paneId) {
    return { send: null, bring: null, focus: wanted.paneId };
  }
  return { send: borrowed, bring: wanted, focus: wanted.paneId };
}

// Панель, которую одолжили, могла закрыться вместе с агентом, пока стояла
// рядом. Возвращать домой нечего, и помнить о ней тоже нечего.
function stillThere(borrowed, rows) {
  if (!borrowed) return null;
  const row = rows.find((item) => item.paneId === borrowed.paneId);
  if (!row || row.status === 'gone') return null;
  // Название вкладки берётся из свежей строки: задача та же, а заголовок мог
  // и поменяться, если агента перезапустили.
  return { paneId: borrowed.paneId, title: row.title || borrowed.title };
}

module.exports = { borrowPlan, stillThere };
