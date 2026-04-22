import { evaluateProjectionReadDecision, type ProjectionReadContext } from "../adapter-sdk/projection.js";
import type {
  CoreRecord,
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
  records?: CoreRecord[];
  read_context?: ProjectionReadContext;
}

export interface NormalizeExternalCandidateBatchInput {
  recipe: RetrievalRecipe;
  batch: ExternalCandidateBatch;
  records?: CoreRecord[];
  read_context?: ProjectionReadContext;
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

function authorityForLayer(layer: Layer): RetrievalAuthority {
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

function localRefForRecord(record: CoreRecord): Reference {
  return {
    id: record.id,
    kind: record.kind,
    layer: record.layer,
  };
}

function suppressionReasons(input: {
  recipe: RetrievalRecipe;
  candidate: ExternalRetrievalCandidate;
  mapped_record?: CoreRecord;
  read_context?: ProjectionReadContext;
}): RetrievalSuppressionReason[] {
  const reasons = new Set<RetrievalSuppressionReason>();
  if (input.recipe.external_candidate_policy !== "allow_normalized") {
    reasons.add("invalid_external_candidate");
  }
  if (!isMappedCandidate(input.candidate)) {
    reasons.add("invalid_external_candidate");
  } else {
    if (!input.mapped_record) {
      reasons.add("invalid_external_candidate");
    } else {
      if (
        input.candidate.mapped_ref.id !== input.mapped_record.id ||
        (input.candidate.mapped_ref.kind !== undefined && input.candidate.mapped_ref.kind !== input.mapped_record.kind) ||
        (input.candidate.mapped_ref.layer !== undefined && input.candidate.mapped_ref.layer !== input.mapped_record.layer) ||
        input.candidate.source_layer !== input.mapped_record.layer ||
        input.candidate.authority !== authorityForLayer(input.mapped_record.layer)
      ) {
        reasons.add("invalid_external_candidate");
      }
      if (!input.recipe.layer_scope.includes(input.mapped_record.layer)) {
        reasons.add("authority_mismatch");
      }
    }
  }
  if ((input.candidate.unsupported_mapping_reasons ?? []).length > 0) {
    reasons.add("invalid_external_candidate");
  }
  if (input.read_context && isMappedCandidate(input.candidate)) {
    if (input.mapped_record && !evaluateProjectionReadDecision(input.mapped_record, input.read_context).include) {
      reasons.add("visibility_scope_mismatch");
    }
  }
  return [...reasons];
}

export function normalizeExternalCandidates(input: NormalizeExternalCandidatesInput): RetrievalCandidate[] {
  const recordsById = new Map((input.records ?? []).map((record) => [record.id, record]));
  return input.candidates.map((candidate) => {
    const mapped = isMappedCandidate(candidate);
    const mappedRecord = mapped ? recordsById.get(candidate.mapped_ref.id) : undefined;
    const reasons = suppressionReasons({
      recipe: input.recipe,
      candidate,
      mapped_record: mappedRecord,
      read_context: input.read_context,
    });
    const ref = mappedRecord ? localRefForRecord(mappedRecord) : mapped ? candidate.mapped_ref : fallbackRef(candidate);
    const layer = mappedRecord ? mappedRecord.layer : "derived";
    const authority = mappedRecord ? authorityForLayer(mappedRecord.layer) : "derived";
    const suppression_reasons = reasons.length > 0 ? reasons : undefined;
    const readPolicySuppressed = reasons.includes("visibility_scope_mismatch");

    return {
      id: `candidate_external_${safeId(candidate.provider_id)}_${safeId(candidate.external_candidate_id)}`,
      ref,
      layer,
      authority,
      text_preview: readPolicySuppressed ? undefined : mappedRecord ? recordText(mappedRecord) : candidate.text_preview,
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
  if (input.batch.recipe_ref !== input.recipe.id) {
    throw new Error(`External candidate batch recipe_ref must equal current recipe: got ${String(input.batch.recipe_ref)}`);
  }

  for (const candidate of input.batch.candidates) {
    if (candidate.provider_id !== input.batch.provider_id) {
      throw new Error(`External candidate provider_id does not match batch provider_id: ${candidate.external_candidate_id}`);
    }
  }

  return normalizeExternalCandidates({
    recipe: input.recipe,
    records: input.records,
    read_context: input.read_context,
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
  if (batch.recipe_ref !== input.recipe.id) {
    throw new Error(`External provider batch recipe_ref drift: ${String(batch.recipe_ref)}`);
  }
  if (batch.query_ref !== undefined && batch.query_ref !== null && batch.query_ref !== input.query_ref) {
    throw new Error(`External provider batch query_ref drift: ${batch.query_ref}`);
  }
  for (const candidate of batch.candidates) {
    if (candidate.provider_id !== batch.provider_id) {
      throw new Error(`External provider candidate provider_id drift: ${candidate.external_candidate_id}`);
    }
  }

  return batch;
}
