# Legend block + `forwarded_from` marker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `forwarded_from` as a `↪ <name>` segment in message headers, and emit a static `# Legend` block once at the top of every output file.

**Architecture:** Two changes in rendering layer only. `src/render.js` gains a new exported `renderLegend()` and an extra optional segment in `renderMessageHeader`. `src/pipeline.js` emits the legend followed by `\n---\n\n` before the first chat. No parser or CLI changes. Golden smoke fixtures get updated once.

**Tech Stack:** Plain ES modules (Node ≥ 18), `node --test`. No build step, no TypeScript.

**Spec:** [docs/superpowers/specs/2026-04-23-legend-and-forwarded-from-design.md](../specs/2026-04-23-legend-and-forwarded-from-design.md)

---

## File Map

- **Modify:** `src/render.js` — add `renderLegend()` and `forwarded_from` segment in `renderMessageHeader`.
- **Modify:** `src/pipeline.js` — emit legend + `\n---\n\n` before the first chat.
- **Modify:** `test/render.test.js` — tests for `renderLegend` and `forwarded_from`.
- **Modify:** `test/smoke.test.js` — no code change, but its golden fixtures need updates:
  - `test/fixtures/sample.expected.md` — prepend legend block, add a row for the new `forwarded_from` message.
  - `test/fixtures/sample.json` — add one message with `forwarded_from`.
  - `test/fixtures/bulk.expected.md` — prepend legend block.
- **Modify:** `CLAUDE.md` — update header format line, replace the `forwarded_from` entry in the rules list, add one line about the legend.

---

## Task 1: `forwarded_from` segment in message header

**Files:**
- Test: `test/render.test.js`
- Modify: `src/render.js:38-49` (`renderMessageHeader`)

Adds the `↪ <forwarded_from>` segment between `<date>` and `↩ #<reply>`. Empty / missing values do not emit a segment.

- [ ] **Step 1: Add failing tests in `test/render.test.js`**

Append these tests to the end of `test/render.test.js`:

```javascript
test("renderMessage: forwarded_from adds ↪ segment after date", () => {
  const out = renderMessage({
    id: 152, type: "message", date: "2014-07-29T12:31:20",
    from: "Sergey Lebedev",
    forwarded_from: "Саня Барабаш",
    forwarded_from_id: "user2312769",
    text_entities: [{ type: "plain", text: "так блин" }],
  });
  assert.equal(
    out,
    "### #152 — Sergey Lebedev · 2014-07-29T12:31:20 · ↪ Саня Барабаш\n\nтак блин\n",
  );
});

test("renderMessage: forwarded_from='Hidden User' rendered as-is", () => {
  const out = renderMessage({
    id: 10, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice",
    forwarded_from: "Hidden User",
    text_entities: [{ type: "plain", text: "x" }],
  });
  assert.match(out, /↪ Hidden User/);
});

test("renderMessage: forwarded_from=null → no ↪ segment", () => {
  const out = renderMessage({
    id: 11, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice",
    forwarded_from: null,
    text_entities: [{ type: "plain", text: "x" }],
  });
  assert.equal(out, "### #11 — Alice · 2026-01-01T10:00:00\n\nx\n");
});

test("renderMessage: forwarded_from='' → no ↪ segment", () => {
  const out = renderMessage({
    id: 12, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice",
    forwarded_from: "",
    text_entities: [{ type: "plain", text: "x" }],
  });
  assert.equal(out, "### #12 — Alice · 2026-01-01T10:00:00\n\nx\n");
});

test("renderMessage: forwarded_from_id without forwarded_from → no ↪ segment", () => {
  const out = renderMessage({
    id: 13, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice",
    forwarded_from_id: "user999",
    text_entities: [{ type: "plain", text: "x" }],
  });
  assert.equal(out, "### #13 — Alice · 2026-01-01T10:00:00\n\nx\n");
});

test("renderMessage: full header — forwarded_from + reply + reactions in order", () => {
  const out = renderMessage({
    id: 200, type: "message", date: "2026-01-01T10:00:00",
    from: "Bob",
    forwarded_from: "Alice",
    reply_to_message_id: 199,
    text_entities: [{ type: "plain", text: "hi" }],
    reactions: [{ type: "emoji", count: 2, emoji: "❤" }],
  });
  assert.match(
    out,
    /### #200 — Bob · 2026-01-01T10:00:00 · ↪ Alice · ↩ #199 · \[❤×2\]/,
  );
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `node --test test/render.test.js`

Expected: the 6 new tests fail (the `↪` segment is not yet emitted). Existing tests still pass.

- [ ] **Step 3: Add `forwarded_from` branch to `renderMessageHeader`**

In `src/render.js`, replace the current `renderMessageHeader` body (lines 38–49) with:

```javascript
function renderMessageHeader(msg) {
  const author = msg.from ?? msg.from_id ?? msg.actor ?? msg.actor_id ?? "unknown";
  const date = formatDate(msg.date);
  const parts = [`#${msg.id}`, author, date];
  if (typeof msg.forwarded_from === "string" && msg.forwarded_from.length > 0) {
    parts.push(`↪ ${msg.forwarded_from}`);
  }
  if (msg.reply_to_message_id !== undefined) {
    parts.push(`↩ #${msg.reply_to_message_id}`);
  }
  const reactions = renderReactions(msg.reactions);
  if (reactions) parts.push(reactions);
  // "#id — author · date[ · ↪ forwarded_from][ · ↩ #replyId][ · [reactions]]"
  return `### ${parts[0]} — ${parts.slice(1).join(" · ")}`;
}
```

The `typeof === "string" && length > 0` check uniformly rejects `null`, `undefined`, `""`, and non-strings without a second code path.

- [ ] **Step 4: Run render tests — expect all pass**

Run: `node --test test/render.test.js`

Expected: all tests pass (new ones + existing). Smoke tests will still fail at this point — that's fine, they're updated in Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/render.js test/render.test.js
git commit -m "render: emit ↪ <name> segment for forwarded_from in message header"
```

