import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizeFilename, deriveOutputPath, numberOutputPath, chatKindFromType } from "../src/filename.js";

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

test("deriveOutputPath: bulk export falls back to input-based name", () => {
  const out = deriveOutputPath("/tmp/x/result.json", { isBulk: true, singleMeta: null });
  assert.equal(out, "/tmp/x/result.md");
});

test("deriveOutputPath: single-chat with name uses sanitized name with prefix", () => {
  const out = deriveOutputPath("/tmp/x/result.json", {
    isBulk: false,
    singleMeta: { name: "Damir", type: "personal_chat", id: 1 },
  });
  assert.equal(out, "/tmp/x/Telegram-chat-Damir.md");
});

test("deriveOutputPath: forbidden chars in name sanitized", () => {
  const out = deriveOutputPath("/tmp/x/in.json", {
    isBulk: false,
    singleMeta: { name: "a/b?c", type: "personal_chat", id: 1 },
  });
  assert.equal(out, "/tmp/x/Telegram-chat-a_b_c.md");
});

test("deriveOutputPath: saved_messages without name → prefixed 'Saved Messages'", () => {
  const out = deriveOutputPath("/tmp/x/result.json", {
    isBulk: false,
    singleMeta: { name: null, type: "saved_messages", id: 42 },
  });
  assert.equal(out, "/tmp/x/Telegram-chat-Saved Messages.md");
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

test("numberOutputPath: appends -1 when nothing exists", () => {
  const out = numberOutputPath("/tmp/x/Telegram-chat-Damir.md", () => false);
  assert.equal(out, "/tmp/x/Telegram-chat-Damir-1.md");
});

test("numberOutputPath: increments past existing numbered files", () => {
  const taken = new Set(["/tmp/x/c-1.md", "/tmp/x/c-2.md"]);
  const out = numberOutputPath("/tmp/x/c.md", (p) => taken.has(p));
  assert.equal(out, "/tmp/x/c-3.md");
});

test("numberOutputPath: fills the first free gap", () => {
  const taken = new Set(["/tmp/x/c-1.md", "/tmp/x/c-3.md"]);
  const out = numberOutputPath("/tmp/x/c.md", (p) => taken.has(p));
  assert.equal(out, "/tmp/x/c-2.md");
});

test("numberOutputPath: path without extension still gets -N", () => {
  const out = numberOutputPath("/tmp/x/backup", () => false);
  assert.equal(out, "/tmp/x/backup-1");
});

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
