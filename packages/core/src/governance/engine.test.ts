import assert from "node:assert/strict";
import test from "node:test";

import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import type { CanonicalMemoryObject, Proposal } from "../types.js";
import { evaluateCanonicalProposal } from "./engine.js";

test("governance target matching requires full canonical reference identity", () => {
  const fixture = buildSymbolicRetrievalFixture();
  const sameIdWrongKind = {
    ...fixture.canonical_record,
    kind: "belief",
  } as CanonicalMemoryObject;
  const proposal: Proposal = {
    id: "prop_governance_full_ref_001",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: "2026-04-22T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "test",
      source_ref: "src_governance_full_ref_001",
    },
    operation: "revise",
    candidate_kind: "preference",
    target_layer: "canon",
    target_ref: {
      id: fixture.canonical_record.id,
      kind: "preference",
      layer: "canon",
    },
    candidate_payload: {
      ...fixture.canonical_record,
      statement: "Updated preference statement.",
    },
    reason: "Verify full reference matching.",
    evidence_refs: ["src_governance_full_ref_001"],
    governance_state: "proposed",
  };

  const result = evaluateCanonicalProposal({
    proposal,
    existing_canon_records: [sameIdWrongKind],
    now: "2026-04-22T00:00:00.000Z",
    actor: "system:test",
    ratification_id: "rat_governance_full_ref_001",
    diagnostic_id: "diag_governance_full_ref_001",
  });
  const structural = result.gate_results.find((gate) => gate.gate === "structural");

  assert.equal(structural?.passed, false);
  assert.equal(structural?.reason_code, "missing_target_record");
});
