import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { initializeCristalinaStore } from "./bridge.js";
import { buildDefaultCristalinaConfig } from "./config.js";
import { handleRuntimeBridgeEvent, type RuntimeBridgeEvent } from "./runtime-events.js";

async function buildConfiguredStore() {
  const root = await mkdtemp(join(tmpdir(), "cristalina-runtime-events-"));
  const storeRoot = join(root, "store");
  await initializeCristalinaStore(storeRoot, "2026-04-28T12:00:00.000Z");
  const config = buildDefaultCristalinaConfig({
    storeRoot,
    ownerIdentityRef: "actor_owner_runtime_events_001",
    agentIdentityRef: "actor_agent_runtime_events_001",
    openclawRuntimeRef: "runtime_openclaw_runtime_events_001",
    hermesRuntimeRef: "runtime_hermes_runtime_events_001",
  });
  return { storeRoot, config };
}

function participantOpenClawPreference(eventId = "evt_openclaw_preference_001"): RuntimeBridgeEvent {
  return {
    event_id: eventId,
    event_type: "conversation_preference_signal",
    runtime: "openclaw",
    occurred_at: "2026-04-28T12:01:00.000Z",
    actor_ref: "actor_participant_runtime_events_001",
    authenticated_principal: {
      kind: "participant",
      actor_ref: "actor_participant_runtime_events_001",
    },
    runtime_instance_ref: "runtime_openclaw_runtime_events_001",
    statement: "The owner prefers bridge events to preserve explicit authority.",
    message: "A collaborator says the owner prefers bridge events to preserve explicit authority.",
    speaker_ref: "actor_participant_runtime_events_001",
    preference_topic_label: "Runtime Bridge Event Preferences",
  };
}

test("runtime bridge routes participant owner claims to OpenClaw review and replays idempotently", async () => {
  const { config } = await buildConfiguredStore();
  const event = participantOpenClawPreference();

  const first = await handleRuntimeBridgeEvent(config, event);
  const second = await handleRuntimeBridgeEvent(config, event);

  assert.equal(first.status, "deferred");
  assert.equal(first.pending_owner_review_count, 1);
  assert.equal(second.status, "deferred");
  assert.equal(second.pending_owner_review_count, 1);
  assert.deepEqual(second.record_refs, first.record_refs);
});

test("runtime bridge applies owner-authenticated Hermes preference through the same event contract", async () => {
  const { config } = await buildConfiguredStore();
  const result = await handleRuntimeBridgeEvent(config, {
    event_id: "evt_hermes_preference_001",
    event_type: "conversation_preference_signal",
    runtime: "hermes",
    occurred_at: "2026-04-28T12:02:00.000Z",
    actor_ref: "actor_owner_runtime_events_001",
    authenticated_principal: {
      kind: "owner",
      actor_ref: "actor_owner_runtime_events_001",
    },
    runtime_instance_ref: "runtime_hermes_runtime_events_001",
    statement: "The owner prefers Hermes and OpenClaw to share bridge semantics.",
    message: "The owner says Hermes and OpenClaw should share bridge semantics.",
    speaker_ref: "actor_owner_runtime_events_001",
    preference_topic_label: "Runtime Bridge Parity Preferences",
  });

  assert.equal(result.status, "applied");
  assert.equal(result.runtime, "hermes");
  assert.ok(result.projection_manifest_ref);
  assert.equal(result.pending_owner_review_count, 0);
});

test("runtime bridge records runtime ref drift as diagnostic-only intake", async () => {
  const { config } = await buildConfiguredStore();
  const result = await handleRuntimeBridgeEvent(config, {
    ...participantOpenClawPreference("evt_openclaw_drift_001"),
    runtime_instance_ref: "runtime_openclaw_unconfigured_001",
  });

  assert.equal(result.status, "diagnostic_recorded");
  assert.equal(result.pending_owner_review_count, 0);
  assert.ok(result.diagnostics[0]!.includes("declared runtime_instance_ref"));
});

