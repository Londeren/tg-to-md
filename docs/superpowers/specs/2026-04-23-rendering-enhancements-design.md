# Реакции, сервисные сообщения, имя выходного файла — дизайн

**Дата:** 2026-04-23
**Статус:** согласован
**Связанный спек:** [2026-04-19-tg-to-md-design.md](./2026-04-19-tg-to-md-design.md) — текущий рендер, от которого отталкиваемся.

## Зачем

После работы с реальными экспортами обнаружились пробелы:

- **Реакции теряются.** В переписке реакция часто несёт больше смысла, чем текст ответа; для LLM это сигнал тональности и согласия.
- **Полезные сервисные сообщения режутся.** `phone_call` и `pin_message` содержательны: «когда звонили», «что считалось важным». Сейчас они идут в общий пропуск.
- **Нет следа о пропущенных событиях.** Читатель и LLM не знают, что вообще было скрыто.
- **Шапка чата визуально разорвана** `---` после заголовка, который смотрится как граница между чатами, хотя это граница шапки и первого сообщения.
- **Имя выходного файла** всегда производится от имени входного, хотя `meta.name` обычно даёт более человечное имя.

Эти пять изменений разбираются одним проходом по `src/render.js`, `src/parser.js` и `bin/tg-to-md.js`.

## Вне области

- Интернационализация строки summary и мета-блока (всё на английском для языковой нейтральности).
- Сохранение `edited`, `forwarded_from`, `via_bot` — остаётся out of scope как и раньше.
- Ветка `type: "paid"` реакций не встречалась в реальных данных; попадёт в ту же корзину `🧩`, что и `custom_emoji` (см. ниже) — без специальной обработки.

## Изменения

### 1. Реакции в заголовке сообщения

В конец строки-заголовка сообщения добавляется блок `[…]` при непустом `msg.reactions`.

**Группировка:**

- `type: "emoji"` — группируем по полю `emoji` (юникодный символ), суммируем `count`. Порядок групп — по первому появлению в массиве.
- `type: "custom_emoji"` (и любой другой неизвестный тип) — схлопываются в единственную группу `🧩` с просуммированным `count`. Эта группа всегда идёт последней.

**Формат группы:** `<char>` если `count == 1`, `<char>×<count>` иначе. Группы соединяются через `,` без пробела, обёртка — `[…]`.

**Позиция в заголовке:** после даты, после `↩ #<rid>` (если есть).

Пример (реальный `id 319524` — 😢 + два разных custom_emoji):
```
### #319524 — Sergey Lebedev · 2025-12-10T20:46:30 · [😢,🧩×2]
```

Если `reactions` пуст или отсутствует — блок не добавляется.

### 2. Рендер двух сервисных типов

Для `msg.type === "service"` по-прежнему вызывается `renderMessage`, но два `action` теперь возвращают строку, а не `null`:

**`phone_call`:**
- Заголовок — стандартный формат, автор из `msg.actor ?? msg.actor_id ?? "unknown"`.
- Тело (по убыванию приоритета):
  - `duration_seconds > 0` → `📞 <длительность>`, где длительность:
    - `M:SS` для <60 минут (`90` → `1:30`)
    - `H:MM:SS` от часа и больше (`3665` → `1:01:05`)
  - иначе `discard_reason` → `📞 <reason>` (например, `📞 missed`, `📞 busy`)
  - иначе просто `📞`

**`pin_message`:**
- Заголовок — стандартный.
- Тело: `📌 #<message_id>`.

Все остальные значения `action` (`join_group_by_link`, `invite_members`, `remove_members`, `boost_apply`, `migrate_*`, `create_*`, `edit_group_title`, `edit_group_photo`, `group_call`, и т. п., а также случаи без `action`) по-прежнему возвращают `null` и учитываются в summary пропусков.

### 3. Summary пропущенных сервисных сообщений

В конце секции каждого чата, после последнего сообщения, через `\n\n---\n\n` — одна курсивная строка:

```
_Service messages skipped: join_group_by_link ×30, boost_apply ×2._
```

- Ключ — `msg.action ?? "unknown"`.
- Учитываются только `type: "service"`, которые вернули `null` (т.е. то, что действительно было выкинуто именно как сервисное).
- Сортировка: по `count` убыв., при равенстве — лексикографически по action.
- Если в чате ничего не пропущено — строка и разделитель не пишутся.

