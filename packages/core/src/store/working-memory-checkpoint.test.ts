import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { SessionResumeReceipt, WorkingMemoryCheckpoint } from "../types.js";
import { validateCoreRecord } from "../validation.js";
import {
  coreRecordPath,
  initializeStore,
  loadSessionResumeReceipts,
  loadWorkingMemoryCheckpoints,
  readCoreRecord,
  writeCoreRecord,
} from "./io.js";

function checkpoint(input: {
  id: string;
  generation: number;
  status: WorkingMemoryCheckpoint["status"];
  supersedes_ref?: string | null;
  superseded_by_ref?: string | null;
}): WorkingMemoryCheckpoint {
  const record: WorkingMemoryCheckpoint = {
    id: input.id,
    kind: "working_memory_checkpoint",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: "2026-04-22T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "runtime_private",
    },
    provenance: {
      source_type: "runtime_checkpoint",
      source_ref: "session_working_memory_store_001",
      evidence_refs: ["session_working_memory_store_001", "thread_working_memory_store_001"],
      runtime_ref: "runtime_instance_working_memory_store_001",
      session_ref: "session_working_memory_store_001",
      thread_ref: "thread_working_memory_store_001",
    },
    runtime_instance_ref: "runtime_instance_working_memory_store_001",
    runtime_session_ref: "session_working_memory_store_001",
    conversation_thread_ref: "thread_working_memory_store_001",
    continuity_epoch: "epoch_working_memory_store_001",
    generation: input.generation,
    read_policy_version: "runtime_read_policy.v1",
    upstream_refs: ["session_working_memory_store_001", "thread_working_memory_store_001"],
    summary: "Checkpoint prose is operational context, not proposal evidence.",
    status: input.status,
  };
  if (input.supersedes_ref !== undefined) record.supersedes_ref = input.supersedes_ref;
  if (input.superseded_by_ref !== undefined) record.superseded_by_ref = input.superseded_by_ref;
  return record;
}

test("working memory checkpoints persist immutably under runtime working-memory", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-working-memory-"));
  await initializeStore(rootDir, "2026-04-22T00:00:00.000Z");

  const first = checkpoint({
    id: "working_memory_checkpoint_store_001",
    generation: 1,
    status: "superseded",
    superseded_by_ref: "working_memory_checkpoint_store_002",
  });
  const second = checkpoint({
    id: "working_memory_checkpoint_store_002",
    generation: 2,
    status: "active",
    supersedes_ref: first.id,
  });

  assert.deepEqual(validateCoreRecord(first), []);
  assert.deepEqual(validateCoreRecord(second), []);

  const firstPath = await writeCoreRecord(rootDir, first);
  const secondPath = await writeCoreRecord(rootDir, second);

  assert.equal(firstPath, coreRecordPath(rootDir, first));
  assert.ok(firstPath.endsWith("runtime/working-memory/checkpoints/session_working_memory_store_001/working_memory_checkpoint_store_001.json"));
  assert.ok(secondPath.endsWith("runtime/working-memory/checkpoints/session_working_memory_store_001/working_memory_checkpoint_store_002.json"));

  const loadedFirst = await readCoreRecord<WorkingMemoryCheckpoint>(firstPath);
  const checkpoints = await loadWorkingMemoryCheckpoints(rootDir);

  assert.deepEqual(loadedFirst, first);
  assert.deepEqual(checkpoints.map((item) => item.id).sort(), [first.id, second.id]);
  assert.equal(checkpoints.find((item) => item.id === first.id)?.status, "superseded");
  assert.equal(checkpoints.find((item) => item.id === second.id)?.status, "active");
});

test("session resume receipts persist under audit storage with checkpoint lineage", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-session-resume-receipt-"));
  await initializeStore(rootDir, "2026-04-22T00:00:00.000Z");

  const receipt: SessionResumeReceipt = {
    id: "session_resume_receipt_store_001",
    kind: "session_resume_receipt",
    layer: "audits",
    authoritative_home: "governance",
    created_at: "2026-04-22T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "runtime_private",
    },
    provenance: {
      source_type: "session_resume_receipt",
      source_ref: "projection_manifest_session_resume_store_001",
      evidence_refs: [
        "projection_manifest_session_resume_store_001",
        "projection_artifact_session_resume_store_001",
        "working_memory_checkpoint_store_001",
      ],
      actor_ref: "system:session_resume",
      runtime_ref: "runtime_instance_working_memory_store_001",
      session_ref: "session_working_memory_store_001",
      thread_ref: "thread_working_memory_store_001",
    },
    receipt_status: "applied",
    adapter: "openclaw",
    projection_manifest_ref: "projection_manifest_session_resume_store_001",
    projection_artifact_refs: ["projection_artifact_session_resume_store_001"],
    checkpoint_ref: "working_memory_checkpoint_store_001",
    runtime_instance_ref: "runtime_instance_working_memory_store_001",
    runtime_session_ref: "session_working_memory_store_001",
    conversation_thread_ref: "thread_working_memory_store_001",
    continuity_epoch: "epoch_working_memory_store_001",
    generation: 1,
    read_policy_version: "runtime_read_policy.v1",
    upstream_refs: [
      "projection_manifest_session_resume_store_001",
      "projection_artifact_session_resume_store_001",
      "working_memory_checkpoint_store_001",
      "session_working_memory_store_001",
      "thread_working_memory_store_001",
    ],
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:session_resume",
      system_scope: "session_resume",
    },
  };

  assert.deepEqual(validateCoreRecord(receipt), []);

  const receiptPath = await writeCoreRecord(rootDir, receipt);

  assert.equal(receiptPath, coreRecordPath(rootDir, receipt));
  assert.ok(receiptPath.endsWith("audits/session-resume-receipts/session_working_memory_store_001/session_resume_receipt_store_001.json"));

  const loadedReceipt = await readCoreRecord<SessionResumeReceipt>(receiptPath);
  const receipts = await loadSessionResumeReceipts(rootDir);

  assert.deepEqual(loadedReceipt, receipt);
  assert.deepEqual(receipts.map((item) => item.id), [receipt.id]);
});
