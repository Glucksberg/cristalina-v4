import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectCristalinaStore, listStoreProjectionManifests, loadLatestWorkingMemoryCheckpoint } from "@cristalina-v4/core";
import { listOpenClawConversationPreferenceOwnerRatificationQueue } from "@cristalina-v4/openclaw-adapter";

import { executeCristalinaCommand } from "./commands.js";
import { buildDefaultCristalinaConfig } from "./config.js";
import { handleRuntimeBridgeEvent } from "./runtime-events.js";

test("doctor reports missing config and store without writing memory", async () => {
  const result = await executeCristalinaCommand({ name: "doctor", configPath: "/missing/cristalina/config.json" });
  assert.equal(result.exitCode, 1);
  const payload = JSON.parse(result.stdout) as {
    store_manifest_found: boolean;
    diagnostics: string[];
  };
  assert.equal(payload.store_manifest_found, false);
  assert.ok(payload.diagnostics.some((entry) => entry.includes("No Cristalina config found")));
  assert.ok(payload.diagnostics.some((entry) => entry.includes("No store root configured")));
});

test("init creates a manifest and doctor accepts explicit runtime bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-doctor-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");

  const init = await executeCristalinaCommand({ name: "init", storeRoot });
  assert.equal(init.exitCode, 0);

  await mkdir(root, { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify({
      schema_version: 1,
      store_root: storeRoot,
      owner_identity_ref: "actor_owner_cli_doctor_001",
      agent_identity_ref: "actor_agent_cli_doctor_001",
      runtimes: {
        openclaw: {
          runtime_instance_ref: "runtime_openclaw_cli_doctor_001",
        },
        hermes: {
          runtime_instance_ref: "runtime_hermes_cli_doctor_001",
        },
      },
      session_thread_strategy: "prompt_per_launch",
      projection_consistency: "allow_mixed_state",
      review_behavior: "list_only",
      checkpoint_resume: "record_checkpoints",
      diagnostics_verbosity: "normal",
    }, null, 2)}\n`,
  );

  const doctor = await executeCristalinaCommand({ name: "doctor", configPath });
  assert.equal(doctor.exitCode, 0);
  const payload = JSON.parse(doctor.stdout) as {
    store_root: string;
    store_manifest_found: boolean;
    projections: { openclaw: unknown[]; hermes: unknown[] };
  };
  assert.equal(payload.store_root, storeRoot);
  assert.equal(payload.store_manifest_found, true);
  assert.deepEqual(payload.projections.openclaw, []);
  assert.deepEqual(payload.projections.hermes, []);
});

test("runtime preflight reports concrete hook install commands for selected roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-runtime-preflight-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  const openclawRoot = join(root, "openclaw-runtime");
  const hermesRoot = join(root, "hermes-runtime");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await mkdir(openclawRoot, { recursive: true });
  await mkdir(hermesRoot, { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_runtime_preflight_001",
      agentIdentityRef: "actor_agent_cli_runtime_preflight_001",
      openclawRuntimeRef: "runtime_openclaw_cli_runtime_preflight_001",
      hermesRuntimeRef: "runtime_hermes_cli_runtime_preflight_001",
    }), null, 2)}\n`,
  );

  const result = await executeCristalinaCommand({
    name: "runtime",
    action: "preflight",
    configPath,
    openclawRoot,
    hermesRoot,
  });
  const payload = JSON.parse(result.stdout) as {
    status: string;
    runtime_roots: {
      openclaw: { hook_descriptor_path: string; install_command: string };
      hermes: { hook_script_path: string; install_command: string };
    };
    fixture_contract: { event_path_env: string };
  };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.status, "ready_for_hook_install");
  assert.match(payload.runtime_roots.openclaw.hook_descriptor_path, /openclaw-cristalina-hook\.json$/);
  assert.match(payload.runtime_roots.openclaw.install_command, /install openclaw/);
  assert.match(payload.runtime_roots.hermes.hook_script_path, /cristalina-bridge-event\.sh$/);
  assert.match(payload.runtime_roots.hermes.install_command, /install hermes/);
  assert.equal(payload.fixture_contract.event_path_env, "CRISTALINA_EVENT_PATH");
});

