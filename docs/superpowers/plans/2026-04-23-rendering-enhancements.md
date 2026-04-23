# Rendering Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reactions to message headers, render `phone_call`/`pin_message` service messages, emit per-chat summary of skipped service events, clean up chat header format, derive output filename from chat name.

**Architecture:** Extend `src/render.js` with three pure helpers (reactions, service body, skipped summary) and reshape `renderHeader`. Extend `src/parser.js` result with `isBulk`/`singleMeta` flags. Extract orchestration into `src/pipeline.js` shared by `bin/` and smoke test. Put filename derivation in a dedicated pure `src/filename.js`.

**Tech Stack:** Node.js (ESM, no build), `node --test`, `stream-json`. No new runtime dependencies.

**Related spec:** [../specs/2026-04-23-rendering-enhancements-design.md](../specs/2026-04-23-rendering-enhancements-design.md)

---

## File map

**Create:**
- `src/pipeline.js` — orchestration (`renderExport`), used by bin and smoke test
- `src/filename.js` — `sanitizeFilename`, `deriveOutputPath` (pure)
- `test/filename.test.js` — unit tests for both filename functions
- `test/cli.test.js` — end-to-end tests via `child_process`

**Modify:**
- `src/render.js` — new header format, reactions, service rendering, summary helper
- `src/parser.js` — return `{ chats, isBulk, singleMeta }`
- `bin/tg-to-md.js` — use pipeline + filename helpers
- `test/render.test.js` — new assertions
- `test/smoke.test.js` — use pipeline, updated expectations
- `test/fixtures/sample.json`, `sample.expected.md` — add reactions/phone_call
- `test/fixtures/bulk.json`, `bulk.expected.md` — add a skipped service for summary
- `CLAUDE.md` — refresh rendering rules section

---

## Task 1: Rework chat header — blockquote meta line, no trailing `---`

**Files:**
- Modify: `src/render.js:7-16` (renderHeader body + resolveChatName stays)
- Modify: `test/render.test.js:1-29`
- Modify: `test/fixtures/sample.expected.md`
- Modify: `test/fixtures/bulk.expected.md`

- [ ] **Step 1: Update `test/render.test.js` with new expectations**

Replace entire file content with:

```js
import { test } from "node:test";
import assert from "node:assert/strict";

import { renderHeader } from "../src/render.js";

test("renderHeader: name + type + id → blockquote meta, no trailing ---", () => {
  const out = renderHeader({ name: "Damir", type: "personal_chat", id: 666839415 });
  assert.equal(out, "# Damir\n\n> Telegram · personal_chat · id 666839415.\n");
});

test("renderHeader: saved_messages without name → 'Saved Messages'", () => {
  const out = renderHeader({ name: null, type: "saved_messages", id: 8041249877 });
  assert.equal(out, "# Saved Messages\n\n> Telegram · saved_messages · id 8041249877.\n");
});

test("renderHeader: personal_chat without name → 'Chat #<id>'", () => {
  const out = renderHeader({ name: null, type: "personal_chat", id: 8777672644 });
  assert.equal(out, "# Chat #8777672644\n\n> Telegram · personal_chat · id 8777672644.\n");
});

test("renderHeader: only name + id (no type) → omits type", () => {
  const out = renderHeader({ name: "Old", id: 1 });
  assert.equal(out, "# Old\n\n> Telegram · id 1.\n");
});

test("renderHeader: only name (no type, no id) → Telegram only", () => {
  const out = renderHeader({ name: "Just Name" });
  assert.equal(out, "# Just Name\n\n> Telegram.\n");
});
```

- [ ] **Step 2: Run tests — expect red**

Run: `node --test test/render.test.js`
Expected: 5 failures (old format still emitted).

- [ ] **Step 3: Rewrite `renderHeader` in `src/render.js`**

Replace lines 7-16 with:

```js
export function renderHeader(meta) {
  const name = resolveChatName(meta);
  const parts = ["Telegram"];
  if (meta.type) parts.push(meta.type);
  if (meta.id !== undefined && meta.id !== null && meta.id !== "") {
    parts.push(`id ${meta.id}`);
  }
  return `# ${name}\n\n> ${parts.join(" · ")}.\n`;
}
```

- [ ] **Step 4: Run tests — expect green**

Run: `node --test test/render.test.js`
Expected: 5 passes.

- [ ] **Step 5: Regenerate `sample.expected.md`**

Replace file content with:

```
# Test Chat

> Telegram · private_supergroup · id 999.

### #1 — Alice · 2026-01-01T10:00:00

Hello!

### #3 — Bob · 2026-01-01T10:02:00 · ↩ #1

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

📎 Документ

### #9 — Bob · 2026-01-01T10:08:00

🎤

### #10 — Carol · 2026-01-01T10:09:00

🔥

### #11 — Alice · 2026-01-01T10:10:00

Реакция  на тесте.

### #12 — Dave · 2026-01-01T10:11:00

📎 Клип
```

- [ ] **Step 6: Regenerate `bulk.expected.md`**

Replace file content with:

```
# Saved Messages

> Telegram · saved_messages · id 8041249877.

### #1 — Self · 2026-01-01T09:00:00

Note to self

---

