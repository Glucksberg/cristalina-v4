import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateRetrievalContract, validateVectorArtifact } from "../validation.js";
import { cosineSimilarity, executeExactVectorSearch, executeHybridRetrieval } from "./exact-vector.js";

test("cosineSimilarity is deterministic and rejects dimension drift", () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(cosineSimilarity([0, 0, 0], [1, 0, 0]), 0);
  assert.throws(() => cosineSimilarity([1, 0], [1, 0, 0]), /Vector dimension mismatch/);
});

test("exact vector search and hybrid retrieval preserve authority and suppress editorial wiki", () => {
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

  assert.deepEqual(validateVectorArtifact(exact.search_run), []);
  assert.equal(exact.candidates.length, 4);
  assert.equal(exact.candidates[0].layer, "canon");
  assert.ok(exact.candidates.some((candidate) => candidate.layer === "wiki" && candidate.authority === "editorial"));

  const hybrid = executeHybridRetrieval({
    query_ref: "retrieval_query_symbolic_fixture_001",
    recipe: fixture.recipe,
    candidates: exact.candidates,
    trace_ref: "retrieval_trace_symbolic_fixture_001",
  });

  assert.deepEqual(validateRetrievalContract(hybrid), []);
  assert.ok(hybrid.included_candidates.some((candidate) => candidate.layer === "canon" && candidate.can_support_proposal));
  assert.ok(hybrid.included_candidates.some((candidate) => candidate.layer === "raw" && candidate.can_support_proposal));

  const suppressedWiki = hybrid.suppressed_candidates.find((candidate) => candidate.layer === "wiki");
  assert.equal(suppressedWiki?.authority, "editorial");
  assert.equal(suppressedWiki?.can_support_proposal, false);
  assert.deepEqual(suppressedWiki?.suppression_reasons, ["unsupported_wiki_claim"]);
});
