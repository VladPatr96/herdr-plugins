# Quota Board for Herdr

One window with every AI quota you are actually spending: the subscription
windows of Claude Code, Codex, agy (Antigravity), Grok and OpenCode Go, and the
DeepSeek API balance. Press a key, see what is left, close it again. Nothing is
added to the sidebar.

```
AI quota  ·  every subscription and API you run in Herdr

Claude Code        5h       █████████░  89% left · resets in 3h 20m
                   7d       ███████░░░  75% left · resets in 4d 2h
                   7d Fable ██████████ 100% left · resets in 4d 2h
Codex              7d            ███████░░░  77% left · resets in 3d 21h
                   7d gpt-reserve ██████████ 100% left · resets in 6d 4h
                   prolite · 2 free resets available · first expires in 12d
Antigravity  needs setup: run /statusline inside agy
Grok               7d       ██████████ 100% left · resets in 47m
OpenCode Go        5h       ██████████ 100% left · resets in 4h 56m
                   7d       ██████████ 100% left · resets in 6d 14h
                   30d      ████████░░  80% left · resets in 2d 7h
DeepSeek API       balance $7.23

updated 12s ago   r refresh   q close
```

- **Remaining, not used.** The bar fills with what is left, and the colour
  follows the same number: green, yellow under 25%, red under 10%.
- **Every pool, not just the plan's.** Claude's per-model weekly windows
  (`7d Fable`), Codex's named reserves and the free rate-limit resets it still
  has are all rows of their own.
- **Local time.** Resets are printed in the timezone of the machine Herdr runs
  on, with the countdown next to them.
- **A provider without data says so.** No credentials, no setup, an endpoint
  that refused — the row says which. It never shows a number it does not have.
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

Keys that open the board. There are two ways to see it — an overlay that
covers the active pane while you look, and a split that stays open next to the
agents:

```toml
[[keys.command]]
key = "alt+shift+q"
type = "plugin_action"
command = "vladpatr96.quota-board.open"
description = "AI quota board"

[[keys.command]]
key = "alt+shift+s"
type = "plugin_action"
command = "vladpatr96.quota-board.open-side"
description = "AI quota board in a side pane"
```

Reload with `herdr server reload-config`.

- `open` is an overlay: it zooms over the active pane and gives the focus back
  when you close it with `q`.
- `open-side` splits the current pane and puts the board to the right, where
  the agents are. It is an ordinary Herdr pane, so it stays until you close it,
  and pressing the key again focuses the board that is already open instead of
  splitting another one.

## Where the numbers come from

| Provider | Source | Needs |
|---|---|---|
| Claude Code | `api.anthropic.com/api/oauth/usage` with the OAuth token Claude Code already stored — the same rows its own `/usage` shows, per-model weekly pools included; the statusLine bridge below is the fallback | a Claude Code login |
| Codex | `codex app-server` → `account/rateLimits/read`, the same call the CLI's `/status` makes: every pool it bills, plus the free rate-limit resets left on the account | the `codex` CLI on `PATH`, signed in with ChatGPT |
| Antigravity | the CLI's own status line — the only local surface that carries its quota | `/statusline` inside `agy`, see below |
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

One action wires it into both agents, wrapping the status line each already
had and keeping a backup next to its settings file:

```sh
herdr plugin action invoke install-statusline --plugin vladpatr96.quota-board
herdr plugin action invoke remove-statusline  --plugin vladpatr96.quota-board   # undo
```

It edits `~/.claude/settings.json` and agy's
`~/.gemini/antigravity-cli/settings.json`. A previous command that cannot run
is replaced rather than wrapped — agy writes the placeholder `"to enable"`
there when its status line was never configured, and the action says so.
Restart the agent afterwards; its status line is read at startup.

To set agy up by hand instead, run `/statusline <command>` inside it with:

```
node <plugin root>/bin/statusline.js agy
```

The bridge finds the plugin's state directory through a pointer file that every
refresh rewrites, so it needs no flags and no quoting.

Claude Code is read through its OAuth token first, because only that answer
carries the per-model weekly pools (`7d Fable`). That endpoint is rate limited
per account, and with several Claude sessions open it can answer `429`; the
bridge is what keeps the two plan-wide windows visible when it does.

## How it works

- `bin/board.js` is the window. It draws from the cache immediately, refreshes
  in the background, repeats every 60 seconds (`QUOTA_BOARD_INTERVAL_SECONDS`),
  and redraws on `r`.
- `bin/refresh.js` asks every provider at once, with a per-provider timeout, and
  writes `quota.json` in the plugin state directory. A provider that fails keeps
  its last good reading for up to six hours, labelled `stale`. It is also a
  plugin action, so a key can refresh without opening the window.
- The startup hook runs `refresh` once when the Herdr server starts, so the
  first time the window opens it already has numbers.
- Agent lifecycle events run `refresh --if-stale`: working with a different
  model or harness updates the quota behind it on its own, and the `--if-stale`
  guard keeps that to one round of requests per `QUOTA_BOARD_TTL_SECONDS`
  (default 120) however often the events fire.

## Limits

- **A window is only as fresh as its source.** The statusLine bridge updates
  when that agent takes a turn, not on a timer, and the panel prints when the
  reading was taken. The status line carries the two plan-wide windows only:
  while the endpoint is rate limited, no per-model pool is shown.
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