test("runtime hook-map writes an operational mapping for an installed hook", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-runtime-hook-map-"));
  const configPath = join(root, "config.json");
  const runtimeRoot = join(root, "openclaw-runtime");
  const targetConfigPath = join(runtimeRoot, "config", "hooks.json");
  const install = await executeCristalinaCommand({
    name: "install",
    target: "openclaw",
    configPath,
    nonInteractive: true,
    runtimeRoot,
  });
  assert.equal(install.exitCode, 0);

  const result = await executeCristalinaCommand({
    name: "runtime",
    action: "hook-map",
    runtime: "openclaw",
    runtimeRoot,
    targetConfigPath,
  });
  const payload = JSON.parse(result.stdout) as {
    status: string;
    map_path: string;
    target_config_path: string;
    runtime_config_patch: {
      descriptor_path: string;
      script_path: string;
      event_path_env: string;
      invocation: { command: string; env: Record<string, string> };
      authority_note: string;
    };
  };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.status, "mapped");
  assert.equal(payload.target_config_path, targetConfigPath);
  assert.match(payload.map_path, /openclaw-cristalina-hook-map\.json$/);
  assert.match(payload.runtime_config_patch.descriptor_path, /openclaw-cristalina-hook\.json$/);
  assert.match(payload.runtime_config_patch.script_path, /cristalina-bridge-event\.sh$/);
  assert.equal(payload.runtime_config_patch.invocation.command, payload.runtime_config_patch.script_path);
  assert.equal(payload.runtime_config_patch.invocation.env.CRISTALINA_EVENT_PATH, "<runtime-produced-event.json>");
  assert.match(payload.runtime_config_patch.authority_note, /does not grant owner authority/);
});

test("runtime hook-map refuses to write a mapping for an invalid descriptor", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-runtime-hook-map-invalid-"));
  const configPath = join(root, "config.json");
  const runtimeRoot = join(root, "hermes-runtime");
  const install = await executeCristalinaCommand({
    name: "install",
    target: "hermes",
    configPath,
    nonInteractive: true,
    runtimeRoot,
  });
  const installed = JSON.parse(install.stdout) as { hook_path: string };
  await writeFile(installed.hook_path, "{ invalid json\n");

  const result = await executeCristalinaCommand({
    name: "runtime",
    action: "hook-map",
    runtime: "hermes",
    runtimeRoot,
    targetConfigPath: join(runtimeRoot, "config", "hooks.json"),
  });
  const payload = JSON.parse(result.stdout) as {
    status: string;
    mapping_written: boolean;
    diagnostics: string[];
  };
  assert.equal(result.exitCode, 1);
  assert.equal(payload.status, "blocked");
  assert.equal(payload.mapping_written, false);
  assert.ok(payload.diagnostics.some((entry) => entry.includes("not valid JSON")));
});

test("runtime event-template writes a bridge event that event-check accepts", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-runtime-event-template-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  const eventPath = join(root, "hermes-event.json");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_event_template_001",
      agentIdentityRef: "actor_agent_cli_event_template_001",
      hermesRuntimeRef: "runtime_hermes_cli_event_template_001",
    }), null, 2)}\n`,
  );

  const template = await executeCristalinaCommand({
    name: "runtime",
    action: "event-template",
    configPath,
    runtime: "hermes",
    eventType: "conversation_preference_signal",
    outputPath: eventPath,
    statement: "The owner prefers runtime event templates to be validated before bridge ingestion.",
    message: "The owner says runtime event templates should validate before bridge ingestion.",
  });
  const templatePayload = JSON.parse(template.stdout) as {
    status: string;
    event_path: string;
    validation: { status: string };
  };
  assert.equal(template.exitCode, 0);
  assert.equal(templatePayload.status, "written");
  assert.equal(templatePayload.event_path, eventPath);
  assert.equal(templatePayload.validation.status, "valid");

  const event = JSON.parse(await readFile(eventPath, "utf8")) as { runtime: string; event_type: string; runtime_instance_ref: string };
  assert.equal(event.runtime, "hermes");
  assert.equal(event.event_type, "conversation_preference_signal");
  assert.equal(event.runtime_instance_ref, "runtime_hermes_cli_event_template_001");

  const check = await executeCristalinaCommand({
    name: "runtime",
    action: "event-check",
    configPath,
    eventPath,
  });
  const checkPayload = JSON.parse(check.stdout) as { status: string; diagnostics: string[] };
  assert.equal(check.exitCode, 0);
  assert.equal(checkPayload.status, "valid");
  assert.deepEqual(checkPayload.diagnostics, []);
});

test("runtime event-check rejects events with runtime identity drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-runtime-event-check-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  const eventPath = join(root, "openclaw-event.json");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_event_check_001",
      agentIdentityRef: "actor_agent_cli_event_check_001",
      openclawRuntimeRef: "runtime_openclaw_cli_event_check_001",
    }), null, 2)}\n`,
  );
  await writeFile(
    eventPath,
    `${JSON.stringify({
      event_id: "evt_cli_runtime_event_check_drift_001",
      event_type: "runtime_diagnostic",
      runtime: "openclaw",
      occurred_at: "2026-04-28T20:00:00.000Z",
      actor_ref: "system:openclaw-event-check",
      authenticated_principal: {
        kind: "system",
        actor_ref: "system:openclaw-event-check",
        system_scope: "runtime-event-check",
      },
      runtime_instance_ref: "runtime_openclaw_wrong_001",
      code: "event_check_drift",
      severity: "info",
      message: "This event intentionally declares the wrong runtime instance.",
    }, null, 2)}\n`,
  );

  const result = await executeCristalinaCommand({
    name: "runtime",
    action: "event-check",
    configPath,
    eventPath,
  });
  const payload = JSON.parse(result.stdout) as { status: string; diagnostics: string[] };
  assert.equal(result.exitCode, 1);
  assert.equal(payload.status, "invalid");
  assert.ok(payload.diagnostics.some((entry) => entry.includes("runtime_instance_ref")));
});

