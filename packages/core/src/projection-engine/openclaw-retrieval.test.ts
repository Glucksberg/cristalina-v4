import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import { validateCoreRecord } from "../validation.js";
import {
  compileOpenClawBootstrapProjection,
  RUNTIME_BOOTSTRAP_PROJECTION_COMPILER_VERSION,
} from "./openclaw.js";

test("OpenClaw projection exposes included and suppressed retrieval candidates as trace metadata", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const projection = compileOpenClawBootstrapProjection({
    now: "2026-04-21T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "project_private",
    },
    projection_path: "derived/openclaw/pmf_retrieval_projection_001/bootstrap-memory.md",
    canonical_records: [fixture.canonical_record],
    world_claims: [fixture.world_claim],
    wiki_pages: [fixture.wiki_page],
    wiki_claims: [fixture.wiki_claim],
    retrieval_results: [fixture.retrieval_result],
    ids: {
      canon_artifact: "part_openclaw_canon_retrieval_001",
      world_artifact: "part_openclaw_world_retrieval_001",
      wiki_artifact: "part_openclaw_wiki_retrieval_001",
      manifest: "pmf_retrieval_projection_001",
    },
  });

  assert.match(projection.markdown, /## Retrieval/);
  assert.equal(projection.manifest.compiler_version, RUNTIME_BOOTSTRAP_PROJECTION_COMPILER_VERSION.openclaw);
  assert.match(projection.markdown, /\[included:candidate_canon_symbolic_001\] canon\/canon/);
  assert.match(projection.markdown, /\[suppressed:candidate_wiki_symbolic_001\] wiki\/editorial/);
  assert.deepEqual(projection.manifest.retrieval_trace_refs, ["retrieval_trace_symbolic_fixture_001"]);
  assert.ok(projection.manifest.included_retrieval_candidate_refs?.includes("candidate_canon_symbolic_001"));
  assert.ok(projection.manifest.suppressed_retrieval_candidate_refs?.includes("candidate_wiki_symbolic_001"));
  assert.deepEqual(projection.manifest.retrieval_traces, [
    {
      trace_ref: "retrieval_trace_symbolic_fixture_001",
      query_ref: "retrieval_query_symbolic_fixture_001",
      recipe_ref: fixture.recipe.id,
      included_candidate_refs: ["candidate_canon_symbolic_001", "candidate_raw_symbolic_001"],
      suppressed_candidate_refs: ["candidate_wiki_symbolic_001"],
      suppression_reasons: ["unsupported_wiki_claim"],
    },
  ]);
  assert.ok(projection.manifest.upstream_refs.includes(fixture.canonical_record.id));
  assert.ok(projection.manifest.upstream_refs.includes(fixture.wiki_claim.id));
  assert.deepEqual(validateCoreRecord(projection.manifest), []);

  const driftIssues = validateCoreRecord({
    ...projection.manifest,
    included_retrieval_candidate_refs: ["candidate_canon_symbolic_001"],
  });
  assert.ok(
    driftIssues.some(
      (issue) =>
        issue.path === "included_retrieval_candidate_refs" &&
        issue.message.includes("candidate_raw_symbolic_001"),
    ),
  );
});
