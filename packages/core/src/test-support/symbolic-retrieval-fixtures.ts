import { createHash } from "node:crypto";

import type {
  CanonicalMemoryObject,
  EmbeddingModelManifest,
  EmbeddingRecord,
  RetrievalCandidate,
  RetrievalRecipe,
  RetrievalResult,
  SourceRecord,
  SymbolAnchor,
  VectorArtifact,
  VectorChunk,
  VectorCorpus,
  VectorIndexManifest,
  VisibilityState,
  WikiClaim,
  WikiPage,
  WorldClaim,
} from "../types.js";

export interface SymbolicRetrievalFixture {
  source_record: SourceRecord;
  wiki_page: WikiPage;
  wiki_claim: WikiClaim;
  world_claim: WorldClaim;
  canonical_record: CanonicalMemoryObject;
  symbol_anchor: SymbolAnchor;
  recipe: RetrievalRecipe;
  chunks: VectorChunk[];
  corpus: VectorCorpus;
  embedding_model: EmbeddingModelManifest;
  embeddings: EmbeddingRecord[];
  embedding_vectors: Record<string, number[]>;
  index_manifest: VectorIndexManifest;
  vector_artifacts: VectorArtifact[];
  retrieval_result: RetrievalResult;
}

const now = "2026-04-21T00:00:00.000Z";
const visibility_state: VisibilityState = {
  privacy_scope: "project_private",
};

