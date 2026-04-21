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
  SOURCE_INTAKE_KINDS,
  SUBJECT_AUTHORITY_ROLES,
  SYMBOL_ANCHOR_KINDS,
  SYMBOL_ANCHOR_LIFECYCLE_STATES,
  TEMPORAL_STATUSES,
  VECTOR_BLOB_ENCODINGS,
  VECTOR_ENCODINGS,
  VECTOR_INDEX_KINDS,
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

  assert.deepEqual(expectEnum(actorVariant?.properties?.actor_kind), [...ACTOR_KINDS]);
  assert.deepEqual(expectEnum(runtimeInstanceVariant?.properties?.runtime), [...RUNTIMES]);
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

  assert.deepEqual(expectEnum(properties.strategy), [...CONTRADICTION_RESOLUTION_STRATEGIES]);
  assert.deepEqual(expectEnum(properties.status), [...CONTRADICTION_RESOLUTION_STATUSES]);
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

  assert.deepEqual(expectEnum(properties.mode), [...NON_CANONICAL_INTAKE_MODES]);
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
  const suppressionReason = defs.RetrievalSuppressionReason;

  assert.deepEqual(expectOneOfLocalDefs(schema), [
    "RetrievalQuery",
    "RetrievalRecipe",
    "RetrievalCandidate",
    "RetrievalResult",
    "RetrievalTrace",
  ]);
  assert.deepEqual(expectEnum(layer), [...LAYERS]);
  assert.deepEqual(expectEnum(visibility?.properties?.privacy_scope), [...VISIBILITY_SCOPES]);
  assert.deepEqual(expectEnum(authenticatedPrincipal?.properties?.kind), [...AUTHENTICATED_PRINCIPAL_KINDS]);
  assert.deepEqual(expectEnum(candidate?.properties?.authority), [...RETRIEVAL_AUTHORITIES]);
  assert.deepEqual(expectEnum(suppressionReason), [...RETRIEVAL_SUPPRESSION_REASONS]);
  assert.deepEqual(expectEnum(recipe?.properties?.external_candidate_policy), [...RETRIEVAL_EXTERNAL_CANDIDATE_POLICIES]);
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
  ]);
  assert.deepEqual(expectEnum(defs.Layer), [...LAYERS]);
  assert.deepEqual(expectEnum(defs.VectorMetric), [...VECTOR_METRICS]);
  assert.deepEqual(expectEnum(defs.VectorEncoding), [...VECTOR_ENCODINGS]);
  assert.deepEqual(expectEnum(defs.VectorBlobEncoding), [...VECTOR_BLOB_ENCODINGS]);
  assert.deepEqual(expectEnum(defs.VectorIndexKind), [...VECTOR_INDEX_KINDS]);
  assert.deepEqual(expectEnum(defs.RetrievalSuppressionReason), [...RETRIEVAL_SUPPRESSION_REASONS]);
});

test("projection manifest schema stays aligned with adapter and read-discipline contracts", async () => {
  const schema = await readSchema("../../schemas/projection-manifest.schema.json");
  const variant = schema.allOf?.[1];
  const properties = variant?.properties ?? {};

  assert.deepEqual(expectEnum(properties.adapter), ["openclaw", "hermes"]);
  assert.equal((properties.read_policy_version as { type?: string } | undefined)?.type, "string");
  assert.deepEqual((properties.owner_identity_ref as { type?: string[] } | undefined)?.type, ["string", "null"]);
  assert.equal((properties.context_refs as { type?: string } | undefined)?.type, "array");
  assert.equal((properties.review_refs as { type?: string } | undefined)?.type, "array");
});
