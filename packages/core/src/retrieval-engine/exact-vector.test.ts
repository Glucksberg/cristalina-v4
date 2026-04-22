import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateRetrievalContract, validateVectorArtifact } from "../validation.js";
import { runVectorSearchComparisonEval } from "./evals.js";
import { cosineSimilarity, executeDeterministicAnnVectorSearch, executeExactVectorSearch, executeHybridRetrieval, executeLexicalCandidateSearch } from "./exact-vector.js";

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

test("deterministic ANN vector search emits an auditable ANN search run", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const annManifest = {
    ...fixture.index_manifest,
    id: "vector_index_ann_search_fixture_001",
    index_ref: {
      ...fixture.index_manifest.index_ref,
      path: "derived/vector/indexes/vector_index_ann_search_fixture_001.ann.json",
      producing_ref: "vector_index_ann_search_fixture_001",
    },
    index_kind: "ann" as const,
    ann_strategy: "deterministic_fixture_lsh" as const,
    ann_parameters: {
      bucket_count: 8,
      seed: "fixture",
    },
    exact_baseline_index_ref: fixture.index_manifest.id,
    ann_recall_floor: 1,
    ann_baseline_eval_ref: "retrieval_eval_run_ann_search_fixture_001",
  };
  const exact = executeExactVectorSearch({
    id: "vector_search_run_exact_ann_search_fixture_001",
    now: "2026-04-21T00:00:00.000Z",
    query_ref: "retrieval_query_ann_search_fixture_001",
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
    search_generation: "search_gen_exact_ann_search_fixture_001",
  });
  const ann = executeDeterministicAnnVectorSearch({
    id: "vector_search_run_ann_search_fixture_001",
    now: "2026-04-21T00:00:00.000Z",
    query_ref: "retrieval_query_ann_search_fixture_001",
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
    index_manifest: annManifest,
    search_generation: "search_gen_ann_search_fixture_001",
  });

  assert.deepEqual(validateVectorArtifact(annManifest), []);
  assert.deepEqual(validateVectorArtifact(ann.search_run), []);
  assert.equal(ann.search_run.index_manifest_ref, annManifest.id);
  assert.equal(ann.search_run.provenance.source_type, "ann_vector_search");
  assert.ok(ann.search_run.provenance.evidence_refs?.includes(fixture.index_manifest.id));
  assert.ok(ann.candidates.every((candidate) => candidate.why_retrieved.includes("matched deterministic ANN search")));

  const comparison = runVectorSearchComparisonEval({
    id: "retrieval_eval_run_ann_search_fixture_001",
    now: "2026-04-21T00:00:00.000Z",
    exact_search_run: exact.search_run,
    candidate_search_run: ann.search_run,
    k: fixture.recipe.vector_top_k,
    recall_floor: 1,
  });

  assert.equal(comparison.passed, true);
  assert.deepEqual(validateVectorArtifact(comparison), []);

  assert.throws(
    () =>
      executeDeterministicAnnVectorSearch({
        id: "vector_search_run_ann_search_bad_001",
        now: "2026-04-21T00:00:00.000Z",
        query_ref: "retrieval_query_ann_search_fixture_001",
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
        index_manifest: fixture.index_manifest,
        search_generation: "search_gen_ann_search_bad_001",
      }),
    /requires an ann index manifest/,
  );
});

