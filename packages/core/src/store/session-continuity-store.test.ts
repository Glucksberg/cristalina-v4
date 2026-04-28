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
