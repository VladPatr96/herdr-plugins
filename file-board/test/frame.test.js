'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { paintFrame } = require('../lib/frame');

test('with nothing on screen yet, the whole frame is written', () => {
  const written = paintFrame(null, ['one', 'two', 'three']);
  assert.strictEqual(written, '\u001b[Hone\r\ntwo\r\nthree');
});

// The board redraws after every key. Moving a cursor changes two rows out of
// fifty-five, and writing the other fifty-three again costs the pane the same
// as writing something new: in a herdr pane a full frame takes up to 20 ms
// against 0.3 ms to build it.
test('when a single row changed, only that row is written', () => {
  const written = paintFrame(['one', 'two', 'three'], ['one', 'TWO', 'three']);
  assert.strictEqual(written, '\u001b[2;1HTWO');
});

test('each changed row is written where it belongs, and the rest are left alone', () => {
  const written = paintFrame(['a', 'b', 'c', 'd'], ['A', 'b', 'c', 'D']);
  assert.strictEqual(written, '\u001b[1;1HA\u001b[4;1HD');
});

test('when nothing changed, nothing at all is written', () => {
  assert.strictEqual(paintFrame(['a', 'b'], ['a', 'b']), '');
});

// A pane that changed shape has nothing on it worth trusting: the rows do not
// line up with what was there before, and comparing them would leave the
// leftovers of the old shape on screen.
test('a frame of a different height is written out whole', () => {
  const written = paintFrame(['a', 'b'], ['a', 'b', 'c']);
  assert.strictEqual(written, '\u001b[Ha\r\nb\r\nc');
});

test('a row is positioned by its number, counting from one', () => {
  const written = paintFrame(['a', 'b', 'c'], ['a', 'b', 'C']);
  assert.ok(written.startsWith('\u001b[3;1H'));
});
