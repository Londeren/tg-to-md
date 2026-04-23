import { test } from "node:test";
import assert from "node:assert/strict";

import { renderHeader, renderMessage } from "../src/render.js";

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
