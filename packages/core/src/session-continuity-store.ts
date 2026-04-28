import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

import type {
  AuthenticatedPrincipal,
  CoreRecord,
  ProjectionManifest,
  RuntimeKind,
  SessionResumeReceipt,
  SessionResumeReceiptStatus,
  WorkingMemoryCheckpoint,
} from "./types.js";
import {
  compileSessionPack,
  recordSessionResumeReceipt,
  type CompiledSessionPack,
} from "./projection-engine/session-pack.js";
import {
  loadProjectionArtifacts,
  loadProjectionManifests,
  loadSessionResumeReceipts,
  loadWorkingMemoryCheckpoints,
  writeCoreRecord,
} from "./store/io.js";

type AdapterRuntime = Exclude<RuntimeKind, "generic">;
const SESSION_CONTINUITY_LOCK_PATH = "audits/snapshots/.session-continuity.lock";
const SESSION_CONTINUITY_LOCK_STALE_MS = 30_000;
const SESSION_CONTINUITY_LOCK_RETRY_MS = 10;
const SESSION_CONTINUITY_LOCK_TIMEOUT_MS = 5_000;

export interface CreateWorkingMemoryCheckpointInput {
  rootDir: string;
  id: string;
  now: string;
  runtime_instance_ref: string;
  runtime_session_ref: string;
  conversation_thread_ref: string;
  continuity_epoch: string;
  generation: number;
  read_policy_version: string;
  summary?: string;
  upstream_refs?: string[];
  policy_snapshot_ref?: string | null;
  authenticated_principal?: AuthenticatedPrincipal;
}

export interface CompileSessionPackToStoreInput {
  rootDir: string;
  id?: string;
  artifact_id?: string;
  now: string;
  adapter: AdapterRuntime;
  checkpoint_id?: string;
  checkpoint_filter?: Partial<Pick<WorkingMemoryCheckpoint, "runtime_instance_ref" | "runtime_session_ref" | "conversation_thread_ref">>;
  audience?: string;
}

export interface RecordSessionResumeReceiptToStoreInput {
  rootDir: string;
  now: string;
  receipt_status: SessionResumeReceiptStatus;
  adapter: AdapterRuntime;
  manifest_id?: string;
  checkpoint_id?: string;
  authenticated_principal: AuthenticatedPrincipal;
}

export interface StoredSessionPack {
  artifact_path: string;
  manifest_path: string;
  pack: CompiledSessionPack;
}

function ensureInsideRoot(rootDir: string, relativePath: string): string {
  const root = resolve(rootDir);
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}/`)) {
    throw new Error(`Session continuity path escapes store root: ${relativePath}`);
  }
  return target;
}

function compareCheckpoint(left: WorkingMemoryCheckpoint, right: WorkingMemoryCheckpoint): number {
  if (right.generation !== left.generation) {
    return right.generation - left.generation;
  }
  return Date.parse(right.created_at) - Date.parse(left.created_at) || right.id.localeCompare(left.id);
}

function compareManifest(left: ProjectionManifest, right: ProjectionManifest): number {
  const leftGeneration = left.generation ?? -1;
  const rightGeneration = right.generation ?? -1;
  if (rightGeneration !== leftGeneration) {
    return rightGeneration - leftGeneration;
  }
  return Date.parse(right.updated_at ?? right.created_at) - Date.parse(left.updated_at ?? left.created_at) || right.id.localeCompare(left.id);
}

function sameRefs(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function sessionContinuityLockIsStale(lockPath: string, nowMs: number): Promise<boolean> {
  const lockStat = await stat(lockPath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  });
  if (!lockStat) {
    return false;
  }
  return nowMs - lockStat.mtimeMs > SESSION_CONTINUITY_LOCK_STALE_MS;
}

async function withSessionContinuityLock<T>(rootDir: string, holder: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = ensureInsideRoot(rootDir, SESSION_CONTINUITY_LOCK_PATH);
  await mkdir(dirname(lockPath), { recursive: true });
  const startedAt = Date.now();

  for (;;) {
    try {
      await mkdir(lockPath, { recursive: false });
      try {
        await writeFile(
          resolve(lockPath, "owner.json"),
          `${JSON.stringify({ holder, acquired_at: new Date().toISOString() }, null, 2)}\n`,
        );
        return await fn();
      } finally {
        await rm(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      const nowMs = Date.now();
      if (await sessionContinuityLockIsStale(lockPath, nowMs)) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }
      if (nowMs - startedAt > SESSION_CONTINUITY_LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out acquiring session continuity lock for ${holder}`);
      }
      await sleep(SESSION_CONTINUITY_LOCK_RETRY_MS);
    }
  }
}

