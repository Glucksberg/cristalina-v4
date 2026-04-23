import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeInstance, RuntimeSession, ConversationThread, WorkingMemoryCheckpoint } from "../types.js";
import { validateCoreRecord } from "../validation.js";
import { compileSessionPack, recordSessionResumeReceipt } from "./session-pack.js";

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
  assert.equal(compiled.manifest.compiler_version, "session_resume_v2.compiler.v1");
  assert.equal(compiled.manifest.source_checkpoint_ref, activeCheckpoint.id);
  assert.equal(compiled.manifest.continuity_epoch, activeCheckpoint.continuity_epoch);
  assert.equal(compiled.manifest.generation, activeCheckpoint.generation);
  assert.equal(compiled.manifest.snapshot_strategy, "checkpoint_consistent");
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

  const receipt = recordSessionResumeReceipt({
    id: "session_resume_receipt_consumed_001",
    now,
    receipt_status: "consumed",
    adapter: "openclaw",
    manifest: compiled.manifest,
    checkpoint: activeCheckpoint,
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:session_resume",
      system_scope: "session_resume",
    },
  });

  assert.deepEqual(validateCoreRecord(receipt), []);
  assert.equal(receipt.layer, "audits");
  assert.equal(receipt.authoritative_home, "governance");
  assert.equal(
    receipt.receipt_key,
    "session_resume_receipt_consumed_openclaw_projection_manifest_session_resume_001_working_memory_checkpoint_session_pack_001_epoch_session_pack_001_g1",
  );
  assert.equal(receipt.compiler_version, "session_resume_v2.compiler.v1");
  assert.equal(receipt.policy_snapshot_ref, null);
  assert.equal(receipt.projection_manifest_ref, compiled.manifest.id);
  assert.deepEqual(receipt.projection_artifact_refs, [compiled.artifact.id]);
  assert.equal(receipt.checkpoint_ref, activeCheckpoint.id);
  assert.ok(receipt.upstream_refs.includes(compiled.manifest.id));
  assert.ok(receipt.upstream_refs.includes(compiled.artifact.id));
  assert.ok(receipt.upstream_refs.includes(activeCheckpoint.id));
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

test("session resume receipts reject manifests outside the session resume contract", () => {
  const session = runtimeSession();
  const thread = conversationThread();
  const activeCheckpoint = checkpoint();
  const compiled = compileSessionPack({
    id: "projection_manifest_session_resume_receipt_reject_001",
    artifact_id: "projection_artifact_session_resume_receipt_reject_001",
    now,
    adapter: "hermes",
    checkpoint: activeCheckpoint,
    upstream_records: [session, thread],
    continuity_epoch: "epoch_session_pack_001",
    generation: 1,
    read_policy_version: "runtime_read_policy.v1",
    audience: "runtime_resume",
  });

  assert.throws(
    () =>
      recordSessionResumeReceipt({
        id: "session_resume_receipt_bad_profile_001",
        now,
        receipt_status: "applied",
        adapter: "hermes",
        manifest: {
          ...compiled.manifest,
          projection_profile: "openclaw_runtime_v1",
        },
        checkpoint: activeCheckpoint,
        authenticated_principal: {
          kind: "system",
          actor_ref: "system:session_resume",
          system_scope: "session_resume",
        },
      }),
    /session_resume_v2/,
  );

  assert.throws(
    () =>
      recordSessionResumeReceipt({
        id: "session_resume_receipt_bad_policy_001",
        now,
        receipt_status: "applied",
        adapter: "hermes",
        manifest: {
          ...compiled.manifest,
          read_policy_version: "other_policy",
        },
        checkpoint: activeCheckpoint,
        authenticated_principal: {
          kind: "system",
          actor_ref: "system:session_resume",
          system_scope: "session_resume",
        },
      }),
    /read policy mismatch/,
  );

  assert.throws(
    () =>
      recordSessionResumeReceipt({
        now,
        receipt_status: "applied",
        adapter: "hermes",
        manifest: {
          ...compiled.manifest,
          policy_snapshot_ref: "policy_snapshot_other_001",
        },
        checkpoint: {
          ...activeCheckpoint,
          policy_snapshot_ref: "policy_snapshot_session_pack_001",
        },
        authenticated_principal: {
          kind: "system",
          actor_ref: "system:session_resume",
          system_scope: "session_resume",
        },
      }),
    /policy snapshot mismatch/,
  );

  assert.throws(
    () =>
      recordSessionResumeReceipt({
        now,
        receipt_status: "applied",
        adapter: "hermes",
        manifest: {
          ...compiled.manifest,
          snapshot_strategy: "mixed_state_tolerant",
        },
        checkpoint: activeCheckpoint,
        authenticated_principal: {
          kind: "system",
          actor_ref: "system:session_resume",
          system_scope: "session_resume",
        },
      }),
    /checkpoint_consistent/,
  );

  assert.throws(
    () =>
      recordSessionResumeReceipt({
        now,
        receipt_status: "applied",
        adapter: "hermes",
        manifest: compiled.manifest,
        checkpoint: activeCheckpoint,
        authenticated_principal: {
          kind: "system",
          actor_ref: "",
          system_scope: "session_resume",
        },
      }),
    /authenticated_principal with actor_ref/,
  );
});

test("session resume receipts default to a deterministic id and preserve policy snapshot refs", () => {
  const session = runtimeSession();
  const thread = conversationThread();
  const activeCheckpoint = {
    ...checkpoint(),
    policy_snapshot_ref: "policy_snapshot_session_pack_001",
  };
  const compiled = compileSessionPack({
    id: "projection_manifest_session_resume_deterministic_001",
    artifact_id: "projection_artifact_session_resume_deterministic_001",
    now,
    adapter: "openclaw",
    checkpoint: activeCheckpoint,
    upstream_records: [session, thread],
    continuity_epoch: "epoch_session_pack_001",
    generation: 1,
    read_policy_version: "runtime_read_policy.v1",
    audience: "runtime_resume",
    policy_snapshot_ref: "policy_snapshot_session_pack_001",
  });

  const receipt = recordSessionResumeReceipt({
    now,
    receipt_status: "applied",
    adapter: "openclaw",
    manifest: compiled.manifest,
    checkpoint: activeCheckpoint,
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:session_resume",
      system_scope: "session_resume",
    },
  });

  assert.equal(receipt.id, receipt.receipt_key);
  assert.equal(receipt.policy_snapshot_ref, "policy_snapshot_session_pack_001");
});
