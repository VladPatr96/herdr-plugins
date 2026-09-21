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

// What a bridge received when it carried nothing we could use: key names only,
// so "the status line runs but the panel stays empty" can be told apart from
// "the status line never ran".
function saveProbe(provider, shape) {
  writeJsonAtomic(path.join(stateDir(), `statusline-${provider}-probe.json`), {
    ...shape,
    seenAt: Math.floor(Date.now() / 1000),
  });
}

function loadProbe(provider) {
  return readJson(path.join(stateDir(), `statusline-${provider}-probe.json`));
}

module.exports = { save, load, saveProbe, loadProbe, file };
