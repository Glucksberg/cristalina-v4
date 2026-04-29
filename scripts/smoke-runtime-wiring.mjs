#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  listStoreDiagnostics,
  listStoreProjectionManifests,
  loadLatestSessionPackManifest,
} from "../packages/core/dist/index.js";
import {
  listOpenClawConversationPreferenceOwnerRatificationQueue,
  loadLatestOpenClawProjectionRuntimeView,
} from "../packages/openclaw-adapter/dist/index.js";
import {
  loadLatestHermesProjectionRuntimeView,
} from "../packages/hermes-adapter/dist/index.js";
import {
  executeCristalinaCommand,
} from "../packages/cli/dist/commands.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXAMPLE_ROOT = join(REPO_ROOT, "examples", "runtime-wiring");
const GENERATED_ROOT = join(EXAMPLE_ROOT, "generated");
const STORE_ROOT = join(GENERATED_ROOT, "store");
const CONFIG_PATH = join(GENERATED_ROOT, "config.json");
const OPENCLAW_ROOT = join(GENERATED_ROOT, "openclaw-runtime");
const HERMES_ROOT = join(GENERATED_ROOT, "hermes-runtime");
const OPENCLAW_TARGET_CONFIG = join(OPENCLAW_ROOT, "config", "hooks.json");
const HERMES_TARGET_CONFIG = join(HERMES_ROOT, "config", "hooks.json");
const GENERATED_EVENTS_ROOT = join(GENERATED_ROOT, "events");
const OPENCLAW_GENERATED_EVENT = join(GENERATED_EVENTS_ROOT, "openclaw-message-observed.json");
const HERMES_GENERATED_EVENT = join(GENERATED_EVENTS_ROOT, "hermes-runtime-diagnostic.json");
const OPENCLAW_EVENT = join(EXAMPLE_ROOT, "events", "openclaw-preference.json");
const HERMES_EVENT = join(EXAMPLE_ROOT, "events", "hermes-preference.json");
const OWNER_REF = "actor_owner_runtime_wiring_001";
const AGENT_REF = "actor_agent_runtime_wiring_001";
const OPENCLAW_RUNTIME_REF = "runtime_openclaw_runtime_wiring_001";
const HERMES_RUNTIME_REF = "runtime_hermes_runtime_wiring_001";

function parseJsonResult(result) {
  return JSON.parse(result.stdout);
}

