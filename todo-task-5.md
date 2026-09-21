# Задача #5: что сделать вам

Задача: https://github.com/VladPatr96/herdr-plugins/issues/5

Плагин `quota-board` уже подключён к вашему herdr, конфиг поправлен, мост
статус-строки Claude установлен. Осталось посмотреть и проверить цифры.

## 1. Открыть окно с квотами

Нажмите **Alt+Shift+Q**. Поверх активной панели откроется окно:

```
AI quota  ·  every subscription and API you run in Herdr

Claude Code        5h       ██████████  95% left · resets in 4h 45m
                   7d       ████████░░  77% left · resets in 3d 21h
Codex              7d       ████████░░  78% left · resets in 3d 22h
agy / Antigravity  needs setup: run /statusline inside agy
Grok               7d       ██████████ 100% left · resets in 39m
OpenCode Go        30d      ████████░░  80% left · resets in 2d 7h
DeepSeek API       balance $7.23
```

- `r` — обновить прямо сейчас, само обновляется раз в минуту.
- `q` — закрыть, фокус вернётся туда, где был.

## 2. Включить квоту agy (одна команда внутри agy)

agy нигде не хранит свою квоту — её видно только его собственной статус-строке.
Запустите `agy`, выполните в нём `/statusline` и вставьте:

```
node "D:\projects\my_projects\herdr_plugins\quota-board\bin\statusline.js" agy --state-dir "C:\Users\user\AppData\Local\herdr\plugins\vladpatr96.quota-board"
```

После одного ответа agy в окне появится его недельная квота (два пула:
родные модели Gemini и сторонние).

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
| Статус-строка Claude Code (`~/.claude/settings.json`) | `herdr plugin action invoke remove-statusline --plugin vladpatr96.quota-board`; бэкап — `settings.json.bak-quota-board` |
| Конфиг herdr (`%APPDATA%\herdr\config.toml`) | в нём добавлен только хоткей `alt+shift+q`; убрать его или вернуть `config.toml.bak-quota-board`, затем `herdr server reload-config` |
| Сам плагин | `herdr plugin unlink vladpatr96.quota-board` |

## Для сведения

- Ключ DeepSeek берётся из переменной `DEEPSEEK_API_KEY`; её на машине нет,
  поэтому плагин взял ключ, который уже лежит у OpenCode. Если заведёте
  переменную — она будет в приоритете.
- Квота Claude приходит из статус-строки: она обновляется, когда сессия
  отвечает, а не по таймеру. Прямой запрос к эндпоинту Anthropic на этом
  аккаунте отвечает `429` — открытых сессий слишком много.
- Разведка по готовым плагинам: `docs/razvedka-2026-09-21-quota-plugins.md`.
