# tg-to-md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать CLI-утилиту `tg-to-md`, конвертирующую JSON-экспорт Telegram-чата в один Markdown-файл, оптимизированный для LLM. Соответствует спецификации [`docs/superpowers/specs/2026-04-19-tg-to-md-design.md`](../specs/2026-04-19-tg-to-md-design.md).

**Architecture:** Три модуля с чёткими границами: `bin/tg-to-md.js` (CLI), `src/parser.js` (streaming JSON через `stream-json`), `src/render.js` (чистые функции рендера). Поток данных: ReadStream → stream-json pipeline → async iterator → renderMessage → WriteStream. Валидация через один end-to-end smoke-тест на синтетической фикстуре.

**Tech Stack:** Node.js ≥20, ESM (`"type": "module"`), `stream-json` (единственный runtime-dep), встроенный `node --test` (без dev-deps).

---

## File Structure

| Путь | Ответственность |
|---|---|
| `package.json` | Метаданные, `bin`, `type: module`, скрипты, `files` для npm |
| `bin/tg-to-md.js` | CLI-обвязка: аргументы, дефолт output, createReadStream/WriteStream, error exit codes |
| `src/parser.js` | `parseTelegramExport(path) → { meta, messages }`. Единственное место, знающее про `stream-json` |
| `src/render.js` | Чистые функции: `renderHeader`, `renderMessage`, `renderEntities`, `mediaPrefix`, `formatDate`. Без IO |
| `test/fixtures/sample.json` | Синтетическая фикстура, 12 сообщений, покрывает все ветки рендера |
| `test/fixtures/sample.expected.md` | Эталонный вывод. Одновременно тест и живая документация формата |
| `test/smoke.test.js` | Один интеграционный тест: parser + render на fixture vs expected |
| `README.md` | Короткое описание, установка, использование |

---

## Task 1: Bootstrap проекта (package.json + структура каталогов)

**Files:**
- Create: `package.json`
- Create: `bin/` (пустой каталог — создастся при появлении файлов в Task 6)
- Create: `src/` (аналогично, Task 4)
- Create: `test/fixtures/` (аналогично, Task 2)

- [ ] **Step 1: Создать `package.json`**

```json
{
  "name": "tg-to-md",
  "version": "0.1.0",
  "description": "Convert Telegram chat JSON export to a single LLM-friendly Markdown file",
  "type": "module",
  "bin": {
    "tg-to-md": "bin/tg-to-md.js"
  },
  "files": [
    "bin",
    "src",
    "README.md"
  ],
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "test": "node --test",
    "start": "node bin/tg-to-md.js"
  },
  "dependencies": {
    "stream-json": "^1.8.0"
  }
}
```

- [ ] **Step 2: Установить зависимости**

Run: `npm install`
Expected: создаются `node_modules/`, `package-lock.json`. Без ошибок.

- [ ] **Step 3: Убедиться, что `node --test` работает на пустом проекте**

