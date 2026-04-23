# Известные потенциальные баги

Список найденных, но пока не починенных проблем. Все — low-priority / edge-case. Сюда же дописываем будущие находки, которые решили отложить.

## 1. Процесс виснет при невозможности открыть выходной файл

**Где:** [bin/tg-to-md.js:24](../bin/tg-to-md.js#L24)

**Суть.** `fs.createWriteStream(outputPath)` на read-only директории (или при `ENOENT` на промежуточном пути) асинхронно эмитит `error`. Листенер `out.on("error", () => {})` глотает его. Дальше `renderExport` зовёт `write(out, chunk)`; на destroyed-стриме `stream.write()` возвращает `false`, helper уходит в `await once(stream, "drain")` — событие `drain` на destroyed-стриме не срабатывает никогда. Процесс висит до `Ctrl+C`.

**Pre-existing.** Не внесено фичей рендер-апгрейда — было и раньше.

**Набросок фикса.** Race между рендером и stream-error:

```js
const streamOpenError = new Promise((_, reject) => out.once("error", reject));
const renderDone = renderExport(parseResult, (chunk) => write(out, chunk));
const stats = await Promise.race([renderDone, streamOpenError]);
```

Или guard в `write(stream, chunk)` — кидать сразу, если `stream.destroyed`.

---

## 2. `📌 #undefined` при `pin_message` без `message_id`

**Где:** [src/render.js:153](../src/render.js#L153)

**Суть.** Если Telegram экспортирует `pin_message` без `message_id` (старые экспорты, удалённое сообщение), в теле окажется литерал `📌 #undefined`. В реальных экспортах не встречалось.

**Набросок фикса.**
```js
return msg.message_id !== undefined ? `📌 #${msg.message_id}` : `📌`;
```

---

## 3. Имя чата с `\uXXXX`-escape'ами портит имя файла

**Где:** [src/parser.js:120](../src/parser.js#L120) (`unescapeJsonString`)

**Суть.** Мы извлекаем `meta.name` регэкспом из первых 16 КБ JSON и вручную распаковываем `\"`, `\\`, `\n`, `\t`. `\uXXXX` — нет. Если в JSON окажется Unicode-escape (например, `"Майя"`), имя придёт как литеральные символы `М...`, дальше `sanitizeFilename` заменит `\` на `_` и получится `_u041c_u0430...md`.

Современный Telegram Desktop пишет UTF-8 напрямую — не воспроизводится. Старые версии/нестандартные экспортёры — теоретически возможно.

**Набросок фикса.** Добавить один `replace` в начало `unescapeJsonString`:

```js
.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
```

Для non-BMP (пары surrogate) это не полностью корректно, но покроет >99% реальных случаев.

---

## 4. Пустое тело сообщения даёт тройной перенос

**Где:** [src/render.js:35](../src/render.js#L35)

**Суть.** `renderMessage` всегда возвращает `header + "\n\n" + body + "\n"`. Если `body === ""` (сообщение без текста, стикера и медиа), выходит `"### …\n\n\n"`. Пайплайн перед каждым блоком добавляет `"\n"`, поэтому два подряд таких сообщения дадут двойной blank line.

В реальных экспортах не встречалось (у media/voice/sticker всегда есть prefix). Если встретится — заметим по пустым блокам.

**Потенциальный фикс.** Либо `return null` для пустого тела (но это молчаливо теряет сообщение), либо положить `<empty>` placeholder.
