import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateVectorArtifact } from "../validation.js";
import { planVectorInvalidation, rebuildExactIndex, refreshEmbeddingBatch, validateVectorArtifacts } from "./maintenance.js";
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

test("vector maintenance plans invalidation and rebuild candidates without repairing artifacts", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const retrievalRun = executeDeterministicRetrieval({
    now: "2026-04-21T00:00:00.000Z",
    query: {
      id: "retrieval_query_invalidation_001",
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
    corpus_id: "vector_corpus_invalidation_001",
    corpus_generation: "corpus_gen_invalidation_001",
    chunk_generation: "chunk_gen_invalidation_001",
    embedding_generation: "embedding_gen_invalidation_001",
    embedding_batch_id: "embedding_batch_invalidation_001",
    index_manifest_id: "vector_index_invalidation_001",
    index_generation: "index_gen_invalidation_001",
    search_run_id: "vector_search_invalidation_001",
    search_generation: "search_gen_invalidation_001",
  });
  const clean = planVectorInvalidation({
    id: "vector_maintenance_run_invalidation_clean_001",
    now: "2026-04-21T00:00:00.000Z",
    records: [
      fixture.source_record,
      fixture.world_claim,
      fixture.wiki_claim,
      fixture.canonical_record,
    ],
    chunks: retrievalRun.chunks,
    embeddings: retrievalRun.embeddings,
    corpus: retrievalRun.corpus,
    index_manifest: retrievalRun.index_manifest,
  });
  assert.equal(clean.job, "invalidate_changed_chunks");
  assert.equal(clean.status, "passed");
  assert.deepEqual(clean.issue_codes, []);

  const canonicalChunk = retrievalRun.chunks.find((chunk) => chunk.source_ref === fixture.canonical_record.id);
  const canonicalEmbedding = retrievalRun.embeddings.find((embedding) => embedding.chunk_ref === canonicalChunk?.id);
  assert.ok(canonicalChunk);
  assert.ok(canonicalEmbedding);

  const driftedCanonical = {
    ...fixture.canonical_record,
    statement: `${fixture.canonical_record.statement} Prefer exactness over speed when they conflict.`,
  };
  const run = planVectorInvalidation({
    id: "vector_maintenance_run_invalidation_drift_001",
    now: "2026-04-21T00:00:00.000Z",
    records: [
      fixture.source_record,
      fixture.world_claim,
      fixture.wiki_claim,
      driftedCanonical,
    ],
    chunks: retrievalRun.chunks,
    embeddings: retrievalRun.embeddings,
    corpus: retrievalRun.corpus,
    index_manifest: retrievalRun.index_manifest,
  });

  assert.equal(run.job, "invalidate_changed_chunks");
  assert.equal(run.status, "completed_with_issues");
  assert.ok(run.issue_codes.includes("source_record_hash_mismatch"));
  assert.ok(run.issue_codes.includes("embedding_depends_on_invalidated_chunk"));
  assert.ok(run.issue_codes.includes("index_depends_on_invalidated_artifact"));
  assert.ok(run.invalidated_artifact_refs?.includes(canonicalChunk.id));
  assert.ok(run.invalidated_artifact_refs?.includes(canonicalEmbedding.id));
  assert.ok(run.rebuild_candidate_refs?.includes(retrievalRun.corpus.id));
  assert.ok(run.rebuild_candidate_refs?.includes(retrievalRun.index_manifest.id));
  assert.ok(run.rebuild_candidate_refs?.includes(canonicalEmbedding.id));
  assert.deepEqual(validateVectorArtifact(run), []);
});

