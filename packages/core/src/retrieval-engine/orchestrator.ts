import { createHash } from "node:crypto";

import type { ProjectionReadContext } from "../adapter-sdk/projection.js";
import type {
  CoreRecord,
  EmbeddingBatchRun,
  EmbeddingModelManifest,
  EmbeddingRecord,
  RetrievalCandidate,
  RetrievalQuery,
  RetrievalRecipe,
  RetrievalResult,
  SymbolAnchor,
  VectorArtifact,
  VectorChunk,
  VectorCorpus,
  VectorIndexManifest,
  VectorSearchRun,
  VisibilityState,
} from "../types.js";
import { buildDeterministicVectorChunks } from "./chunking.js";
import { createDeterministicFixtureEmbeddingProvider, type EmbeddingProvider } from "./embedding-provider.js";
import { executeExactVectorSearch, executeHybridRetrieval } from "./exact-vector.js";

export interface ExecuteDeterministicRetrievalInput {
  now: string;
  query: RetrievalQuery;
  recipe: RetrievalRecipe;
  records: CoreRecord[];
  symbol_anchors?: SymbolAnchor[];
  embedding_model: EmbeddingModelManifest;
  chunk_policy_version: string;
  corpus_id: string;
  corpus_generation: string;
  chunk_generation: string;
  embedding_generation: string;
  embedding_batch_id: string;
  index_manifest_id: string;
  index_generation: string;
  search_run_id: string;
  search_generation: string;
  trace_ref?: string;
  provider?: EmbeddingProvider;
  read_context?: ProjectionReadContext;
  visibility_state?: VisibilityState;
}

export interface DeterministicRetrievalRun {
  query_vector: number[];
  chunks: VectorChunk[];
  chunk_texts: Record<string, string>;
  corpus: VectorCorpus;
  embedding_batch_run: EmbeddingBatchRun;
  embeddings: EmbeddingRecord[];
  embedding_vectors: Record<string, number[]>;
  index_manifest: VectorIndexManifest;
  search_run: VectorSearchRun;
  candidates: RetrievalCandidate[];
  result: RetrievalResult;
  vector_artifacts: VectorArtifact[];
}

