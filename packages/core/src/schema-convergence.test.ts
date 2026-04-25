import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CONTRADICTION_RESOLUTION_STATUSES,
  CONTRADICTION_RESOLUTION_STRATEGIES,
  ACTOR_KINDS,
  AUTHENTICATED_PRINCIPAL_KINDS,
  DISPOSITION_OUTCOMES,
  EPISTEMIC_STATES,
  GOVERNANCE_STATES,
  LAYERS,
  MEMORY_OBJECT_KINDS,
  RUNTIMES,
  NON_CANONICAL_INTAKE_MODES,
  RETRIEVAL_AUTHORITIES,
  RETRIEVAL_EXTERNAL_CANDIDATE_POLICIES,
  RETRIEVAL_SUPPRESSION_REASONS,
  SESSION_RESUME_RECEIPT_STATUSES,
  SOURCE_INTAKE_KINDS,
  SUBJECT_AUTHORITY_ROLES,
  SYMBOL_ANCHOR_KINDS,
  SYMBOL_ANCHOR_LIFECYCLE_STATES,
  TEMPORAL_STATUSES,
  VECTOR_BLOB_ENCODINGS,
  VECTOR_ANN_STRATEGIES,
  VECTOR_ENCODINGS,
  VECTOR_EXPORT_JSONL_ROW_KINDS,
  VECTOR_INDEX_KINDS,
  VECTOR_MAINTENANCE_JOBS,
  VECTOR_METRICS,
  VISIBILITY_SCOPES,
  WIKI_GRAPH_EDGE_TYPES,
  WIKI_MAINTENANCE_EVENTS,
} from "./types.js";
import { resolvePreferenceSignalSemanticProfile } from "./workflow-engine/source-intake.js";

interface JsonSchema {
  properties?: Record<string, unknown>;
  $defs?: Record<string, JsonSchema>;
  allOf?: Array<{
    properties?: Record<string, unknown>;
  }>;
  oneOf?: JsonSchema[];
}

interface EnumProperty {
  enum?: string[];
}

async function readSchema(pathFromRepoRoot: string): Promise<JsonSchema> {
  const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", pathFromRepoRoot);
  const source = await readFile(schemaPath, "utf8");
  return JSON.parse(source) as JsonSchema;
}

function expectEnum(property: unknown): string[] {
  assert.ok(property && typeof property === "object", "schema property must be an object");
  assert.ok(Array.isArray((property as EnumProperty).enum), "schema property must expose an enum");
  return (property as EnumProperty).enum as string[];
}

function expectOneOfLocalDefs(schema: JsonSchema): string[] {
  const defs = schema.$defs ?? {};
  const refs = (schema.oneOf ?? []).map((entry) => {
    const ref = (entry as { $ref?: string }).$ref;
    if (typeof ref !== "string" || !ref.startsWith("#/$defs/")) {
      assert.fail("oneOf branch must point at a local definition");
    }
    return ref.slice("#/$defs/".length);
  });
  for (const ref of refs) {
    assert.ok(defs[ref], `missing local definition for ${ref}`);
  }
  return refs;
}

function expectPatternMatch(pattern: string | undefined, accepted: string[], rejected: string[]): void {
  assert.equal(typeof pattern, "string");
  const regex = new RegExp(pattern!);
  for (const value of accepted) {
    assert.equal(regex.test(value), true, `${pattern} should accept ${JSON.stringify(value)}`);
  }
  for (const value of rejected) {
    assert.equal(regex.test(value), false, `${pattern} should reject ${JSON.stringify(value)}`);
  }
}

test("object envelope schema enums stay aligned with runtime validation enums", async () => {
  const schema = await readSchema("../../schemas/object-envelope.schema.json");
  const properties = schema.properties ?? {};
  const visibilityState = properties.visibility_state as { properties?: Record<string, unknown> } | undefined;
  const temporalState = properties.temporal_state as { properties?: Record<string, unknown> } | undefined;
  const provenance = properties.provenance as { properties?: Record<string, unknown> } | undefined;

  assert.deepEqual(expectEnum(properties.epistemic_state), [...EPISTEMIC_STATES]);
  assert.deepEqual(expectEnum(properties.governance_state), [...GOVERNANCE_STATES]);
  assert.deepEqual(expectEnum(visibilityState?.properties?.privacy_scope), [...VISIBILITY_SCOPES]);
  assert.deepEqual(expectEnum(temporalState?.properties?.temporal_status), [...TEMPORAL_STATUSES]);
  assert.deepEqual((provenance?.properties?.speaker_ref as { type?: string[] } | undefined)?.type, ["string", "null"]);
});

