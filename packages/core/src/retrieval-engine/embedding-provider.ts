import { createHash } from "node:crypto";

import type {
  EmbeddingBatchRun,
  EmbeddingModelManifest,
  EmbeddingRecord,
  VectorChunk,
  VectorMetric,
  VisibilityState,
} from "../types.js";

export interface EmbeddingProviderInput {
  now: string;
  chunks: VectorChunk[];
  chunk_texts: Record<string, string>;
  embedding_model: EmbeddingModelManifest;
  embedding_generation: string;
  batch_id: string;
  visibility_state?: VisibilityState;
}

export interface EmbeddingQueryInput {
  query_text: string;
  embedding_model: EmbeddingModelManifest;
}

export interface EmbeddingProviderResult {
  batch_run: EmbeddingBatchRun;
  embeddings: EmbeddingRecord[];
  embedding_vectors: Record<string, number[]>;
}

export interface EmbeddingProvider {
  readonly provider_id: string;
  readonly deterministic_fixture_mode: boolean;
  embedQuery(input: EmbeddingQueryInput): number[];
  embed(input: EmbeddingProviderInput): EmbeddingProviderResult;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function vectorFromText(text: string, dimensions: number): number[] {
  const bytes = createHash("sha256").update(text).digest();
  const values = Array.from({ length: dimensions }, (_, index) => ((bytes[index % bytes.length] ?? 0) / 255) * 2 - 1);
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return values;
  return values.map((value) => Number((value / magnitude).toFixed(8)));
}

function assertDeterministicModel(input: { embedding_model: EmbeddingModelManifest; provider_id: string }): void {
  if (input.embedding_model.provider_id !== input.provider_id) {
    throw new Error(`Embedding model provider mismatch: ${input.embedding_model.provider_id} !== ${input.provider_id}`);
  }
  if (!input.embedding_model.deterministic_fixture_mode) {
    throw new Error("Deterministic fixture provider requires deterministic_fixture_mode");
  }
}

function embeddingId(chunk: VectorChunk, generation: string): string {
  return `embed_${chunk.id}_${generation}`.replace(/[^A-Za-z0-9._-]+/g, "_");
}

export function createDeterministicFixtureEmbeddingProvider(provider_id = "deterministic_fixture"): EmbeddingProvider {
  return {
    provider_id,
    deterministic_fixture_mode: true,
    embedQuery(input) {
      assertDeterministicModel({
        embedding_model: input.embedding_model,
        provider_id,
      });
      return vectorFromText(`query\n${input.embedding_model.id}\n${input.query_text}`, input.embedding_model.dimensions);
    },
    embed(input) {
      assertDeterministicModel({
        embedding_model: input.embedding_model,
        provider_id,
      });

      const embedding_vectors: Record<string, number[]> = {};
      const embeddings: EmbeddingRecord[] = input.chunks.map((chunk) => {
        const text = input.chunk_texts[chunk.id];
        if (text === undefined) {
          throw new Error(`Missing chunk text for ${chunk.id}`);
        }
        const id = embeddingId(chunk, input.embedding_generation);
        const vector = vectorFromText(`${input.embedding_model.id}\n${chunk.chunk_hash}\n${text}`, input.embedding_model.dimensions);
        const checksum = sha256(JSON.stringify(vector));
        embedding_vectors[id] = vector;

        return {
          id,
          kind: "embedding_record",
          layer: "derived",
          authoritative_home: chunk.authoritative_home,
          created_at: input.now,
          visibility_state: input.visibility_state ?? chunk.visibility_state,
          provenance: {
            source_type: "deterministic_embedding_provider",
            source_ref: chunk.id,
            evidence_refs: [chunk.id],
            actor_ref: `system:${provider_id}`,
          },
          chunk_ref: chunk.id,
          embedding_model_ref: input.embedding_model.id,
          dimensions: input.embedding_model.dimensions,
          metric: input.embedding_model.metric as VectorMetric,
          vector_ref: {
            path: `derived/vector/embeddings/${id}.json`,
            checksum,
            encoding: input.embedding_model.vector_encoding,
            dimensions: input.embedding_model.dimensions,
            generation_id: input.embedding_generation,
            producing_ref: id,
          },
          source_text_hash: chunk.chunk_hash,
          embedding_generation: input.embedding_generation,
          vector_encoding: input.embedding_model.vector_encoding,
          vector_checksum: checksum,
        };
      });

      const status = embeddings.length === input.chunks.length ? "completed" : "completed_with_diagnostics";
      return {
        batch_run: {
          id: input.batch_id,
          kind: "embedding_batch_run",
          layer: "derived",
          authoritative_home: "governance",
          created_at: input.now,
          visibility_state: input.visibility_state ?? {
            privacy_scope: "project_private",
          },
          provenance: {
            source_type: "deterministic_embedding_provider",
            source_ref: input.embedding_model.id,
            evidence_refs: input.chunks.map((chunk) => chunk.id),
            actor_ref: `system:${provider_id}`,
          },
          embedding_model_ref: input.embedding_model.id,
          chunk_refs: input.chunks.map((chunk) => chunk.id),
          embedding_refs: embeddings.map((embedding) => embedding.id),
          dimensions: input.embedding_model.dimensions,
          metric: input.embedding_model.metric,
          embedding_generation: input.embedding_generation,
          status,
        },
        embeddings,
        embedding_vectors,
      };
    },
  };
}