test("lexical candidates merge with vector candidates without duplicating retrieval refs", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const exact = executeExactVectorSearch({
    id: "vector_search_run_lexical_merge_001",
    now: "2026-04-21T00:00:00.000Z",
    query_ref: "retrieval_query_lexical_merge_001",
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
    search_generation: "search_gen_lexical_merge_001",
  });
  const chunk_texts = Object.fromEntries(
    fixture.chunks.map((chunk) => [
      chunk.id,
      chunk.source_ref === fixture.canonical_record.id
        ? "answer style concise canonical preference"
        : `${chunk.source_layer} answer style evidence`,
    ]),
  );
  const lexical = executeLexicalCandidateSearch({
    query_text: "answer style",
    recipe: fixture.recipe,
    chunks: fixture.chunks,
    chunk_texts,
    records: [
      fixture.source_record,
      fixture.world_claim,
      fixture.wiki_claim,
      fixture.canonical_record,
    ],
  });

  assert.ok(lexical.length > 0);
  assert.ok(lexical.every((candidate) => candidate.lexical_score !== undefined));

  const hybrid = executeHybridRetrieval({
    query_ref: "retrieval_query_lexical_merge_001",
    recipe: fixture.recipe,
    candidates: [...exact.candidates, ...lexical],
  });
  const includedIds = hybrid.included_candidates.map((candidate) => candidate.id);
  const suppressedIds = hybrid.suppressed_candidates.map((candidate) => candidate.id);

  assert.equal(new Set([...includedIds, ...suppressedIds]).size, includedIds.length + suppressedIds.length);
  const mergedCanon = [...hybrid.included_candidates, ...hybrid.suppressed_candidates].find(
    (candidate) => candidate.ref.id === fixture.canonical_record.id,
  );
  assert.ok(mergedCanon);
  assert.ok(mergedCanon.vector_score !== undefined);
  assert.ok(mergedCanon.lexical_score !== undefined);
  assert.ok(mergedCanon.why_retrieved.includes("matched exact vector search"));
  assert.ok(mergedCanon.why_retrieved.includes("matched deterministic lexical search"));
  assert.deepEqual(validateRetrievalContract(hybrid), []);
});

test("hybrid retrieval suppresses stale and contradicted candidates before proposal support", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const staleCanon = {
    ...fixture.canonical_record,
    temporal_state: {
      temporal_status: "historical" as const,
      valid_from: "2026-04-20T00:00:00.000Z",
      valid_to: "2026-04-21T00:00:00.000Z",
    },
  };
  const disputedWorld = {
    ...fixture.world_claim,
    epistemic_state: "disputed" as const,
  };
  const exact = executeExactVectorSearch({
    id: "vector_search_run_stale_001",
    now: "2026-04-21T00:00:00.000Z",
    query_ref: "retrieval_query_stale_001",
    query_vector: [1, 0, 0],
    recipe: fixture.recipe,
    chunks: fixture.chunks,
    embeddings: fixture.embeddings,
    embedding_vectors: fixture.embedding_vectors,
    records: [
      fixture.source_record,
      disputedWorld,
      fixture.wiki_claim,
      staleCanon,
    ],
    index_manifest_ref: fixture.index_manifest.id,
    search_generation: "search_gen_stale_001",
  });
  const hybrid = executeHybridRetrieval({
    query_ref: "retrieval_query_stale_001",
    recipe: fixture.recipe,
    candidates: exact.candidates,
  });

  const stale = hybrid.suppressed_candidates.find((candidate) => candidate.ref.id === fixture.canonical_record.id);
  const contradicted = hybrid.suppressed_candidates.find((candidate) => candidate.ref.id === fixture.world_claim.id);
  assert.deepEqual(stale?.suppression_reasons, ["stale_record"]);
  assert.equal(stale?.can_support_proposal, false);
  assert.deepEqual(contradicted?.suppression_reasons, ["contradicted_record"]);
  assert.equal(contradicted?.can_support_proposal, false);
  assert.deepEqual(validateRetrievalContract(hybrid), []);
});

test("hybrid retrieval honors recipes that forbid editorial wiki context", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const wikiCandidate = fixture.retrieval_result.suppressed_candidates.find((candidate) => candidate.layer === "wiki");
  assert.ok(wikiCandidate);

  const hybrid = executeHybridRetrieval({
    query_ref: "retrieval_query_no_editorial_wiki_001",
    recipe: {
      ...fixture.recipe,
      allow_editorial_wiki: false,
      require_canon_for_truth_claims: false,
    },
    candidates: [
      {
        ...wikiCandidate,
        suppression_reasons: undefined,
      },
    ],
  });

  assert.equal(hybrid.included_candidates.length, 0);
  assert.deepEqual(hybrid.suppressed_candidates[0]?.suppression_reasons, ["authority_mismatch"]);
  assert.equal(hybrid.suppressed_candidates[0]?.can_support_proposal, false);
  assert.deepEqual(validateRetrievalContract(hybrid), []);
});

