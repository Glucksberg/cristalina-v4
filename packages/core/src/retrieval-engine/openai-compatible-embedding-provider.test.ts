import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateVectorArtifact } from "../validation.js";
import { createOpenAiCompatibleEmbeddingProvider, type OpenAiCompatibleFetch } from "./openai-compatible-embedding-provider.js";

test("OpenAI-compatible embedding provider converts endpoint responses into embedding records", async () => {
  const fixture = buildSymbolicRetrievalFixture();
  const embedding_model = {
    ...fixture.embedding_model,
    provider_id: "openai_compatible_fixture",
    model_id: "text-embedding-fixture",
    deterministic_fixture_mode: false,
  };
  const requests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
  const fetch: OpenAiCompatibleFetch = async (url, init) => {
    requests.push({
      url,
      body: init.body,
      headers: init.headers,
    });
    const input = JSON.parse(init.body) as { input: string[] };
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          data: input.input.map((_, index) => ({
            index,
            embedding: Array.from({ length: embedding_model.dimensions }, (_entry, dimension) => Number(`0.${index}${dimension}`)),
          })),
        };
      },
    };
  };
  const provider = createOpenAiCompatibleEmbeddingProvider({
    provider_id: "openai_compatible_fixture",
    endpoint: "https://embedding.example/v1/embeddings",
    api_key: "test-key",
    fetch,
  });
  const chunk_texts = Object.fromEntries(fixture.chunks.map((chunk) => [chunk.id, chunk.chunk_hash]));

  const result = await provider.embed({
    now: "2026-04-22T00:00:00.000Z",
    chunks: fixture.chunks.slice(0, 2),
    chunk_texts,
    embedding_model,
    embedding_generation: "embedding_gen_openai_compatible_001",
    batch_id: "embedding_batch_openai_compatible_001",
  });

  assert.equal(requests[0]?.url, "https://embedding.example/v1/embeddings");
  assert.equal(requests[0]?.headers.authorization, "Bearer test-key");
  assert.equal(JSON.parse(requests[0]?.body ?? "{}").model, "text-embedding-fixture");
  assert.equal(result.embeddings.length, 2);
  assert.equal(result.batch_run.provenance.source_type, "openai_compatible_embedding_provider");
  assert.equal(result.embeddings[0]?.dimensions, embedding_model.dimensions);
  assert.deepEqual(validateVectorArtifact(result.batch_run), []);
  for (const embedding of result.embeddings) {
    assert.deepEqual(validateVectorArtifact(embedding), []);
  }

  const queryVector = await provider.embedQuery({
    query_text: "answer style",
    embedding_model,
  });
  assert.equal(queryVector.length, embedding_model.dimensions);
});

test("OpenAI-compatible embedding provider fails closed on model and response drift", async () => {
  const fixture = buildSymbolicRetrievalFixture();
  const provider = createOpenAiCompatibleEmbeddingProvider({
    provider_id: "openai_compatible_fixture",
    endpoint: "https://embedding.example/v1/embeddings",
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          data: [
            {
              index: 0,
              embedding: [0.1],
            },
          ],
        };
      },
    }),
  });

  await assert.rejects(
    () =>
      provider.embedQuery({
        query_text: "answer style",
        embedding_model: fixture.embedding_model,
      }),
    /provider mismatch/,
  );

  await assert.rejects(
    () =>
      provider.embedQuery({
        query_text: "answer style",
        embedding_model: {
          ...fixture.embedding_model,
          provider_id: "openai_compatible_fixture",
          deterministic_fixture_mode: false,
        },
      }),
    /dimension mismatch/,
  );
});