test("canonical memory schema stays aligned with hardened canonical governance states", async () => {
  const schema = await readSchema("../../schemas/memory-object.schema.json");
  const objectVariant = schema.allOf?.[1];
  const properties = objectVariant?.properties ?? {};

  assert.deepEqual(expectEnum(properties.epistemic_state), [...EPISTEMIC_STATES]);
  assert.deepEqual(expectEnum(properties.governance_state), ["ratified", "superseded", "archived"]);
  assert.deepEqual(
    expectEnum((properties.temporal_state as { properties?: Record<string, unknown> } | undefined)?.properties?.temporal_status),
    [...TEMPORAL_STATUSES],
  );
});

test("disposition schema stays aligned with executable disposition enums", async () => {
  const schema = await readSchema("../../schemas/disposition-record.schema.json");
  const variant = schema.allOf?.[1];
  const properties = variant?.properties ?? {};

  assert.deepEqual(
    expectEnum((properties.outcomes as { items?: unknown } | undefined)?.items),
    [...DISPOSITION_OUTCOMES],
  );
});

test("runtime identity schema stays aligned with runtime and actor enums", async () => {
  const schema = await readSchema("../../schemas/runtime-identity.schema.json");
  const variants = schema.allOf?.[1] as { oneOf?: Array<{ properties?: Record<string, unknown> }> } | undefined;
  const actorVariant = variants?.oneOf?.[0];
  const runtimeInstanceVariant = variants?.oneOf?.[1];
  const checkpointVariant = variants?.oneOf?.[3];

  assert.deepEqual(expectEnum(actorVariant?.properties?.actor_kind), [...ACTOR_KINDS]);
  assert.deepEqual(expectEnum(runtimeInstanceVariant?.properties?.runtime), [...RUNTIMES]);
  assert.deepEqual(expectEnum(checkpointVariant?.properties?.status), ["active", "superseded", "invalidated"]);
});

test("session resume receipt schema stays aligned with executable receipt statuses", async () => {
  const schema = await readSchema("../../schemas/session-resume-receipt.schema.json");
  const variant = (schema.allOf?.[1] ?? {}) as { properties?: Record<string, unknown>; required?: string[] };
  const properties = variant?.properties ?? {};
  const required = Array.isArray(variant.required) ? variant.required : [];

  assert.deepEqual(expectEnum(properties.receipt_status), [...SESSION_RESUME_RECEIPT_STATUSES]);
  assert.deepEqual(expectEnum(properties.adapter), ["openclaw", "hermes"]);
  assert.ok(required.includes("authenticated_principal"));
});

test("temporal world schema stays aligned with executable world-model enums", async () => {
  const schema = await readSchema("../../schemas/temporal-world-record.schema.json");
  const variants = schema.allOf?.[1] as { oneOf?: Array<{ properties?: Record<string, unknown> }> } | undefined;
  const worldClaimVariant = variants?.oneOf?.[3];
  const contradictionVariant = variants?.oneOf?.[4];
  const worldClaimTemporal = worldClaimVariant?.properties?.temporal_state as { properties?: Record<string, unknown> } | undefined;

  assert.deepEqual(
    expectEnum(worldClaimVariant?.properties?.kind),
    MEMORY_OBJECT_KINDS.filter((kind) => !["entity", "relation", "episode"].includes(kind)),
  );
  assert.deepEqual(expectEnum(worldClaimVariant?.properties?.epistemic_state), [...EPISTEMIC_STATES]);
  assert.deepEqual(expectEnum(worldClaimTemporal?.properties?.temporal_status), [...TEMPORAL_STATUSES]);
  assert.deepEqual(expectEnum(contradictionVariant?.properties?.status), ["open", "resolved", "dismissed"]);
});

test("contradiction resolution schema stays aligned with executable resolution enums", async () => {
  const schema = await readSchema("../../schemas/contradiction-resolution.schema.json");
  const variant = schema.allOf?.[1];
  const properties = variant?.properties ?? {};
  const acceptedAt = properties.accepted_at as { type?: unknown } | undefined;
  const rejectedAt = properties.rejected_at as { type?: unknown } | undefined;
  const appliedAt = properties.applied_at as { type?: unknown } | undefined;

  assert.deepEqual(expectEnum(properties.strategy), [...CONTRADICTION_RESOLUTION_STRATEGIES]);
  assert.deepEqual(expectEnum(properties.status), [...CONTRADICTION_RESOLUTION_STATUSES]);
  assert.equal(acceptedAt?.type, "string");
  assert.equal(rejectedAt?.type, "string");
  assert.equal(appliedAt?.type, "string");
});

