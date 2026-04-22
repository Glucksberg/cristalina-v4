import { evaluateProjectionReadDecision, type ProjectionReadContext } from "../adapter-sdk/projection.js";
import type {
  CanonicalMemoryObject,
  CoreRecord,
  EmbeddingRecord,
  Layer,
  RetrievalAuthority,
  RetrievalCandidate,
  RetrievalRecipe,
  RetrievalResult,
  RetrievalSuppressionReason,
  VectorChunk,
  VectorSearchRun,
  WikiClaim,
} from "../types.js";

export interface ExactVectorSearchInput {
  id: string;
  now: string;
  query_ref: string;
  query_vector: number[];
  recipe: RetrievalRecipe;
  chunks: VectorChunk[];
  embeddings: EmbeddingRecord[];
  embedding_vectors: Record<string, number[]>;
  records: CoreRecord[];
  index_manifest_ref: string;
  search_generation: string;
  read_context?: ProjectionReadContext;
}

export interface ExactVectorSearchResult {
  search_run: VectorSearchRun;
  candidates: RetrievalCandidate[];
}

export interface HybridRetrievalInput {
  query_ref: string;
  recipe: RetrievalRecipe;
  candidates: RetrievalCandidate[];
  trace_ref?: string;
}

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

function magnitude(vector: number[]): number {
  return Math.sqrt(dot(vector, vector));
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new Error(`Vector dimension mismatch: ${left.length} !== ${right.length}`);
  }

  const denominator = magnitude(left) * magnitude(right);
  if (denominator === 0) return 0;
  return dot(left, right) / denominator;
}

function retrievalAuthority(layer: Layer): RetrievalAuthority {
  switch (layer) {
    case "raw":
      return "evidence";
    case "runtime":
      return "runtime";
    case "world":
      return "world";
    case "wiki":
      return "editorial";
    case "canon":
      return "canon";
    case "governance":
      return "governance";
    case "derived":
    case "audits":
      return "derived";
  }
}

function recordText(record: CoreRecord): string | undefined {
  if ("statement" in record && typeof record.statement === "string") return record.statement;
  if ("summary" in record && typeof record.summary === "string") return record.summary;
  if ("content_ref" in record && typeof record.content_ref === "string") return record.content_ref;
  if ("title" in record && typeof record.title === "string") return record.title;
  return undefined;
}

function semanticSlot(record: CoreRecord): string | undefined {
  return "semantic_slot" in record && typeof record.semantic_slot === "string" ? record.semantic_slot : undefined;
}

function upstreamRefs(record: CoreRecord): string[] {
  const refs = new Set<string>([record.id, ...(record.upstream_refs ?? [])]);
  if ("support_refs" in record && Array.isArray(record.support_refs)) {
    record.support_refs.forEach((ref) => refs.add(ref));
  }
  if ("source_refs" in record && Array.isArray(record.source_refs)) {
    record.source_refs.forEach((ref) => refs.add(ref));
  }
  return [...refs];
}

function recordSuppressionReasons(record: CoreRecord): RetrievalSuppressionReason[] {
  const reasons = new Set<RetrievalSuppressionReason>();
  if ("temporal_state" in record && record.temporal_state?.temporal_status === "historical") {
    reasons.add("stale_record");
  }
  if ("staleness_state" in record && record.staleness_state === "stale") {
    reasons.add("stale_record");
  }
  if ("epistemic_state" in record && record.epistemic_state === "disputed") {
    reasons.add("contradicted_record");
  }
  return [...reasons];
}

function canSupportProposal(record: CoreRecord, recipe: RetrievalRecipe): boolean {
  const allowedLayers = recipe.can_support_proposal_from_layers ?? ["raw", "world", "canon"];
  if (!allowedLayers.includes(record.layer)) return false;
  if (record.layer === "wiki") return false;
  if (record.layer === "canon") {
    return (record as CanonicalMemoryObject).governance_state === "ratified";
  }
  return record.layer === "raw" || record.layer === "world";
}

function candidateFor(input: {
  record: CoreRecord;
  chunk: VectorChunk;
  vector_score: number;
  recipe: RetrievalRecipe;
}): RetrievalCandidate {
  const authority = retrievalAuthority(input.record.layer);
  const suppressionReasons = recordSuppressionReasons(input.record);
  const proposalSupport = suppressionReasons.length === 0 && canSupportProposal(input.record, input.recipe);
  const reasons = [
    "matched exact vector search",
    input.chunk.symbol_refs.length > 0 ? "matched symbol-linked chunk" : "matched chunk",
  ];
  if (authority === "editorial") reasons.push("wiki result remains editorial");

  return {
    id: `candidate_${input.record.id}`,
    ref: {
      id: input.record.id,
      kind: input.record.kind,
      layer: input.record.layer,
    },
    layer: input.record.layer,
    authority,
    text_ref: "path" in input.record && typeof input.record.path === "string" ? input.record.path : undefined,
    text_preview: recordText(input.record),
    visibility_state: input.record.visibility_state,
    symbol_refs: input.chunk.symbol_refs,
    semantic_slot: semanticSlot(input.record) ?? input.chunk.semantic_slot,
    vector_score: input.vector_score,
    symbolic_score: input.chunk.symbol_refs.length > 0 ? 1 : 0,
    authority_score: authority === "canon" ? 1 : authority === "world" ? 0.7 : authority === "evidence" ? 0.5 : 0.1,
    provenance_score: upstreamRefs(input.record).length > 1 ? 1 : 0.5,
    final_score: input.vector_score,
    why_retrieved: reasons,
    suppression_reasons: suppressionReasons.length > 0 ? suppressionReasons : undefined,
    can_support_proposal: proposalSupport,
    eligible_upstream_refs: proposalSupport ? upstreamRefs(input.record) : "support_refs" in input.record ? (input.record as WikiClaim).support_refs : undefined,
  };
}

