'use strict';

// The checklist an agent keeps while it works, and how far along it is.
//
// The plan lives in the agent's own task file as a Markdown checklist, because
// that is the only format Claude Code and Codex both write without being
// taught anything: Claude Code's own plan tool renders as `- [ ]`, Codex writes
// the same by hand. A hook would have been exact, but Claude Code's hooks do
// not reach Codex, and half the agents is worse than plain text.
//
// Nothing here touches the disk: the caller reads the file, this turns its text
// into counts.

const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const ITEM = /^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/;

// Только раздел плана, чтобы чекбоксы из текста самой задачи не считались
// пунктами плана. Раздел кончается на следующем заголовке того же или более
// высокого уровня — или на конце файла.
function planSection(text, heading = 'План') {
  const lines = String(text ?? '').split(/\r?\n/);
  const wanted = heading.trim().toLowerCase();
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const match = HEADING.exec(lines[i]);
    if (!match) continue;
    const depth = lines[i].match(/^#+/)[0].length;
    if (start === -1) {
      if (match[1].trim().toLowerCase() === wanted) {
        start = i + 1;
        level = depth;
      }
      continue;
    }
    if (depth <= level) return lines.slice(start, i);
  }
  return start === -1 ? null : lines.slice(start);
}

// `- [ ] текст` и `- [x] текст`. Пустой пункт (`- [ ]` без текста) — всё ещё
// пункт: агент мог наметить шаг и не подписать его.
function parseItems(lines) {
  const items = [];
  for (const line of lines) {
    const match = ITEM.exec(line);
    if (match) items.push({ done: match[1].toLowerCase() === 'x', text: match[2].trim() });
  }
  return items;
}

// Прогресс по тексту файла задачи. `total === 0` значит «плана ещё нет»: агент
// либо не дошёл до него, либо ведёт работу без чек-листа. Это не ошибка, и
// показывать такое надо иначе, чем `0/5`.
function progress(text, heading = 'План') {
  const section = planSection(text, heading);
  const items = parseItems(section ?? []);
  const done = items.filter((item) => item.done).length;
  return { items, done, total: items.length, hasPlan: items.length > 0 };
}

// Короткая подпись для сайдбара: `3/7`. Без плана — null, чтобы токен пропал,
// а не занимал строку нулями.
function progressLabel(plan) {
  if (!plan || !plan.total) return null;
  return `${plan.done}/${plan.total}`;
}

// Первый невыполненный пункт — то, чем агент занят прямо сейчас. Когда всё
// отмечено, показывать нечего: работа по плану закончена.
function currentItem(plan) {
  if (!plan || !plan.total) return null;
  return plan.items.find((item) => !item.done)?.text || null;
}

module.exports = { planSection, parseItems, progress, progressLabel, currentItem };