function provenance(source_ref: string, evidence_refs: string[] = []) {
  return {
    source_type: "symbolic_retrieval_fixture",
    source_ref,
    evidence_refs,
    actor_ref: "system:test",
  };
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function textRef(id: string, generation: string) {
  return {
    path: `derived/vector/chunks/${id}.txt`,
    checksum: `sha256:text-${id}`,
    encoding: "utf8_text" as const,
    generation_id: generation,
    producing_ref: id,
  };
}

function vectorRef(id: string, generation: string) {
  return {
    path: `derived/vector/embeddings/${id}.json`,
    checksum: `sha256:vector-${id}`,
    encoding: "json_float32" as const,
    dimensions: 3,
    generation_id: generation,
    producing_ref: id,
  };
}

export function buildSymbolicRetrievalFixture(): SymbolicRetrievalFixture {
  const source_record: SourceRecord = {
    id: "src_symbolic_retrieval_001",
    kind: "source_record",
    layer: "raw",
    authoritative_home: "raw",
    created_at: now,
    visibility_state,
    provenance: provenance("runtime/thread#turn-001"),
    content_ref: "raw/sources/symbolic-retrieval-source-001.json",
  };

  const world_claim: WorldClaim = {
    id: "wcl_symbolic_retrieval_001",
    kind: "preference",
    layer: "world",
    authoritative_home: "world",
    created_at: now,
    visibility_state,
    provenance: provenance(source_record.id, [source_record.id]),
    upstream_refs: [source_record.id],
    statement: "The owner prefers concise answers unless they ask for depth.",
    semantic_slot: "preference.answer_style",
    epistemic_state: "observed",
    temporal_state: {
      temporal_status: "active",
    },
    support_refs: [source_record.id],
  };

  const wiki_page: WikiPage = {
    id: "wpg_symbolic_retrieval_001",
    kind: "wiki_page",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: now,
    updated_at: now,
    visibility_state,
    provenance: provenance(source_record.id, [source_record.id, world_claim.id]),
    upstream_refs: [source_record.id, world_claim.id],
    page_kind: "topic",
    title: "Answer Style Preferences",
    path: "wiki/pages/answer-style-preferences.md",
    source_refs: [source_record.id],
    canonical_refs: ["mem_symbolic_retrieval_001"],
    world_refs: [world_claim.id],
    wiki_claim_refs: ["wclm_symbolic_retrieval_001"],
    staleness_state: "current",
  };

  const wiki_claim: WikiClaim = {
    id: "wclm_symbolic_retrieval_001",
    kind: "wiki_claim",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: now,
    updated_at: now,
    visibility_state,
    provenance: provenance(wiki_page.id, [source_record.id, world_claim.id]),
    upstream_refs: [source_record.id, world_claim.id],
    statement: "Editorially, the owner appears to prefer concise answers by default.",
    page_ref: wiki_page.id,
    claim_status: "editorial",
    source_refs: [source_record.id],
    support_refs: [source_record.id, world_claim.id],
    confidence_score: 0.8,
    support_count: 2,
    staleness_state: "current",
  };

  const canonical_record: CanonicalMemoryObject = {
    id: "mem_symbolic_retrieval_001",
    kind: "preference",
    layer: "canon",
    authoritative_home: "canon",
    created_at: now,
    visibility_state,
    provenance: provenance(world_claim.id, [source_record.id, world_claim.id]),
    upstream_refs: [source_record.id, world_claim.id],
    statement: "The owner prefers concise answers unless they explicitly ask for depth.",
    semantic_slot: "preference.answer_style",
    epistemic_state: "confirmed",
    governance_state: "ratified",
    temporal_state: {
      temporal_status: "active",
    },
  };

  const symbol_anchor: SymbolAnchor = {
    id: "sym:concept/user-interaction-preferences",
    kind: "concept",
    label: "User interaction preferences",
    aliases: ["answer style", "concise answers"],
    target_refs: [source_record.id, world_claim.id, wiki_claim.id, canonical_record.id],
    upstream_refs: [source_record.id, world_claim.id, wiki_claim.id, canonical_record.id],
    authority: "navigation_only",
    lifecycle_state: "active",
    namespace: "concept",
  };

  const chunkGeneration = "chunk_gen_symbolic_retrieval_001";
  const chunkInputs = [
    { id: "vchunk_raw_symbolic_001", source: source_record, layer: "raw" as const, hash: "sha256:raw-normalized" },
    { id: "vchunk_world_symbolic_001", source: world_claim, layer: "world" as const, hash: "sha256:world-normalized" },
    { id: "vchunk_wiki_symbolic_001", source: wiki_claim, layer: "wiki" as const, hash: "sha256:wiki-normalized" },
    { id: "vchunk_canon_symbolic_001", source: canonical_record, layer: "canon" as const, hash: "sha256:canon-normalized" },
  ];
  const chunks: VectorChunk[] = chunkInputs.map((entry) => ({
    id: entry.id,
    kind: "vector_chunk",
    layer: "derived",
    authoritative_home: entry.source.authoritative_home,
    created_at: now,
    visibility_state,
    provenance: provenance(entry.source.id, [entry.source.id]),
    source_ref: entry.source.id,
    source_layer: entry.layer,
    chunk_text_ref: textRef(entry.id, chunkGeneration),
    chunk_hash: entry.hash,
    chunk_policy_version: "symbolic_retrieval_chunk_policy.v1",
    symbol_refs: [symbol_anchor.id],
    semantic_slot: "semantic_slot" in entry.source ? entry.source.semantic_slot : undefined,
    upstream_refs: [entry.source.id],
    corpus_generation: "corpus_gen_symbolic_retrieval_001",
    chunk_generation: chunkGeneration,
    normalized_text_hash: entry.hash,
    source_record_hash: `sha256:source-${entry.source.id}`,
  }));

  const corpus: VectorCorpus = {
    id: "vector_corpus_symbolic_retrieval_001",
    kind: "vector_corpus",
    layer: "derived",
    authoritative_home: "governance",
    created_at: now,
    visibility_state,
    provenance: provenance("symbolic_retrieval_fixture", chunks.map((chunk) => chunk.source_ref)),
    source_refs: chunks.map((chunk) => chunk.source_ref),
    source_layers: ["raw", "world", "wiki", "canon"],
    chunk_policy_version: "symbolic_retrieval_chunk_policy.v1",
    corpus_generation: "corpus_gen_symbolic_retrieval_001",
    chunk_refs: chunks.map((chunk) => chunk.id),
    embedding_model_ref: "embedding_model_symbolic_fixture_001",
  };

  const embedding_model: EmbeddingModelManifest = {
    id: "embedding_model_symbolic_fixture_001",
    kind: "embedding_model_manifest",
    layer: "derived",
    authoritative_home: "governance",
    created_at: now,
    visibility_state,
    provenance: provenance("deterministic_fixture_embedding_provider"),
    provider_id: "deterministic_fixture",
    model_id: "deterministic-symbolic-retrieval-v1",
    dimensions: 3,
    metric: "cosine",
    normalization_mode: "unit_test_fixed_vectors",
    vector_encoding: "json_float32",
    deterministic_fixture_mode: true,
  };

  const embeddingGeneration = "embedding_gen_symbolic_retrieval_001";
  const embedding_vectors: Record<string, number[]> = {
    embed_raw_symbolic_001: [0.9, 0.1, 0.1],
    embed_world_symbolic_001: [0.86, 0.2, 0.1],
    embed_wiki_symbolic_001: [0.88, 0.16, 0.1],
    embed_canon_symbolic_001: [0.95, 0.05, 0.1],
  };
  const embeddings: EmbeddingRecord[] = chunks.map((chunk, index) => {
    const id = Object.keys(embedding_vectors)[index];
    const vector_ref = vectorRef(id, embeddingGeneration);
    return {
      id,
      kind: "embedding_record",
      layer: "derived",
      authoritative_home: chunk.authoritative_home,
      created_at: now,
      visibility_state,
      provenance: provenance(chunk.id, [chunk.id]),
      chunk_ref: chunk.id,
      embedding_model_ref: embedding_model.id,
      dimensions: 3,
      metric: "cosine",
      vector_ref,
      source_text_hash: chunk.chunk_hash,
      embedding_generation: embeddingGeneration,
      vector_encoding: "json_float32",
      vector_checksum: vector_ref.checksum,
    };
  });

  const indexChecksum = sha256(JSON.stringify({
    corpus_ref: corpus.id,
    embedding_refs: embeddings.map((embedding) => embedding.id),
    vector_checksums: embeddings.map((embedding) => embedding.vector_checksum),
  }));
  const index_ref = {
    path: "derived/vector/indexes/symbolic-fixture/exact-index.json",
    checksum: indexChecksum,
    encoding: "json_float32" as const,
    dimensions: 3,
    generation_id: "index_gen_symbolic_retrieval_001",
    producing_ref: "vector_index_symbolic_retrieval_001",
  };
  const index_manifest: VectorIndexManifest = {
    id: "vector_index_symbolic_retrieval_001",
    kind: "vector_index_manifest",
    layer: "derived",
    authoritative_home: "governance",
    created_at: now,
    visibility_state,
    provenance: provenance(corpus.id, [corpus.id, ...embeddings.map((embedding) => embedding.id)]),
    index_ref,
    corpus_ref: corpus.id,
    embedding_model_ref: embedding_model.id,
    dimensions: 3,
    metric: "cosine",
    index_kind: "exact",
    chunk_policy_version: corpus.chunk_policy_version,
    source_refs: corpus.source_refs,
    corpus_generation: corpus.corpus_generation,
    embedding_generation: embeddingGeneration,
    index_generation: "index_gen_symbolic_retrieval_001",
    vector_encoding: "json_float32",
    index_checksum: indexChecksum,
  };

  const recipe: RetrievalRecipe = {
    id: "retrieval_recipe_symbolic_fixture_001",
    name: "Symbolic retrieval fixture recipe",
    layer_scope: ["raw", "world", "wiki", "canon"],
    allow_editorial_wiki: true,
    require_canon_for_truth_claims: true,
    vector_top_k: 4,
    final_top_k: 3,
    include_suppression_trace: true,
    read_policy_version: "projection_read_policy.v1",
    external_candidate_policy: "forbid",
    can_support_proposal_from_layers: ["raw", "world", "canon"],
  };

  const included_candidates: RetrievalCandidate[] = [
    {
      id: "candidate_canon_symbolic_001",
      ref: { id: canonical_record.id, kind: canonical_record.kind, layer: canonical_record.layer },
      layer: "canon",
      authority: "canon",
      symbol_refs: [symbol_anchor.id],
      semantic_slot: canonical_record.semantic_slot,
      vector_score: 0.95,
      symbolic_score: 1,
      authority_score: 1,
      provenance_score: 1,
      final_score: 3.95,
      why_retrieved: ["matched symbol anchor", "matched deterministic vector", "ratified canonical record"],
      can_support_proposal: true,
      eligible_upstream_refs: [canonical_record.id, ...canonical_record.upstream_refs ?? []],
    },
    {
      id: "candidate_raw_symbolic_001",
      ref: { id: source_record.id, kind: source_record.kind, layer: source_record.layer },
      layer: "raw",
      authority: "evidence",
      symbol_refs: [symbol_anchor.id],
      vector_score: 0.9,
      symbolic_score: 1,
      authority_score: 0.4,
      provenance_score: 1,
      final_score: 3.3,
      why_retrieved: ["matched symbol anchor", "matched deterministic vector", "raw evidence is eligible upstream support"],
      can_support_proposal: true,
      eligible_upstream_refs: [source_record.id],
    },
  ];

  const suppressed_candidates: RetrievalCandidate[] = [
    {
      id: "candidate_wiki_symbolic_001",
      ref: { id: wiki_claim.id, kind: wiki_claim.kind, layer: wiki_claim.layer },
      layer: "wiki",
      authority: "editorial",
      symbol_refs: [symbol_anchor.id],
      vector_score: 0.88,
      symbolic_score: 1,
      authority_score: 0.1,
      provenance_score: 0.7,
      final_score: 2.68,
      why_retrieved: ["matched symbol anchor", "matched deterministic vector", "wiki claim is editorial synthesis"],
      suppression_reasons: ["unsupported_wiki_claim"],
      can_support_proposal: false,
      eligible_upstream_refs: wiki_claim.support_refs,
    },
  ];

  return {
    source_record,
    wiki_page,
    wiki_claim,
    world_claim,
    canonical_record,
    symbol_anchor,
    recipe,
    chunks,
    corpus,
    embedding_model,
    embeddings,
    embedding_vectors,
    index_manifest,
    vector_artifacts: [corpus, embedding_model, ...chunks, ...embeddings, index_manifest],
    retrieval_result: {
      query_ref: "retrieval_query_symbolic_fixture_001",
      recipe_ref: recipe.id,
      read_policy_version: recipe.read_policy_version,
      included_candidates,
      suppressed_candidates,
      trace_ref: "retrieval_trace_symbolic_fixture_001",
    },
  };
}
