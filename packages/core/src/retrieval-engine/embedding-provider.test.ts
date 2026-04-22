import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateVectorArtifact } from "../validation.js";
import { createDeterministicFixtureEmbeddingProvider } from "./embedding-provider.js";

test("deterministic fixture embedding provider emits stable embeddings and batch metadata", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const chunk_texts = Object.fromEntries(
    fixture.chunks.map((chunk) => [chunk.id, `${chunk.source_layer}:${chunk.source_ref}:${chunk.chunk_hash}`]),
  );
  const provider = createDeterministicFixtureEmbeddingProvider();
  const first = provider.embed({
    now: "2026-04-21T00:00:00.000Z",
    chunks: fixture.chunks,
    chunk_texts,
    embedding_model: fixture.embedding_model,
    embedding_generation: "embedding_gen_provider_001",
    batch_id: "embedding_batch_provider_001",
  });
  const second = provider.embed({
    now: "2026-04-21T00:00:00.000Z",
    chunks: fixture.chunks,
    chunk_texts,
    embedding_model: fixture.embedding_model,
    embedding_generation: "embedding_gen_provider_001",
    batch_id: "embedding_batch_provider_001",
  });

  assert.deepEqual(first, second);
  assert.equal(first.embeddings.length, fixture.chunks.length);
  assert.deepEqual(first.batch_run.chunk_refs, fixture.chunks.map((chunk) => chunk.id));
  assert.deepEqual(first.batch_run.embedding_refs, first.embeddings.map((embedding) => embedding.id));
  assert.ok(Object.values(first.embedding_vectors).every((vector) => vector.length === fixture.embedding_model.dimensions));
  assert.deepEqual(
    provider.embedQuery({
      query_text: "answer style",
      embedding_model: fixture.embedding_model,
    }),
    provider.embedQuery({
      query_text: "answer style",
      embedding_model: fixture.embedding_model,
    }),
  );
  assert.deepEqual(validateVectorArtifact(first.batch_run), []);
  for (const embedding of first.embeddings) {
    assert.deepEqual(validateVectorArtifact(embedding), []);
  }
});

test("deterministic fixture embedding provider rejects missing chunk text and provider drift", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const provider = createDeterministicFixtureEmbeddingProvider();

  assert.throws(
    () =>
      provider.embed({
        now: "2026-04-21T00:00:00.000Z",
        chunks: fixture.chunks,
        chunk_texts: {},
        embedding_model: fixture.embedding_model,
        embedding_generation: "embedding_gen_provider_001",
        batch_id: "embedding_batch_provider_001",
      }),
    /Missing chunk text/,
  );
  assert.throws(
    () =>
      provider.embed({
        now: "2026-04-21T00:00:00.000Z",
        chunks: fixture.chunks,
        chunk_texts: Object.fromEntries(fixture.chunks.map((chunk) => [chunk.id, chunk.chunk_hash])),
        embedding_model: {
          ...fixture.embedding_model,
          provider_id: "other_provider",
        },
        embedding_generation: "embedding_gen_provider_001",
        batch_id: "embedding_batch_provider_001",
      }),
    /provider mismatch/,
  );
});
