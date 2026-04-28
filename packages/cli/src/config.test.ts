import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runConfigMenu } from "./config-menu.js";
import {
  buildDefaultCristalinaConfig,
  candidateConfigPaths,
  loadCristalinaConfig,
  resolveStoreRoot,
  validateConfigObject,
} from "./config.js";

test("config loader finds local config before home config", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-config-"));
  const home = join(root, "home");
  const cwd = join(root, "repo");
  await mkdir(join(home, ".cristalina-v4"), { recursive: true });
  await mkdir(join(cwd, ".cristalina-v4"), { recursive: true });
  await writeFile(join(home, ".cristalina-v4", "config.json"), JSON.stringify({ store_root: "home-store" }));
  await writeFile(join(cwd, ".cristalina-v4", "config.json"), JSON.stringify({ store_root: "local-store" }));

  assert.deepEqual(candidateConfigPaths(cwd, home), [
    join(cwd, ".cristalina-v4", "config.json"),
    join(home, ".cristalina-v4", "config.json"),
  ]);

  const loaded = await loadCristalinaConfig({ cwd, home });
  assert.equal(loaded.config.store_root, "local-store");
  assert.equal(resolveStoreRoot(loaded.config, undefined, cwd), join(cwd, "local-store"));
});

test("config validator preserves identity and runtime binding distinctions", () => {
  const diagnostics: string[] = [];
  const config = validateConfigObject({
    store_root: ".cristalina-v4",
    schema_version: 1,
    operator_ref: "actor_operator_001",
    owner_identity_ref: "actor_owner_001",
    agent_identity_ref: "actor_agent_001",
    authenticated_principal: {
      kind: "owner",
      actor_ref: "actor_owner_001",
    },
    runtimes: {
      openclaw: {
        runtime_instance_ref: "runtime_openclaw_001",
        default_session_ref: "session_openclaw_001",
        default_thread_ref: "thread_openclaw_001",
      },
      hermes: {
        runtime_instance_ref: "runtime_hermes_001",
      },
    },
    session_thread_strategy: "prompt_per_launch",
    projection_consistency: "allow_mixed_state",
    review_behavior: "list_only",
    checkpoint_resume: "record_checkpoints",
    diagnostics_verbosity: "normal",
  }, diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(config.schema_version, 1);
  assert.equal(config.operator_ref, "actor_operator_001");
  assert.equal(config.authenticated_principal?.actor_ref, "actor_owner_001");
  assert.equal(config.runtimes?.openclaw?.default_thread_ref, "thread_openclaw_001");
  assert.equal(config.runtimes?.hermes?.runtime_instance_ref, "runtime_hermes_001");
});

test("config menu can create a versioned config in non-interactive mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-config-menu-"));
  const configPath = join(root, "config.json");
  const result = await runConfigMenu({
    configPath,
    nonInteractive: true,
    storeRoot: join(root, "store"),
    ownerIdentityRef: "actor_owner_config_menu_001",
    agentIdentityRef: "actor_agent_config_menu_001",
    openclawRuntimeRef: "runtime_openclaw_config_menu_001",
    hermesRuntimeRef: "runtime_hermes_config_menu_001",
  });

  assert.equal(result.path, configPath);
  const loaded = await loadCristalinaConfig({ configPath });
  assert.equal(loaded.config.schema_version, 1);
  assert.equal(loaded.config.owner_identity_ref, "actor_owner_config_menu_001");
  assert.equal(loaded.config.runtimes?.openclaw?.runtime_instance_ref, "runtime_openclaw_config_menu_001");
  assert.equal(loaded.config.runtimes?.hermes?.runtime_instance_ref, "runtime_hermes_config_menu_001");
});

test("default config records operational policy without granting authority by itself", () => {
  const config = buildDefaultCristalinaConfig({
    ownerIdentityRef: "actor_owner_default_config_001",
  });

  assert.equal(config.schema_version, 1);
  assert.equal(config.authenticated_principal?.kind, "owner");
  assert.equal(config.authenticated_principal.actor_ref, "actor_owner_default_config_001");
  assert.equal(config.review_behavior, "list_only");
  assert.equal(config.checkpoint_resume, "record_checkpoints");
});
