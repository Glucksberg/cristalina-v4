import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateVectorArtifact } from "../validation.js";
import { buildRetrievalAudit } from "./audit.js";
import { executeExactVectorSearch } from "./exact-vector.js";

test("retrieval audit summarizes explicit result and search run refs without changing authority", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const exact = executeExactVectorSearch({
    id: "vector_search_run_retrieval_audit_001",
    now: "2026-04-21T00:00:00.000Z",
    query_ref: fixture.retrieval_result.query_ref,
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
    search_generation: "search_gen_retrieval_audit_001",
  });

  const audit = buildRetrievalAudit({
    id: "retrieval_audit_symbolic_001",
    now: "2026-04-21T00:00:00.000Z",
    result: fixture.retrieval_result,
    vector_search_runs: [exact.search_run],
    result_ref: "retrieval_result_symbolic_001",
  });

  assert.equal(audit.kind, "retrieval_audit");
  assert.equal(audit.query_ref, fixture.retrieval_result.query_ref);
  assert.equal(audit.recipe_ref, fixture.recipe.id);
  assert.deepEqual(audit.vector_search_run_refs, [exact.search_run.id]);
  assert.deepEqual(audit.included_candidate_refs, ["candidate_canon_symbolic_001", "candidate_raw_symbolic_001"]);
  assert.deepEqual(audit.suppressed_candidate_refs, ["candidate_wiki_symbolic_001"]);
  assert.deepEqual(audit.suppression_reasons, ["unsupported_wiki_claim"]);
  assert.equal(audit.result_ref, "retrieval_result_symbolic_001");
  assert.equal(audit.trace_ref, "retrieval_trace_symbolic_fixture_001");
  assert.ok(audit.provenance.evidence_refs?.includes(exact.search_run.id));
  assert.ok(audit.provenance.evidence_refs?.includes("candidate_wiki_symbolic_001"));
  assert.deepEqual(validateVectorArtifact(audit), []);
});

test("retrieval audit rejects search runs from another query or recipe", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const exact = executeExactVectorSearch({
    id: "vector_search_run_retrieval_audit_bad_001",
    now: "2026-04-21T00:00:00.000Z",
    query_ref: fixture.retrieval_result.query_ref,
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
    search_generation: "search_gen_retrieval_audit_bad_001",
  });

  assert.throws(
    () =>
      buildRetrievalAudit({
        id: "retrieval_audit_bad_query_001",
        now: "2026-04-21T00:00:00.000Z",
        result: fixture.retrieval_result,
        vector_search_runs: [
          {
            ...exact.search_run,
            query_ref: "other_query",
          },
        ],
      }),
    /query mismatch/,
  );
  assert.throws(
    () =>
      buildRetrievalAudit({
        id: "retrieval_audit_bad_recipe_001",
        now: "2026-04-21T00:00:00.000Z",
        result: fixture.retrieval_result,
        vector_search_runs: [
          {
            ...exact.search_run,
            recipe_ref: "other_recipe",
          },
        ],
      }),
    /recipe mismatch/,
  );
});
