import type {
  RetrievalAudit,
  RetrievalResult,
  RetrievalSuppressionReason,
  VectorSearchRun,
  VisibilityState,
} from "../types.js";

export interface BuildRetrievalAuditInput {
  id: string;
  now: string;
  result: RetrievalResult;
  vector_search_runs?: VectorSearchRun[];
  result_ref?: string | null;
  visibility_state?: VisibilityState;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function assertSearchRunMatchesResult(result: RetrievalResult, run: VectorSearchRun): void {
  if (run.query_ref !== result.query_ref) {
    throw new Error(`Retrieval audit query mismatch: ${run.query_ref} !== ${result.query_ref}`);
  }
  if (run.recipe_ref !== undefined && run.recipe_ref !== null && run.recipe_ref !== result.recipe_ref) {
    throw new Error(`Retrieval audit recipe mismatch: ${run.recipe_ref} !== ${result.recipe_ref}`);
  }
}

export function buildRetrievalAudit(input: BuildRetrievalAuditInput): RetrievalAudit {
  const vectorSearchRuns = input.vector_search_runs ?? [];
  for (const run of vectorSearchRuns) {
    assertSearchRunMatchesResult(input.result, run);
  }

  const included_candidate_refs = unique(input.result.included_candidates.map((candidate) => candidate.id));
  const suppressed_candidate_refs = unique(input.result.suppressed_candidates.map((candidate) => candidate.id));
  const suppression_reasons = unique(
    input.result.suppressed_candidates.flatMap((candidate) => candidate.suppression_reasons ?? []),
  ).sort() as RetrievalSuppressionReason[];
  const vector_search_run_refs = unique(vectorSearchRuns.map((run) => run.id));
  const evidence_refs = unique([
    input.result.query_ref,
    input.result.recipe_ref,
    ...(input.result.trace_ref ? [input.result.trace_ref] : []),
    ...(input.result_ref ? [input.result_ref] : []),
    ...vector_search_run_refs,
    ...included_candidate_refs,
    ...suppressed_candidate_refs,
  ]);

  return {
    id: input.id,
    kind: "retrieval_audit",
    layer: "derived",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: input.visibility_state ?? {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "retrieval_audit",
      source_ref: input.result_ref ?? input.result.trace_ref ?? input.result.query_ref,
      evidence_refs,
      actor_ref: "system:retrieval_audit",
    },
    query_ref: input.result.query_ref,
    recipe_ref: input.result.recipe_ref,
    result_ref: input.result_ref ?? null,
    trace_ref: input.result.trace_ref ?? null,
    vector_search_run_refs,
    included_candidate_refs,
    suppressed_candidate_refs,
    suppression_reasons,
  };
}
