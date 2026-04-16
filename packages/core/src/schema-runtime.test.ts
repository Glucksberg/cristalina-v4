import assert from "node:assert/strict";
import test from "node:test";

import { validateValueAgainstJsonSchema, type JsonSchema } from "./schema-runtime.js";

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