Run: `node --test`
Expected: тесты не найдены, exit code 0 (или сообщение «no tests found» — зависит от версии Node, оба варианта ок).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "bootstrap: package.json with stream-json dependency"
```

---

## Task 2: Фикстура и эталонный вывод (RED: артефакты теста до кода)

**Files:**
- Create: `test/fixtures/sample.json`
- Create: `test/fixtures/sample.expected.md`

Это «целевое состояние» рендера: описываем, как должен выглядеть вывод, до того как писать сам рендер. Весь последующий код пишется под этот эталон.

- [ ] **Step 1: Создать `test/fixtures/sample.json`**

Синтетический мини-экспорт, 12 сообщений, покрывает все ветки рендера из спеки. Поле `text_entities` — основной источник, `text` — дублирующая форма, которую Telegram тоже экспортирует.

```json
{
  "name": "Test Chat",
  "type": "private_supergroup",
  "id": 999,
  "messages": [
    {
      "id": 1,
      "type": "message",
      "date": "2026-01-01T10:00:00",
      "date_unixtime": "1767261600",
      "from": "Alice",
      "from_id": "user1",
      "text": "Hello!",
      "text_entities": [{"type": "plain", "text": "Hello!"}]
    },
    {
      "id": 2,
      "type": "service",
      "date": "2026-01-01T10:01:00",
      "date_unixtime": "1767261660",
      "actor": "Alice",
      "actor_id": "user1",
      "action": "pin_message",
      "message_id": 1,
      "text": "",
      "text_entities": []
    },
    {
      "id": 3,
      "type": "message",
      "date": "2026-01-01T10:02:00",
      "date_unixtime": "1767261720",
      "from": "Bob",
      "from_id": "user2",
      "reply_to_message_id": 1,
      "text": "Hi Alice!",
      "text_entities": [{"type": "plain", "text": "Hi Alice!"}]
    },
    {
      "id": 4,
      "type": "message",
      "date": "2026-01-01T10:03:00",
      "date_unixtime": "1767261780",
      "from": "Alice",
      "from_id": "user1",
      "text": [
        "Смотри ",
        {"type": "text_link", "text": "тут", "href": "https://example.com"},
        " и ",
        {"type": "link", "text": "https://foo.bar"}
      ],
      "text_entities": [
        {"type": "plain", "text": "Смотри "},
        {"type": "text_link", "text": "тут", "href": "https://example.com"},
        {"type": "plain", "text": " и "},
        {"type": "link", "text": "https://foo.bar"}
      ]
    },
    {
      "id": 5,
      "type": "message",
      "date": "2026-01-01T10:04:00",
      "date_unixtime": "1767261840",
      "from": "Bob",
      "from_id": "user2",
      "text": [
        {"type": "bold", "text": "Важно"},
        ": ",
        {"type": "italic", "text": "не забудь"}
      ],
      "text_entities": [
        {"type": "bold", "text": "Важно"},
        {"type": "plain", "text": ": "},
        {"type": "italic", "text": "не забудь"}
      ]
    },
    {
      "id": 6,
      "type": "message",
      "date": "2026-01-01T10:05:00",
      "date_unixtime": "1767261900",
      "from": "Carol",
      "from_id": "user3",
      "text": [
        "Цитирую:\n",
        {"type": "blockquote", "text": "сначала делаем\nпотом проверяем"},
        "\n\nвот так."
      ],
      "text_entities": [
        {"type": "plain", "text": "Цитирую:\n"},
        {"type": "blockquote", "text": "сначала делаем\nпотом проверяем"},
        {"type": "plain", "text": "\n\nвот так."}
      ]
    },
    {
      "id": 7,
      "type": "message",
      "date": "2026-01-01T10:06:00",
      "date_unixtime": "1767261960",
      "from": "Alice",
      "from_id": "user1",
      "photo": "photos/photo_1.jpg",
      "width": 1280,
      "height": 720,
      "photo_file_size": 12345,
      "text": "Вот фото",
      "text_entities": [{"type": "plain", "text": "Вот фото"}]
    },
    {
      "id": 8,
      "type": "message",
      "date": "2026-01-01T10:07:00",
      "date_unixtime": "1767262020",
      "from": "Alice",
      "from_id": "user1",
      "file": "files/doc.pdf",
      "file_name": "doc.pdf",
      "file_size": 54321,
      "mime_type": "application/pdf",
      "text": "Документ",
      "text_entities": [{"type": "plain", "text": "Документ"}]
    },
    {
      "id": 9,
      "type": "message",
      "date": "2026-01-01T10:08:00",
      "date_unixtime": "1767262080",
      "from": "Bob",
      "from_id": "user2",
      "file": "voice/voice_1.ogg",
      "media_type": "voice_message",
      "mime_type": "audio/ogg",
      "duration_seconds": 5,
      "text": "",
      "text_entities": []
    },
    {
      "id": 10,
      "type": "message",
      "date": "2026-01-01T10:09:00",
      "date_unixtime": "1767262140",
      "from": "Carol",
      "from_id": "user3",
      "file": "stickers/sticker.webp",
      "media_type": "sticker",
      "sticker_emoji": "🔥",
      "mime_type": "image/webp",
      "text": "",
      "text_entities": []
    },
    {
      "id": 11,
      "type": "message",
      "date": "2026-01-01T10:10:00",
      "date_unixtime": "1767262200",
      "from": "Alice",
      "from_id": "user1",
      "text": [
        "Реакция ",
        {"type": "custom_emoji", "text": "🎉", "document_id": "12345"},
        " на тесте."
      ],
      "text_entities": [
        {"type": "plain", "text": "Реакция "},
        {"type": "custom_emoji", "text": "🎉", "document_id": "12345"},
        {"type": "plain", "text": " на тесте."}
      ]
    },
    {
      "id": 12,
      "type": "message",
      "date": "2026-01-01T10:11:00",
      "date_unixtime": "1767262260",
      "from": "Dave",
      "from_id": "user4",
      "file": "video/clip.mp4",
      "media_type": "video_file",
      "mime_type": "video/mp4",
      "duration_seconds": 10,
      "width": 640,
      "height": 480,
      "text": "Клип",
      "text_entities": [{"type": "plain", "text": "Клип"}]
    }
  ]
}
```

- [ ] **Step 2: Создать `test/fixtures/sample.expected.md`**

Эталон рендера вышеуказанной фикстуры. Между сообщениями — одна пустая строка. Файл заканчивается одним `\n`.

```markdown
# Test Chat

