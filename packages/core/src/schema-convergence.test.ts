import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  EPISTEMIC_STATES,
  GOVERNANCE_STATES,
  TEMPORAL_STATUSES,
  VISIBILITY_SCOPES,
} from "./types.js";

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
  const schemaPath = resolve(process.cwd(), pathFromRepoRoot);
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

  assert.deepEqual(expectEnum(properties.epistemic_state), [...EPISTEMIC_STATES]);
  assert.deepEqual(expectEnum(properties.governance_state), [...GOVERNANCE_STATES]);
  assert.deepEqual(expectEnum(visibilityState?.properties?.privacy_scope), [...VISIBILITY_SCOPES]);
  assert.deepEqual(expectEnum(temporalState?.properties?.temporal_status), [...TEMPORAL_STATUSES]);
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
