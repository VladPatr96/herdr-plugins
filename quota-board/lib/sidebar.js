'use strict';

// Writes one `$quota` token per agent pane. Herdr forgets pane metadata across
// a server restart, which is why the startup hook runs this too.

const { execFileSync } = require('node:child_process');
const { providerForAgent } = require('./agents');
const { sidebarToken } = require('./format');

const SOURCE = 'plugin:quota-board';
const HERDR = process.env.HERDR_BIN_PATH || 'herdr';

function herdr(args) {
  const out = execFileSync(HERDR, args, { encoding: 'utf8', windowsHide: true });
  return out.trim() ? JSON.parse(out) : null;
}

function agents() {
  try {
    return herdr(['agent', 'list'])?.result?.agents ?? [];
  } catch {
    return [];
  }
}

// One report per pane, with a sequence number so a slow run can never
// overwrite a newer one.
function syncSidebar(cache, list = agents()) {
  let seq = Date.now() * 1000;
  const written = [];
  for (const agent of list) {
    const providerId = providerForAgent(agent.agent);
    const snapshot = providerId ? cache.providers?.[providerId] : null;
    const value = providerId ? sidebarToken(snapshot) : null;
    const current = agent.tokens?.quota ?? null;
    if (value === null || current === value) continue;
    try {
      herdr([
        'pane',
        'report-metadata',
        agent.pane_id,
        '--source',
        SOURCE,
        '--seq',
        String(seq++),
        '--token',
        `quota=${value}`,
      ]);
      written.push({ paneId: agent.pane_id, value });
    } catch (error) {
      // The pane may have closed between list and report; the next run fixes it.
      process.stderr.write(`quota-board: ${agent.pane_id}: ${error.message}\n`);
    }
  }
  return written;
}

module.exports = { syncSidebar, agents, herdr };
