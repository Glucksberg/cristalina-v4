import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SOURCE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

test("CLI source stays on public core and adapter package boundaries", async () => {
  const files = ["bridge.ts", "commands.ts", "config.ts", "config-menu.ts", "index.ts", "installers.ts", "runtime-events.ts"];
  for (const file of files) {
    const source = await readFile(join(SOURCE_ROOT, file), "utf8");
    assert.equal(source.includes("@cristalina-v4/core/internal"), false, `${file} must not import core internal entrypoint`);
    assert.equal(source.includes("../../core/src"), false, `${file} must not import core source internals`);
    assert.equal(source.includes("../../openclaw-adapter/src"), false, `${file} must not import OpenClaw adapter source internals`);
    assert.equal(source.includes("../../hermes-adapter/src"), false, `${file} must not import Hermes adapter source internals`);
  }
});
