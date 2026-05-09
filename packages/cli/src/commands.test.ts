import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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

test("update reapplies a registered Hermes installation without source update", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-update-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, ".cristalina-v4", "config.json");
  const runtimeRoot = join(root, "hermes");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await mkdir(join(root, ".cristalina-v4"), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_update_001",
      agentIdentityRef: "actor_agent_cli_update_001",
      hermesRuntimeRef: "runtime_hermes_cli_update_001",
    }), null, 2)}\n`,
  );

  const first = await executeCristalinaCommand({
    name: "update",
    configPath,
    runtime: "hermes",
    runtimeRoot,
    integrationMode: "provider",
    skipSourceUpdate: true,
    skipBuild: true,
  });
  const firstPayload = JSON.parse(first.stdout) as {
    status: string;
    source_update: { skipped: boolean };
    installations: Array<{ runtime: string; runtime_root: string }>;
  };
  assert.equal(first.exitCode, 0);
  assert.equal(firstPayload.status, "updated");
  assert.equal(firstPayload.source_update.skipped, true);
  assert.equal(firstPayload.installations[0]?.runtime, "hermes");
  assert.equal(firstPayload.installations[0]?.runtime_root, runtimeRoot);

  const second = await executeCristalinaCommand({
    name: "update",
    configPath,
    skipSourceUpdate: true,
    skipBuild: true,
  });
  const secondPayload = JSON.parse(second.stdout) as {
    installations: Array<{ runtime: string; runtime_root: string }>;
  };
  assert.equal(second.exitCode, 0);
  assert.equal(secondPayload.installations[0]?.runtime, "hermes");
  assert.equal(secondPayload.installations[0]?.runtime_root, runtimeRoot);
  assert.match(await readFile(join(runtimeRoot, "scripts", "cristalina-memory-maturation.sh"), "utf8"), /CRISTALINA_MEMORY_MATURATION_LLM_OUTPUT/);
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

test("runtime event-check rejects mismatched declared event principal", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-runtime-event-principal-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  const eventPath = join(root, "hermes-event.json");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_event_principal_001",
      agentIdentityRef: "actor_agent_cli_event_principal_001",
      hermesRuntimeRef: "runtime_hermes_cli_event_principal_001",
    }), null, 2)}\n`,
  );
  await writeFile(
    eventPath,
    `${JSON.stringify({
      event_id: "evt_cli_runtime_event_principal_001",
      event_type: "runtime_diagnostic",
      runtime: "hermes",
      occurred_at: "2026-04-28T20:05:00.000Z",
      actor_ref: "system:hermes-event-check",
      authenticated_principal: {
        kind: "owner",
        actor_ref: "actor_owner_cli_event_principal_001",
      },
      runtime_instance_ref: "runtime_hermes_cli_event_principal_001",
      code: "event_check_principal",
      severity: "info",
      message: "This event intentionally mismatches actor_ref and declared principal.",
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
  assert.ok(payload.diagnostics.some((entry) => entry.includes("authenticated_principal.actor_ref")));
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
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-consolidation-override-"));
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
    principalKind: "participant",
    principalActorRef: "actor_participant_cli_review_001",
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
    statement: "The owner prefers consolidation apply to respect explicit store roots.",
    message: "A collaborator says consolidation apply should respect explicit store roots.",
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

test("bridge event treats deferred consolidation as successful event processing", async () => {
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
      principalKind: "participant",
      principalActorRef: "actor_participant_cli_bridge_deferred_001",
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

test("bridge event validates event contract before writing memory", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-bridge-invalid-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  const eventPath = join(root, "event.json");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_bridge_invalid_001",
      agentIdentityRef: "actor_agent_cli_bridge_invalid_001",
      openclawRuntimeRef: "runtime_openclaw_cli_bridge_invalid_001",
      hermesRuntimeRef: "runtime_hermes_cli_bridge_invalid_001",
    }), null, 2)}\n`,
  );
  await writeFile(
    eventPath,
    `${JSON.stringify({
      event_id: "evt_cli_bridge_invalid_001",
      event_type: "runtime_diagnostic",
      runtime: "openclaw",
      occurred_at: "not-a-date",
      actor_ref: "system:bridge-invalid",
      authenticated_principal: {
        kind: "system",
        actor_ref: "system:bridge-invalid",
        system_scope: "bridge-invalid",
      },
      runtime_instance_ref: "runtime_openclaw_cli_bridge_invalid_001",
      code: "bridge_invalid",
      severity: "info",
      message: "This event must fail validation before store writes.",
      message_refs: ["ok", ""],
    }, null, 2)}\n`,
  );

  const result = await executeCristalinaCommand({
    name: "bridge",
    action: "event",
    configPath,
    eventPath,
  });
  const payload = JSON.parse(result.stdout) as { validation: { status: string }; diagnostics: string[] };
  const inspection = await inspectCristalinaStore(storeRoot);
  assert.equal(result.exitCode, 1);
  assert.equal(payload.validation.status, "invalid");
  assert.ok(payload.diagnostics.some((entry) => entry.includes("occurred_at")));
  assert.ok(payload.diagnostics.some((entry) => entry.includes("message_refs")));
  assert.equal(inspection.diagnostic_count, 0);
});

