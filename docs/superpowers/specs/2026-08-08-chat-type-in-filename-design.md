# Тип чата в имени выходного файла

Дата: 2026-08-08

## Проблема

Деривированное имя выходного файла сейчас всегда начинается с `Telegram-chat-`, независимо
от того, что экспортировано. Экспорт канала, группы или чата с ботом выглядит в файловой
системе так же, как личная переписка, — тип видно только открыв файл (он попадает в шапку
чата, `renderHeader`). При накоплении десятков экспортов в одной папке это мешает.

Telegram кладёт тип в `meta.type` на верхнем уровне single-chat экспорта; парсер уже
извлекает его в `singleMeta`, но `deriveOutputPath` его игнорирует.

## Значения `meta.type`

Telegram Desktop использует фиксированный набор:

| `meta.type` | что это |
|---|---|
| `personal_chat` | личная переписка |
| `bot_chat` | чат с ботом |
| `saved_messages` | Избранное |
| `private_group` | старая (не супер-) группа |
| `private_supergroup` | приватная супергруппа |
| `public_supergroup` | публичная супергруппа |
| `private_channel` | приватный канал |
| `public_channel` | публичный канал |

## Решение

Имя деривированного файла: `Telegram-<kind>-<sanitize(name)>.md`, где `kind` —
укрупнённая категория:

| `meta.type` | kind |
|---|---|
| `personal_chat` | `chat` |
| `bot_chat` | `bot` |
| `private_group`, `private_supergroup`, `public_supergroup` | `group` |
| `private_channel`, `public_channel` | `channel` |
| отсутствует, пустой, незнакомый | `chat` |

Признак публичности (`public_*` / `private_*`) в имя не выносим: для поиска файла он не
нужен, а имена удлиняет. Полная точность сохраняется в шапке чата внутри файла.

`saved_messages` — единственный особый случай: категория и имя дублировали бы друг друга
(`Telegram-saved-Saved Messages.md`), поэтому имя схлопывается в `Telegram-saved-messages.md`,
а `meta.name` игнорируется.

Суффикс `-N` навешивается поверх, как и сейчас (`numberOutputPath` + `fs.existsSync`), то
есть на выходе `Telegram-channel-Новости-1.md`, `Telegram-saved-messages-1.md`.

## Изменения в коде

Затрагивается только `src/filename.js`. Остальные модули не меняются: `type` уже доезжает
до CLI через `parseResult.singleMeta`.

Добавляется чистая экспортируемая функция:

```
chatKindFromType(type) → "chat" | "bot" | "group" | "channel" | "saved"
```

Незнакомое, пустое, `null`/`undefined` или не-строковое значение → `"chat"`.

`deriveOutputPath(inputPath, parseResult)` принимает решения в таком порядке:

1. `!parseResult` или `parseResult.isBulk` или нет `singleMeta` → fallback на имя входного
   файла с расширением `.md` (как сейчас; у bulk-экспорта единого типа нет).
2. `chatKindFromType(meta.type) === "saved"` → `<dir>/Telegram-saved-messages.md`,
   `meta.name` не используется.
3. Иначе `clean = sanitizeFilename(meta.name)`; если результат пустой → fallback на имя
   входного файла.
4. Иначе `<dir>/Telegram-<kind>-<clean>.md`.

Явно переданный `output.md` по-прежнему берётся как есть, без префикса и без нумерации.

## Совместимость

Для личных чатов имя не меняется (`Telegram-chat-Майя`), поэтому нумерация ранее
сделанных экспортов продолжится непрерывно. Меняются имена только для групп, каналов,
чатов с ботами и Избранного.

## Тесты

`test/filename.test.js`, через `node --test`:

- `chatKindFromType` — все восемь известных значений плюс `null`, `undefined`, `""`,
  незнакомая строка, не-строка.
- `deriveOutputPath` — по одному кейсу на kind: `personal_chat`, `bot_chat`,
  `private_supergroup`, `public_channel`.
- `saved_messages` с `name` и без `name` → оба дают `Telegram-saved-messages.md`.
- Пустое/мусорное имя (`""`, `"..."`, `"   "`, `null`) при `public_channel` → fallback на имя
  входного файла.
- Bulk-экспорт → fallback (регрессия, тест уже есть).
- Взаимодействие с `numberOutputPath` — суффикс `-N` навешивается на новое имя.

## Документация

Обновить в `CLAUDE.md` описание `bin/tg-to-md.js` и `src/filename.js`: правило имени выхода
теперь включает kind.