test("source intake profile schema stays aligned with executable intake kinds", async () => {
  const schema = await readSchema("../../schemas/source-intake-profile.schema.json");
  const properties = schema.properties ?? {};
  const profile = resolvePreferenceSignalSemanticProfile({
    kind: "structured_preference_signal",
  });

  assert.deepEqual(expectEnum(properties.intake_kind), [...SOURCE_INTAKE_KINDS]);
  assert.deepEqual(expectEnum(properties.subject_authority_role), [...SUBJECT_AUTHORITY_ROLES]);
  assert.equal(typeof profile.episode_summary, "string");
  assert.equal(typeof profile.wiki_path, "string");
  assert.equal(typeof profile.relation_type, "string");
  assert.equal(profile.subject_label, "Conversation Participant");
  assert.equal(profile.subject_authority_role, "participant");
});

test("registered intake profile schema captures generic runner contract", async () => {
  const schema = await readSchema("../../schemas/registered-intake-profile.schema.json");
  const properties = schema.properties ?? {};

  assert.deepEqual(expectEnum(properties.intake_kind), [...SOURCE_INTAKE_KINDS]);
  assert.equal((properties.runner_contract_version as { const?: string } | undefined)?.const, "registered_intake_profile.v1");
  assert.deepEqual(expectEnum(properties.contradiction_detection), ["optional", "none"]);
  assert.equal((properties.projection_recompilation_inputs as { type?: string } | undefined)?.type, "array");
});

test("non-canonical intake schema stays aligned with executable disposition modes", async () => {
  const schema = await readSchema("../../schemas/non-canonical-intake.schema.json");
  const properties = schema.properties ?? {};
  const source = properties.source as { properties?: Record<string, unknown> } | undefined;
  const contentRef = source?.properties?.content_ref as { pattern?: string } | undefined;

  assert.deepEqual(expectEnum(properties.mode), [...NON_CANONICAL_INTAKE_MODES]);
  assert.ok(contentRef?.pattern?.includes("raw/(sources|imports|attachments)/"));
  assert.ok(contentRef?.pattern?.includes("\\.\\."));
  expectPatternMatch(
    contentRef?.pattern,
    [
      "raw/sources/source-001.json",
      "raw/imports/customer-001.json",
      "raw/attachments/customer-note.pdf",
    ],
    [
      "wiki/index.md",
      "raw/sources",
      "raw/sources/.",
      "raw/sources/..",
      "raw/sources/../source-001.json",
      "raw/sources/./source-001.json",
      "raw/sources//source-001.json",
    ],
  );
});

test("wiki maintenance run schema stays aligned with executable wiki events", async () => {
  const schema = await readSchema("../../schemas/wiki-maintenance-run.schema.json");
  const properties = schema.properties ?? {};
  const graphEdgeItems = (properties.graph_edges as { items?: { properties?: Record<string, unknown> } } | undefined)?.items;

  assert.deepEqual(expectEnum(properties.event), [...WIKI_MAINTENANCE_EVENTS]);
  assert.deepEqual(expectEnum(graphEdgeItems?.properties?.edge_type), [...WIKI_GRAPH_EDGE_TYPES]);
});

test("symbol anchor schema stays aligned with symbolic retrieval enums", async () => {
  const schema = await readSchema("../../schemas/symbol-anchor.schema.json");
  const properties = schema.properties ?? {};

  assert.deepEqual(expectEnum(properties.kind), [...SYMBOL_ANCHOR_KINDS]);
  assert.deepEqual(expectEnum(properties.lifecycle_state), [...SYMBOL_ANCHOR_LIFECYCLE_STATES]);
  assert.equal((properties.authority as { const?: string } | undefined)?.const, "navigation_only");
});

test("retrieval contracts schema stays aligned with core retrieval enums", async () => {
  const schema = await readSchema("../../schemas/retrieval-contracts.schema.json");
  const defs = schema.$defs ?? {};
  const layer = defs.Layer;
  const visibility = defs.VisibilityState;
  const authenticatedPrincipal = defs.AuthenticatedPrincipal;
  const candidate = defs.RetrievalCandidate;
  const recipe = defs.RetrievalRecipe;
  const result = defs.RetrievalResult;
  const trace = defs.RetrievalTrace;
  const suppressionReason = defs.RetrievalSuppressionReason;

  assert.deepEqual(expectOneOfLocalDefs(schema), [
    "RetrievalQuery",
    "RetrievalRecipe",
    "RetrievalCandidate",
    "ExternalRetrievalCandidate",
    "ExternalCandidateBatch",
    "RetrievalResult",
    "RetrievalTrace",
  ]);
  assert.deepEqual(expectEnum(layer), [...LAYERS]);
  assert.deepEqual(expectEnum(visibility?.properties?.privacy_scope), [...VISIBILITY_SCOPES]);
  assert.deepEqual(expectEnum(authenticatedPrincipal?.properties?.kind), [...AUTHENTICATED_PRINCIPAL_KINDS]);
  assert.deepEqual(expectEnum(candidate?.properties?.authority), [...RETRIEVAL_AUTHORITIES]);
  assert.deepEqual(expectEnum(suppressionReason), [...RETRIEVAL_SUPPRESSION_REASONS]);
  assert.deepEqual(expectEnum(recipe?.properties?.external_candidate_policy), [...RETRIEVAL_EXTERNAL_CANDIDATE_POLICIES]);
  assert.equal((result?.properties?.read_policy_version as { type?: string } | undefined)?.type, "string");
  assert.equal((trace?.properties?.read_policy_version as { type?: string } | undefined)?.type, "string");
});

