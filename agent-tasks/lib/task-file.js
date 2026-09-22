'use strict';

// The file an agent is given instead of a wall of text, and the one-line
// prompt that points at it.
//
// Why a file and not the prompt itself: `herdr agent prompt` types the text
// into a terminal, and a multi-line task with quotes and backticks survives
// neither PowerShell nor the agent's own composer intact. A path survives
// everything. The same file then carries the plan back, so the task and its
// checklist stay together and the plugin has one thing to read.

const PLAN_HEADING = 'План';

// Заголовки задачи и раздела плана — часть договорённости с агентом: он
// дописывает чек-лист под «## План», плагин читает его оттуда же.
function taskFileText({ title, task, planHeading = PLAN_HEADING }) {
  const heading = String(title || 'Задача').trim();
  const body = String(task ?? '').trim();
  return [
    `# ${heading}`,
    '',
    body,
    '',
    `## ${planHeading}`,
    '',
    '<!-- Чек-лист ведёт агент: пункт в работе — `- [ ]`, сделанный — `- [x]`. -->',
    '',
    '',
  ].join('\n');
}

// Промт — только указатель. Он же объясняет агенту, зачем план: не «оформи
// красиво», а «по нему человек видит, где ты», иначе агент заполняет чек-лист
// один раз в конце.
function promptText({ file, planHeading = PLAN_HEADING }) {
  return [
    `Твоя задача записана в файле ${file}.`,
    `Прочитай его и первым делом впиши в раздел «${planHeading}» план работы чек-листом (\`- [ ]\`).`,
    'Отмечай пункты (`- [x]`) по ходу, сразу как сделал: по этому файлу человек в сайдбаре видит, где ты.',
    'Потом выполняй задачу.',
  ].join(' ');
}

// Имя агента для `herdr agent start`: строчные латинские буквы, цифры, `-` и
// `_`, 1–32 символа — herdr отвергает всё прочее ошибкой `invalid_agent_name`.
// Заголовок задачи бывает русским, поэтому при пустом результате берётся род
// агента плюс хвост идентификатора пейна: имя должно быть, а читать его в
// сайдбаре человек всё равно будет из токена `$task`.
function agentName(title, { kind = 'agent', paneId = '' } = {}) {
  const slug = String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
  if (slug && /^[a-z]/.test(slug)) return slug;
  const tail = String(paneId).replace(/[^a-z0-9]+/gi, '').toLowerCase().slice(-6);
  return `${kind}${tail ? `-${tail}` : ''}`.slice(0, 32);
}

// Аргументы, с которыми поднимается сам агент.
//
// Модель одинакова у claude и codex — `--model <id>`.
//
// `--add-dir` у claude важнее, чем кажется: файл задачи лежит в папке
// состояния плагина, то есть **вне** рабочего каталога агента, и агент со
// свежей сессией спрашивает разрешения его прочитать — то есть встаёт
// заблокированным на первом же шаге, вместо того чтобы работать. Флаг
// открывает ровно одну папку — ту, где лежат задачи, — и вопрос отпадает.
// `--permission-mode` плагин сам не выставляет. Доступ к папке — это одно, а
// право править файлы без спроса — совсем другое, и решать его за человека
// нельзя: он выбрал свой режим не просто так. В режиме, где правки
// подтверждаются, агент спросит разрешения дописать план в свой же файл
// задачи; кого это раздражает — передаёт режим явно.
function agentArgv(kind, model, tasksDir, permissionMode) {
  const argv = [];
  if (model) argv.push('--model', model);
  if (kind === 'claude' && tasksDir) argv.push('--add-dir', tasksDir);
  if (kind === 'claude' && permissionMode) argv.push('--permission-mode', permissionMode);
  return argv;
}

module.exports = { PLAN_HEADING, taskFileText, promptText, agentName, agentArgv };
