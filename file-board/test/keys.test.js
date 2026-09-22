'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { actionFor } = require('../lib/keys');

test('letters move the cursor the way vim does', () => {
  assert.strictEqual(actionFor('j'), 'down');
  assert.strictEqual(actionFor('k'), 'up');
  assert.strictEqual(actionFor('h'), 'close');
  assert.strictEqual(actionFor('l'), 'open');
});

test('arrows do the same as the letters', () => {
  assert.strictEqual(actionFor('\u001b[B'), 'down');
  assert.strictEqual(actionFor('\u001b[A'), 'up');
  assert.strictEqual(actionFor('\u001b[D'), 'close');
  assert.strictEqual(actionFor('\u001b[C'), 'open');
});

test('Enter opens whatever the cursor is on', () => {
  assert.strictEqual(actionFor('\r'), 'enter');
  assert.strictEqual(actionFor('\n'), 'enter');
});

test('the working keys are where the hands already are', () => {
  assert.strictEqual(actionFor('e'), 'edit');
  assert.strictEqual(actionFor('.'), 'hidden');
  assert.strictEqual(actionFor('r'), 'refresh');
  assert.strictEqual(actionFor('q'), 'quit');
});

test('Escape steps back, it does not close the pane', () => {
  assert.strictEqual(actionFor('\u001b'), 'back');
});

test('Ctrl+C quits, Ctrl+D does not', () => {
  assert.strictEqual(actionFor('\u0003'), 'quit');
  assert.strictEqual(actionFor('\u0004'), null);
});

test('page keys and the ends of the list', () => {
  assert.strictEqual(actionFor('\u001b[6~'), 'page-down');
  assert.strictEqual(actionFor('\u001b[5~'), 'page-up');
  assert.strictEqual(actionFor('g'), 'top');
  assert.strictEqual(actionFor('G'), 'bottom');
});

test('no Alt key is claimed, because herdr takes them all first', () => {
  for (const key of ['\u001bj', '\u001b1', '\u001bq']) {
    assert.strictEqual(actionFor(key), null, `${JSON.stringify(key)} should not be ours`);
  }
});

test('an unknown key is simply not ours', () => {
  assert.strictEqual(actionFor('z'), null);
  assert.strictEqual(actionFor(''), null);
});

// A pane hands over whatever arrived since the last read, so three quick
// presses land in one chunk. Reading only the first would drop two of them.
const { actionsFor } = require('../lib/keys');

test('a chunk of several presses is read as several actions', () => {
  assert.deepStrictEqual(actionsFor('jjj'), ['down', 'down', 'down']);
});

test('an escape sequence inside a chunk stays whole', () => {
  assert.deepStrictEqual(actionsFor('j\u001b[Bk'), ['down', 'down', 'up']);
});

test('page keys inside a chunk keep their tilde', () => {
  assert.deepStrictEqual(actionsFor('\u001b[6~\u001b[5~'), ['page-down', 'page-up']);
});

test('keys that are not ours are dropped, the rest still arrive', () => {
  assert.deepStrictEqual(actionsFor('jzk'), ['down', 'up']);
});

test('a lone Escape is still a step back', () => {
  assert.deepStrictEqual(actionsFor('\u001b'), ['back']);
});

test('an empty chunk is no action at all', () => {
  assert.deepStrictEqual(actionsFor(''), []);
});

test('w asks for wrapping to be turned on or off', () => {
  assert.strictEqual(actionFor('w'), 'wrap');
});
