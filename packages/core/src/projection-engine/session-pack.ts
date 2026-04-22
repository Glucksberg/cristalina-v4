import type {
  CoreRecord,
  ProjectionArtifact,
  ProjectionManifest,
  RuntimeKind,
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
