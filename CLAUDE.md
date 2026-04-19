# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Что это за проект

`tg-to-md` — CLI-утилита на Node.js, конвертирующая JSON-экспорт Telegram-чата в один Markdown-файл, оптимизированный для подачи в LLM (поиск, саммаризация, Q&A).

Полная спецификация — [docs/superpowers/specs/2026-04-19-tg-to-md-design.md](docs/superpowers/specs/2026-04-19-tg-to-md-design.md). Перед изменением формата вывода, CLI или архитектуры сверяйся с ней; при расхождении с кодом исправляй то, что на самом деле расходится с намерением.

## Статус

Дизайн согласован, код ещё не написан. Следующий шаг — план реализации и TDD.

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

Три модуля с чёткими границами:

- `bin/tg-to-md.js` — CLI-обвязка: парсинг аргументов, открытие read/write-стримов, обработка ошибок и кодов возврата.
- `src/parser.js` — streaming JSON → async iterable сообщений. Единственное место, которое знает о `stream-json`.
- `src/render.js` — чистые функции `renderHeader(meta)` и `renderMessage(msg) → string | null` (null = пропустить). Никакого IO.

Поток: `createReadStream` → stream-json pipeline → async iterator → `renderMessage` → `writeStream.write`. Память — постоянная независимо от размера входа; учитывай backpressure (`drain`).

## Правила рендеринга — критичное

Полная таблица — в спеке. Тонкие моменты, чтобы не переспрашивать:

- `type: "service"` (pin, join, invite, remove, boost, migrate) — пропускаем целиком.
- `custom_emoji` — пропускаем.
- Формат заголовка: `### #<id> — <from> · YYYY-MM-DD HH:MM[ · ↩ #<reply_to_message_id>]`. ID всегда первый — по нему LLM резолвит reply-ссылки внутри файла.
- Форматирование текста (bold/italic/underline/strikethrough/spoiler/code/pre) — **выкидываем**, оставляем plain.
- `blockquote` внутри текста — **сохраняем** как `> ` (редкий, но единственный смысловой элемент форматирования).
- Ссылки: `text_link` → `[текст](url)`; `link` (голый URL) → URL как есть.
- `reply_to_message_id` → `↩ #<id>` в заголовке; тело reply-цели **не дублируем**.
- Медиа-префиксы (порядок детекции — первый сработавший): стикер (`sticker_emoji`) → эмодзи как тело; голосовое/круглое видео → 🎤; фото → 🖼️; `video_file`/прочий файл → 📎.
- `reactions`, `edited`, `forwarded_from` — не рендерим.

## Тестовые данные

- `result.json` (~70 КБ) — небольшой сэмпл. **В git не коммитится** (`.gitignore`) — содержит реальные сообщения.
- `partita-iva.json` (~23 МБ) — полный экспорт, 24 942 сообщения, тоже в `.gitignore`.
- Для автоматических тестов используем минимальные синтетические фикстуры в `test/fixtures/`.

## Процесс работы

Используются superpowers-скиллы: `brainstorming` → `writing-plans` → `executing-plans`/TDD. Спеки — в `docs/superpowers/specs/`.
