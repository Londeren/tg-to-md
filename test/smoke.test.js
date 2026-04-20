import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseTelegramExport } from "../src/parser.js";
import { renderHeader, renderMessage } from "../src/render.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function renderAll(inputPath) {
  const { chats } = await parseTelegramExport(inputPath);
  let out = "";
  let first = true;
  for await (const { meta, messages } of chats) {
    if (!first) out += "\n---\n\n";
    first = false;
    out += renderHeader(meta);
    for await (const msg of messages) {
      const rendered = renderMessage(msg);
      if (rendered !== null) out += "\n" + rendered;
    }
  }
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