test("runtime event-verify writes OpenClaw and Hermes events into one store", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-runtime-event-verify-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  const openclawEventPath = join(root, "openclaw-message.json");
  const hermesEventPath = join(root, "hermes-diagnostic.json");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_event_verify_001",
      agentIdentityRef: "actor_agent_cli_event_verify_001",
      openclawRuntimeRef: "runtime_openclaw_cli_event_verify_001",
      hermesRuntimeRef: "runtime_hermes_cli_event_verify_001",
    }), null, 2)}\n`,
  );
  await executeCristalinaCommand({
    name: "runtime",
    action: "event-template",
    configPath,
    runtime: "openclaw",
    eventType: "message_observed",
    outputPath: openclawEventPath,
  });
  await executeCristalinaCommand({
    name: "runtime",
    action: "event-template",
    configPath,
    runtime: "hermes",
    eventType: "runtime_diagnostic",
    outputPath: hermesEventPath,
  });

  const result = await executeCristalinaCommand({
    name: "runtime",
    action: "event-verify",
    configPath,
    openclawEventPath,
    hermesEventPath,
  });
  const payload = JSON.parse(result.stdout) as {
    status: string;
    store_root: string;
    validations: {
      openclaw: { status: string; runtime: string };
      hermes: { status: string; runtime: string };
    };
    bridge_results: {
      openclaw: { status: string; record_refs: string[] };
      hermes: { status: string; record_refs: string[] };
    };
    diagnostics: string[];
  };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.status, "verified");
  assert.equal(payload.store_root, storeRoot);
  assert.equal(payload.validations.openclaw.status, "valid");
  assert.equal(payload.validations.openclaw.runtime, "openclaw");
  assert.equal(payload.validations.hermes.status, "valid");
  assert.equal(payload.validations.hermes.runtime, "hermes");
  assert.equal(payload.bridge_results.openclaw.status, "applied");
  assert.equal(payload.bridge_results.hermes.status, "diagnostic_recorded");
  assert.ok(payload.bridge_results.openclaw.record_refs.length > 0);
  assert.ok(payload.bridge_results.hermes.record_refs.length > 0);
  assert.deepEqual(payload.diagnostics, []);
});

test("projection verify loads compatible OpenClaw and Hermes runtime manifests", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-projection-verify-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  const openclawEventPath = join(root, "openclaw-preference.json");
  const hermesEventPath = join(root, "hermes-preference.json");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_projection_verify_001",
      agentIdentityRef: "actor_agent_cli_projection_verify_001",
      openclawRuntimeRef: "runtime_openclaw_cli_projection_verify_001",
      hermesRuntimeRef: "runtime_hermes_cli_projection_verify_001",
    }), null, 2)}\n`,
  );
  await executeCristalinaCommand({
    name: "runtime",
    action: "event-template",
    configPath,
    runtime: "openclaw",
    eventType: "conversation_preference_signal",
    outputPath: openclawEventPath,
  });
  await executeCristalinaCommand({
    name: "runtime",
    action: "event-template",
    configPath,
    runtime: "hermes",
    eventType: "conversation_preference_signal",
    outputPath: hermesEventPath,
  });
  const bridge = await executeCristalinaCommand({
    name: "runtime",
    action: "event-verify",
    configPath,
    openclawEventPath,
    hermesEventPath,
  });
  assert.equal(bridge.exitCode, 0);

  const result = await executeCristalinaCommand({
    name: "projection",
    action: "verify",
    configPath,
  });
  const payload = JSON.parse(result.stdout) as {
    status: string;
    runtimes: {
      openclaw: {
        status: string;
        manifest: { adapter: string; projection_profile: string; audience: string; runtime_instance_ref: string };
      };
      hermes: {
        status: string;
        manifest: { adapter: string; projection_profile: string; audience: string; runtime_instance_ref: string };
      };
    };
    diagnostics: string[];
  };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.status, "verified");
  assert.equal(payload.runtimes.openclaw.status, "compatible");
  assert.equal(payload.runtimes.openclaw.manifest.adapter, "openclaw");
  assert.equal(payload.runtimes.openclaw.manifest.projection_profile, "bootstrap");
  assert.equal(payload.runtimes.openclaw.manifest.audience, "runtime");
  assert.equal(payload.runtimes.openclaw.manifest.runtime_instance_ref, "runtime_openclaw_cli_projection_verify_001");
  assert.equal(payload.runtimes.hermes.status, "compatible");
  assert.equal(payload.runtimes.hermes.manifest.adapter, "hermes");
  assert.equal(payload.runtimes.hermes.manifest.projection_profile, "bootstrap");
  assert.equal(payload.runtimes.hermes.manifest.audience, "runtime");
  assert.equal(payload.runtimes.hermes.manifest.runtime_instance_ref, "runtime_hermes_cli_projection_verify_001");
  assert.deepEqual(payload.diagnostics, []);
});