---

## Task 2: `renderLegend()` exported function

**Files:**
- Test: `test/render.test.js`
- Modify: `src/render.js` (add new export near the top, with other constants)

Exports a pure function returning the static legend block. The returned string ends with a single `\n` after the last bullet; the `---` divider is added by the pipeline.

- [ ] **Step 1: Add failing test in `test/render.test.js`**

Add this test after the existing `renderHeader` tests (keeps related tests grouped). Also update the import at the top of the file to include `renderLegend`:

At the top of `test/render.test.js`, change:

```javascript
import { renderHeader, renderMessage, renderSkippedSummary } from "../src/render.js";
```

to:

```javascript
import { renderHeader, renderLegend, renderMessage, renderSkippedSummary } from "../src/render.js";
```

Append this test after the last `renderHeader` test (around line 29):

```javascript
test("renderLegend: returns static legend block ending with a single \\n", () => {
  const expected =
    "# Legend\n" +
    "\n" +
    "- `### #<id>` — message id\n" +
    "- `↩ #<id>` — reply to message\n" +
    "- `↪ <name>` — forwarded from\n" +
    "- `[emoji×N, …]` — reactions (🧩 = custom emoji group)\n" +
    "- 🖼️ photo · 📎 file · 🎤 voice/video note · 📌 pin · 📞 call\n";
  assert.equal(renderLegend(), expected);
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `node --test test/render.test.js`

Expected: `SyntaxError` or `renderLegend is not a function` — the function is not exported yet.

- [ ] **Step 3: Add `renderLegend` to `src/render.js`**

In `src/render.js`, add this constant and exported function right after the existing `SERVICE_TYPE` constant (line 5), before `renderHeader`:

```javascript
const LEGEND =
  "# Legend\n" +
  "\n" +
  "- `### #<id>` — message id\n" +
  "- `↩ #<id>` — reply to message\n" +
  "- `↪ <name>` — forwarded from\n" +
  "- `[emoji×N, …]` — reactions (🧩 = custom emoji group)\n" +
  "- 🖼️ photo · 📎 file · 🎤 voice/video note · 📌 pin · 📞 call\n";

