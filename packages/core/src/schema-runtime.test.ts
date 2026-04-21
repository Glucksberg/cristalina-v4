import assert from "node:assert/strict";
import test from "node:test";

import { validateValueAgainstJsonSchema, type JsonSchema } from "./schema-runtime.js";
import { validateRetrievalContract, validateSymbolAnchor } from "./validation.js";

test("schema runtime supports broader object, array, and local-ref features", () => {
  const schema: JsonSchema = {
    $id: "test://schema-runtime/broader",
    type: "object",
    minProperties: 3,
    maxProperties: 8,
    propertyNames: {
      pattern: "^[a-z_]+$",
    },
    required: ["kind", "count", "tags"],
    dependentRequired: {
      dependent: ["evidence_ref"],
    },
    properties: {
      kind: {
        const: "structured",
      },
      count: {
        type: "integer",
        minimum: 1,
        maximum: 3,
      },
      tags: {
        type: "array",
        minItems: 2,
        uniqueItems: true,
        prefixItems: [
          { type: "string", minLength: 3 },
          { type: "string", anyOf: [{ const: "checked" }, { const: "queued" }] },
        ],
        items: {
          type: "string",
          minLength: 3,
        },
      },
      nested: {
        $defs: {
          label: {
            type: "string",
            minLength: 2,
          },
        },
        anyOf: [
          { type: "null" },
          {
            type: "object",
            required: ["label"],
            properties: {
              label: {
                $ref: "#/$defs/label",
              },
            },
            additionalProperties: false,
          },
        ],
      },
      mode: {
        type: "string",
        not: { const: "illegal" },
      },
      evidence_ref: {
        type: "string",
        minLength: 3,
      },
    },
    additionalProperties: {
      type: "string",
      minLength: 2,
    },
  };

  const valid = validateValueAgainstJsonSchema(
    {
      kind: "structured",
      count: 2,
      tags: ["stable", "checked"],
      named_extra: "ok",
      dependent: "yes",
      evidence_ref: "obs_001",
      nested: {
        label: "ok",
      },
      mode: "safe",
    },
    schema,
  );

  assert.deepEqual(valid, []);

  const invalid = validateValueAgainstJsonSchema(
    {
      kind: "structured",
      count: 4,
      tags: ["no", "bad", "bad"],
      dependent: "yes",
      evidence_ref: "x",
      nested: {
        label: "x",
        extra: true,
      },
      mode: "illegal",
      "Bad-Name": "oops",
    },
    schema,
  );

  assert.ok(invalid.some((issue) => issue.path === "count"));
  assert.ok(invalid.some((issue) => issue.path === "tags"));
  assert.ok(invalid.some((issue) => issue.path === "tags[0]"));
  assert.ok(invalid.some((issue) => issue.path === "nested"));
  assert.ok(invalid.some((issue) => issue.path === "mode"));
  assert.ok(invalid.some((issue) => issue.path === "Bad-Name"));
});

test("schema runtime treats undefined object properties as absent JSON fields", () => {
  const schema: JsonSchema = {
    type: "object",
    required: ["id"],
    properties: {
      id: {
        type: "string",
        minLength: 1,
      },
      optional_ref: {
        type: ["string", "null"],
      },
    },
    additionalProperties: false,
  };

  const issues = validateValueAgainstJsonSchema(
    {
      id: "obj_001",
      optional_ref: undefined,
    },
    schema,
  );

  assert.deepEqual(issues, []);
});

test("symbol anchor validation preserves navigation-only lifecycle law", () => {
  const valid = validateSymbolAnchor({
    id: "sym:concept/user-interaction-preferences",
    kind: "concept",
    label: "User interaction preferences",
    aliases: ["answer style"],
    target_refs: ["wiki_claim_001", "canon_preference_001"],
    upstream_refs: ["source_001"],
    authority: "navigation_only",
    lifecycle_state: "active",
    namespace: "concept",
  });

  assert.deepEqual(valid, []);

  const invalid = validateSymbolAnchor({
    id: "sym:concept/user-interaction-preferences",
    kind: "concept",
    label: "User interaction preferences",
    aliases: [],
    target_refs: [],
    upstream_refs: [],
    authority: "navigation_only",
    lifecycle_state: "active",
    namespace: "entity",
    merged_into_ref: "sym:concept/answer-style",
  });

  assert.ok(invalid.some((issue) => issue.path === "id"));
  assert.ok(invalid.some((issue) => issue.path === "merged_into_ref"));
});

test("retrieval contract validation requires upstream refs for proposal support", () => {
  const invalid = validateRetrievalContract({
    id: "candidate_wiki_editorial_001",
    ref: {
      id: "wiki_claim_001",
      kind: "wiki_claim",
      layer: "wiki",
    },
    layer: "wiki",
    authority: "editorial",
    symbol_refs: ["sym:concept/user-interaction-preferences"],
    why_retrieved: ["matched symbol anchor"],
    can_support_proposal: true,
  });

  assert.ok(invalid.some((issue) => issue.path === "eligible_upstream_refs"));

  const valid = validateRetrievalContract({
    id: "candidate_canon_001",
    ref: {
      id: "canon_preference_001",
      kind: "preference",
      layer: "canon",
    },
    layer: "canon",
    authority: "canon",
    symbol_refs: ["sym:concept/user-interaction-preferences"],
    semantic_slot: "preference.answer_style",
    vector_score: 0.82,
    authority_score: 1,
    final_score: 1.82,
    why_retrieved: ["matched symbol anchor", "matched deterministic vector"],
    can_support_proposal: true,
    eligible_upstream_refs: ["canon_preference_001"],
  });

  assert.deepEqual(valid, []);
});
