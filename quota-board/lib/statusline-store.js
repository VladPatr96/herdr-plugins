'use strict';

// What the statusLine bridge last saw, per provider. A status line only runs
// while its agent is working, so these readings are as fresh as the last turn
// and the panel says so.

const path = require('node:path');
const { stateDir, readJson, writeJsonAtomic } = require('./runtime');

function file(provider) {
  return path.join(stateDir(), `statusline-${provider}.json`);
}

function save(provider, snapshot) {
  writeJsonAtomic(file(provider), { ...snapshot, seenAt: Math.floor(Date.now() / 1000) });
}

function load(provider) {
  return readJson(file(provider));
}

module.exports = { save, load, file };
