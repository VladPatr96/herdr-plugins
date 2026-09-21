# Quota Board for Herdr

One window with every AI quota you are actually spending: the subscription
windows of Claude Code, Codex, agy (Antigravity), Grok and OpenCode Go, and the
DeepSeek API balance. Press a key, see what is left, close it again.

```
AI quota  ·  every subscription and API you run in Herdr

Claude Code        5h       ████████░░  78% left · resets in 3h 20m
                   7d       ███████░░░  73% left · resets in 4d 2h
Codex              7d       ████████░░  78% left · resets in 3d 22h
                   prolite
agy / Antigravity  needs setup: run /statusline inside agy
Grok               7d       ██████████ 100% left · resets in 47m
OpenCode Go        5h       ██████████ 100% left · resets in 4h 56m
                   7d       ██████████ 100% left · resets in 6d 14h
                   30d      ████████░░  80% left · resets in 2d 7h
DeepSeek API       balance $7.23

updated 12s ago   r refresh   q close
```

- **Remaining, not used.** The bar fills with what is left, and the colour
  follows the same number: green, yellow under 25%, red under 10%.
- **A provider without data says so.** No credentials, no setup, an endpoint
  that refused — the row says which. It never shows a number it does not have.
- **A sidebar token too.** Each agent pane can carry the tightest window of the
  provider that bills it (`7d 78%`).
- **Works on Windows, Linux and macOS.** Node.js only, no dependencies, no build.

## Requirements

- Herdr 0.9.1 or newer (plugin panes), tested on native Windows
- Node.js 18 or newer on `PATH`

## Install

```sh
herdr plugin install VladPatr96/herdr-plugins/quota-board
```

For a local checkout:

```sh
herdr plugin link /path/to/herdr-plugins/quota-board
herdr plugin action invoke refresh --plugin vladpatr96.quota-board
```

## Configure

Herdr's config file is `%APPDATA%\herdr\config.toml` on Windows and
`~/.config/herdr/config.toml` elsewhere (or `$HERDR_CONFIG_PATH`).

**1. A key that opens the window.**

```toml
[[keys.command]]
key = "alt+shift+q"
type = "plugin_action"
command = "vladpatr96.quota-board.open"
description = "AI quota board"
```

Reload with `herdr server reload-config`. The window opens as an overlay over
the active pane and gives the focus back when you close it with `q`.

**2. The sidebar token (optional).** The plugin reports one token per agent
pane:

| Token | Value |
|---|---|
| `$quota` | the tightest window of that agent's provider (`7d 78%`), a balance (`$7.23`), or `n/a` |

Put it on the agent's row:

```toml
[ui.sidebar.agents]
rows = [["state_icon", "machine", "workspace", "tab"], ["agent", { token = "$quota", fg = "#89b4fa" }]]
```

Together with [agent-hotkeys](../agent-hotkeys/), keeping the key at the right
edge:

```toml
[ui.sidebar.agents]
rows = [["state_icon", "machine", "workspace", "tab"], ["agent", { token = "$quota", fg = "#89b4fa" }, { token = "$hotkey", align = "right", fg = "#f9e2af", bold = true }]]
```

## Where the numbers come from

| Provider | Source | Needs |
|---|---|---|
| Claude Code | the statusLine bridge below, else `api.anthropic.com/api/oauth/usage` with the OAuth token Claude Code already stored | a Claude Code login |
| Codex | `codex app-server` → `account/rateLimits/read`, the same call the CLI's `/status` makes | the `codex` CLI on `PATH`, signed in with ChatGPT |
| agy / Antigravity | the CLI's own status line — the only local surface that carries its quota | `/statusline` inside `agy`, see below |
| Grok | the billing endpoint the Grok CLI itself reads, with the credentials in `~/.grok/auth.json` | a `grok` login |
| OpenCode Go | `opencode.ai/zen/go/v1/usage` with the Go credential in OpenCode's `auth.json` | an OpenCode Go plan |
| DeepSeek API | `api.deepseek.com/user/balance` | `DEEPSEEK_API_KEY`, see below |

Nothing is written to disk except the readings themselves: credentials are read
where their own tool already keeps them, used for one request and dropped.

### The DeepSeek key

`DEEPSEEK_API_KEY` from the environment wins. Without it the plugin uses the
key OpenCode already stores for its `deepseek` provider. To keep the key out of
your shell profile, put it in the plugin's config directory instead
(`herdr plugin config-dir vladpatr96.quota-board`):

```
DEEPSEEK_API_KEY=sk-...
```

### The statusLine bridge (Claude Code and agy)

Claude Code and agy report their plan windows to their own status line and
nowhere else on this machine. The bridge stores that block and passes the
status line you already had straight through, so nothing you see changes.

Claude Code — one action wraps the existing `statusLine` in
`~/.claude/settings.json` and keeps a backup next to it:

```sh
herdr plugin action invoke install-statusline --plugin vladpatr96.quota-board
herdr plugin action invoke remove-statusline  --plugin vladpatr96.quota-board   # undo
```

agy — the same action prints the line to paste. Run `/statusline` inside `agy`
and give it:

```
node "<plugin root>/bin/statusline.js" agy --state-dir "<state dir>"
```

Both paths are printed by `install-statusline`; `--state-dir` is needed because
the agent launches the bridge, so Herdr's own environment is not there.

Claude Code also answers over its OAuth token without the bridge, but that
endpoint is rate limited per account: with several Claude sessions open it
answers `429`, and the row then says so instead of showing a stale number.

## How it works

- `bin/board.js` is the window. It draws from the cache immediately, refreshes
  in the background, repeats every 60 seconds (`QUOTA_BOARD_INTERVAL_SECONDS`),
  and redraws on `r`.
- `bin/refresh.js` asks every provider at once, with a per-provider timeout, and
  writes `quota.json` in the plugin state directory. A provider that fails keeps
  its last good reading for up to six hours, labelled `stale`.
- `bin/sync.js` runs on server start and on agent lifecycle events. It repaints
  the sidebar tokens from the cache and only goes to the network when the cache
  is older than `QUOTA_BOARD_TTL_SECONDS` (default 300).

## Limits

- **A window is only as fresh as its source.** The statusLine bridge updates
  when that agent takes a turn, not on a timer, and the panel prints when the
  reading was taken.
- **Grok and OpenCode Go endpoints are the ones their own CLIs use**, not
  documented public APIs. If a response changes shape the row says "no data"
  rather than guessing.
- **Codex on API-key auth has no plan quota**, and says so.
- **agy needs its status line turned on by hand** — it keeps no quota file.
- Token counts and dollar spend per session are out of scope; this is about
  what is left of a plan.

## Development

```sh
npm test    # unit tests (node:test)
```

## License

MIT
