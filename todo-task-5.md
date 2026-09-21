# Задача #5: что сделать вам

Задача: https://github.com/VladPatr96/herdr-plugins/issues/5

Плагин `quota-board` уже подключён к вашему herdr, хоткей добавлен, мосты
статус-строк Claude и agy установлены. Осталось перезапустить agy и сверить
цифры.

## 1. Открыть окно с квотами

Нажмите **Alt+Shift+Q**. Поверх активной панели откроется окно:

```
AI quota  ·  every subscription and API you run in Herdr

Claude Code        5h       ████████░░  83% left · resets 17:20 · in 3h 46m
                   7d       ████████░░  75% left · resets пт 10:00 · in 3d 20h
                   7d Fable ██████████ 100% left · resets пт 10:00 · in 3d 20h
Codex              7d            ███████░░░  77% left · resets пт 11:13
                   7d gpt-reserve ██████████ 100% left · resets пн 13:33
                   prolite · 2 free resets available · first expires in 12d
agy / Antigravity  status line is wired up — restart agy and send it one turn
Grok               7d       ██████████ 100% left · resets пн 13:13 · in 6d 23h
OpenCode Go        30d      ████████░░  80% left · resets ср 19:35 · in 2d 6h
DeepSeek API       balance $7.23
```

- `r` — обновить прямо сейчас, само обновляется раз в минуту.
- `q` — закрыть, фокус вернётся туда, где был.
- Пока окно закрыто, цифры всё равно освежаются: каждый ход любого агента
  обновляет кэш (не чаще раза в две минуты), так что смена модели или
  харнесса видна без ручного обновления.
- Время везде локальное — то, что на этой машине.

## 2. Перезапустить agy

Статус-строка agy уже настроена за тебя: в её настройках стояла заглушка
`"to enable"` — ничего не запускавшая команда, из-за неё квоты agy и не было.
Теперь там мост плагина (бэкап — `settings.json.bak-quota-board`).

- [ ] Закрой и открой `agy`, отправь ему любой запрос.
- [ ] Открой окно квот — у agy появятся строки вида `5h <модель>` и `7d <модель>`.

Если строки не появились, скажи — я посмотрю, что именно agy прислал: мост
записывает состав данных (только имена полей, без значений).

## 3. Сверить цифры

Главное, ради чего всё: числа должны сходиться с тем, что показывают сами
сервисы.

- [ ] **Claude Code** — `/usage` в Claude Code: 5h и 7d те же.
- [ ] **Codex** — `/status` в codex: недельное окно то же.
- [ ] **Grok** — счёт в самом grok CLI.
- [ ] **OpenCode Go** — `opencode` и его страница плана.
- [ ] **DeepSeek** — баланс в кабинете platform.deepseek.com.

Если где-то расходится — скажите, где и насколько.

## 4. Сообщить результат

- **Всё сходится:** я отправлю задачу на приёмку, её проверит агент с чистым
  контекстом.
- **Что-то не так:** опишите, что видите, и я поправлю.

## 5. После приёмки

- [ ] Смёржите PR из ветки `task/5-kvoty-podpisok-ii-agentov-pokazat-v` в `main`:
  https://github.com/VladPatr96/herdr-plugins/pull/new/task/5-kvoty-podpisok-ii-agentov-pokazat-v
- [ ] Скажите «принято», и я закрою задачу и запишу разбор в hq.

## Если что-то пошло не так: откат

Всё, что менялось за пределами репозитория, обратимо:

| Что | Как вернуть |
|---|---|
| Статус-строки Claude Code и agy (`~/.claude/settings.json`, `~/.gemini/antigravity-cli/settings.json`) | `herdr plugin action invoke remove-statusline --plugin vladpatr96.quota-board`; бэкапы — `settings.json.bak-quota-board` рядом с каждым |
| Конфиг herdr (`%APPDATA%\herdr\config.toml`) | в нём добавлен только хоткей `alt+shift+q`; убрать его или вернуть `config.toml.bak-quota-board`, затем `herdr server reload-config` |
| Сам плагин | `herdr plugin unlink vladpatr96.quota-board` |

## Для сведения

- Ключ DeepSeek берётся из переменной `DEEPSEEK_API_KEY`; её на машине нет,
  поэтому плагин взял ключ, который уже лежит у OpenCode. Если заведёте
  переменную — она будет в приоритете.
- Квота Claude берётся из эндпоинта Anthropic — только он отдаёт отдельные
  недельные пулы по моделям (`7d Fable`). Если он ответит `429` (бывает, когда
  открыто много сессий), плагин показывает данные статус-строки: там есть 5h и
  7d, но нет пулов по моделям.
- У Codex видно каждый пул, который он списывает (`7d`, `7d gpt-reserve`), и
  сколько осталось бесплатных сбросов лимита.
- Разведка по готовым плагинам: `docs/razvedka-2026-09-21-quota-plugins.md`.