Экспорт Telegram-чата. ID: 999.

---

### #1 — Alice · 2026-01-01 10:00

Hello!

### #3 — Bob · 2026-01-01 10:02 · ↩ #1

Hi Alice!

### #4 — Alice · 2026-01-01 10:03

Смотри [тут](https://example.com) и https://foo.bar

### #5 — Bob · 2026-01-01 10:04

Важно: не забудь

### #6 — Carol · 2026-01-01 10:05

Цитирую:
> сначала делаем
> потом проверяем

вот так.

### #7 — Alice · 2026-01-01 10:06

🖼️ Вот фото

### #8 — Alice · 2026-01-01 10:07

📎 Документ

### #9 — Bob · 2026-01-01 10:08

🎤

### #10 — Carol · 2026-01-01 10:09

🔥

### #11 — Alice · 2026-01-01 10:10

Реакция  на тесте.

### #12 — Dave · 2026-01-01 10:11

📎 Клип
```

Примечания к эталону:
- Сообщение #2 (service, pin) пропущено — его нет в выводе.
- У #9 (голосовое без текста) тело состоит только из эмодзи `🎤` — таково правило «префикс перед (возможно пустым) телом».
- У #10 стикер: префикса нет, тело — эмодзи из `sticker_emoji`.
- У #11 двойной пробел между «Реакция» и «на тесте» — это результат выкидывания `custom_emoji`, мы не пытаемся сшивать пробелы (YAGNI).
- Формат даты — `YYYY-MM-DD HH:MM`, секунды обрезаны.

- [ ] **Step 3: Commit**

```bash
git add test/fixtures/sample.json test/fixtures/sample.expected.md
git commit -m "test: add fixture and expected output for smoke test"
```

---

## Task 3: Smoke test runner (RED: тест падает, кода нет)

**Files:**
- Create: `test/smoke.test.js`

- [ ] **Step 1: Написать smoke-тест**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseTelegramExport } from "../src/parser.js";
import { renderHeader, renderMessage } from "../src/render.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "sample.json");
const EXPECTED = join(__dirname, "fixtures", "sample.expected.md");

test("smoke: sample.json renders to sample.expected.md", async () => {
  const { meta, messages } = await parseTelegramExport(FIXTURE);
  let actual = renderHeader(meta);
  for await (const msg of messages) {
    const rendered = renderMessage(msg);
    if (rendered !== null) actual += "\n" + rendered;
  }
  const expected = await readFile(EXPECTED, "utf8");
  assert.equal(actual, expected);
});
```

Формат склейки зеркалит CLI из Task 6:
- `renderHeader(meta)` возвращает шапку, заканчивающуюся на `\n` после `---`.
- Каждый ненулевой `renderMessage(msg)` возвращает блок `"### …\n\n<body>\n"` **с** завершающим `\n` — последний `\n` в выходе файла приходит именно оттуда.
- Перед каждым блоком после шапки вставляем `\n` — это даёт пустую строку-разделитель между блоками (`…\n` + `\n…` = два подряд `\n`).
- Финальный `\n` отдельно добавлять не нужно — он уже есть в конце последнего `renderMessage`.

- [ ] **Step 2: Запустить тест, убедиться, что падает**

Run: `node --test test/smoke.test.js`
Expected: FAIL с `ERR_MODULE_NOT_FOUND` для `../src/parser.js` — модулей ещё нет. Это правильный Red.

- [ ] **Step 3: Commit**

```bash
git add test/smoke.test.js
git commit -m "test: add smoke test runner (fails, no implementation yet)"
```

---

## Task 4: `src/render.js` — чистые функции рендера

**Files:**
- Create: `src/render.js`

В этой задаче пишем весь рендер, покрывающий все ветки из эталона. Тест пока не запустится — parser.js ещё нет, но render можно мысленно «прокрутить» по sample.json/sample.expected.md.

- [ ] **Step 1: Создать `src/render.js`**

```javascript
const PHOTO = "🖼️";
const FILE = "📎";
const VOICE = "🎤";

const SERVICE_TYPE = "service";

export function renderHeader(meta) {
  const name = meta.name ?? "Chat";
  const id = meta.id ?? "";
  const idLine = id !== "" ? ` ID: ${id}.` : "";
  return `# ${name}\n\nЭкспорт Telegram-чата.${idLine}\n\n---\n`;
}

