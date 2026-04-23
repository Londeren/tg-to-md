import path from "node:path";

const FORBIDDEN = /[\/\\:*?"<>|\x00-\x1F\x7F]/g;

export function sanitizeFilename(name) {
  if (typeof name !== "string" || name.length === 0) return "";
  let s = name.replace(FORBIDDEN, "_");
  s = s.replace(/^[\s.]+|[\s.]+$/g, "");
  if (Buffer.byteLength(s, "utf8") > 200) s = truncateBytes(s, 200);
  return s;
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
  return path.join(path.dirname(inputPath), `${clean}.md`);
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
