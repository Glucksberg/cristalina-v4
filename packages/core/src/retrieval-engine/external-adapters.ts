import type {
  ExternalCandidateBatch,
  ExternalRetrievalCandidate,
  Layer,
  Reference,
  RetrievalAuthority,
} from "../types.js";

export interface ExternalCandidateRefMapping {
  mapped_ref?: Reference | null;
  source_layer?: Layer | null;
  authority?: RetrievalAuthority | null;
  symbol_refs?: string[];
  semantic_slot?: string;
  unsupported_mapping_reasons?: string[];
}

export interface Mem0MemoryCandidate {
  id?: string;
  memory_id?: string;
  memory?: string;
  text?: string;
  score?: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ImportMem0CandidateBatchInput {
  id: string;
  retrieved_at: string;
  memories: Mem0MemoryCandidate[];
  provider_id?: string;
  external_run_id?: string | null;
  query_ref?: string | null;
  recipe_ref?: string | null;
  score_normalization?: string | null;
  model_ref?: string | null;
  index_ref?: string | null;
  mappings?: Record<string, ExternalCandidateRefMapping>;
  diagnostic_refs?: string[];
}

export interface GraphitiSearchCandidate {
  uuid?: string;
  id?: string;
  name?: string;
  fact?: string;
  summary?: string;
  score?: number;
  valid_at?: string | null;
  invalid_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ImportGraphitiCandidateBatchInput {
  id: string;
  retrieved_at: string;
  candidates: GraphitiSearchCandidate[];
  provider_id?: string;
  external_run_id?: string | null;
  query_ref?: string | null;
  recipe_ref?: string | null;
  score_normalization?: string | null;
  model_ref?: string | null;
  index_ref?: string | null;
  mappings?: Record<string, ExternalCandidateRefMapping>;
  diagnostic_refs?: string[];
}

function safeExternalId(value: string | undefined, fallback: string): string {
  const source = value && value.length > 0 ? value : fallback;
  return source.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

function stringFromMetadata(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mappingFor(
  mappings: Record<string, ExternalCandidateRefMapping> | undefined,
  externalId: string,
  metadata: Record<string, unknown> | undefined,
): ExternalCandidateRefMapping {
  const explicit = mappings?.[externalId];
  if (explicit) return explicit;
  const metadataMappingHints = [
    stringFromMetadata(metadata, "cristalina_ref"),
    stringFromMetadata(metadata, "source_layer"),
    stringFromMetadata(metadata, "authority"),
  ].filter((value): value is string => value !== undefined);
  return {
    unsupported_mapping_reasons: metadataMappingHints.length > 0
      ? ["missing_local_mapping", "external_metadata_mapping_untrusted"]
      : ["missing_cristalina_ref"],
  };
}

function applyMapping(
  candidate: Omit<ExternalRetrievalCandidate, "mapped_ref" | "source_layer" | "authority" | "symbol_refs" | "semantic_slot" | "unsupported_mapping_reasons">,
  mapping: ExternalCandidateRefMapping,
): ExternalRetrievalCandidate {
  return {
    ...candidate,
    mapped_ref: mapping.mapped_ref ?? null,
    source_layer: mapping.source_layer ?? null,
    authority: mapping.authority ?? null,
    symbol_refs: mapping.symbol_refs,
    semantic_slot: mapping.semantic_slot,
    unsupported_mapping_reasons: mapping.unsupported_mapping_reasons,
  };
}

export function importMem0CandidateBatch(input: ImportMem0CandidateBatchInput): ExternalCandidateBatch {
  const provider_id = input.provider_id ?? "mem0";
  return {
    id: input.id,
    provider_id,
    external_run_id: input.external_run_id ?? null,
    query_ref: input.query_ref ?? null,
    recipe_ref: input.recipe_ref ?? null,
    retrieved_at: input.retrieved_at,
    score_normalization: input.score_normalization ?? null,
    model_ref: input.model_ref ?? null,
    index_ref: input.index_ref ?? null,
    diagnostic_refs: input.diagnostic_refs,
    candidates: input.memories.map((memory, index) => {
      const externalId = safeExternalId(memory.id ?? memory.memory_id, `mem0_candidate_${index + 1}`);
      return applyMapping(
        {
          provider_id,
          external_candidate_id: externalId,
          score: numberOrUndefined(memory.score ?? memory.metadata?.score),
          score_normalization: input.score_normalization ?? undefined,
          model_ref: input.model_ref ?? null,
          index_ref: input.index_ref ?? null,
          retrieved_at: input.retrieved_at,
          text_preview: memory.memory ?? memory.text,
        },
        mappingFor(input.mappings, externalId, memory.metadata),
      );
    }),
  };
}

export function importGraphitiCandidateBatch(input: ImportGraphitiCandidateBatchInput): ExternalCandidateBatch {
  const provider_id = input.provider_id ?? "graphiti";
  return {
    id: input.id,
    provider_id,
    external_run_id: input.external_run_id ?? null,
    query_ref: input.query_ref ?? null,
    recipe_ref: input.recipe_ref ?? null,
    retrieved_at: input.retrieved_at,
    score_normalization: input.score_normalization ?? null,
    model_ref: input.model_ref ?? null,
    index_ref: input.index_ref ?? null,
    diagnostic_refs: input.diagnostic_refs,
    candidates: input.candidates.map((candidate, index) => {
      const externalId = safeExternalId(candidate.uuid ?? candidate.id, `graphiti_candidate_${index + 1}`);
      const mapping = mappingFor(input.mappings, externalId, candidate.metadata);
      const unsupported_mapping_reasons = [
        ...(mapping.unsupported_mapping_reasons ?? []),
        ...(candidate.invalid_at ? ["graphiti_candidate_invalidated"] : []),
      ];
      return applyMapping(
        {
          provider_id,
          external_candidate_id: externalId,
          score: numberOrUndefined(candidate.score ?? candidate.metadata?.score),
          score_normalization: input.score_normalization ?? undefined,
          model_ref: input.model_ref ?? null,
          index_ref: input.index_ref ?? null,
          retrieved_at: input.retrieved_at,
          text_preview: candidate.fact ?? candidate.summary ?? candidate.name,
        },
        {
          ...mapping,
          unsupported_mapping_reasons: unsupported_mapping_reasons.length > 0 ? unsupported_mapping_reasons : undefined,
        },
      );
    }),
  };
}