export function renderLegend() {
  return LEGEND;
}
```

- [ ] **Step 4: Run render tests — expect all pass**

Run: `node --test test/render.test.js`

Expected: all render tests pass, including the new `renderLegend` test.

- [ ] **Step 5: Commit**

```bash
git add src/render.js test/render.test.js
git commit -m "render: add renderLegend() returning static legend block"
```

---

## Task 3: Pipeline emits legend before the first chat

**Files:**
- Create: `test/pipeline.test.js`
- Modify: `src/pipeline.js`

Before the first chat, `renderExport` calls `write(renderLegend())` followed by `write("\n---\n\n")`. For empty exports (no chats), no legend is emitted.

- [ ] **Step 1: Create failing pipeline tests**

Create `test/pipeline.test.js` with this content:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";

import { renderExport } from "../src/pipeline.js";

// Minimal helper: turn plain arrays into the async-iterable parseResult shape.
function makeParseResult(chats) {
  return {
    chats: (async function* () {
      for (const c of chats) {
        yield {
          meta: c.meta,
          messages: (async function* () {
            for (const m of c.messages) yield m;
          })(),
        };
      }
    })(),
  };
}

async function renderAll(parseResult) {
  let out = "";
  const stats = await renderExport(parseResult, (chunk) => { out += chunk; });
  return { out, stats };
}

test("pipeline: single chat — output starts with legend, then ---, then chat header", async () => {
  const { out } = await renderAll(makeParseResult([
    {
      meta: { name: "X", type: "personal_chat", id: 1 },
      messages: [
        { id: 1, type: "message", date: "2026-01-01T10:00:00", from: "A",
          text_entities: [{ type: "plain", text: "hi" }] },
      ],
    },
  ]));
  assert.ok(out.startsWith("# Legend\n"), "output must begin with legend header");
  assert.match(
    out,
    /- 🖼️ photo · 📎 file · 🎤 voice\/video note · 📌 pin · 📞 call\n\n---\n\n# X\n/,
    "legend must be followed by a --- divider before the first chat",
  );
});

test("pipeline: bulk — legend once at top, --- between chats, no legend repeat", async () => {
  const { out } = await renderAll(makeParseResult([
    {
      meta: { name: "A", type: "personal_chat", id: 1 },
      messages: [
        { id: 1, type: "message", date: "2026-01-01T10:00:00", from: "X",
          text_entities: [{ type: "plain", text: "a" }] },
      ],
    },
    {
      meta: { name: "B", type: "personal_chat", id: 2 },
      messages: [
        { id: 2, type: "message", date: "2026-01-02T10:00:00", from: "Y",
          text_entities: [{ type: "plain", text: "b" }] },
      ],
    },
  ]));
  // Legend appears exactly once.
  const legendMatches = out.match(/# Legend\n/g) ?? [];
  assert.equal(legendMatches.length, 1);
  // Both chat headers are present, in order.
  const aIdx = out.indexOf("# A\n");
  const bIdx = out.indexOf("# B\n");
  assert.ok(aIdx > 0 && bIdx > aIdx, "chats must appear in order after legend");
});

test("pipeline: empty export — no legend, no divider", async () => {
  const { out, stats } = await renderAll(makeParseResult([]));
  assert.equal(out, "");
  assert.equal(stats.chatCount, 0);
});
```

- [ ] **Step 2: Run the pipeline tests — expect failure**

Run: `node --test test/pipeline.test.js`

Expected: first two tests fail (no legend emitted). The empty-export test already passes (current pipeline writes nothing for zero chats).

- [ ] **Step 3: Emit legend in `src/pipeline.js`**

In `src/pipeline.js`, update the import on line 1 to include `renderLegend`:

```javascript
import { renderHeader, renderLegend, renderMessage, renderSkippedSummary } from "./render.js";
```

Then replace the current `isFirstChat` handling block (lines 17–23) with:

```javascript
  let isFirstChat = true;
  for await (const { meta, messages } of parseResult.chats) {
    stats.chatCount++;
    if (stats.firstMeta === null) stats.firstMeta = meta;
    if (isFirstChat) {
      await write(renderLegend());
      await write("\n---\n\n");
    } else {
      await write("\n---\n\n");
    }
    isFirstChat = false;
    await write(renderHeader(meta));
```

The legend is written on the first iteration only, followed by the same `\n---\n\n` divider that separates chats. On subsequent iterations, only the divider is written. For an empty export, the loop body never runs and nothing is written — matching the empty-export test.

- [ ] **Step 4: Run pipeline tests — expect all pass**

