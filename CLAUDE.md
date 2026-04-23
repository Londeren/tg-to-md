# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Что это за проект

`tg-to-md` — CLI-утилита на Node.js, конвертирующая JSON-экспорт Telegram-чата в один Markdown-файл, оптимизированный для подачи в LLM (поиск, саммаризация, Q&A).

Спецификации:
- Базовый дизайн — [docs/superpowers/specs/2026-04-19-tg-to-md-design.md](docs/superpowers/specs/2026-04-19-tg-to-md-design.md).
- Доработки рендера (реакции, service-сообщения, имя выходного файла, шапка чата) — [docs/superpowers/specs/2026-04-23-rendering-enhancements-design.md](docs/superpowers/specs/2026-04-23-rendering-enhancements-design.md).

Перед изменением формата вывода, CLI или архитектуры сверяйся со спеками; при расхождении с кодом — исправляй то, что на самом деле расходится с намерением.

## Статус

Основной функционал реализован: парсер + рендер + пайплайн + CLI. Покрыт тестами (`node --test`). Активно дорабатывается — см. свежие спеки/планы в `docs/superpowers/`.

## Язык общения

В диалоге с пользователем — на русском (явное предпочтение). Идентификаторы в коде, зависимости, JSDoc и сообщения об ошибках в stderr — на английском.

## Ключевые технические ограничения (осознанные решения, не менять молча)

- **Чистый JavaScript, без сборки.** Сознательно не на TypeScript — чтобы `npx tg-to-md` работал без компиляции у пользователя. Не вводи tsc/esbuild/swc/babel.
- **ES modules.** `package.json` содержит `"type": "module"`. Используй `import`, а не `require`.
- **Streaming всегда.** Вход может быть гигабайтного размера. Парсинг — только через `stream-json` + `StreamArray`. Никогда не пиши `JSON.parse(fs.readFileSync(...))` для основного входного файла.
- **Минимум runtime-зависимостей.** Сейчас запланирована одна: `stream-json`. Новые — обсуждать перед добавлением.
- **Тесты — встроенный `node --test`.** Не подключай vitest/jest/mocha.
- **Чистота `src/render.js`.** Вся логика рендеринга — чистые функции без IO. Тестируются напрямую, без файловой системы.

## Запуск и тесты

```
node bin/tg-to-md.js <input.json> [output.md]   # без output рядом с input создаётся .md
node --test                                      # все тесты
```

## Архитектура

Пять модулей с чёткими границами:

- `bin/tg-to-md.js` — CLI-обвязка: парсинг аргументов, открытие read/write-стримов, stderr-summary, обработка кодов возврата. Имя выходного файла: если `output.md` не указан и вход — single-chat с `meta.name`, берём `<dir>/<sanitize(name)>.md`; для `saved_messages` без имени — `Saved Messages.md`; для bulk или при пустом/мусорном имени — fallback на имя входного файла.
- `src/parser.js` — streaming JSON → `{ chats, isBulk, singleMeta }`. Единственное место, которое знает о `stream-json`. `singleMeta` извлекается из первых 16 КБ head-буфера и нужен CLI для деривации имени выхода.
- `src/render.js` — чистые функции `renderHeader(meta)`, `renderMessage(msg) → string | null` (null = пропустить), `renderSkippedSummary(counts)`. Никакого IO.
- `src/pipeline.js` — оркестрация (`renderExport(parseResult, write)`), разделяемая `bin/` и smoke-тестом: эмитит inter-chat `\n---\n\n`, собирает per-chat `Map<action, count>` для summary, возвращает `{ chatCount, rendered, skippedTotal, firstMeta }` для stderr.
- `src/filename.js` — чистые `sanitizeFilename` и `deriveOutputPath(inputPath, parseResult)`.

Поток: `createReadStream` → stream-json pipeline → async iterator → `renderMessage` → `writeStream.write`. Память — постоянная независимо от размера входа; учитывай backpressure (`drain`).

## Правила рендеринга — критичное

Полная таблица — в спеке. Тонкие моменты, чтобы не переспрашивать:

- `type: "service"`: `phone_call` → `📞 <MM:SS | discard_reason>`, `pin_message` → `📌 #<message_id>`; все прочие (join/invite/remove/boost/migrate/…) пропускаются и попадают в per-chat строку `_Service messages skipped: <action> ×N, …_` в конце секции чата (эмитит `pipeline.js`).
- `custom_emoji` как entity внутри текста — пропускаем. В `reactions` все `custom_emoji` схлопываются в одну группу `🧩×N`.
- `reactions` рендерятся в заголовке как `[<emoji>[×N],…,🧩×M]` (группировка по emoji в порядке появления, `×` только если count>1). `edited`, `forwarded_from` — не рендерим.
- Формат заголовка сообщения: `### #<id> — <from> · <date>[ · ↩ #<reply_to_message_id>][ · [<reactions>]]`. ID всегда первый — по нему LLM резолвит reply-ссылки внутри файла.
- Формат шапки чата: `# <name>\n\n> Telegram · <type> · id <id>.\n`. Между чатами в bulk-экспорте — `\n---\n\n`.
- Форматирование текста (bold/italic/underline/strikethrough/spoiler/code/pre) — **выкидываем**, оставляем plain.
- `blockquote` внутри текста — **сохраняем** как `> ` (редкий, но единственный смысловой элемент форматирования).
- Ссылки: `text_link` → `[текст](url)`; `link` (голый URL) → URL как есть.
- `reply_to_message_id` → `↩ #<id>` в заголовке; тело reply-цели **не дублируем**.
- Медиа-префиксы (порядок детекции — первый сработавший): стикер (`sticker_emoji`) → эмодзи как тело; голосовое/круглое видео → 🎤; фото → 🖼️; `video_file`/прочий файл → 📎. Для 📎 при наличии `file_name` имя файла идёт на отдельной строке: `📎 [<file_name>]\n<text>` (если `text` пуст — только первая строка).

## Тестовые данные

- `result.json` (~70 КБ) — небольшой сэмпл. **В git не коммитится** (`.gitignore`) — содержит реальные сообщения.
- `partita-iva.json` (~23 МБ) — полный экспорт, 24 942 сообщения, тоже в `.gitignore`.
- Для автоматических тестов используем минимальные синтетические фикстуры в `test/fixtures/`.

## Процесс работы

Используются superpowers-скиллы: `brainstorming` → `writing-plans` → `executing-plans`/TDD. Спеки — в `docs/superpowers/specs/`.
