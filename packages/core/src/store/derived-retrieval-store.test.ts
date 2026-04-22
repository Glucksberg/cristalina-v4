import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildRetrievalAudit } from "../retrieval-engine/audit.js";
import { executeDeterministicRetrieval } from "../retrieval-engine/orchestrator.js";
import { runRetrievalEval } from "../retrieval-engine/evals.js";
import { executeExactVectorSearch } from "../retrieval-engine/exact-vector.js";
import { validateVectorArtifacts } from "../retrieval-engine/maintenance.js";
import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import {
  initializeStore,
  loadSymbolAnchors,
  loadVectorArtifacts,
  readEmbeddingVector,
  readSymbolAnchor,
  readVectorChunkText,
  readVectorArtifact,
  symbolAnchorPath,
  vectorArtifactPath,
  writeEmbeddingVector,
  writeSymbolAnchor,
  writeVectorChunkText,
  writeVectorArtifact,
} from "./io.js";

test("derived retrieval store writes and reloads symbol anchors and vector artifacts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-derived-retrieval-"));
  const fixture = buildSymbolicRetrievalFixture();
  const exact = executeExactVectorSearch({
    id: "vector_search_run_symbolic_001",
    now: "2026-04-21T00:00:00.000Z",
    query_ref: "retrieval_query_symbolic_fixture_001",
    query_vector: [1, 0, 0],
    recipe: fixture.recipe,
    chunks: fixture.chunks,
    embeddings: fixture.embeddings,
    embedding_vectors: fixture.embedding_vectors,
    records: [
      fixture.source_record,
      fixture.world_claim,
      fixture.wiki_claim,
      fixture.canonical_record,
    ],
    index_manifest_ref: fixture.index_manifest.id,
    search_generation: "search_gen_symbolic_retrieval_001",
  });
  const evalRun = runRetrievalEval({
    id: "retrieval_eval_run_symbolic_store_001",
    now: "2026-04-21T00:00:00.000Z",
    eval_case: {
      id: "retrieval_eval_case_symbolic_store_001",
      query_ref: fixture.retrieval_result.query_ref,
      recipe_ref: fixture.recipe.id,
      expected_included_candidate_refs: ["candidate_canon_symbolic_001", "candidate_raw_symbolic_001"],
      expected_suppressed_candidate_refs: ["candidate_wiki_symbolic_001"],
    },
    result: fixture.retrieval_result,
    k: 2,
  });
  const audit = buildRetrievalAudit({
    id: "retrieval_audit_symbolic_store_001",
    now: "2026-04-21T00:00:00.000Z",
    result: fixture.retrieval_result,
    vector_search_runs: [exact.search_run],
    result_ref: "retrieval_result_symbolic_store_001",
  });
  const maintenanceRun = validateVectorArtifacts({
    id: "vector_maintenance_run_symbolic_store_001",
    now: "2026-04-21T00:00:00.000Z",
    corpus: fixture.corpus,
    chunks: fixture.chunks,
    embedding_model: fixture.embedding_model,
    embeddings: fixture.embeddings,
    index_manifest: fixture.index_manifest,
  });

  await initializeStore(rootDir, "2026-04-21T00:00:00.000Z");

  const symbolPath = await writeSymbolAnchor(rootDir, fixture.symbol_anchor);
  const artifactPaths = await Promise.all(
    [...fixture.vector_artifacts, exact.search_run, audit, evalRun, maintenanceRun].map((artifact) => writeVectorArtifact(rootDir, artifact)),
  );

  assert.equal(symbolPath, symbolAnchorPath(rootDir, fixture.symbol_anchor));
  assert.ok(symbolPath.endsWith("derived/symbols/sym_concept__user-interaction-preferences.json"));
  assert.ok(artifactPaths.some((path) => path.endsWith("derived/vector/chunks/vchunk_raw_symbolic_001.json")));
  assert.ok(artifactPaths.some((path) => path.endsWith("derived/vector/search-runs/vector_search_run_symbolic_001.json")));
  assert.ok(artifactPaths.some((path) => path.endsWith("derived/vector/evals/retrieval-audits/retrieval_audit_symbolic_store_001.json")));
  assert.ok(artifactPaths.some((path) => path.endsWith("derived/vector/evals/retrieval-runs/retrieval_eval_run_symbolic_store_001.json")));
  assert.ok(artifactPaths.some((path) => path.endsWith("derived/vector/evals/maintenance-runs/vector_maintenance_run_symbolic_store_001.json")));

  const loadedSymbol = await readSymbolAnchor(symbolPath);
  assert.deepEqual(loadedSymbol, fixture.symbol_anchor);

  const loadedSearchRun = await readVectorArtifact(vectorArtifactPath(rootDir, exact.search_run));
  assert.deepEqual(loadedSearchRun, exact.search_run);

  const symbols = await loadSymbolAnchors(rootDir);
  const artifacts = await loadVectorArtifacts(rootDir);

  assert.deepEqual(symbols.map((symbol) => symbol.id), [fixture.symbol_anchor.id]);
  assert.equal(artifacts.length, fixture.vector_artifacts.length + 4);
  assert.ok(artifacts.some((artifact) => artifact.kind === "vector_index_manifest"));
  assert.ok(artifacts.some((artifact) => artifact.kind === "vector_search_run"));
  assert.ok(artifacts.some((artifact) => artifact.kind === "retrieval_audit"));
  assert.ok(artifacts.some((artifact) => artifact.kind === "retrieval_eval_run"));
  assert.ok(artifacts.some((artifact) => artifact.kind === "vector_maintenance_run"));
});

