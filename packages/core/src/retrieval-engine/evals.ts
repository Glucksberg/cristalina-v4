import type {
  RetrievalAuthority,
  RetrievalCandidate,
  RetrievalEvalRun,
  RetrievalResult,
  RetrievalSuppressionReason,
  VectorSearchRun,
  VisibilityState,
} from "../types.js";

export interface RetrievalEvalCase {
  id: string;
  query_ref: string;
  recipe_ref: string;
  expected_included_candidate_refs: string[];
  expected_suppressed_candidate_refs: string[];
  expected_authority_by_candidate_ref?: Record<string, RetrievalAuthority>;
  required_suppression_reasons_by_candidate_ref?: Record<string, RetrievalSuppressionReason[]>;
  proposal_support_candidate_refs?: string[];
}

export interface RunRetrievalEvalInput {
  id: string;
  now: string;
  eval_case: RetrievalEvalCase;
  result: RetrievalResult;
  k: number;
  result_ref?: string | null;
  visibility_state?: VisibilityState;
}

export interface RetrievalEvalBaseline {
  name: string;
  result: RetrievalResult;
  result_ref?: string | null;
}

export interface CompareRetrievalBaselinesInput {
  id_prefix: string;
  now: string;
  eval_case: RetrievalEvalCase;
  baselines: RetrievalEvalBaseline[];
  k: number;
  visibility_state?: VisibilityState;
}

export interface RunVectorSearchComparisonEvalInput {
  id: string;
  now: string;
  exact_search_run: VectorSearchRun;
  candidate_search_run: VectorSearchRun;
  k: number;
  recall_floor: number;
  result_ref?: string | null;
  visibility_state?: VisibilityState;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function intersectionSize(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).length;
}

function candidateMap(result: RetrievalResult): Map<string, RetrievalCandidate> {
  return new Map(
    [...result.included_candidates, ...result.suppressed_candidates].map((candidate) => [candidate.id, candidate]),
  );
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "baseline";
}

export function runRetrievalEval(input: RunRetrievalEvalInput): RetrievalEvalRun {
  const k = Math.max(0, Math.floor(input.k));
  const observed_included_candidate_refs = unique(input.result.included_candidates.slice(0, k).map((candidate) => candidate.id));
  const observed_suppressed_candidate_refs = unique(input.result.suppressed_candidates.map((candidate) => candidate.id));
  const expectedIncluded = unique(input.eval_case.expected_included_candidate_refs);
  const expectedSuppressed = unique(input.eval_case.expected_suppressed_candidate_refs);
  const matchedExpected = intersectionSize(observed_included_candidate_refs, expectedIncluded);
  const recall_at_k = expectedIncluded.length === 0 ? 1 : matchedExpected / expectedIncluded.length;
  const precision_at_k = observed_included_candidate_refs.length === 0
    ? expectedIncluded.length === 0 ? 1 : 0
    : matchedExpected / observed_included_candidate_refs.length;

  const failures = new Set<string>();
  for (const expectedRef of expectedIncluded) {
    if (!observed_included_candidate_refs.includes(expectedRef)) failures.add(`missing_included_candidate:${expectedRef}`);
  }
  for (const expectedRef of expectedSuppressed) {
    if (!observed_suppressed_candidate_refs.includes(expectedRef)) failures.add(`missing_suppressed_candidate:${expectedRef}`);
  }

  const candidatesById = candidateMap(input.result);
  let authority_correct = true;
  for (const [candidateRef, expectedAuthority] of Object.entries(input.eval_case.expected_authority_by_candidate_ref ?? {})) {
    const candidate = candidatesById.get(candidateRef);
    if (!candidate || candidate.authority !== expectedAuthority) {
      authority_correct = false;
      failures.add(`authority_mismatch:${candidateRef}`);
    }
  }

  for (const [candidateRef, expectedReasons] of Object.entries(input.eval_case.required_suppression_reasons_by_candidate_ref ?? {})) {
    const candidate = candidatesById.get(candidateRef);
    const observedReasons = new Set(candidate?.suppression_reasons ?? []);
    for (const reason of expectedReasons) {
      if (!observedReasons.has(reason)) failures.add(`missing_suppression_reason:${candidateRef}:${reason}`);
    }
  }

  let provenance_complete = true;
  for (const candidate of input.result.included_candidates) {
    if (candidate.can_support_proposal && (candidate.eligible_upstream_refs ?? []).length === 0) {
      provenance_complete = false;
      failures.add(`proposal_support_missing_upstream:${candidate.id}`);
    }
  }
  for (const candidateRef of input.eval_case.proposal_support_candidate_refs ?? []) {
    const candidate = candidatesById.get(candidateRef);
    if (!candidate?.can_support_proposal || (candidate.eligible_upstream_refs ?? []).length === 0) {
      provenance_complete = false;
      failures.add(`expected_proposal_support_missing:${candidateRef}`);
    }
  }

  const passed = recall_at_k === 1 && precision_at_k === 1 && authority_correct && provenance_complete && failures.size === 0;

  return {
    id: input.id,
    kind: "retrieval_eval_run",
    layer: "derived",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: input.visibility_state ?? {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "retrieval_eval",
      source_ref: input.eval_case.id,
      evidence_refs: [
        input.eval_case.query_ref,
        input.eval_case.recipe_ref,
        ...observed_included_candidate_refs,
        ...observed_suppressed_candidate_refs,
      ],
    },
    eval_case_ref: input.eval_case.id,
    query_ref: input.eval_case.query_ref,
    recipe_ref: input.eval_case.recipe_ref,
    result_ref: input.result_ref ?? null,
    trace_ref: input.result.trace_ref ?? null,
    expected_included_candidate_refs: expectedIncluded,
    expected_suppressed_candidate_refs: expectedSuppressed,
    observed_included_candidate_refs,
    observed_suppressed_candidate_refs,
    recall_at_k,
    precision_at_k,
    authority_correct,
    provenance_complete,
    passed,
    failure_reasons: [...failures].sort(),
  };
}

