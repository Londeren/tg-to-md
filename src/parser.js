import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { pick } = require("stream-json/filters/Pick.js");
const { streamArray } = require("stream-json/streamers/StreamArray.js");

/**
 * Stream-friendly reader for a Telegram JSON export.
 *
 * Supports two shapes produced by Telegram Desktop:
 *   - single-chat export: top-level object has `messages`.
 *   - bulk export (Settings → Export Telegram data): top-level object has
 *     `chats.list[]`, each entry being one chat with its own `messages`.
 *
 * Returns `{ chats, isBulk, singleMeta }`:
 *   - `chats`: async iterable of `{ meta, messages }` pairs.
 *   - `isBulk`: true for bulk export (`chats.list[]`), false for single-chat.
 *   - `singleMeta`: `{ name, type, id }` for single-chat input; `null` for bulk.
 * For single-chat input the iterable yields exactly one chat.
 *
 * Memory usage stays bounded: for single-chat input the messages array is
 * consumed one element at a time; for bulk input, each chat object is
 * materialised in memory while it is being rendered (a pragmatic tradeoff
 * — bulk exports tend to have short per-chat histories, and deep-streaming
 * a nested messages array inside a streamed list entry would require a
 * noticeably more complex pipeline).
 */
export async function parseTelegramExport(inputPath) {
  const head = await readHead(inputPath);
  if (isBulkFormat(head)) {
    return {
      chats: streamBulkChats(inputPath),
      isBulk: true,
      singleMeta: null,
    };
  }
  const meta = extractSingleMeta(head);
  const messages = streamMessagesAt(inputPath, "messages");
  return {
    chats: singleChat(meta, messages),
    isBulk: false,
    singleMeta: meta,
  };
}

async function* singleChat(meta, messages) {
  yield { meta, messages };
}

async function* streamBulkChats(inputPath) {
  const pipeline = chain([
    fs.createReadStream(inputPath),
    parser(),
    pick({ filter: "chats.list" }),
    streamArray(),
  ]);
  for await (const { value } of pipeline) {
    const meta = {
      name: value.name ?? null,
      type: value.type ?? null,
      id: value.id ?? null,
    };
    yield { meta, messages: arrayAsAsyncIterable(value.messages ?? []) };
  }
}

async function* arrayAsAsyncIterable(arr) {
  for (const item of arr) yield item;
}

async function readHead(inputPath) {
  // "name", "type", "id" and the format marker ("chats" vs "messages") sit at
  // the very top of a Telegram export. Reading the first 16 KB is enough to
  // detect the format and extract single-chat meta via regexes. Folding this
  // into the streaming pipeline would complicate the architecture without a
  // practical gain.
  const fh = await fs.promises.open(inputPath, "r");
  try {
    const buf = Buffer.alloc(16 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await fh.close();
  }
}

function isBulkFormat(head) {
  return /"chats"\s*:\s*\{/.test(head);
}

function extractSingleMeta(head) {
  return {
    name: matchName(head),
    type: matchType(head),
    id: matchId(head),
  };
}

function matchName(head) {
  // Allow escaped quotes inside the name.
  const m = head.match(/"name"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!m) return null;
  return unescapeJsonString(m[1]);
}

function matchType(head) {
  const m = head.match(/"type"\s*:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function matchId(head) {
  // id can be negative (supergroups use -100... prefix).
  const m = head.match(/"id"\s*:\s*(-?\d+)/);
  return m ? m[1] : null;
}

function unescapeJsonString(s) {
  return s
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

async function* streamMessagesAt(inputPath, filterPath) {
  const pipeline = chain([
    fs.createReadStream(inputPath),
    parser(),
    pick({ filter: filterPath }),
    streamArray(),
  ]);
  for await (const { value } of pipeline) {
    yield value;
  }
}
