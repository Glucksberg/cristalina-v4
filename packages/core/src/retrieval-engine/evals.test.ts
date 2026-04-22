import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateVectorArtifact } from "../validation.js";
import { executeExactVectorSearch } from "./exact-vector.js";
import { compareRetrievalBaselines, runRetrievalEval, runVectorSearchComparisonEval, type RetrievalEvalCase } from "./evals.js";

test("retrieval eval passes only when relevance, authority, and provenance all match", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const evalCase: RetrievalEvalCase = {
    id: "retrieval_eval_case_symbolic_001",
    query_ref: fixture.retrieval_result.query_ref,
    recipe_ref: fixture.recipe.id,
    expected_included_candidate_refs: ["candidate_canon_symbolic_001", "candidate_raw_symbolic_001"],
    expected_suppressed_candidate_refs: ["candidate_wiki_symbolic_001"],
    expected_authority_by_candidate_ref: {
      candidate_canon_symbolic_001: "canon",
      candidate_raw_symbolic_001: "evidence",
      candidate_wiki_symbolic_001: "editorial",
    },
    required_suppression_reasons_by_candidate_ref: {
      candidate_wiki_symbolic_001: ["unsupported_wiki_claim"],
    },
    proposal_support_candidate_refs: ["candidate_canon_symbolic_001", "candidate_raw_symbolic_001"],
  };

  const run = runRetrievalEval({
    id: "retrieval_eval_run_symbolic_001",
    now: "2026-04-21T00:00:00.000Z",
    eval_case: evalCase,
    result: fixture.retrieval_result,
    k: 2,
  });

  assert.equal(run.passed, true);
  assert.equal(run.recall_at_k, 1);
  assert.equal(run.precision_at_k, 1);
  assert.equal(run.authority_correct, true);
  assert.equal(run.provenance_complete, true);
  assert.deepEqual(run.failure_reasons, []);
  assert.deepEqual(validateVectorArtifact(run), []);
});

test("retrieval eval fails relevant results that collapse wiki editorial authority", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const wikiCandidate = fixture.retrieval_result.suppressed_candidates[0];
  assert.ok(wikiCandidate);

  const badResult = {
    ...fixture.retrieval_result,
    included_candidates: [
      ...fixture.retrieval_result.included_candidates,
      {
        ...wikiCandidate,
        authority: "canon" as const,
        suppression_reasons: undefined,
      },
    ],
    suppressed_candidates: [],
  };

  const run = runRetrievalEval({
    id: "retrieval_eval_run_symbolic_bad_001",
    now: "2026-04-21T00:00:00.000Z",
    eval_case: {
      id: "retrieval_eval_case_symbolic_001",
      query_ref: fixture.retrieval_result.query_ref,
      recipe_ref: fixture.recipe.id,
      expected_included_candidate_refs: ["candidate_canon_symbolic_001", "candidate_raw_symbolic_001"],
      expected_suppressed_candidate_refs: ["candidate_wiki_symbolic_001"],
      expected_authority_by_candidate_ref: {
        candidate_wiki_symbolic_001: "editorial",
      },
      required_suppression_reasons_by_candidate_ref: {
        candidate_wiki_symbolic_001: ["unsupported_wiki_claim"],
      },
    },
    result: badResult,
    k: 3,
  });

  assert.equal(run.passed, false);
  assert.equal(run.authority_correct, false);
  assert.ok(run.failure_reasons.includes("authority_mismatch:candidate_wiki_symbolic_001"));
  assert.ok(run.failure_reasons.includes("missing_suppressed_candidate:candidate_wiki_symbolic_001"));
  assert.ok(run.failure_reasons.includes("missing_suppression_reason:candidate_wiki_symbolic_001:unsupported_wiki_claim"));
  assert.deepEqual(validateVectorArtifact(run), []);
});

