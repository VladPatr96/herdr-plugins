'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { taskFileText, promptText, agentName, PLAN_HEADING } = require('../lib/task-file');
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
