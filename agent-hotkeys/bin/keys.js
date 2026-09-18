#!/usr/bin/env node
'use strict';

// Prints the [[keys.command]] block to paste into herdr's config.toml.

const { keybindingsToml } = require('../lib/hotkeys');

process.stdout.write(keybindingsToml('vladpatr96.agent-hotkeys'));