Run: `node --test test/pipeline.test.js`

Expected: all three tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.js test/pipeline.test.js
git commit -m "pipeline: emit legend block before the first chat"
```

---

## Task 4: Update smoke fixtures for the new format

**Files:**
- Modify: `test/fixtures/sample.json`
- Modify: `test/fixtures/sample.expected.md`
- Modify: `test/fixtures/bulk.expected.md`

The smoke tests (`test/smoke.test.js`) compare full rendered output byte-for-byte against golden `.md` files. The legend block now prepends every output, and we also add one `forwarded_from` message to `sample.json` to cover the end-to-end path.

- [ ] **Step 1: Run smoke tests — expect failure**

Run: `node --test test/smoke.test.js`

Expected: both smoke tests fail — actual output now starts with `# Legend\n...` but expected files still start with `# Test Chat\n...` / `# Saved Messages\n...`.

- [ ] **Step 2: Add a forwarded message to `test/fixtures/sample.json`**

Find the last message in the `messages` array inside `test/fixtures/sample.json` and append a new message object after it. Read the file first to confirm the exact shape of neighboring entries, then add (keeping trailing comma rules valid for the existing JSON):

```json
{
  "id": 14,
  "type": "message",
  "date": "2026-01-01T12:00:00",
  "from": "Eve",
  "forwarded_from": "Саня Барабаш",
  "forwarded_from_id": "user999",
  "text_entities": [
    { "type": "plain", "text": "чо хоть вы" }
  ]
}
```

- [ ] **Step 3: Update `test/fixtures/sample.expected.md`**

Rewrite the file so it starts with the legend block followed by `---` and the existing content, and add one more rendered message at the end for the new `forwarded_from` entry. New full content:

```markdown
# Legend

- `### #<id>` — message id
- `↩ #<id>` — reply to message
- `↪ <name>` — forwarded from
- `[emoji×N, …]` — reactions (🧩 = custom emoji group)
- 🖼️ photo · 📎 file · 🎤 voice/video note · 📌 pin · 📞 call

---

# Test Chat

> Telegram · private_supergroup · id 999.

### #1 — Alice · 2026-01-01T10:00:00

Hello!

### #2 — Alice · 2026-01-01T10:01:00

📌 #1

### #3 — Bob · 2026-01-01T10:02:00 · ↩ #1 · [❤,🧩×2]

Hi Alice!

### #4 — Alice · 2026-01-01T10:03:00

