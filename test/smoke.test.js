import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseTelegramExport } from "../src/parser.js";
import { renderHeader, renderMessage } from "../src/render.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "sample.json");
const EXPECTED = join(__dirname, "fixtures", "sample.expected.md");

test("smoke: sample.json renders to sample.expected.md", async () => {
  const { meta, messages } = await parseTelegramExport(FIXTURE);
  let actual = renderHeader(meta);
  for await (const msg of messages) {
    const rendered = renderMessage(msg);
    if (rendered !== null) actual += "\n" + rendered;
  }
  actual += "\n";
  const expected = await readFile(EXPECTED, "utf8");
  assert.equal(actual, expected);
});
