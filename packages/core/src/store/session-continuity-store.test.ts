import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  compileSessionPackToStore,
  createWorkingMemoryCheckpointToStore,
} from "../session-continuity-store.js";
import {
  initializeStore,
  loadProjectionManifests,
  loadWorkingMemoryCheckpoints,
} from "./io.js";

function checkpointInput(rootDir: string, id: string, overrides: {
  now?: string;
  runtime_instance_ref?: string;
  runtime_session_ref?: string;
  conversation_thread_ref?: string;
  continuity_epoch?: string;
} = {}) {
  return {
    rootDir,
    id,
    now: overrides.now ?? "2026-04-28T12:00:00.000Z",
    runtime_instance_ref: overrides.runtime_instance_ref ?? "runtime_session_continuity_001",
    runtime_session_ref: overrides.runtime_session_ref ?? "session_session_continuity_001",
    conversation_thread_ref: overrides.conversation_thread_ref ?? "thread_session_continuity_001",
    continuity_epoch: overrides.continuity_epoch ?? "epoch_session_continuity_001",
    generation: 1,
    read_policy_version: "projection-read-v2",
    summary: "Session continuity test checkpoint.",
  };
}

test("working memory checkpoint creation serializes active generation updates", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-session-continuity-"));
  await initializeStore(rootDir);

  await Promise.all([
    createWorkingMemoryCheckpointToStore(checkpointInput(rootDir, "wmc_session_continuity_concurrent_001")),
    createWorkingMemoryCheckpointToStore(checkpointInput(rootDir, "wmc_session_continuity_concurrent_002", {
      now: "2026-04-28T12:00:01.000Z",
    })),
  ]);

  const checkpoints = (await loadWorkingMemoryCheckpoints(rootDir))
    .filter((checkpoint) =>
      checkpoint.runtime_instance_ref === "runtime_session_continuity_001" &&
      checkpoint.runtime_session_ref === "session_session_continuity_001" &&
      checkpoint.conversation_thread_ref === "thread_session_continuity_001");
  const active = checkpoints.filter((checkpoint) => checkpoint.status === "active");

  assert.equal(checkpoints.length, 2);
  assert.equal(active.length, 1);
  assert.deepEqual(checkpoints.map((checkpoint) => checkpoint.generation).sort(), [1, 2]);
  assert.equal(active[0]!.generation, 2);
  assert.ok(active[0]!.supersedes_ref);
});

test("session pack compilation rejects explicit id reuse with different checkpoint lineage", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-session-pack-contract-"));
  await initializeStore(rootDir);

  const firstCheckpoint = await createWorkingMemoryCheckpointToStore(checkpointInput(rootDir, "wmc_session_pack_contract_001", {
    runtime_instance_ref: "runtime_session_pack_contract_openclaw_001",
    runtime_session_ref: "session_session_pack_contract_openclaw_001",
    conversation_thread_ref: "thread_session_pack_contract_openclaw_001",
    continuity_epoch: "epoch_session_pack_contract_openclaw_001",
  }));
  const secondCheckpoint = await createWorkingMemoryCheckpointToStore(checkpointInput(rootDir, "wmc_session_pack_contract_002", {
    runtime_instance_ref: "runtime_session_pack_contract_hermes_001",
    runtime_session_ref: "session_session_pack_contract_hermes_001",
    conversation_thread_ref: "thread_session_pack_contract_hermes_001",
    continuity_epoch: "epoch_session_pack_contract_hermes_001",
  }));

  await compileSessionPackToStore({
    rootDir,
    id: "pmf_session_pack_contract_fixed_001",
    artifact_id: "part_session_pack_contract_fixed_001",
    now: "2026-04-28T12:01:00.000Z",
    adapter: "hermes",
    checkpoint_id: firstCheckpoint.id,
  });

  await assert.rejects(
    compileSessionPackToStore({
      rootDir,
      id: "pmf_session_pack_contract_fixed_001",
      artifact_id: "part_session_pack_contract_fixed_001",
      now: "2026-04-28T12:02:00.000Z",
      adapter: "hermes",
      checkpoint_id: secondCheckpoint.id,
    }),
    /different session pack contract/,
  );
});