test("hybrid retrieval records projection budget suppression after legal filters", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const raw = fixture.retrieval_result.included_candidates.find((candidate) => candidate.layer === "raw");
  const canon = fixture.retrieval_result.included_candidates.find((candidate) => candidate.layer === "canon");
  assert.ok(raw);
  assert.ok(canon);

  const extraRaw = {
    ...raw,
    id: "candidate_raw_symbolic_002",
    vector_score: 0.8,
    final_score: 0.8,
  };
  const hybrid = executeHybridRetrieval({
    query_ref: "retrieval_query_budget_001",
    recipe: {
      ...fixture.recipe,
      final_top_k: 3,
      require_canon_for_truth_claims: false,
      max_candidates_per_layer: {
        raw: 1,
      },
    },
    candidates: [canon, raw, extraRaw],
  });

  assert.equal(hybrid.included_candidates.filter((candidate) => candidate.layer === "raw").length, 1);
  const budgetSuppressed = hybrid.suppressed_candidates.find((candidate) => candidate.id === "candidate_raw_symbolic_002");
  assert.deepEqual(budgetSuppressed?.suppression_reasons, ["projection_budget_exceeded"]);
  assert.equal(budgetSuppressed?.can_support_proposal, true);
  assert.deepEqual(validateRetrievalContract(hybrid), []);
});

test("exact search preserves read-policy suppression as retrieval metadata", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const privateCanon = {
    ...fixture.canonical_record,
    visibility_state: {
      privacy_scope: "owner_private" as const,
    },
    provenance: {
      ...fixture.canonical_record.provenance,
      actor_ref: "owner:retrieval-private",
    },
  };
  const exact = executeExactVectorSearch({
    id: "vector_search_run_visibility_001",
    now: "2026-04-21T00:00:00.000Z",
    query_ref: "retrieval_query_visibility_001",
    query_vector: [1, 0, 0],
    recipe: {
      ...fixture.recipe,
      require_canon_for_truth_claims: false,
    },
    chunks: fixture.chunks,
    embeddings: fixture.embeddings,
    embedding_vectors: fixture.embedding_vectors,
    records: [
      fixture.source_record,
      fixture.world_claim,
      fixture.wiki_claim,
      privateCanon,
    ],
    index_manifest_ref: fixture.index_manifest.id,
    search_generation: "search_gen_visibility_001",
    read_context: {
      adapter: "openclaw",
      audience: "runtime",
      owner_identity_ref: "owner:other",
    },
  });

  const privateCandidate = exact.candidates.find((candidate) => candidate.ref.id === privateCanon.id);
  assert.deepEqual(privateCandidate?.suppression_reasons, ["visibility_scope_mismatch"]);
  assert.equal(privateCandidate?.text_preview, undefined);
  assert.equal(privateCandidate?.can_support_proposal, false);
  assert.ok(exact.search_run.suppressed_candidate_refs.includes(privateCandidate?.id ?? ""));

  const hybrid = executeHybridRetrieval({
    query_ref: "retrieval_query_visibility_001",
    recipe: {
      ...fixture.recipe,
      require_canon_for_truth_claims: false,
    },
    candidates: exact.candidates,
  });
  assert.ok(!hybrid.included_candidates.some((candidate) => candidate.ref.id === privateCanon.id));
  const hybridPrivateCandidate = hybrid.suppressed_candidates.find((candidate) => candidate.ref.id === privateCanon.id);
  assert.ok(hybridPrivateCandidate);
  assert.equal(hybridPrivateCandidate.text_preview, undefined);
  assert.deepEqual(validateRetrievalContract(hybrid), []);
});
