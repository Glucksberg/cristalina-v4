import type {
  ExternalCandidateBatch,
  ExternalRetrievalCandidate,
  Layer,
  Reference,
  RetrievalAuthority,
  RetrievalCandidate,
  RetrievalRecipe,
  RetrievalSuppressionReason,
} from "../types.js";

export interface NormalizeExternalCandidatesInput {
  recipe: RetrievalRecipe;
  candidates: ExternalRetrievalCandidate[];
}

export interface NormalizeExternalCandidateBatchInput {
  recipe: RetrievalRecipe;
  batch: ExternalCandidateBatch;
}

export interface ExternalCandidateProviderRequest {
  query_ref: string;
  recipe: RetrievalRecipe;
  now: string;
  external_run_id?: string | null;
}

export interface ExternalCandidateProvider {
  provider_id: string;
  retrieve(input: ExternalCandidateProviderRequest): ExternalCandidateBatch | Promise<ExternalCandidateBatch>;
}

export interface CreateFixtureExternalCandidateProviderInput {
  provider_id: string;
  candidates: ExternalRetrievalCandidate[];
  score_normalization?: string | null;
  model_ref?: string | null;
  index_ref?: string | null;
}

export interface RunExternalCandidateProviderInput {
  provider: ExternalCandidateProvider;
  query_ref: string;
  recipe: RetrievalRecipe;
  now: string;
  external_run_id?: string | null;
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "external";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function fallbackRef(candidate: ExternalRetrievalCandidate): Reference {
  return {
    id: `external_${safeId(candidate.provider_id)}_${safeId(candidate.external_candidate_id)}`,
    kind: "external_candidate",
    layer: "derived",
  };
}

function isMappedCandidate(
  candidate: ExternalRetrievalCandidate,
): candidate is ExternalRetrievalCandidate & { mapped_ref: Reference; source_layer: Layer; authority: RetrievalAuthority } {
  return candidate.mapped_ref !== undefined &&
    candidate.mapped_ref !== null &&
    candidate.source_layer !== undefined &&
    candidate.source_layer !== null &&
    candidate.authority !== undefined &&
    candidate.authority !== null;
}

function suppressionReasons(input: {
  recipe: RetrievalRecipe;
  candidate: ExternalRetrievalCandidate;
}): RetrievalSuppressionReason[] {
  const reasons = new Set<RetrievalSuppressionReason>();
  if (input.recipe.external_candidate_policy !== "allow_normalized") {
    reasons.add("invalid_external_candidate");
  }
  if (!isMappedCandidate(input.candidate)) {
    reasons.add("invalid_external_candidate");
  } else if (!input.recipe.layer_scope.includes(input.candidate.source_layer)) {
    reasons.add("authority_mismatch");
  }
  if ((input.candidate.unsupported_mapping_reasons ?? []).length > 0) {
    reasons.add("invalid_external_candidate");
  }
  return [...reasons];
}

export function normalizeExternalCandidates(input: NormalizeExternalCandidatesInput): RetrievalCandidate[] {
  return input.candidates.map((candidate) => {
    const reasons = suppressionReasons({
      recipe: input.recipe,
      candidate,
    });
    const mapped = isMappedCandidate(candidate);
    const ref = mapped ? candidate.mapped_ref : fallbackRef(candidate);
    const layer = mapped ? candidate.source_layer : "derived";
    const authority = mapped ? candidate.authority : "derived";
    const suppression_reasons = reasons.length > 0 ? reasons : undefined;

    return {
      id: `candidate_external_${safeId(candidate.provider_id)}_${safeId(candidate.external_candidate_id)}`,
      ref,
      layer,
      authority,
      text_preview: candidate.text_preview,
      symbol_refs: unique(candidate.symbol_refs ?? []),
      semantic_slot: candidate.semantic_slot,
      vector_score: candidate.score,
      final_score: candidate.score,
      why_retrieved: [
        `normalized external candidate from ${candidate.provider_id}`,
        ...(candidate.score_normalization ? [`external score normalization: ${candidate.score_normalization}`] : []),
        ...(candidate.model_ref ? [`external model: ${candidate.model_ref}`] : []),
        ...(candidate.index_ref ? [`external index: ${candidate.index_ref}`] : []),
        ...unique(candidate.unsupported_mapping_reasons ?? []).map((reason) => `unsupported mapping: ${reason}`),
      ],
      suppression_reasons,
      can_support_proposal: false,
    };
  });
}

export function normalizeExternalCandidateBatch(input: NormalizeExternalCandidateBatchInput): RetrievalCandidate[] {
  if (input.batch.recipe_ref !== undefined && input.batch.recipe_ref !== null && input.batch.recipe_ref !== input.recipe.id) {
    throw new Error(`External candidate batch recipe_ref does not match recipe: ${input.batch.recipe_ref}`);
  }

  for (const candidate of input.batch.candidates) {
    if (candidate.provider_id !== input.batch.provider_id) {
      throw new Error(`External candidate provider_id does not match batch provider_id: ${candidate.external_candidate_id}`);
    }
  }

  return normalizeExternalCandidates({
    recipe: input.recipe,
    candidates: input.batch.candidates.map((candidate) => ({
      ...candidate,
      score_normalization: candidate.score_normalization ?? input.batch.score_normalization ?? undefined,
      model_ref: candidate.model_ref ?? input.batch.model_ref ?? undefined,
      index_ref: candidate.index_ref ?? input.batch.index_ref ?? undefined,
    })),
  });
}

export function createFixtureExternalCandidateProvider(input: CreateFixtureExternalCandidateProviderInput): ExternalCandidateProvider {
  return {
    provider_id: input.provider_id,
    retrieve(request) {
      return {
        id: `external_candidate_batch_${safeId(input.provider_id)}_${safeId(request.query_ref)}`,
        provider_id: input.provider_id,
        external_run_id: request.external_run_id ?? `external_run_${safeId(input.provider_id)}_${safeId(request.query_ref)}`,
        query_ref: request.query_ref,
        recipe_ref: request.recipe.id,
        retrieved_at: request.now,
        score_normalization: input.score_normalization ?? null,
        model_ref: input.model_ref ?? null,
        index_ref: input.index_ref ?? null,
        candidates: input.candidates.map((candidate) => ({
          ...candidate,
          provider_id: input.provider_id,
          retrieved_at: candidate.retrieved_at || request.now,
        })),
      };
    },
  };
}

export async function runExternalCandidateProvider(input: RunExternalCandidateProviderInput): Promise<ExternalCandidateBatch> {
  const batch = await input.provider.retrieve({
    query_ref: input.query_ref,
    recipe: input.recipe,
    now: input.now,
    external_run_id: input.external_run_id,
  });

  if (batch.provider_id !== input.provider.provider_id) {
    throw new Error(`External provider batch provider_id drift: ${batch.provider_id}`);
  }
  if (batch.recipe_ref !== undefined && batch.recipe_ref !== null && batch.recipe_ref !== input.recipe.id) {
    throw new Error(`External provider batch recipe_ref drift: ${batch.recipe_ref}`);
  }
  for (const candidate of batch.candidates) {
    if (candidate.provider_id !== batch.provider_id) {
      throw new Error(`External provider candidate provider_id drift: ${candidate.external_candidate_id}`);
    }
  }

  return batch;
}
