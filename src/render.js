const PHOTO = "🖼️";
const FILE = "📎";
const VOICE = "🎤";

const SERVICE_TYPE = "service";

export function renderHeader(meta) {
  const name = meta.name ?? "Chat";
  const id = meta.id ?? "";
  const idLine = id !== "" ? ` ID: ${id}.` : "";
  return `# ${name}\n\nЭкспорт Telegram-чата.${idLine}\n\n---\n`;
}

export function renderMessage(msg) {
  if (msg.type === SERVICE_TYPE) return null;

  const header = renderMessageHeader(msg);
  const body = renderBody(msg);
  return `${header}\n\n${body}`;
}

function renderMessageHeader(msg) {
  const author = msg.from ?? msg.from_id ?? "unknown";
  const date = formatDate(msg.date);
  const parts = [`#${msg.id}`, author, date];
  if (msg.reply_to_message_id !== undefined) {
    parts.push(`↩ #${msg.reply_to_message_id}`);
  }
  // "#id — author · date[ · ↩ #replyId]"
  return `### ${parts[0]} — ${parts.slice(1).join(" · ")}`;
}

function renderBody(msg) {
  // Стикер: тело — сам эмодзи, префикс не применяем.
  if (msg.sticker_emoji) return msg.sticker_emoji;

  const prefix = mediaPrefix(msg);
  const text = renderEntities(msg.text_entities ?? []);

  if (prefix && text) return `${prefix} ${text}`;
  if (prefix) return prefix;
  return text;
}

function mediaPrefix(msg) {
  if (msg.media_type === "voice_message" || msg.media_type === "video_message") {
    return VOICE;
  }
  if (msg.photo !== undefined) return PHOTO;
  if (msg.media_type === "video_file") return FILE;
  if (msg.file !== undefined) return FILE;
  return "";
}

function renderEntities(entities) {
  const out = [];
  for (const e of entities) {
    const piece = renderEntity(e);
    if (piece !== null) out.push(piece);
  }
  return out.join("");
}

function renderEntity(e) {
  switch (e.type) {
    case "custom_emoji":
      return null;
    case "text_link":
      return `[${e.text}](${e.href})`;
    case "blockquote":
      return formatBlockquote(e.text);
    case "plain":
    case "bold":
    case "italic":
    case "underline":
    case "strikethrough":
    case "spoiler":
    case "code":
    case "pre":
    case "link":
    case "mention":
    case "mention_name":
    case "hashtag":
    case "email":
    case "phone":
      return e.text ?? "";
    default:
      // Неизвестный тип — fallback на сырой текст, чтобы не терять контент.
      return e.text ?? "";
  }
}

function formatBlockquote(text) {
  // Каждая строка блока цитаты получает префикс "> ".
  // Пустые строки внутри блока тоже получают "> " — это стандартное MD-поведение.
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function formatDate(iso) {
  // Вход — "2026-01-01T10:00:00" (локальное время экспортёра, без таймзоны).
  // Выход — "2026-01-01 10:00".
  if (!iso) return "";
  const [date, time = ""] = iso.split("T");
  const hhmm = time.slice(0, 5);
  return hhmm ? `${date} ${hhmm}` : date;
}