function compactRecordId(prefix: string, stableKey: string): string {
  return `${prefix}_${createHash("sha256").update(stableKey).digest("hex").slice(0, 24)}`;
}

function sessionPackStableKey(adapter: AdapterRuntime, checkpoint: WorkingMemoryCheckpoint): string {
  return [
    adapter,
    checkpoint.id,
    checkpoint.runtime_instance_ref,
    checkpoint.runtime_session_ref,
    checkpoint.conversation_thread_ref,
    checkpoint.continuity_epoch,
    `g${checkpoint.generation}`,
  ].join(":");
}

function checkpointMatchesFilter(
  checkpoint: WorkingMemoryCheckpoint,
  filter: CompileSessionPackToStoreInput["checkpoint_filter"],
): boolean {
  return (
    checkpoint.status === "active" &&
    (filter?.runtime_instance_ref === undefined || checkpoint.runtime_instance_ref === filter.runtime_instance_ref) &&
    (filter?.runtime_session_ref === undefined || checkpoint.runtime_session_ref === filter.runtime_session_ref) &&
    (filter?.conversation_thread_ref === undefined || checkpoint.conversation_thread_ref === filter.conversation_thread_ref)
  );
}

function selectSessionPackCheckpoint(
  input: CompileSessionPackToStoreInput,
  checkpoints: WorkingMemoryCheckpoint[],
): WorkingMemoryCheckpoint {
  if (input.checkpoint_id) {
    const checkpoint = checkpoints.find((entry) => entry.id === input.checkpoint_id && entry.status === "active");
    if (!checkpoint) {
      throw new Error(`Cannot compile session pack without active checkpoint ${input.checkpoint_id}`);
    }
    return checkpoint;
  }

  const matches = checkpoints
    .filter((entry) => checkpointMatchesFilter(entry, input.checkpoint_filter))
    .sort(compareCheckpoint);
  if (matches.length === 0) {
    throw new Error("Cannot compile session pack without an active checkpoint");
  }
  if (matches.length > 1) {
    throw new Error("Cannot compile session pack because multiple active checkpoints match; provide checkpoint_id or a narrower checkpoint_filter");
  }
  return matches[0]!;
}

