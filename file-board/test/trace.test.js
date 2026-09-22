'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { traceLine, openTrace } = require('../lib/trace');

function tmpPath(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'file-board-trace-')), name);
}

test('a line carries the moment it happened and every field of the event', () => {
  const line = traceLine(new Date('2026-09-22T11:22:33.123Z'), { key: 'j', build: 0.21, bytes: 2210 });
  assert.strictEqual(line, '2026-09-22T11:22:33.123Z key=j build=0.21 bytes=2210');
});

test('a field nobody filled in is left out rather than written as nothing', () => {
  const line = traceLine(new Date('2026-09-22T11:22:33.123Z'), { key: 'j', mode: undefined });
  assert.strictEqual(line, '2026-09-22T11:22:33.123Z key=j');
});

test('a value with a space in it is quoted, so a line stays one line', () => {
  const line = traceLine(new Date('2026-09-22T11:22:33.123Z'), { note: 'two words' });
  assert.strictEqual(line, '2026-09-22T11:22:33.123Z note="two words"');
});

test('with no trace asked for, nothing is written and no file appears', () => {
  const file = tmpPath('unwanted.log');
  const trace = openTrace({});
  trace.write({ key: 'j' });
  assert.strictEqual(fs.existsSync(file), false);
});

test('with a trace asked for, each event lands in the file as its own line', () => {
  const file = tmpPath('board.log');
  const trace = openTrace({ FILE_BOARD_TRACE: file });
  trace.write({ key: 'j' });
  trace.write({ key: 'k' });
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2);
  assert.match(lines[0], / key=j$/);
  assert.match(lines[1], / key=k$/);
  trace.close();
});

// What is usually being chased is a pane that has stopped answering, and a log
// that only appears once the board is done is no use for that.
test('a line can be read back while the board is still running', () => {
  const file = tmpPath('live.log');
  const trace = openTrace({ FILE_BOARD_TRACE: file });
  trace.write({ key: 'j' });
  assert.match(fs.readFileSync(file, 'utf8'), / key=j\n$/);
  trace.close();
});

test('a trace opened twice adds to the log rather than starting it over', () => {
  const file = tmpPath('twice.log');
  const first = openTrace({ FILE_BOARD_TRACE: file });
  first.write({ key: 'j' });
  first.close();
  const second = openTrace({ FILE_BOARD_TRACE: file });
  second.write({ key: 'k' });
  second.close();
  assert.strictEqual(fs.readFileSync(file, 'utf8').trim().split('\n').length, 2);
});

// The board must not die because a trace could not be written: tracing is there
// to find out why something is wrong, and it would be a poor tool if turning it
// on were itself a way to break the pane.
test('a trace that cannot be opened is dropped, not thrown', () => {
  const file = path.join(os.tmpdir(), 'no-such-folder-here', 'x.log');
  const trace = openTrace({ FILE_BOARD_TRACE: file });
  assert.doesNotThrow(() => trace.write({ key: 'j' }));
  assert.doesNotThrow(() => trace.close());
});
