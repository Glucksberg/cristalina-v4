import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateVectorArtifact } from "../validation.js";
import { buildDeterministicVectorChunks, normalizeChunkText } from "./chunking.js";

test("normalizeChunkText preserves meaningful line boundaries while normalizing whitespace", () => {
  assert.equal(
    normalizeChunkText("  First   line\r\n\r\nSecond\t\tline  "),
    "First line\nSecond line",
  );
});

test("deterministic chunking creates stable layer-aware chunks from raw, world, wiki, and canon records", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const records = [
    fixture.source_record,
    fixture.world_claim,
    fixture.wiki_claim,
    fixture.canonical_record,
  ];

  const first = buildDeterministicVectorChunks({
    now: "2026-04-21T00:00:00.000Z",
    records,
    chunk_policy_version: "deterministic_chunk_policy.v1",
    corpus_generation: "corpus_gen_001",
    chunk_generation: "chunk_gen_001",
    symbol_refs_by_record_ref: Object.fromEntries(records.map((record) => [record.id, [fixture.symbol_anchor.id]])),
  });
  const second = buildDeterministicVectorChunks({
    now: "2026-04-21T00:00:00.000Z",
    records,
    chunk_policy_version: "deterministic_chunk_policy.v1",
    corpus_generation: "corpus_gen_001",
    chunk_generation: "chunk_gen_001",
    symbol_refs_by_record_ref: Object.fromEntries(records.map((record) => [record.id, [fixture.symbol_anchor.id]])),
  });

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.chunks.map((chunk) => chunk.source_layer),
    ["raw", "world", "wiki", "canon"],
  );
  assert.ok(first.chunks.every((chunk) => chunk.symbol_refs.includes(fixture.symbol_anchor.id)));
  assert.ok(first.chunks.every((chunk) => chunk.upstream_refs.includes(chunk.source_ref)));
  assert.ok(first.chunk_texts.vchunk_world_wcl_symbolic_retrieval_001.includes("semantic_slot: preference.answer_style"));
  assert.ok(first.chunk_texts.vchunk_wiki_wclm_symbolic_retrieval_001.includes("source_refs: src_symbolic_retrieval_001"));

  for (const chunk of first.chunks) {
    assert.deepEqual(validateVectorArtifact(chunk), [], `${chunk.id} should be a valid vector chunk`);
  }
});
