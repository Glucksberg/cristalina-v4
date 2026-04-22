import { createHash } from "node:crypto";

import type {
  CoreRecord,
  EmbeddingModelManifest,
  EmbeddingRecord,
  VectorChunk,
  VectorCorpus,
  VectorIndexManifest,
  VectorMaintenanceRun,
  VisibilityState,
} from "../types.js";

export interface ValidateVectorArtifactsInput {
  id: string;
  now: string;
  corpus?: VectorCorpus;
  chunks: VectorChunk[];
  chunk_texts?: Record<string, string>;
  embedding_model?: EmbeddingModelManifest;
  embeddings: EmbeddingRecord[];
  embedding_vectors?: Record<string, number[]>;
  index_manifest?: VectorIndexManifest;
  visibility_state?: VisibilityState;
}

export interface PlanVectorInvalidationInput {
  id: string;
  now: string;
  records: CoreRecord[];
  chunks: VectorChunk[];
  embeddings: EmbeddingRecord[];
  corpus?: VectorCorpus;
  index_manifest?: VectorIndexManifest;
  visibility_state?: VisibilityState;
}

export interface RebuildExactIndexInput {
  id: string;
  now: string;
  corpus: VectorCorpus;
  embedding_model: EmbeddingModelManifest;
  embeddings: EmbeddingRecord[];
  index_manifest_id: string;
  index_generation: string;
  visibility_state?: VisibilityState;
}

export interface RebuildExactIndexResult {
  index_manifest?: VectorIndexManifest;
  maintenance_run: VectorMaintenanceRun;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sameSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) return false;
  for (const value of leftSet) {
    if (!rightSet.has(value)) return false;
  }
  return true;
}

export function validateVectorArtifacts(input: ValidateVectorArtifactsInput): VectorMaintenanceRun {
  const issueCodes = new Set<string>();
  const chunksById = new Map(input.chunks.map((chunk) => [chunk.id, chunk]));

  if (input.corpus) {
    if (!sameSet(input.corpus.chunk_refs, input.chunks.map((chunk) => chunk.id))) {
      issueCodes.add("corpus_chunk_membership_mismatch");
    }
    for (const chunk of input.chunks) {
      if (chunk.corpus_generation !== input.corpus.corpus_generation) {
        issueCodes.add("chunk_corpus_generation_mismatch");
      }
    }
  }

  if (input.chunk_texts) {
    for (const chunk of input.chunks) {
      const text = input.chunk_texts[chunk.id];
      if (text === undefined) {
        issueCodes.add("missing_chunk_text_blob");
        continue;
      }
      if (chunk.chunk_text_ref.checksum !== sha256(text)) {
        issueCodes.add("chunk_text_checksum_mismatch");
      }
    }
  }

  for (const embedding of input.embeddings) {
    const chunk = chunksById.get(embedding.chunk_ref);
    if (!chunk) {
      issueCodes.add("orphan_embedding");
      continue;
    }
    if (embedding.source_text_hash !== chunk.chunk_hash) {
      issueCodes.add("embedding_source_hash_mismatch");
    }
    if (input.embedding_model) {
      if (embedding.embedding_model_ref !== input.embedding_model.id) {
        issueCodes.add("embedding_model_ref_mismatch");
      }
      if (embedding.dimensions !== input.embedding_model.dimensions) {
        issueCodes.add("embedding_model_dimension_mismatch");
      }
      if (embedding.metric !== input.embedding_model.metric) {
        issueCodes.add("embedding_model_metric_mismatch");
      }
    }
    if (embedding.vector_ref.dimensions !== undefined && embedding.vector_ref.dimensions !== embedding.dimensions) {
      issueCodes.add("embedding_vector_dimension_mismatch");
    }
    if (embedding.vector_checksum !== embedding.vector_ref.checksum) {
      issueCodes.add("embedding_vector_checksum_mismatch");
    }
    if (input.embedding_vectors) {
      const vector = input.embedding_vectors[embedding.id];
      if (vector === undefined) {
        issueCodes.add("missing_embedding_vector_blob");
        continue;
      }
      if (vector.length !== embedding.dimensions) {
        issueCodes.add("embedding_vector_dimension_mismatch");
      }
      if (embedding.vector_checksum !== sha256(JSON.stringify(vector))) {
        issueCodes.add("embedding_vector_checksum_mismatch");
      }
    }
  }

  if (input.index_manifest) {
    if (input.corpus && input.index_manifest.corpus_ref !== input.corpus.id) {
      issueCodes.add("index_corpus_ref_mismatch");
    }
    if (input.embedding_model && input.index_manifest.embedding_model_ref !== input.embedding_model.id) {
      issueCodes.add("index_embedding_model_ref_mismatch");
    }
    if (input.embedding_model && input.index_manifest.dimensions !== input.embedding_model.dimensions) {
      issueCodes.add("index_dimension_mismatch");
    }
    if (input.embedding_model && input.index_manifest.metric !== input.embedding_model.metric) {
      issueCodes.add("index_metric_mismatch");
    }
    if (input.corpus && !sameSet(input.index_manifest.source_refs, input.corpus.source_refs)) {
      issueCodes.add("index_source_membership_mismatch");
    }
    for (const embedding of input.embeddings) {
      if (embedding.embedding_generation !== input.index_manifest.embedding_generation) {
        issueCodes.add("embedding_index_generation_mismatch");
      }
    }
    if (input.index_manifest.index_checksum !== undefined && input.index_manifest.index_checksum !== input.index_manifest.index_ref.checksum) {
      issueCodes.add("index_checksum_mismatch");
    }
  }

  const checked_artifact_refs = unique([
    ...(input.corpus ? [input.corpus.id] : []),
    ...input.chunks.map((chunk) => chunk.id),
    ...(input.embedding_model ? [input.embedding_model.id] : []),
    ...input.embeddings.map((embedding) => embedding.id),
    ...(input.index_manifest ? [input.index_manifest.id] : []),
  ]);
  const issue_codes = [...issueCodes].sort();

  return {
    id: input.id,
    kind: "vector_maintenance_run",
    layer: "derived",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: input.visibility_state ?? {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "vector_maintenance",
      source_ref: "validate_vector_artifacts",
      evidence_refs: checked_artifact_refs,
    },
    job: "validate_vector_artifacts",
    status: issue_codes.length === 0 ? "passed" : "completed_with_issues",
    corpus_ref: input.corpus?.id ?? null,
    index_manifest_ref: input.index_manifest?.id ?? null,
    checked_artifact_refs,
    issue_codes,
  };
}