# Alice

> Telegram · personal_chat · id 123.

### #10 — Alice · 2026-01-02T10:00:00

Hi

---

# Chat #8777672644

> Telegram · personal_chat · id 8777672644.

### #20 — Unknown · 2026-01-03T11:00:00

hey
```

- [ ] **Step 7: Run all tests**

Run: `node --test`
Expected: all pass (render + smoke).

- [ ] **Step 8: Commit**

```bash
git add src/render.js test/render.test.js test/fixtures/sample.expected.md test/fixtures/bulk.expected.md
git commit -m "render: blockquote chat-header meta line, drop trailing ---"
```

---

## Task 2: Render `phone_call` and `pin_message` service messages

**Files:**
- Modify: `src/render.js` (renderMessage dispatch, renderMessageHeader author fallback, add formatCallDuration + renderServiceBody)
- Modify: `test/render.test.js` (append service tests)
- Modify: `test/fixtures/sample.json` (add phone_call #13)
- Modify: `test/fixtures/sample.expected.md` (pin_message #2 now rendered, phone_call #13 rendered)
- Modify: `test/fixtures/bulk.expected.md` (pin_message #11 now rendered)

- [ ] **Step 1: Append tests to `test/render.test.js`**

Append to the file:

```js
import { renderMessage } from "../src/render.js";

test("renderMessage: pin_message renders 📌 with referenced id", () => {
  const out = renderMessage({
    id: 2,
    type: "service",
    date: "2026-01-01T10:01:00",
    actor: "Alice",
    actor_id: "user1",
    action: "pin_message",
    message_id: 1,
  });
  assert.equal(out, "### #2 — Alice · 2026-01-01T10:01:00\n\n📌 #1\n");
});

test("renderMessage: phone_call with duration_seconds=90 → 📞 1:30", () => {
  const out = renderMessage({
    id: 13,
    type: "service",
    date: "2026-01-01T10:12:00",
    actor: "Alice",
    actor_id: "user1",
    action: "phone_call",
    duration_seconds: 90,
  });
  assert.equal(out, "### #13 — Alice · 2026-01-01T10:12:00\n\n📞 1:30\n");
});

test("renderMessage: phone_call with duration_seconds=3665 → 📞 1:01:05", () => {
  const out = renderMessage({
    id: 14,
    type: "service",
    date: "2026-01-01T10:13:00",
    actor: "Bob",
    action: "phone_call",
    duration_seconds: 3665,
  });
  assert.equal(out, "### #14 — Bob · 2026-01-01T10:13:00\n\n📞 1:01:05\n");
});

test("renderMessage: phone_call without duration, discard_reason=missed → 📞 missed", () => {
  const out = renderMessage({
    id: 15,
    type: "service",
    date: "2026-01-01T10:14:00",
    actor: "Carol",
    action: "phone_call",
    discard_reason: "missed",
  });
  assert.equal(out, "### #15 — Carol · 2026-01-01T10:14:00\n\n📞 missed\n");
});

test("renderMessage: phone_call with no duration and no reason → 📞 alone", () => {
  const out = renderMessage({
    id: 16,
    type: "service",
    date: "2026-01-01T10:15:00",
    actor: "Dave",
    action: "phone_call",
  });
  assert.equal(out, "### #16 — Dave · 2026-01-01T10:15:00\n\n📞\n");
});

test("renderMessage: other service actions return null (skipped)", () => {
  const out = renderMessage({
    id: 17,
    type: "service",
    action: "join_group_by_link",
    actor: "Eve",
    date: "2026-01-01T10:16:00",
  });
  assert.equal(out, null);
});

test("renderMessage: service without action → null", () => {
  const out = renderMessage({ id: 18, type: "service", date: "2026-01-01T10:17:00" });
  assert.equal(out, null);
});
```

- [ ] **Step 2: Run tests — expect red**

Run: `node --test test/render.test.js`
Expected: 7 new failures (service messages currently return null; pin_message test expects a string).

- [ ] **Step 3: Update `src/render.js`**

Replace the `renderMessage` function and add helpers. Current lines 27-44 become:

```js
export function renderMessage(msg) {
  if (msg.type === SERVICE_TYPE) {
    const body = renderServiceBody(msg);
    if (body === null) return null;
    return `${renderMessageHeader(msg)}\n\n${body}\n`;
  }

  const header = renderMessageHeader(msg);
  const body = renderBody(msg);
  return `${header}\n\n${body}\n`;
}

function renderMessageHeader(msg) {
  const author = msg.from ?? msg.from_id ?? msg.actor ?? msg.actor_id ?? "unknown";
  const date = formatDate(msg.date);
  const parts = [`#${msg.id}`, author, date];
  if (msg.reply_to_message_id !== undefined) {
    parts.push(`↩ #${msg.reply_to_message_id}`);
  }
  return `### ${parts[0]} — ${parts.slice(1).join(" · ")}`;
}

function renderServiceBody(msg) {
  if (msg.action === "pin_message") {
    return `📌 #${msg.message_id}`;
  }
  if (msg.action === "phone_call") {
    if (typeof msg.duration_seconds === "number" && msg.duration_seconds > 0) {
      return `📞 ${formatCallDuration(msg.duration_seconds)}`;
    }
    if (msg.discard_reason) {
      return `📞 ${msg.discard_reason}`;
    }
    return `📞`;
  }
  return null;
}

function formatCallDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run tests — expect green**

Run: `node --test test/render.test.js`
Expected: all pass.

- [ ] **Step 5: Add phone_call fixture to `test/fixtures/sample.json`**

Append to the `messages` array (before the closing `]`), adding a comma after the existing last message (#12):

```json
    ,
    {
      "id": 13,
      "type": "service",
      "date": "2026-01-01T10:12:00",
      "date_unixtime": "1767262320",
      "actor": "Alice",
      "actor_id": "user1",
      "action": "phone_call",
      "duration_seconds": 125,
      "text": "",
      "text_entities": []
    }
```

- [ ] **Step 6: Update `test/fixtures/sample.expected.md`**

Insert after line 9 (`Hello!`), before `### #3 — Bob`:

```

### #2 — Alice · 2026-01-01T10:01:00

📌 #1
```

Append to the end of file (after `📎 Клип`):

```

### #13 — Alice · 2026-01-01T10:12:00

📞 2:05
```

- [ ] **Step 7: Update `test/fixtures/bulk.expected.md`**

Insert after line 21 (`Hi`), before the `---` separator starting the next chat:

```

### #11 — Alice · 2026-01-02T10:01:00

📌 #10
```

- [ ] **Step 8: Run all tests**

Run: `node --test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/render.js test/render.test.js test/fixtures/sample.json test/fixtures/sample.expected.md test/fixtures/bulk.expected.md
git commit -m "render: emit phone_call and pin_message service messages"
```

---

## Task 3: Reactions in message header

**Files:**
- Modify: `src/render.js` (add renderReactions, integrate into renderMessageHeader)
- Modify: `test/render.test.js` (append reactions tests)
- Modify: `test/fixtures/sample.json` (add reactions to existing message)
- Modify: `test/fixtures/sample.expected.md`

- [ ] **Step 1: Append reactions tests to `test/render.test.js`**

```js
test("renderMessage: no reactions → no [] block", () => {
  const out = renderMessage({
    id: 1, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice", text_entities: [{ type: "plain", text: "hi" }],
  });
  assert.equal(out, "### #1 — Alice · 2026-01-01T10:00:00\n\nhi\n");
});

test("renderMessage: single emoji count=1 → [❤]", () => {
  const out = renderMessage({
    id: 1, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice", text_entities: [{ type: "plain", text: "hi" }],
    reactions: [{ type: "emoji", count: 1, emoji: "❤" }],
  });
  assert.equal(out, "### #1 — Alice · 2026-01-01T10:00:00 · [❤]\n\nhi\n");
});

test("renderMessage: single emoji count=3 → [❤×3]", () => {
  const out = renderMessage({
    id: 1, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice", text_entities: [{ type: "plain", text: "hi" }],
    reactions: [{ type: "emoji", count: 3, emoji: "❤" }],
  });
  assert.match(out, /\[❤×3\]/);
});

test("renderMessage: two distinct emoji reactions → [❤,🔥]", () => {
  const out = renderMessage({
    id: 1, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice", text_entities: [{ type: "plain", text: "hi" }],
    reactions: [
      { type: "emoji", count: 1, emoji: "❤" },
      { type: "emoji", count: 1, emoji: "🔥" },
    ],
  });
  assert.match(out, /\[❤,🔥\]/);
});

test("renderMessage: two reaction entries with same emoji → merged [❤×2]", () => {
  const out = renderMessage({
    id: 1, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice", text_entities: [{ type: "plain", text: "hi" }],
    reactions: [
      { type: "emoji", count: 1, emoji: "❤" },
      { type: "emoji", count: 1, emoji: "❤" },
    ],
  });
  assert.match(out, /\[❤×2\]/);
});

test("renderMessage: only custom_emoji count=2 → [🧩×2]", () => {
  const out = renderMessage({
    id: 1, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice", text_entities: [{ type: "plain", text: "hi" }],
    reactions: [{ type: "custom_emoji", count: 2, document_id: "abc" }],
  });
  assert.match(out, /\[🧩×2\]/);
});

test("renderMessage: mix emoji + two different custom_emoji → [😢,🧩×2]", () => {
  const out = renderMessage({
    id: 319524, type: "message", date: "2025-12-10T20:46:30",
    from: "Sergey", text_entities: [{ type: "plain", text: "x" }],
    reactions: [
      { type: "emoji", count: 1, emoji: "😢" },
      { type: "custom_emoji", count: 1, document_id: "a" },
      { type: "custom_emoji", count: 1, document_id: "b" },
    ],
  });
  assert.match(out, /\[😢,🧩×2\]/);
});

test("renderMessage: reactions together with reply_to_message_id", () => {
  const out = renderMessage({
    id: 3, type: "message", date: "2026-01-01T10:02:00",
    from: "Bob", reply_to_message_id: 1,
    text_entities: [{ type: "plain", text: "Hi Alice!" }],
    reactions: [{ type: "emoji", count: 1, emoji: "❤" }],
  });
  assert.match(out, /### #3 — Bob · 2026-01-01T10:02:00 · ↩ #1 · \[❤\]/);
});
```

- [ ] **Step 2: Run tests — expect red**

Run: `node --test test/render.test.js`
Expected: 7+ failures (no reactions rendering yet).

- [ ] **Step 3: Add `renderReactions` + integrate in `src/render.js`**

In `renderMessageHeader`, after the `if (msg.reply_to_message_id !== undefined)` block and before the return, add:

```js
  const reactions = renderReactions(msg.reactions);
  if (reactions) parts.push(reactions);
```

Add the helper function at module scope:

```js
function renderReactions(reactions) {
  if (!Array.isArray(reactions) || reactions.length === 0) return "";
  const emojiOrder = [];
  const emojiCounts = new Map();
  let customCount = 0;
  for (const r of reactions) {
    const count = typeof r.count === "number" ? r.count : 1;
    if (r.type === "emoji" && r.emoji) {
      if (!emojiCounts.has(r.emoji)) {
        emojiOrder.push(r.emoji);
        emojiCounts.set(r.emoji, 0);
      }
      emojiCounts.set(r.emoji, emojiCounts.get(r.emoji) + count);
    } else {
      customCount += count;
    }
  }
  const groups = emojiOrder.map((e) => formatReactionGroup(e, emojiCounts.get(e)));
  if (customCount > 0) groups.push(formatReactionGroup("🧩", customCount));
  return groups.length ? `[${groups.join(",")}]` : "";
}

function formatReactionGroup(char, count) {
  return count === 1 ? char : `${char}×${count}`;
}
```

- [ ] **Step 4: Run tests — expect green**

Run: `node --test test/render.test.js`
Expected: all pass.

- [ ] **Step 5: Add reactions to a fixture message**

Edit `test/fixtures/sample.json` message with `id: 3` (the Bob reply to Alice). Add a `reactions` field:

```json
    {
      "id": 3,
      "type": "message",
      "date": "2026-01-01T10:02:00",
      "date_unixtime": "1767261720",
      "from": "Bob",
      "from_id": "user2",
      "reply_to_message_id": 1,
      "text": "Hi Alice!",
      "text_entities": [{"type": "plain", "text": "Hi Alice!"}],
      "reactions": [
        {"type": "emoji", "count": 1, "emoji": "❤"},
        {"type": "custom_emoji", "count": 2, "document_id": "stickers/x.webp"}
      ]
    },
```

- [ ] **Step 6: Update `test/fixtures/sample.expected.md`**

Change the line `### #3 — Bob · 2026-01-01T10:02:00 · ↩ #1` to:

```
### #3 — Bob · 2026-01-01T10:02:00 · ↩ #1 · [❤,🧩×2]
```

- [ ] **Step 7: Run all tests**

Run: `node --test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/render.js test/render.test.js test/fixtures/sample.json test/fixtures/sample.expected.md
git commit -m "render: reactions in message header ([emoji,🧩×N])"
```

---

## Task 4: `renderSkippedSummary` helper (pure function)

**Files:**
- Modify: `src/render.js` (export new helper)
- Modify: `test/render.test.js` (append summary tests)

- [ ] **Step 1: Append tests to `test/render.test.js`**

```js
import { renderSkippedSummary } from "../src/render.js";

test("renderSkippedSummary: single entry", () => {
  const m = new Map([["join_group_by_link", 3]]);
  assert.equal(renderSkippedSummary(m), "_Service messages skipped: join_group_by_link ×3._");
});

test("renderSkippedSummary: entries sorted by count desc", () => {
  const m = new Map([["boost_apply", 2], ["join_group_by_link", 30]]);
  assert.equal(
    renderSkippedSummary(m),
    "_Service messages skipped: join_group_by_link ×30, boost_apply ×2._",
  );
});

test("renderSkippedSummary: ties broken alphabetically", () => {
  const m = new Map([["b_action", 5], ["a_action", 5]]);
  assert.equal(
    renderSkippedSummary(m),
    "_Service messages skipped: a_action ×5, b_action ×5._",
  );
});
```

- [ ] **Step 2: Run tests — expect red**

Run: `node --test test/render.test.js`
Expected: 3 new failures (import fails — `renderSkippedSummary` not exported).

- [ ] **Step 3: Add `renderSkippedSummary` to `src/render.js`**

Add at module scope, exported:

```js
export function renderSkippedSummary(counts) {
  const entries = [...counts.entries()].sort(([a, ac], [b, bc]) => {
    if (bc !== ac) return bc - ac;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const body = entries.map(([action, count]) => `${action} ×${count}`).join(", ");
  return `_Service messages skipped: ${body}._`;
}
```

- [ ] **Step 4: Run tests — expect green**

Run: `node --test test/render.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/render.js test/render.test.js
git commit -m "render: renderSkippedSummary helper for per-chat service tally"
```

---

## Task 5: Parser returns `{ chats, isBulk, singleMeta }`

**Files:**
- Modify: `src/parser.js`
- Modify: `test/smoke.test.js` (destructuring still compatible — no change needed unless required)

- [ ] **Step 1: Update `src/parser.js` return shape**

Replace the `parseTelegramExport` function (lines 28-36) with:

```js
export async function parseTelegramExport(inputPath) {
  const head = await readHead(inputPath);
  if (isBulkFormat(head)) {
    return {
      chats: streamBulkChats(inputPath),
      isBulk: true,
      singleMeta: null,
    };
  }
  const meta = extractSingleMeta(head);
  const messages = streamMessagesAt(inputPath, "messages");
  return {
    chats: singleChat(meta, messages),
    isBulk: false,
    singleMeta: meta,
  };
}
```

- [ ] **Step 2: Run all tests**

Run: `node --test`
Expected: all pass (smoke destructures `{ chats }`, ignores new fields).

- [ ] **Step 3: Commit**

```bash
git add src/parser.js
git commit -m "parser: expose isBulk and singleMeta in result"
```

---

## Task 6: Pipeline module + wire skipped-summary into output

**Files:**
- Create: `src/pipeline.js`
- Modify: `bin/tg-to-md.js`
- Modify: `test/smoke.test.js`
- Modify: `test/fixtures/bulk.json` (add a skipped service)
- Modify: `test/fixtures/bulk.expected.md`

- [ ] **Step 1: Create `src/pipeline.js`**

```js
import { renderHeader, renderMessage, renderSkippedSummary } from "./render.js";

/**
 * Drive one export through the render pipeline.
 *
 * @param {{ chats: AsyncIterable<{ meta, messages }> }} parseResult
 * @param {(chunk: string) => void | Promise<void>} write
 * @returns {Promise<{
 *   chatCount: number,
 *   rendered: number,
 *   skippedTotal: number,
 *   firstMeta: object | null,
 * }>}
 */
export async function renderExport(parseResult, write) {
  const stats = { chatCount: 0, rendered: 0, skippedTotal: 0, firstMeta: null };
  let isFirstChat = true;
  for await (const { meta, messages } of parseResult.chats) {
    stats.chatCount++;
    if (stats.firstMeta === null) stats.firstMeta = meta;
    if (!isFirstChat) await write("\n---\n\n");
    isFirstChat = false;
    await write(renderHeader(meta));

    const skipped = new Map();
    for await (const msg of messages) {
      const block = renderMessage(msg);
      if (block === null) {
        if (msg.type === "service") {
          const key = msg.action ?? "unknown";
          skipped.set(key, (skipped.get(key) ?? 0) + 1);
          stats.skippedTotal++;
        }
        continue;
      }
      await write("\n" + block);
      stats.rendered++;
    }

    if (skipped.size > 0) {
      await write("\n---\n\n" + renderSkippedSummary(skipped) + "\n");
    }
  }
  return stats;
}
```

- [ ] **Step 2: Refactor `bin/tg-to-md.js` to use the pipeline**

Replace the body of `main(argv)` (lines 10-58) with:

```js
async function main(argv) {
  const [inputArg, outputArg] = argv.slice(2);
  if (!inputArg) {
    process.stderr.write("Usage: tg-to-md <input.json> [output.md]\n");
    process.exit(1);
  }
  const outputPath = outputArg ?? deriveOutputPath(inputArg);

  const out = fs.createWriteStream(outputPath);
  out.on("error", () => {});

  const started = Date.now();
  const parseResult = await parseTelegramExport(inputArg);
  const stats = await renderExport(parseResult, (chunk) => write(out, chunk));
  out.end();
  await finished(out);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const label = stats.chatCount > 1
    ? `bulk export (${stats.chatCount} chats)`
    : stats.firstMeta?.name
      ? `"${stats.firstMeta.name}"`
      : "chat";
  process.stderr.write(
    `tg-to-md: ${label} → ${outputPath} (${stats.rendered} messages, ${stats.skippedTotal} service skipped, ${elapsed}s)\n`,
  );
}
```

Update the import section at top to add:

```js
import { renderExport } from "../src/pipeline.js";
```

Remove the unused imports `renderHeader, renderMessage` from `../src/render.js` (pipeline now owns them).

- [ ] **Step 3: Refactor `test/smoke.test.js` to use the pipeline**

Replace the whole file with:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseTelegramExport } from "../src/parser.js";
import { renderExport } from "../src/pipeline.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function renderAll(inputPath) {
  const parseResult = await parseTelegramExport(inputPath);
  let out = "";
  await renderExport(parseResult, (chunk) => { out += chunk; });
  return out;
}

