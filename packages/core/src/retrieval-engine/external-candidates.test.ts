import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateRetrievalContract } from "../validation.js";
import { executeHybridRetrieval } from "./exact-vector.js";
import { normalizeExternalCandidates } from "./external-candidates.js";

test("external candidate normalization preserves mapped refs without granting proposal support", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const [candidate] = normalizeExternalCandidates({
    recipe: {
      ...fixture.recipe,
      external_candidate_policy: "allow_normalized",
    },
    candidates: [
      {
        provider_id: "benchmark_provider",
        external_candidate_id: "external-canon-001",
        mapped_ref: {
          id: fixture.canonical_record.id,
          kind: fixture.canonical_record.kind,
          layer: fixture.canonical_record.layer,
        },
        source_layer: "canon",
        authority: "canon",
        score: 0.99,
        score_normalization: "cosine_0_1",
        model_ref: "external_model_001",
        index_ref: "external_index_001",
        retrieved_at: "2026-04-21T00:00:00.000Z",
        symbol_refs: [fixture.symbol_anchor.id],
        semantic_slot: fixture.canonical_record.semantic_slot,
        text_preview: fixture.canonical_record.statement,
      },
    ],
  });

  assert.ok(candidate);
  assert.equal(candidate.ref.id, fixture.canonical_record.id);
  assert.equal(candidate.layer, "canon");
  assert.equal(candidate.authority, "canon");
  assert.equal(candidate.vector_score, 0.99);
  assert.equal(candidate.can_support_proposal, false);
  assert.equal(candidate.suppression_reasons, undefined);
  assert.deepEqual(validateRetrievalContract(candidate), []);

  const hybrid = executeHybridRetrieval({
    query_ref: "retrieval_query_external_001",
    recipe: {
      ...fixture.recipe,
      external_candidate_policy: "allow_normalized",
    },
    candidates: [candidate],
  });
  assert.equal(hybrid.included_candidates[0]?.id, candidate.id);
  assert.equal(hybrid.included_candidates[0]?.can_support_proposal, false);
  assert.deepEqual(validateRetrievalContract(hybrid), []);
});

test("external candidate normalization suppresses unmapped or forbidden candidates", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const [unmapped, forbidden] = normalizeExternalCandidates({
    recipe: {
      ...fixture.recipe,
      external_candidate_policy: "forbid",
    },
    candidates: [
      {
        provider_id: "benchmark_provider",
        external_candidate_id: "unmapped-001",
        score: 1,
        score_normalization: "cosine_0_1",
        retrieved_at: "2026-04-21T00:00:00.000Z",
        unsupported_mapping_reasons: ["missing_cristalina_ref"],
      },
      {
        provider_id: "benchmark_provider",
        external_candidate_id: "mapped-but-forbidden-001",
        mapped_ref: {
          id: fixture.wiki_claim.id,
          kind: fixture.wiki_claim.kind,
          layer: fixture.wiki_claim.layer,
        },
        source_layer: "wiki",
        authority: "editorial",
        score: 0.98,
        retrieved_at: "2026-04-21T00:00:00.000Z",
      },
    ],
  });

  assert.ok(unmapped);
  assert.ok(forbidden);
  assert.deepEqual(unmapped.suppression_reasons, ["invalid_external_candidate"]);
  assert.deepEqual(forbidden.suppression_reasons, ["invalid_external_candidate"]);
  assert.equal(unmapped.layer, "derived");
  assert.equal(unmapped.authority, "derived");
  assert.equal(unmapped.can_support_proposal, false);
  assert.equal(forbidden.can_support_proposal, false);
  assert.deepEqual(validateRetrievalContract(unmapped), []);
  assert.deepEqual(validateRetrievalContract(forbidden), []);

  const hybrid = executeHybridRetrieval({
    query_ref: "retrieval_query_external_forbidden_001",
    recipe: fixture.recipe,
    candidates: [unmapped, forbidden],
  });
  assert.equal(hybrid.included_candidates.length, 0);
  assert.deepEqual(hybrid.suppressed_candidates.map((candidate) => candidate.id), [unmapped.id, forbidden.id]);
  assert.deepEqual(validateRetrievalContract(hybrid), []);
});