export function planVectorInvalidation(input: PlanVectorInvalidationInput): VectorMaintenanceRun {
  const issueCodes = new Set<string>();
  const invalidatedRefs = new Set<string>();
  const rebuildCandidateRefs = new Set<string>();
  const recordsById = new Map(input.records.map((record) => [record.id, record]));
  const invalidatedChunkRefs = new Set<string>();

  for (const chunk of input.chunks) {
    const sourceRecord = recordsById.get(chunk.source_ref);
    if (!sourceRecord) {
      issueCodes.add("missing_source_record");
      invalidatedRefs.add(chunk.id);
      invalidatedChunkRefs.add(chunk.id);
      continue;
    }

    if (chunk.source_record_hash !== sha256(JSON.stringify(sourceRecord))) {
      issueCodes.add("source_record_hash_mismatch");
      invalidatedRefs.add(chunk.id);
      invalidatedChunkRefs.add(chunk.id);
    }
  }

  for (const embedding of input.embeddings) {
    if (invalidatedChunkRefs.has(embedding.chunk_ref)) {
      issueCodes.add("embedding_depends_on_invalidated_chunk");
      invalidatedRefs.add(embedding.id);
      rebuildCandidateRefs.add(embedding.id);
    }
  }

  if (invalidatedRefs.size > 0 && input.corpus) {
    rebuildCandidateRefs.add(input.corpus.id);
  }
  if (invalidatedRefs.size > 0 && input.index_manifest) {
    issueCodes.add("index_depends_on_invalidated_artifact");
    rebuildCandidateRefs.add(input.index_manifest.id);
  }

  const checked_artifact_refs = unique([
    ...(input.corpus ? [input.corpus.id] : []),
    ...input.chunks.map((chunk) => chunk.id),
    ...input.embeddings.map((embedding) => embedding.id),
    ...(input.index_manifest ? [input.index_manifest.id] : []),
  ]);
  const issue_codes = [...issueCodes].sort();
  const invalidated_artifact_refs = [...invalidatedRefs].sort();
  const rebuild_candidate_refs = [...rebuildCandidateRefs].sort();

  return {
    id: input.id,
    kind: "vector_maintenance_run",
    layer: "derived",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: input.visibility_state ?? {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "vector_maintenance",
      source_ref: "invalidate_changed_chunks",
      evidence_refs: checked_artifact_refs,
    },
    job: "invalidate_changed_chunks",
    status: issue_codes.length === 0 ? "passed" : "completed_with_issues",
    corpus_ref: input.corpus?.id ?? null,
    index_manifest_ref: input.index_manifest?.id ?? null,
    checked_artifact_refs,
    issue_codes,
    ...(invalidated_artifact_refs.length > 0 ? { invalidated_artifact_refs } : {}),
    ...(rebuild_candidate_refs.length > 0 ? { rebuild_candidate_refs } : {}),
  };
}

