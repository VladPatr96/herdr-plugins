# Agent Hotkeys for Herdr

Every agent gets its own hotkey the moment it starts, and the key is written
right next to it in the Herdr sidebar. Press the key and you are on that agent.

```
 agents                grouped
● hq · 1
   claude               Alt+1
● hq · 2
   codex                Alt+2
● herdr_plugins · 1
   claude               Alt+Q
```

- **Sticky keys.** An agent keeps its key until it leaves its pane. The freed
  key goes to the next agent that starts; nobody else is renumbered.
- **34 keys:** `Alt+1` … `Alt+9`, `Alt+0`, then `Alt+Q W E R T Y U I O P A S D
  G H J K L Z X C V N M`. `Alt+B` and `Alt+F` are skipped because shells and
  agent prompts use them to move by word.
- **Works on Windows, Linux and macOS.** Node.js only, no dependencies, no build.

## Requirements

- Herdr 0.8.2 or newer (tested on 0.9.1, native Windows)
- Node.js 18 or newer on `PATH`

## Install

```sh
herdr plugin install VladPatr96/herdr-plugins/agent-hotkeys
```

For a local checkout:

```sh
herdr plugin link /path/to/herdr-plugins/agent-hotkeys
herdr plugin action invoke vladpatr96.agent-hotkeys.sync   # link runs no startup hook
```

## Configure

Herdr's config file is `%APPDATA%\herdr\config.toml` on Windows and
`~/.config/herdr/config.toml` elsewhere (or `$HERDR_CONFIG_PATH`).

**1. Show the key in the sidebar.** The plugin reports two tokens per agent:

| Token | Value |
|---|---|
| `$hotkey` | just the key, e.g. `Alt+1` |
| `$hotkey_line` | agent name and key, padded so the key sits at the right edge |

**With right-aligned tokens** (a Herdr build that has `align` for sidebar
tokens, see below), put `$hotkey` at the right edge of the agent's row. The
key stays under `grouped` at any sidebar width, moves one column left when
the agent list shows a scrollbar, and can have its own color:

```toml
[ui.sidebar.agents]
rows = [["state_icon", "machine", "workspace", "tab"], ["agent", { token = "$hotkey", align = "right", fg = "#f9e2af", bold = true }]]
```

`align` is not in any released Herdr yet, up to and including 0.9.1. It
lives in the `sidebar-token-align` branch of
[VladPatr96/herdr](https://github.com/VladPatr96/herdr/tree/sidebar-token-align),
which is Herdr 0.9.1 plus this option. A Herdr release without `align` fails
to parse a config that uses it and falls back to defaults for everything,
key bindings included (`herdr config check` shows the error). Use the padded
variant below on those versions.

**Without right-aligned tokens** (Herdr 0.9.1 and older), line the keys up
under the `grouped` label by giving the sidebar a fixed width (Herdr
otherwise resizes it to fit workspace names) and using `$hotkey_line` as the
agent's second row:

```toml
[ui]
sidebar_width = 30
sidebar_min_width = 30
sidebar_max_width = 30

[ui.sidebar.agents]
rows = [["state_icon", "machine", "workspace", "tab"], [{ token = "$hotkey_line", bold = true }]]
```

If you'd rather keep the automatic width, put the key after the name instead:

```toml
[ui.sidebar.agents]
rows = [["state_icon", "machine", "workspace", "tab"], ["agent", { token = "$hotkey", fg = "#f9e2af", bold = true }]]
```

**2. Bind the keys.** Print the 34 `[[keys.command]]` entries and append them
to the config:

```sh
node bin/keys.js >> "$APPDATA/herdr/config.toml"   # Windows (Git Bash)
node bin/keys.js >> ~/.config/herdr/config.toml     # Linux / macOS
```

Each entry looks like this:

```toml
[[keys.command]]
key = "alt+1"
type = "plugin_action"
command = "vladpatr96.agent-hotkeys.focus-1"
description = "agent hotkey Alt+1"
```

**3. Reload:** `herdr server reload-config`.

## How it works

- `bin/sync.js` runs on server start, on pane/agent lifecycle events and from
  the `sync` action. It hands out free slots, drops slots of agents that are
  gone and writes the tokens with `herdr pane report-metadata`. Slots live in
  `slots.json` in the plugin state directory. Runs are serialized with a lock
  because one Herdr event fires several hooks at once.
- `bin/focus.js <n>` backs the `focus-<n>` actions: it looks up the pane that
  owns slot *n* and calls `herdr agent focus`.

## Limits

- Without `align` (Herdr 0.9.1 and older), `$hotkey_line` fakes the right
  edge with padding. It is exact only with a fixed sidebar width. When the
  agent list needs a scrollbar, the scrollbar takes one column and the last
  character of the key is cut off. Dragging the sidebar edge also breaks the
  alignment until the width is fixed again. Name and key share one style,
  because Herdr styles a token as a whole. The `align = "right"` variant has
  none of these limits.
- More than 34 agents at once: the extra ones get no key until one frees up.
- `Alt+…` keys depend on the terminal passing them through. If one does
  nothing, check that your terminal does not bind it itself.

## Development

```sh
npm test                 # unit tests (node:test)
npm run manifest         # regenerate herdr-plugin.toml after changing KEYS
```

## License

MIT
