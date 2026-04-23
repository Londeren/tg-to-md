import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, "..", "bin", "tg-to-md.js");

async function runCLI(args, cwd) {
  return execFileP(process.execPath, [BIN, ...args], { cwd });
}

async function tempDir() {
  return mkdtemp(join(tmpdir(), "tg-to-md-test-"));
}

test("cli: uses chat name for output filename when outputArg omitted", async () => {
  const dir = await tempDir();
  try {
    const input = join(dir, "export.json");
    await writeFile(input, JSON.stringify({
      name: "Damir",
      type: "personal_chat",
      id: 666,
      messages: [
        { id: 1, type: "message", date: "2026-01-01T10:00:00", from: "A",
          text: "hi", text_entities: [{ type: "plain", text: "hi" }] },
      ],
    }));
    await runCLI([input]);
    const produced = join(dir, "Damir.md");
    const content = await readFile(produced, "utf8");
    assert.match(content, /^# Damir\n/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cli: outputArg overrides derivation", async () => {
  const dir = await tempDir();
  try {
    const input = join(dir, "export.json");
    const output = join(dir, "custom.md");
    await writeFile(input, JSON.stringify({
      name: "Damir",
      type: "personal_chat",
      id: 666,
      messages: [
        { id: 1, type: "message", date: "2026-01-01T10:00:00", from: "A",
          text: "hi", text_entities: [{ type: "plain", text: "hi" }] },
      ],
    }));
    await runCLI([input, output]);
    await stat(output); // must exist
    // The name-based path must NOT exist.
    await assert.rejects(stat(join(dir, "Damir.md")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cli: bulk export falls back to input-based name", async () => {
  const dir = await tempDir();
  try {
    const input = join(dir, "export.json");
    await writeFile(input, JSON.stringify({
      chats: {
        list: [
          {
            name: "Alice", type: "personal_chat", id: 1,
            messages: [
              { id: 1, type: "message", date: "2026-01-01T10:00:00", from: "A",
                text: "hi", text_entities: [{ type: "plain", text: "hi" }] },
            ],
          },
        ],
      },
    }));
    await runCLI([input]);
    await stat(join(dir, "export.md"));
    await assert.rejects(stat(join(dir, "Alice.md")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cli: saved_messages without name → 'Saved Messages.md'", async () => {
  const dir = await tempDir();
  try {
    const input = join(dir, "export.json");
    await writeFile(input, JSON.stringify({
      type: "saved_messages",
      id: 42,
      messages: [
        { id: 1, type: "message", date: "2026-01-01T10:00:00", from: "Self",
          text: "note", text_entities: [{ type: "plain", text: "note" }] },
      ],
    }));
    await runCLI([input]);
    await stat(join(dir, "Saved Messages.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cli: chat name with forbidden chars gets sanitized", async () => {
  const dir = await tempDir();
  try {
    const input = join(dir, "export.json");
    await writeFile(input, JSON.stringify({
      name: "a/b?c",
      type: "personal_chat",
      id: 1,
      messages: [
        { id: 1, type: "message", date: "2026-01-01T10:00:00", from: "A",
          text: "hi", text_entities: [{ type: "plain", text: "hi" }] },
      ],
    }));
    await runCLI([input]);
    await stat(join(dir, "a_b_c.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
