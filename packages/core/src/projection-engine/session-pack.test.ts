import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeInstance, RuntimeSession, ConversationThread, WorkingMemoryCheckpoint } from "../types.js";
import { validateCoreRecord } from "../validation.js";
import { compileSessionPack } from "./session-pack.js";

const now = "2026-04-22T00:00:00.000Z";

function runtimeInstance(): RuntimeInstance {
  return {
    id: "runtime_instance_session_pack_001",
    kind: "runtime_instance",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: now,
    visibility_state: {
      privacy_scope: "runtime_private",
    },
    provenance: {
      source_type: "session_pack_fixture",
      source_ref: "runtime_instance_session_pack_001",
    },
    runtime: "openclaw",
    agent_identity_ref: "actor_agent_session_pack_001",
    status: "active",
  };
}

function runtimeSession(): RuntimeSession {
  return {
    id: "session_session_pack_001",
    kind: "runtime_session",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: now,
    visibility_state: {
      privacy_scope: "runtime_private",
    },
    provenance: {
      source_type: "session_pack_fixture",
      source_ref: "session_session_pack_001",
    },
    runtime_instance_ref: "runtime_instance_session_pack_001",
    status: "active",
    summary: "Runtime summary is operational prose.",
  };
}

function conversationThread(): ConversationThread {
  return {
    id: "thread_session_pack_001",
    kind: "conversation_thread",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: now,
    visibility_state: {
      privacy_scope: "runtime_private",
    },
    provenance: {
      source_type: "session_pack_fixture",
      source_ref: "thread_session_pack_001",
    },
    runtime: "openclaw",
    runtime_instance_ref: "runtime_instance_session_pack_001",
    runtime_session_ref: "session_session_pack_001",
    message_refs: ["message_session_pack_001"],
    summary: "Thread summary is not proposal evidence.",
  };
}

function checkpoint(status: WorkingMemoryCheckpoint["status"] = "active"): WorkingMemoryCheckpoint {
  return {
    id: "working_memory_checkpoint_session_pack_001",
    kind: "working_memory_checkpoint",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: now,
    visibility_state: {
      privacy_scope: "runtime_private",
    },
    provenance: {
      source_type: "runtime_checkpoint",
      source_ref: "session_session_pack_001",
      evidence_refs: ["session_session_pack_001", "thread_session_pack_001"],
    },
    runtime_instance_ref: "runtime_instance_session_pack_001",
    runtime_session_ref: "session_session_pack_001",
    conversation_thread_ref: "thread_session_pack_001",
    continuity_epoch: "epoch_session_pack_001",
    generation: 1,
    read_policy_version: "runtime_read_policy.v1",
    upstream_refs: ["session_session_pack_001", "thread_session_pack_001"],
    summary: "Continue from upstream refs only.",
    status,
  };
}

test("session pack compilation emits derived projection artifacts from an active checkpoint", () => {
  const instance = runtimeInstance();
  const session = runtimeSession();
  const thread = conversationThread();
  const activeCheckpoint = checkpoint();
  const compiled = compileSessionPack({
    id: "projection_manifest_session_resume_001",
    artifact_id: "projection_artifact_session_resume_001",
    now,
    adapter: "openclaw",
    checkpoint: activeCheckpoint,
    upstream_records: [session, thread],
    continuity_epoch: "epoch_session_pack_001",
    generation: 1,
    read_policy_version: "runtime_read_policy.v1",
    audience: "runtime_resume",
  });

  assert.deepEqual(validateCoreRecord(instance), []);
  assert.deepEqual(validateCoreRecord(session), []);
  assert.deepEqual(validateCoreRecord(thread), []);
  assert.deepEqual(validateCoreRecord(activeCheckpoint), []);
  assert.deepEqual(validateCoreRecord(compiled.artifact), []);
  assert.deepEqual(validateCoreRecord(compiled.manifest), []);
  assert.equal(compiled.artifact.layer, "derived");
  assert.equal(compiled.artifact.authoritative_home, "runtime");
  assert.equal(compiled.artifact.artifact_kind, "session_resume_markdown");
  assert.equal(compiled.artifact.path, "derived/openclaw/session-packs/session_session_pack_001/projection_artifact_session_resume_001.md");
  assert.equal(compiled.manifest.projection_profile, "session_resume_v2");
  assert.equal(compiled.manifest.runtime_session_ref, activeCheckpoint.runtime_session_ref);
  assert.deepEqual(compiled.manifest.artifact_refs, [compiled.artifact.id]);
  assert.deepEqual(compiled.manifest.context_refs, [
    activeCheckpoint.runtime_instance_ref,
    activeCheckpoint.runtime_session_ref,
    activeCheckpoint.conversation_thread_ref,
  ]);
  assert.ok(compiled.manifest.upstream_refs.includes(activeCheckpoint.id));
  assert.ok(compiled.manifest.upstream_refs.includes(session.id));
  assert.match(compiled.artifact_contents[compiled.artifact.path] ?? "", /derived resume context only/);
});

test("session pack compilation rejects stale checkpoints and unresolved upstream refs", () => {
  const session = runtimeSession();
  const thread = conversationThread();

  assert.throws(
    () => compileSessionPack({
      id: "projection_manifest_session_resume_stale_001",
      artifact_id: "projection_artifact_session_resume_stale_001",
      now,
      adapter: "hermes",
      checkpoint: checkpoint("superseded"),
      upstream_records: [session, thread],
      continuity_epoch: "epoch_session_pack_001",
      generation: 1,
      read_policy_version: "runtime_read_policy.v1",
      audience: "runtime_resume",
    }),
    /active checkpoint/,
  );

  assert.throws(
    () => compileSessionPack({
      id: "projection_manifest_session_resume_missing_001",
      artifact_id: "projection_artifact_session_resume_missing_001",
      now,
      adapter: "hermes",
      checkpoint: checkpoint(),
      upstream_records: [session],
      continuity_epoch: "epoch_session_pack_001",
      generation: 1,
      read_policy_version: "runtime_read_policy.v1",
      audience: "runtime_resume",
    }),
    /missing upstream ref/,
  );

  assert.throws(
    () => compileSessionPack({
      id: "projection_manifest_session_resume_generation_001",
      artifact_id: "projection_artifact_session_resume_generation_001",
      now,
      adapter: "hermes",
      checkpoint: checkpoint(),
      upstream_records: [session, thread],
      continuity_epoch: "epoch_session_pack_001",
      generation: 2,
      read_policy_version: "runtime_read_policy.v1",
      audience: "runtime_resume",
    }),
    /generation mismatch/,
  );
});
