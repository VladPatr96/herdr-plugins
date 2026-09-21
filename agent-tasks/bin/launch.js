#!/usr/bin/env node
'use strict';

// Starts one agent on one task and hands it back as a row in the sidebar.
//
//   node bin/launch.js --kind claude --model sonnet \
//     --title "Починить парсер дат" --task-file task.md --cwd D:\proj\x
//
// The whole launch is three Herdr commands, in this order, because that is
// what the terminal actually needs:
//
//   1. `tab create` — a tab of its own, so the agent shows up in the sidebar
//      next to every other agent and can be reached by its own hotkey.
//   2. `agent start` — Herdr types the agent's own executable into that tab's
//      shell and waits until it answers; `-- --model <id>` goes to the agent.
//   3. `agent prompt` — the task, as a one-line pointer at a file.
//
// Nothing here parses a terminal: the status in the sidebar is Herdr's own,
// and the plugin only adds what Herdr cannot know — which task this is and how
// far along its plan is.
//
// Prints JSON on stdout, so the caller (a Claude Code skill) can tell the
// person where their agent went.

const fs = require('node:fs');
const path = require('node:path');
const { taskFileText, promptText, agentName, PLAN_HEADING } = require('../lib/task-file');
const {
  herdr,
  herdrText,
  rememberStateDir,
  taskFile,
  loadRegistry,
  saveRegistry,
} = require('../lib/runtime');

// Herdr знает эти рода агентов; плагин не изобретает свой список, а берёт те,
// у кого есть интерактивный запуск и флаг модели одной формы (`--model <id>`).
const KINDS = new Set(['claude', 'codex', 'gemini', 'opencode', 'agy', 'grok', 'pi', 'cursor', 'droid', 'amp', 'qwen', 'kimi']);

const START_TIMEOUT_MS = 120_000;
const PROMPT_TIMEOUT_MS = 60_000;

function parseArgs(argv) {
  const args = { kind: 'claude' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      i += 1;
      return value;
    };
    switch (arg) {
      case '--kind': args.kind = take().toLowerCase(); break;
      case '--model': args.model = take(); break;
      case '--title': args.title = take(); break;
      case '--task': args.task = take(); break;
      case '--task-file': args.taskFile = take(); break;
      case '--cwd': args.cwd = take(); break;
      case '--workspace': args.workspace = take(); break;
      case '--focus': args.focus = true; break;
      case '--json': break; // the only output there is
      default: throw new Error(`unknown option ${arg}`);
    }
  }
  return args;
}

// Куда положить агента. Без явного `--workspace` новая вкладка уходит в тот
// воркспейс, который herdr сочтёт текущим, а это не обязательно тот, где сидит
// позвавший: человек не найдёт своего агента. Поэтому спрашиваем herdr, где
// пейн с этим рабочим каталогом, и кладём туда же.
function workspaceFor(cwd) {
  if (!cwd) return null;
  const target = path.resolve(cwd).replace(/[\\/]+$/, '').toLowerCase();
  let panes = [];
  try {
    panes = herdr(['pane', 'list'])?.result?.panes ?? [];
  } catch {
    return null;
  }
  const match = panes.find((pane) => {
    const paneCwd = String(pane.cwd || '').replace(/[\\/]+$/, '').toLowerCase();
    return paneCwd && paneCwd === target;
  });
  return match?.workspace_id || null;
}

