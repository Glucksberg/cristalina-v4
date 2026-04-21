import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { executeExactVectorSearch } from "../retrieval-engine/exact-vector.js";
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

  await initializeStore(rootDir, "2026-04-21T00:00:00.000Z");

  const symbolPath = await writeSymbolAnchor(rootDir, fixture.symbol_anchor);
  const artifactPaths = await Promise.all(
    [...fixture.vector_artifacts, exact.search_run].map((artifact) => writeVectorArtifact(rootDir, artifact)),
  );

  assert.equal(symbolPath, symbolAnchorPath(rootDir, fixture.symbol_anchor));
  assert.ok(symbolPath.endsWith("derived/symbols/sym_concept__user-interaction-preferences.json"));
  assert.ok(artifactPaths.some((path) => path.endsWith("derived/vector/chunks/vchunk_raw_symbolic_001.json")));
  assert.ok(artifactPaths.some((path) => path.endsWith("derived/vector/search-runs/vector_search_run_symbolic_001.json")));

  const loadedSymbol = await readSymbolAnchor(symbolPath);
  assert.deepEqual(loadedSymbol, fixture.symbol_anchor);

  const loadedSearchRun = await readVectorArtifact(vectorArtifactPath(rootDir, exact.search_run));
  assert.deepEqual(loadedSearchRun, exact.search_run);

  const symbols = await loadSymbolAnchors(rootDir);
  const artifacts = await loadVectorArtifacts(rootDir);

  assert.deepEqual(symbols.map((symbol) => symbol.id), [fixture.symbol_anchor.id]);
  assert.equal(artifacts.length, fixture.vector_artifacts.length + 1);
  assert.ok(artifacts.some((artifact) => artifact.kind === "vector_index_manifest"));
  assert.ok(artifacts.some((artifact) => artifact.kind === "vector_search_run"));
});
