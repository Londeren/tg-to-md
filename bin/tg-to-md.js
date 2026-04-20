#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { finished } from "node:stream/promises";

import { parseTelegramExport } from "../src/parser.js";
import { renderHeader, renderMessage } from "../src/render.js";

async function main(argv) {
  const [inputArg, outputArg] = argv.slice(2);
  if (!inputArg) {
    process.stderr.write("Usage: tg-to-md <input.json> [output.md]\n");
    process.exit(1);
  }
  const outputPath = outputArg ?? deriveOutputPath(inputArg);

  const out = fs.createWriteStream(outputPath);
  // No-op listener, чтобы ранний 'error' (например, EACCES от open)
  // не превратился в uncaughtException до вызова finished(out) ниже.
  out.on("error", () => {});

  const { meta, messages } = await parseTelegramExport(inputArg);
  await write(out, renderHeader(meta));
  for await (const msg of messages) {
    const rendered = renderMessage(msg);
    if (rendered === null) continue;
    await write(out, "\n" + rendered);
  }
  out.end();
  await finished(out);
}

function deriveOutputPath(inputPath) {
  const ext = path.extname(inputPath);
  const base = ext ? inputPath.slice(0, -ext.length) : inputPath;
  return `${base}.md`;
}

async function write(stream, chunk) {
  if (!stream.write(chunk)) {
    await once(stream, "drain");
  }
}

main(process.argv).catch((err) => {
  process.stderr.write(`tg-to-md: ${err.message}\n`);
  process.exit(1);
});
