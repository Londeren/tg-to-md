import path from "node:path";

const FORBIDDEN = /[\/\\:*?"<>|\x00-\x1F\x7F]/g;

export function sanitizeFilename(name) {
  if (typeof name !== "string" || name.length === 0) return "";
  let s = name.replace(FORBIDDEN, "_");
  s = s.replace(/^[\s.]+|[\s.]+$/g, "");
  if (Buffer.byteLength(s, "utf8") > 200) s = truncateBytes(s, 200);
  return s;
}

const KIND_BY_TYPE = new Map([
  ["personal_chat", "chat"],
  ["bot_chat", "bot"],
  ["saved_messages", "saved"],
  ["private_group", "group"],
  ["private_supergroup", "group"],
  ["public_supergroup", "group"],
  ["private_channel", "channel"],
  ["public_channel", "channel"],
]);

/**
 * Coarse chat kind for the derived output filename. Unknown, empty or
 * non-string `type` (old/future export formats) falls back to "chat".
 */
export function chatKindFromType(type) {
  return KIND_BY_TYPE.get(type) ?? "chat";
}

/**
 * Always append a "-N" suffix (N ≥ 1, dash-separated) to a derived output path,
 * picking the lowest N whose file does not yet exist. Keeps a re-export from
 * silently overwriting an earlier one. `exists` is injected (fs.existsSync in
 * the CLI) so this function stays pure and testable.
 */
export function numberOutputPath(desiredPath, exists) {
  const ext = path.extname(desiredPath);
  const stem = ext ? desiredPath.slice(0, -ext.length) : desiredPath;
  let n = 1;
  while (exists(`${stem}-${n}${ext}`)) n++;
  return `${stem}-${n}${ext}`;
}

export function deriveOutputPath(inputPath, parseResult) {
  const fallback = () => {
    const ext = path.extname(inputPath);
    const base = ext ? inputPath.slice(0, -ext.length) : inputPath;
    return `${base}.md`;
  };
  if (!parseResult || parseResult.isBulk) return fallback();
  const meta = parseResult.singleMeta;
  if (!meta) return fallback();

  const raw = meta.name || (meta.type === "saved_messages" ? "Saved Messages" : "");
  if (!raw) return fallback();
  const clean = sanitizeFilename(raw);
  if (!clean) return fallback();
  return path.join(path.dirname(inputPath), `Telegram-chat-${clean}.md`);
}

function truncateBytes(s, maxBytes) {
  let out = "";
  let bytes = 0;
  for (const ch of s) {
    const chBytes = Buffer.byteLength(ch, "utf8");
    if (bytes + chBytes > maxBytes) break;
    out += ch;
    bytes += chBytes;
  }
  return out;
}
