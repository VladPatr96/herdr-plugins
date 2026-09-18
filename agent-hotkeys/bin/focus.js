#!/usr/bin/env node
'use strict';

// `node bin/focus.js <n>` focuses the agent that owns hotkey slot n (1-based).

const { paneForSlot } = require('../lib/hotkeys');
const { herdr, loadSlots } = require('../lib/runtime');

const slot = Number.parseInt(process.argv[2], 10) - 1;
const paneId = Number.isInteger(slot) ? paneForSlot(loadSlots(), slot) : undefined;

if (paneId) {
  try {
    herdr(['agent', 'focus', paneId]);
  } catch (err) {
    // Agent already gone; the next sync frees the slot.
    process.stderr.write(`agent-hotkeys: focus ${paneId}: ${err.message}\n`);
  }
}
