---
gist: Плагины квот для herdr есть (пять штук), но все заявляют только macOS и Linux, поэтому на Windows работающего нет.
---

**Вопрос:** есть ли готовые плагины herdr, показывающие расход и остаток квот по Claude Code, Grok, agy (Antigravity CLI), Codex, OpenCode Go и API DeepSeek.

**Исход:** найдено

**Дата:** 2026-09-21 · среда пользователя: herdr 0.9.1, нативный Windows 11

## Ответ

Плагинов квот для herdr пять, два из них закрывают почти весь список провайдеров, но каждый заявляет `platforms = ["macos", "linux"]` и запускает свои хуки через `sh -c` / `bash` / `python3`. На нативном Windows, где стоит herdr пользователя, ни один из них не применим. Плагинов квот с Windows в `platforms` найти не удалось.

## Факты

1. В каталоге herdr (GitHub topic `herdr-plugin`) тему квот закрывают пять репозиториев: `levi-qiao/herdr-agent-quota` (129★), `senna-lang/herdr-agent-usage` (43★), `kvkenyon/herdr-quota` (2★), `ArnaudRinquin/herdr-quotabar` (1★) и спутник `ummoftgo/herdr-quota-theme` (0★) — `gh search repos --topic herdr-plugin --limit 60`, `gh search repos "herdr quota"` · факт
2. `levi-qiao/herdr-agent-quota` 1.6.2 показывает квоту и контекст для Claude, Codex, Grok, Agy, OpenCode, Pi, OMP, Devin, Muse, Cursor — [herdr-plugin.toml](https://github.com/levi-qiao/herdr-agent-quota/blob/main/herdr-plugin.toml) (`description`), [README «Data sources and limits»](https://github.com/levi-qiao/herdr-agent-quota#data-sources-and-limits) · факт
3. В его манифесте стоит `platforms = ["macos", "linux"]`, CI собирается на `ubuntu-latest` и `macos-latest`, а все хуки объявлены как `["sh", "-c", …]` — [herdr-plugin.toml](https://github.com/levi-qiao/herdr-agent-quota/blob/main/herdr-plugin.toml), [.github/workflows/ci.yml](https://github.com/levi-qiao/herdr-agent-quota/blob/main/.github/workflows/ci.yml) (`os: [ubuntu-latest, macos-latest]`) · факт
4. README того же плагина в разделе установки требует «**macOS or Linux**» и ставится скриптом `./install.sh` (`#!/usr/bin/env bash`) — [README «Install and upgrade»](https://github.com/levi-qiao/herdr-agent-quota#install-and-upgrade) · факт
5. DeepSeek в `herdr-agent-quota` не поддерживается: единственное упоминание слова во всём репозитории — строка чужой таблицы TTL кэша в `docs/research/oss-prompt-cache-ttl.md` — `gh search code --repo levi-qiao/herdr-agent-quota deepseek` · факт
6. `senna-lang/herdr-agent-usage` 0.5.15 покрывает Claude Code, Codex, OpenCode Go, Grok, Antigravity CLI (`agy`), OMP, Pi и контекст Cursor — [README «Supported agents»](https://github.com/senna-lang/herdr-agent-usage#supported-agents) · факт
7. DeepSeek у него — не баланс аккаунта, а трата «pay-as-you-go»: backend опознаётся по тому, что записал сам агент (`providerID` у OpenCode, `model_provider` у Codex), и показывается как `deepseek · Σ 425k $0.04` плюс блок 24h / 7d / 30d — [README, буллет «Pay-as-you-go API backends»](https://github.com/senna-lang/herdr-agent-usage#agent-usage) · факт
8. Он тоже только для macOS и Linux: бейдж `platforms: linux | macOS`, раздел Requirements «**macOS or Linux**», раздел Limitations «**macOS / Linux** only», в манифесте `platforms = ["macos", "linux"]`, готовые сборки в Releases — только macOS/Linux, arm64/amd64 — [README](https://github.com/senna-lang/herdr-agent-usage#requirements), [herdr-plugin.toml](https://github.com/senna-lang/herdr-agent-usage/blob/main/herdr-plugin.toml) · факт
9. `kvkenyon/herdr-quota` (Claude, Codex, Cursor, Kimi) и `ArnaudRinquin/herdr-quotabar` (Claude, «provider-pluggable») — тоже `platforms = ["macos", "linux"]`; первый запускает хуки через `sh -c`, второй через `python3` — `gh api repos/<repo>/contents/herdr-plugin.toml` · факт
10. Сам herdr плагины на Windows поддерживает: в документации 0.9.1 `platforms = ["linux", "macos", "windows"]`, и отдельный абзац описывает разрешение `PATHEXT`-шимов (`npm.cmd`, `bun.cmd`) для команд плагина на Windows — [docs/plugins.mdx @ v0.9.1](https://raw.githubusercontent.com/herdrdev/herdr/v0.9.1/docs/next/website/src/content/docs/plugins.mdx) · факт
11. Ни одного плагина квот, заявляющего Windows, не нашёл — `gh search code --filename herdr-plugin.toml "quota windows"` вернул пусто, в пяти найденных манифестах Windows нет · факт
12. Ни один из пяти не обращается к API DeepSeek за балансом аккаунта: у DeepSeek такой метод есть — `GET https://api.deepseek.com/user/balance`, возвращает `is_available` и `balance_infos[]` с `total_balance`, `granted_balance`, `topped_up_balance` — [DeepSeek API docs, Get User Balance](https://api-docs.deepseek.com/api/get-user-balance) · факт
13. Готового плагина, который на этой машине показал бы квоты, нет: те, что умеют нужное, объявлены несовместимыми с Windows (3, 4, 8, 9), а совместимых с Windows среди плагинов квот не найдено (11) — из 3, 4, 8, 9, 11 · вывод

## Откуда берутся числа (карта источников для своего плагина)

Обе зрелые реализации открыты под MIT, и их источники данных видны в коде — это готовая карта для собственного плагина:

| Провайдер | Источник | Ссылка |
|---|---|---|
| Claude Code | statusLine: на stdin приходит JSON с `rate_limits.five_hour` / `seven_day` (`used_percentage`, `resets_at`). Есть и прямой путь — `GET https://api.anthropic.com/api/oauth/usage` с токеном `claudeAiOauth.accessToken` из `~/.claude/.credentials.json`, заголовки `anthropic-beta: oauth-2025-04-20` и UA `claude-cli/<версия> (external, cli)`, но на этом аккаунте он отвечает `429` при нескольких открытых сессиях (проверено 2026-09-21 тремя вариантами заголовков), поэтому основной источник — statusLine | [claude.rs#L33](https://github.com/levi-qiao/herdr-agent-quota/blob/main/src/providers/claude.rs#L33), [clauth src/usage/fetch.rs](https://github.com/uwuclxdy/clauth/blob/main/src/usage/fetch.rs) |
| agy / Antigravity | statusLine: объект `quota`, два недельных пула — нативные Gemini-модели и сторонние; включается командой `/statusline` внутри `agy` | [agy.rs#L77](https://github.com/levi-qiao/herdr-agent-quota/blob/main/src/providers/agy.rs#L77), [README herdr-agent-usage](https://github.com/senna-lang/herdr-agent-usage#supported-agents) |
| Codex | `codex app-server --stdio`, JSON-RPC, ответ содержит `rateLimits` (окна 5h и 7d); учётка — `auth.json` в `CODEX_HOME` | [codex.rs#L159](https://github.com/levi-qiao/herdr-agent-quota/blob/main/src/providers/codex.rs#L159) |
| Grok | `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits` с учёткой из `~/.grok/auth.json` (недокументированный прокси CLI, не публичный API) | [grok.rs#L16](https://github.com/levi-qiao/herdr-agent-quota/blob/main/src/providers/grok.rs#L16) |
| OpenCode Go | `GET https://opencode.ai/zen/go/v1/usage` с учёткой Go; подписка не хранит расход на диске | [opencode_go.rs#L24](https://github.com/levi-qiao/herdr-agent-quota/blob/main/src/providers/opencode_go.rs#L24), [README herdr-agent-usage](https://github.com/senna-lang/herdr-agent-usage#opencode-go-official-usage) |
| DeepSeek API | `GET https://api.deepseek.com/user/balance`, заголовок `Authorization: Bearer <ключ>` | [DeepSeek API docs](https://api-docs.deepseek.com/api/get-user-balance) |

Все источники, кроме statusLine agy, проверены вживую на этой машине 2026-09-21: DeepSeek, OpenCode Go, Grok и Codex ответили с первого запроса, Claude — через statusLine (прямой эндпоинт дал `429`).

На этой машине учётки всех шести на месте: `~/.claude/.credentials.json`, `~/.codex/auth.json`, `~/.grok/auth.json` (обновлён сегодня), `~/.local/share/opencode/auth.json`, `agy` в `%LOCALAPPDATA%\agy\bin`. Ключ DeepSeek лежит в том же `auth.json` OpenCode (провайдер `deepseek`); переменной `DEEPSEEK_API_KEY` в окружении Windows нет ни в User-, ни в Machine-области.

## Не выяснено

- **Почему человек считает, что ключ DeepSeek в переменной окружения** — переменных `DEEPSEEK_API_KEY`, `DEEPSEEK_KEY`, `DEEPSEEK_TOKEN` нет ни в User-, ни в Machine-области Windows; ключ нашёлся в `auth.json` OpenCode. Возможно, переменная задана в профиле оболочки или в обёртке запуска — это вопрос к человеку.
- **Заработает ли какой-то из пяти плагинов на Windows вопреки манифесту** — не проверял: герр отказывает по `min_herdr_version`, а поведение при чужом `platforms` в документации прямо не описано; независимо от этого хуки написаны под `sh`/`bash`/`python3` и требуют сборки Rust/Go с bash-скриптом установки.
- **Полный список событий плагинов herdr** — в `docs/plugins.mdx` перечислены не все, приведён пример `worktree.created`; имена событий брал из рабочего манифеста `agent-hotkeys`.
- **Периодического хука (таймера) в herdr нет** — в документации плагинов 0.9.1 такого раздела не нашёл, и все четыре плагина квот поднимают собственный фоновый наблюдатель из `[[startup]]`; прямого утверждения «таймеров нет» в документации не видел, поэтому это вывод, а не цитата.
- **Реальная точность цифр** любого из решений — не проверял, сверки с консолями провайдеров не делал.

## Где искал

- `gh search repos --topic herdr-plugin --limit 60`, `gh search repos "herdr quota"`, `gh search repos "herdr deepseek"` → каталог плагинов и пять кандидатов
- `gh api repos/<repo>/contents/herdr-plugin.toml`, `.../ci.yml`, `.../install.sh` → платформы, сборка, хуки
- README четырёх плагинов через `gh api repos/<repo>/readme` → провайдеры, источники данных, ограничения
- `gh search code --repo <repo> deepseek` → чем именно DeepSeek покрыт и где не покрыт
- [docs/plugins.mdx @ v0.9.1](https://raw.githubusercontent.com/herdrdev/herdr/v0.9.1/docs/next/website/src/content/docs/plugins.mdx) через `herdr.dev/llms.txt` → манифест, `platforms`, поведение на Windows
- [api-docs.deepseek.com](https://api-docs.deepseek.com/api/get-user-balance) → метод баланса

<sub>razvedka · 2026-09-21</sub>