function readTaskText(args) {
  if (args.taskFile) return fs.readFileSync(args.taskFile, 'utf8');
  if (args.task) return args.task;
  // Задача может прийти и потоком — так её проще отдать из скилла, не заводя
  // временного файла.
  if (!process.stdin.isTTY) {
    try {
      return fs.readFileSync(0, 'utf8');
    } catch {
      /* fall through */
    }
  }
  throw new Error('no task: pass --task <text>, --task-file <path> or feed it on stdin');
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Виден ли наш текст на экране агента. Ищем имя файла задачи: оно уникально
// для этого запуска и в промте есть, а больше его на экране взяться неоткуда.
function paneShows(paneId, marker) {
  try {
    return herdrText(['pane', 'read', paneId, '--lines', '60']).includes(marker);
  } catch {
    return false;
  }
}

// Отдать задачу и убедиться, что она дошла.
//
// `agent start` возвращается, когда herdr опознал агента, но TUI агента к
// этому моменту ещё перерисовывается, и набранный в него текст пропадает
// бесследно: композитор пуст, агент idle, задачи нет. Поэтому не «отправил и
// забыл», а отправил и посмотрел.
//
// Различаем три исхода, потому что лечатся они по-разному:
//
//   • агент начал работать — всё;
//   • текст на экране, но работа не началась — агент ещё поднимает сессию и
//     держит ввод в очереди (так ведёт себя codex на холодном старте). Второй
//     раз слать нельзя: задача придёт дважды;
//   • текста нет — он потерян при перерисовке, и вот тогда шлём снова.
const ATTEMPTS = 3;
const SETTLE_MS = 4000;

function deliverTask(paneId, prompt, marker) {
  let last = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      herdr(['agent', 'prompt', paneId, prompt, '--wait', '--until', 'working', '--timeout', String(PROMPT_TIMEOUT_MS)]);
      return { prompted: true, attempts: attempt };
    } catch (error) {
      last = error.message;
      if (paneShows(paneId, marker)) {
        return { prompted: false, queued: true, attempts: attempt, promptError: last };
      }
      if (attempt < ATTEMPTS) sleep(SETTLE_MS);
    }
  }
  return { prompted: false, queued: false, attempts: ATTEMPTS, promptError: last };
}

function launch(args) {
  if (!KINDS.has(args.kind)) {
    throw new Error(`unsupported --kind ${args.kind}; expected one of ${[...KINDS].join(', ')}`);
  }
  const task = readTaskText(args).trim();
  if (!task) throw new Error('the task is empty');
  const title = (args.title || task.split(/\r?\n/)[0]).trim().slice(0, 120);
  const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
  const stateDir = rememberStateDir();

  // 1. Вкладка. `--no-focus` по умолчанию: человек ставит задачу из своей
  // сессии и остаётся в ней, агент ждёт его в сайдбаре.
  const tabArgs = ['tab', 'create', '--cwd', cwd, '--label', title.slice(0, 40)];
  const workspace = args.workspace || workspaceFor(cwd);
  if (workspace) tabArgs.push('--workspace', workspace);
  tabArgs.push(args.focus ? '--focus' : '--no-focus');
  const created = herdr(tabArgs)?.result;
  const paneId = created?.root_pane?.pane_id;
  const tabId = created?.tab?.tab_id;
  if (!paneId) throw new Error('herdr created a tab without a pane');

  const file = taskFile(paneId, stateDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, taskFileText({ title, task }));

  const name = agentName(title, { kind: args.kind, paneId });
  const entry = {
    paneId,
    tabId,
    kind: args.kind,
    model: args.model || null,
    name,
    title,
    cwd,
    taskFile: file,
    launchedAt: new Date().toISOString(),
  };

  // 2. Агент. Всё после `--` уходит ему самому: и claude, и codex берут модель
  // одинаково — `--model <id>`.
  const startArgs = ['agent', 'start', name, '--kind', args.kind, '--pane', paneId, '--timeout', String(START_TIMEOUT_MS)];
  if (args.model) startArgs.push('--', '--model', args.model);
  let started;
  try {
    started = herdr(startArgs)?.result;
  } catch (error) {
    // Вкладка уже есть и в ней живая оболочка — оставляем её человеку вместе с
    // файлом задачи, вместо того чтобы молча закрыть и потерять след.
    saveRegistry({ ...loadRegistry(stateDir), [paneId]: { ...entry, failed: 'start', error: error.message } }, stateDir);
    return { ok: false, stage: 'start', error: error.message, ...entry };
  }

  // 3. Задача. Указатель на файл, а не сам текст: многострочный текст с
  // кавычками не переживает ни оболочку, ни ввод агента.
  const delivery = deliverTask(paneId, promptText({ file, planHeading: PLAN_HEADING }), path.basename(file));

  saveRegistry({ ...loadRegistry(stateDir), [paneId]: entry }, stateDir);

  return {
    ok: true,
    ...entry,
    agent: started?.agent?.agent || args.kind,
    argv: started?.argv || null,
    hotkey: started?.agent?.tokens?.hotkey || null,
    ...delivery,
    planHeading: PLAN_HEADING,
  };
}

// Метки в сайдбар ставит sync: у него одна дорога к токенам, и запуск не
// должен её дублировать. Ошибка здесь не должна ронять уже запущенного агента.
function syncLabels() {
  try {
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'sync.js')], { windowsHide: true });
  } catch {
    /* the next event will label it */
  }
}

try {
  const result = launch(parseArgs(process.argv.slice(2)));
  syncLabels();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  process.exitCode = 1;
}
