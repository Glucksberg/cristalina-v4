import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConversationPreferenceIntake,
  executeCanonicalProposalWorkflow,
  executeOpenClawBootstrapWorkflow,
  reconcileConversationPreferenceSupersede,
} from "./pipeline.js";
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

test("conversation preference intake preserves the raw source_ref in provenance", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers unless they explicitly ask for depth.",
    source_record: {
      id: "src_test_003",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "shareable",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session-test#turn-003",
      },
      content_ref: "raw/sources/turn-003.json",
    },
    ids: {
      observation: "obs_test_003",
      world_claim: "wcl_test_003",
      wiki_page: "wpg_test_003",
      wiki_claim: "wclm_test_003",
      proposal: "prop_test_003",
      disposition: "disp_test_003",
    },
  });

  assert.equal(intake.observation.provenance.source_ref, "runtime/session-test#turn-003");
  assert.equal(intake.world_claim.provenance.source_ref, "runtime/session-test#turn-003");
  assert.equal(intake.proposal.provenance.source_ref, "runtime/session-test#turn-003");
});

test("openclaw projection preserves visibility and renders reconciled statuses", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const visibility_state = {
    privacy_scope: "shareable",
  } as const;
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers unless they explicitly ask for depth.",
    source_record: {
      id: "src_test_004",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state,
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session-test#turn-004",
      },
      content_ref: "raw/sources/turn-004.json",
    },
    ids: {
      observation: "obs_test_004",
      world_claim: "wcl_test_004",
      wiki_page: "wpg_test_004",
      wiki_claim: "wclm_test_004",
      proposal: "prop_test_004",
      disposition: "disp_test_004",
    },
  });

  const reconciled = reconcileConversationPreferenceSupersede({
    now,
    world_claim: intake.world_claim,
    wiki_page: intake.wiki_page,
    wiki_claim: intake.wiki_claim,
    superseded_canonical_ref: "mem_test_004",
    proposal_ref: "prop_test_004_supersede",
    ratification_ref: "rat_test_004_supersede",
  });

  const projection = executeOpenClawBootstrapWorkflow({
    now,
    visibility_state,
    canonical_records: [],
    world_claims: [reconciled.world_claim],
    wiki_pages: [reconciled.wiki_page],
    wiki_claims: [reconciled.wiki_claim],
    ids: {
      canon_artifact: "part_openclaw_canon_test_004",
      world_artifact: "part_openclaw_world_test_004",
      wiki_artifact: "part_openclaw_wiki_test_004",
      manifest: "pmf_openclaw_test_004",
    },
  });

  assert.equal(projection.manifest.visibility_state.privacy_scope, "shareable");
  assert.match(projection.markdown, /\(disputed; historical\)/);
  assert.match(projection.markdown, /\(editorial\)/);
});
