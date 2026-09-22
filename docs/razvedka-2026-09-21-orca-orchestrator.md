---
gist: У orca оркестратор — это CLI поверх SQLite (Run → Task → Dispatch) плюс почта между агентами; в herdr запуск агента, вход в сессию и статусы уже есть нативно в `herdr pane`/`herdr agent`, поэтому плагину остаётся реестр задач, чек-лист и метки в сайдбаре.
---

**Вопрос:** как устроен оркестратор агентов у orca — как там запускаются агенты, как устроен сайдбар со списком, переключение в сессию агента, статусы — и что из этого переносимо в herdr.

**Исход:** найдено

**Дата:** 2026-09-21 · среда пользователя: herdr 0.9.1 нативный Windows 11, orca 1.3.x (Electron)

Разбор к [задаче #20](https://github.com/VladPatr96/herdr-plugins/issues/20).

## Ответ

Оркестратор orca — не UI-надстройка, а **база плюс CLI**: `%APPDATA%\orca\orchestration.db` (SQLite) хранит модель `Run → Task → Dispatch`, а агент-координатор двигает её глаголами `orca orchestration …`. Агент-исполнитель запускается одной командой `worker-start`, которая заводит задачу, создаёт worktree, открывает терминал, поднимает в нём агента нужной модели и отдаёт ему текст задачи. Статусы приходят не из парсинга экрана, а из **хуков агента**, которые стучатся в локальный HTTP-порт orca. Сайдбар — витрина над этой базой.

Для herdr важен вывод: **три из пяти пунктов задачи #20 у herdr уже есть нативно** — запуск агента с моделью (`herdr agent start … -- --model sonnet`), вход в его сессию (`herdr agent focus`, это обычный пейн) и статусы (`agent_status` + события `pane.agent_status_changed`). Переносить из orca нужно не механику запуска, а **реестр**: связь «агент ↔ задача ↔ чек-лист» и её показ в сайдбаре. Мультиагентную почту, worktree-на-задачу и DAG зависимостей первая версия не берёт.

## Факты

### Что такое orca и где он лежит

1. orca — Electron-приложение вендора `orca.dev` / `onorca.dev` (есть и версия для macOS в App Store, `id6766130217`); установлено в `C:\Users\user\AppData\Local\Programs\orca\`, данные в `%APPDATA%\orca\` — строки `https://app.orca.dev/skills/share/`, `https://apps.apple.com/app/orca-ide/id6766130217`, `https://c1.relay.onorca.dev` в `resources/app.asar` · факт
2. Часть кода приложения лежит распакованной и читается прямо с диска: `resources/app.asar.unpacked/out/cli/specs/*.js` — это декларации команд CLI вместе с `summary`, `usage` и `notes` · факт
3. Состояние оркестрации — SQLite `%APPDATA%\orca\orchestration.db`, 26 таблиц; ключевые: `runs`, `tasks`, `worker_dispatches`, `messages`, `decision_gates`, `question_threads`, `coordinator_runs`, `worker_terminal_resources`, `attempt_observation_facts` — `select name from sqlite_master where type='table'` · факт

### Модель данных

4. `runs` — «пространство имён и домашний почтовый ящик», у него `objective`, `coordinator_handle`, `coordinator_pane_key`; схема таблицы плюс примечание `run-create`: «A Run is a namespace and home inbox. It never schedules or places workers» · факт
5. `tasks` — сама задача: `spec` (текст), `task_title`, `status` из `pending | ready | dispatched | completed | failed | blocked`, `deps` (JSON-массив зависимостей), `parent_id`, `result` — `CREATE TABLE tasks` в `orchestration.db` · факт
6. `worker_dispatches` — одна попытка исполнения задачи агентом: `state` из `starting | ready | start_unknown | failed | succeeded | stopping | stop_unknown | stopped | abandoned`, плюс `worktree_id`, `agent_terminal_handle`, `start_options`, `last_error` — `CREATE TABLE worker_dispatches` · факт
7. Статус задачи и жизнь терминала разведены намеренно: «Terminal state is process accounting and is reported separately from Task status; a completed Task can still own a live terminal» — примечание к `worker-list` · факт
8. `messages` — почта между агентами: `from_handle`, `to_handle`, `subject`, `body`, `type` из `status | dispatch | worker_done | merge_ready | escalation | handoff | decision_gate | question | heartbeat`, `priority`, `thread_id` — `CREATE TABLE messages` · факт

### Как запускается агент

9. Запуск исполнителя — один глагол: `orca orchestration worker-start (--task <task_id> | --spec <text>) [--on <saved-environment>] [--worktree <current|selector|new-child|new-top-level>] (--agent <agent> | --terminal <handle>) [--task-title <text>] [--deps <json_array>] [--parent <task_id>] [--model <id>] [--effort <level>] …` — `usage` в `out/cli/specs/orchestration-worker-specs.js` · факт
10. Модель выбирается флагом при запуске: «`--model` supports Claude, Codex, and Cursor opaque provider model ids; `--effort` requires `--model`. Neither can combine with `--terminal`» — примечание к `worker-start` · факт
11. Новый worktree — поведение по умолчанию для нового воркера: «New worktrees use agent-first creation and default `--setup` to run» · факт
12. Как именно открывается терминал воркера, вызывающий не решает: «How the worker runs follows the user's own setting for new agent tabs; there is no flag for it and no caller needs to ask» · факт
13. Воркер без терминала — допустимый случай: «Not every worker has a terminal. Read output with `worker-read --source auto` or `--source transcript`, which always work; `--source terminal` is refused when there is none» · факт

### Список агентов, вход в сессию, вывод

14. Список воркеров — `orca orchestration worker-list [--run <run_id>] [--terminal-state <active|reclaimable|retained|release_pending|release_unknown|released>] [--include-remote] [--limit <1-100>]`; без `--run` область берётся от Run, к которому привязан вызывающий терминал · факт
15. Осмотр одного воркера — `worker-show --dispatch <id>`; в нём есть поле `observation.agentWait`: оно называет воркера, вставшего на вопрос, «with the evidence that proved it (hook, prompt-text, or title)», и отдельно оговорено, что отсутствие поля не означает «не ждёт», а ожидающий воркер «is healthy, not failed» · факт
16. Чтение вывода — `worker-read --dispatch <id> [--source auto|transcript|terminal] [--cursor …] [--limit …]`; `auto` предпочитает транскрипт, сообщённый хуком, и только иначе отдаёт вывод терминала · факт
17. Сайдбар со списком агентов — отдельные модули рендерера: `out/renderer/assets/SidebarAgentsList-*.js`, `AgentDashboardSidebarEntry-*.js`, `AgentDashboardSidebarHost-*.js`, `dashboard-orchestration-selection-*.js` — витрина над тем же состоянием, отдельной логики оркестрации в ней нет · факт

### Откуда берутся статусы

18. Статусы агентов поднимают **хуки агента**, которыми управляет сам orca: `orca agent hooks on | off | status | prepare-codex` — `out/cli/specs/agent-hooks.js` · факт
19. Хук стучится в локальный HTTP-эндпоинт с токеном: `%APPDATA%\orca\agent-hooks\endpoint.cmd` задаёт `ORCA_AGENT_HOOK_PORT=57680`, `ORCA_AGENT_HOOK_TOKEN=<uuid>`, `ORCA_AGENT_HOOK_TRANSPORT=raw-json-v1`; рядом `last-status.json` со слепком последних состояний · факт
20. Для OpenCode заведён отдельный канал — плагины в `%APPDATA%\orca\opencode-hooks\shared\plugins\` · факт
21. Каждый воркер работает в своей папке-воркспейсе: в кэше Claude Code на этой машине остались пути `C--Users-user-orca-workspaces-<проект>-<слаг-задачи>` (`life-os-finance-calculate`, `sport5280-content-media-hub`), то есть orca запускал Claude Code в `C:\Users\user\orca-workspaces\<проект>-<задача>`; самой папки сейчас нет — воркспейсы удаляются вместе с воркером · факт

### Что из этого уже умеет herdr

22. Пейн с произвольной командой и своим рабочим каталогом заводится из CLI: `herdr tab create [--workspace <id>] [--cwd PATH] [--label TEXT] [--env KEY=VALUE] [--focus|--no-focus]` и `herdr pane split [--direction right|down] [--cwd PATH] [--env KEY=VALUE] [--ratio FLOAT]` — `herdr tab --help`, `herdr pane split --help` на 0.9.1 · факт
23. Агент поднимается в готовом пейне штатной командой: `herdr agent start <NAME> --kind <KIND> --pane <ID> [--timeout <MS>] [-- <AGENT_ARG>…]`, где `KIND` — одно из 23 значений, включая `claude`, `codex`, `gemini`, `opencode`, `agy`, `grok`; аргументы после `--` уходят самому агенту, то есть `-- --model sonnet` задаёт модель · факт
24. Задача отдаётся агенту после запуска: `herdr agent prompt <TARGET> <TEXT> [--wait] [--until idle|working|blocked|done|unknown] [--timeout <MS>]`; подсказка самой `agent start` так и говорит: «next: `herdr agent prompt <TARGET> <TEXT> --wait`» · факт
25. Статусы у herdr нативные и совпадают по смыслу с orca: `herdr agent list` отдаёт на каждого агента `agent_status` (`idle | working | blocked | done | unknown`), `cwd`, `pane_id`, `tab_id`, `focused`, `agent_session.value` (id сессии Claude), `terminal_title` и `tokens` — вывод `herdr agent list` на живой сессии · факт
26. Смена статуса приходит плагину событием: `pane.agent_detected`, `pane.agent_status_changed`, `pane.exited` — на эти же события уже подписаны `agent-hotkeys` и `quota-board` в своих `herdr-plugin.toml` · факт
27. Вход в сессию агента — это фокус пейна: `herdr agent focus <target>`; `agent-hotkeys` так и делает в `bin/focus.js`, и переписка агента остаётся в его терминале · факт
28. Строку агента в сайдбаре плагин пишет сам: `herdr pane report-metadata <pane_id> --source <plugin> --seq <n> --token <name>=<value>`; `agent-hotkeys` этим рисует `$hotkey_line` — `agent-hotkeys/bin/sync.js` · факт
29. Git-worktree на задачу у herdr тоже есть: `herdr worktree create | open | list | remove` · факт

## Что берём в herdr, а что нет

30. **Берём модель «задача + исполнитель + статус» и реестр к ней.** У orca это `tasks` + `worker_dispatches` в SQLite; в herdr того же достаточно достичь файлом состояния плагина (так уже сделано в `agent-hotkeys/lib/runtime.js`: `HERDR_PLUGIN_STATE_DIR` + запись через временный файл и `rename`), потому что сам запуск и статус держит herdr · вывод из 5, 6, 25, 28
31. **Не берём собственный запуск агента.** `worker-start` у orca делает то, что в herdr уже разложено на три штатные команды (22, 23, 24); плагину остаётся их склеить · вывод из 9, 22, 23, 24
32. **Не берём хуки статуса.** Хук-эндпоинт с токеном (18, 19) нужен orca, потому что у неё нет своего слоя определения агента; herdr определяет статус сам и присылает его событием · вывод из 18, 19, 25, 26
33. **Не берём почту между агентами и DAG зависимостей.** `messages`, `decision_gates`, `question_threads`, `deps` обслуживают сценарий «агент-координатор ведёт стаю»; в задаче #20 координатор — человек в Claude Code, он входит в сессию агента и спрашивает голосом сессии · вывод из 4, 5, 8, 15
34. **Не берём worktree-на-задачу в первой версии.** Примитив у herdr есть (29), но он меняет рабочую папку агента и требует решения про ветки и слияние; задача #20 этого не просит · вывод из 11, 29
35. **Берём разведение «статус задачи» и «жив ли терминал».** Правило orca (7) прямо нужно: агент может закончить задачу и остаться в сайдбаре живым пейном, и наоборот — пейн закрыт, а задача не доведена · вывод из 6, 7
36. **Чек-лист плана придётся делать своим.** У orca роль чек-листа играют `tasks.deps` и статусы отдельных задач в базе (5); в herdr нет ни базы задач, ни общего для Claude Code и codex формата плана, поэтому нужен один носитель, понятный обоим агентам — файл плана, который агент ведёт сам, а плагин читает и показывает · вывод из 5, 23, 33

## Чего выяснить не удалось

37. Как именно `worker-start` разговаривает с агентом в терминале (шлёт текст, файл или использует api агента) — реализация лежит в `app.asar` в собранном виде, распакованы только декларации команд; на решение по herdr это не влияет, там ответ известен (24) · не выяснено
38. Формат `start_options` в `worker_dispatches` — таблица на этой машине пуста (0 строк), живого примера нет · не выяснено
39. Публичной документации оркестратора orca в открытом виде не нашёл: `app.orca.dev/skills/share/` — раздача скиллов, а не описание модели; разбор сделан по самому приложению · не выяснено