export async function createWorkingMemoryCheckpointToStore(
  input: CreateWorkingMemoryCheckpointInput,
): Promise<WorkingMemoryCheckpoint> {
  return withSessionContinuityLock(input.rootDir, `working_memory_checkpoint:${input.id}`, async () => {
    const upstream_refs = input.upstream_refs ?? [input.runtime_session_ref, input.conversation_thread_ref];
    const existing = await loadWorkingMemoryCheckpoints(input.rootDir);
    const existingSameId = existing.find((checkpoint) => checkpoint.id === input.id);
    if (existingSameId) {
      if (
        existingSameId.status === "active" &&
        existingSameId.runtime_instance_ref === input.runtime_instance_ref &&
        existingSameId.runtime_session_ref === input.runtime_session_ref &&
        existingSameId.conversation_thread_ref === input.conversation_thread_ref &&
        existingSameId.continuity_epoch === input.continuity_epoch &&
        existingSameId.read_policy_version === input.read_policy_version &&
        existingSameId.policy_snapshot_ref === (input.policy_snapshot_ref ?? null) &&
        existingSameId.summary === (input.summary ?? null) &&
        sameRefs(existingSameId.upstream_refs, upstream_refs)
      ) {
        return existingSameId;
      }
      throw new Error(`Working memory checkpoint id ${input.id} already exists with a different checkpoint contract`);
    }

    const previous = existing
      .filter((checkpoint) =>
        checkpoint.status === "active" &&
        checkpoint.runtime_instance_ref === input.runtime_instance_ref &&
        checkpoint.runtime_session_ref === input.runtime_session_ref &&
        checkpoint.conversation_thread_ref === input.conversation_thread_ref &&
        checkpoint.continuity_epoch === input.continuity_epoch)
      .sort(compareCheckpoint)[0];
    const generation = previous ? Math.max(input.generation, previous.generation + 1) : input.generation;

    const checkpoint: WorkingMemoryCheckpoint = {
      id: input.id,
      kind: "working_memory_checkpoint",
      layer: "runtime",
      authoritative_home: "runtime",
      created_at: input.now,
      visibility_state: {
        privacy_scope: "runtime_private",
      },
      provenance: {
        source_type: "runtime_checkpoint",
        source_ref: input.runtime_session_ref,
        evidence_refs: upstream_refs,
        actor_ref: input.authenticated_principal?.actor_ref,
        runtime_ref: input.runtime_instance_ref,
        session_ref: input.runtime_session_ref,
        thread_ref: input.conversation_thread_ref,
      },
      runtime_instance_ref: input.runtime_instance_ref,
      runtime_session_ref: input.runtime_session_ref,
      conversation_thread_ref: input.conversation_thread_ref,
      continuity_epoch: input.continuity_epoch,
      generation,
      read_policy_version: input.read_policy_version,
      policy_snapshot_ref: input.policy_snapshot_ref ?? null,
      upstream_refs,
      summary: input.summary ?? null,
      status: "active",
      ...(previous ? { supersedes_ref: previous.id } : {}),
    };

    if (previous) {
      await writeCoreRecord(input.rootDir, {
        ...previous,
        status: "superseded",
        superseded_by_ref: checkpoint.id,
      });
    }
    await writeCoreRecord(input.rootDir, checkpoint);
    return checkpoint;
  });
}

export async function loadLatestWorkingMemoryCheckpoint(
  rootDir: string,
  filter: Partial<Pick<WorkingMemoryCheckpoint, "runtime_instance_ref" | "runtime_session_ref" | "conversation_thread_ref">> = {},
): Promise<WorkingMemoryCheckpoint | null> {
  const checkpoints = await loadWorkingMemoryCheckpoints(rootDir);
  return checkpoints
    .filter((checkpoint) =>
      checkpoint.status === "active" &&
      (filter.runtime_instance_ref === undefined || checkpoint.runtime_instance_ref === filter.runtime_instance_ref) &&
      (filter.runtime_session_ref === undefined || checkpoint.runtime_session_ref === filter.runtime_session_ref) &&
      (filter.conversation_thread_ref === undefined || checkpoint.conversation_thread_ref === filter.conversation_thread_ref))
    .sort(compareCheckpoint)[0] ?? null;
}

