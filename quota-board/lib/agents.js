'use strict';

// Which provider bills the agent sitting in a pane. Herdr reports the agent
// kind it detected; anything not listed simply gets no quota token.

const BY_AGENT = {
  claude: 'claude',
  'claude-code': 'claude',
  codex: 'codex',
  grok: 'grok',
  agy: 'agy',
  antigravity: 'agy',
  opencode: 'opencode-go',
};

function providerForAgent(agent) {
  if (!agent) return null;
  return BY_AGENT[String(agent).toLowerCase()] || null;
}

module.exports = { providerForAgent, BY_AGENT };
