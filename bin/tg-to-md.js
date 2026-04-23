#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { finished } from "node:stream/promises";

import { parseTelegramExport } from "../src/parser.js";
import { renderExport } from "../src/pipeline.js";

async function main(argv) {
  const [inputArg, outputArg] = argv.slice(2);
  if (!inputArg) {
    process.stderr.write("Usage: tg-to-md <input.json> [output.md]\n");
    process.exit(1);
  }
  const outputPath = outputArg ?? deriveOutputPath(inputArg);

  const out = fs.createWriteStream(outputPath);
  // No-op listener so that an early 'error' (e.g. EACCES on open) does not
  // turn into an uncaughtException before finished(out) is called below.
  out.on("error", () => {});

  const started = Date.now();
  const parseResult = await parseTelegramExport(inputArg);
  const stats = await renderExport(parseResult, (chunk) => write(out, chunk));
  out.end();
  await finished(out);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const label = stats.chatCount > 1
    ? `bulk export (${stats.chatCount} chats)`
    : stats.firstMeta?.name
      ? `"${stats.firstMeta.name}"`
      : "chat";
  process.stderr.write(
    `tg-to-md: ${label} → ${outputPath} (${stats.rendered} messages, ${stats.skippedTotal} service skipped, ${elapsed}s)\n`,
  );
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