export function renderMessage(msg) {
  if (msg.type === SERVICE_TYPE) return null;

  const header = renderMessageHeader(msg);
  const body = renderBody(msg);
  // Каждый блок заканчивается `\n`, чтобы его можно было конкатенировать
  // с `\n` перед следующим блоком — это даёт пустую строку-разделитель и
  // одновременно гарантирует `\n` в конце файла без дополнительного шага.
  return `${header}\n\n${body}\n`;
}

function renderMessageHeader(msg) {
  const author = msg.from ?? msg.from_id ?? "unknown";
  const date = formatDate(msg.date);
  const parts = [`#${msg.id}`, author, date];
  if (msg.reply_to_message_id !== undefined) {
    parts.push(`↩ #${msg.reply_to_message_id}`);
  }
  // "#id — author · date[ · ↩ #replyId]"
  return `### ${parts[0]} — ${parts.slice(1).join(" · ")}`;
}

function renderBody(msg) {
  // Стикер: тело — сам эмодзи, префикс не применяем.
  if (msg.sticker_emoji) return msg.sticker_emoji;

  const prefix = mediaPrefix(msg);
  const text = renderEntities(msg.text_entities ?? []);

  if (prefix && text) return `${prefix} ${text}`;
  if (prefix) return prefix;
  return text;
}

function mediaPrefix(msg) {
  if (msg.media_type === "voice_message" || msg.media_type === "video_message") {
    return VOICE;
  }
  if (msg.photo !== undefined) return PHOTO;
  if (msg.media_type === "video_file") return FILE;
  if (msg.file !== undefined) return FILE;
  return "";
}

function renderEntities(entities) {
  const out = [];
  for (const e of entities) {
    const piece = renderEntity(e);
    if (piece !== null) out.push(piece);
  }
  return out.join("");
}

function renderEntity(e) {
  switch (e.type) {
    case "custom_emoji":
      return null;
    case "text_link":
      return `[${e.text}](${e.href})`;
    case "blockquote":
      return formatBlockquote(e.text);
    case "plain":
    case "bold":
    case "italic":
    case "underline":
    case "strikethrough":
    case "spoiler":
    case "code":
    case "pre":
    case "link":
    case "mention":
    case "mention_name":
    case "hashtag":
    case "email":
    case "phone":
      return e.text ?? "";
    default:
      // Неизвестный тип — fallback на сырой текст, чтобы не терять контент.
      return e.text ?? "";
  }
}