test("memory consolidation classifies runtime observations without promoting canon or wiki", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-memory-consolidation-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_memory_consolidation_001",
      agentIdentityRef: "actor_agent_cli_memory_consolidation_001",
      hermesRuntimeRef: "runtime_hermes_cli_memory_consolidation_001",
    }), null, 2)}\n`,
  );

  await handleRuntimeBridgeEvent(buildDefaultCristalinaConfig({
    storeRoot,
    ownerIdentityRef: "actor_owner_cli_memory_consolidation_001",
    agentIdentityRef: "actor_agent_cli_memory_consolidation_001",
    hermesRuntimeRef: "runtime_hermes_cli_memory_consolidation_001",
  }), {
    event_id: "evt_cli_memory_consolidation_observed_001",
    event_type: "message_observed",
    runtime: "hermes",
    occurred_at: "2026-05-05T12:00:00.000Z",
    actor_ref: "system:hermes-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:hermes-test",
      system_scope: "memory-consolidation-test",
    },
    runtime_instance_ref: "runtime_hermes_cli_memory_consolidation_001",
    runtime_session_ref: "session_memory_consolidation_test",
    conversation_thread_ref: "thread_memory_consolidation_test",
    source_ref: "runtime/hermes/test/evt_cli_memory_consolidation_observed_001",
    message: "Markus asked to save an operator note about agent memory research.",
  });
  await handleRuntimeBridgeEvent(buildDefaultCristalinaConfig({
    storeRoot,
    ownerIdentityRef: "actor_owner_cli_memory_consolidation_001",
    agentIdentityRef: "actor_agent_cli_memory_consolidation_001",
    hermesRuntimeRef: "runtime_hermes_cli_memory_consolidation_001",
  }), {
    event_id: "evt_cli_memory_consolidation_observed_002",
    event_type: "message_observed",
    runtime: "hermes",
    occurred_at: "2026-05-05T12:01:00.000Z",
    actor_ref: "system:hermes-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:hermes-test",
      system_scope: "memory-consolidation-test",
    },
    runtime_instance_ref: "runtime_hermes_cli_memory_consolidation_001",
    runtime_session_ref: "session_memory_consolidation_test",
    conversation_thread_ref: "thread_memory_consolidation_test",
    source_ref: "runtime/hermes/test/evt_cli_memory_consolidation_observed_002",
    message: "Research heartbeat saw https://x.com/example/status/1 twice in memory posts.",
  });

  const result = await executeCristalinaCommand({
    name: "memory",
    action: "consolidation",
    configPath,
    runtime: "hermes",
    runtimeSessionRef: "session_memory_consolidation_test",
    conversationThreadRef: "thread_memory_consolidation_test",
    maxRecentEvents: 10,
    write: true,
  });
  const payload = JSON.parse(result.stdout) as {
    status: string;
    event: { event_type: string };
    consolidation: {
      counts: { recent_observations_consolidated: number; proposals: number; wiki_pages: number; canon_records: number };
      suggested_route_counts: { candidate_operator_review: number; candidate_research_synthesis: number };
    };
    bridge_result: { status: string; record_refs: string[] };
  };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.status, "applied");
  assert.equal(payload.event.event_type, "memory_consolidation");
  assert.equal(payload.consolidation.counts.recent_observations_consolidated, 2);
  assert.equal(payload.consolidation.counts.proposals, 0);
  assert.equal(payload.consolidation.counts.wiki_pages, 0);
  assert.equal(payload.consolidation.counts.canon_records, 0);
  assert.equal(payload.consolidation.suggested_route_counts.candidate_operator_review, 1);
  assert.equal(payload.consolidation.suggested_route_counts.candidate_research_synthesis, 1);
  assert.equal(payload.bridge_result.status, "applied");
  assert.ok(payload.bridge_result.record_refs.some((ref) => ref.startsWith("obs_hermes_memory_consolidation_")));
  assert.equal((await readdir(join(storeRoot, "governance", "proposals"))).length, 0);
  assert.equal((await readdir(join(storeRoot, "wiki", "pages"))).length, 0);
});

test("memory mature turns consolidated evidence into governed structured memory claims", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-memory-mature-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  const llmOutputPath = join(root, "maturation-output.json");
  const config = buildDefaultCristalinaConfig({
    storeRoot,
    ownerIdentityRef: "actor_owner_cli_memory_mature_001",
    agentIdentityRef: "actor_agent_cli_memory_mature_001",
    hermesRuntimeRef: "runtime_hermes_cli_memory_mature_001",
  });
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  await handleRuntimeBridgeEvent(config, {
    event_id: "evt_cli_memory_mature_observed_001",
    event_type: "message_observed",
    runtime: "hermes",
    occurred_at: "2026-05-05T12:00:00.000Z",
    actor_ref: "system:hermes-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:hermes-test",
      system_scope: "memory-mature-test",
    },
    runtime_instance_ref: "runtime_hermes_cli_memory_mature_001",
    runtime_session_ref: "session_memory_mature_test",
    conversation_thread_ref: "thread_memory_mature_test",
    source_ref: "runtime/hermes/test/evt_cli_memory_mature_observed_001",
    message: "Technical memory research repeatedly describes recognition before hydration as a useful agent memory pattern.",
  });

  await executeCristalinaCommand({
    name: "memory",
    action: "consolidation",
    configPath,
    runtime: "hermes",
    runtimeSessionRef: "session_memory_mature_test",
    conversationThreadRef: "thread_memory_mature_test",
    maxRecentEvents: 10,
    write: true,
  });

  await assert.rejects(
    () => executeCristalinaCommand({
      name: "memory",
      action: "mature",
      configPath,
      runtime: "hermes",
      write: true,
      maxItems: 5,
    }),
    /requires --llm-output/,
  );

  const evidenceOutputPath = join(root, "maturation-evidence.json");
  const evidenceResult = await executeCristalinaCommand({
    name: "memory",
    action: "mature",
    configPath,
    runtime: "hermes",
    maxItems: 5,
    evidenceOutputPath,
  });
  assert.equal(evidenceResult.exitCode, 0);
  const evidencePayload = JSON.parse(await readFile(evidenceOutputPath, "utf8")) as {
    evidence: { selected_items: unknown[] };
    prompt: string;
  };
  assert.equal(evidencePayload.evidence.selected_items.length, 1);
  assert.match(evidencePayload.prompt, /source-neutral semantic maturation compiler/);

  await writeFile(
    llmOutputPath,
    `${JSON.stringify({
      candidates: [
        {
          statement: "Recognition before hydration is a recurring technical pattern for agent memory retrieval.",
          memory_kind: "fact",
          epistemic_state: "confirmed",
          semantic_slot: "technical-pattern:agent-memory:recognition-before-hydration",
          subject_authority_role: "external",
          confidence: "high",
          risk: "low",
          support_refs: ["obs_hermes_evt_cli_memory_mature_observed_001"],
          recommended_dispositions: ["world_update", "wiki_update", "proposal_for_canon"],
          rationale: "The claim is technical, non-owner-scoped, and supported by runtime evidence.",
          wiki_title: "Agent Memory Retrieval Patterns",
        },
        {
          statement: "Recognition-first retrieval should normally precede heavy hydration in agent memory systems.",
          memory_kind: "fact",
          epistemic_state: "confirmed",
          semantic_slot: "technical-pattern:agent-memory:recognition-before-hydration",
          subject_authority_role: "external",
          confidence: "high",
          risk: "low",
          support_refs: ["obs_hermes_evt_cli_memory_mature_observed_001"],
          recommended_dispositions: ["world_update", "wiki_update", "proposal_for_canon"],
          rationale: "This duplicate slot must see canon created earlier in the same maturation run and avoid a second active canonical fact.",
          wiki_title: "Agent Memory Retrieval Patterns",
        },
        {
          statement: "Markus may prefer recognition before hydration as a Cristalina memory direction.",
          memory_kind: "preference",
          epistemic_state: "inferred",
          semantic_slot: "preference:owner:memory-direction:recognition-before-hydration",
          subject_authority_role: "owner",
          confidence: "high",
          risk: "medium",
          support_refs: ["obs_hermes_evt_cli_memory_mature_observed_001"],
          recommended_dispositions: ["world_update", "wiki_update", "proposal_for_canon", "diagnostic_only"],
          rationale: "The candidate is owner-scoped, so it must be staged for owner review instead of automatic canon.",
          wiki_title: "Owner Memory Direction Signals",
        },
      ],
    }, null, 2)}\n`,
  );

  const result = await executeCristalinaCommand({
    name: "memory",
    action: "mature",
    configPath,
    runtime: "hermes",
    write: true,
    maxItems: 5,
    llmOutputPath,
  });
  const payload = JSON.parse(result.stdout) as {
    status: string;
    maturation: { diagnostics: string[]; candidates: unknown[] };
    applied: { canonical_record_refs: string[]; record_refs: string[]; diagnostic_refs: string[] };
  };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.status, "applied");
  assert.deepEqual(payload.maturation.diagnostics, []);
  assert.equal(payload.maturation.candidates.length, 3);
  assert.equal(payload.applied.canonical_record_refs.length, 1);
  assert.ok(payload.applied.record_refs.some((ref) => ref.startsWith("wcl_")));
  assert.ok(payload.applied.record_refs.some((ref) => ref.startsWith("wclm_")));
  assert.ok(payload.applied.record_refs.some((ref) => ref.startsWith("prop_")));
  assert.ok(payload.applied.diagnostic_refs.some((ref) => ref.startsWith("diag_eval_")));
  assert.ok(payload.applied.diagnostic_refs.some((ref) => ref.startsWith("diag_candidate_")));
  assert.equal((await readdir(join(storeRoot, "governance", "curation"))).length, 1);
  assert.equal((await readdir(join(storeRoot, "canon", "facts"))).length, 1);
  assert.equal((await readdir(join(storeRoot, "canon", "preferences"))).length, 0);
  assert.equal((await readdir(join(storeRoot, "wiki", "pages"))).length, 2);
  assert.equal((await readdir(join(storeRoot, "wiki", "claims"))).length, 3);
  assert.equal((await readdir(join(storeRoot, "audits", "diagnostics"))).length, 3);

  const rerun = await executeCristalinaCommand({
    name: "memory",
    action: "mature",
    configPath,
    runtime: "hermes",
    write: true,
    maxItems: 5,
    llmOutputPath,
  });
  const rerunPayload = JSON.parse(rerun.stdout) as {
    status: string;
    applied: { canonical_record_refs: string[]; queued_review_refs: string[]; diagnostic_refs: string[] };
  };
  assert.equal(rerun.exitCode, 0);
  assert.equal(rerunPayload.status, "applied");
  assert.deepEqual(rerunPayload.applied.canonical_record_refs, []);
  assert.deepEqual(rerunPayload.applied.queued_review_refs, []);
  assert.deepEqual(rerunPayload.applied.diagnostic_refs, []);
  assert.equal((await readdir(join(storeRoot, "governance", "curation"))).length, 1);
  assert.equal((await readdir(join(storeRoot, "canon", "facts"))).length, 1);
  assert.equal((await readdir(join(storeRoot, "wiki", "claims"))).length, 3);
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

test("session-pack verify-handoff proves OpenClaw checkpoint to Hermes resume receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-session-handoff-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_session_handoff_001",
      agentIdentityRef: "actor_agent_cli_session_handoff_001",
      openclawRuntimeRef: "runtime_openclaw_cli_session_handoff_001",
      hermesRuntimeRef: "runtime_hermes_cli_session_handoff_001",
    }), null, 2)}\n`,
  );

  const result = await executeCristalinaCommand({
    name: "session-pack",
    action: "verify-handoff",
    configPath,
    createCheckpoint: true,
  });
  const payload = JSON.parse(result.stdout) as {
    status: string;
    source_runtime: string;
    target_runtime: string;
    checkpoint_ref: string;
    session_pack_manifest: {
      id: string;
      adapter: string;
      projection_profile: string;
      snapshot_strategy: string;
      source_checkpoint_ref: string;
      runtime_instance_ref: string;
      artifact_refs: string[];
    };
    resume_receipt: {
      receipt_status: string;
      adapter: string;
      projection_manifest_ref: string;
      checkpoint_ref: string;
      runtime_instance_ref: string;
      projection_artifact_refs: string[];
    };
    diagnostics: string[];
  };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.status, "verified");
  assert.equal(payload.source_runtime, "openclaw");
  assert.equal(payload.target_runtime, "hermes");
  assert.equal(payload.session_pack_manifest.adapter, "hermes");
  assert.equal(payload.session_pack_manifest.projection_profile, "session_resume_v2");
  assert.equal(payload.session_pack_manifest.snapshot_strategy, "checkpoint_consistent");
  assert.equal(payload.session_pack_manifest.source_checkpoint_ref, payload.checkpoint_ref);
  assert.equal(payload.session_pack_manifest.runtime_instance_ref, "runtime_openclaw_cli_session_handoff_001");
  assert.ok(payload.session_pack_manifest.artifact_refs.length > 0);
  assert.equal(payload.resume_receipt.receipt_status, "consumed");
  assert.equal(payload.resume_receipt.adapter, "hermes");
  assert.equal(payload.resume_receipt.projection_manifest_ref, payload.session_pack_manifest.id);
  assert.equal(payload.resume_receipt.checkpoint_ref, payload.checkpoint_ref);
  assert.equal(payload.resume_receipt.runtime_instance_ref, "runtime_openclaw_cli_session_handoff_001");
  assert.ok(payload.resume_receipt.projection_artifact_refs.length > 0);
  assert.deepEqual(payload.diagnostics, []);
});

