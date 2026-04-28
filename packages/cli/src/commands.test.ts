import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectCristalinaStore, loadLatestWorkingMemoryCheckpoint } from "@cristalina-v4/core";
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
