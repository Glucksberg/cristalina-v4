import type {
  ProjectionArtifact,
  ProjectionManifest,
  RuntimeKind,
  VisibilityState,
} from "../types.js";

export interface ProjectionFragmentInput {
  id: string;
  adapter: Exclude<RuntimeKind, "generic">;
  artifact_kind: string;
  path: string;
  source_layer: ProjectionArtifact["source_layer"];
  authoritative_home: ProjectionArtifact["authoritative_home"];
  upstream_refs: string[];
  now: string;
  visibility_state: VisibilityState;
}

export function createProjectionArtifact(input: ProjectionFragmentInput): ProjectionArtifact {
  return {
    id: input.id,
    kind: "projection_artifact",
    layer: "derived",
    authoritative_home: input.authoritative_home,
    created_at: input.now,
    updated_at: input.now,
    visibility_state: input.visibility_state,
    provenance: {
      source_type: "projection_compiler",
      source_ref: input.path,
      evidence_refs: input.upstream_refs,
    },
    adapter: input.adapter,
    artifact_kind: input.artifact_kind,
    path: input.path,
    source_layer: input.source_layer,
    upstream_refs: input.upstream_refs,
  };
}

export interface ProjectionManifestInput {
  id: string;
  adapter: Exclude<RuntimeKind, "generic">;
  projection_profile: string;
  audience: string;
  actor_identity_ref?: string | null;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
  diagnostic_refs?: string[];
  artifact_refs: string[];
  upstream_refs: string[];
  now: string;
  visibility_state: VisibilityState;
}

export function createProjectionManifest(input: ProjectionManifestInput): ProjectionManifest {
  return {
    id: input.id,
    kind: "projection_manifest",
    layer: "derived",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: input.visibility_state,
    provenance: {
      source_type: "projection_manifest",
      source_ref: `derived/manifests/${input.id}.json`,
      evidence_refs: input.upstream_refs,
    },
    adapter: input.adapter,
    projection_profile: input.projection_profile,
    audience: input.audience,
    actor_identity_ref: input.actor_identity_ref ?? null,
    runtime_instance_ref: input.runtime_instance_ref ?? null,
    runtime_session_ref: input.runtime_session_ref ?? null,
    conversation_thread_ref: input.conversation_thread_ref ?? null,
    diagnostic_refs: input.diagnostic_refs,
    upstream_refs: input.upstream_refs,
    artifact_refs: input.artifact_refs,
  };
}