test("derived retrieval store writes chunk and embedding sidecars without replacing metadata", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-derived-retrieval-sidecars-"));
  const fixture = buildSymbolicRetrievalFixture();
  const run = executeDeterministicRetrieval({
    now: "2026-04-21T00:00:00.000Z",
    query: {
      id: "retrieval_query_sidecar_001",
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
    corpus_id: "vector_corpus_sidecar_001",
    corpus_generation: "corpus_gen_sidecar_001",
    chunk_generation: "chunk_gen_sidecar_001",
    embedding_generation: "embedding_gen_sidecar_001",
    embedding_batch_id: "embedding_batch_sidecar_001",
    index_manifest_id: "vector_index_sidecar_001",
    index_generation: "index_gen_sidecar_001",
    search_run_id: "vector_search_sidecar_001",
    search_generation: "search_gen_sidecar_001",
  });

  await initializeStore(rootDir, "2026-04-21T00:00:00.000Z");
  const metadataPath = await writeVectorArtifact(rootDir, run.embeddings[0]);
  const chunkTextPath = await writeVectorChunkText(rootDir, run.chunks[0], run.chunk_texts[run.chunks[0].id]);
  const vectorPath = await writeEmbeddingVector(
    rootDir,
    run.embeddings[0],
    run.embedding_vectors[run.embeddings[0].id],
  );

  assert.ok(metadataPath.endsWith(`derived/vector/embeddings/${run.embeddings[0].id}.json`));
  assert.ok(chunkTextPath.endsWith(`derived/vector/chunks/${run.chunks[0].id}.txt`));
  assert.ok(vectorPath.endsWith(`derived/vector/embeddings/${run.embeddings[0].id}.vector.json`));
  assert.notEqual(metadataPath, vectorPath);
  assert.deepEqual(JSON.parse(await readFile(metadataPath, "utf8")), run.embeddings[0]);
  assert.equal(await readVectorChunkText(rootDir, run.chunks[0]), run.chunk_texts[run.chunks[0].id]);
  assert.deepEqual(await readEmbeddingVector(rootDir, run.embeddings[0]), run.embedding_vectors[run.embeddings[0].id]);

  await assert.rejects(
    () => writeVectorChunkText(rootDir, run.chunks[0], "drifted text"),
    /checksum mismatch/,
  );
  await assert.rejects(
    () =>
      writeVectorChunkText(
        rootDir,
        {
          ...run.chunks[0],
          chunk_text_ref: {
            ...run.chunks[0].chunk_text_ref,
            path: "../escaped.txt",
          },
        },
        run.chunk_texts[run.chunks[0].id],
      ),
    /escapes store root/,
  );
  await assert.rejects(
    () =>
      writeVectorChunkText(
        rootDir,
        {
          ...run.chunks[0],
          chunk_text_ref: {
            ...run.chunks[0].chunk_text_ref,
            path: "raw/escaped.txt",
          },
        },
        run.chunk_texts[run.chunks[0].id],
      ),
    /escapes derived vector storage/,
  );
});
