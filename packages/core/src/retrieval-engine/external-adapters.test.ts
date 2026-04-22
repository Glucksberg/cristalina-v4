import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateRetrievalContract } from "../validation.js";
import { normalizeExternalCandidateBatch } from "./external-candidates.js";
import { importGraphitiCandidateBatch, importMem0CandidateBatch } from "./external-adapters.js";

const retrieved_at = "2026-04-22T00:00:00.000Z";

test("Mem0 import adapter emits normalized external candidate batches without granting authority", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const batch = importMem0CandidateBatch({
    id: "external_candidate_batch_mem0_import_001",
    retrieved_at,
    query_ref: "retrieval_query_mem0_import_001",
    recipe_ref: fixture.recipe.id,
    score_normalization: "provider_raw_cosine",
    model_ref: "mem0_model_fixture_001",
    index_ref: "mem0_index_fixture_001",
    memories: [
      {
        id: "mem0_memory_001",
        memory: fixture.canonical_record.statement,
        score: 0.94,
      },
      {
        id: "mem0_memory_unmapped_001",
        memory: "External memory without Cristalina provenance.",
        score: 0.9,
      },
    ],
    mappings: {
      mem0_memory_001: {
        mapped_ref: {
          id: fixture.canonical_record.id,
          kind: fixture.canonical_record.kind,
          layer: fixture.canonical_record.layer,
        },
        source_layer: "canon",
        authority: "canon",
        symbol_refs: [fixture.symbol_anchor.id],
        semantic_slot: fixture.canonical_record.semantic_slot,
      },
    },
  });

  assert.equal(batch.provider_id, "mem0");
  assert.deepEqual(validateRetrievalContract(batch), []);

  const [mapped, unmapped] = normalizeExternalCandidateBatch({
    recipe: {
      ...fixture.recipe,
      external_candidate_policy: "allow_normalized",
    },
    batch,
  });

  assert.ok(mapped);
  assert.ok(unmapped);
  assert.equal(mapped.ref.id, fixture.canonical_record.id);
  assert.equal(mapped.authority, "canon");
  assert.equal(mapped.can_support_proposal, false);
  assert.deepEqual(unmapped.suppression_reasons, ["invalid_external_candidate"]);
});

test("Graphiti import adapter preserves invalidation as unsupported mapping diagnostics", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const batch = importGraphitiCandidateBatch({
    id: "external_candidate_batch_graphiti_import_001",
    retrieved_at,
    query_ref: "retrieval_query_graphiti_import_001",
    recipe_ref: fixture.recipe.id,
    score_normalization: "provider_rank_score",
    candidates: [
      {
        uuid: "graphiti_edge_001",
        fact: fixture.world_claim.statement,
        score: 0.89,
        invalid_at: "2026-04-21T00:00:00.000Z",
      },
    ],
    mappings: {
      graphiti_edge_001: {
        mapped_ref: {
          id: fixture.world_claim.id,
          kind: fixture.world_claim.kind,
          layer: fixture.world_claim.layer,
        },
        source_layer: "world",
        authority: "world",
        symbol_refs: [fixture.symbol_anchor.id],
        semantic_slot: fixture.world_claim.semantic_slot,
      },
    },
  });

  assert.equal(batch.provider_id, "graphiti");
  assert.deepEqual(validateRetrievalContract(batch), []);

  const [candidate] = normalizeExternalCandidateBatch({
    recipe: {
      ...fixture.recipe,
      external_candidate_policy: "allow_normalized",
    },
    batch,
  });

  assert.ok(candidate);
  assert.equal(candidate.ref.id, fixture.world_claim.id);
  assert.deepEqual(candidate.suppression_reasons, ["invalid_external_candidate"]);
  assert.ok(candidate.why_retrieved.includes("unsupported mapping: graphiti_candidate_invalidated"));
});