test("smoke: sample.json (single-chat format) renders to sample.expected.md", async () => {
  const actual = await renderAll(join(__dirname, "fixtures", "sample.json"));
  const expected = await readFile(join(__dirname, "fixtures", "sample.expected.md"), "utf8");
  assert.equal(actual, expected);
});

test("smoke: bulk.json (multi-chat format) renders to bulk.expected.md", async () => {
  const actual = await renderAll(join(__dirname, "fixtures", "bulk.json"));
  const expected = await readFile(join(__dirname, "fixtures", "bulk.expected.md"), "utf8");
  assert.equal(actual, expected);
});
```

- [ ] **Step 4: Run all tests — expect green**

Run: `node --test`
Expected: all pass. The pipeline is a no-op refactor at this point (no skipped service in fixtures yet).

- [ ] **Step 5: Add a skipped service to `test/fixtures/bulk.json`**

In the Alice chat (`id: 123`), append a service message inside `messages`. The array currently ends with the `pin_message` (id 11). Add a comma after it and then:

```json
     ,
     {
      "id": 12,
      "type": "service",
      "date": "2026-01-02T10:02:00",
      "date_unixtime": "1767344520",
      "actor": "Alice",
      "actor_id": "user123",
      "action": "join_group_by_link",
      "text": "",
      "text_entities": []
     }
