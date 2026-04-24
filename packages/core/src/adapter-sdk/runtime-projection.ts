import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  CurationPacket,
  Diagnostic,
  ProjectionArtifact,
  ProjectionManifest,
  ProjectionRetrievalTrace,
  RetrievalSuppressionReason,
  RuntimeKind,
} from "../types.js";
import {
  loadCurationPackets,
  loadDiagnostics,
  loadProjectionArtifacts,
  loadProjectionManifests,
} from "../store/io.js";
import { resolveProjectionMarkdownPath } from "./projection-contracts.js";

type ProjectionAdapterKind = Exclude<RuntimeKind, "generic">;
export type ProjectionConsistencyRequirement = "allow_mixed_state" | "require_checkpoint_consistent";

export interface ProjectionRuntimeSummary {
  manifest_id: string;
  compiled_at: string;
  read_policy_version: string;
  compiler_version: string;
  actor_identity_ref?: string | null;
  owner_identity_ref?: string | null;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
  source_checkpoint_ref?: string | null;
  continuity_epoch?: string | null;
  generation?: number | null;
  snapshot_strategy: ProjectionManifest["snapshot_strategy"];
  diagnostic_count: number;
  review_count: number;
  pending_review_count: number;
}

export interface ProjectionRuntimeFilter {
  read_policy_version?: string;
  compiler_version?: string;
  actor_identity_ref?: string | null;
  owner_identity_ref?: string | null;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
  consistency_requirement?: ProjectionConsistencyRequirement;
}

export interface ProjectionRuntimeSelectionFilter extends ProjectionRuntimeFilter {
  consistency_requirement: ProjectionConsistencyRequirement;
}

export interface ProjectionRuntimeView {
  manifest: ProjectionManifest;
  markdown: string;
  diagnostics: Diagnostic[];
  retrieval_context: ProjectionRuntimeRetrievalContext;
  reviews: CurationPacket[];
  pending_reviews: CurationPacket[];
  closed_reviews: CurationPacket[];
}

export interface ProjectionRuntimeRetrievalContext {
  available: boolean;
  trace_refs: string[];
  included_candidate_refs: string[];
  suppressed_candidate_refs: string[];
  suppression_reasons: RetrievalSuppressionReason[];
  traces: ProjectionRetrievalTrace[];
  diagnostics: Diagnostic[];
}

function manifestsShareSelectionContext(
  left: Pick<
    ProjectionManifest,
    "actor_identity_ref" | "owner_identity_ref" | "runtime_instance_ref" | "runtime_session_ref" | "conversation_thread_ref"
  >,
  right: Pick<
    ProjectionManifest,
    "actor_identity_ref" | "owner_identity_ref" | "runtime_instance_ref" | "runtime_session_ref" | "conversation_thread_ref"
  >,
): boolean {
  return (
    (left.actor_identity_ref ?? null) === (right.actor_identity_ref ?? null) &&
    (left.owner_identity_ref ?? null) === (right.owner_identity_ref ?? null) &&
    (left.runtime_instance_ref ?? null) === (right.runtime_instance_ref ?? null) &&
    (left.runtime_session_ref ?? null) === (right.runtime_session_ref ?? null) &&
    (left.conversation_thread_ref ?? null) === (right.conversation_thread_ref ?? null)
  );
}