export function compareRetrievalBaselines(input: CompareRetrievalBaselinesInput): RetrievalEvalRun[] {
  return input.baselines.map((baseline) =>
    runRetrievalEval({
      id: `${input.id_prefix}_${safeId(baseline.name)}`,
      now: input.now,
      eval_case: input.eval_case,
      result: baseline.result,
      k: input.k,
      result_ref: baseline.result_ref ?? baseline.name,
      visibility_state: input.visibility_state,
    }),
  );
}

export function runVectorSearchComparisonEval(input: RunVectorSearchComparisonEvalInput): RetrievalEvalRun {
  const k = Math.max(0, Math.floor(input.k));
  const recallFloor = Math.max(0, Math.min(1, input.recall_floor));
  const expected_included_candidate_refs = unique(input.exact_search_run.candidate_refs.slice(0, k));
  const expected_suppressed_candidate_refs = unique(input.exact_search_run.suppressed_candidate_refs);
  const observed_included_candidate_refs = unique(input.candidate_search_run.candidate_refs.slice(0, k));
  const observed_suppressed_candidate_refs = unique(input.candidate_search_run.suppressed_candidate_refs);
  const matchedExpected = intersectionSize(observed_included_candidate_refs, expected_included_candidate_refs);
  const recall_at_k = expected_included_candidate_refs.length === 0 ? 1 : matchedExpected / expected_included_candidate_refs.length;
  const precision_at_k = observed_included_candidate_refs.length === 0
    ? expected_included_candidate_refs.length === 0 ? 1 : 0
    : matchedExpected / observed_included_candidate_refs.length;

  const failures = new Set<string>();
  if (input.exact_search_run.query_ref !== input.candidate_search_run.query_ref) {
    failures.add("query_ref_mismatch");
  }
  if (input.exact_search_run.recipe_ref !== input.candidate_search_run.recipe_ref) {
    failures.add("recipe_ref_mismatch");
  }
  if (input.exact_search_run.metric !== input.candidate_search_run.metric) {
    failures.add("metric_mismatch");
  }
  if (
    input.exact_search_run.requested_layers.length !== input.candidate_search_run.requested_layers.length ||
    !input.exact_search_run.requested_layers.every((layer) => input.candidate_search_run.requested_layers.includes(layer))
  ) {
    failures.add("requested_layers_mismatch");
  }
  if (recall_at_k < recallFloor) {
    failures.add(`recall_below_floor:${recall_at_k}:${recallFloor}`);
  }
  for (const expectedRef of expected_included_candidate_refs) {
    if (!observed_included_candidate_refs.includes(expectedRef)) failures.add(`missing_included_candidate:${expectedRef}`);
  }
  for (const expectedRef of expected_suppressed_candidate_refs) {
    if (!observed_suppressed_candidate_refs.includes(expectedRef)) failures.add(`missing_suppressed_candidate:${expectedRef}`);
  }

  return {
    id: input.id,
    kind: "retrieval_eval_run",
    layer: "derived",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: input.visibility_state ?? {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "retrieval_eval",
      source_ref: input.exact_search_run.id,
      evidence_refs: [
        input.exact_search_run.id,
        input.candidate_search_run.id,
        ...expected_included_candidate_refs,
        ...expected_suppressed_candidate_refs,
        ...observed_included_candidate_refs,
        ...observed_suppressed_candidate_refs,
      ],
    },
    eval_case_ref: `vector_search_compare:${input.exact_search_run.id}:${input.candidate_search_run.id}`,
    query_ref: input.exact_search_run.query_ref,
    recipe_ref: input.exact_search_run.recipe_ref ?? input.candidate_search_run.recipe_ref ?? "unknown_recipe",
    result_ref: input.result_ref ?? input.candidate_search_run.id,
    trace_ref: null,
    expected_included_candidate_refs,
    expected_suppressed_candidate_refs,
    observed_included_candidate_refs,
    observed_suppressed_candidate_refs,
    recall_at_k,
    precision_at_k,
    authority_correct: true,
    provenance_complete: true,
    passed: failures.size === 0,
    failure_reasons: [...failures].sort(),
  };
}
