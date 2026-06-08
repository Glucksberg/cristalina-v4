import assert from "node:assert/strict";
import test from "node:test";

import { validateValueAgainstJsonSchema, type JsonSchema } from "./schema-runtime.js";
import { validateCoreRecord, validateRetrievalContract, validateSymbolAnchor, validateVectorArtifact } from "./validation.js";

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

test("retrieval contract validation checks external candidate batch identity", () => {
  const valid = validateRetrievalContract({
    id: "external_candidate_batch_contract_001",
    provider_id: "mem0",
    external_run_id: "mem0_run_contract_001",
    query_ref: "retrieval_query_contract_001",
    recipe_ref: "retrieval_recipe_contract_001",
    retrieved_at: "2026-04-21T00:00:00.000Z",
    score_normalization: "provider_raw_cosine",
    candidates: [
      {
        provider_id: "mem0",
        external_candidate_id: "mem0_candidate_contract_001",
        retrieved_at: "2026-04-21T00:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(valid, []);

  const invalid = validateRetrievalContract({
    id: "external_candidate_batch_contract_bad_001",
    provider_id: "mem0",
    retrieved_at: "2026-04-21T00:00:00.000Z",
    candidates: [
      {
        provider_id: "graphiti",
        external_candidate_id: "graphiti_candidate_contract_001",
        retrieved_at: "2026-04-21T00:00:00.000Z",
      },
    ],
  });

  assert.ok(invalid.some((issue) => issue.path === "candidates[0].provider_id"));
  assert.ok(invalid.some((issue) => issue.path === "recipe_ref"));
});

test("reference validation requires full record identity for stored references", () => {
  const invalid = validateCoreRecord({
    id: "prop_reference_contract_bad_001",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: "2026-04-22T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "test",
      source_ref: "src_reference_contract_001",
    },
    operation: "revise",
    candidate_kind: "preference",
    target_layer: "canon",
    target_ref: {
      id: "mem_reference_contract_001",
    },
    candidate_payload: {
      kind: "preference",
    },
    reason: "Reference contract test.",
    evidence_refs: ["src_reference_contract_001"],
    governance_state: "proposed",
  });

  assert.ok(invalid.some((issue) => issue.path === "target_ref.kind"));
  assert.ok(invalid.some((issue) => issue.path === "target_ref.layer"));
});

test("proposal validation rejects ratified as a proposal stage", () => {
  const invalid = validateCoreRecord({
    id: "prop_ratified_stage_contract_bad_001",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: "2026-06-08T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "test",
      source_ref: "proposal-stage-contract",
    },
    operation: "create",
    candidate_kind: "preference",
    target_layer: "canon",
    target_ref: null,
    candidate_payload: {
      kind: "preference",
      semantic_slot: "test.proposal_stage_contract",
      statement: "Proposal stages remain pre-ratification.",
    },
    reason: "Proposal stage contract test.",
    evidence_refs: ["src_proposal_stage_contract_001"],
    governance_state: "ratified",
  });

  assert.ok(invalid.some((issue) =>
    issue.path === "governance_state" &&
    issue.message.includes("received ratified")
  ));
});

test("source record validation keeps content refs inside raw evidence roots", () => {
  function sourceRecord(content_ref: string) {
    return {
      id: `src_contract_${content_ref.replace(/[^A-Za-z0-9._-]+/g, "_") || "empty"}`,
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: "2026-04-22T00:00:00.000Z",
      visibility_state: {
        privacy_scope: "project_private",
      },
      provenance: {
        source_type: "test",
        source_ref: "source-content-ref-contract",
      },
      content_ref,
    };
  }

  for (const content_ref of [
    "raw/sources/conversation-turn-001.json",
    "raw/imports/customer-001.json",
    "raw/attachments/customer-note.pdf",
  ]) {
    assert.deepEqual(validateCoreRecord(sourceRecord(content_ref)), []);
  }

  for (const content_ref of [
    "wiki/index.md",
    "/raw/sources/source-001.json",
    "raw/sources",
    "raw/sources/../sources/source-001.json",
    "raw/sources/../../canon/preferences/mem.json",
    "raw/sources//source-001.json",
    " raw/sources/source-001.json ",
  ]) {
    const issues = validateCoreRecord(sourceRecord(content_ref));
    assert.ok(
      issues.some((issue) => issue.path === "content_ref"),
      `expected content_ref issue for ${JSON.stringify(content_ref)}`,
    );
  }
});

test("working memory checkpoint validation preserves runtime authority boundaries", () => {
  const valid = validateCoreRecord({
    id: "working_memory_checkpoint_contract_001",
    kind: "working_memory_checkpoint",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: "2026-04-22T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "runtime_private",
    },
    provenance: {
      source_type: "runtime_checkpoint",
      source_ref: "session_contract_001",
      evidence_refs: ["session_contract_001", "thread_contract_001"],
    },
    runtime_instance_ref: "runtime_instance_contract_001",
    runtime_session_ref: "session_contract_001",
    conversation_thread_ref: "thread_contract_001",
    continuity_epoch: "epoch_contract_001",
    generation: 1,
    read_policy_version: "runtime_read_policy.v1",
    upstream_refs: ["session_contract_001", "thread_contract_001"],
    status: "active",
  });

  assert.deepEqual(valid, []);

  const invalid = validateCoreRecord({
    id: "working_memory_checkpoint_contract_bad_001",
    kind: "working_memory_checkpoint",
    layer: "derived",
    authoritative_home: "canon",
    created_at: "2026-04-22T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "runtime_private",
    },
    provenance: {
      source_type: "runtime_checkpoint",
      source_ref: "session_contract_001",
    },
    runtime_instance_ref: "runtime_instance_contract_001",
    runtime_session_ref: "session_contract_001",
    conversation_thread_ref: "thread_contract_001",
    continuity_epoch: "epoch_contract_001",
    generation: 0,
    read_policy_version: "runtime_read_policy.v1",
    upstream_refs: [],
    status: "superseded",
  });

  assert.ok(invalid.some((issue) => issue.path === "layer"));
  assert.ok(invalid.some((issue) => issue.path === "authoritative_home"));
  assert.ok(invalid.some((issue) => issue.path === "generation"));
  assert.ok(invalid.some((issue) => issue.path === "upstream_refs"));
  assert.ok(invalid.some((issue) => issue.path === "superseded_by_ref"));
});

