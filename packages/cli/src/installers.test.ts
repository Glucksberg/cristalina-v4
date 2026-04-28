import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { installRuntime, openClawInstallOneLiner } from "./installers.js";

test("OpenClaw installer writes operational metadata outside truth layers", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-openclaw-install-"));
  const configPath = join(root, "config.json");
  const metadataPath = join(root, ".cristalina-v4", "runtime-openclaw.json");

  const result = await installRuntime({
    runtime: "openclaw",
    configPath,
    metadataPath,
    nonInteractive: true,
    runtimeRoot: join(root, "openclaw"),
  });

  assert.equal(result.runtime, "openclaw");
  assert.equal(result.status, "installed");
  assert.equal(result.metadata_path, metadataPath);
  assert.equal(result.diagnostics.length, 1);

  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
    runtime: string;
    event_contract: string;
    authority_note: string;
    bridge_command: string;
  };
  assert.equal(metadata.runtime, "openclaw");
  assert.equal(metadata.event_contract, "cristalina.runtime_bridge_event.v1");
  assert.match(metadata.authority_note, /does not grant owner authority/);
  assert.match(metadata.bridge_command, /cristalina bridge event/);
});

test("OpenClaw one-liner documents the public installer shape", () => {
  assert.equal(
    openClawInstallOneLiner("https://example.invalid/install-openclaw.sh"),
    "curl -fsSL https://example.invalid/install-openclaw.sh | sh",
  );
});