test("reviews apply writes to the explicit store-root override", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-review-override-"));
  const storeA = join(root, "store-a");
  const storeB = join(root, "store-b");
  const configPath = join(root, "config.json");
  await executeCristalinaCommand({ name: "init", storeRoot: storeA });
  await executeCristalinaCommand({ name: "init", storeRoot: storeB });

  const configA = buildDefaultCristalinaConfig({
    storeRoot: storeA,
    ownerIdentityRef: "actor_owner_cli_review_001",
    agentIdentityRef: "actor_agent_cli_review_001",
    openclawRuntimeRef: "runtime_openclaw_cli_review_001",
    hermesRuntimeRef: "runtime_hermes_cli_review_001",
  });
  await writeFile(configPath, `${JSON.stringify(configA, null, 2)}\n`);

  const configB = buildDefaultCristalinaConfig({
    storeRoot: storeB,
    ownerIdentityRef: "actor_owner_cli_review_001",
    agentIdentityRef: "actor_agent_cli_review_001",
    openclawRuntimeRef: "runtime_openclaw_cli_review_001",
    hermesRuntimeRef: "runtime_hermes_cli_review_001",
  });
  await handleRuntimeBridgeEvent(configB, {
    event_id: "evt_cli_review_override_001",
    event_type: "conversation_preference_signal",
    runtime: "openclaw",
    occurred_at: "2026-04-28T14:00:00.000Z",
    actor_ref: "actor_participant_cli_review_001",
    authenticated_principal: {
      kind: "participant",
      actor_ref: "actor_participant_cli_review_001",
    },
    runtime_instance_ref: "runtime_openclaw_cli_review_001",
    statement: "The owner prefers review apply to respect explicit store roots.",
    message: "A collaborator says review apply should respect explicit store roots.",
    speaker_ref: "actor_participant_cli_review_001",
  });
  const queueBefore = await listOpenClawConversationPreferenceOwnerRatificationQueue(storeB);
  assert.equal(queueBefore.length, 1);

  const result = await executeCristalinaCommand({
    name: "reviews",
    action: "apply",
    configPath,
    storeRoot: storeB,
    runtime: "openclaw",
    queueId: queueBefore[0]!.queue_id,
  });
  assert.equal(result.exitCode, 0);
  assert.equal((await listOpenClawConversationPreferenceOwnerRatificationQueue(storeB)).length, 0);
});