test("retrieval eval covers stale suppression and projection budget cases", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const canonCandidate = fixture.retrieval_result.included_candidates.find((candidate) => candidate.layer === "canon");
  const rawCandidate = fixture.retrieval_result.included_candidates.find((candidate) => candidate.layer === "raw");
  assert.ok(canonCandidate);
  assert.ok(rawCandidate);

  const staleCandidate = {
    ...canonCandidate,
    id: "candidate_stale_canon_001",
    suppression_reasons: ["stale_record" as const],
    can_support_proposal: false,
  };
  const budgetCandidate = {
    ...rawCandidate,
    id: "candidate_budget_raw_001",
    suppression_reasons: ["projection_budget_exceeded" as const],
  };
  const result = {
    query_ref: "retrieval_query_eval_stale_budget_001",
    recipe_ref: fixture.recipe.id,
    included_candidates: [rawCandidate],
    suppressed_candidates: [staleCandidate, budgetCandidate],
  };

  const run = runRetrievalEval({
    id: "retrieval_eval_run_stale_budget_001",
    now: "2026-04-21T00:00:00.000Z",
    eval_case: {
      id: "retrieval_eval_case_stale_budget_001",
      query_ref: result.query_ref,
      recipe_ref: fixture.recipe.id,
      expected_included_candidate_refs: [rawCandidate.id],
      expected_suppressed_candidate_refs: [staleCandidate.id, budgetCandidate.id],
      required_suppression_reasons_by_candidate_ref: {
        [staleCandidate.id]: ["stale_record"],
        [budgetCandidate.id]: ["projection_budget_exceeded"],
      },
    },
    result,
    k: 1,
  });

  assert.equal(run.passed, true);
  assert.equal(run.recall_at_k, 1);
  assert.equal(run.precision_at_k, 1);
  assert.deepEqual(validateVectorArtifact(run), []);

  const badRun = runRetrievalEval({
    id: "retrieval_eval_run_stale_budget_bad_001",
    now: "2026-04-21T00:00:00.000Z",
    eval_case: {
      id: "retrieval_eval_case_stale_budget_001",
      query_ref: result.query_ref,
      recipe_ref: fixture.recipe.id,
      expected_included_candidate_refs: [rawCandidate.id],
      expected_suppressed_candidate_refs: [staleCandidate.id],
      required_suppression_reasons_by_candidate_ref: {
        [staleCandidate.id]: ["stale_record"],
      },
    },
    result: {
      ...result,
      included_candidates: [rawCandidate, { ...staleCandidate, suppression_reasons: undefined }],
      suppressed_candidates: [budgetCandidate],
    },
    k: 2,
  });

  assert.equal(badRun.passed, false);
  assert.ok(badRun.failure_reasons.includes(`missing_suppressed_candidate:${staleCandidate.id}`));
  assert.ok(badRun.failure_reasons.includes(`missing_suppression_reason:${staleCandidate.id}:stale_record`));
});