Счётчик живёт в `bin/tg-to-md.js` как `Map<string, number>`, сбрасывается на границе каждого чата. Рядом поддерживается отдельный глобальный `skippedTotal: number` — именно он уходит в stderr-summary (итоговая строка `tg-to-md: … → …`), чтобы поведение stderr не менялось.

### 4. Шапка чата — новый формат

Было:
```
# <name>

Экспорт Telegram-чата. Type: <type>. ID: <id>.

---

### #1 — …
```

Стало:
```
# <name>

> Telegram · <type> · id <id>.

### #1 — …
```

**Правила мета-строки (blockquote):**

- Компоненты соединяются через ` · `, в конце — точка.
- Порядок: `Telegram` → `type` (если есть) → `id <id>` (если есть).
- Примеры:
  - Все поля: `> Telegram · personal_chat · id 666839415.`
  - Без `type`: `> Telegram · id 666839415.`
  - Без `id`: `> Telegram · personal_chat.`
  - Ни того, ни другого: `> Telegram.`

`renderHeader` больше **не** эмитит трейлинг `---`. Разделитель между чатами (`\n---\n\n`) пишет `bin/tg-to-md.js` между итерациями, как сейчас.

Разрешение имени (`resolveChatName`) остаётся прежним: `meta.name` → `"Saved Messages"` для `type: "saved_messages"` → `Chat #<id>` → `"Chat"`.

### 5. Имя выходного файла из названия чата

`parseTelegramExport` расширяется:

```js
{
  chats: AsyncIterable<{ meta, messages }>,
  isBulk: boolean,
  singleMeta: { name, type, id } | null,   // null для bulk
}
```

`singleMeta` заполняется из уже читаемого 16-килобайтного head-буфера — никаких новых IO-операций не вводится.

`bin/tg-to-md.js`, если `outputArg` не задан, вычисляет путь так:

1. `isBulk === true` → fallback на имя входного файла (как сейчас).
2. `singleMeta.name` непусто → `<dir of input>/<sanitize(name)>.md`.
3. `singleMeta.type === "saved_messages"` (а `name` пусто) → `<dir of input>/Saved Messages.md`.
4. Иначе → fallback.

Если `sanitize(name)` вернул пустую строку — fallback.

**`sanitizeFilename(s)`:**

- Символы `/ \ : * ? " < > |` и управляющие (`\x00-\x1F`, `\x7F`) → `_`.
- Trim ведущих/хвостовых пробелов и точек.
- Обрезать до 200 байт UTF-8, не ломая кодпойнт (идти по `[...str]` и считать `Buffer.byteLength`).
- Если после всего пусто — вернуть пустую строку; caller делает fallback.

## Контракты модулей

`src/parser.js`:
```js
export async function parseTelegramExport(inputPath): Promise<{
  chats: AsyncIterable<{ meta: { name, type, id }, messages: AsyncIterable<object> }>,
  isBulk: boolean,
  singleMeta: { name, type, id } | null,
}>
```

`src/render.js`:
```js
export function renderHeader(meta): string       // без трейлинг ---
export function renderMessage(msg): string | null
```

Внутренние хелперы (не экспортируются из публичного API): `renderReactions`, `renderServiceBody`, `formatCallDuration`. `sanitizeFilename` — отдельный модуль `src/filename.js` (тестируется напрямую).

## Поток в bin/

```js
const { chats, isBulk, singleMeta } = await parseTelegramExport(inputArg);
const outputPath = outputArg ?? deriveOutputPath(inputArg, { isBulk, singleMeta });
const out = fs.createWriteStream(outputPath);

let isFirstChat = true;
for await (const { meta, messages } of chats) {
  if (!isFirstChat) await write(out, "\n---\n\n");
  isFirstChat = false;

  await write(out, renderHeader(meta));

  const skipped = new Map();
  for await (const msg of messages) {
    const block = renderMessage(msg);
    if (block === null) {
      if (msg.type === "service") {
        const key = msg.action ?? "unknown";
        skipped.set(key, (skipped.get(key) ?? 0) + 1);
        skippedTotal++;
      }
      continue;
    }
    await write(out, "\n" + block);
    rendered++;
  }

  if (skipped.size > 0) {
    await write(out, "\n\n---\n\n" + renderSkippedSummary(skipped) + "\n");
  }
}
```

