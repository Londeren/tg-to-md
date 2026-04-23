const FORBIDDEN = /[\/\\:*?"<>|\x00-\x1F\x7F]/g;

export function sanitizeFilename(name) {
  if (typeof name !== "string" || name.length === 0) return "";
  let s = name.replace(FORBIDDEN, "_");
  s = s.replace(/^[\s.]+|[\s.]+$/g, "");
  if (Buffer.byteLength(s, "utf8") > 200) s = truncateBytes(s, 200);
  return s;
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
