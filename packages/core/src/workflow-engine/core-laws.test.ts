import assert from "node:assert/strict";
import test from "node:test";

import { executeCanonicalProposalWorkflow } from "./pipeline.js";
import { isLegalLayerTransition } from "../transitions.js";
import { validateCoreRecord } from "../validation.js";

test("canon records reject pre-ratification governance states", () => {
  const issues = validateCoreRecord({
    id: "mem_test_draft",
    kind: "preference",
    layer: "canon",
    authoritative_home: "canon",
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: "src_test_001",
    },
    statement: "Draft canon records must be rejected.",
    epistemic_state: "confirmed",
    governance_state: "draft",
    temporal_state: {
      temporal_status: "active",
      valid_from: "2026-04-12T00:00:00.000Z",
      valid_to: null,
    },
    supersedes_ref: null,
    superseded_by_ref: null,
  });

  assert.ok(issues.some((issue) => issue.path === "governance_state"));
});

test("runtime cannot transition directly into canon", () => {
  assert.equal(isLegalLayerTransition("runtime", "canon"), false);
});

test("canonical workflow rejects mismatched target_ref and existing_record", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const targetRecord = {
    id: "mem_target_001",
    kind: "preference",
    layer: "canon",
    authoritative_home: "canon",
    created_at: now,
    updated_at: now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: "src_target_001",
    },
    statement: "Target record",
    epistemic_state: "confirmed",
    governance_state: "ratified",
    temporal_state: {
      temporal_status: "active",
      valid_from: now,
      valid_to: null,
    },
    supersedes_ref: null,
    superseded_by_ref: null,
  } as const;
  const wrongExistingRecord = {
    ...targetRecord,
    id: "mem_other_001",
    provenance: {
      source_type: "conversation",
      source_ref: "src_other_001",
    },
    statement: "Wrong record",
  };

  assert.throws(
    () =>
      executeCanonicalProposalWorkflow({
        proposal: {
          id: "prop_test_002",
          kind: "proposal",
          layer: "governance",
          authoritative_home: "governance",
          created_at: now,
          updated_at: now,
          visibility_state: {
            privacy_scope: "owner_private",
          },
          provenance: {
            source_type: "conversation",
            source_ref: "src_prop_002",
            evidence_refs: ["obs_test_002"],
          },
          operation: "supersede",
          candidate_kind: "preference",
          target_layer: "canon",
          target_ref: {
            id: targetRecord.id,
            kind: targetRecord.kind,
            layer: targetRecord.layer,
          },
          candidate_payload: {
            kind: "preference",
            reason: "Supersede the target.",
          },
          reason: "Supersede target",
          evidence_refs: ["obs_test_002"],
          governance_state: "proposed",
        },
        existing_canon_records: [targetRecord],
        existing_record: wrongExistingRecord,
        now,
        actor: "system:test",
        ratification_id: "rat_test_002",
        diagnostic_id: "diag_test_002",
        canonical_id: "unused_test_002",
      }),
    /does not match target_ref/,
  );
});
