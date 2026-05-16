import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeCoreRecord } from "./store/io.js";
import { listOwnerDecisionRequests } from "./owner-decisions.js";
import type { CanonicalMemoryObject, CurationPacket, Diagnostic, Proposal } from "./types.js";

const now = "2026-05-16T12:00:00.000Z";

function provenance(source_ref: string) {
  return {
    source_type: "test_fixture",
    source_ref,
    evidence_refs: [source_ref],
  };
}

test("owner decision listing hydrates deferred canonical proposal metadata without applying it", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-owner-decisions-"));
  const proposal: Proposal = {
    id: "prop_owner_decision_001",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("memory-maturation/hermes/run_001/claim_001"),
    operation: "create",
    candidate_kind: "belief",
    target_layer: "canon",
    target_ref: null,
    candidate_payload: {
      kind: "belief",
      statement: "Memory lifecycle is a compliance surface.",
      semantic_slot: "agent_memory.governance.lifecycle_as_compliance_surface",
      epistemic_state: "confirmed",
      temporal_state: { temporal_status: "active", valid_from: now, valid_to: null },
      support_refs: ["obs_owner_decision_001"],
    },
    reason: "Owner authority is required for this governance principle.",
    evidence_refs: ["src_owner_decision_001", "obs_owner_decision_001"],
    subject_authority_role: "owner",
    promotion_requirement: "owner_ratification_required",
    governance_state: "proposed",
  };
  const diagnostic: Diagnostic = {
    id: "diag_owner_decision_001",
    kind: "diagnostic",
    layer: "audits",
    authoritative_home: "governance",
    created_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("memory-maturation/hermes/run_001/claim_001"),
    code: "proposal_deferred",
    severity: "info",
    message: "Proposal prop_owner_decision_001 requires further authority before promotion: owner_ratification_required",
    related_refs: ["prop_owner_decision_001", "src_owner_decision_001"],
  };
  const packet: CurationPacket = {
    id: "cur_owner_decision_001",
    kind: "curation_packet",
    layer: "governance",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("memory-maturation/hermes/run_001/claim_001"),
    proposal_refs: ["prop_owner_decision_001"],
    question_count: 1,
    review_kind: "owner_ratification",
    diagnostic_ref: "diag_owner_decision_001",
    canonical_target_ref: { id: "mem_owner_decision_001", kind: "belief", layer: "canon" },
    status: "pending",
  };
  const existingCanon: CanonicalMemoryObject = {
    id: "mem_existing_lifecycle_001",
    kind: "belief",
    layer: "canon",
    authoritative_home: "canon",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("tests/existing-canon"),
    statement: "Memory lifecycle needs governance.",
    semantic_slot: "agent_memory.governance.lifecycle_as_compliance_surface",
    epistemic_state: "confirmed",
    temporal_state: { temporal_status: "active" },
    governance_state: "ratified",
  };

  await Promise.all([
    writeCoreRecord(rootDir, proposal),
    writeCoreRecord(rootDir, diagnostic),
    writeCoreRecord(rootDir, packet),
    writeCoreRecord(rootDir, existingCanon),
  ]);

  const result = await listOwnerDecisionRequests({ rootDir });
  assert.equal(result.owner_decisions.length, 1);
  assert.equal(result.owner_decisions[0]!.proposal_ref, "prop_owner_decision_001");
  assert.equal(result.owner_decisions[0]!.claim_ref, "memory-maturation/hermes/run_001/claim_001");
  assert.equal(result.owner_decisions[0]!.semantic_slot, "agent_memory.governance.lifecycle_as_compliance_surface");
  assert.equal(result.owner_decisions[0]!.epistemic_state, "confirmed");
  assert.equal(result.owner_decisions[0]!.temporal_status, "active");
  assert.equal(result.owner_decisions[0]!.diagnostic_ref, "diag_owner_decision_001");
  assert.equal(result.owner_decisions[0]!.curation_ref, "cur_owner_decision_001");
  assert.deepEqual(result.owner_decisions[0]!.existing_canon_refs, ["mem_existing_lifecycle_001"]);
  assert.match(result.owner_decisions[0]!.question, /subsumir/);
});
