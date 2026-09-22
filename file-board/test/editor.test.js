'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { editorCommand } = require('../lib/editor');

const nothing = { onPath: () => false, exists: () => false };

test('the plugin variable wins over everything', () => {
  const cmd = editorCommand({ FILE_BOARD_EDITOR: 'micro', EDITOR: 'vim' }, nothing);
  assert.strictEqual(cmd, 'micro');
});

test('EDITOR is used when the plugin variable is not set', () => {
  assert.strictEqual(editorCommand({ EDITOR: 'vim' }, nothing), 'vim');
});

test('nvim on PATH is called by name', () => {
  const cmd = editorCommand({}, { onPath: (name) => name === 'nvim', exists: () => false });
  assert.strictEqual(cmd, 'nvim');
});

// Herdr keeps the environment it started with. An editor installed while Herdr
// was running is not on that PATH, so a known install location is worth a look
// before telling the person their editor is missing.
test('nvim installed after herdr started is found where the installer puts it', () => {
  const installed = 'C:\\Program Files\\Neovim\\bin\\nvim.exe';
  const cmd = editorCommand(
    { ProgramFiles: 'C:\\Program Files' },
    { onPath: () => false, exists: (file) => file === installed },
  );
  assert.strictEqual(cmd, installed);
});

test('a user-scope install is found too', () => {
  const installed = 'C:\\Users\\me\\AppData\\Local\\Programs\\Neovim\\bin\\nvim.exe';
  const cmd = editorCommand(
    { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
    { onPath: () => false, exists: (file) => file === installed },
  );
  assert.strictEqual(cmd, installed);
});

test('with nothing found it still says nvim, so the error names what is missing', () => {
  assert.strictEqual(editorCommand({}, nothing), 'nvim');
});