test("session pack compilation serializes explicit id reuse across concurrent checkpoint lineage", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-session-pack-concurrent-"));
  await initializeStore(rootDir);

  const firstCheckpoint = await createWorkingMemoryCheckpointToStore(checkpointInput(rootDir, "wmc_session_pack_concurrent_001", {
    runtime_instance_ref: "runtime_session_pack_concurrent_openclaw_001",
    runtime_session_ref: "session_session_pack_concurrent_openclaw_001",
    conversation_thread_ref: "thread_session_pack_concurrent_openclaw_001",
    continuity_epoch: "epoch_session_pack_concurrent_openclaw_001",
  }));
  const secondCheckpoint = await createWorkingMemoryCheckpointToStore(checkpointInput(rootDir, "wmc_session_pack_concurrent_002", {
    runtime_instance_ref: "runtime_session_pack_concurrent_hermes_001",
    runtime_session_ref: "session_session_pack_concurrent_hermes_001",
    conversation_thread_ref: "thread_session_pack_concurrent_hermes_001",
    continuity_epoch: "epoch_session_pack_concurrent_hermes_001",
  }));

  const results = await Promise.allSettled([
    compileSessionPackToStore({
      rootDir,
      id: "pmf_session_pack_concurrent_fixed_001",
      artifact_id: "part_session_pack_concurrent_fixed_001",
      now: "2026-04-28T12:03:00.000Z",
      adapter: "hermes",
      checkpoint_id: firstCheckpoint.id,
    }),
    compileSessionPackToStore({
      rootDir,
      id: "pmf_session_pack_concurrent_fixed_001",
      artifact_id: "part_session_pack_concurrent_fixed_001",
      now: "2026-04-28T12:04:00.000Z",
      adapter: "hermes",
      checkpoint_id: secondCheckpoint.id,
    }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const manifests = (await loadProjectionManifests(rootDir))
    .filter((manifest) => manifest.id === "pmf_session_pack_concurrent_fixed_001");
  assert.equal(manifests.length, 1);
  assert.ok([firstCheckpoint.id, secondCheckpoint.id].includes(manifests[0]!.source_checkpoint_ref ?? ""));
});

test("session pack recompilation with the same contract reuses persisted records without rewriting timestamps", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-session-pack-idempotent-"));
  await initializeStore(rootDir);

  const checkpoint = await createWorkingMemoryCheckpointToStore(checkpointInput(rootDir, "wmc_session_pack_idempotent_001", {
    runtime_instance_ref: "runtime_session_pack_idempotent_001",
    runtime_session_ref: "session_session_pack_idempotent_001",
    conversation_thread_ref: "thread_session_pack_idempotent_001",
    continuity_epoch: "epoch_session_pack_idempotent_001",
  }));
  const first = await compileSessionPackToStore({
    rootDir,
    id: "pmf_session_pack_idempotent_001",
    artifact_id: "part_session_pack_idempotent_001",
    now: "2026-04-28T12:05:00.000Z",
    adapter: "hermes",
    checkpoint_id: checkpoint.id,
  });
  const second = await compileSessionPackToStore({
    rootDir,
    id: "pmf_session_pack_idempotent_001",
    artifact_id: "part_session_pack_idempotent_001",
    now: "2026-04-28T12:06:00.000Z",
    adapter: "hermes",
    checkpoint_id: checkpoint.id,
  });

  assert.equal(second.pack.manifest.created_at, first.pack.manifest.created_at);
  assert.equal(second.pack.manifest.updated_at, first.pack.manifest.updated_at);
  assert.equal(second.pack.artifact.created_at, first.pack.artifact.created_at);
  assert.equal(second.pack.artifact.updated_at, first.pack.artifact.updated_at);
  assert.equal(second.manifest_path, first.manifest_path);
  assert.equal(second.artifact_path, first.artifact_path);
});
