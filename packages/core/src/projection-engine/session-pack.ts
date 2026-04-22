import type {
  CoreRecord,
  ProjectionArtifact,
  ProjectionManifest,
  RuntimeKind,
  SessionResumeReceipt,
  SessionResumeReceiptStatus,
  VisibilityState,
  WorkingMemoryCheckpoint,
} from "../types.js";
import { createProjectionArtifact, createProjectionManifest } from "../adapter-sdk/projection.js";

export interface CompileSessionPackInput {
  id: string;
  artifact_id: string;
  now: string;
  adapter: Exclude<RuntimeKind, "generic">;
  checkpoint: WorkingMemoryCheckpoint;
  upstream_records: CoreRecord[];
  continuity_epoch: string;
  generation: number;
  read_policy_version: string;
  audience: string;
  policy_snapshot_ref?: string | null;
  visibility_state?: VisibilityState;
}

export interface CompiledSessionPack {
  artifact: ProjectionArtifact;
  manifest: ProjectionManifest;
  artifact_contents: Record<string, string>;
}

export interface RecordSessionResumeReceiptInput {
  id: string;
  now: string;
  receipt_status: SessionResumeReceiptStatus;
  adapter: Exclude<RuntimeKind, "generic">;
  manifest: ProjectionManifest;
  checkpoint: WorkingMemoryCheckpoint;
  authenticated_principal?: SessionResumeReceipt["authenticated_principal"];
  diagnostic_refs?: string[];
  visibility_state?: VisibilityState;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function assertCheckpointEligible(input: CompileSessionPackInput): void {
  if (input.checkpoint.status !== "active") {
    throw new Error(`Session pack requires active checkpoint: ${input.checkpoint.id}`);
  }
  if (input.checkpoint.continuity_epoch !== input.continuity_epoch) {
    throw new Error(`Session pack continuity epoch mismatch: ${input.checkpoint.continuity_epoch}`);
  }
  if (input.checkpoint.generation !== input.generation) {
    throw new Error(`Session pack generation mismatch: ${input.checkpoint.generation}`);
  }
  if (input.checkpoint.read_policy_version !== input.read_policy_version) {
    throw new Error(`Session pack read policy mismatch: ${input.checkpoint.read_policy_version}`);
  }
  if (
    input.policy_snapshot_ref !== undefined &&
    input.policy_snapshot_ref !== null &&
    input.checkpoint.policy_snapshot_ref !== undefined &&
    input.checkpoint.policy_snapshot_ref !== null &&
    input.checkpoint.policy_snapshot_ref !== input.policy_snapshot_ref
  ) {
    throw new Error(`Session pack policy snapshot mismatch: ${input.checkpoint.policy_snapshot_ref}`);
  }

  const availableRefs = new Set(input.upstream_records.map((record) => record.id));
  for (const ref of input.checkpoint.upstream_refs) {
    if (!availableRefs.has(ref)) {
      throw new Error(`Session pack missing upstream ref: ${ref}`);
    }
  }
}

function renderSessionPackMarkdown(input: CompileSessionPackInput): string {
  return [
    `# Session Resume Pack ${input.id}`,
    "",
    `- checkpoint: ${input.checkpoint.id}`,
    `- runtime_instance_ref: ${input.checkpoint.runtime_instance_ref}`,
    `- runtime_session_ref: ${input.checkpoint.runtime_session_ref}`,
    `- conversation_thread_ref: ${input.checkpoint.conversation_thread_ref}`,
    `- continuity_epoch: ${input.checkpoint.continuity_epoch}`,
    `- generation: ${input.checkpoint.generation}`,
    `- read_policy_version: ${input.checkpoint.read_policy_version}`,
    "",
    "## Upstream Refs",
    ...input.checkpoint.upstream_refs.map((ref) => `- ${ref}`),
    "",
    "## Operational Summary",
    input.checkpoint.summary ?? "No checkpoint summary.",
    "",
    "This pack is derived resume context only. Proposal generation must dereference eligible upstream refs.",
    "",
  ].join("\n");
}

export function compileSessionPack(input: CompileSessionPackInput): CompiledSessionPack {
  assertCheckpointEligible(input);

  const visibility_state = input.visibility_state ?? {
    privacy_scope: "runtime_private" as const,
  };
  const upstreamRefs = unique([input.checkpoint.id, ...input.checkpoint.upstream_refs]);
  const artifactPath = `derived/${input.adapter}/session-packs/${input.checkpoint.runtime_session_ref}/${input.artifact_id}.md`;
  const artifact = createProjectionArtifact({
    id: input.artifact_id,
    adapter: input.adapter,
    artifact_kind: "session_resume_markdown",
    path: artifactPath,
    source_layer: "runtime",
    authoritative_home: "runtime",
    upstream_refs: upstreamRefs,
    now: input.now,
    visibility_state,
  });
  const manifest = createProjectionManifest({
    id: input.id,
    adapter: input.adapter,
    projection_profile: "session_resume_v2",
    audience: input.audience,
    read_policy_version: input.read_policy_version,
    runtime_instance_ref: input.checkpoint.runtime_instance_ref,
    runtime_session_ref: input.checkpoint.runtime_session_ref,
    conversation_thread_ref: input.checkpoint.conversation_thread_ref,
    policy_snapshot_ref: input.policy_snapshot_ref ?? input.checkpoint.policy_snapshot_ref ?? null,
    context_refs: [
      input.checkpoint.runtime_instance_ref,
      input.checkpoint.runtime_session_ref,
      input.checkpoint.conversation_thread_ref,
    ],
    artifact_refs: [artifact.id],
    upstream_refs: upstreamRefs,
    now: input.now,
    visibility_state,
  });

  return {
    artifact,
    manifest,
    artifact_contents: {
      [artifact.path]: renderSessionPackMarkdown(input),
    },
  };
}

export function recordSessionResumeReceipt(input: RecordSessionResumeReceiptInput): SessionResumeReceipt {
  if (input.manifest.projection_profile !== "session_resume_v2") {
    throw new Error(`Session resume receipts require session_resume_v2 manifest: ${input.manifest.id}`);
  }
  if (input.manifest.adapter !== input.adapter) {
    throw new Error(`Session resume receipt adapter mismatch: ${input.manifest.adapter}`);
  }
  if (input.manifest.runtime_instance_ref !== input.checkpoint.runtime_instance_ref) {
    throw new Error(`Session resume receipt runtime instance mismatch: ${input.manifest.runtime_instance_ref}`);
  }
  if (input.manifest.runtime_session_ref !== input.checkpoint.runtime_session_ref) {
    throw new Error(`Session resume receipt runtime session mismatch: ${input.manifest.runtime_session_ref}`);
  }
  if (input.manifest.conversation_thread_ref !== input.checkpoint.conversation_thread_ref) {
    throw new Error(`Session resume receipt conversation thread mismatch: ${input.manifest.conversation_thread_ref}`);
  }
  if (input.manifest.read_policy_version !== input.checkpoint.read_policy_version) {
    throw new Error(`Session resume receipt read policy mismatch: ${input.manifest.read_policy_version}`);
  }
  if (!input.manifest.upstream_refs.includes(input.checkpoint.id)) {
    throw new Error(`Session resume receipt manifest missing checkpoint upstream ref: ${input.checkpoint.id}`);
  }

  const upstream_refs = unique([
    input.manifest.id,
    ...input.manifest.artifact_refs,
    input.checkpoint.id,
    ...input.checkpoint.upstream_refs,
  ]);
  return {
    id: input.id,
    kind: "session_resume_receipt",
    layer: "audits",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: input.visibility_state ?? input.manifest.visibility_state,
    provenance: {
      source_type: "session_resume_receipt",
      source_ref: input.manifest.id,
      evidence_refs: upstream_refs,
      actor_ref: input.authenticated_principal?.actor_ref ?? "system:session_resume",
      runtime_ref: input.checkpoint.runtime_instance_ref,
      session_ref: input.checkpoint.runtime_session_ref,
      thread_ref: input.checkpoint.conversation_thread_ref,
    },
    receipt_status: input.receipt_status,
    adapter: input.adapter,
    projection_manifest_ref: input.manifest.id,
    projection_artifact_refs: input.manifest.artifact_refs,
    checkpoint_ref: input.checkpoint.id,
    runtime_instance_ref: input.checkpoint.runtime_instance_ref,
    runtime_session_ref: input.checkpoint.runtime_session_ref,
    conversation_thread_ref: input.checkpoint.conversation_thread_ref,
    continuity_epoch: input.checkpoint.continuity_epoch,
    generation: input.checkpoint.generation,
    read_policy_version: input.checkpoint.read_policy_version,
    upstream_refs,
    authenticated_principal: input.authenticated_principal ?? null,
    diagnostic_refs: input.diagnostic_refs,
  };
}
