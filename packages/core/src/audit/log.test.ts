import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import { STORAGE_LAYOUT } from "../storage.js";
import { appendAuditChange, appendValidationLog } from "./log.js";

function parseJsonLines(source: string): Array<{ entry_id?: string }> {
  return source
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as { entry_id?: string });
}

test("appendAuditChange preserves all concurrent entries", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-audit-log-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      appendAuditChange(rootDir, {
        entry_id: `audit-entry-${index}`,
        at: `2026-04-20T00:00:${String(index).padStart(2, "0")}.000Z`,
        operation: "record_observation",
        record_id: `obs_${index}`,
        record_kind: "observation",
        record_layer: "runtime",
        detail: `Concurrent audit append ${index}`,
      }),
    ),
  );

  const source = await readFile(join(rootDir, STORAGE_LAYOUT.audits.changes), "utf8");
  const entries = parseJsonLines(source);

  assert.equal(entries.length, 12);
  assert.deepEqual(
    new Set(entries.map((entry) => entry.entry_id)),
    new Set(Array.from({ length: 12 }, (_, index) => `audit-entry-${index}`)),
  );
});

test("appendAuditChange de-duplicates the same entry_id under concurrency", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-audit-log-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await Promise.all(
    Array.from({ length: 12 }, () =>
      appendAuditChange(rootDir, {
        entry_id: "audit-entry-shared",
        at: "2026-04-20T00:00:00.000Z",
        operation: "record_observation",
        record_id: "obs_shared",
        record_kind: "observation",
        record_layer: "runtime",
        detail: "Concurrent duplicate append",
      }),
    ),
  );

  const source = await readFile(join(rootDir, STORAGE_LAYOUT.audits.changes), "utf8");
  const entries = parseJsonLines(source);

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.entry_id, "audit-entry-shared");
});

test("appendValidationLog preserves all concurrent entries", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-validation-log-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      appendValidationLog(rootDir, {
        entry_id: `validation-entry-${index}`,
        at: `2026-04-20T00:01:${String(index).padStart(2, "0")}.000Z`,
        scope: `test-scope-${index}`,
        issues: [],
      }),
    ),
  );

  const source = await readFile(join(rootDir, STORAGE_LAYOUT.audits.validation), "utf8");
  const entries = parseJsonLines(source);

  assert.equal(entries.length, 8);
  assert.deepEqual(
    new Set(entries.map((entry) => entry.entry_id)),
    new Set(Array.from({ length: 8 }, (_, index) => `validation-entry-${index}`)),
  );
});
