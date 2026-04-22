import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateVectorArtifact } from "../validation.js";
import { runRetrievalEval, type RetrievalEvalCase } from "./evals.js";

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
