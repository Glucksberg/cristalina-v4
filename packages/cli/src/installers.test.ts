import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { hermesInstallOneLiner, installRuntime, openClawInstallOneLiner } from "./installers.js";

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
  assert.equal(result.hook_path, join(root, "openclaw", ".cristalina-v4", "hooks", "openclaw-cristalina-hook.json"));
  assert.equal(result.diagnostics.length, 1);

  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
    runtime: string;
    event_contract: string;
    authority_note: string;
    bridge_command: string;
    hook_path: string;
  };
  assert.equal(metadata.runtime, "openclaw");
  assert.equal(metadata.event_contract, "cristalina.runtime_bridge_event.v1");
  assert.match(metadata.authority_note, /does not grant owner authority/);
  assert.match(metadata.bridge_command, /cristalina bridge event/);
  assert.equal(metadata.hook_path, result.hook_path);

  const hook = JSON.parse(await readFile(result.hook_path, "utf8")) as {
    runtime: string;
    hook_contract: string;
    event_path_env: string;
    bridge_command_argv: string[];
  };
  assert.equal(hook.runtime, "openclaw");
  assert.equal(hook.hook_contract, "cristalina.runtime_hook.v1");
  assert.equal(hook.event_path_env, "CRISTALINA_EVENT_PATH");
  assert.deepEqual(hook.bridge_command_argv.slice(0, 5), ["cristalina", "bridge", "event", "--config", configPath]);
  assert.match(await readFile(result.hook_script_path, "utf8"), /CRISTALINA_EVENT_PATH/);
});

test("OpenClaw one-liner documents the public installer shape", () => {
  assert.equal(
    openClawInstallOneLiner("https://example.invalid/install-openclaw.sh"),
    "curl -fsSL https://example.invalid/install-openclaw.sh | sh",
  );
});

test("Hermes installer uses the same metadata contract as OpenClaw", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-hermes-install-"));
  const configPath = join(root, "config.json");
  const metadataPath = join(root, ".cristalina-v4", "runtime-hermes.json");

  const result = await installRuntime({
    runtime: "hermes",
    configPath,
    metadataPath,
    nonInteractive: true,
    runtimeRoot: join(root, "hermes"),
  });

  assert.equal(result.runtime, "hermes");
  assert.equal(result.status, "installed");
  assert.equal(result.metadata_path, metadataPath);

  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
    runtime: string;
    event_contract: string;
    bridge_command: string;
    projection_command: string;
  };
  assert.equal(metadata.runtime, "hermes");
  assert.equal(metadata.event_contract, "cristalina.runtime_bridge_event.v1");
  assert.match(metadata.bridge_command, /cristalina bridge event/);
  assert.match(metadata.projection_command, /cristalina projection list/);
  assert.match(await readFile(result.hook_path, "utf8"), /cristalina.runtime_hook.v1/);
});

test("Hermes one-liner documents the public installer shape", () => {
  assert.equal(
    hermesInstallOneLiner("https://example.invalid/install-hermes.sh"),
    "curl -fsSL https://example.invalid/install-hermes.sh | sh",
  );
});

test("installer defaults metadata under runtimeRoot when metadata path is not explicit", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-runtime-root-install-"));
  const runtimeRoot = join(root, "openclaw-runtime");
  const configPath = join(root, "config.json");

  const result = await installRuntime({
    runtime: "openclaw",
    configPath,
    runtimeRoot,
    nonInteractive: true,
  });

  assert.equal(result.metadata_path, join(runtimeRoot, ".cristalina-v4", "runtime-openclaw.json"));
  assert.equal(result.hook_path, join(runtimeRoot, ".cristalina-v4", "hooks", "openclaw-cristalina-hook.json"));
  const metadata = JSON.parse(await readFile(result.metadata_path, "utf8")) as {
    runtime_root: string;
    hook_script_path: string;
  };
  assert.equal(metadata.runtime_root, runtimeRoot);
  assert.equal(metadata.hook_script_path, result.hook_script_path);
});