test("bridge event treats deferred review as successful event processing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-bridge-deferred-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  const eventPath = join(root, "event.json");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_bridge_deferred_001",
      agentIdentityRef: "actor_agent_cli_bridge_deferred_001",
      openclawRuntimeRef: "runtime_openclaw_cli_bridge_deferred_001",
      hermesRuntimeRef: "runtime_hermes_cli_bridge_deferred_001",
    }), null, 2)}\n`,
  );
  await writeFile(
    eventPath,
    `${JSON.stringify({
      event_id: "evt_cli_bridge_deferred_001",
      event_type: "conversation_preference_signal",
      runtime: "openclaw",
      occurred_at: "2026-04-28T18:00:00.000Z",
      actor_ref: "actor_participant_cli_bridge_deferred_001",
      authenticated_principal: {
        kind: "participant",
        actor_ref: "actor_participant_cli_bridge_deferred_001",
      },
      runtime_instance_ref: "runtime_openclaw_cli_bridge_deferred_001",
      statement: "The owner prefers deferred bridge events to be reported as processed.",
      message: "A collaborator says deferred bridge events should be reported as processed.",
      speaker_ref: "actor_participant_cli_bridge_deferred_001",
    }, null, 2)}\n`,
  );

  const result = await executeCristalinaCommand({
    name: "bridge",
    action: "event",
    configPath,
    eventPath,
  });
  const payload = JSON.parse(result.stdout) as { status: string };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.status, "deferred");
});

test("CLI checkpoint create emits a new generation instead of overwriting the previous checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-checkpoint-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_checkpoint_001",
      agentIdentityRef: "actor_agent_cli_checkpoint_001",
      openclawRuntimeRef: "runtime_openclaw_cli_checkpoint_001",
      hermesRuntimeRef: "runtime_hermes_cli_checkpoint_001",
    }), null, 2)}\n`,
  );

  const first = await executeCristalinaCommand({ name: "checkpoint", action: "create", configPath, runtime: "openclaw" });
  const second = await executeCristalinaCommand({ name: "checkpoint", action: "create", configPath, runtime: "openclaw" });
  assert.equal(first.exitCode, 0);
  assert.equal(second.exitCode, 0);

  const inspection = await inspectCristalinaStore(storeRoot);
  assert.equal(inspection.working_memory_checkpoint_count, 2);
  const active = await loadLatestWorkingMemoryCheckpoint(storeRoot, {
    runtime_instance_ref: "runtime_openclaw_cli_checkpoint_001",
  });
  assert.ok(active);
  assert.equal(active.generation, 2);
  assert.ok(active.supersedes_ref);
});

test("session-pack compile preserves distinct packs for explicit checkpoint ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-session-pack-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_session_pack_001",
      agentIdentityRef: "actor_agent_cli_session_pack_001",
      openclawRuntimeRef: "runtime_openclaw_cli_session_pack_001",
      hermesRuntimeRef: "runtime_hermes_cli_session_pack_001",
    }), null, 2)}\n`,
  );

  const openclawCheckpoint = await executeCristalinaCommand({ name: "checkpoint", action: "create", configPath, runtime: "openclaw" });
  const hermesCheckpoint = await executeCristalinaCommand({ name: "checkpoint", action: "create", configPath, runtime: "hermes" });
  const openclawCheckpointRef = (JSON.parse(openclawCheckpoint.stdout) as { record_refs: string[] }).record_refs[0]!;
  const hermesCheckpointRef = (JSON.parse(hermesCheckpoint.stdout) as { record_refs: string[] }).record_refs[0]!;

  const first = await executeCristalinaCommand({
    name: "session-pack",
    action: "compile",
    configPath,
    runtime: "hermes",
    checkpointId: openclawCheckpointRef,
  });
  const second = await executeCristalinaCommand({
    name: "session-pack",
    action: "compile",
    configPath,
    runtime: "hermes",
    checkpointId: hermesCheckpointRef,
  });
  assert.equal(first.exitCode, 0);
  assert.equal(second.exitCode, 0);

  const firstManifest = (JSON.parse(first.stdout) as { manifest: string }).manifest;
  const secondManifest = (JSON.parse(second.stdout) as { manifest: string }).manifest;
  assert.notEqual(firstManifest, secondManifest);

  const manifests = await listStoreProjectionManifests(storeRoot);
  const sessionPacks = manifests.filter((manifest) =>
    manifest.adapter === "hermes" &&
    manifest.projection_profile === "session_resume_v2");
  assert.equal(sessionPacks.length, 2);
  assert.deepEqual(
    sessionPacks.map((manifest) => manifest.source_checkpoint_ref).sort(),
    [openclawCheckpointRef, hermesCheckpointRef].sort(),
  );
});
