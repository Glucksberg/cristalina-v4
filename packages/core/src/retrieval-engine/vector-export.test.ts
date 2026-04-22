import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateVectorArtifact } from "../validation.js";
import { executeDeterministicRetrieval } from "./orchestrator.js";
import { buildVectorExportJsonl, buildVectorExportJsonlRows, serializeVectorExportJsonl } from "./vector-export.js";

test("vector export JSONL preserves chunk and embedding metadata without authority promotion", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const retrievalRun = executeDeterministicRetrieval({
    now: "2026-04-22T00:00:00.000Z",
    query: {
      id: "retrieval_query_vector_export_001",
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
    corpus_id: "vector_corpus_export_001",
    corpus_generation: "corpus_gen_export_001",
    chunk_generation: "chunk_gen_export_001",
    embedding_generation: "embedding_gen_export_001",
    embedding_batch_id: "embedding_batch_export_001",
    index_manifest_id: "vector_index_export_001",
    index_generation: "index_gen_export_001",
    search_run_id: "vector_search_export_001",
    search_generation: "search_gen_export_001",
  });

  const exportRun = buildVectorExportJsonl({
    export_run_ref: "vector_export_run_001",
    now: "2026-04-22T00:00:00.000Z",
    corpus: retrievalRun.corpus,
    chunks: retrievalRun.chunks,
    chunk_texts: retrievalRun.chunk_texts,
    embeddings: retrievalRun.embeddings,
  });

  assert.equal(exportRun.rows.length, retrievalRun.chunks.length + retrievalRun.embeddings.length);
  assert.ok(exportRun.rows.every((row) => row.kind === "vector_export_jsonl_row"));
  assert.ok(exportRun.rows.every((row) => row.layer === "derived"));
  assert.ok(exportRun.rows.every((row) => row.authoritative_home === "governance"));
  assert.ok(exportRun.rows.every((row) => row.provenance.source_type === "vector_export_jsonl"));
  assert.ok(exportRun.rows.every((row) => validateVectorArtifact(row).length === 0));

  const chunkRow = exportRun.rows.find((row) => row.row_kind === "chunk_metadata" && row.source_layer === "wiki");
  assert.ok(chunkRow);
  assert.equal(chunkRow.corpus_ref, retrievalRun.corpus.id);
  assert.equal(chunkRow.chunk_generation, "chunk_gen_export_001");
  assert.equal(chunkRow.source_ref, fixture.wiki_claim.id);
  assert.ok(chunkRow.chunk_text_ref?.path.startsWith("derived/vector/chunks/"));

  const embeddingRow = exportRun.rows.find((row) => row.row_kind === "embedding_metadata");
  assert.ok(embeddingRow);
  assert.equal(embeddingRow.embedding_generation, "embedding_gen_export_001");
  assert.equal(embeddingRow.metric, "cosine");
  assert.equal(embeddingRow.vector_checksum, embeddingRow.vector_ref?.checksum);

  const parsed = exportRun.jsonl.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(parsed.length, exportRun.rows.length);
  assert.equal(parsed[0].kind, "vector_export_jsonl_row");
  assert.equal(parsed[0].row_kind, "chunk_metadata");
});

test("vector export JSONL serialization is deterministic", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const retrievalRun = executeDeterministicRetrieval({
    now: "2026-04-22T00:00:00.000Z",
    query: {
      id: "retrieval_query_vector_export_deterministic_001",
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
    corpus_id: "vector_corpus_export_deterministic_001",
    corpus_generation: "corpus_gen_export_deterministic_001",
    chunk_generation: "chunk_gen_export_deterministic_001",
    embedding_generation: "embedding_gen_export_deterministic_001",
    embedding_batch_id: "embedding_batch_export_deterministic_001",
    index_manifest_id: "vector_index_export_deterministic_001",
    index_generation: "index_gen_export_deterministic_001",
    search_run_id: "vector_search_export_deterministic_001",
    search_generation: "search_gen_export_deterministic_001",
  });

  const rows = buildVectorExportJsonlRows({
    export_run_ref: "vector_export_run_deterministic_001",
    now: "2026-04-22T00:00:00.000Z",
    corpus: retrievalRun.corpus,
    chunks: [...retrievalRun.chunks].reverse(),
    embeddings: [...retrievalRun.embeddings].reverse(),
  });
  const rerun = buildVectorExportJsonlRows({
    export_run_ref: "vector_export_run_deterministic_001",
    now: "2026-04-22T00:00:00.000Z",
    corpus: retrievalRun.corpus,
    chunks: retrievalRun.chunks,
    embeddings: retrievalRun.embeddings,
  });

  assert.deepEqual(rows, rerun);
  assert.equal(serializeVectorExportJsonl(rows), serializeVectorExportJsonl(rerun));
});