`renderSkippedSummary(map)` — чистая функция, живёт в `src/render.js`:

```js
_Service messages skipped: <sorted entries separated by ", ">._
```

## Тест-план

### `test/render.test.js` — расширить

**`renderHeader`:**
- все поля → `# X\n\n> Telegram · personal_chat · id 42.\n`
- только name → `# X\n\n> Telegram.\n`
- `saved_messages` без name → `# Saved Messages\n\n> Telegram · saved_messages · id 1.\n`
- нет трейлинг `---`

**Реакции:**
- нет `reactions` → нет `[…]`
- одна emoji count=1 → `[❤]`
- одна emoji count=3 → `[❤×3]`
- две разные emoji → `[❤,🔥]` (порядок появления)
- два одинаковых emoji-элемента → склейка `[❤×2]`
- только custom_emoji count=2 → `[🧩×2]`
- mix: emoji + 2 разных custom_emoji → `[😢,🧩×2]`
- реакции вместе с `reply_to_message_id` → обе части в заголовке

**Service:**
- `phone_call` `duration_seconds: 90` → тело `📞 1:30`
- `phone_call` `duration_seconds: 3665` → `📞 1:01:05`
- `phone_call` без duration, `discard_reason: "missed"` → `📞 missed`
- `phone_call` без всего → `📞`
- `pin_message` `message_id: 314963` → `📌 #314963`
- `action: "join_group_by_link"` → `null`
- `type: "service"` без `action` → `null`
- автор берётся из `actor`

**`renderSkippedSummary`:**
- одна запись → `_Service messages skipped: join_group_by_link ×3._`
- сортировка по count убыв.: `join_group_by_link ×30, boost_apply ×2`
- тай-брейкер — лексикографический
- пустой map → функция не вызывается (контракт bin-а)

### `test/filename.test.js` — новый

- обычное имя → возвращается как есть
- имя с `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` → все заменены на `_`
- control-символы (`\x00`-`\x1F`, `\x7F`) → `_`
- ведущие/хвостовые пробелы и точки → срезаны
- UTF-8 имя длиной 300 байт → обрезано ≤200 байт без слома кодпойнта
- только точки (`...`) → `""`
- пустой ввод → `""`

### `test/cli.test.js` — расширить

- `outputArg` передан → используется он без модификации
- single-chat с `name: "Damir"`, input `/tmp/x/result.json` → `/tmp/x/Damir.md`
- single-chat с `name: "a/b?c"` → `/tmp/x/a_b_c.md`
- single-chat `saved_messages` без `name` → `/tmp/x/Saved Messages.md`
- bulk export → fallback `/tmp/x/result.md`
- пустое/мусорное имя → fallback

### Обновление фикстур

Существующие `test/fixtures/sample.expected.md` и `test/fixtures/bulk.expected.md` будут перегенерированы в рамках реализации:

- `sample.json` расширить: добавить сообщение с реакциями, `phone_call`, `pin_message`, один пропускаемый service (например, `join_group_by_link`).
- `bulk.json` расширить: в одном из чатов добавить пропускаемый service, чтобы проверить summary в bulk-контексте.

## Документация

После реализации обновить `CLAUDE.md`, раздел «Правила рендеринга»:

- строку «`reactions`, `edited`, `forwarded_from` — не рендерим» исправить: `reactions` теперь рендерятся, `edited` и `forwarded_from` — по-прежнему нет.
- строку про `type: "service"` уточнить: `phone_call` и `pin_message` теперь рендерятся, остальные — пропускаются и попадают в per-chat summary.
- добавить короткое упоминание новой логики имени выходного файла.

## Риски и открытые вопросы

- **Корректность `duration_seconds: 0`.** Если такое встречается у состоявшихся звонков (маловероятно, но) — попадёт в ветку без duration и покажет `discard_reason` или просто `📞`. Приемлемо.
- **Кодпойнтная обрезка имени.** Если имя — один очень длинный кодпойнт (emoji-zwj-последовательность), обрезка может прийтись в неудачном месте. Принимаем: файл-система всё равно положит — семантики мы тут не делаем.
- **Конфликт имён в bulk+outputArg не задан.** Не проблема: для bulk мы всегда идём в fallback на имя входного файла.
