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
