import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateRetrievalContract, validateVectorArtifact } from "../validation.js";
import { executeDeterministicRetrieval } from "./orchestrator.js";

test("deterministic retrieval orchestrator executes chunk to hybrid kernel flow", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const query = {
    id: "retrieval_query_orchestrator_001",
    query_text: "answer style",
    recipe_ref: fixture.recipe.id,
    requested_layers: fixture.recipe.layer_scope,
    symbol_hints: [fixture.symbol_anchor.id],
    read_policy_version: fixture.recipe.read_policy_version,
    projection_profile: "openclaw_runtime_context",
  };
  const run = executeDeterministicRetrieval({
    now: "2026-04-21T00:00:00.000Z",
    query,
    recipe: fixture.recipe,
    records: [
      fixture.source_record,
      fixture.world_claim,
      fixture.wiki_claim,
      fixture.canonical_record,
    ],
    symbol_anchors: [fixture.symbol_anchor],
    embedding_model: {
      ...fixture.embedding_model,
      dimensions: 8,
      normalization_mode: "deterministic_fixture_sha256_unit",
    },
    chunk_policy_version: "symbolic_retrieval_chunk_policy.v1",
    corpus_id: "vector_corpus_orchestrator_001",
    corpus_generation: "corpus_gen_orchestrator_001",
    chunk_generation: "chunk_gen_orchestrator_001",
    embedding_generation: "embedding_gen_orchestrator_001",
    embedding_batch_id: "embedding_batch_orchestrator_001",
    index_manifest_id: "vector_index_orchestrator_001",
    index_generation: "index_gen_orchestrator_001",
    search_run_id: "vector_search_orchestrator_001",
    search_generation: "search_gen_orchestrator_001",
    trace_ref: "retrieval_trace_orchestrator_001",
  });

  assert.equal(run.chunks.length, 4);
  assert.equal(run.embeddings.length, 4);
  assert.equal(run.query_vector.length, 8);
  assert.deepEqual(run.corpus.chunk_refs, run.chunks.map((chunk) => chunk.id));
  assert.deepEqual(run.search_run.suppressed_candidate_refs, []);
  assert.equal(run.search_run.candidate_refs.length, 4);
  assert.ok(run.result.included_candidates.some((candidate) => candidate.layer === "canon"));
  assert.ok(run.result.included_candidates.some((candidate) => candidate.layer === "raw"));

  const suppressedWiki = run.result.suppressed_candidates.find((candidate) => candidate.layer === "wiki");
  assert.ok(suppressedWiki);
  assert.equal(suppressedWiki.can_support_proposal, false);
  assert.deepEqual(suppressedWiki.suppression_reasons, ["unsupported_wiki_claim"]);

  for (const artifact of run.vector_artifacts) {
    assert.deepEqual(validateVectorArtifact(artifact), []);
  }
  assert.deepEqual(validateRetrievalContract(run.result), []);
});

test("deterministic retrieval orchestrator rejects query and recipe drift", () => {
  const fixture = buildSymbolicRetrievalFixture();
  assert.throws(
    () =>
      executeDeterministicRetrieval({
        now: "2026-04-21T00:00:00.000Z",
        query: {
          id: "retrieval_query_orchestrator_drift_001",
          query_text: "answer style",
          recipe_ref: "other_recipe",
          requested_layers: fixture.recipe.layer_scope,
          read_policy_version: fixture.recipe.read_policy_version,
        },
        recipe: fixture.recipe,
        records: [fixture.canonical_record],
        embedding_model: fixture.embedding_model,
        chunk_policy_version: "symbolic_retrieval_chunk_policy.v1",
        corpus_id: "vector_corpus_orchestrator_drift_001",
        corpus_generation: "corpus_gen_orchestrator_drift_001",
        chunk_generation: "chunk_gen_orchestrator_drift_001",
        embedding_generation: "embedding_gen_orchestrator_drift_001",
        embedding_batch_id: "embedding_batch_orchestrator_drift_001",
        index_manifest_id: "vector_index_orchestrator_drift_001",
        index_generation: "index_gen_orchestrator_drift_001",
        search_run_id: "vector_search_orchestrator_drift_001",
        search_generation: "search_gen_orchestrator_drift_001",
      }),
    /recipe mismatch/,
  );
});
