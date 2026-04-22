import type {
  EmbeddingRecord,
  VectorChunk,
  VectorCorpus,
  VectorExportJsonlRow,
  VisibilityState,
} from "../types.js";

export interface BuildVectorExportJsonlRowsInput {
  export_run_ref: string;
  now: string;
  chunks: VectorChunk[];
  corpus?: VectorCorpus;
  chunk_texts?: Record<string, string>;
  embeddings?: EmbeddingRecord[];
  schema_version?: string;
  visibility_state?: VisibilityState;
}

export interface BuildVectorExportJsonlResult {
  rows: VectorExportJsonlRow[];
  jsonl: string;
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "vector_export";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function chunkOrder(input: { chunks: VectorChunk[]; corpus?: VectorCorpus }): VectorChunk[] {
  const chunksById = new Map(input.chunks.map((chunk) => [chunk.id, chunk]));
  if (!input.corpus) {
    return [...input.chunks].sort((left, right) => left.id.localeCompare(right.id));
  }
  return [
    ...input.corpus.chunk_refs.flatMap((chunkRef) => {
      const chunk = chunksById.get(chunkRef);
      return chunk ? [chunk] : [];
    }),
    ...input.chunks
      .filter((chunk) => !input.corpus?.chunk_refs.includes(chunk.id))
      .sort((left, right) => left.id.localeCompare(right.id)),
  ];
}

function rowBase(input: {
  id: string;
  now: string;
  export_run_ref: string;
  source_artifact_ref: string;
  schema_version: string;
  visibility_state?: VisibilityState;
  evidence_refs: string[];
}): Pick<
  VectorExportJsonlRow,
  | "id"
  | "kind"
  | "layer"
  | "authoritative_home"
  | "created_at"
  | "visibility_state"
  | "provenance"
  | "export_run_ref"
  | "schema_version"
  | "source_artifact_ref"
> {
  return {
    id: input.id,
    kind: "vector_export_jsonl_row",
    layer: "derived",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: input.visibility_state ?? {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "vector_export_jsonl",
      source_ref: input.export_run_ref,
      evidence_refs: unique(input.evidence_refs),
      actor_ref: "system:vector_export_jsonl",
    },
    export_run_ref: input.export_run_ref,
    schema_version: input.schema_version,
    source_artifact_ref: input.source_artifact_ref,
  };
}

export function buildVectorExportJsonlRows(input: BuildVectorExportJsonlRowsInput): VectorExportJsonlRow[] {
  const schemaVersion = input.schema_version ?? "vector_export_jsonl.v1";
  const exportRunId = safeId(input.export_run_ref);
  const rows: VectorExportJsonlRow[] = [];

  for (const chunk of chunkOrder({ chunks: input.chunks, corpus: input.corpus })) {
    const chunkText = input.chunk_texts?.[chunk.id];
    rows.push({
      ...rowBase({
        id: `vector_export_row_${exportRunId}_${safeId(chunk.id)}_chunk`,
        now: input.now,
        export_run_ref: input.export_run_ref,
        source_artifact_ref: chunk.id,
        schema_version: schemaVersion,
        visibility_state: input.visibility_state,
        evidence_refs: [chunk.id, chunk.source_ref, ...(input.corpus ? [input.corpus.id] : [])],
      }),
      row_kind: "chunk_metadata",
      corpus_ref: input.corpus?.id,
      chunk_ref: chunk.id,
      source_ref: chunk.source_ref,
      source_layer: chunk.source_layer,
      chunk_text_ref: chunk.chunk_text_ref,
      chunk_hash: chunk.chunk_hash,
      chunk_text_preview: chunkText?.slice(0, 280),
      symbol_refs: chunk.symbol_refs,
      semantic_slot: chunk.semantic_slot,
      corpus_generation: chunk.corpus_generation,
      chunk_generation: chunk.chunk_generation,
    });
  }

  for (const embedding of [...(input.embeddings ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    rows.push({
      ...rowBase({
        id: `vector_export_row_${exportRunId}_${safeId(embedding.id)}_embedding`,
        now: input.now,
        export_run_ref: input.export_run_ref,
        source_artifact_ref: embedding.id,
        schema_version: schemaVersion,
        visibility_state: input.visibility_state,
        evidence_refs: [embedding.id, embedding.chunk_ref],
      }),
      row_kind: "embedding_metadata",
      embedding_ref: embedding.id,
      chunk_ref: embedding.chunk_ref,
      embedding_model_ref: embedding.embedding_model_ref,
      dimensions: embedding.dimensions,
      metric: embedding.metric,
      vector_ref: embedding.vector_ref,
      vector_encoding: embedding.vector_encoding,
      vector_checksum: embedding.vector_checksum,
      embedding_generation: embedding.embedding_generation,
    });
  }

  return rows;
}

export function serializeVectorExportJsonl(rows: VectorExportJsonlRow[]): string {
  return rows.map((row) => stableJson(row)).join("\n") + (rows.length > 0 ? "\n" : "");
}

export function buildVectorExportJsonl(input: BuildVectorExportJsonlRowsInput): BuildVectorExportJsonlResult {
  const rows = buildVectorExportJsonlRows(input);
  return {
    rows,
    jsonl: serializeVectorExportJsonl(rows),
  };
}