test("runtime bridge compiles cross-runtime session resume pack from checkpoint", async () => {
  const { config } = await buildConfiguredStore();
  const checkpoint = await handleRuntimeBridgeEvent(config, {
    event_id: "evt_openclaw_checkpoint_001",
    event_type: "checkpoint_requested",
    runtime: "openclaw",
    occurred_at: "2026-04-28T12:03:00.000Z",
    actor_ref: "system:runtime-events-checkpoint",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:runtime-events-checkpoint",
      system_scope: "runtime-events",
    },
    runtime_instance_ref: "runtime_openclaw_runtime_events_001",
  });
  assert.equal(checkpoint.status, "applied");
  assert.match(checkpoint.record_refs[0]!, /^wmc_openclaw_/);

  const resume = await handleRuntimeBridgeEvent(config, {
    event_id: "evt_hermes_resume_001",
    event_type: "session_resume_requested",
    runtime: "hermes",
    occurred_at: "2026-04-28T12:04:00.000Z",
    actor_ref: "system:runtime-events-resume",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:runtime-events-resume",
      system_scope: "runtime-events",
    },
    runtime_instance_ref: "runtime_hermes_runtime_events_001",
  });

  assert.equal(resume.status, "applied");
  assert.match(resume.projection_manifest_ref!, /^pmf_session_resume_hermes_/);
  assert.ok(resume.record_refs.some((ref) => ref.startsWith("session_resume_receipt_")));
});

test("runtime bridge rejects ambiguous session resume checkpoints unless checkpoint_id is explicit", async () => {
  const { config } = await buildConfiguredStore();
  const openclawCheckpoint = await handleRuntimeBridgeEvent(config, {
    event_id: "evt_openclaw_checkpoint_ambiguous_001",
    event_type: "checkpoint_requested",
    runtime: "openclaw",
    occurred_at: "2026-04-28T12:05:00.000Z",
    actor_ref: "system:runtime-events-checkpoint",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:runtime-events-checkpoint",
      system_scope: "runtime-events",
    },
    runtime_instance_ref: "runtime_openclaw_runtime_events_001",
  });
  await handleRuntimeBridgeEvent(config, {
    event_id: "evt_hermes_checkpoint_ambiguous_001",
    event_type: "checkpoint_requested",
    runtime: "hermes",
    occurred_at: "2026-04-28T12:06:00.000Z",
    actor_ref: "system:runtime-events-checkpoint",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:runtime-events-checkpoint",
      system_scope: "runtime-events",
    },
    runtime_instance_ref: "runtime_hermes_runtime_events_001",
  });

  await assert.rejects(
    handleRuntimeBridgeEvent(config, {
      event_id: "evt_hermes_resume_ambiguous_001",
      event_type: "session_resume_requested",
      runtime: "hermes",
      occurred_at: "2026-04-28T12:07:00.000Z",
      actor_ref: "system:runtime-events-resume",
      authenticated_principal: {
        kind: "system",
        actor_ref: "system:runtime-events-resume",
        system_scope: "runtime-events",
      },
      runtime_instance_ref: "runtime_hermes_runtime_events_001",
    }),
    /multiple active checkpoints match/,
  );

  const resume = await handleRuntimeBridgeEvent(config, {
    event_id: "evt_hermes_resume_explicit_001",
    event_type: "session_resume_requested",
    runtime: "hermes",
    occurred_at: "2026-04-28T12:08:00.000Z",
    actor_ref: "system:runtime-events-resume",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:runtime-events-resume",
      system_scope: "runtime-events",
    },
    runtime_instance_ref: "runtime_hermes_runtime_events_001",
    checkpoint_id: openclawCheckpoint.record_refs[0],
  });
  assert.equal(resume.status, "applied");
  assert.match(resume.projection_manifest_ref!, /^pmf_session_resume_hermes_/);
});