test("session-pack verify-handoff requires an explicit checkpoint source", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-cli-session-handoff-blocked-"));
  const storeRoot = join(root, "store");
  const configPath = join(root, "config.json");
  await executeCristalinaCommand({ name: "init", storeRoot });
  await writeFile(
    configPath,
    `${JSON.stringify(buildDefaultCristalinaConfig({
      storeRoot,
      ownerIdentityRef: "actor_owner_cli_session_handoff_blocked_001",
      agentIdentityRef: "actor_agent_cli_session_handoff_blocked_001",
      openclawRuntimeRef: "runtime_openclaw_cli_session_handoff_blocked_001",
      hermesRuntimeRef: "runtime_hermes_cli_session_handoff_blocked_001",
    }), null, 2)}\n`,
  );

  const result = await executeCristalinaCommand({
    name: "session-pack",
    action: "verify-handoff",
    configPath,
  });
  const payload = JSON.parse(result.stdout) as { status: string; diagnostics: string[] };
  const inspection = await inspectCristalinaStore(storeRoot);
  assert.equal(result.exitCode, 1);
  assert.equal(payload.status, "blocked");
  assert.ok(payload.diagnostics.some((entry) => entry.includes("--checkpoint-id")));
  assert.equal(inspection.working_memory_checkpoint_count, 0);
  assert.equal(inspection.session_resume_receipt_count, 0);
});
