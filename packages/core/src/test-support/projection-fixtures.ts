import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createProjectionArtifact, createProjectionManifest } from "../adapter-sdk/projection.js";
import { RUNTIME_BOOTSTRAP_PROJECTION_COMPILER_VERSION } from "../projection-engine/openclaw.js";
import { initializeStore, writeCoreRecord } from "../store/io.js";
import type { CurationPacket, Diagnostic, ProjectionManifest } from "../types.js";

export interface HermesProjectionFixtureInput {
  now: string;
  status: CurationPacket["status"];
  manifest_id: string;
  diagnostic_id: string;
  review_id: string;
  proposal_ref: string;
  markdown_heading: string;
  diagnostic_message: string;
  provenance_source_ref: string;
  projection_profile: string;
  read_policy_version: string;
  actor_identity_ref?: string;
  owner_identity_ref: string;
  runtime_instance_ref: string;
  runtime_session_ref: string;
  conversation_thread_ref: string;
  markdown_artifact_id: string;
  canon_artifact_id: string;
  compiler_version?: string;
  source_checkpoint_ref?: string | null;
  continuity_epoch?: string | null;
  generation?: number | null;
  snapshot_strategy?: ProjectionManifest["snapshot_strategy"];
}

export interface HermesProjectionFixtureResult {
  manifest: ProjectionManifest;
  markdownRelativePath: string;
}

export async function createHermesProjectionFixture(
  rootDir: string,
  input: HermesProjectionFixtureInput,
): Promise<HermesProjectionFixtureResult> {
  await initializeStore(rootDir, input.now);

  const projectionDir = join(rootDir, "derived/hermes", input.manifest_id);
  await mkdir(projectionDir, { recursive: true });
  const markdownRelativePath = `derived/hermes/${input.manifest_id}/runtime-memory.md`;
  await writeFile(
    join(rootDir, markdownRelativePath),
    [
      `# ${input.markdown_heading}`,
      "",
      "## Review Queue",
      "",
      `- [review:${input.review_id}] Pending owner review`,
      "",
      "## Review Trace",
      "",
      `- [review:${input.review_id}] (owner_ratification; ${input.status})`,
      "",
    ].join("\n"),
    "utf8",
  );

  const diagnostic: Diagnostic = {
    id: input.diagnostic_id,
    kind: "diagnostic",
    layer: "audits",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: "shareable",
    },
    provenance: {
      source_type: "test_fixture",
      source_ref: input.provenance_source_ref,
      evidence_refs: [input.proposal_ref],
    },
    code: "proposal_deferred",
    severity: "info",
    message: input.diagnostic_message,
    related_refs: [input.proposal_ref],
  };

  const review: CurationPacket = {
    id: input.review_id,
    kind: "curation_packet",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: "shareable",
    },
    provenance: {
      source_type: "test_fixture",
      source_ref: input.provenance_source_ref,
      evidence_refs: [input.proposal_ref],
    },
    proposal_refs: [input.proposal_ref],
    question_count: 1,
    review_kind: "owner_ratification",
    diagnostic_ref: diagnostic.id,
    canonical_target_ref: {
      id: `${input.proposal_ref}-canon-target`,
      kind: "preference",
      layer: "canon",
    },
    owner_identity_ref: input.owner_identity_ref,
    runtime_instance_ref: input.runtime_instance_ref,
    runtime_session_ref: input.runtime_session_ref,
    conversation_thread_ref: input.conversation_thread_ref,
    projection_manifest_ref: input.manifest_id,
    projection_artifact_refs: [input.markdown_artifact_id, input.canon_artifact_id],
    status: input.status,
  };

  const markdownArtifact = createProjectionArtifact({
    id: input.markdown_artifact_id,
    adapter: "hermes",
    artifact_kind: "runtime_memory_markdown",
    path: `${markdownRelativePath}#reviews`,
    source_layer: "derived",
    authoritative_home: "governance",
    upstream_refs: [review.id, diagnostic.id],
    now: input.now,
    visibility_state: {
      privacy_scope: "shareable",
    },
  });

  const canonArtifact = createProjectionArtifact({
    id: input.canon_artifact_id,
    adapter: "hermes",
    artifact_kind: "canon_snapshot",
    path: `${markdownRelativePath}#canon`,
    source_layer: "canon",
    authoritative_home: "canon",
    upstream_refs: [review.id],
    now: input.now,
    visibility_state: {
      privacy_scope: "shareable",
    },
  });

  const manifest = createProjectionManifest({
    id: input.manifest_id,
    adapter: "hermes",
    projection_profile: input.projection_profile,
    audience: "runtime",
    read_policy_version: input.read_policy_version,
    compiler_version: input.compiler_version ?? RUNTIME_BOOTSTRAP_PROJECTION_COMPILER_VERSION.hermes,
    actor_identity_ref: input.actor_identity_ref ?? null,
    owner_identity_ref: input.owner_identity_ref,
    runtime_instance_ref: input.runtime_instance_ref,
    runtime_session_ref: input.runtime_session_ref,
    conversation_thread_ref: input.conversation_thread_ref,
    source_checkpoint_ref: input.source_checkpoint_ref ?? null,
    continuity_epoch: input.continuity_epoch ?? null,
    generation: input.generation ?? null,
    snapshot_strategy: input.snapshot_strategy ?? null,
    context_refs: [
      ...(input.actor_identity_ref ? [input.actor_identity_ref] : []),
      input.owner_identity_ref,
      input.runtime_instance_ref,
      input.runtime_session_ref,
      input.conversation_thread_ref,
    ],
    diagnostic_refs: [diagnostic.id],
    review_refs: [review.id],
    artifact_refs: [markdownArtifact.id, canonArtifact.id],
    upstream_refs: [review.id, diagnostic.id],
    now: input.now,
    visibility_state: {
      privacy_scope: "shareable",
    },
  });

  await Promise.all([
    writeCoreRecord(rootDir, diagnostic),
    writeCoreRecord(rootDir, review),
    writeCoreRecord(rootDir, markdownArtifact),
    writeCoreRecord(rootDir, canonArtifact),
    writeCoreRecord(rootDir, manifest),
  ]);

  return {
    manifest,
    markdownRelativePath,
  };
}
