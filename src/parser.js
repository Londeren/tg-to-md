import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { pick } = require("stream-json/filters/Pick.js");
const { streamArray } = require("stream-json/streamers/StreamArray.js");

/**
 * Stream-friendly reader for a Telegram chat JSON export.
 * Returns chat metadata (name, id) and an async iterable of messages.
 *
 * Memory usage stays constant regardless of input size: the messages
 * array is consumed one element at a time through stream-json.
 */
export async function parseTelegramExport(inputPath) {
  const meta = await readHeadMeta(inputPath);
  const messages = streamMessages(inputPath);
  return { meta, messages };
}

async function readHeadMeta(inputPath) {
  // Поля "name" и "id" в экспорте Telegram Desktop идут в самом начале JSON
  // (до массива messages). Читаем первые 16 КБ и выдёргиваем значения регексами —
  // этого достаточно, а потоковая сборка метаданных через stream-json при одновременной
  // стриминговой обработке массива messages усложнила бы архитектуру без реальной выгоды.
  const fh = await fs.promises.open(inputPath, "r");
  try {
    const buf = Buffer.alloc(16 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const head = buf.subarray(0, bytesRead).toString("utf8");
    const name = matchName(head);
    const id = matchId(head);
    return { name, id };
  } finally {
    await fh.close();
  }
}

function matchName(head) {
  // Учитываем возможные экранированные кавычки внутри имени.
  const m = head.match(/"name"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!m) return null;
  return unescapeJsonString(m[1]);
}

function matchId(head) {
  // id может быть отрицательным (для супергрупп с -100...).
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

async function* streamMessages(inputPath) {
  const pipeline = chain([
    fs.createReadStream(inputPath),
    parser(),
    pick({ filter: "messages" }),
    streamArray(),
  ]);
  for await (const { value } of pipeline) {
    yield value;
  }
}