export function rebuildExactIndex(input: RebuildExactIndexInput): RebuildExactIndexResult {
  const issueCodes = new Set<string>();
  const chunkRefs = new Set(input.corpus.chunk_refs);
  const embeddingGenerations = unique(input.embeddings.map((embedding) => embedding.embedding_generation));

  if (input.embeddings.length === 0) {
    issueCodes.add("empty_embedding_set");
  }
  if (input.corpus.embedding_model_ref !== undefined && input.corpus.embedding_model_ref !== null && input.corpus.embedding_model_ref !== input.embedding_model.id) {
    issueCodes.add("corpus_embedding_model_ref_mismatch");
  }
  if (embeddingGenerations.length > 1) {
    issueCodes.add("embedding_generation_mismatch");
  }
  for (const embedding of input.embeddings) {
    if (!chunkRefs.has(embedding.chunk_ref)) {
      issueCodes.add("embedding_chunk_not_in_corpus");
    }
    if (embedding.embedding_model_ref !== input.embedding_model.id) {
      issueCodes.add("embedding_model_ref_mismatch");
    }
    if (embedding.dimensions !== input.embedding_model.dimensions) {
      issueCodes.add("embedding_model_dimension_mismatch");
    }
    if (embedding.metric !== input.embedding_model.metric) {
      issueCodes.add("embedding_model_metric_mismatch");
    }
  }

  const checked_artifact_refs = unique([
    input.corpus.id,
    input.embedding_model.id,
    ...input.embeddings.map((embedding) => embedding.id),
  ]);
  const issue_codes = [...issueCodes].sort();
  const baseRun = {
    id: input.id,
    kind: "vector_maintenance_run" as const,
    layer: "derived" as const,
    authoritative_home: "governance" as const,
    created_at: input.now,
    visibility_state: input.visibility_state ?? {
      privacy_scope: "project_private" as const,
    },
    provenance: {
      source_type: "vector_maintenance",
      source_ref: "rebuild_exact_index",
      evidence_refs: checked_artifact_refs,
    },
    job: "rebuild_exact_index" as const,
    corpus_ref: input.corpus.id,
    checked_artifact_refs,
  };

  if (issue_codes.length > 0) {
    return {
      maintenance_run: {
        ...baseRun,
        status: "rejected",
        index_manifest_ref: null,
        issue_codes,
      },
    };
  }

  const embeddingGeneration = embeddingGenerations[0];
  const indexChecksum = sha256(JSON.stringify({
    corpus_ref: input.corpus.id,
    embedding_refs: input.embeddings.map((embedding) => embedding.id),
    vector_checksums: input.embeddings.map((embedding) => embedding.vector_checksum),
  }));
  const index_manifest: VectorIndexManifest = {
    id: input.index_manifest_id,
    kind: "vector_index_manifest",
    layer: "derived",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: input.visibility_state ?? {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "rebuild_exact_index",
      source_ref: input.corpus.id,
      evidence_refs: checked_artifact_refs,
      actor_ref: "system:vector_maintenance",
    },
    index_ref: {
      path: `derived/vector/indexes/${input.index_manifest_id}.json`,
      checksum: indexChecksum,
      encoding: input.embedding_model.vector_encoding,
      dimensions: input.embedding_model.dimensions,
      generation_id: input.index_generation,
      producing_ref: input.index_manifest_id,
    },
    corpus_ref: input.corpus.id,
    embedding_model_ref: input.embedding_model.id,
    dimensions: input.embedding_model.dimensions,
    metric: input.embedding_model.metric,
    index_kind: "exact",
    chunk_policy_version: input.corpus.chunk_policy_version,
    source_refs: input.corpus.source_refs,
    corpus_generation: input.corpus.corpus_generation,
    embedding_generation: embeddingGeneration,
    index_generation: input.index_generation,
    vector_encoding: input.embedding_model.vector_encoding,
    index_checksum: indexChecksum,
  };

  return {
    index_manifest,
    maintenance_run: {
      ...baseRun,
      status: "passed",
      index_manifest_ref: index_manifest.id,
      issue_codes: [],
      rebuilt_artifact_refs: [index_manifest.id],
    },
  };
}
