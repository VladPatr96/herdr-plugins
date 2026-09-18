'use strict';

// Pure logic of the plugin: which hotkey slot each agent owns and which
// sidebar tokens each pane should carry.
//
// A slot is handed to an agent when it starts and stays with it until the
// agent leaves its pane. Freed slots go to the next agent that starts.

// $hotkey      -> "Alt+1"
// $hotkey_line -> "claude            Alt+1", padded so the key ends under the
//                 right-aligned "grouped" label of the agent panel header.
const TOKENS = ['hotkey', 'hotkey_line'];

// Slot n is bound to KEYS[n] and to the plugin action `focus-${n + 1}`.
// b and f are left out: alt+b / alt+f move by word in shells and agent prompts.
const KEYS = [
  ...'1234567890'.split('').map((c) => `alt+${c}`),
  ...'qwertyuiopasdghjklzxcvnm'.split('').map((c) => `alt+${c}`),
];

// herdr v0.9.1 geometry (src/ui/sidebar.rs, src/client/shell/agent_sidebar.rs):
// the sidebar loses 1 column to its divider, and the second line of an agent
// row is indented by 3, so that line has `sidebar width - 4` columns.
const ROW_OVERHEAD = 4;

// "alt+shift+q" -> "Alt+Shift+Q"
function keyLabel(key) {
  return key
    .split('+')
    .map((part) => (part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join('+');
}

// Terminal column width, close enough to unicode-width for agent names:
// East Asian wide and emoji ranges count as 2, combining marks as 0.
function textWidth(text) {
  let width = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (/\p{Mn}|\p{Me}|\p{Cf}/u.test(ch)) continue;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x20000 && cp <= 0x3fffd);
    width += wide ? 2 : 1;
  }
  return width;
}

// Agent name on the left, key at the right edge of `columns`.
// Without a known width (or when it does not fit) the key follows the name.
function hotkeyLine(name, key, columns) {
  if (!key) return name;
  const gap = columns ? columns - textWidth(name) - textWidth(key) : 0;
  return `${name}${' '.repeat(gap >= 1 ? gap : 2)}${key}`;
}

// agents: `herdr agent list` order. slots: { paneId: slotIndex } from last run.
// Returns the new slot map: departed agents lose their slot, running agents
// keep theirs, new agents take the lowest free slot in list order.
function assignSlots(agents, slots, slotCount = KEYS.length) {
  const alive = new Set(agents.map((a) => a.pane_id));
  const next = {};
  const taken = new Set();
  for (const [paneId, slot] of Object.entries(slots)) {
    if (alive.has(paneId) && Number.isInteger(slot) && slot >= 0 && slot < slotCount && !taken.has(slot)) {
      next[paneId] = slot;
      taken.add(slot);
    }
  }
  let free = 0;
  for (const agent of agents) {
    if (agent.pane_id in next) continue;
    while (taken.has(free)) free++;
    if (free >= slotCount) break; // more agents than keys: the rest wait for a free slot
    next[agent.pane_id] = free;
    taken.add(free);
  }
  return next;
}

// Tokens every pane should carry. Agents without a slot still get a
// hotkey_line (just their name), so a sidebar row built from it never vanishes.
function wantedTokens({ agents, slots, sidebarWidth, keys = KEYS }) {
  const columns = sidebarWidth ? sidebarWidth - ROW_OVERHEAD : 0;
  const wanted = new Map();
  for (const agent of agents) {
    const slot = slots[agent.pane_id];
    const key = slot === undefined ? null : keyLabel(keys[slot]);
    const name = agent.display_agent || agent.agent || '';
    wanted.set(agent.pane_id, { hotkey: key, hotkey_line: hotkeyLine(name, key, columns) || null });
  }
  return wanted;
}

// Returns [{ paneId, tokens: { name: value | null } }] with only the tokens that
// differ from what the pane carries now; null means "clear". Repeated runs are no-ops.
function planUpdates({ wanted, panes, agents }) {
  const current = new Map();
  for (const item of [...panes, ...agents]) {
    const tokens = current.get(item.pane_id) ?? {};
    for (const name of TOKENS) {
      const value = item.tokens?.[name];
      if (value != null && value !== '') tokens[name] = value;
    }
    current.set(item.pane_id, tokens);
  }

  const updates = [];
  for (const paneId of new Set([...current.keys(), ...wanted.keys()])) {
    const have = current.get(paneId) ?? {};
    const want = wanted.get(paneId) ?? {};
    const tokens = {};
    for (const name of TOKENS) {
      const value = want[name] ?? null;
      if ((have[name] ?? null) !== value) tokens[name] = value;
    }
    if (Object.keys(tokens).length) updates.push({ paneId, tokens });
  }
  return updates;
}

// Pane that owns slot n, or undefined.
function paneForSlot(slots, slot) {
  return Object.keys(slots).find((paneId) => slots[paneId] === slot);
}

// Scalar keys of one TOML table, e.g. readTomlTable(text, 'ui').sidebar_width.
// Enough for herdr's flat [ui] settings; not a general TOML parser.
function readTomlTable(text, table) {
  const out = {};
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '').trim();
    if (!line) continue;
    const header = line.match(/^\[\s*([^\]]+?)\s*\]$/);
    if (header) {
      section = header[1];
      continue;
    }
    if (section !== table) continue;
    const m = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!m) continue;
    const value = m[2].trim();
    if (/^-?\d+$/.test(value)) out[m[1]] = Number(value);
    else if (/^["'].*["']$/.test(value)) out[m[1]] = value.slice(1, -1);
    else if (value === 'true' || value === 'false') out[m[1]] = value === 'true';
  }
  return out;
}

// The sidebar width is only predictable when herdr cannot auto-scale it,
// i.e. sidebar_min_width == sidebar_max_width. Returns that width or 0.
function fixedSidebarWidth(ui) {
  const min = ui.sidebar_min_width ?? 18;
  const max = ui.sidebar_max_width ?? 36;
  return min === max ? min : 0;
}

// The [[keys.command]] block that binds every slot key to its focus action.
function keybindingsToml(pluginId, keys = KEYS) {
  return keys
    .map(
      (key, i) =>
        `[[keys.command]]\nkey = "${key}"\ntype = "plugin_action"\ncommand = "${pluginId}.focus-${i + 1}"\ndescription = "agent hotkey ${keyLabel(key)}"\n`,
    )
    .join('\n');
}

module.exports = {
  TOKENS,
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
};
