import assert from "node:assert/strict";
import test from "node:test";

import { validateCoreRecord, validateRetrievalContract, validateSymbolAnchor, validateVectorArtifact } from "../validation.js";
import { buildSymbolicRetrievalFixture } from "./symbolic-retrieval-fixtures.js";

test("symbolic retrieval fixture proves navigation, vector metadata, and editorial suppression contracts", () => {
  const fixture = buildSymbolicRetrievalFixture();

  const coreRecords = [
    fixture.source_record,
    fixture.world_claim,
    fixture.wiki_page,
    fixture.wiki_claim,
    fixture.canonical_record,
  ];

  for (const record of coreRecords) {
    assert.deepEqual(validateCoreRecord(record), [], `${record.id} should be a valid core record`);
  }

  assert.deepEqual(validateSymbolAnchor(fixture.symbol_anchor), []);
  for (const artifact of fixture.vector_artifacts) {
    assert.deepEqual(validateVectorArtifact(artifact), [], `${artifact.id} should be a valid vector artifact`);
  }
  assert.deepEqual(validateRetrievalContract(fixture.recipe), []);
  assert.deepEqual(validateRetrievalContract(fixture.retrieval_result), []);

  assert.equal(fixture.symbol_anchor.authority, "navigation_only");
  assert.deepEqual(
    fixture.symbol_anchor.target_refs,
    [
      fixture.source_record.id,
      fixture.world_claim.id,
      fixture.wiki_claim.id,
      fixture.canonical_record.id,
    ],
  );

  assert.deepEqual(
    fixture.chunks.map((chunk) => chunk.source_layer),
    ["raw", "world", "wiki", "canon"],
  );
  assert.ok(fixture.chunks.every((chunk) => chunk.upstream_refs.includes(chunk.source_ref)));
  assert.ok(fixture.embeddings.every((embedding) => fixture.embedding_vectors[embedding.id]?.length === embedding.dimensions));
  assert.equal(fixture.index_manifest.index_kind, "exact");

  const suppressedWiki = fixture.retrieval_result.suppressed_candidates.find((candidate) => candidate.layer === "wiki");
  assert.equal(suppressedWiki?.authority, "editorial");
  assert.equal(suppressedWiki?.can_support_proposal, false);
  assert.deepEqual(suppressedWiki?.suppression_reasons, ["unsupported_wiki_claim"]);

  assert.ok(
    fixture.retrieval_result.included_candidates.some(
      (candidate) => candidate.layer === "canon" && candidate.authority === "canon" && candidate.can_support_proposal,
    ),
  );
});