function formatBlockquote(text) {
  // Каждая строка блока цитаты получает префикс "> ".
  // Пустые строки внутри блока тоже получают "> " — это стандартное MD-поведение.
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function formatDate(iso) {
  // Вход — "2026-01-01T10:00:00" (локальное время экспортёра, без таймзоны).
  // Выход — "2026-01-01 10:00".
  if (!iso) return "";
  const [date, time = ""] = iso.split("T");
  const hhmm = time.slice(0, 5);
  return hhmm ? `${date} ${hhmm}` : date;
}
```

Замечание по ветвлению `mediaPrefix`: проверка `voice_message` стоит раньше `photo`, хотя в реальных данных они не совпадают — это подстраховка на случай, если в экспорте у голосового окажется превью-картинка. Порядок соответствует спеке: стикер → голосовое → фото → видеофайл → прочий файл.

Замечание по склейке в `renderMessage`: между заголовком и телом — `\n\n` (пустая строка); `body` может быть пустой строкой — это допустимо (в эталоне таких случаев нет, но в реальности встретится сообщение только с `custom_emoji`; такое сообщение мы всё равно рендерим с пустым телом).

- [ ] **Step 2: Commit**

```bash
git add src/render.js
git commit -m "feat(render): pure rendering functions for message and header"
```

---

## Task 5: `src/parser.js` — streaming JSON

**Files:**
- Create: `src/parser.js`

- [ ] **Step 1: Создать `src/parser.js`**

```javascript
import fs from "node:fs";
import { createRequire } from "node:module";

// stream-json и stream-chain в 1.9.x — CJS-only, default-export — функция,
// named-импорты `{ chain } / { parser }` на ESM-стороне не резолвятся
// (Node выставляет только `default`). createRequire — официальный interop.
const require = createRequire(import.meta.url);
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { pick } = require("stream-json/filters/Pick.js");
const { streamArray } = require("stream-json/streamers/StreamArray.js");

/**
 * Stream-friendly reader for a Telegram chat JSON export.
 * Returns chat metadata (name, id) and an async iterable of messages.
 *
 * Memory usage stays constant regardless of input size: the messages
 * array is consumed one element at a time through stream-json.
 */
export async function parseTelegramExport(inputPath) {
  const meta = await readHeadMeta(inputPath);
  const messages = streamMessages(inputPath);
  return { meta, messages };
}

async function readHeadMeta(inputPath) {
  // Поля "name" и "id" в экспорте Telegram Desktop идут в самом начале JSON
  // (до массива messages). Читаем первые 16 КБ и выдёргиваем значения регексами —
  // этого достаточно, а потоковая сборка метаданных через stream-json при одновременной
  // стриминговой обработке массива messages усложнила бы архитектуру без реальной выгоды.
  const fh = await fs.promises.open(inputPath, "r");
  try {
    const buf = Buffer.alloc(16 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const head = buf.subarray(0, bytesRead).toString("utf8");
    const name = matchName(head);
    const id = matchId(head);
    return { name, id };
  } finally {
    await fh.close();
  }
}

function matchName(head) {
  // Учитываем возможные экранированные кавычки внутри имени.
  const m = head.match(/"name"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!m) return null;
  return unescapeJsonString(m[1]);
}

function matchId(head) {
  // id может быть отрицательным (для супергрупп с -100...).
  const m = head.match(/"id"\s*:\s*(-?\d+)/);
  return m ? m[1] : null;
}

function unescapeJsonString(s) {
  return s
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

async function* streamMessages(inputPath) {
  const pipeline = chain([
    fs.createReadStream(inputPath),
    parser(),
    pick({ filter: "messages" }),
    streamArray(),
  ]);
  for await (const { value } of pipeline) {
    yield value;
  }
}
```

Пояснение:
- `pick({ filter: "messages" })` оставляет в потоке только поддерево `messages` из корневого объекта, остальное отбрасывается.
- `streamArray()` эмитит по одному элементу в виде `{ key, value }`, где `value` — уже распаршенный объект-сообщение.
- `chain` из `stream-chain` корректно пробрасывает ошибки и закрывает ресурсы при падении потока.
- `stream-chain` приходит транзитивной зависимостью вместе с `stream-json`, поэтому отдельно в `package.json` его объявлять не нужно.

- [ ] **Step 2: Проверить, что smoke-тест теперь проходит**

Run: `node --test test/smoke.test.js`
Expected: PASS (1 тест).

Если тест падает — диагностика:
- Различие на уровне строк → diff в выводе ассерта покажет, какой именно блок разошёлся.
- Типичные причины: лишние/недостающие `\n`, неверный formatDate, забытый entity-тип.

- [ ] **Step 3: Commit**

```bash
git add src/parser.js
git commit -m "feat(parser): streaming JSON parser via stream-json"
```

---

## Task 6: `bin/tg-to-md.js` — CLI

**Files:**
- Create: `bin/tg-to-md.js`

- [ ] **Step 1: Создать `bin/tg-to-md.js`**

```javascript
#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";

import { parseTelegramExport } from "../src/parser.js";
import { renderHeader, renderMessage } from "../src/render.js";

async function main(argv) {
  const [inputArg, outputArg] = argv.slice(2);
  if (!inputArg) {
    printUsage();
    process.exit(1);
  }
  if (!fs.existsSync(inputArg)) {
    process.stderr.write(`tg-to-md: input file not found: ${inputArg}\n`);
    process.exit(1);
  }
  const outputPath = outputArg ?? deriveOutputPath(inputArg);

  const out = fs.createWriteStream(outputPath);
  try {
    const { meta, messages } = await parseTelegramExport(inputArg);
    await write(out, renderHeader(meta));
    for await (const msg of messages) {
      const rendered = renderMessage(msg);
      if (rendered === null) continue;
      await write(out, "\n" + rendered);
    }
  } finally {
    out.end();
    await once(out, "close");
  }
}

function deriveOutputPath(inputPath) {
  const ext = path.extname(inputPath);
  const base = ext ? inputPath.slice(0, -ext.length) : inputPath;
  return `${base}.md`;
}

async function write(stream, chunk) {
  if (!stream.write(chunk)) {
    await once(stream, "drain");
  }
}

function printUsage() {
  process.stderr.write("Usage: tg-to-md <input.json> [output.md]\n");
}

main(process.argv).catch((err) => {
  process.stderr.write(`tg-to-md: ${err.message}\n`);
  process.exit(1);
});
```

Пояснения:
- Shebang → работает через `npx tg-to-md` после публикации в npm.
- `deriveOutputPath`: у `input.json` заменяем `.json` на `.md`; без расширения — просто дописываем `.md`.
- `await write(...)` реализует backpressure: если внутренний буфер WriteStream переполнен, ждём `drain`, прежде чем продолжить.
- Склейка: первый блок (header) пишем без лидирующего `\n`; каждый следующий блок — с `\n` впереди. Вместе с завершающим `\n` внутри `renderMessage` это даёт пустую строку между блоками и корректный `\n` в конце файла без отдельного финального write.

- [ ] **Step 2: Сделать файл исполняемым**

Run: `chmod +x bin/tg-to-md.js`
Expected: нет вывода. Проверить `ls -l bin/tg-to-md.js` — видим `x`-права у владельца.

- [ ] **Step 3: Прогнать CLI на fixture вручную**

Run: `node bin/tg-to-md.js test/fixtures/sample.json /tmp/tg-to-md-smoke.md && diff /tmp/tg-to-md-smoke.md test/fixtures/sample.expected.md`
Expected: `diff` не выдаёт различий; exit code 0.

- [ ] **Step 4: Проверить опциональный output (создаётся рядом)**

Run: `node bin/tg-to-md.js test/fixtures/sample.json && diff test/fixtures/sample.md test/fixtures/sample.expected.md && rm test/fixtures/sample.md`
Expected: `diff` не выдаёт различий. После проверки удаляем временный `sample.md`, чтобы не засорять фикстуры.

- [ ] **Step 5: Прогнать полный набор тестов**

Run: `npm test`
Expected: 1 passing, 0 failing.

- [ ] **Step 6: Commit**

```bash
git add bin/tg-to-md.js
git commit -m "feat(cli): argv parsing, optional output, backpressure-aware writes"
```

---

## Task 7: Ручная проверка на реальном экспорте (`result.json`)

Автоматизированный тест покрывает все ветки рендера на 12 синтетических сообщениях. Теперь — визуальный sanity-check на реальных данных.

**Files:**
- Read-only: `result.json`

- [ ] **Step 1: Запустить конвертацию**

Run: `node bin/tg-to-md.js result.json /tmp/tg-result.md`
Expected: exit code 0, файл `/tmp/tg-result.md` создан. Время выполнения — секунды.

- [ ] **Step 2: Быстро просмотреть вывод**

Run: `head -80 /tmp/tg-result.md && echo "---" && wc -l /tmp/tg-result.md`
Expected (на глаз):
- Шапка `# Partita iva 🇮🇹` и строка `Экспорт Telegram-чата. ID: 1561962579.`.
- Формат сообщений совпадает с согласованным (`### #<id> — <from> · <date>`).
- Нет артефактов парсинга (обрезанных строк, сырых JSON-фрагментов, незакрытых ссылок).
- Количество строк разумное (десятки тысяч для ~90 сообщений в `result.json`).

Если что-то выглядит сломанным — это баг в реализации, а не в плане: возвращаемся к соответствующему модулю, чинимся, добавляем в фикстуру новый случай, если стоящий, и повторяем.

- [ ] **Step 3: Проверить отсутствие утечек памяти на большом файле (опционально, если `partita-iva.json` доступен)**

Run: `/usr/bin/time -l node bin/tg-to-md.js partita-iva.json /tmp/tg-partita.md 2>&1 | tail -20`
Expected: `maximum resident set size` укладывается в ~100–200 МБ независимо от размера входа — streaming работает корректно.

- [ ] **Step 4: Коммит не требуется**

Эта задача — приёмка, а не изменение кода.

---

## Task 8: README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Создать README**

```markdown
# tg-to-md

Convert a Telegram chat JSON export into a single Markdown file optimized for LLM consumption (search, summarization, Q&A).

## Usage

```bash
npx tg-to-md <input.json> [output.md]
```

If `output.md` is omitted, the tool writes alongside the input with `.json` replaced by `.md`:

```bash
npx tg-to-md chat.json          # → chat.md
npx tg-to-md chat.json out.md   # → out.md
```

## Input

Exports produced by Telegram Desktop: **Settings → Advanced → Export Telegram data**. Pick JSON format. Works on arbitrarily large exports — the tool streams the input and keeps memory usage constant.

## Output format

One big Markdown file. Each message is rendered as:

```
### #<message_id> — <author> · YYYY-MM-DD HH:MM [· ↩ #<reply_id>]

<body>
```

Media messages get a leading emoji marker: 🖼️ for photos, 🎤 for voice/video messages, 📎 for files and videos. Stickers are rendered as the sticker emoji alone. Inline links are preserved as Markdown links; rich text formatting is stripped; `blockquote` segments become Markdown `>` blocks.

Service messages (joins, pins, invites) are skipped. Reactions, edits, and forwards are not rendered — the output targets LLM ingestion, not UI reproduction.

Full format specification: [`docs/superpowers/specs/2026-04-19-tg-to-md-design.md`](docs/superpowers/specs/2026-04-19-tg-to-md-design.md).

## Development

```bash
npm install
npm test                                      # run smoke test
node bin/tg-to-md.js input.json output.md     # run locally
```

Requires Node.js ≥ 20.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with usage and format summary"
```

---

## Self-Review Checklist (завершена во время написания плана)

**Spec coverage:**
- Требование «один большой файл» → Task 6 пишет в один WriteStream.
- Требование «любой размер, не падать» → Task 5 streaming; Task 7 step 3 проверяет RSS.
- Требование «ссылки в MD-формате» → Task 4 ветки `text_link`, `link` в renderEntity.
- Шапка файла → Task 4 `renderHeader`, Task 2 эталон.
- Формат заголовка `#id — from · date · ↩ #reply` → Task 4 `renderMessageHeader`.
- Skip service, skip custom_emoji → Task 4 `renderMessage` и `renderEntity`.
- Blockquote как `>` → Task 4 `formatBlockquote`, Task 2 сообщение #6.
- Медиа-префиксы с порядком приоритета → Task 4 `mediaPrefix`, Task 2 сообщения #7–10, #12.
- Стикер = эмодзи как тело → Task 4 `renderBody` (ранний return), Task 2 сообщение #10.
- Skip reactions/edited/forwarded → Task 4 не читает этих полей.
- Опциональный `output.md` → Task 6 `deriveOutputPath`, Task 6 step 4 проверка.
- Чистота `render.js` (без IO) → Task 4 модуль ничего не импортирует из `node:fs`.

**Placeholder scan:** поиск по «TODO», «TBD», «implement later», «similar to» — не найдено. Все шаги содержат конкретный код и команды.

**Type consistency:** Экспорты `parseTelegramExport`, `renderHeader`, `renderMessage` — одинаковые имена в smoke-тесте, в parser, в render, в CLI. `meta.name` / `meta.id` — одинаковые ключи в parser и render. Формат fixture (`text_entities`, `sticker_emoji`, `media_type`, `photo`, `file`) — соответствует коду render и реальному экспорту Telegram.

---

## Execution Handoff

После сохранения плана — выбор режима исполнения:

**1. Subagent-Driven (recommended)** — отдельный subagent на каждую задачу, код-ревью между задачами, быстрая итерация.

**2. Inline Execution** — все задачи в текущей сессии через `superpowers:executing-plans`, батч с чекпойнтами.

Какой режим выбираешь?