Смотри [тут](https://example.com) и https://foo.bar

### #5 — Bob · 2026-01-01T10:04:00

Важно: не забудь

### #6 — Carol · 2026-01-01T10:05:00

Цитирую:
> сначала делаем
> потом проверяем

вот так.

### #7 — Alice · 2026-01-01T10:06:00

🖼️ Вот фото

### #8 — Alice · 2026-01-01T10:07:00

📎 [doc.pdf]
Документ

### #9 — Bob · 2026-01-01T10:08:00

🎤

### #10 — Carol · 2026-01-01T10:09:00

🔥

### #11 — Alice · 2026-01-01T10:10:00

Реакция  на тесте.

### #12 — Dave · 2026-01-01T10:11:00

📎 Клип

### #13 — Alice · 2026-01-01T10:12:00

📞 2:05

### #14 — Eve · 2026-01-01T12:00:00 · ↪ Саня Барабаш

чо хоть вы
```

- [ ] **Step 4: Update `test/fixtures/bulk.expected.md`**

Prepend the legend block and `---` divider. New full content:

```markdown
# Legend

- `### #<id>` — message id
- `↩ #<id>` — reply to message
- `↪ <name>` — forwarded from
- `[emoji×N, …]` — reactions (🧩 = custom emoji group)
- 🖼️ photo · 📎 file · 🎤 voice/video note · 📌 pin · 📞 call

---

# Saved Messages

> Telegram · saved_messages · id 8041249877.

### #1 — Self · 2026-01-01T09:00:00

Note to self

---

# Alice

> Telegram · personal_chat · id 123.

### #10 — Alice · 2026-01-02T10:00:00

Hi

### #11 — Alice · 2026-01-02T10:01:00

📌 #10

---

_Service messages skipped: join_group_by_link ×1._

---

# Chat #8777672644

> Telegram · personal_chat · id 8777672644.

### #20 — Unknown · 2026-01-03T11:00:00

hey
```

Preserve the trailing newline that the existing file has (the `hey` line is followed by a newline — do not remove it).

- [ ] **Step 5: Run full test suite — expect all pass**

Run: `node --test`

Expected: all tests across `cli.test.js`, `filename.test.js`, `render.test.js`, `pipeline.test.js`, `smoke.test.js` pass.

- [ ] **Step 6: Commit**

```bash
git add test/fixtures/sample.json test/fixtures/sample.expected.md test/fixtures/bulk.expected.md
git commit -m "test: update smoke fixtures for legend block and forwarded_from"
```

---

## Task 5: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

Two tiny edits in the «Правила рендеринга — критичное» section: header format line and the `forwarded_from` entry. Plus one bullet about the legend.

- [ ] **Step 1: Update the header format line**

In `CLAUDE.md`, find the line:

```
- Формат заголовка сообщения: `### #<id> — <from> · <date>[ · ↩ #<reply_to_message_id>][ · [<reactions>]]`. ID всегда первый — по нему LLM резолвит reply-ссылки внутри файла.
```

Replace it with:

```
- Формат заголовка сообщения: `### #<id> — <from> · <date>[ · ↪ <forwarded_from>][ · ↩ #<reply_to_message_id>][ · [<reactions>]]`. ID всегда первый — по нему LLM резолвит reply-ссылки внутри файла. Порядок опциональных сегментов зафиксирован: `↪` (внешний источник) → `↩` (внутренняя ссылка) → `[reactions]`.
```

- [ ] **Step 2: Update the `edited, forwarded_from` line**

Find the line:

```
- `reactions` рендерятся в заголовке как `[<emoji>[×N],…,🧩×M]` (группировка по emoji в порядке появления, `×` только если count>1). `edited`, `forwarded_from` — не рендерим.
```

Replace with:

```
- `reactions` рендерятся в заголовке как `[<emoji>[×N],…,🧩×M]` (группировка по emoji в порядке появления, `×` только если count>1). `forwarded_from` рендерится как сегмент `↪ <name>` в заголовке (Hidden User — как есть; `null`/`""`/нет поля — сегмент не эмитим; `forwarded_from_id` игнорируем). `edited` — не рендерим.
```

- [ ] **Step 3: Add a bullet about the legend**

Find the bullet that starts with:

```
- Формат шапки чата: `# <name>\n\n> Telegram · <type> · id <id>.\n`. Между чатами в bulk-экспорте — `\n---\n\n`.
```

Insert a new bullet immediately **before** it:

```
- В начало каждого выходного файла (single и bulk) эмитится статический блок `# Legend` со словарём обозначений (`###`, `↩`, `↪`, реакции, медиа-префиксы), после него — разделитель `\n---\n\n`, затем шапка первого чата. Пустой экспорт (0 чатов) — легенду не эмитим.
```

- [ ] **Step 4: Sanity check — grep confirms the new strings are in place**

Run: `grep -n "↪" /Users/londeren/work/GrowGlobal/tg-to-md/CLAUDE.md`

Expected: at least two lines match — the header format and the `forwarded_from` rule.

Run: `grep -n "# Legend" /Users/londeren/work/GrowGlobal/tg-to-md/CLAUDE.md`

Expected: one match (the new legend bullet).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document legend block and ↪ forwarded_from segment in CLAUDE.md"
```

---

## Final Verification

- [ ] **Step 1: Run full test suite once more**

Run: `node --test`

Expected: all tests pass.

- [ ] **Step 2: Smoke-check on a real export (optional)**

If `result.json` or `partita-iva.json` is present locally (gitignored), run:

```bash
node bin/tg-to-md.js result.json /tmp/smoke-out.md
head -20 /tmp/smoke-out.md
```

Expected: first 8 lines are the legend block, then `---`, then the chat header. Spot-check a few `forwarded_from` messages in the output.

- [ ] **Step 3: Confirm spec references stay consistent**

The spec lives at `docs/superpowers/specs/2026-04-23-legend-and-forwarded-from-design.md`. No edits needed — it was written for this plan and already reflects the chosen behavior.
