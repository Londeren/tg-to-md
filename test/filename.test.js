import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizeFilename } from "../src/filename.js";

test("sanitizeFilename: plain name returned as is", () => {
  assert.equal(sanitizeFilename("Damir"), "Damir");
});

test("sanitizeFilename: cyrillic name returned as is", () => {
  assert.equal(sanitizeFilename("Майя"), "Майя");
});

test("sanitizeFilename: forbidden chars replaced with _", () => {
  assert.equal(sanitizeFilename("a/b\\c:d*e?f\"g<h>i|j"), "a_b_c_d_e_f_g_h_i_j");
});

test("sanitizeFilename: control chars replaced with _", () => {
  assert.equal(sanitizeFilename("a\x00b\x1Fc\x7Fd"), "a_b_c_d");
});

test("sanitizeFilename: leading/trailing whitespace and dots trimmed", () => {
  assert.equal(sanitizeFilename("  ..  name  ..  "), "name");
});

test("sanitizeFilename: all dots → empty string", () => {
  assert.equal(sanitizeFilename("...."), "");
});

test("sanitizeFilename: empty input → empty string", () => {
  assert.equal(sanitizeFilename(""), "");
});

test("sanitizeFilename: UTF-8 name >200 bytes truncated on codepoint boundary", () => {
  const long = "я".repeat(150); // each 'я' = 2 bytes utf8 → 300 bytes
  const out = sanitizeFilename(long);
  assert.ok(Buffer.byteLength(out, "utf8") <= 200, `expected ≤200 bytes, got ${Buffer.byteLength(out, "utf8")}`);
  // Codepoint boundary: re-decoding should round-trip (no replacement chars).
  assert.ok(!out.includes("�"));
});

test("sanitizeFilename: ascii name >200 bytes truncated", () => {
  const long = "a".repeat(300);
  assert.equal(sanitizeFilename(long), "a".repeat(200));
});