function compareProjectionTimestamps(left: ProjectionManifest, right: ProjectionManifest): number {
  if (manifestsShareSelectionContext(left, right) && left.snapshot_strategy !== right.snapshot_strategy) {
    if (left.snapshot_strategy === "checkpoint_consistent") {
      return -1;
    }
    if (right.snapshot_strategy === "checkpoint_consistent") {
      return 1;
    }
  }

  const leftTimestamp = Date.parse(left.updated_at ?? left.created_at);
  const rightTimestamp = Date.parse(right.updated_at ?? right.created_at);
  if (rightTimestamp !== leftTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  if (
    typeof left.continuity_epoch === "string" &&
    typeof right.continuity_epoch === "string" &&
    left.continuity_epoch === right.continuity_epoch
  ) {
    const leftGeneration = typeof left.generation === "number" ? left.generation : -1;
    const rightGeneration = typeof right.generation === "number" ? right.generation : -1;
    if (rightGeneration !== leftGeneration) {
      return rightGeneration - leftGeneration;
    }
  }

  return right.id.localeCompare(left.id);
}

function matchesProjectionRuntimeFilter(
  manifest: Pick<
    ProjectionManifest,
    "read_policy_version" | "compiler_version" | "actor_identity_ref" | "owner_identity_ref" | "runtime_instance_ref" | "runtime_session_ref" | "conversation_thread_ref"
  >,
  filter?: ProjectionRuntimeFilter,
): boolean {
  if (!filter) {
    return true;
  }

  if (filter.read_policy_version !== undefined && manifest.read_policy_version !== filter.read_policy_version) {
    return false;
  }
  if (filter.actor_identity_ref !== undefined && manifest.actor_identity_ref !== filter.actor_identity_ref) {
    return false;
  }
  if (filter.compiler_version !== undefined && manifest.compiler_version !== filter.compiler_version) {
    return false;
  }
  if (filter.owner_identity_ref !== undefined && manifest.owner_identity_ref !== filter.owner_identity_ref) {
    return false;
  }
  if (filter.runtime_instance_ref !== undefined && manifest.runtime_instance_ref !== filter.runtime_instance_ref) {
    return false;
  }
  if (filter.runtime_session_ref !== undefined && manifest.runtime_session_ref !== filter.runtime_session_ref) {
    return false;
  }
  if (filter.conversation_thread_ref !== undefined && manifest.conversation_thread_ref !== filter.conversation_thread_ref) {
    return false;
  }

  return true;
}

function matchesProjectionIdentityFilter(filter?: ProjectionRuntimeFilter): ProjectionRuntimeFilter | undefined {
  if (!filter) {
    return undefined;
  }

  return {
    compiler_version: undefined,
    read_policy_version: undefined,
    actor_identity_ref: filter.actor_identity_ref,
    owner_identity_ref: filter.owner_identity_ref,
    runtime_instance_ref: filter.runtime_instance_ref,
    runtime_session_ref: filter.runtime_session_ref,
    conversation_thread_ref: filter.conversation_thread_ref,
  };
}

function isCheckpointConsistentManifest(
  manifest: Pick<ProjectionManifest, "snapshot_strategy" | "source_checkpoint_ref" | "continuity_epoch" | "generation">,
): boolean {
  return (
    manifest.snapshot_strategy === "checkpoint_consistent" &&
    typeof manifest.source_checkpoint_ref === "string" &&
    manifest.source_checkpoint_ref.length > 0 &&
    typeof manifest.continuity_epoch === "string" &&
    manifest.continuity_epoch.length > 0 &&
    typeof manifest.generation === "number" &&
    Number.isInteger(manifest.generation) &&
    manifest.generation >= 0
  );
}

function matchesProjectionConsistencyRequirement(
  manifest: Pick<ProjectionManifest, "snapshot_strategy" | "source_checkpoint_ref" | "continuity_epoch" | "generation">,
  requirement: ProjectionConsistencyRequirement | undefined,
): boolean {
  if (!requirement || requirement === "allow_mixed_state") {
    return true;
  }

  return isCheckpointConsistentManifest(manifest);
}

function assertProjectionConsistencyRequirement(
  manifest: Pick<ProjectionManifest, "id" | "snapshot_strategy" | "source_checkpoint_ref" | "continuity_epoch" | "generation">,
  adapter: ProjectionAdapterKind,
  requirement: ProjectionConsistencyRequirement | undefined,
): void {
  if (matchesProjectionConsistencyRequirement(manifest, requirement)) {
    return;
  }

  throw new Error(
    `${adapter} projection manifest ${manifest.id} does not satisfy require_checkpoint_consistent; expected snapshot_strategy=checkpoint_consistent with source_checkpoint_ref, continuity_epoch, and generation`,
  );
}

function selectionDimensionIsAmbiguous(
  summaries: ProjectionRuntimeSummary[],
  filter: ProjectionRuntimeFilter | undefined,
  key: keyof Pick<
    ProjectionRuntimeSummary,
    "actor_identity_ref" | "owner_identity_ref" | "runtime_instance_ref" | "runtime_session_ref" | "conversation_thread_ref"
  >,
): boolean {
  if (filter?.[key] !== undefined) {
    return false;
  }

  const values = new Set(summaries.map((summary) => summary[key] ?? null));
  return values.size > 1;
}

function projectionSelectionIsAmbiguous(
  summaries: ProjectionRuntimeSummary[],
  filter?: ProjectionRuntimeFilter,
): boolean {
  if (summaries.length <= 1) {
    return false;
  }

  return (
    selectionDimensionIsAmbiguous(summaries, filter, "actor_identity_ref") ||
    selectionDimensionIsAmbiguous(summaries, filter, "owner_identity_ref") ||
    selectionDimensionIsAmbiguous(summaries, filter, "runtime_instance_ref") ||
    selectionDimensionIsAmbiguous(summaries, filter, "runtime_session_ref") ||
    selectionDimensionIsAmbiguous(summaries, filter, "conversation_thread_ref")
  );
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

export function summarizeProjectionRuntimeRetrievalContext(input: {
  manifest: ProjectionManifest;
  diagnostics: Diagnostic[];
}): ProjectionRuntimeRetrievalContext {
  const traces = input.manifest.retrieval_traces ?? [];
  const traceRefs = uniqueStrings([
    ...(input.manifest.retrieval_trace_refs ?? []),
    ...traces.map((trace) => trace.trace_ref),
  ]);
  const includedCandidateRefs = uniqueStrings([
    ...(input.manifest.included_retrieval_candidate_refs ?? []),
    ...traces.flatMap((trace) => trace.included_candidate_refs),
  ]);
  const suppressedCandidateRefs = uniqueStrings([
    ...(input.manifest.suppressed_retrieval_candidate_refs ?? []),
    ...traces.flatMap((trace) => trace.suppressed_candidate_refs),
  ]);
  const suppressionReasons = uniqueStrings(
    traces.flatMap((trace) => trace.suppression_reasons),
  ) as RetrievalSuppressionReason[];
  const retrievalDiagnosticRefs = new Set([
    ...traceRefs,
    ...includedCandidateRefs,
    ...suppressedCandidateRefs,
    ...traces.map((trace) => trace.query_ref),
    ...traces.map((trace) => trace.recipe_ref),
  ]);
  const retrievalDiagnostics = input.diagnostics.filter((diagnostic) =>
    diagnostic.code.startsWith("retrieval_") ||
    diagnostic.related_refs.some((ref) => retrievalDiagnosticRefs.has(ref)),
  );

  return {
    available: traceRefs.length > 0 || includedCandidateRefs.length > 0 || suppressedCandidateRefs.length > 0,
    trace_refs: traceRefs,
    included_candidate_refs: includedCandidateRefs,
    suppressed_candidate_refs: suppressedCandidateRefs,
    suppression_reasons: suppressionReasons,
    traces,
    diagnostics: retrievalDiagnostics,
  };
}

function assertExplicitProjectionConsistencyRequirement(
  adapter: ProjectionAdapterKind,
  requirement: ProjectionConsistencyRequirement | undefined,
): ProjectionConsistencyRequirement {
  if (!requirement) {
    throw new Error(
      `${adapter} projection loads require an explicit consistency_requirement of allow_mixed_state or require_checkpoint_consistent`,
    );
  }

  return requirement;
}

export async function listProjectionRuntimeViews(
  rootDir: string,
  adapter: ProjectionAdapterKind,
  filter?: ProjectionRuntimeFilter,
): Promise<ProjectionRuntimeSummary[]> {
  const storeRoot = resolve(rootDir);
  const [manifests, diagnostics, reviews] = await Promise.all([
    loadProjectionManifests(storeRoot),
    loadDiagnostics(storeRoot),
    loadCurationPackets(storeRoot),
  ]);

  return manifests
    .filter((manifest) =>
      manifest.adapter === adapter &&
      matchesProjectionRuntimeFilter(manifest, filter) &&
      matchesProjectionConsistencyRequirement(manifest, filter?.consistency_requirement)
    )
    .sort(compareProjectionTimestamps)
    .map((manifest) => {
      const diagnosticIds = new Set(manifest.diagnostic_refs ?? []);
      const reviewIds = new Set(manifest.review_refs ?? []);
      const matchingReviews = reviews.filter((record) => reviewIds.has(record.id));

      return {
        manifest_id: manifest.id,
        compiled_at: manifest.updated_at ?? manifest.created_at,
        read_policy_version: manifest.read_policy_version,
        compiler_version: manifest.compiler_version,
        actor_identity_ref: manifest.actor_identity_ref ?? null,
        owner_identity_ref: manifest.owner_identity_ref ?? null,
        runtime_instance_ref: manifest.runtime_instance_ref ?? null,
        runtime_session_ref: manifest.runtime_session_ref ?? null,
        conversation_thread_ref: manifest.conversation_thread_ref ?? null,
        source_checkpoint_ref: manifest.source_checkpoint_ref ?? null,
        continuity_epoch: manifest.continuity_epoch ?? null,
        generation: manifest.generation ?? null,
        snapshot_strategy: manifest.snapshot_strategy,
        diagnostic_count: diagnostics.filter((record) => diagnosticIds.has(record.id)).length,
        review_count: matchingReviews.length,
        pending_review_count: matchingReviews.filter((record) => record.status === "pending").length,
      };
    });
}

export async function loadProjectionRuntimeView(input: {
  rootDir: string;
  manifest_id: string;
  adapter: ProjectionAdapterKind;
  consistency_requirement: ProjectionConsistencyRequirement;
}): Promise<ProjectionRuntimeView> {
  const storeRoot = resolve(input.rootDir);
  const consistency_requirement = assertExplicitProjectionConsistencyRequirement(
    input.adapter,
    input.consistency_requirement,
  );
  const manifests = await loadProjectionManifests(storeRoot);
  const manifest = manifests.find((record) => record.id === input.manifest_id && record.adapter === input.adapter);
  if (!manifest) {
    throw new Error(`${input.adapter} projection manifest ${input.manifest_id} does not exist`);
  }
  assertProjectionConsistencyRequirement(manifest, input.adapter, consistency_requirement);

  const [artifacts, diagnostics, reviews] = await Promise.all([
    loadProjectionArtifacts(storeRoot, input.adapter),
    loadDiagnostics(storeRoot),
    loadCurationPackets(storeRoot),
  ]);
  const markdownPath = resolveProjectionMarkdownPath({
    rootDir: storeRoot,
    manifest,
    artifacts,
  });
  const markdown = await readFile(markdownPath, "utf8");
  const diagnosticIds = new Set(manifest.diagnostic_refs ?? []);
  const reviewIds = new Set(manifest.review_refs ?? []);
  const manifestDiagnostics = diagnostics.filter((record) => diagnosticIds.has(record.id));
  const manifestReviews = reviews.filter((record) => reviewIds.has(record.id));
  const retrieval_context = summarizeProjectionRuntimeRetrievalContext({
    manifest,
    diagnostics: manifestDiagnostics,
  });

  return {
    manifest,
    markdown,
    diagnostics: manifestDiagnostics,
    retrieval_context,
    reviews: manifestReviews,
    pending_reviews: manifestReviews.filter((record) => record.status === "pending"),
    closed_reviews: manifestReviews.filter((record) => record.status !== "pending"),
  };
}

export async function loadLatestProjectionRuntimeView(
  rootDir: string,
  adapter: ProjectionAdapterKind,
  filter: ProjectionRuntimeSelectionFilter,
): Promise<ProjectionRuntimeView | undefined> {
  if (!filter?.consistency_requirement) {
    throw new Error(
      `Latest ${adapter} projection requires an explicit consistency_requirement of allow_mixed_state or require_checkpoint_consistent`,
    );
  }
  const summaries = await listProjectionRuntimeViews(rootDir, adapter, filter);
  if (summaries.length === 0 && filter?.consistency_requirement === "require_checkpoint_consistent") {
    const identitySummaries = await listProjectionRuntimeViews(rootDir, adapter, matchesProjectionIdentityFilter(filter));
    if (identitySummaries.length > 0) {
      throw new Error(
        `Latest ${adapter} projection did not satisfy require_checkpoint_consistent for the selected runtime context`,
      );
    }
  }
  if (summaries.length === 0 && filter?.compiler_version !== undefined) {
    const identitySummaries = await listProjectionRuntimeViews(rootDir, adapter, matchesProjectionIdentityFilter(filter));
    if (identitySummaries.length > 0) {
      throw new Error(
        `Latest ${adapter} projection did not satisfy compiler_version=${filter.compiler_version} for the selected runtime context`,
      );
    }
  }
  if (summaries.length === 0 && filter?.read_policy_version !== undefined) {
    const identitySummaries = await listProjectionRuntimeViews(rootDir, adapter, matchesProjectionIdentityFilter(filter));
    if (identitySummaries.length > 0) {
      throw new Error(
        `Latest ${adapter} projection did not satisfy read_policy_version=${filter.read_policy_version} for the selected runtime context`,
      );
    }
  }
  if (projectionSelectionIsAmbiguous(summaries, filter)) {
    throw new Error(
      `Latest ${adapter} projection is ambiguous without full runtime and identity context; provide actor_identity_ref, owner_identity_ref, runtime_instance_ref, runtime_session_ref, or conversation_thread_ref`,
    );
  }
  const latest = summaries[0];
  if (!latest) {
    return undefined;
  }

  return loadProjectionRuntimeView({
    rootDir,
    manifest_id: latest.manifest_id,
    adapter,
    consistency_requirement: filter.consistency_requirement,
  });
}