export async function compileSessionPackToStore(input: CompileSessionPackToStoreInput): Promise<StoredSessionPack> {
  const checkpoints = await loadWorkingMemoryCheckpoints(input.rootDir);
  const checkpoint = selectSessionPackCheckpoint(input, checkpoints);
  const stableKey = sessionPackStableKey(input.adapter, checkpoint);

  const upstream_records: CoreRecord[] = checkpoint.upstream_refs.map((upstreamRef) => ({
    id: upstreamRef,
    kind: "observation",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: checkpoint.created_at,
    visibility_state: checkpoint.visibility_state,
    provenance: {
      source_type: "session_pack_upstream_ref",
      source_ref: checkpoint.id,
    },
    summary: `Session pack upstream ref ${upstreamRef}`,
    epistemic_state: "observed",
  } as unknown as CoreRecord));

  const pack = compileSessionPack({
    id: input.id ?? compactRecordId(`pmf_session_resume_${input.adapter}`, stableKey),
    artifact_id: input.artifact_id ?? compactRecordId(`part_session_resume_${input.adapter}`, stableKey),
    now: input.now,
    adapter: input.adapter,
    checkpoint,
    upstream_records,
    continuity_epoch: checkpoint.continuity_epoch,
    generation: checkpoint.generation,
    read_policy_version: checkpoint.read_policy_version,
    audience: input.audience ?? "runtime",
    policy_snapshot_ref: checkpoint.policy_snapshot_ref ?? null,
  });

  const [artifactPath] = Object.keys(pack.artifact_contents);
  if (!artifactPath) {
    throw new Error(`Session pack ${pack.manifest.id} did not emit an artifact path`);
  }
  const existingManifest = (await loadProjectionManifests(input.rootDir)).find((manifest) => manifest.id === pack.manifest.id);
  if (
    existingManifest &&
    (
      existingManifest.adapter !== pack.manifest.adapter ||
      existingManifest.projection_profile !== pack.manifest.projection_profile ||
      existingManifest.source_checkpoint_ref !== pack.manifest.source_checkpoint_ref ||
      existingManifest.continuity_epoch !== pack.manifest.continuity_epoch ||
      existingManifest.generation !== pack.manifest.generation ||
      existingManifest.read_policy_version !== pack.manifest.read_policy_version ||
      !sameRefs(existingManifest.artifact_refs, pack.manifest.artifact_refs)
    )
  ) {
    throw new Error(`Session pack manifest id ${pack.manifest.id} already exists with a different session pack contract`);
  }
  const existingArtifact = (await loadProjectionArtifacts(input.rootDir, input.adapter)).find((artifact) => artifact.id === pack.artifact.id);
  if (
    existingArtifact &&
    (
      existingArtifact.path !== pack.artifact.path ||
      existingArtifact.artifact_kind !== pack.artifact.artifact_kind ||
      !sameRefs(existingArtifact.upstream_refs, pack.artifact.upstream_refs)
    )
  ) {
    throw new Error(`Session pack artifact id ${pack.artifact.id} already exists with a different session pack contract`);
  }
  const artifactFile = ensureInsideRoot(input.rootDir, artifactPath);
  await mkdir(dirname(artifactFile), { recursive: true });
  await writeFile(artifactFile, pack.artifact_contents[artifactPath]);
  const artifactRecordPath = await writeCoreRecord(input.rootDir, pack.artifact);
  const manifestPath = await writeCoreRecord(input.rootDir, pack.manifest);

  return {
    artifact_path: artifactRecordPath,
    manifest_path: manifestPath,
    pack,
  };
}

export async function loadLatestSessionPackManifest(
  rootDir: string,
  adapter?: AdapterRuntime,
): Promise<ProjectionManifest | null> {
  const manifests = await loadProjectionManifests(rootDir);
  return manifests
    .filter((manifest) =>
      manifest.projection_profile === "session_resume_v2" &&
      (adapter === undefined || manifest.adapter === adapter))
    .sort(compareManifest)[0] ?? null;
}

export async function recordSessionResumeReceiptToStore(
  input: RecordSessionResumeReceiptToStoreInput,
): Promise<SessionResumeReceipt> {
  const manifest = input.manifest_id
    ? (await loadProjectionManifests(input.rootDir)).find((entry) => entry.id === input.manifest_id) ?? null
    : await loadLatestSessionPackManifest(input.rootDir, input.adapter);
  if (!manifest) {
    throw new Error("Cannot record session resume receipt without a session pack manifest");
  }

  const checkpoint = input.checkpoint_id
    ? (await loadWorkingMemoryCheckpoints(input.rootDir)).find((entry) => entry.id === input.checkpoint_id) ?? null
    : (await loadWorkingMemoryCheckpoints(input.rootDir)).find((entry) => entry.id === manifest.source_checkpoint_ref) ?? null;
  if (!checkpoint) {
    throw new Error(`Cannot record session resume receipt without checkpoint ${manifest.source_checkpoint_ref}`);
  }

  const receipt = recordSessionResumeReceipt({
    now: input.now,
    receipt_status: input.receipt_status,
    adapter: input.adapter,
    manifest,
    checkpoint,
    authenticated_principal: input.authenticated_principal,
  });
  const persistedReceipt = {
    ...receipt,
    id: compactRecordId("session_resume_receipt", receipt.receipt_key),
  };

  const existing = await loadSessionResumeReceipts(input.rootDir);
  const reused = existing.find((entry) => entry.receipt_key === persistedReceipt.receipt_key);
  if (reused) {
    return reused;
  }

  await writeCoreRecord(input.rootDir, persistedReceipt);
  return persistedReceipt;
}
