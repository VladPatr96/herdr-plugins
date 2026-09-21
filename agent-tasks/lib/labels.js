'use strict';

// What the sidebar should say about every agent this plugin launched, and what
// it should stop saying about the ones that are gone.
//
// Pure: it is handed the registry, the agent list and the plan of each task,
// and returns the token reports to send. `bin/sync.js` does the talking.

const { progressLabel, currentItem } = require('./plan');

// Herdr нормализует значение токена и режет его на 80 символах. Режем сами и
// ставим многоточие: обрубок в сайдбаре должен выглядеть намеренным.
const MAX_TOKEN = 80;

function clamp(value, limit = MAX_TOKEN) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

// Токены одного агента. Статус не дублируем: `state_icon` и `state_text` у
// herdr свои и меняются сами, а плагин добавляет только то, чего у herdr нет,
// — задачу и место в плане.
function tokensFor(entry, plan) {
  return {
    task: clamp(entry.title),
    task_progress: progressLabel(plan),
    task_step: clamp(currentItem(plan)),
  };
}

// Сравниваем с тем, что herdr уже показывает, и шлём только расхождения:
// каждый отчёт занимает слот источника (их у пейна 32 за всю жизнь), а события
// прилетают пачками.
function diff(wanted, current) {
  const patch = {};
  for (const [name, value] of Object.entries(wanted)) {
    const now = current?.[name] ?? null;
    if (value === null) {
      if (now !== null && now !== undefined) patch[name] = null;
    } else if (now !== value) {
      patch[name] = value;
    }
  }
  return patch;
}

// Что разослать и что забыть.
//
// `entries` — реестр плагина (ключ — pane_id), `agents` — `herdr agent list`,
// `plans` — разобранный план по тому же ключу.
//
// Пейн, которого в списке агентов больше нет, уходит из реестра: задача либо
// доведена, либо брошена, но строки в сайдбаре у неё уже нет. Обратное неверно
// — живой пейн с законченной задачей остаётся: статус задачи и жизнь терминала
// это разные вещи.
function planUpdates({ entries, agents, plans = {} }) {
  const byPane = new Map(agents.map((agent) => [agent.pane_id, agent]));
  const updates = [];
  const forget = [];

  for (const [paneId, entry] of Object.entries(entries)) {
    const agent = byPane.get(paneId);
    if (!agent) {
      forget.push(paneId);
      continue;
    }
    const patch = diff(tokensFor(entry, plans[paneId]), agent.tokens);
    if (Object.keys(patch).length) updates.push({ paneId, tokens: patch });
  }

  return { updates, forget };
}

// Строка агента для доски: `◐ claude · sonnet · 3/7 · читает исходники`.
function boardRow(entry, agent, plan) {
  return {
    paneId: entry.paneId,
    title: entry.title,
    kind: entry.kind,
    model: entry.model || null,
    cwd: entry.cwd || null,
    status: agent?.agent_status || 'gone',
    hotkey: agent?.tokens?.hotkey || null,
    progress: progressLabel(plan),
    step: currentItem(plan),
    done: plan?.done ?? 0,
    total: plan?.total ?? 0,
    launchedAt: entry.launchedAt || null,
  };
}

module.exports = { MAX_TOKEN, clamp, tokensFor, diff, planUpdates, boardRow };