test("path-composed runtime refs are rejected before storage path construction", () => {
  for (const runtime_session_ref of ["a/b", "CON", "..rel", "x\0y", "name with space"]) {
    const issues = validateCoreRecord({
      id: `working_memory_checkpoint_bad_ref_${runtime_session_ref.replace(/[^A-Za-z0-9._-]+/g, "_") || "nul"}`,
      kind: "working_memory_checkpoint",
      layer: "runtime",
      authoritative_home: "runtime",
      created_at: "2026-04-22T00:00:00.000Z",
      visibility_state: {
        privacy_scope: "runtime_private",
      },
      provenance: {
        source_type: "runtime_checkpoint",
        source_ref: "session_contract_001",
      },
      runtime_instance_ref: "runtime_instance_contract_001",
      runtime_session_ref,
      conversation_thread_ref: "thread_contract_001",
      continuity_epoch: "epoch_contract_001",
      generation: 1,
      read_policy_version: "runtime_read_policy.v1",
      upstream_refs: ["session_contract_001", "thread_contract_001"],
      status: "active",
    });

    assert.ok(
      issues.some((issue) => issue.path === "runtime_session_ref"),
      `expected runtime_session_ref issue for ${JSON.stringify(runtime_session_ref)}`,
    );
  }
});

test("vector artifact validation keeps vector metadata derived and source-bound", () => {
  const validChunk = validateVectorArtifact({
    id: "vchunk_001",
    kind: "vector_chunk",
    layer: "derived",
    authoritative_home: "raw",
    created_at: "2026-04-21T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "vector_chunking_fixture",
      source_ref: "source_001",
    },
    source_ref: "source_001",
    source_layer: "raw",
    chunk_text_ref: {
      path: "derived/vector/chunks/vchunk_001.txt",
      checksum: "sha256:text",
      encoding: "utf8_text",
      generation_id: "chunk_gen_001",
      producing_ref: "vchunk_001",
    },
    chunk_hash: "sha256:chunk",
    chunk_policy_version: "chunk_policy.v1",
    symbol_refs: ["sym:concept/user-interaction-preferences"],
    upstream_refs: ["source_001"],
    corpus_generation: "corpus_gen_001",
    chunk_generation: "chunk_gen_001",
    normalized_text_hash: "sha256:normalized",
    source_record_hash: "sha256:source",
  });

  assert.deepEqual(validChunk, []);

  const invalidEmbedding = validateVectorArtifact({
    id: "embed_001",
    kind: "embedding_record",
    layer: "derived",
    authoritative_home: "raw",
    created_at: "2026-04-21T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "deterministic_embedding_fixture",
      source_ref: "vchunk_001",
    },
    chunk_ref: "vchunk_001",
    embedding_model_ref: "embedding_model_fixture_001",
    dimensions: 3,
    metric: "cosine",
    vector_ref: {
      path: "derived/vector/embeddings/embed_001.json",
      checksum: "sha256:vector",
      encoding: "json_float32",
      dimensions: 2,
      generation_id: "embedding_gen_001",
      producing_ref: "embed_001",
    },
    source_text_hash: "sha256:chunk",
    embedding_generation: "embedding_gen_001",
    vector_encoding: "json_float32",
    vector_checksum: "sha256:different",
  });

  assert.ok(invalidEmbedding.some((issue) => issue.path === "vector_ref.dimensions"));
  assert.ok(invalidEmbedding.some((issue) => issue.path === "vector_checksum"));
});

