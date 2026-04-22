import { createHash } from "node:crypto";

import type {
  EmbeddingBatchRun,
  EmbeddingModelManifest,
  EmbeddingRecord,
  VectorChunk,
  VectorMetric,
  VisibilityState,
} from "../types.js";
import type { EmbeddingProviderInput, EmbeddingProviderResult, EmbeddingQueryInput } from "./embedding-provider.js";

export interface OpenAiCompatibleFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text?(): Promise<string>;
}

export type OpenAiCompatibleFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  },
) => Promise<OpenAiCompatibleFetchResponse>;

export interface OpenAiCompatibleEmbeddingProviderConfig {
  provider_id: string;
  endpoint: string;
  api_key?: string;
  fetch: OpenAiCompatibleFetch;
  organization?: string;
}

export interface AsyncEmbeddingProvider {
  readonly provider_id: string;
  readonly deterministic_fixture_mode: false;
  embedQuery(input: EmbeddingQueryInput): Promise<number[]>;
  embed(input: EmbeddingProviderInput): Promise<EmbeddingProviderResult>;
}

interface OpenAiEmbeddingData {
  index: number;
  embedding: number[];
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function embeddingId(chunk: VectorChunk, generation: string): string {
  return `embed_${chunk.id}_${generation}`.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function assertOpenAiCompatibleModel(input: { embedding_model: EmbeddingModelManifest; provider_id: string }): void {
  if (input.embedding_model.provider_id !== input.provider_id) {
    throw new Error(`Embedding model provider mismatch: ${input.embedding_model.provider_id} !== ${input.provider_id}`);
  }
  if (input.embedding_model.deterministic_fixture_mode) {
    throw new Error("OpenAI-compatible embedding provider requires non-deterministic model manifest");
  }
}

function parseEmbeddingData(value: unknown, dimensions: number): OpenAiEmbeddingData[] {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { data?: unknown }).data)) {
    throw new Error("OpenAI-compatible embedding response must contain data array");
  }
  return (value as { data: unknown[] }).data.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`OpenAI-compatible embedding entry ${index} must be an object`);
    }
    const observedIndex = (entry as { index?: unknown }).index;
    const embedding = (entry as { embedding?: unknown }).embedding;
    if (typeof observedIndex !== "number" || !Number.isInteger(observedIndex)) {
      throw new Error(`OpenAI-compatible embedding entry ${index} is missing integer index`);
    }
    if (!Array.isArray(embedding) || !embedding.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`OpenAI-compatible embedding entry ${index} is missing numeric embedding`);
    }
    if (embedding.length !== dimensions) {
      throw new Error(`OpenAI-compatible embedding dimension mismatch: ${embedding.length} !== ${dimensions}`);
    }
    return {
      index: observedIndex,
      embedding,
    };
  });
}

async function requestEmbeddings(input: {
  config: OpenAiCompatibleEmbeddingProviderConfig;
  embedding_model: EmbeddingModelManifest;
  texts: string[];
}): Promise<number[][]> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (input.config.api_key) headers.authorization = `Bearer ${input.config.api_key}`;
  if (input.config.organization) headers["openai-organization"] = input.config.organization;

  const response = await input.config.fetch(input.config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: input.embedding_model.model_id,
      input: input.texts,
      encoding_format: "float",
    }),
  });
  if (!response.ok) {
    const body = response.text ? await response.text() : "";
    throw new Error(`OpenAI-compatible embedding request failed: ${response.status}${body ? ` ${body}` : ""}`);
  }

  const entries = parseEmbeddingData(await response.json(), input.embedding_model.dimensions);
  const byIndex = new Map(entries.map((entry) => [entry.index, entry.embedding]));
  return input.texts.map((_, index) => {
    const vector = byIndex.get(index);
    if (!vector) throw new Error(`OpenAI-compatible embedding response missing index ${index}`);
    return vector;
  });
}

export function createOpenAiCompatibleEmbeddingProvider(
  config: OpenAiCompatibleEmbeddingProviderConfig,
): AsyncEmbeddingProvider {
  return {
    provider_id: config.provider_id,
    deterministic_fixture_mode: false,
    async embedQuery(input): Promise<number[]> {
      assertOpenAiCompatibleModel({
        embedding_model: input.embedding_model,
        provider_id: config.provider_id,
      });
      const [embedding] = await requestEmbeddings({
        config,
        embedding_model: input.embedding_model,
        texts: [input.query_text],
      });
      return embedding ?? [];
    },
    async embed(input): Promise<EmbeddingProviderResult> {
      assertOpenAiCompatibleModel({
        embedding_model: input.embedding_model,
        provider_id: config.provider_id,
      });

      const texts = input.chunks.map((chunk) => {
        const text = input.chunk_texts[chunk.id];
        if (text === undefined) throw new Error(`Missing chunk text for ${chunk.id}`);
        return text;
      });
      const vectors = await requestEmbeddings({
        config,
        embedding_model: input.embedding_model,
        texts,
      });
      const visibility_state: VisibilityState = input.visibility_state ?? {
        privacy_scope: "project_private",
      };
      const embedding_vectors: Record<string, number[]> = {};
      const embeddings: EmbeddingRecord[] = input.chunks.map((chunk, index) => {
        const id = embeddingId(chunk, input.embedding_generation);
        const vector = vectors[index];
        if (!vector) throw new Error(`OpenAI-compatible embedding response missing vector for ${chunk.id}`);
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
            source_type: "openai_compatible_embedding_provider",
            source_ref: chunk.id,
            evidence_refs: [chunk.id],
            actor_ref: `system:${config.provider_id}`,
          },
          chunk_ref: chunk.id,
          embedding_model_ref: input.embedding_model.id,
          dimensions: input.embedding_model.dimensions,
          metric: input.embedding_model.metric as VectorMetric,
          vector_ref: {
            path: `derived/vector/embeddings/${id}.vector.json`,
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

      const batch_run: EmbeddingBatchRun = {
        id: input.batch_id,
        kind: "embedding_batch_run",
        layer: "derived",
        authoritative_home: "governance",
        created_at: input.now,
        visibility_state,
        provenance: {
          source_type: "openai_compatible_embedding_provider",
          source_ref: input.embedding_model.id,
          evidence_refs: input.chunks.map((chunk) => chunk.id),
          actor_ref: `system:${config.provider_id}`,
        },
        embedding_model_ref: input.embedding_model.id,
        chunk_refs: input.chunks.map((chunk) => chunk.id),
        embedding_refs: embeddings.map((embedding) => embedding.id),
        dimensions: input.embedding_model.dimensions,
        metric: input.embedding_model.metric,
        embedding_generation: input.embedding_generation,
        status: "completed",
      };

      return {
        batch_run,
        embeddings,
        embedding_vectors,
      };
    },
  };
}