test("vector maintenance rebuilds exact index as an explicit durable job", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const retrievalRun = executeDeterministicRetrieval({
    now: "2026-04-21T00:00:00.000Z",
    query: {
      id: "retrieval_query_exact_rebuild_001",
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
    corpus_id: "vector_corpus_exact_rebuild_001",
    corpus_generation: "corpus_gen_exact_rebuild_001",
    chunk_generation: "chunk_gen_exact_rebuild_001",
    embedding_generation: "embedding_gen_exact_rebuild_001",
    embedding_batch_id: "embedding_batch_exact_rebuild_001",
    index_manifest_id: "vector_index_exact_rebuild_seed_001",
    index_generation: "index_gen_exact_rebuild_seed_001",
    search_run_id: "vector_search_exact_rebuild_001",
    search_generation: "search_gen_exact_rebuild_001",
  });
  const embeddingModel = retrievalRun.vector_artifacts.find((artifact) => artifact.kind === "embedding_model_manifest");
  assert.ok(embeddingModel);

  const rebuilt = rebuildExactIndex({
    id: "vector_maintenance_run_exact_rebuild_001",
    now: "2026-04-21T00:00:00.000Z",
    corpus: retrievalRun.corpus,
    embedding_model: embeddingModel,
    embeddings: retrievalRun.embeddings,
    index_manifest_id: "vector_index_exact_rebuilt_001",
    index_generation: "index_gen_exact_rebuilt_001",
  });

  assert.ok(rebuilt.index_manifest);
  assert.equal(rebuilt.index_manifest.index_kind, "exact");
  assert.equal(rebuilt.index_manifest.corpus_ref, retrievalRun.corpus.id);
  assert.equal(rebuilt.index_manifest.embedding_model_ref, embeddingModel.id);
  assert.equal(rebuilt.maintenance_run.job, "rebuild_exact_index");
  assert.equal(rebuilt.maintenance_run.status, "passed");
  assert.deepEqual(rebuilt.maintenance_run.rebuilt_artifact_refs, [rebuilt.index_manifest.id]);
  assert.deepEqual(validateVectorArtifact(rebuilt.index_manifest), []);
  assert.deepEqual(validateVectorArtifact(rebuilt.maintenance_run), []);

  const rejected = rebuildExactIndex({
    id: "vector_maintenance_run_exact_rebuild_rejected_001",
    now: "2026-04-21T00:00:00.000Z",
    corpus: retrievalRun.corpus,
    embedding_model: {
      ...embeddingModel,
      dimensions: 3,
    },
    embeddings: retrievalRun.embeddings,
    index_manifest_id: "vector_index_exact_rejected_001",
    index_generation: "index_gen_exact_rejected_001",
  });

  assert.equal(rejected.index_manifest, undefined);
  assert.equal(rejected.maintenance_run.status, "rejected");
  assert.ok(rejected.maintenance_run.issue_codes.includes("embedding_model_dimension_mismatch"));
  assert.deepEqual(validateVectorArtifact(rejected.maintenance_run), []);
});

test("vector maintenance refreshes deterministic embedding batches as an explicit job", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const retrievalRun = executeDeterministicRetrieval({
    now: "2026-04-21T00:00:00.000Z",
    query: {
      id: "retrieval_query_embedding_refresh_001",
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
    corpus_id: "vector_corpus_embedding_refresh_001",
    corpus_generation: "corpus_gen_embedding_refresh_001",
    chunk_generation: "chunk_gen_embedding_refresh_001",
    embedding_generation: "embedding_gen_embedding_refresh_seed_001",
    embedding_batch_id: "embedding_batch_embedding_refresh_seed_001",
    index_manifest_id: "vector_index_embedding_refresh_seed_001",
    index_generation: "index_gen_embedding_refresh_seed_001",
    search_run_id: "vector_search_embedding_refresh_001",
    search_generation: "search_gen_embedding_refresh_001",
  });
  const embeddingModel = retrievalRun.vector_artifacts.find((artifact) => artifact.kind === "embedding_model_manifest");
  assert.ok(embeddingModel);

  const refreshed = refreshEmbeddingBatch({
    id: "vector_maintenance_run_embedding_refresh_001",
    now: "2026-04-21T00:00:00.000Z",
    chunks: retrievalRun.chunks,
    chunk_texts: retrievalRun.chunk_texts,
    embedding_model: embeddingModel,
    embedding_generation: "embedding_gen_embedding_refresh_001",
    batch_id: "embedding_batch_embedding_refresh_001",
  });

  assert.ok(refreshed.batch_run);
  assert.ok(refreshed.embeddings);
  assert.ok(refreshed.embedding_vectors);
  assert.equal(refreshed.batch_run.embedding_generation, "embedding_gen_embedding_refresh_001");
  assert.equal(refreshed.embeddings.length, retrievalRun.chunks.length);
  assert.deepEqual(refreshed.maintenance_run.rebuilt_artifact_refs, [
    refreshed.batch_run.id,
    ...refreshed.embeddings.map((embedding) => embedding.id),
  ]);
  assert.deepEqual(validateVectorArtifact(refreshed.batch_run), []);
  for (const embedding of refreshed.embeddings) {
    assert.deepEqual(validateVectorArtifact(embedding), []);
  }
  assert.deepEqual(validateVectorArtifact(refreshed.maintenance_run), []);

  const rejected = refreshEmbeddingBatch({
    id: "vector_maintenance_run_embedding_refresh_rejected_001",
    now: "2026-04-21T00:00:00.000Z",
    chunks: retrievalRun.chunks,
    chunk_texts: {},
    embedding_model: embeddingModel,
    embedding_generation: "embedding_gen_embedding_refresh_rejected_001",
    batch_id: "embedding_batch_embedding_refresh_rejected_001",
  });

  assert.equal(rejected.batch_run, undefined);
  assert.equal(rejected.embeddings, undefined);
  assert.equal(rejected.embedding_vectors, undefined);
  assert.equal(rejected.maintenance_run.status, "rejected");
  assert.ok(rejected.maintenance_run.issue_codes.includes("missing_chunk_text_blob"));
  assert.deepEqual(validateVectorArtifact(rejected.maintenance_run), []);
});
