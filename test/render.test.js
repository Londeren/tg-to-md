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