```

- [ ] **Step 6: Update `test/fixtures/bulk.expected.md`**

After the `📌 #10` block in the Alice section, before the `---` that starts the next chat, insert:

```

---

_Service messages skipped: join_group_by_link ×1._
```

So the Alice chat section ends with:

```
### #10 — Alice · 2026-01-02T10:00:00

Hi

### #11 — Alice · 2026-01-02T10:01:00

📌 #10

---

_Service messages skipped: join_group_by_link ×1._

---

# Chat #8777672644
```

- [ ] **Step 7: Run all tests**

Run: `node --test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/pipeline.js bin/tg-to-md.js test/smoke.test.js test/fixtures/bulk.json test/fixtures/bulk.expected.md
git commit -m "pipeline: extract render orchestration, emit skipped-service summary"
```

---

## Task 7: `sanitizeFilename` pure helper

**Files:**
- Create: `src/filename.js`
- Create: `test/filename.test.js`

- [ ] **Step 1: Write `test/filename.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizeFilename } from "../src/filename.js";

test("sanitizeFilename: plain name returned as is", () => {
  assert.equal(sanitizeFilename("Damir"), "Damir");
});

test("sanitizeFilename: cyrillic name returned as is", () => {
  assert.equal(sanitizeFilename("Майя"), "Майя");
});

test("sanitizeFilename: forbidden chars replaced with _", () => {
  assert.equal(sanitizeFilename("a/b\\c:d*e?f\"g<h>i|j"), "a_b_c_d_e_f_g_h_i_j");
});

test("sanitizeFilename: control chars replaced with _", () => {
  assert.equal(sanitizeFilename("a\x00b\x1Fc\x7Fd"), "a_b_c_d");
});

test("sanitizeFilename: leading/trailing whitespace and dots trimmed", () => {
  assert.equal(sanitizeFilename("  ..  name  ..  "), "name");
});

test("sanitizeFilename: all dots → empty string", () => {
  assert.equal(sanitizeFilename("...."), "");
});

test("sanitizeFilename: empty input → empty string", () => {
  assert.equal(sanitizeFilename(""), "");
});

test("sanitizeFilename: UTF-8 name >200 bytes truncated on codepoint boundary", () => {
  const long = "я".repeat(150); // each 'я' = 2 bytes utf8 → 300 bytes
  const out = sanitizeFilename(long);
  assert.ok(Buffer.byteLength(out, "utf8") <= 200, `expected ≤200 bytes, got ${Buffer.byteLength(out, "utf8")}`);
  // Codepoint boundary: re-decoding should round-trip (no replacement chars).
  assert.ok(!out.includes("�"));
});

test("sanitizeFilename: ascii name >200 bytes truncated", () => {
  const long = "a".repeat(300);
  assert.equal(sanitizeFilename(long), "a".repeat(200));
});
```

