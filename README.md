# tg-to-md

Convert a Telegram chat JSON export into a single Markdown file optimized for LLM consumption (search, summarization, Q&A).

## Usage

Not published to npm. Run it straight from GitHub:

```bash
npx -y github:Londeren/tg-to-md <input.json> [output.md]
```

If `output.md` is omitted, the output name is derived next to the input:

- Single-chat export with a `meta.name` → `Telegram-<kind>-<sanitized name>.md`, where `<kind>` is `chat`, `bot`, `group`, or `channel` (from Telegram's `meta.type`; unknown/empty type falls back to `chat`).
- `saved_messages` export → `Telegram-saved-messages.md` (the chat name is fixed, so `meta.name` is ignored).
- Bulk export, or a single chat with an empty/garbage name → `<input-file-stem>.md` (no prefix).
- In every derived case above, a `-N` suffix (`-1`, `-2`, …) is appended, picking the lowest number whose file doesn't already exist yet — so re-running the export never overwrites a previous `.md` file.

An explicitly passed `output.md` is always used as-is, no suffix added.

```bash
npx -y github:Londeren/tg-to-md chat.json          # → Telegram-chat-<name>-1.md
npx -y github:Londeren/tg-to-md chat.json out.md   # → out.md
```

The first run clones the repo into npx's cache and installs `stream-json`; subsequent runs are fast.

## Input

Exports produced by Telegram Desktop: **Settings → Advanced → Export Telegram data**. Pick JSON format. Works on arbitrarily large exports — the tool streams the input and keeps memory usage constant.

## Output format

One big Markdown file. It opens with a `# Legend` block explaining the notation below, then each chat's messages. Each message is rendered as:

```
### #<message_id> — <author> · <date>[ · ↪ <forwarded_from>][ · ↩ #<reply_id>][ · [<reactions>]]

<body>
```

Media messages get a leading emoji marker: 🖼️ for photos, 🎤 for voice/video messages, 📎 for files and videos. Stickers are rendered as the sticker emoji alone. Inline links are preserved as Markdown links; rich text formatting is stripped; `blockquote` segments become Markdown `>` blocks.

Reactions render in the header as `[👍×3,🧩×1]` (grouped by emoji, custom emoji collapsed into 🧩); forwards render as a `↪ <source>` segment. Edits are not marked. Most service messages (joins, invites, migrations, …) are skipped and rolled up into a per-chat `_Service messages skipped: …_` line, but pins and calls are kept: `📌 #<message_id>` and `📞 <MM:SS>`. The output targets LLM ingestion, not UI reproduction.

Full format specification: [`docs/superpowers/specs/2026-04-19-tg-to-md-design.md`](docs/superpowers/specs/2026-04-19-tg-to-md-design.md).

## Development

```bash
npm install
npm test                                      # run smoke test
node bin/tg-to-md.js input.json output.md     # run locally
```

Requires Node.js ≥ 20.