test("vector artifact schema stays aligned with vector object enums", async () => {
  const schema = await readSchema("../../schemas/vector-artifacts.schema.json");
  const defs = schema.$defs ?? {};

  assert.deepEqual(expectOneOfLocalDefs(schema), [
    "VectorCorpus",
    "VectorChunk",
    "EmbeddingModelManifest",
    "EmbeddingRecord",
    "EmbeddingBatchRun",
    "VectorIndexManifest",
    "VectorSearchRun",
    "RetrievalAudit",
    "RetrievalEvalRun",
    "VectorMaintenanceRun",
    "VectorExportJsonlRow",
  ]);
  assert.deepEqual(expectEnum(defs.Layer), [...LAYERS]);
  assert.deepEqual(expectEnum(defs.VectorMetric), [...VECTOR_METRICS]);
  assert.deepEqual(expectEnum(defs.VectorEncoding), [...VECTOR_ENCODINGS]);
  assert.deepEqual(expectEnum(defs.VectorBlobEncoding), [...VECTOR_BLOB_ENCODINGS]);
  assert.deepEqual(expectEnum(defs.VectorIndexKind), [...VECTOR_INDEX_KINDS]);
  assert.deepEqual(expectEnum(defs.VectorAnnStrategy), [...VECTOR_ANN_STRATEGIES]);
  assert.deepEqual(expectEnum(defs.VectorMaintenanceJob), [...VECTOR_MAINTENANCE_JOBS]);
  assert.deepEqual(expectEnum(defs.VectorExportJsonlRowKind), [...VECTOR_EXPORT_JSONL_ROW_KINDS]);
  assert.deepEqual(expectEnum(defs.RetrievalSuppressionReason), [...RETRIEVAL_SUPPRESSION_REASONS]);
});

test("projection manifest schema stays aligned with adapter and read-discipline contracts", async () => {
  const schema = await readSchema("../../schemas/projection-manifest.schema.json");
  const variant = schema.allOf?.[1];
  const properties = variant?.properties ?? {};

  assert.deepEqual(expectEnum(properties.adapter), ["openclaw", "hermes"]);
  assert.equal((properties.read_policy_version as { type?: string } | undefined)?.type, "string");
  assert.equal((properties.compiler_version as { type?: string } | undefined)?.type, "string");
  assert.deepEqual((properties.owner_identity_ref as { type?: string[] } | undefined)?.type, ["string", "null"]);
  assert.deepEqual((properties.source_checkpoint_ref as { type?: string[] } | undefined)?.type, ["string", "null"]);
  assert.deepEqual((properties.continuity_epoch as { type?: string[] } | undefined)?.type, ["string", "null"]);
  assert.deepEqual((properties.generation as { type?: string[] } | undefined)?.type, ["integer", "null"]);
  assert.equal((properties.snapshot_strategy as { type?: string } | undefined)?.type, "string");
  assert.deepEqual(
    (properties.snapshot_strategy as { enum?: string[] } | undefined)?.enum,
    ["mixed_state_tolerant", "checkpoint_consistent"],
  );
  assert.deepEqual((properties.boundary_note as { type?: string[] } | undefined)?.type, ["string", "null"]);
  assert.deepEqual((properties.observed_layer_updates as { type?: string[] } | undefined)?.type, ["object", "null"]);
  assert.equal((properties.context_refs as { type?: string } | undefined)?.type, "array");
  assert.equal((properties.review_refs as { type?: string } | undefined)?.type, "array");
  assert.equal((properties.retrieval_trace_refs as { type?: string } | undefined)?.type, "array");
  assert.equal((properties.included_retrieval_candidate_refs as { type?: string } | undefined)?.type, "array");
  assert.equal((properties.suppressed_retrieval_candidate_refs as { type?: string } | undefined)?.type, "array");
  assert.equal((properties.retrieval_traces as { type?: string } | undefined)?.type, "array");
});