- [ ] **Step 2: Run tests — expect red**

Run: `node --test test/filename.test.js`
Expected: failures (module doesn't exist).

- [ ] **Step 3: Implement `src/filename.js`**

```js
const FORBIDDEN = /[\/\\:*?"<>|\x00-\x1F\x7F]/g;

export function sanitizeFilename(name) {
  if (typeof name !== "string" || name.length === 0) return "";
  let s = name.replace(FORBIDDEN, "_");
  s = s.replace(/^[\s.]+|[\s.]+$/g, "");
  if (Buffer.byteLength(s, "utf8") > 200) s = truncateBytes(s, 200);
  return s;
}

function truncateBytes(s, maxBytes) {
  let out = "";
  let bytes = 0;
  for (const ch of s) {
    const chBytes = Buffer.byteLength(ch, "utf8");
    if (bytes + chBytes > maxBytes) break;
    out += ch;
    bytes += chBytes;
  }
  return out;
}
```

- [ ] **Step 4: Run tests — expect green**

Run: `node --test test/filename.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/filename.js test/filename.test.js
git commit -m "filename: sanitizeFilename pure helper"
```

---

## Task 8: `deriveOutputPath` in `src/filename.js`

**Files:**
- Modify: `src/filename.js` (add deriveOutputPath)
- Modify: `test/filename.test.js` (append deriveOutputPath tests)

- [ ] **Step 1: Append tests to `test/filename.test.js`**

```js
import { deriveOutputPath } from "../src/filename.js";

test("deriveOutputPath: bulk export falls back to input-based name", () => {
  const out = deriveOutputPath("/tmp/x/result.json", { isBulk: true, singleMeta: null });
  assert.equal(out, "/tmp/x/result.md");
});

test("deriveOutputPath: single-chat with name uses sanitized name", () => {
  const out = deriveOutputPath("/tmp/x/result.json", {
    isBulk: false,
    singleMeta: { name: "Damir", type: "personal_chat", id: 1 },
  });
  assert.equal(out, "/tmp/x/Damir.md");
});

test("deriveOutputPath: forbidden chars in name sanitized", () => {
  const out = deriveOutputPath("/tmp/x/in.json", {
    isBulk: false,
    singleMeta: { name: "a/b?c", type: "personal_chat", id: 1 },
  });
  assert.equal(out, "/tmp/x/a_b_c.md");
});

test("deriveOutputPath: saved_messages without name → 'Saved Messages.md'", () => {
  const out = deriveOutputPath("/tmp/x/result.json", {
    isBulk: false,
    singleMeta: { name: null, type: "saved_messages", id: 42 },
  });
  assert.equal(out, "/tmp/x/Saved Messages.md");
});

test("deriveOutputPath: empty name after sanitization falls back", () => {
  const out = deriveOutputPath("/tmp/x/result.json", {
    isBulk: false,
    singleMeta: { name: "...", type: "personal_chat", id: 1 },
  });
  assert.equal(out, "/tmp/x/result.md");
});

test("deriveOutputPath: singleMeta null falls back", () => {
  const out = deriveOutputPath("/tmp/x/result.json", { isBulk: false, singleMeta: null });
  assert.equal(out, "/tmp/x/result.md");
});

test("deriveOutputPath: input without extension gets .md appended", () => {
  const out = deriveOutputPath("/tmp/x/backup", { isBulk: true, singleMeta: null });
  assert.equal(out, "/tmp/x/backup.md");
});
```

- [ ] **Step 2: Run tests — expect red**

Run: `node --test test/filename.test.js`
Expected: failures (deriveOutputPath not exported).

- [ ] **Step 3: Add `deriveOutputPath` to `src/filename.js`**

Add at the top of the file:

```js
import path from "node:path";
```

Add the exported function:

```js
export function deriveOutputPath(inputPath, parseResult) {
  const fallback = () => {
    const ext = path.extname(inputPath);
    const base = ext ? inputPath.slice(0, -ext.length) : inputPath;
    return `${base}.md`;
  };
  if (!parseResult || parseResult.isBulk) return fallback();
  const meta = parseResult.singleMeta;
  if (!meta) return fallback();

  const raw = meta.name || (meta.type === "saved_messages" ? "Saved Messages" : "");
  if (!raw) return fallback();
  const clean = sanitizeFilename(raw);
  if (!clean) return fallback();
  return path.join(path.dirname(inputPath), `${clean}.md`);
}
```

- [ ] **Step 4: Run tests — expect green**

Run: `node --test test/filename.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/filename.js test/filename.test.js
git commit -m "filename: deriveOutputPath picks chat name when available"
```

---

## Task 9: Wire filename derivation into CLI + end-to-end test

**Files:**
- Modify: `bin/tg-to-md.js`
- Create: `test/cli.test.js`

- [ ] **Step 1: Update `bin/tg-to-md.js` to use `deriveOutputPath`**

Replace the top import block to add filename import:

```js
import { deriveOutputPath } from "../src/filename.js";
```

Remove the old local `deriveOutputPath` function (bottom of file).

Change the outputPath resolution in `main` to pass the parse result:

```js
  const started = Date.now();
  const parseResult = await parseTelegramExport(inputArg);
  const outputPath = outputArg ?? deriveOutputPath(inputArg, parseResult);

  const out = fs.createWriteStream(outputPath);
  out.on("error", () => {});

  const stats = await renderExport(parseResult, (chunk) => write(out, chunk));
```

(Parse *before* opening the stream now, so we can use `singleMeta` to pick the filename.)

- [ ] **Step 2: Create `test/cli.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, "..", "bin", "tg-to-md.js");

async function runCLI(args, cwd) {
  return execFileP(process.execPath, [BIN, ...args], { cwd });
}

async function tempDir() {
  return mkdtemp(join(tmpdir(), "tg-to-md-test-"));
}

test("cli: uses chat name for output filename when outputArg omitted", async () => {
  const dir = await tempDir();
  try {
    const input = join(dir, "export.json");
    await writeFile(input, JSON.stringify({
      name: "Damir",
      type: "personal_chat",
      id: 666,
      messages: [
        { id: 1, type: "message", date: "2026-01-01T10:00:00", from: "A",
          text: "hi", text_entities: [{ type: "plain", text: "hi" }] },
      ],
    }));
    await runCLI([input]);
    const produced = join(dir, "Damir.md");
    const content = await readFile(produced, "utf8");
    assert.match(content, /^# Damir\n/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cli: outputArg overrides derivation", async () => {
  const dir = await tempDir();
  try {
    const input = join(dir, "export.json");
    const output = join(dir, "custom.md");
    await writeFile(input, JSON.stringify({
      name: "Damir",
      type: "personal_chat",
      id: 666,
      messages: [
        { id: 1, type: "message", date: "2026-01-01T10:00:00", from: "A",
          text: "hi", text_entities: [{ type: "plain", text: "hi" }] },
      ],
    }));
    await runCLI([input, output]);
    await stat(output); // must exist
    // The name-based path must NOT exist.
    await assert.rejects(stat(join(dir, "Damir.md")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cli: bulk export falls back to input-based name", async () => {
  const dir = await tempDir();
  try {
    const input = join(dir, "export.json");
    await writeFile(input, JSON.stringify({
      chats: {
        list: [
          {
            name: "Alice", type: "personal_chat", id: 1,
            messages: [
              { id: 1, type: "message", date: "2026-01-01T10:00:00", from: "A",
                text: "hi", text_entities: [{ type: "plain", text: "hi" }] },
            ],
          },
        ],
      },
    }));
    await runCLI([input]);
    await stat(join(dir, "export.md"));
    await assert.rejects(stat(join(dir, "Alice.md")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cli: saved_messages without name → 'Saved Messages.md'", async () => {
  const dir = await tempDir();
  try {
    const input = join(dir, "export.json");
    await writeFile(input, JSON.stringify({
      type: "saved_messages",
      id: 42,
      messages: [
        { id: 1, type: "message", date: "2026-01-01T10:00:00", from: "Self",
          text: "note", text_entities: [{ type: "plain", text: "note" }] },
      ],
    }));
    await runCLI([input]);
    await stat(join(dir, "Saved Messages.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cli: chat name with forbidden chars gets sanitized", async () => {
  const dir = await tempDir();
  try {
    const input = join(dir, "export.json");
    await writeFile(input, JSON.stringify({
      name: "a/b?c",
      type: "personal_chat",
      id: 1,
      messages: [
        { id: 1, type: "message", date: "2026-01-01T10:00:00", from: "A",
          text: "hi", text_entities: [{ type: "plain", text: "hi" }] },
      ],
    }));
    await runCLI([input]);
    await stat(join(dir, "a_b_c.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run all tests**

Run: `node --test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add bin/tg-to-md.js test/cli.test.js
git commit -m "cli: derive output filename from chat name, add end-to-end tests"
```

---

## Task 10: Update `CLAUDE.md` rendering rules

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the "Правила рендеринга — критичное" section**

Change the two bullets that are now stale:

Replace:
```
- `type: "service"` (pin, join, invite, remove, boost, migrate) — пропускаем целиком.
```
with:
```
- `type: "service"`: `phone_call` → `📞 <MM:SS | discard_reason>`, `pin_message` → `📌 #<message_id>`; все прочие (join/invite/remove/boost/migrate/…) пропускаются и попадают в per-chat строку `_Service messages skipped: <action> ×N, …_` в конце секции чата.
```

Replace:
```
- `reactions`, `edited`, `forwarded_from` — не рендерим.
```
with:
```
- `reactions` рендерятся в заголовке как `[<emoji>[×N],…,🧩×M]` (custom_emoji схлопывается в 🧩); `edited`, `forwarded_from` — не рендерим.
```

Also change the header-format bullet (currently describing the old format). Find:
```
- Формат заголовка: `### #<id> — <from> · YYYY-MM-DD HH:MM[ · ↩ #<reply_to_message_id>]`. ID всегда первый — по нему LLM резолвит reply-ссылки внутри файла.
```
and replace with:
```
- Формат заголовка сообщения: `### #<id> — <from> · <date>[ · ↩ #<reply_to_message_id>][ · [<reactions>]]`. ID всегда первый — по нему LLM резолвит reply-ссылки внутри файла.
- Формат шапки чата: `# <name>\n\n> Telegram · <type> · id <id>.\n`. Между чатами в bulk-экспорте — `\n---\n\n`.
```

Update the architecture/CLI section to mention filename derivation. Find:
```
- `bin/tg-to-md.js` — CLI-обвязка: парсинг аргументов, открытие read/write-стримов, обработка ошибок и кодов возврата.
```
and append after this bullet:
```
- Имя выходного файла: если `output.md` не указан и вход — single-chat с `meta.name`, берём `<dir>/<sanitize(name)>.md`; для `saved_messages` без имени — `Saved Messages.md`; для bulk или при пустом имени — fallback на имя входного файла.
```

Also add a bullet for the new pipeline module under Architecture. Find:
```
- `src/render.js` — чистые функции `renderHeader(meta)` и `renderMessage(msg) → string | null` (null = пропустить). Никакого IO.
```
and append:
```
- `src/pipeline.js` — оркестрация (`renderExport(parseResult, write)`), разделяемая `bin/` и smoke-тестом: эмитит inter-chat `---`, собирает per-chat `Map<action, count>` для summary, считает глобальные тоталы.
- `src/filename.js` — чистые `sanitizeFilename` и `deriveOutputPath`.
```

- [ ] **Step 2: Verify file renders cleanly**

Run: `cat CLAUDE.md | head -80` (sanity check — no mangled markdown).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for new rendering rules"
```

---

## Done criteria

- [ ] `node --test` green (all suites: render, filename, smoke, cli).
- [ ] Manual sanity: `node bin/tg-to-md.js result.json` produces `Майя.md` with reactions visible on some messages, `📞` / `📌` entries in the right places, a summary line at the end ("Service messages skipped: phone_call ×N" — no, wait, phone_call is rendered now; summary will capture only truly skipped actions like join_* / boost_*; for this particular chat, with only pin_message and phone_call, there should be no summary at all).
- [ ] All ten commits present on the branch.
