# Chat Type in Derived Output Filename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derived output filenames encode the chat kind: `Telegram-<kind>-<name>.md` where kind ∈ chat/bot/group/channel, plus the special case `Telegram-saved-messages.md`.

**Architecture:** All changes live in `src/filename.js` (pure functions, no IO) and its tests. A new exported `chatKindFromType(type)` maps Telegram's `meta.type` to a coarse kind; `deriveOutputPath` uses it when building the derived name. CLI, parser, render, pipeline stay untouched — `type` already reaches the CLI via `parseResult.singleMeta`.

**Tech Stack:** Node.js, ES modules, built-in `node --test`.

Spec: `docs/superpowers/specs/2026-08-08-chat-type-in-filename-design.md`

## Global Constraints

- Pure JavaScript, no build step, no TypeScript.
- ES modules only (`import`, never `require` in src/test code).
- Tests via built-in `node --test` only (no vitest/jest/mocha).
- `src/filename.js` stays pure — no IO, no `fs`.
- No new runtime dependencies.
- Commit messages in English; commit directly to `main` (no feature branches).
- Every commit ends with the trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `chatKindFromType(type)`

**Files:**
- Modify: `src/filename.js` (add function + export)
- Test: `test/filename.test.js` (append tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: `chatKindFromType(type: any) → "chat" | "bot" | "group" | "channel" | "saved"`. Exported from `src/filename.js`. Task 2 calls it inside `deriveOutputPath`.

Mapping (from the spec): `personal_chat`→`chat`, `bot_chat`→`bot`, `saved_messages`→`saved`, `private_group`/`private_supergroup`/`public_supergroup`→`group`, `private_channel`/`public_channel`→`channel`. Anything else (unknown string, empty, `null`, `undefined`, non-string) → `chat`.

- [ ] **Step 1: Write the failing tests**

Append to `test/filename.test.js`, and add `chatKindFromType` to the existing import from `../src/filename.js`:

```js
test("chatKindFromType: all known types map to coarse kinds", () => {
  assert.equal(chatKindFromType("personal_chat"), "chat");
  assert.equal(chatKindFromType("bot_chat"), "bot");
  assert.equal(chatKindFromType("saved_messages"), "saved");
  assert.equal(chatKindFromType("private_group"), "group");
  assert.equal(chatKindFromType("private_supergroup"), "group");
  assert.equal(chatKindFromType("public_supergroup"), "group");
  assert.equal(chatKindFromType("private_channel"), "channel");
  assert.equal(chatKindFromType("public_channel"), "channel");
});

test("chatKindFromType: unknown or missing type falls back to chat", () => {
  assert.equal(chatKindFromType("some_future_type"), "chat");
  assert.equal(chatKindFromType(""), "chat");
  assert.equal(chatKindFromType(null), "chat");
  assert.equal(chatKindFromType(undefined), "chat");
  assert.equal(chatKindFromType(42), "chat");
  // Prototype-pollution guard: must not fall through to Object.prototype.
  assert.equal(chatKindFromType("constructor"), "chat");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/filename.test.js`
Expected: FAIL — `chatKindFromType` is not exported (SyntaxError: The requested module does not provide an export named 'chatKindFromType').

- [ ] **Step 3: Implement**

In `src/filename.js`, below `sanitizeFilename` (use a `Map`, not an object literal — an object literal would leak `Object.prototype` members like `"constructor"`):

```js
const KIND_BY_TYPE = new Map([
  ["personal_chat", "chat"],
  ["bot_chat", "bot"],
  ["saved_messages", "saved"],
  ["private_group", "group"],
  ["private_supergroup", "group"],
  ["public_supergroup", "group"],
  ["private_channel", "channel"],
  ["public_channel", "channel"],
]);

/**
 * Coarse chat kind for the derived output filename. Unknown, empty or
 * non-string `type` (old/future export formats) falls back to "chat".
 */
export function chatKindFromType(type) {
  return KIND_BY_TYPE.get(type) ?? "chat";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/filename.test.js`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/filename.js test/filename.test.js
git commit -m "feat: add chatKindFromType mapping meta.type to filename kind

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `deriveOutputPath` uses the kind; update CLI test and docs

**Files:**
- Modify: `src/filename.js` (`deriveOutputPath`, currently lines 27–42)
- Test: `test/filename.test.js` (update 1 existing test, append new ones)
- Test: `test/cli.test.js` (update the `saved_messages` test, currently lines 92–105)
- Modify: `CLAUDE.md` (naming rule description)

**Interfaces:**
- Consumes: `chatKindFromType(type)` and `sanitizeFilename(name)` from Task 1 / existing code.
- Produces: `deriveOutputPath(inputPath, parseResult) → string` — same signature as today, new naming scheme: `Telegram-<kind>-<clean>.md`, `Telegram-saved-messages.md` for saved, input-based fallback otherwise. The CLI (`bin/tg-to-md.js`) already calls it and needs no changes.

Decision order (from the spec):
1. `!parseResult` / `isBulk` / no `singleMeta` → fallback `<input-stem>.md` (unchanged).
2. kind `"saved"` → `<dir>/Telegram-saved-messages.md`, `meta.name` ignored.
3. `clean = sanitizeFilename(meta.name)` empty → fallback.
4. Else `<dir>/Telegram-<kind>-<clean>.md`.

- [ ] **Step 1: Update the existing saved_messages test and add failing tests**

In `test/filename.test.js`, **replace** the test `"deriveOutputPath: saved_messages without name → prefixed 'Saved Messages'"` with:

```js
test("deriveOutputPath: saved_messages without name → Telegram-saved-messages.md", () => {
  const out = deriveOutputPath("/tmp/x/result.json", {
    isBulk: false,
    singleMeta: { name: null, type: "saved_messages", id: 42 },
  });
  assert.equal(out, "/tmp/x/Telegram-saved-messages.md");
});

test("deriveOutputPath: saved_messages with a name still collapses to Telegram-saved-messages.md", () => {
  const out = deriveOutputPath("/tmp/x/result.json", {
    isBulk: false,
    singleMeta: { name: "Избранное", type: "saved_messages", id: 42 },
  });
  assert.equal(out, "/tmp/x/Telegram-saved-messages.md");
});
```

Then **append**:

```js
test("deriveOutputPath: bot_chat → Telegram-bot-<name>.md", () => {
  const out = deriveOutputPath("/tmp/x/result.json", {
    isBulk: false,
    singleMeta: { name: "BotFather", type: "bot_chat", id: 1 },
  });
  assert.equal(out, "/tmp/x/Telegram-bot-BotFather.md");
});

test("deriveOutputPath: private_supergroup → Telegram-group-<name>.md", () => {
  const out = deriveOutputPath("/tmp/x/result.json", {
    isBulk: false,
    singleMeta: { name: "Партита ИВА", type: "private_supergroup", id: -100123 },
  });
  assert.equal(out, "/tmp/x/Telegram-group-Партита ИВА.md");
});

test("deriveOutputPath: public_channel → Telegram-channel-<name>.md", () => {
  const out = deriveOutputPath("/tmp/x/result.json", {
    isBulk: false,
    singleMeta: { name: "Новости", type: "public_channel", id: -100456 },
  });
  assert.equal(out, "/tmp/x/Telegram-channel-Новости.md");
});

test("deriveOutputPath: unknown type with a name → Telegram-chat-<name>.md", () => {
  const out = deriveOutputPath("/tmp/x/result.json", {
    isBulk: false,
    singleMeta: { name: "Damir", type: "weird_new_type", id: 1 },
  });
  assert.equal(out, "/tmp/x/Telegram-chat-Damir.md");
});

test("deriveOutputPath: missing type with a name → Telegram-chat-<name>.md", () => {
  const out = deriveOutputPath("/tmp/x/result.json", {
    isBulk: false,
    singleMeta: { name: "Damir", type: null, id: 1 },
  });
  assert.equal(out, "/tmp/x/Telegram-chat-Damir.md");
});

test("deriveOutputPath: empty/garbage name on a channel falls back to input-based name", () => {
  for (const name of ["", "...", "   ", null]) {
    const out = deriveOutputPath("/tmp/x/result.json", {
      isBulk: false,
      singleMeta: { name, type: "public_channel", id: -100456 },
    });
    assert.equal(out, "/tmp/x/result.md", `name=${JSON.stringify(name)}`);
  }
});
```

In `test/cli.test.js`, in the test `"cli: saved_messages without name → 'Telegram-chat-Saved Messages.md'"`, rename it to `"cli: saved_messages without name → 'Telegram-saved-messages-1.md'"` and change the assertion

```js
await stat(join(dir, "Telegram-chat-Saved Messages-1.md"));
```

to

```js
await stat(join(dir, "Telegram-saved-messages-1.md"));
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test`
Expected: FAIL — the new/updated `deriveOutputPath` tests and the updated CLI test assert the new names; everything else PASS. (The pre-existing `personal_chat` tests already pass — `Telegram-chat-` is unchanged for them.)

- [ ] **Step 3: Implement**

In `src/filename.js`, replace the body of `deriveOutputPath` with:

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

  const kind = chatKindFromType(meta.type);
  // "saved" would duplicate the name ("Telegram-saved-Saved Messages"),
  // so it collapses into a fixed filename; meta.name is ignored.
  if (kind === "saved") {
    return path.join(path.dirname(inputPath), "Telegram-saved-messages.md");
  }
  const clean = sanitizeFilename(meta.name);
  if (!clean) return fallback();
  return path.join(path.dirname(inputPath), `Telegram-${kind}-${clean}.md`);
}
```

Note: `sanitizeFilename` already returns `""` for non-string input, so `meta.name === null` needs no special handling.

- [ ] **Step 4: Run the full suite**

Run: `node --test`
Expected: PASS — all files (`filename`, `cli`, `pipeline`, `render`, `smoke`).

- [ ] **Step 5: Update CLAUDE.md**

In the `## Архитектура` section:

1. In the `bin/tg-to-md.js` bullet, replace the sentence describing the derived name — from «Имя выходного файла: если `output.md` не указан…» up to «…fallback на имя входного файла (без префикса).» — with:

> Имя выходного файла: если `output.md` не указан и вход — single-chat, берём `<dir>/Telegram-<kind>-<sanitize(name)>.md`, где kind ∈ `chat`/`bot`/`group`/`channel` выводится из `meta.type` через `chatKindFromType` (незнакомый/пустой type → `chat`); `saved_messages` схлопывается в `Telegram-saved-messages.md` (имя игнорируется); для bulk или при пустом/мусорном имени — fallback на имя входного файла (без префикса).

The following sentence about the `-N` suffix (`numberOutputPath`) stays as is.

2. Replace the `src/filename.js` bullet with:

> - `src/filename.js` — чистые `sanitizeFilename`, `chatKindFromType` (маппинг `meta.type` → kind для имени файла) и `deriveOutputPath(inputPath, parseResult)`.

- [ ] **Step 6: Commit**

```bash
git add src/filename.js test/filename.test.js test/cli.test.js CLAUDE.md
git commit -m "feat: encode chat kind (chat/bot/group/channel/saved) in derived output filename

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