function assertRecipeAuthority(input: ExecuteDeterministicRetrievalInput): void {
  const requiredKind = input.recipe.required_authenticated_principal_kind;
  if (!requiredKind) return;

  const observedKind = input.query.authenticated_principal?.kind;
  if (observedKind !== requiredKind) {
    throw new Error(
      `Retrieval recipe ${input.recipe.id} requires authenticated principal kind ${requiredKind}; got ${observedKind ?? "none"}`,
    );
  }
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function refsForRecord(record: CoreRecord, anchors: SymbolAnchor[]): string[] {
  return anchors
    .filter((anchor) => anchor.lifecycle_state === "active" && anchor.target_refs.includes(record.id))
    .map((anchor) => anchor.id);
}

function buildCorpus(input: {
  now: string;
  corpus_id: string;
  corpus_generation: string;
  chunk_policy_version: string;
  records: CoreRecord[];
  chunks: VectorChunk[];
  embedding_model_ref: string;
  visibility_state?: VisibilityState;
}): VectorCorpus {
  return {
    id: input.corpus_id,
    kind: "vector_corpus",
    layer: "derived",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: input.visibility_state ?? {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "deterministic_retrieval_orchestrator",
      source_ref: input.corpus_id,
      evidence_refs: input.records.map((record) => record.id),
      actor_ref: "system:deterministic_retrieval_orchestrator",
    },
    source_refs: input.records.map((record) => record.id),
    source_layers: unique(input.records.map((record) => record.layer)),
    chunk_policy_version: input.chunk_policy_version,
    corpus_generation: input.corpus_generation,
    chunk_refs: input.chunks.map((chunk) => chunk.id),
    embedding_model_ref: input.embedding_model_ref,
  };
}

function buildIndexManifest(input: {
  now: string;
  index_manifest_id: string;
  index_generation: string;
  corpus: VectorCorpus;
  embedding_model: EmbeddingModelManifest;
  embeddings: EmbeddingRecord[];
  visibility_state?: VisibilityState;
}): VectorIndexManifest {
  const indexChecksum = sha256(JSON.stringify({
    corpus_ref: input.corpus.id,
    embedding_refs: input.embeddings.map((embedding) => embedding.id),
    vector_checksums: input.embeddings.map((embedding) => embedding.vector_checksum),
  }));

  return {
    id: input.index_manifest_id,
    kind: "vector_index_manifest",
    layer: "derived",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: input.visibility_state ?? {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "deterministic_retrieval_orchestrator",
      source_ref: input.corpus.id,
      evidence_refs: [input.corpus.id, ...input.embeddings.map((embedding) => embedding.id)],
      actor_ref: "system:deterministic_retrieval_orchestrator",
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
    embedding_generation: input.embeddings[0]?.embedding_generation ?? "embedding_generation_empty",
    index_generation: input.index_generation,
    vector_encoding: input.embedding_model.vector_encoding,
    index_checksum: indexChecksum,
  };
}

export function executeDeterministicRetrieval(input: ExecuteDeterministicRetrievalInput): DeterministicRetrievalRun {
  if (input.query.recipe_ref !== input.recipe.id) {
    throw new Error(`Retrieval query recipe mismatch: ${input.query.recipe_ref} !== ${input.recipe.id}`);
  }
  if (input.query.read_policy_version !== input.recipe.read_policy_version) {
    throw new Error(`Retrieval query read policy mismatch: ${input.query.read_policy_version} !== ${input.recipe.read_policy_version}`);
  }
  for (const layer of input.query.requested_layers) {
    if (!input.recipe.layer_scope.includes(layer)) {
      throw new Error(`Retrieval query requested layer is outside recipe scope: ${layer}`);
    }
  }
  assertRecipeAuthority(input);
  const effectiveRecipe: RetrievalRecipe = {
    ...input.recipe,
    layer_scope: input.query.requested_layers,
  };

  const provider = input.provider ?? createDeterministicFixtureEmbeddingProvider(input.embedding_model.provider_id);
  const symbol_refs_by_record_ref = Object.fromEntries(
    input.records.map((record) => [record.id, refsForRecord(record, input.symbol_anchors ?? [])]),
  );
  const { chunks, chunk_texts } = buildDeterministicVectorChunks({
    now: input.now,
    records: input.records,
    chunk_policy_version: input.chunk_policy_version,
    corpus_generation: input.corpus_generation,
    chunk_generation: input.chunk_generation,
    symbol_refs_by_record_ref,
  });
  const corpus = buildCorpus({
    now: input.now,
    corpus_id: input.corpus_id,
    corpus_generation: input.corpus_generation,
    chunk_policy_version: input.chunk_policy_version,
    records: input.records,
    chunks,
    embedding_model_ref: input.embedding_model.id,
    visibility_state: input.visibility_state,
  });
  const embeddingResult = provider.embed({
    now: input.now,
    chunks,
    chunk_texts,
    embedding_model: input.embedding_model,
    embedding_generation: input.embedding_generation,
    batch_id: input.embedding_batch_id,
    visibility_state: input.visibility_state,
  });
  const index_manifest = buildIndexManifest({
    now: input.now,
    index_manifest_id: input.index_manifest_id,
    index_generation: input.index_generation,
    corpus,
    embedding_model: input.embedding_model,
    embeddings: embeddingResult.embeddings,
    visibility_state: input.visibility_state,
  });
  const query_vector = provider.embedQuery({
    query_text: input.query.query_text,
    embedding_model: input.embedding_model,
  });
  const exact = executeExactVectorSearch({
    id: input.search_run_id,
    now: input.now,
    query_ref: input.query.id,
    query_vector,
    recipe: effectiveRecipe,
    chunks,
    embeddings: embeddingResult.embeddings,
    embedding_vectors: embeddingResult.embedding_vectors,
    records: input.records,
    index_manifest_ref: index_manifest.id,
    search_generation: input.search_generation,
    read_context: input.read_context,
  });
  const result = executeHybridRetrieval({
    query_ref: input.query.id,
    recipe: effectiveRecipe,
    candidates: exact.candidates,
    trace_ref: input.trace_ref,
  });

  return {
    query_vector,
    chunks,
    chunk_texts,
    corpus,
    embedding_batch_run: embeddingResult.batch_run,
    embeddings: embeddingResult.embeddings,
    embedding_vectors: embeddingResult.embedding_vectors,
    index_manifest,
    search_run: exact.search_run,
    candidates: exact.candidates,
    result,
    vector_artifacts: [
      corpus,
      ...chunks,
      input.embedding_model,
      embeddingResult.batch_run,
      ...embeddingResult.embeddings,
      index_manifest,
      exact.search_run,
    ],
  };
}