export function executeExactVectorSearch(input: ExactVectorSearchInput): ExactVectorSearchResult {
  const recordsById = new Map(input.records.map((record) => [record.id, record]));
  const chunksById = new Map(input.chunks.map((chunk) => [chunk.id, chunk]));

  const candidates = input.embeddings
    .map((embedding) => {
      const chunk = chunksById.get(embedding.chunk_ref);
      if (!chunk) return undefined;
      if (!input.recipe.layer_scope.includes(chunk.source_layer)) return undefined;

      const vector = input.embedding_vectors[embedding.id];
      if (!vector) return undefined;

      const record = recordsById.get(chunk.source_ref);
      if (!record) return undefined;

      const candidate = candidateFor({
        record,
        chunk,
        vector_score: cosineSimilarity(input.query_vector, vector),
        recipe: input.recipe,
      });
      if (!input.read_context) return candidate;

      const decision = evaluateProjectionReadDecision(record, input.read_context);
      if (decision.include) return candidate;

      return {
        ...candidate,
        why_retrieved: [...candidate.why_retrieved, `read policy suppressed: ${decision.reason_code}`],
        suppression_reasons: [...new Set([...(candidate.suppression_reasons ?? []), "visibility_scope_mismatch" as const])],
        can_support_proposal: false,
      };
    })
    .filter((candidate): candidate is RetrievalCandidate => candidate !== undefined)
    .sort((left, right) => (right.vector_score ?? 0) - (left.vector_score ?? 0))
    .slice(0, input.recipe.vector_top_k);

  const search_run: VectorSearchRun = {
    id: input.id,
    kind: "vector_search_run",
    layer: "derived",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "exact_vector_search",
    source_ref: input.query_ref,
      evidence_refs: candidates.map((candidate) => candidate.ref.id),
    },
    query_ref: input.query_ref,
    index_manifest_ref: input.index_manifest_ref,
    recipe_ref: input.recipe.id,
    requested_layers: input.recipe.layer_scope,
    candidate_refs: candidates.filter((candidate) => !candidate.suppression_reasons?.length).map((candidate) => candidate.id),
    suppressed_candidate_refs: candidates.filter((candidate) => candidate.suppression_reasons?.length).map((candidate) => candidate.id),
    metric: "cosine",
    top_k: input.recipe.vector_top_k,
    search_generation: input.search_generation,
  };

  return {
    search_run,
    candidates,
  };
}

export function executeHybridRetrieval(input: HybridRetrievalInput): RetrievalResult {
  const scored = input.candidates
    .map((candidate) => {
      const final_score =
        (candidate.vector_score ?? 0) +
        (candidate.symbolic_score ?? 0) +
        (candidate.authority_score ?? 0) +
        (candidate.provenance_score ?? 0);
      return {
        ...candidate,
        final_score,
      };
    })
    .sort((left, right) => (right.final_score ?? 0) - (left.final_score ?? 0));

  const policySuppressed = scored.map((candidate) => {
    const suppressionReasons = new Set(candidate.suppression_reasons ?? []);
    if (candidate.authority === "editorial" && input.recipe.require_canon_for_truth_claims) {
      suppressionReasons.add("unsupported_wiki_claim");
    }
    const suppression_reasons = [...suppressionReasons];
    const legallySuppressed = suppression_reasons.some((reason) => reason !== "projection_budget_exceeded");
    return {
      ...candidate,
      suppression_reasons: suppression_reasons.length > 0 ? suppression_reasons : undefined,
      can_support_proposal: legallySuppressed ? false : candidate.can_support_proposal,
    };
  });

  const included_candidates: RetrievalCandidate[] = [];
  const budgetSuppressed: RetrievalCandidate[] = [];
  const layerCounts = new Map<string, number>();
  for (const candidate of policySuppressed) {
    if (candidate.suppression_reasons?.length) {
      continue;
    }
    const layerCount = layerCounts.get(candidate.layer) ?? 0;
    const layerBudget = input.recipe.max_candidates_per_layer?.[candidate.layer];
    if ((layerBudget !== undefined && layerCount >= layerBudget) || included_candidates.length >= input.recipe.final_top_k) {
      budgetSuppressed.push({
        ...candidate,
        suppression_reasons: ["projection_budget_exceeded"],
      });
      continue;
    }
    included_candidates.push(candidate);
    layerCounts.set(candidate.layer, layerCount + 1);
  }
  const suppressed_candidates = [
    ...policySuppressed.filter((candidate) => candidate.suppression_reasons?.length),
    ...budgetSuppressed,
  ];

  return {
    query_ref: input.query_ref,
    recipe_ref: input.recipe.id,
    included_candidates,
    suppressed_candidates,
    trace_ref: input.trace_ref,
  };
}
