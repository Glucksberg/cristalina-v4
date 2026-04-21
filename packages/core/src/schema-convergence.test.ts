import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CONTRADICTION_RESOLUTION_STATUSES,
  CONTRADICTION_RESOLUTION_STRATEGIES,
  ACTOR_KINDS,
  DISPOSITION_OUTCOMES,
  EPISTEMIC_STATES,
  GOVERNANCE_STATES,
  MEMORY_OBJECT_KINDS,
  RUNTIMES,
  NON_CANONICAL_INTAKE_MODES,
  SOURCE_INTAKE_KINDS,
  SUBJECT_AUTHORITY_ROLES,
  TEMPORAL_STATUSES,
  VISIBILITY_SCOPES,
} from "./types.js";
import { resolvePreferenceSignalSemanticProfile } from "./workflow-engine/source-intake.js";

interface JsonSchema {
  properties?: Record<string, unknown>;
  allOf?: Array<{
    properties?: Record<string, unknown>;
  }>;
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
