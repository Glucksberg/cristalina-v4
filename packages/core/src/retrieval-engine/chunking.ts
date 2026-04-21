import { createHash } from "node:crypto";

import type { CoreRecord, Layer, VectorChunk } from "../types.js";

export interface DeterministicChunkingInput {
  now: string;
  records: CoreRecord[];
  chunk_policy_version: string;
  corpus_generation: string;
  chunk_generation: string;
  symbol_refs_by_record_ref?: Record<string, string[]>;
}

export interface DeterministicChunkingResult {
  chunks: VectorChunk[];
  chunk_texts: Record<string, string>;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "record";
}

export function normalizeChunkText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0)
    .join("\n");
}

function statementLike(record: CoreRecord): string | undefined {
  if ("statement" in record && typeof record.statement === "string") return record.statement;
  if ("summary" in record && typeof record.summary === "string") return record.summary;
  if ("content" in record && typeof record.content === "string") return record.content;
  if ("title" in record && typeof record.title === "string") return record.title;
  if ("content_ref" in record && typeof record.content_ref === "string") return record.content_ref;
  return undefined;
}

function chunkText(record: CoreRecord): string {
  const semanticSlot = "semantic_slot" in record && typeof record.semantic_slot === "string"
    ? `semantic_slot: ${record.semantic_slot}\n`
    : "";
  const supportRefs = "support_refs" in record && Array.isArray(record.support_refs)
    ? `support_refs: ${record.support_refs.join(", ")}\n`
    : "";
  const sourceRefs = "source_refs" in record && Array.isArray(record.source_refs)
    ? `source_refs: ${record.source_refs.join(", ")}\n`
    : "";
  const body = statementLike(record) ?? record.id;

  return normalizeChunkText([
    `id: ${record.id}`,
    `kind: ${record.kind}`,
    `layer: ${record.layer}`,
    semanticSlot,
    supportRefs,
    sourceRefs,
    body,
  ].join("\n"));
}

function sourceLayer(record: CoreRecord): Layer {
  return record.layer;
}

export function buildDeterministicVectorChunks(input: DeterministicChunkingInput): DeterministicChunkingResult {
  const chunk_texts: Record<string, string> = {};
  const chunks = input.records.map((record) => {
    const id = `vchunk_${record.layer}_${safeId(record.id)}`;
    const text = chunkText(record);
    const chunkHash = sha256(`${input.chunk_policy_version}\n${text}`);
    const sourceHash = sha256(JSON.stringify(record));
    chunk_texts[id] = text;

    const chunk: VectorChunk = {
      id,
      kind: "vector_chunk",
      layer: "derived",
      authoritative_home: record.authoritative_home,
      created_at: input.now,
      visibility_state: record.visibility_state,
      provenance: {
        source_type: "deterministic_chunking",
        source_ref: record.id,
        evidence_refs: [record.id],
        actor_ref: "system:deterministic_chunking",
      },
      source_ref: record.id,
      source_layer: sourceLayer(record),
      chunk_text_ref: {
        path: `derived/vector/chunks/${id}.txt`,
        checksum: sha256(text),
        encoding: "utf8_text",
        generation_id: input.chunk_generation,
        producing_ref: id,
      },
      chunk_hash: chunkHash,
      chunk_policy_version: input.chunk_policy_version,
      symbol_refs: input.symbol_refs_by_record_ref?.[record.id] ?? [],
      semantic_slot: "semantic_slot" in record && typeof record.semantic_slot === "string" ? record.semantic_slot : undefined,
      upstream_refs: [...new Set([record.id, ...(record.upstream_refs ?? [])])],
      corpus_generation: input.corpus_generation,
      chunk_generation: input.chunk_generation,
      normalized_text_hash: chunkHash,
      source_record_hash: sourceHash,
    };

    return chunk;
  });

  return {
    chunks,
    chunk_texts,
  };
}