async function command(input, expectedExitCodes = [0]) {
  const result = await executeCristalinaCommand(input);
  assert.ok(
    expectedExitCodes.includes(result.exitCode),
    `${JSON.stringify(input)} exited ${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

async function runHook(scriptPath, eventPath) {
  const result = await new Promise((resolveHook) => {
    const child = spawn(scriptPath, [], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        CRISTALINA_EVENT_PATH: eventPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolveHook({ exitCode: 1, stdout, stderr: `${stderr}${error.message}\n` });
    });
    child.on("exit", (code) => {
      resolveHook({ exitCode: code ?? 1, stdout, stderr });
    });
  });
  assert.equal(
    result.exitCode,
    0,
    `${scriptPath} exited ${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return JSON.parse(result.stdout);
}

await rm(GENERATED_ROOT, { recursive: true, force: true });
await mkdir(GENERATED_ROOT, { recursive: true });

await command({
  name: "config",
  configPath: CONFIG_PATH,
  init: true,
  nonInteractive: true,
  storeRoot: STORE_ROOT,
  ownerIdentityRef: OWNER_REF,
  agentIdentityRef: AGENT_REF,
  principalKind: "owner",
  principalActorRef: OWNER_REF,
  openclawRuntimeRef: OPENCLAW_RUNTIME_REF,
  hermesRuntimeRef: HERMES_RUNTIME_REF,
});

const openclawInstall = parseJsonResult(await command({
  name: "install",
  target: "openclaw",
  configPath: CONFIG_PATH,
  nonInteractive: true,
  runtimeRoot: OPENCLAW_ROOT,
}));
const hermesInstall = parseJsonResult(await command({
  name: "install",
  target: "hermes",
  configPath: CONFIG_PATH,
  nonInteractive: true,
  runtimeRoot: HERMES_ROOT,
}));
const openclawHookMap = parseJsonResult(await command({
  name: "runtime",
  action: "hook-map",
  runtime: "openclaw",
  runtimeRoot: OPENCLAW_ROOT,
  targetConfigPath: OPENCLAW_TARGET_CONFIG,
}));
const hermesHookMap = parseJsonResult(await command({
  name: "runtime",
  action: "hook-map",
  runtime: "hermes",
  runtimeRoot: HERMES_ROOT,
  targetConfigPath: HERMES_TARGET_CONFIG,
}));
assert.equal(openclawHookMap.status, "mapped");
assert.equal(hermesHookMap.status, "mapped");
assert.equal(openclawHookMap.runtime_config_patch.event_path_env, "CRISTALINA_EVENT_PATH");
assert.equal(hermesHookMap.runtime_config_patch.event_path_env, "CRISTALINA_EVENT_PATH");
const openclawGeneratedEvent = parseJsonResult(await command({
  name: "runtime",
  action: "event-template",
  configPath: CONFIG_PATH,
  runtime: "openclaw",
  eventType: "message_observed",
  outputPath: OPENCLAW_GENERATED_EVENT,
  message: "OpenClaw generated a Cristalina runtime bridge event file before hook execution.",
}));
const hermesGeneratedEvent = parseJsonResult(await command({
  name: "runtime",
  action: "event-template",
  configPath: CONFIG_PATH,
  runtime: "hermes",
  eventType: "runtime_diagnostic",
  outputPath: HERMES_GENERATED_EVENT,
  message: "Hermes generated a Cristalina runtime bridge event file before hook execution.",
}));
assert.equal(openclawGeneratedEvent.validation.status, "valid");
assert.equal(hermesGeneratedEvent.validation.status, "valid");
assert.equal(parseJsonResult(await command({
  name: "runtime",
  action: "event-check",
  configPath: CONFIG_PATH,
  eventPath: OPENCLAW_GENERATED_EVENT,
})).status, "valid");
assert.equal(parseJsonResult(await command({
  name: "runtime",
  action: "event-check",
  configPath: CONFIG_PATH,
  eventPath: HERMES_GENERATED_EVENT,
})).status, "valid");
const generatedEventVerify = parseJsonResult(await command({
  name: "runtime",
  action: "event-verify",
  configPath: CONFIG_PATH,
  openclawEventPath: OPENCLAW_GENERATED_EVENT,
  hermesEventPath: HERMES_GENERATED_EVENT,
}));
assert.equal(generatedEventVerify.status, "verified");
assert.equal(generatedEventVerify.store_root, STORE_ROOT);
assert.equal(generatedEventVerify.bridge_results.openclaw.status, "applied");
assert.equal(generatedEventVerify.bridge_results.hermes.status, "diagnostic_recorded");
const openclawHook = JSON.parse(await readFile(openclawInstall.hook_path, "utf8"));
const hermesHook = JSON.parse(await readFile(hermesInstall.hook_path, "utf8"));
assert.equal(openclawHook.hook_contract, "cristalina.runtime_hook.v1");
assert.equal(hermesHook.hook_contract, "cristalina.runtime_hook.v1");
assert.match(await readFile(openclawInstall.hook_script_path, "utf8"), /bridge event/);
assert.match(await readFile(hermesInstall.hook_script_path, "utf8"), /bridge event/);

const openclawWrite = await runHook(openclawInstall.hook_script_path, OPENCLAW_EVENT);
assert.equal(openclawWrite.status, "deferred");

const queueBefore = await listOpenClawConversationPreferenceOwnerRatificationQueue(STORE_ROOT);
assert.equal(queueBefore.length, 1);
const reviewApply = parseJsonResult(await command({
  name: "reviews",
  action: "apply",
  configPath: CONFIG_PATH,
  runtime: "openclaw",
  queueId: queueBefore[0].queue_id,
}));
assert.equal(reviewApply.status, "applied");

const hermesWrite = await runHook(hermesInstall.hook_script_path, HERMES_EVENT);
assert.equal(hermesWrite.status, "applied");

const projectionList = parseJsonResult(await command({
  name: "projection",
  action: "list",
  configPath: CONFIG_PATH,
}));
assert.ok(projectionList.projections.openclaw.length > 0);
assert.ok(projectionList.projections.hermes.length > 0);

const openclawProjection = await loadLatestOpenClawProjectionRuntimeView(STORE_ROOT, {
  consistency_requirement: "allow_mixed_state",
});
const hermesProjection = await loadLatestHermesProjectionRuntimeView(STORE_ROOT, {
  consistency_requirement: "allow_mixed_state",
});
assert.equal(openclawProjection.manifest.adapter, "openclaw");
assert.equal(hermesProjection.manifest.adapter, "hermes");

const openclawCheckpoint = parseJsonResult(await command({
  name: "checkpoint",
  action: "create",
  configPath: CONFIG_PATH,
  runtime: "openclaw",
}));
const openclawCheckpointRef = openclawCheckpoint.record_refs[0];
assert.ok(openclawCheckpointRef);

const hermesSessionPack = parseJsonResult(await command({
  name: "session-pack",
  action: "compile",
  configPath: CONFIG_PATH,
  runtime: "hermes",
  checkpointId: openclawCheckpointRef,
}));
assert.ok(hermesSessionPack.manifest);

const consumed = parseJsonResult(await command({
  name: "session-pack",
  action: "consume",
  configPath: CONFIG_PATH,
  runtime: "hermes",
  checkpointId: openclawCheckpointRef,
}));
assert.equal(consumed.receipt.receipt_status, "consumed");

const latestHermesPack = await loadLatestSessionPackManifest(STORE_ROOT, "hermes");
assert.equal(latestHermesPack?.id, hermesSessionPack.manifest);
assert.equal(latestHermesPack?.source_checkpoint_ref, openclawCheckpointRef);

const diagnostics = await listStoreDiagnostics(STORE_ROOT);
const manifests = await listStoreProjectionManifests(STORE_ROOT);
const status = parseJsonResult(await command({
  name: "status",
  configPath: CONFIG_PATH,
}));
const summary = {
  generated_root: GENERATED_ROOT,
  config_path: CONFIG_PATH,
  store_root: STORE_ROOT,
  hooks: {
    openclaw: {
      hook_path: openclawInstall.hook_path,
      hook_script_path: openclawInstall.hook_script_path,
      hook_map_path: openclawHookMap.map_path,
      target_config_path: openclawHookMap.target_config_path,
      hook_contract: openclawHook.hook_contract,
    },
    hermes: {
      hook_path: hermesInstall.hook_path,
      hook_script_path: hermesInstall.hook_script_path,
      hook_map_path: hermesHookMap.map_path,
      target_config_path: hermesHookMap.target_config_path,
      hook_contract: hermesHook.hook_contract,
    },
  },
  events: {
    openclaw_preference: OPENCLAW_EVENT,
    hermes_preference: HERMES_EVENT,
    openclaw_generated: OPENCLAW_GENERATED_EVENT,
    hermes_generated: HERMES_GENERATED_EVENT,
  },
  bridge_event_verify: {
    status: generatedEventVerify.status,
    openclaw_status: generatedEventVerify.bridge_results.openclaw.status,
    hermes_status: generatedEventVerify.bridge_results.hermes.status,
  },
  projections: {
    openclaw: openclawProjection.manifest.id,
    hermes: hermesProjection.manifest.id,
  },
  session_continuity: {
    openclaw_checkpoint_ref: openclawCheckpointRef,
    hermes_session_pack_manifest_ref: hermesSessionPack.manifest,
    hermes_resume_receipt_ref: consumed.receipt.id,
  },
  counts: {
    projection_manifest_count: manifests.length,
    diagnostic_count: diagnostics.length,
    pending_openclaw_reviews: status.pending_owner_reviews.openclaw,
    pending_hermes_reviews: status.pending_owner_reviews.hermes,
  },
};

await writeFile(join(GENERATED_ROOT, "runtime-wiring-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
