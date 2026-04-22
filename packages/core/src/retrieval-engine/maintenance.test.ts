import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateVectorArtifact } from "../validation.js";
import { validateVectorArtifacts } from "./maintenance.js";
import { executeDeterministicRetrieval } from "./orchestrator.js";

test("vector maintenance validates consistent fixture vector artifacts", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const run = validateVectorArtifacts({
    id: "vector_maintenance_run_symbolic_001",
    now: "2026-04-21T00:00:00.000Z",
    corpus: fixture.corpus,
    chunks: fixture.chunks,
    embedding_model: fixture.embedding_model,
    embeddings: fixture.embeddings,
    index_manifest: fixture.index_manifest,
  });

  assert.equal(run.status, "passed");
  assert.deepEqual(run.issue_codes, []);
  assert.equal(run.corpus_ref, fixture.corpus.id);
  assert.equal(run.index_manifest_ref, fixture.index_manifest.id);
  assert.ok(run.checked_artifact_refs.includes(fixture.corpus.id));
  assert.ok(run.checked_artifact_refs.includes(fixture.index_manifest.id));
  assert.deepEqual(validateVectorArtifact(run), []);
});

test("vector maintenance reports orphan embeddings and generation drift", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const driftedEmbedding = {
    ...fixture.embeddings[0],
    chunk_ref: "missing_chunk_001",
    source_text_hash: "sha256:drifted",
    embedding_generation: "embedding_gen_drifted_001",
  };
  const checksumDriftEmbedding = {
    ...fixture.embeddings[1],
    vector_checksum: "sha256:wrong",
  };
  const run = validateVectorArtifacts({
    id: "vector_maintenance_run_symbolic_drift_001",
    now: "2026-04-21T00:00:00.000Z",
    corpus: {
      ...fixture.corpus,
      chunk_refs: fixture.corpus.chunk_refs.slice(1),
    },
    chunks: fixture.chunks,
    embedding_model: fixture.embedding_model,
    embeddings: [driftedEmbedding, checksumDriftEmbedding, ...fixture.embeddings.slice(2)],
    index_manifest: fixture.index_manifest,
  });

  assert.equal(run.status, "completed_with_issues");
  assert.ok(run.issue_codes.includes("corpus_chunk_membership_mismatch"));
  assert.ok(run.issue_codes.includes("orphan_embedding"));
  assert.ok(run.issue_codes.includes("embedding_index_generation_mismatch"));
  assert.ok(run.issue_codes.includes("embedding_vector_checksum_mismatch"));
  assert.deepEqual(validateVectorArtifact(run), []);
});

test("vector maintenance validates supplied chunk text and embedding vector sidecar payloads", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const retrievalRun = executeDeterministicRetrieval({
    now: "2026-04-21T00:00:00.000Z",
    query: {
      id: "retrieval_query_maintenance_sidecar_001",
      query_text: "answer style",
      recipe_ref: fixture.recipe.id,
      requested_layers: fixture.recipe.layer_scope,
      read_policy_version: fixture.recipe.read_policy_version,
    },
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
    corpus_id: "vector_corpus_maintenance_sidecar_001",
    corpus_generation: "corpus_gen_maintenance_sidecar_001",
    chunk_generation: "chunk_gen_maintenance_sidecar_001",
    embedding_generation: "embedding_gen_maintenance_sidecar_001",
    embedding_batch_id: "embedding_batch_maintenance_sidecar_001",
    index_manifest_id: "vector_index_maintenance_sidecar_001",
    index_generation: "index_gen_maintenance_sidecar_001",
    search_run_id: "vector_search_maintenance_sidecar_001",
    search_generation: "search_gen_maintenance_sidecar_001",
  });

  const clean = validateVectorArtifacts({
    id: "vector_maintenance_run_sidecar_clean_001",
    now: "2026-04-21T00:00:00.000Z",
    corpus: retrievalRun.corpus,
    chunks: retrievalRun.chunks,
    chunk_texts: retrievalRun.chunk_texts,
    embedding_model: retrievalRun.vector_artifacts.find((artifact) => artifact.kind === "embedding_model_manifest"),
    embeddings: retrievalRun.embeddings,
    embedding_vectors: retrievalRun.embedding_vectors,
    index_manifest: retrievalRun.index_manifest,
  });
  assert.equal(clean.status, "passed");
  assert.deepEqual(clean.issue_codes, []);

  const drifted = validateVectorArtifacts({
    id: "vector_maintenance_run_sidecar_drift_001",
    now: "2026-04-21T00:00:00.000Z",
    corpus: retrievalRun.corpus,
    chunks: retrievalRun.chunks,
    chunk_texts: {
      ...retrievalRun.chunk_texts,
      [retrievalRun.chunks[0].id]: "drifted text",
    },
    embedding_model: retrievalRun.vector_artifacts.find((artifact) => artifact.kind === "embedding_model_manifest"),
    embeddings: retrievalRun.embeddings,
    embedding_vectors: {
      ...retrievalRun.embedding_vectors,
      [retrievalRun.embeddings[0].id]: [1, 2],
    },
    index_manifest: retrievalRun.index_manifest,
  });

  assert.equal(drifted.status, "completed_with_issues");
  assert.ok(drifted.issue_codes.includes("chunk_text_checksum_mismatch"));
  assert.ok(drifted.issue_codes.includes("embedding_vector_dimension_mismatch"));
  assert.ok(drifted.issue_codes.includes("embedding_vector_checksum_mismatch"));
  assert.deepEqual(validateVectorArtifact(drifted), []);
});
