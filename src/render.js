const PHOTO = "🖼️";
const FILE = "📎";
const VOICE = "🎤";

const SERVICE_TYPE = "service";

export function renderHeader(meta) {
  const name = resolveChatName(meta);
  const parts = ["Telegram"];
  if (meta.type) parts.push(meta.type);
  if (meta.id !== undefined && meta.id !== null && meta.id !== "") {
    parts.push(`id ${meta.id}`);
  }
  return `# ${name}\n\n> ${parts.join(" · ")}.\n`;
}

function resolveChatName(meta) {
  if (meta.name) return meta.name;
  if (meta.type === "saved_messages") return "Saved Messages";
  if (meta.id !== undefined && meta.id !== null && meta.id !== "") {
    return `Chat #${meta.id}`;
  }
  return "Chat";
}

export function renderMessage(msg) {
  if (msg.type === SERVICE_TYPE) {
    const body = renderServiceBody(msg);
    if (body === null) return null;
    return `${renderMessageHeader(msg)}\n\n${body}\n`;
  }

  const header = renderMessageHeader(msg);
  const body = renderBody(msg);
  return `${header}\n\n${body}\n`;
}

function renderMessageHeader(msg) {
  const author = msg.from ?? msg.from_id ?? msg.actor ?? msg.actor_id ?? "unknown";
  const date = formatDate(msg.date);
  const parts = [`#${msg.id}`, author, date];
  if (msg.reply_to_message_id !== undefined) {
    parts.push(`↩ #${msg.reply_to_message_id}`);
  }
  const reactions = renderReactions(msg.reactions);
  if (reactions) parts.push(reactions);
  // "#id — author · date[ · ↩ #replyId][ · [reactions]]"
  return `### ${parts[0]} — ${parts.slice(1).join(" · ")}`;
}

function renderReactions(reactions) {
  if (!Array.isArray(reactions) || reactions.length === 0) return "";
  const emojiOrder = [];
  const emojiCounts = new Map();
  let customCount = 0;
  for (const r of reactions) {
    const count = typeof r.count === "number" ? r.count : 1;
    if (r.type === "emoji" && r.emoji) {
      if (!emojiCounts.has(r.emoji)) {
        emojiOrder.push(r.emoji);
        emojiCounts.set(r.emoji, 0);
      }
      emojiCounts.set(r.emoji, emojiCounts.get(r.emoji) + count);
    } else {
      customCount += count;
    }
  }
  const groups = emojiOrder.map((e) => formatReactionGroup(e, emojiCounts.get(e)));
  if (customCount > 0) groups.push(formatReactionGroup("🧩", customCount));
  return groups.length ? `[${groups.join(",")}]` : "";
}

function formatReactionGroup(char, count) {
  return count === 1 ? char : `${char}×${count}`;
}

function renderBody(msg) {
  // Sticker: body is the emoji itself, no media prefix.
  if (msg.sticker_emoji) return msg.sticker_emoji;

  const prefix = mediaPrefix(msg);
  const text = renderEntities(msg.text_entities ?? []);

  if (prefix === FILE && msg.file_name) {
    const head = `${FILE} [${msg.file_name}]`;
    return text ? `${head}\n${text}` : head;
  }

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
      // Unknown entity type — fall back to raw text to avoid losing content.
      return e.text ?? "";
  }
}

function formatBlockquote(text) {
  // Every line of the quote gets a leading "> ".
  // Empty lines inside the block also get "> " — standard Markdown behavior.
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function renderServiceBody(msg) {
  if (msg.action === "pin_message") {
    return `📌 #${msg.message_id}`;
  }
  if (msg.action === "phone_call") {
    if (typeof msg.duration_seconds === "number" && msg.duration_seconds > 0) {
      return `📞 ${formatCallDuration(msg.duration_seconds)}`;
    }
    if (msg.discard_reason) {
      return `📞 ${msg.discard_reason}`;
    }
    return `📞`;
  }
  return null;
}

function formatCallDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso) {
  // Pass the exporter's local ISO timestamp through unchanged (e.g.
  // "2026-01-01T10:00:00"). ISO 8601 is the canonical format LLMs expect;
  // reformatting it loses seconds (which disambiguate same-minute messages)
  // without improving anything for downstream consumption.
  return iso ?? "";
}
