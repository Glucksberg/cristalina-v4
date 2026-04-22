import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { runRetrievalEval } from "../retrieval-engine/evals.js";
import { executeExactVectorSearch } from "../retrieval-engine/exact-vector.js";
import { validateVectorArtifacts } from "../retrieval-engine/maintenance.js";
import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import {
  initializeStore,
  loadSymbolAnchors,
  loadVectorArtifacts,
  readSymbolAnchor,
  readVectorArtifact,
  symbolAnchorPath,
  vectorArtifactPath,
  writeSymbolAnchor,
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
    [...fixture.vector_artifacts, exact.search_run, evalRun, maintenanceRun].map((artifact) => writeVectorArtifact(rootDir, artifact)),
  );

  assert.equal(symbolPath, symbolAnchorPath(rootDir, fixture.symbol_anchor));
  assert.ok(symbolPath.endsWith("derived/symbols/sym_concept__user-interaction-preferences.json"));
  assert.ok(artifactPaths.some((path) => path.endsWith("derived/vector/chunks/vchunk_raw_symbolic_001.json")));
  assert.ok(artifactPaths.some((path) => path.endsWith("derived/vector/search-runs/vector_search_run_symbolic_001.json")));
  assert.ok(artifactPaths.some((path) => path.endsWith("derived/vector/evals/retrieval-runs/retrieval_eval_run_symbolic_store_001.json")));
  assert.ok(artifactPaths.some((path) => path.endsWith("derived/vector/evals/maintenance-runs/vector_maintenance_run_symbolic_store_001.json")));

  const loadedSymbol = await readSymbolAnchor(symbolPath);
  assert.deepEqual(loadedSymbol, fixture.symbol_anchor);

  const loadedSearchRun = await readVectorArtifact(vectorArtifactPath(rootDir, exact.search_run));
  assert.deepEqual(loadedSearchRun, exact.search_run);

  const symbols = await loadSymbolAnchors(rootDir);
  const artifacts = await loadVectorArtifacts(rootDir);

  assert.deepEqual(symbols.map((symbol) => symbol.id), [fixture.symbol_anchor.id]);
  assert.equal(artifacts.length, fixture.vector_artifacts.length + 3);
  assert.ok(artifacts.some((artifact) => artifact.kind === "vector_index_manifest"));
  assert.ok(artifacts.some((artifact) => artifact.kind === "vector_search_run"));
  assert.ok(artifacts.some((artifact) => artifact.kind === "retrieval_eval_run"));
  assert.ok(artifacts.some((artifact) => artifact.kind === "vector_maintenance_run"));
});
