import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateVectorArtifact } from "../validation.js";
import { validateVectorArtifacts } from "./maintenance.js";

test("vector maintenance validates consistent fixture vector artifacts", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const run = validateVectorArtifacts({
    id: "vector_maintenance_run_symbolic_001",
    now: "2026-04-21T00:00:00.000Z",
    corpus: fixture.corpus,
    chunks: fixture.chunks,
    embedding_model: fixture.embedding_model,
    embeddings: fixture.embeddings,
    index_manifest: fixture.index_manifest,
  });

  assert.equal(run.status, "passed");
  assert.deepEqual(run.issue_codes, []);
  assert.equal(run.corpus_ref, fixture.corpus.id);
  assert.equal(run.index_manifest_ref, fixture.index_manifest.id);
  assert.ok(run.checked_artifact_refs.includes(fixture.corpus.id));
  assert.ok(run.checked_artifact_refs.includes(fixture.index_manifest.id));
  assert.deepEqual(validateVectorArtifact(run), []);
});

test("vector maintenance reports orphan embeddings and generation drift", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const driftedEmbedding = {
    ...fixture.embeddings[0],
    chunk_ref: "missing_chunk_001",
    source_text_hash: "sha256:drifted",
    embedding_generation: "embedding_gen_drifted_001",
  };
  const checksumDriftEmbedding = {
    ...fixture.embeddings[1],
    vector_checksum: "sha256:wrong",
  };
  const run = validateVectorArtifacts({
    id: "vector_maintenance_run_symbolic_drift_001",
    now: "2026-04-21T00:00:00.000Z",
    corpus: {
      ...fixture.corpus,
      chunk_refs: fixture.corpus.chunk_refs.slice(1),
    },
    chunks: fixture.chunks,
    embedding_model: fixture.embedding_model,
    embeddings: [driftedEmbedding, checksumDriftEmbedding, ...fixture.embeddings.slice(2)],
    index_manifest: fixture.index_manifest,
  });

  assert.equal(run.status, "completed_with_issues");
  assert.ok(run.issue_codes.includes("corpus_chunk_membership_mismatch"));
  assert.ok(run.issue_codes.includes("orphan_embedding"));
  assert.ok(run.issue_codes.includes("embedding_index_generation_mismatch"));
  assert.ok(run.issue_codes.includes("embedding_vector_checksum_mismatch"));
  assert.deepEqual(validateVectorArtifact(run), []);
});
