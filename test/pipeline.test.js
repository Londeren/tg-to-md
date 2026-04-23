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
