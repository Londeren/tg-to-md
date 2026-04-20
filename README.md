# tg-to-md

Convert a Telegram chat JSON export into a single Markdown file optimized for LLM consumption (search, summarization, Q&A).

## Usage

```bash
npx tg-to-md <input.json> [output.md]
```

If `output.md` is omitted, the tool writes alongside the input with `.json` replaced by `.md`:

```bash
npx tg-to-md chat.json          # → chat.md
npx tg-to-md chat.json out.md   # → out.md
```

## Input

Exports produced by Telegram Desktop: **Settings → Advanced → Export Telegram data**. Pick JSON format. Works on arbitrarily large exports — the tool streams the input and keeps memory usage constant.

## Output format

One big Markdown file. Each message is rendered as:

```
### #<message_id> — <author> · YYYY-MM-DD HH:MM [· ↩ #<reply_id>]

<body>
```

Media messages get a leading emoji marker: 🖼️ for photos, 🎤 for voice/video messages, 📎 for files and videos. Stickers are rendered as the sticker emoji alone. Inline links are preserved as Markdown links; rich text formatting is stripped; `blockquote` segments become Markdown `>` blocks.

Service messages (joins, pins, invites) are skipped. Reactions, edits, and forwards are not rendered — the output targets LLM ingestion, not UI reproduction.

Full format specification: [`docs/superpowers/specs/2026-04-19-tg-to-md-design.md`](docs/superpowers/specs/2026-04-19-tg-to-md-design.md).

## Development

```bash
npm install
npm test                                      # run smoke test
node bin/tg-to-md.js input.json output.md     # run locally
```

Requires Node.js ≥ 20.
