import { test } from "node:test";
import assert from "node:assert/strict";

import { renderHeader } from "../src/render.js";

test("renderHeader: name + type + id", () => {
  const out = renderHeader({ name: "Damir", type: "personal_chat", id: 666839415 });
  assert.equal(
    out,
    "# Damir\n\nЭкспорт Telegram-чата. Type: personal_chat. ID: 666839415.\n\n---\n",
  );
});

test("renderHeader: saved_messages without name → 'Saved Messages'", () => {
  const out = renderHeader({ name: null, type: "saved_messages", id: 8041249877 });
  assert.match(out, /^# Saved Messages\n/);
  assert.match(out, /Type: saved_messages\. ID: 8041249877\./);
});

test("renderHeader: personal_chat without name → 'Chat #<id>'", () => {
  const out = renderHeader({ name: null, type: "personal_chat", id: 8777672644 });
  assert.match(out, /^# Chat #8777672644\n/);
});

test("renderHeader: only name (legacy single-chat meta without type) still works", () => {
  const out = renderHeader({ name: "Old", id: 1 });
  assert.equal(out, "# Old\n\nЭкспорт Telegram-чата. ID: 1.\n\n---\n");
});
