import { test } from "node:test";
import assert from "node:assert/strict";

import { renderHeader, renderMessage, renderSkippedSummary } from "../src/render.js";

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

test("renderMessage: file with file_name and text → 📎 [name] on its own line, text below", () => {
  const out = renderMessage({
    id: 1, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice",
    file: "files/doc.pdf",
    file_name: "doc.pdf",
    text_entities: [{ type: "plain", text: "Документ" }],
  });
  assert.equal(out, "### #1 — Alice · 2026-01-01T10:00:00\n\n📎 [doc.pdf]\nДокумент\n");
});

test("renderMessage: file with file_name and no text → 📎 [name] alone", () => {
  const out = renderMessage({
    id: 1, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice",
    file: "files/doc.pdf",
    file_name: "doc.pdf",
    text_entities: [],
  });
  assert.equal(out, "### #1 — Alice · 2026-01-01T10:00:00\n\n📎 [doc.pdf]\n");
});

test("renderMessage: file without file_name → 📎 text on same line (unchanged)", () => {
  const out = renderMessage({
    id: 1, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice",
    file: "video/clip.mp4",
    media_type: "video_file",
    text_entities: [{ type: "plain", text: "Клип" }],
  });
  assert.equal(out, "### #1 — Alice · 2026-01-01T10:00:00\n\n📎 Клип\n");
});

test("renderMessage: voice message ignores file_name (🎤 prefix only)", () => {
  const out = renderMessage({
    id: 1, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice",
    file: "voice/voice_1.ogg",
    file_name: "voice_1.ogg",
    media_type: "voice_message",
    text_entities: [],
  });
  assert.equal(out, "### #1 — Alice · 2026-01-01T10:00:00\n\n🎤\n");
});

test("renderMessage: photo ignores file_name (🖼️ prefix only)", () => {
  const out = renderMessage({
    id: 1, type: "message", date: "2026-01-01T10:00:00",
    from: "Alice",
    photo: "photos/x.jpg",
    file_name: "x.jpg",
    text_entities: [{ type: "plain", text: "фото" }],
  });
  assert.equal(out, "### #1 — Alice · 2026-01-01T10:00:00\n\n🖼️ фото\n");
});

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
