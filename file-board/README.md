# File Board for Herdr

The files your agent is working on, in a pane next to it. Press a key: the tree
opens on that agent's folder, Enter shows what is inside a file, `e` hands the
file to nvim. Press `q` and the pane is gone.

```
 D:\projects\my_projects\herdr_plugins                              3/9
├─▾ file-board
│ ├─▸ bin
│ ├─▸ lib
│ ├─▸ test
│ ├─  herdr-plugin.toml
│ └─  package.json
├─▸ quota-board
├─  AGENTS.md
└─  README.md

 j/k move · Enter open · e nvim · . hidden · r refresh · q close
```

- **It opens where you are.** The folder is the working directory of the pane
  the key was pressed in — the agent you were just talking to, not a fixed root.
- **It stays out of the way.** A split to the right that lives until you close
  it; pressing the key again focuses the board already open in this workspace
  instead of stacking another one.
- **Looking is not editing.** Enter shows a file in the pane, numbered and
  highlighted. Files over 1 MiB, longer than 5000 lines, binary, or not valid
  UTF-8 are marked read-only and shown as far as they can be shown honestly —
  never as mojibake.

```
 lib\render.js                                                  1-6/60
   1 │ 'use strict';
   2 │
   3 │ // Turning rows into what a pane can print. Everything here is…
   4 │
   5 │ const { groupFor, styleFor } = require('./paint');
   6 │
```
- **Editing is nvim's job.** `e` runs your editor on the same pane and gives the
  board back when the editor exits, with the cursor where you left it.

## Keys

| Key | What it does |
|---|---|
| `j` `k` or `↓` `↑` | move |
| `l` `→` or `Enter` | open a folder, or show a file |
| `h` `←` | close a folder, or step out to the folder above |
| `g` `G` | first row, last row |
| `PgUp` `PgDn` | a screen at a time |
| `e` | open the file in nvim |
| `.` | show or hide dotfiles |
| `r` | re-read the folder |
| `Esc` | back from a file to the tree |
| `q` | close the pane |

No binding uses Alt. Herdr resolves prefix-less bindings before a pane sees
them, so an Alt key would never arrive — on this machine 36 of them belong to
`agent-hotkeys` and `quota-board`.

`.git` is never shown. Other dotfiles are hidden until you press `.`.

## Colour

A name is coloured by what kind of file it is, so a folder full of work is told
apart from a folder full of build output without reading a single name.

| Colour | What it is |
|---|---|
| blue, bold | folders |
| yellow | code — `.js` `.ts` `.py` `.rs` `.go` `.c` `.java` `.css` … |
| green | scripts you run — `.sh` `.ps1` `.bat` |
| cyan | configuration and data — `.json` `.toml` `.yaml` `.ini` `.csv` … |
| plain | prose — `.md` `.txt` `.log`, and anything unrecognised |
| magenta | images, video, audio, fonts |
| red | binaries and archives — `.exe` `.dll` `.zip` … |
| dim | lockfiles, source maps, dotfiles — generated, not written |

Inside a file, comments are dim, strings green, numbers cyan, keywords magenta,
and the keys of a `.json` or `.toml` blue. The languages that get this are
JavaScript and its relatives, JSON, TOML and the INI/YAML family, shell,
Python, and Markdown; anything else is shown plain rather than guessed at.

The sixteen standard ANSI colours are all that is used, so the shades are the
ones your terminal theme defines and the board reads the same on a light
background as on a dark one. `NO_COLOR=1` turns it off, as it does everywhere
else.

The extension table lives in `lib/paint.js` and is data: a file type nobody
thought of is one more entry in it.

## Install

Node 18+ and nvim ≥ 0.10 (or another editor, see below). No build, no
dependencies.

```sh
herdr plugin link path/to/file-board
```

Then bind a key in `config.toml` — on Windows `%APPDATA%\herdr\config.toml`:

```toml
[[keys.command]]
key = "alt+shift+f"
type = "plugin_action"
command = "vladpatr96.file-board.open"
description = "File board (side pane)"
```

Any free key will do; the ones already bound elsewhere in that file are not
available.

A running herdr keeps the keybindings it started with, so the new key does
nothing until the config is reloaded — `herdr server reload-config`, or
`reload config` in herdr's global menu.

## Settings

| Variable | Meaning |
|---|---|
| `FILE_BOARD_EDITOR` | the editor `e` runs; falls back to `EDITOR`, then `nvim` |
| `FILE_BOARD_ROOT` | the folder to show; the opener sets it, and it overrides the pane's working directory |
| `FILE_BOARD_COLOR` | `0` draws the board without colour; `NO_COLOR` does the same |
| `FILE_BOARD_TRACE` | a file to append timings to: every keypress and every frame, with how long each took and how big it was. Off unless set, and never a reason for the pane to fall over |

An editor installed while herdr was already running is not on the PATH herdr
inherited. The board looks in the usual install locations before reporting it as
missing, so a fresh `winget install Neovim.Neovim` works without restarting
herdr.

## What it does not do

No file operations, no search, no bookmarks, no image or video previews, no git
panel, no mouse. The highlighting is a rule table, not a parser: it knows six
language families and colours four kinds of token, which is enough to read by
and not enough to be right about a language's every corner. Editing inside the
board itself is next; for now `e` is the way in.

## Tests

```sh
npm test
```

The parts that can be reasoned about — the tree and its guides, the viewer's
limits, how a coloured line is cut to the width of the pane, what each language
makes of a line, the key map, where the board opens, how a pane's folder is
chosen — are covered there.
What only a real pane can show (the editor handing the terminal back, a key
reaching the process at all) was checked in herdr with `herdr pane send-keys`.
