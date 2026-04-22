import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { atomicWriteText } from "./atomic-write.js";

test("atomic write reports temp cleanup failures together with the original write failure", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-atomic-write-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const renameError = new Error("simulated rename failure");
  const cleanupError = new Error("simulated cleanup failure");
  const error = await atomicWriteText(join(rootDir, "record.json"), "{}", {
    async rename() {
      throw renameError;
    },
    async rm() {
      throw cleanupError;
    },
  }).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );

  assert.ok(error instanceof AggregateError);
  assert.equal(error.message, `Atomic write failed and temp cleanup failed for ${join(rootDir, "record.json")}`);
  assert.equal((error as AggregateError).errors[0], renameError);
  assert.equal((error as AggregateError).errors[1], cleanupError);
});