test("retrieval eval compares lexical, vector, and hybrid baselines with the same legality checks", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const rawCandidate = fixture.retrieval_result.included_candidates.find((candidate) => candidate.layer === "raw");
  const canonCandidate = fixture.retrieval_result.included_candidates.find((candidate) => candidate.layer === "canon");
  const wikiCandidate = fixture.retrieval_result.suppressed_candidates.find((candidate) => candidate.layer === "wiki");
  assert.ok(rawCandidate);
  assert.ok(canonCandidate);
  assert.ok(wikiCandidate);

  const evalCase: RetrievalEvalCase = {
    id: "retrieval_eval_case_baseline_compare_001",
    query_ref: "retrieval_query_baseline_compare_001",
    recipe_ref: fixture.recipe.id,
    expected_included_candidate_refs: [canonCandidate.id, rawCandidate.id],
    expected_suppressed_candidate_refs: [wikiCandidate.id],
    expected_authority_by_candidate_ref: {
      [canonCandidate.id]: "canon",
      [rawCandidate.id]: "evidence",
      [wikiCandidate.id]: "editorial",
    },
    required_suppression_reasons_by_candidate_ref: {
      [wikiCandidate.id]: ["unsupported_wiki_claim"],
    },
    proposal_support_candidate_refs: [canonCandidate.id, rawCandidate.id],
  };
  const lexicalResult = {
    query_ref: evalCase.query_ref,
    recipe_ref: fixture.recipe.id,
    included_candidates: [{ ...rawCandidate, lexical_score: 1 }],
    suppressed_candidates: [wikiCandidate],
  };
  const vectorResult = {
    query_ref: evalCase.query_ref,
    recipe_ref: fixture.recipe.id,
    included_candidates: [{ ...canonCandidate, vector_score: 1 }],
    suppressed_candidates: [],
  };
  const hybridResult = {
    query_ref: evalCase.query_ref,
    recipe_ref: fixture.recipe.id,
    included_candidates: [canonCandidate, rawCandidate],
    suppressed_candidates: [wikiCandidate],
  };

  const runs = compareRetrievalBaselines({
    id_prefix: "retrieval_eval_run_baseline_compare",
    now: "2026-04-21T00:00:00.000Z",
    eval_case: evalCase,
    baselines: [
      { name: "lexical", result: lexicalResult },
      { name: "vector", result: vectorResult },
      { name: "hybrid", result: hybridResult },
    ],
    k: 2,
  });

  assert.deepEqual(runs.map((run) => run.id), [
    "retrieval_eval_run_baseline_compare_lexical",
    "retrieval_eval_run_baseline_compare_vector",
    "retrieval_eval_run_baseline_compare_hybrid",
  ]);
  const lexical = runs.find((run) => run.result_ref === "lexical");
  const vector = runs.find((run) => run.result_ref === "vector");
  const hybrid = runs.find((run) => run.result_ref === "hybrid");
  assert.ok(lexical);
  assert.ok(vector);
  assert.ok(hybrid);
  assert.equal(lexical.recall_at_k, 0.5);
  assert.equal(vector.recall_at_k, 0.5);
  assert.equal(hybrid.recall_at_k, 1);
  assert.equal(hybrid.passed, true);
  assert.equal(vector.passed, false);
  assert.ok(vector.failure_reasons.includes(`missing_suppressed_candidate:${wikiCandidate.id}`));
  for (const run of runs) {
    assert.deepEqual(validateVectorArtifact(run), []);
  }
});

test("retrieval eval compares ANN search run against exact vector baseline", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const exact = executeExactVectorSearch({
    id: "vector_search_run_exact_ann_compare_001",
    now: "2026-04-21T00:00:00.000Z",
    query_ref: "retrieval_query_ann_compare_001",
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
    search_generation: "search_gen_exact_ann_compare_001",
  });
  const annSearchRun = {
    ...exact.search_run,
    id: "vector_search_run_ann_compare_001",
    index_manifest_ref: "vector_index_ann_compare_001",
    provenance: {
      ...exact.search_run.provenance,
      source_type: "ann_vector_search",
    },
    search_generation: "search_gen_ann_compare_001",
  };

  const passed = runVectorSearchComparisonEval({
    id: "retrieval_eval_run_exact_vs_ann_compare_001",
    now: "2026-04-21T00:00:00.000Z",
    exact_search_run: exact.search_run,
    candidate_search_run: annSearchRun,
    k: fixture.recipe.vector_top_k,
    recall_floor: 1,
  });

  assert.equal(passed.passed, true);
  assert.equal(passed.result_ref, annSearchRun.id);
  assert.equal(passed.recall_at_k, 1);
  assert.equal(passed.precision_at_k, 1);
  assert.deepEqual(passed.expected_included_candidate_refs, exact.search_run.candidate_refs);
  assert.deepEqual(passed.observed_included_candidate_refs, annSearchRun.candidate_refs);
  assert.deepEqual(validateVectorArtifact(passed), []);

  const failed = runVectorSearchComparisonEval({
    id: "retrieval_eval_run_exact_vs_ann_compare_bad_001",
    now: "2026-04-21T00:00:00.000Z",
    exact_search_run: exact.search_run,
    candidate_search_run: {
      ...annSearchRun,
      candidate_refs: annSearchRun.candidate_refs.slice(0, -1),
      requested_layers: ["canon"],
    },
    k: fixture.recipe.vector_top_k,
    recall_floor: 1,
  });

  assert.equal(failed.passed, false);
  assert.ok(failed.recall_at_k < 1);
  assert.ok(failed.failure_reasons.some((reason) => reason.startsWith("recall_below_floor:")));
  assert.ok(failed.failure_reasons.includes("requested_layers_mismatch"));
  assert.ok(failed.failure_reasons.some((reason) => reason.startsWith("missing_included_candidate:")));
  assert.deepEqual(validateVectorArtifact(failed), []);
});
