'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { taskFileText, promptText, agentName, agentArgv, PLAN_HEADING } = require('../lib/task-file');
const { progress } = require('../lib/plan');

test('файл задачи сразу готов принять план', () => {
  const text = taskFileText({ title: 'Починить парсер дат', task: 'Даты 31.02 роняют импорт.' });
  assert.match(text, /^# Починить парсер дат/);
  assert.match(text, /## План/);
  const plan = progress(text);
  assert.strictEqual(plan.hasPlan, false, 'пустой раздел — это отсутствие плана, а не ноль пунктов');
});

test('план, дописанный агентом в тот же файл, читается', () => {
  const text = `${taskFileText({ title: 'Задача', task: 'Текст.' })}- [x] раз\n- [ ] два\n`;
  const plan = progress(text, PLAN_HEADING);
  assert.strictEqual(plan.done, 1);
  assert.strictEqual(plan.total, 2);
});

test('промт — указатель на файл, а не сам текст задачи', () => {
  const prompt = promptText({ file: 'C:/tmp/tasks/w8-pS.md' });
  assert.ok(prompt.includes('C:/tmp/tasks/w8-pS.md'));
  assert.ok(!prompt.includes('\n'), 'многострочный промт не переживёт ввод агента');
  assert.ok(prompt.includes('План'));
});

test('имя агента подходит herdr: строчная латиница, цифры, дефис', () => {
  const name = agentName('Fix the date parser');
  assert.strictEqual(name, 'fix-the-date-parser');
  assert.match(name, /^[a-z][a-z0-9_-]{0,31}$/);
});

test('русский заголовок даёт имя из рода агента и пейна', () => {
  const name = agentName('Починить парсер дат', { kind: 'claude', paneId: 'w8:pS' });
  assert.match(name, /^[a-z][a-z0-9_-]{0,31}$/);
  assert.ok(name.startsWith('claude'));
});

test('имя не длиннее 32 символов и не кончается дефисом', () => {
  const name = agentName('a'.repeat(50));
  assert.strictEqual(name.length, 32);
  assert.ok(!name.endsWith('-'));
  assert.match(agentName('rebuild the whole import pipeline end to end'), /^[a-z][a-z0-9_-]{0,31}$/);
});

test('заголовок, начинающийся с цифры, не даёт негодного имени', () => {
  assert.match(agentName('2026 report', { kind: 'codex', paneId: 'w1:pQ' }), /^[a-z]/);
});

test('claude получает доступ к папке задач: файл лежит вне его рабочей папки', () => {
  assert.deepStrictEqual(
    agentArgv('claude', 'sonnet', 'C:/state/tasks'),
    ['--model', 'sonnet', '--add-dir', 'C:/state/tasks'],
  );
});

test('модель передаётся одинаково всем, --add-dir — только claude', () => {
  assert.deepStrictEqual(agentArgv('codex', 'gpt-5.1-codex', 'C:/state/tasks'), ['--model', 'gpt-5.1-codex']);
  assert.deepStrictEqual(agentArgv('claude', null, 'C:/state/tasks'), ['--add-dir', 'C:/state/tasks']);
  assert.deepStrictEqual(agentArgv('codex', null, 'C:/state/tasks'), [], 'без модели агенту нечего передавать');
});

test('режим разрешений передаётся только когда его попросили', () => {
  assert.deepStrictEqual(
    agentArgv('claude', null, 'C:/state/tasks', 'acceptEdits'),
    ['--add-dir', 'C:/state/tasks', '--permission-mode', 'acceptEdits'],
  );
  assert.ok(!agentArgv('claude', null, 'C:/state/tasks').includes('--permission-mode'));
});
