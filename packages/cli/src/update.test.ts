import assert from "node:assert/strict";
import test from "node:test";

import { blockingGitStatusLines } from "./update.js";

test("git clean check ignores repo-local Cristalina runtime state", () => {
  assert.deepEqual(blockingGitStatusLines("?? .cristalina-v4/\n"), []);
  assert.deepEqual(blockingGitStatusLines("?? .cristalina-v4/config.json\n"), []);
});

test("git clean check still blocks ordinary local changes", () => {
  assert.deepEqual(blockingGitStatusLines(" M packages/cli/src/update.ts\n?? notes.txt\n"), [
    " M packages/cli/src/update.ts",
    "?? notes.txt",
  ]);
});
