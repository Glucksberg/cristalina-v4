import assert from "node:assert/strict";
import test from "node:test";

import { executeExactVectorSearch } from "../retrieval-engine/exact-vector.js";
import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateCoreRecord } from "../validation.js";
import {
  compileMemoryBrowserProjection,
  MEMORY_BROWSER_PROJECTION_COMPILER_VERSION,
} from "./memory-browser.js";

test("memory browser inspects symbolic and vector retrieval artifacts without changing authority", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const exactSearch = executeExactVectorSearch({
    id: "vector_search_memory_browser_001",
    now: "2026-04-21T00:00:00.000Z",
    query_ref: fixture.retrieval_result.query_ref,
    query_vector: [1, 0, 0],
    recipe: fixture.recipe,
    chunks: fixture.chunks,
    embeddings: fixture.embeddings,
    embedding_vectors: fixture.embedding_vectors,
    records: [fixture.source_record, fixture.world_claim, fixture.wiki_claim, fixture.canonical_record],
    index_manifest_ref: fixture.index_manifest.id,
    search_generation: "search_gen_memory_browser_001",
  });

  const browser = compileMemoryBrowserProjection({
    now: "2026-04-21T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "project_private",
    },
    ids: {
      json_artifact: "artifact_memory_browser_retrieval_json_001",
      html_artifact: "artifact_memory_browser_retrieval_html_001",
      manifest: "manifest_memory_browser_retrieval_001",
    },
    source_records: [fixture.source_record],
    canonical_records: [fixture.canonical_record],
    world_claims: [fixture.world_claim],
    wiki_pages: [fixture.wiki_page],
    wiki_claims: [fixture.wiki_claim],
    symbol_anchors: [fixture.symbol_anchor],
    vector_artifacts: [...fixture.vector_artifacts, exactSearch.search_run],
    retrieval_results: [fixture.retrieval_result],
  });

  const snapshot = browser.snapshot as {
    consistency: {
      snapshot_strategy: string;
      boundary_note: string;
    };
    retrieval: {
      symbols: Array<{ id: string; authority: string; target_refs: string[] }>;
      vector_chunks: Array<{ id: string; source_ref: string; symbol_refs: string[] }>;
      vector_search_runs: Array<{ id: string; candidate_refs: string[] }>;
      results: Array<{
        suppressed_candidates: Array<{ id: string; suppression_reasons: string[]; can_support_proposal: boolean }>;
      }>;
    };
  };

  assert.equal(snapshot.retrieval.symbols[0]?.id, fixture.symbol_anchor.id);
  assert.equal(snapshot.retrieval.symbols[0]?.authority, "navigation_only");
  assert.equal(snapshot.consistency.snapshot_strategy, "mixed_state_tolerant");
  assert.match(snapshot.consistency.boundary_note, /mixed state/);
  assert.ok(snapshot.retrieval.vector_chunks.some((chunk) => chunk.source_ref === fixture.canonical_record.id));
  assert.ok(snapshot.retrieval.vector_search_runs.some((run) => run.id === exactSearch.search_run.id));
  assert.deepEqual(snapshot.retrieval.results[0]?.suppressed_candidates[0]?.suppression_reasons, ["unsupported_wiki_claim"]);
  assert.equal(snapshot.retrieval.results[0]?.suppressed_candidates[0]?.can_support_proposal, false);
  assert.match(browser.html, /Symbol Anchors/);
  assert.match(browser.html, /Vector Search Runs/);
  assert.match(browser.json, /unsupported_wiki_claim/);
  assert.equal(browser.manifest.compiler_version, MEMORY_BROWSER_PROJECTION_COMPILER_VERSION);
  assert.deepEqual(browser.manifest.retrieval_trace_refs, ["retrieval_trace_symbolic_fixture_001"]);
  assert.ok(browser.manifest.upstream_refs.includes(fixture.symbol_anchor.id));
  assert.ok(browser.manifest.upstream_refs.includes(exactSearch.search_run.id));
  assert.deepEqual(validateCoreRecord(browser.manifest), []);
});
