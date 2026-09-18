'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  KEYS,
  ROW_OVERHEAD,
  keyLabel,
  textWidth,
  hotkeyLine,
  assignSlots,
  wantedTokens,
  planUpdates,
  paneForSlot,
  readTomlTable,
  fixedSidebarWidth,
  keybindingsToml,
} = require('../lib/hotkeys');

const agent = (pane_id, extra = {}) => ({ pane_id, ...extra });

test('key scheme: Alt+1..9, Alt+0, then letters without B and F', () => {
  assert.deepEqual(KEYS.slice(0, 12).map(keyLabel), [
    'Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5', 'Alt+6', 'Alt+7', 'Alt+8', 'Alt+9', 'Alt+0', 'Alt+Q', 'Alt+W',
  ]);
  assert.ok(!KEYS.includes('alt+b') && !KEYS.includes('alt+f'));
  assert.equal(new Set(KEYS).size, KEYS.length);
});

test('first run hands out slots in agent list order, past nine too', () => {
  const agents = Array.from({ length: 11 }, (_, i) => agent(`p${i + 1}`));
  const slots = assignSlots(agents, {});
  assert.equal(slots.p1, 0);
  assert.equal(slots.p10, 9); // Alt+0
  assert.equal(slots.p11, 10); // Alt+Q
});

test('a running agent keeps its slot when others come and go', () => {
  const slots = assignSlots([agent('a'), agent('b'), agent('c')], {});
  // b quits, d starts: d takes b's freed slot, c keeps its own
  const next = assignSlots([agent('a'), agent('c'), agent('d')], slots);
  assert.deepEqual(next, { a: 0, c: 2, d: 1 });
});

test('a new agent placed first in the list does not steal a slot', () => {
  const slots = assignSlots([agent('a'), agent('b')], {});
  const next = assignSlots([agent('new'), agent('a'), agent('b')], slots);
  assert.deepEqual(next, { a: 0, b: 1, new: 2 });
});

test('broken or duplicate saved slots are dropped and reassigned', () => {
  const next = assignSlots([agent('a'), agent('b'), agent('c')], { a: 0, b: 0, c: 'x', gone: 1 });
  assert.deepEqual(next, { a: 0, b: 1, c: 2 });
});

test('agents beyond the last key get no slot', () => {
  const next = assignSlots([agent('a'), agent('b'), agent('c')], {}, 2);
  assert.deepEqual(next, { a: 0, b: 1 });
});

test('hotkey line puts the key at the right edge', () => {
  assert.equal(hotkeyLine('claude', 'Alt+1', 20), 'claude         Alt+1');
  assert.equal(textWidth(hotkeyLine('claude', 'Alt+1', 20)), 20);
  assert.equal(hotkeyLine('claude', 'Alt+1', 0), 'claude  Alt+1'); // width unknown
  assert.equal(hotkeyLine('a-very-long-agent-name', 'Alt+1', 20), 'a-very-long-agent-name  Alt+1');
  assert.equal(hotkeyLine('claude', null, 20), 'claude');
  assert.equal(textWidth('日本'), 4);
});

test('sidebar width 30 leaves 26 columns for the agent line', () => {
  const wanted = wantedTokens({ agents: [agent('p1', { agent: 'codex' })], slots: { p1: 1 }, sidebarWidth: 30 });
  const { hotkey, hotkey_line } = wanted.get('p1');
  assert.equal(hotkey, 'Alt+2');
  assert.equal(textWidth(hotkey_line), 30 - ROW_OVERHEAD);
  assert.ok(hotkey_line.startsWith('codex ') && hotkey_line.endsWith(' Alt+2'));
});

test('only changed tokens are reported; stale ones cleared', () => {
  const agents = [agent('p1', { agent: 'claude' }), agent('p3', { agent: 'codex' })];
  const wanted = wantedTokens({ agents, slots: { p1: 0, p3: 2 }, sidebarWidth: 0 });
  const panes = [
    { pane_id: 'p1', tokens: { hotkey: 'Alt+1', hotkey_line: 'claude  Alt+1' } },
    { pane_id: 'p2', tokens: { hotkey: 'Alt+2', hotkey_line: 'pi  Alt+2' } }, // agent quit, shell remains
    { pane_id: 'p3', tokens: { hotkey: 'Alt+3' } },
  ];
  assert.deepEqual(planUpdates({ wanted, panes, agents }), [
    { paneId: 'p2', tokens: { hotkey: null, hotkey_line: null } },
    { paneId: 'p3', tokens: { hotkey_line: 'codex  Alt+3' } },
  ]);
});

test('an agent without a slot still gets its name as the line', () => {
  const wanted = wantedTokens({ agents: [agent('p1', { agent: 'pi' })], slots: {}, sidebarWidth: 30 });
  assert.deepEqual(wanted.get('p1'), { hotkey: null, hotkey_line: 'pi' });
});

test('sidebar width is known only when min == max', () => {
  const toml = '[ui]\nsidebar_width = 30 # note\nsidebar_min_width = 30\nsidebar_max_width = 30\n[ui.toast]\nsidebar_min_width = 1\n';
  assert.equal(fixedSidebarWidth(readTomlTable(toml, 'ui')), 30);
  assert.equal(fixedSidebarWidth(readTomlTable('[ui]\nsidebar_min_width = 20\n', 'ui')), 0);
  assert.equal(fixedSidebarWidth(readTomlTable('', 'ui')), 0);
});

test('paneForSlot finds the owner', () => {
  assert.equal(paneForSlot({ a: 0, b: 3 }, 3), 'b');
  assert.equal(paneForSlot({ a: 0 }, 5), undefined);
});

test('keybindings toml binds each key to its focus action', () => {
  const toml = keybindingsToml('x.y', ['alt+1', 'alt+q']);
  assert.match(toml, /key = "alt\+1"\ntype = "plugin_action"\ncommand = "x\.y\.focus-1"/);
  assert.match(toml, /key = "alt\+q"\ntype = "plugin_action"\ncommand = "x\.y\.focus-2"/);
});