test("vector index validation requires explicit ANN strategy and exact baseline", () => {
  const baseIndex = {
    id: "vector_index_ann_contract_001",
    kind: "vector_index_manifest" as const,
    layer: "derived" as const,
    authoritative_home: "governance" as const,
    created_at: "2026-04-21T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "project_private" as const,
    },
    provenance: {
      source_type: "vector_maintenance",
      source_ref: "vector_corpus_ann_contract_001",
    },
    index_ref: {
      path: "derived/vector/indexes/vector_index_ann_contract_001.json",
      checksum: "sha256:index",
      encoding: "json_float32" as const,
      dimensions: 3,
      generation_id: "index_gen_ann_contract_001",
      producing_ref: "vector_index_ann_contract_001",
    },
    corpus_ref: "vector_corpus_ann_contract_001",
    embedding_model_ref: "embedding_model_ann_contract_001",
    dimensions: 3,
    metric: "cosine" as const,
    index_kind: "ann" as const,
    chunk_policy_version: "chunk_policy.v1",
    source_refs: ["source_ann_contract_001"],
    corpus_generation: "corpus_gen_ann_contract_001",
    embedding_generation: "embedding_gen_ann_contract_001",
    index_generation: "index_gen_ann_contract_001",
    vector_encoding: "json_float32" as const,
    index_checksum: "sha256:index",
  };

  const validAnn = validateVectorArtifact({
    ...baseIndex,
    ann_strategy: "deterministic_fixture_lsh",
    ann_parameters: {
      bucket_count: 8,
      deterministic_fixture: true,
    },
    exact_baseline_index_ref: "vector_index_exact_contract_001",
    ann_recall_floor: 0.95,
    ann_baseline_eval_ref: "retrieval_eval_run_exact_vs_ann_contract_001",
  });

  assert.deepEqual(validAnn, []);

  const invalidAnn = validateVectorArtifact(baseIndex);

  assert.ok(invalidAnn.some((issue) => issue.path === "ann_strategy"));
  assert.ok(invalidAnn.some((issue) => issue.path === "ann_parameters"));
  assert.ok(invalidAnn.some((issue) => issue.path === "exact_baseline_index_ref"));
  assert.ok(invalidAnn.some((issue) => issue.path === "ann_recall_floor"));

  const invalidExact = validateVectorArtifact({
    ...baseIndex,
    index_kind: "exact",
    ann_strategy: "deterministic_fixture_lsh",
    ann_parameters: {
      bucket_count: 8,
    },
    exact_baseline_index_ref: "vector_index_exact_contract_001",
    ann_recall_floor: 0.95,
  });

  assert.ok(invalidExact.some((issue) => issue.path === "ann_strategy"));
  assert.ok(invalidExact.some((issue) => issue.message === "exact vector indexes cannot carry ANN metadata"));
});
