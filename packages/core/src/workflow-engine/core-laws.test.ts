import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_PROJECTION_READ_POLICY_VERSION } from "../adapter-sdk/projection.js";
import { applyApprovedCanonicalProposal } from "../canon/engine.js";
import { RUNTIME_BOOTSTRAP_PROJECTION_COMPILER_VERSION } from "../projection-engine/openclaw.js";
import type { CanonicalMemoryObject } from "../types.js";
import {
  acceptContradictionResolution,
  applyAcceptedContradictionResolution,
  applyContradictionResolution,
  buildOpenClawPreferenceFeedbackIntake,
  buildConversationPreferenceDispositionRecord,
  buildConversationPreferenceIntake,
  buildStructuredPreferenceSignalIntake,
  detectWorldClaimContradiction,
  executeCanonicalProposalWorkflow,
  executeOpenClawBootstrapWorkflow,
  findConflictingWorldClaim,
  proposeContradictionResolution,
  reconcileConversationPreferenceSupersede,
} from "./pipeline.js";
import { isConditionalLayerTransition, isLegalLayerTransition } from "../transitions.js";
import { validateCoreRecord } from "../validation.js";

function buildIds(suffix: string) {
  return {
    observation: `obs_${suffix}`,
    episode: `ep_${suffix}`,
    subject_entity: `ent_subject_${suffix}`,
    preference_entity: `ent_preference_${suffix}`,
    preference_relation: `rel_preference_${suffix}`,
    world_claim: `wcl_${suffix}`,
    wiki_page: `wpg_${suffix}`,
    wiki_claim: `wclm_${suffix}`,
    proposal: `prop_${suffix}`,
    disposition: `disp_${suffix}`,
  };
}

function buildIdentityContext(suffix: string) {
  return {
    runtime: "openclaw" as const,
    ids: {
      agent_identity: `actor_agent_${suffix}`,
      owner_identity: `actor_owner_${suffix}`,
      runtime_instance: `runtime_${suffix}`,
      runtime_session: `session_${suffix}`,
      conversation_thread: `thread_${suffix}`,
    },
    agent_label: "Cristalina Test Agent",
    owner_label: "Test Owner",
    session_objective: "Test governed preference intake",
    session_summary: "Runtime session for tests",
    message_refs: [`msg_${suffix}_001`],
    thread_summary: "Single-thread test branch",
  };
}

function ownerPrincipal(suffix: string) {
  return {
    kind: "owner" as const,
    actor_ref: `actor_owner_${suffix}`,
  };
}

function participantPrincipal(actor_ref: string) {
  return {
    kind: "participant" as const,
    actor_ref,
  };
}

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
    semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
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

test("conditionally legal transitions still count as legal transitions", () => {
  assert.equal(isConditionalLayerTransition("world", "canon"), true);
  assert.equal(isLegalLayerTransition("world", "canon"), true);
});

test("proposal validation rejects operations outside the executable baseline", () => {
  const issues = validateCoreRecord({
    id: "prop_test_future_op",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: "src_test_future_op",
      evidence_refs: ["obs_test_future_op"],
    },
    operation: "confirm",
    candidate_kind: "preference",
    target_layer: "canon",
    target_ref: null,
    candidate_payload: {
      kind: "preference",
      statement: "Future operations must stay out of the baseline contract.",
      semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
    },
    reason: "Attempt to use a non-baseline operation.",
    evidence_refs: ["obs_test_future_op"],
    governance_state: "proposed",
  });

  assert.ok(issues.some((issue) => issue.path === "operation"));
});

test("conversation preference disposition can route to non-canonical outcomes", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const disposition = buildConversationPreferenceDispositionRecord({
    now,
    source_record: {
      id: "src_test_disp_001",
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
        source_ref: "runtime/session-test#turn-disp-001",
      },
      content_ref: "raw/sources/turn-disp-001.json",
    },
    observation_id: "obs_test_disp_001",
    disposition_id: "disp_test_001",
    strategy: {
      runtime_only: true,
      queued_review: true,
      diagnostic_refs: ["diag_test_disp_001"],
      world_update: false,
      wiki_update: false,
      proposal_for_canon: false,
    },
  });

  assert.deepEqual(disposition.outcomes, ["runtime_only", "queued_review", "diagnostic_only"]);
  assert.deepEqual(disposition.target_layers, ["runtime", "governance", "audits"]);
  assert.equal(disposition.proposal_refs, undefined);
  assert.deepEqual(disposition.diagnostic_refs, ["diag_test_disp_001"]);
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
    semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
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
            semantic_slot: targetRecord.semantic_slot,
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

test("proposal validation validates target_ref as a full reference object", () => {
  const issues = validateCoreRecord({
    id: "prop_test_invalid_target_ref",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: "src_invalid_target_ref",
      evidence_refs: ["obs_invalid_target_ref"],
    },
    operation: "revise",
    candidate_kind: "preference",
    target_layer: "canon",
    target_ref: {
      id: "",
      kind: 7,
      layer: "canon",
    },
    candidate_payload: {
      kind: "preference",
      statement: "Revise target",
      semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
    },
    reason: "Invalid target_ref should fail validation.",
    evidence_refs: ["obs_invalid_target_ref"],
    governance_state: "proposed",
  });

  assert.ok(issues.some((issue) => issue.path === "target_ref.id"));
  assert.ok(issues.some((issue) => issue.path === "target_ref.kind"));
});

test("canonical workflow rejects target_ref kind mismatches even when the id exists", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const targetRecord = {
    id: "mem_target_kind_001",
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
      source_ref: "src_target_kind_001",
    },
    statement: "Target record",
    semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
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

  const workflow = executeCanonicalProposalWorkflow({
    proposal: {
      id: "prop_test_kind_mismatch",
      kind: "proposal",
      layer: "governance",
      authoritative_home: "governance",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "shareable",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "src_prop_kind_mismatch",
        evidence_refs: ["obs_test_kind_mismatch"],
      },
      operation: "supersede",
      candidate_kind: "fact",
      target_layer: "canon",
      target_ref: {
        id: targetRecord.id,
        kind: "fact",
        layer: "world",
      },
      candidate_payload: {
        kind: "fact",
        semantic_slot: targetRecord.semantic_slot,
        reason: "Supersede the target.",
      },
      reason: "Supersede target",
      evidence_refs: ["obs_test_kind_mismatch"],
      governance_state: "proposed",
    },
    existing_canon_records: [targetRecord],
    now,
    actor: "system:test",
    ratification_id: "rat_test_kind_mismatch",
    diagnostic_id: "diag_test_kind_mismatch",
    canonical_id: "unused_test_kind_mismatch",
  });

  assert.equal(workflow.accepted, false);
  assert.equal(workflow.ratification_record.decision, "rejected");
  assert.equal(workflow.updated_records.length, 0);
});

test("canonical workflow rejects create proposals that target an existing record", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const targetRecord = {
    id: "mem_target_create_001",
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
      source_ref: "src_target_create_001",
    },
    statement: "Target record",
    semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
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

  const workflow = executeCanonicalProposalWorkflow({
    proposal: {
      id: "prop_test_create_target_ref",
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
        source_ref: "src_prop_create_target_ref",
        evidence_refs: ["obs_test_create_target_ref"],
      },
      operation: "create",
      candidate_kind: "preference",
      target_layer: "canon",
      target_ref: {
        id: targetRecord.id,
        kind: targetRecord.kind,
        layer: targetRecord.layer,
      },
      candidate_payload: {
        kind: "preference",
        statement: "The user prefers concise answers.",
        semantic_slot: targetRecord.semantic_slot,
      },
      reason: "Create should not target an existing record.",
      evidence_refs: ["obs_test_create_target_ref"],
      governance_state: "proposed",
    },
    existing_canon_records: [targetRecord],
    now,
    actor: "system:test",
    ratification_id: "rat_test_create_target_ref",
    diagnostic_id: "diag_test_create_target_ref",
    canonical_id: "mem_test_create_target_ref",
  });

  assert.equal(workflow.accepted, false);
  assert.equal(workflow.ratification_record.decision, "rejected");
});

test("canonical workflow rejects revise proposals without target_ref", () => {
  const now = "2026-04-12T00:00:00.000Z";

  const workflow = executeCanonicalProposalWorkflow({
    proposal: {
      id: "prop_test_revise_missing_target",
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
        source_ref: "src_prop_revise_missing_target",
        evidence_refs: ["obs_test_revise_missing_target"],
      },
      operation: "revise",
      candidate_kind: "preference",
      target_layer: "canon",
      target_ref: null,
      candidate_payload: {
        kind: "preference",
        statement: "The user prefers concise answers.",
        semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
      },
      reason: "Revise requires a target_ref.",
      evidence_refs: ["obs_test_revise_missing_target"],
      governance_state: "proposed",
    },
    existing_canon_records: [],
    now,
    actor: "system:test",
    ratification_id: "rat_test_revise_missing_target",
    diagnostic_id: "diag_test_revise_missing_target",
    canonical_id: "mem_test_revise_missing_target",
  });

  assert.equal(workflow.accepted, false);
  assert.equal(workflow.ratification_record.decision, "rejected");
});

test("canonical workflow blocks revise while an active world contradiction is open", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const targetRecord: CanonicalMemoryObject = {
    id: "mem_target_revise_conflict_001",
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
      source_ref: "src_target_revise_conflict_001",
    },
    statement: "The user prefers concise answers.",
    semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
    epistemic_state: "confirmed",
    governance_state: "ratified",
    temporal_state: {
      temporal_status: "active",
      valid_from: now,
      valid_to: null,
    },
    supersedes_ref: null,
    superseded_by_ref: null,
  };

  const workflow = executeCanonicalProposalWorkflow({
    proposal: {
      id: "prop_test_revise_active_conflict",
      kind: "proposal",
      layer: "governance",
      authoritative_home: "governance",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "world_promotion",
        source_ref: "wcl_test_revise_active_conflict",
        evidence_refs: ["wcl_test_revise_active_conflict"],
      },
      operation: "revise",
      candidate_kind: "preference",
      target_layer: "canon",
      target_ref: {
        id: targetRecord.id,
        kind: targetRecord.kind,
        layer: targetRecord.layer,
      },
      candidate_payload: {
        kind: "preference",
        statement: "The user prefers concise answers unless they ask for depth.",
        semantic_slot: targetRecord.semantic_slot,
      },
      reason: "Revise should block on active contradiction.",
      evidence_refs: ["wcl_test_revise_active_conflict"],
      governance_state: "proposed",
    },
    existing_canon_records: [targetRecord],
    existing_record: targetRecord,
    blocking_world_conflict_ref: "contra_open_revise_001",
    now,
    actor: "system:test",
    ratification_id: "rat_test_revise_active_conflict",
    diagnostic_id: "diag_test_revise_active_conflict",
    canonical_id: "mem_test_revise_active_conflict",
  });

  assert.equal(workflow.accepted, false);
  assert.equal(workflow.ratification_record.decision, "rejected");
  assert.equal(
    workflow.gate_results.find((gate) => gate.gate === "conflict")?.reason_code,
    "active_world_conflict",
  );
});

test("canonical supersede retires a record without creating a replacement", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const targetRecord: CanonicalMemoryObject = {
    id: "mem_target_supersede_001",
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
      source_ref: "src_target_supersede_001",
    },
    statement: "The user prefers concise answers.",
    semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
    epistemic_state: "confirmed",
    governance_state: "ratified",
    temporal_state: {
      temporal_status: "active",
      valid_from: now,
      valid_to: null,
    },
    supersedes_ref: null,
    superseded_by_ref: null,
    upstream_refs: ["mem_origin_supersede_001"],
  };

  const workflow = executeCanonicalProposalWorkflow({
    proposal: {
      id: "prop_test_supersede_retire",
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
        source_ref: "src_prop_supersede_retire",
        evidence_refs: ["obs_test_supersede_retire"],
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
        semantic_slot: targetRecord.semantic_slot,
      },
      reason: "Withdraw the active canonical preference pending future confirmation.",
      evidence_refs: ["obs_test_supersede_retire"],
      governance_state: "proposed",
    },
    existing_canon_records: [targetRecord],
    now,
    actor: "system:test",
    ratification_id: "rat_test_supersede_retire",
    diagnostic_id: "diag_test_supersede_retire",
    canonical_id: "unused_test_supersede_retire",
  });

  assert.equal(workflow.accepted, true);
  assert.equal(workflow.created_record, undefined);
  assert.equal(workflow.updated_records.length, 1);
  assert.equal(workflow.updated_records[0]?.governance_state, "superseded");
  assert.equal(workflow.updated_records[0]?.superseded_by_ref, null);
  assert.deepEqual(workflow.updated_records[0]?.upstream_refs, [
    "mem_origin_supersede_001",
    "prop_test_supersede_retire",
    "rat_test_supersede_retire",
  ]);
});

test("canonical revise closes the superseded record at the successor temporal boundary", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const existingRecord: CanonicalMemoryObject = {
    id: "mem_target_revise_temporal_001",
    kind: "preference",
    layer: "canon",
    authoritative_home: "canon",
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: "src_target_revise_temporal_001",
    },
    statement: "The user prefers concise answers.",
    semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
    epistemic_state: "confirmed",
    governance_state: "ratified",
    temporal_state: {
      temporal_status: "active",
      valid_from: "2026-04-01T00:00:00.000Z",
      valid_to: null,
    },
    supersedes_ref: null,
    superseded_by_ref: null,
    upstream_refs: ["mem_origin_revise_temporal_001"],
  };

  const applied = applyApprovedCanonicalProposal({
    proposal: {
      id: "prop_test_revise_temporal_boundary",
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
        source_ref: "src_prop_revise_temporal_boundary",
        evidence_refs: ["obs_test_revise_temporal_boundary"],
      },
      operation: "revise",
      candidate_kind: "preference",
      target_layer: "canon",
      target_ref: {
        id: existingRecord.id,
        kind: existingRecord.kind,
        layer: existingRecord.layer,
      },
      candidate_payload: {
        kind: "preference",
        statement: "The user prefers concise answers unless they ask for depth.",
        semantic_slot: existingRecord.semantic_slot,
        temporal_state: {
          temporal_status: "active",
          valid_from: "2026-04-20T00:00:00.000Z",
          valid_to: null,
        },
      },
      reason: "Revise canonical claim with explicit future effective date.",
      evidence_refs: ["obs_test_revise_temporal_boundary"],
      governance_state: "proposed",
    },
    ratification_record: {
      id: "rat_test_revise_temporal_boundary",
      kind: "ratification",
      layer: "governance",
      authoritative_home: "governance",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "governance",
        source_ref: "ratification/test/revise-temporal-boundary",
      },
      proposal_ref: "prop_test_revise_temporal_boundary",
      decision: "approved",
      actor: "system:test",
      approved_at: now,
    },
    existing_record: existingRecord,
    canonical_id: "mem_revised_temporal_001",
    now,
  });

  assert.equal(applied.created_record?.temporal_state?.valid_from, "2026-04-20T00:00:00.000Z");
  assert.equal(applied.updated_records[0]?.temporal_state?.valid_to, "2026-04-20T00:00:00.000Z");
  assert.equal(applied.updated_records[0]?.updated_at, now);
});

test("canonical workflow blocks supersede while an active world contradiction is open", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const targetRecord: CanonicalMemoryObject = {
    id: "mem_target_supersede_conflict_001",
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
      source_ref: "src_target_supersede_conflict_001",
    },
    statement: "The user prefers concise answers.",
    semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
    epistemic_state: "confirmed",
    governance_state: "ratified",
    temporal_state: {
      temporal_status: "active",
      valid_from: now,
      valid_to: null,
    },
    supersedes_ref: null,
    superseded_by_ref: null,
  };

  const workflow = executeCanonicalProposalWorkflow({
    proposal: {
      id: "prop_test_supersede_active_conflict",
      kind: "proposal",
      layer: "governance",
      authoritative_home: "governance",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "world_promotion",
        source_ref: "wcl_test_supersede_active_conflict",
        evidence_refs: ["wcl_test_supersede_active_conflict"],
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
        semantic_slot: targetRecord.semantic_slot,
      },
      reason: "Supersede should block on active contradiction.",
      evidence_refs: ["wcl_test_supersede_active_conflict"],
      governance_state: "proposed",
    },
    existing_canon_records: [targetRecord],
    existing_record: targetRecord,
    blocking_world_conflict_ref: "contra_open_supersede_001",
    now,
    actor: "system:test",
    ratification_id: "rat_test_supersede_active_conflict",
    diagnostic_id: "diag_test_supersede_active_conflict",
    canonical_id: "mem_test_supersede_active_conflict",
  });

  assert.equal(workflow.accepted, false);
  assert.equal(workflow.ratification_record.decision, "rejected");
  assert.equal(
    workflow.gate_results.find((gate) => gate.gate === "conflict")?.reason_code,
    "active_world_conflict",
  );
});

test("canonical application rejects ratifications that do not belong to the proposal", () => {
  const now = "2026-04-12T00:00:00.000Z";

  assert.throws(
    () =>
      applyApprovedCanonicalProposal({
        proposal: {
          id: "prop_test_wrong_ratification",
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
            source_ref: "src_prop_wrong_ratification",
            evidence_refs: ["obs_test_wrong_ratification"],
          },
          operation: "create",
          candidate_kind: "preference",
          target_layer: "canon",
          target_ref: null,
          candidate_payload: {
            kind: "preference",
            statement: "The user prefers concise answers.",
            semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
          },
          reason: "Promote preference to canon.",
          evidence_refs: ["obs_test_wrong_ratification"],
          governance_state: "proposed",
        },
        ratification_record: {
          id: "rat_test_wrong_ratification",
          kind: "ratification",
          layer: "governance",
          authoritative_home: "governance",
          created_at: now,
          updated_at: now,
          visibility_state: {
            privacy_scope: "owner_private",
          },
          provenance: {
            source_type: "governance",
            source_ref: "ratification/test/wrong",
          },
          proposal_ref: "prop_other",
          decision: "approved",
          actor: "system:test",
          approved_at: now,
        },
        canonical_id: "mem_test_wrong_ratification",
        now,
      }),
    /does not belong to proposal/,
  );
});

test("canonical application rejects proposals that were not in proposed state", () => {
  const now = "2026-04-12T00:00:00.000Z";

  assert.throws(
    () =>
      applyApprovedCanonicalProposal({
        proposal: {
          id: "prop_test_not_proposed",
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
            source_ref: "src_prop_not_proposed",
            evidence_refs: ["obs_test_not_proposed"],
          },
          operation: "create",
          candidate_kind: "preference",
          target_layer: "canon",
          target_ref: null,
          candidate_payload: {
            kind: "preference",
            statement: "The user prefers concise answers.",
            semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
          },
          reason: "Promote preference to canon.",
          evidence_refs: ["obs_test_not_proposed"],
          governance_state: "draft",
        },
        ratification_record: {
          id: "rat_test_not_proposed",
          kind: "ratification",
          layer: "governance",
          authoritative_home: "governance",
          created_at: now,
          updated_at: now,
          visibility_state: {
            privacy_scope: "owner_private",
          },
          provenance: {
            source_type: "governance",
            source_ref: "ratification/test/not-proposed",
          },
          proposal_ref: "prop_test_not_proposed",
          decision: "approved",
          actor: "system:test",
          approved_at: now,
        },
        canonical_id: "mem_test_not_proposed",
        now,
      }),
    /must be in proposed state/,
  );
});

test("canonical revise application rejects mismatched canonical target contracts", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const existingRecord: CanonicalMemoryObject = {
    id: "mem_existing_target_contract",
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
      source_ref: "src_existing_target_contract",
    },
    statement: "The user prefers detailed answers.",
    semantic_slot: "preference:participant:test-user:expressed-preference:user-interaction-preferences",
    epistemic_state: "confirmed",
    governance_state: "ratified",
    temporal_state: {
      temporal_status: "active",
      valid_from: now,
      valid_to: null,
    },
    supersedes_ref: null,
    superseded_by_ref: null,
  };

  assert.throws(
    () =>
      applyApprovedCanonicalProposal({
        proposal: {
          id: "prop_test_target_contract_mismatch",
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
            source_ref: "src_prop_target_contract_mismatch",
            evidence_refs: ["obs_test_target_contract_mismatch"],
          },
          operation: "revise",
          candidate_kind: "fact",
          target_layer: "canon",
          target_ref: {
            id: "mem_other_target_contract",
            kind: "fact",
            layer: "canon",
          },
          candidate_payload: {
            kind: "fact",
            statement: "The user prefers concise answers.",
            semantic_slot: existingRecord.semantic_slot,
          },
          reason: "Attempt to revise canonical memory with a mismatched target contract.",
          evidence_refs: ["obs_test_target_contract_mismatch"],
          governance_state: "proposed",
        },
        ratification_record: {
          id: "rat_test_target_contract_mismatch",
          kind: "ratification",
          layer: "governance",
          authoritative_home: "governance",
          created_at: now,
          updated_at: now,
          visibility_state: {
            privacy_scope: "owner_private",
          },
          provenance: {
            source_type: "governance",
            source_ref: "ratification/test/target-contract-mismatch",
          },
          proposal_ref: "prop_test_target_contract_mismatch",
          decision: "approved",
          actor: "system:test",
          approved_at: now,
        },
        existing_record: existingRecord,
        canonical_id: "mem_revised_target_contract_mismatch",
        now,
      }),
    /candidate_kind .* does not match existing canonical kind|target_ref does not match existing canonical record/,
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
    identity_context: buildIdentityContext("test_003"),
    ids: buildIds("test_003"),
  });

  assert.equal(intake.observation.provenance.source_ref, "runtime/session-test#turn-003");
  assert.equal(intake.observation.provenance.source_type, "conversation");
  assert.equal(intake.observation.runtime_instance_ref, "runtime_test_003");
  assert.equal(intake.episode.observation_refs[0], intake.observation.id);
  assert.equal(intake.preference_relation.subject_ref.id, intake.subject_entity.id);
  assert.equal(intake.world_claim.provenance.source_ref, "runtime/session-test#turn-003");
  assert.equal(intake.proposal.provenance.source_ref, "runtime/session-test#turn-003");
});

test("structured preference intake preserves the source_type across emitted artifacts", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildStructuredPreferenceSignalIntake({
    now,
    statement: "The customer prefers change summaries before code excerpts.",
    source_record: {
      id: "src_structured_source_type_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "project_private",
      },
      provenance: {
        source_type: "crm_import",
        source_ref: "crm/customer-001",
      },
      content_ref: "raw/imports/customer-001.json",
    },
    semantic_profile: {
      wiki_title: "Customer Delivery Preferences",
      wiki_path: "wiki/pages/customer-delivery-preferences.md",
      subject_entity_kind: "customer",
      subject_label: "Customer 001",
      preference_topic_label: "Delivery Preferences",
      relation_type: "requests_delivery_style",
      proposal_reason: "Structured import confirms a customer delivery preference worth governing.",
    },
    ids: buildIds("structured_source_type_001"),
  });

  assert.equal(intake.observation.provenance.source_type, "crm_import");
  assert.equal(intake.episode.provenance.source_type, "crm_import");
  assert.equal(intake.proposal.provenance.source_type, "crm_import");
  assert.equal(intake.disposition_record.provenance.source_type, "crm_import");
});

test("conversation preference intake keeps the default participant subject neutral in the semantic slot", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers unless they explicitly ask for depth.",
    source_record: {
      id: "src_subject_slot_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session-test#turn-subject-slot-001",
      },
      content_ref: "raw/sources/turn-subject-slot-001.json",
    },
    identity_context: buildIdentityContext("subject_slot_001"),
    ids: buildIds("subject_slot_001"),
  });

  assert.equal(
    intake.world_claim.semantic_slot,
    "preference:participant:runtime-session-test-turn-subject-slot-001:expressed-preference:user-interaction-preferences",
  );
});

test("wiki pages reject paths outside wiki/pages markdown storage", () => {
  const issues = validateCoreRecord({
    id: "wpg_invalid_path_001",
    kind: "wiki_page",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: "src_invalid_path_001",
    },
    page_kind: "entity",
    title: "Invalid Wiki Path",
    path: "manifest.yaml",
    source_refs: ["src_invalid_path_001"],
    canonical_refs: [],
    world_refs: [],
  });

  assert.ok(issues.some((issue) => issue.path === "path"));
});

test("ratification records accept explicit expiration as a terminal decision", () => {
  const issues = validateCoreRecord({
    id: "rat_expired_test_001",
    kind: "ratification",
    layer: "governance",
    authoritative_home: "governance",
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:05:00.000Z",
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: "src_rat_expired_test_001",
    },
    proposal_ref: "prop_rat_expired_test_001",
    decision: "expired",
    actor: "system:test-expirer",
    expired_at: "2026-04-12T00:05:00.000Z",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:test-expirer",
      system_scope: "test-expirer",
    },
  });

  assert.equal(issues.length, 0);
});

test("ratification records reject malformed authenticated principals", () => {
  const issues = validateCoreRecord({
    id: "rat_invalid_principal_test_001",
    kind: "ratification",
    layer: "governance",
    authoritative_home: "governance",
    created_at: "2026-04-12T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: "src_rat_invalid_principal_test_001",
    },
    proposal_ref: "prop_rat_invalid_principal_test_001",
    decision: "approved",
    actor: "actor_owner_invalid_principal_001",
    approved_at: "2026-04-12T00:00:00.000Z",
    authenticated_principal: {
      kind: "owner",
      actor_ref: "",
      system_scope: "should-not-exist",
    },
  });

  assert.ok(issues.some((issue) => issue.path === "authenticated_principal.actor_ref"));
  assert.ok(issues.some((issue) => issue.path === "authenticated_principal.system_scope"));
});

test("contradiction resolutions require explicit lifecycle timestamps for accepted and applied states", () => {
  const acceptedIssues = validateCoreRecord({
    id: "cres_lifecycle_missing_accepted_001",
    kind: "contradiction_resolution",
    layer: "governance",
    authoritative_home: "governance",
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:01:00.000Z",
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "contradiction_resolution",
      source_ref: "cres_lifecycle_missing_accepted_001",
    },
    contradiction_ref: "contra_lifecycle_missing_accepted_001",
    strategy: "supersede_existing",
    status: "accepted",
    winning_ref: {
      id: "wcl_winner_001",
      kind: "preference",
      layer: "world",
    },
    losing_ref: {
      id: "wcl_loser_001",
      kind: "preference",
      layer: "world",
    },
    rationale: "Accepted contradiction resolution should carry accepted_at.",
  });

  const appliedIssues = validateCoreRecord({
    id: "cres_lifecycle_missing_applied_001",
    kind: "contradiction_resolution",
    layer: "governance",
    authoritative_home: "governance",
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:02:00.000Z",
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "contradiction_resolution",
      source_ref: "cres_lifecycle_missing_applied_001",
    },
    contradiction_ref: "contra_lifecycle_missing_applied_001",
    strategy: "supersede_existing",
    status: "applied",
    accepted_at: "2026-04-12T00:01:00.000Z",
    winning_ref: {
      id: "wcl_winner_002",
      kind: "preference",
      layer: "world",
    },
    losing_ref: {
      id: "wcl_loser_002",
      kind: "preference",
      layer: "world",
    },
    rationale: "Applied contradiction resolution should carry applied_at.",
  });

  assert.ok(acceptedIssues.some((issue) => issue.path === "accepted_at"));
  assert.ok(appliedIssues.some((issue) => issue.path === "applied_at"));
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
    identity_context: buildIdentityContext("test_004"),
    ids: buildIds("test_004"),
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
    episodes: [intake.episode],
    entities: [intake.subject_entity, intake.preference_entity],
    relations: [intake.preference_relation],
    contradictions: [
      {
        id: "contra_test_004",
        kind: "contradiction",
        layer: "world",
        authoritative_home: "world",
        created_at: now,
        updated_at: now,
        visibility_state,
        provenance: {
          source_type: "contradiction_detection",
          source_ref: "test/004",
          evidence_refs: [reconciled.world_claim.id, "wcl_previous_004"],
        },
        left_ref: {
          id: "wcl_previous_004",
          kind: "preference",
          layer: "world",
        },
        right_ref: {
          id: reconciled.world_claim.id,
          kind: reconciled.world_claim.kind,
          layer: reconciled.world_claim.layer,
        },
        status: "open",
      },
    ],
    wiki_pages: [reconciled.wiki_page],
    wiki_claims: [reconciled.wiki_claim],
    diagnostics: [
      {
        id: "diag_test_004",
        kind: "diagnostic",
        layer: "audits",
        authoritative_home: "governance",
        created_at: now,
        updated_at: now,
        visibility_state,
        provenance: {
          source_type: "governance",
          source_ref: "diag/test/004",
        },
        code: "projection_context_notice",
        severity: "warning",
        message: "Projection compiled without active canon.",
        related_refs: [reconciled.world_claim.id],
      },
    ],
    identity_context: {
      actor_identity_ref: intake.agent_identity?.id ?? null,
      owner_identity_ref: intake.owner_identity?.id ?? null,
      runtime_instance_ref: intake.runtime_instance?.id ?? null,
      runtime_session_ref: intake.runtime_session?.id ?? null,
      conversation_thread_ref: intake.conversation_thread?.id ?? null,
    },
    runtime_identity: {
      actor_identity: intake.agent_identity,
      owner_identity: intake.owner_identity,
      runtime_instance: intake.runtime_instance,
      runtime_session: intake.runtime_session,
      conversation_thread: intake.conversation_thread,
    },
    ids: {
      canon_artifact: "part_openclaw_canon_test_004",
      world_artifact: "part_openclaw_world_test_004",
      wiki_artifact: "part_openclaw_wiki_test_004",
      manifest: "pmf_openclaw_test_004",
    },
  });

  assert.equal(projection.manifest.visibility_state.privacy_scope, "shareable");
  assert.equal(projection.manifest.actor_identity_ref, intake.agent_identity?.id);
  assert.equal(projection.manifest.owner_identity_ref, intake.owner_identity?.id);
  assert.equal(projection.manifest.runtime_instance_ref, intake.runtime_instance?.id);
  assert.equal(projection.manifest.runtime_session_ref, intake.runtime_session?.id);
  assert.equal(projection.manifest.conversation_thread_ref, intake.conversation_thread?.id);
  assert.equal(projection.manifest.read_policy_version, DEFAULT_PROJECTION_READ_POLICY_VERSION);
  assert.equal(projection.manifest.compiler_version, RUNTIME_BOOTSTRAP_PROJECTION_COMPILER_VERSION.openclaw);
  assert.deepEqual(
    projection.manifest.context_refs,
    [
      intake.agent_identity?.id,
      intake.owner_identity?.id,
      intake.runtime_instance?.id,
      intake.runtime_session?.id,
      intake.conversation_thread?.id,
    ].filter((value): value is string => typeof value === "string"),
  );
  assert.deepEqual(projection.manifest.suppressed_refs, []);
  assert.deepEqual(projection.manifest.suppressed_records, []);
  assert.deepEqual(projection.manifest.diagnostic_refs, ["diag_test_004"]);
  assert.match(projection.markdown, /\(disputed; historical\)/);
  assert.match(projection.markdown, /\(superseded\)/);
  assert.match(projection.markdown, /\[episode:ep_test_004\]/);
  assert.match(projection.markdown, /\[contradiction:contra_test_004\]/);
  assert.match(projection.markdown, /\[diag:diag_test_004\]/);
});

test("openclaw feedback intake reuses the generic source intake without collapsing runtime identity", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildOpenClawPreferenceFeedbackIntake({
    now,
    statement: "The runtime confirms the user still prefers concise answers.",
    source_record: {
      id: "src_feedback_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "openclaw_runtime_feedback",
        source_ref: "openclaw/runtime-001#thread-001",
      },
      content_ref: "raw/imports/openclaw-feedback-001.json",
    },
    identity_context: buildIdentityContext("feedback_001"),
    ids: buildIds("feedback_001"),
  });

  assert.match(intake.observation.summary, /^OpenClaw runtime feedback:/);
  assert.equal(intake.runtime_instance?.runtime, "openclaw");
  assert.equal(intake.wiki_page.path, "wiki/pages/runtime-preference-feedback.md");
});

test("openclaw projection suppresses runtime-private records outside the active thread context", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const visibility_state = {
    privacy_scope: "runtime_private",
  } as const;

  const currentIntake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers in this thread.",
    source_record: {
      id: "src_runtime_private_current",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state,
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/current#turn-001",
      },
      content_ref: "raw/sources/current-runtime-private.json",
    },
    identity_context: buildIdentityContext("runtime_private_current"),
    ids: buildIds("runtime_private_current"),
  });

  const foreignIntake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers verbose answers in another thread.",
    source_record: {
      id: "src_runtime_private_foreign",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state,
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/foreign#turn-001",
      },
      content_ref: "raw/sources/foreign-runtime-private.json",
    },
    identity_context: buildIdentityContext("runtime_private_foreign"),
    ids: buildIds("runtime_private_foreign"),
  });

  const projection = executeOpenClawBootstrapWorkflow({
    now,
    visibility_state,
    canonical_records: [],
    world_claims: [currentIntake.world_claim, foreignIntake.world_claim],
    wiki_pages: [],
    wiki_claims: [],
    runtime_identity: {
      actor_identity: currentIntake.agent_identity,
      owner_identity: currentIntake.owner_identity,
      runtime_instance: currentIntake.runtime_instance,
      runtime_session: currentIntake.runtime_session,
      conversation_thread: currentIntake.conversation_thread,
    },
    identity_context: {
      actor_identity_ref: currentIntake.agent_identity?.id ?? null,
      owner_identity_ref: currentIntake.owner_identity?.id ?? null,
      runtime_instance_ref: currentIntake.runtime_instance?.id ?? null,
      runtime_session_ref: currentIntake.runtime_session?.id ?? null,
      conversation_thread_ref: currentIntake.conversation_thread?.id ?? null,
    },
    ids: {
      canon_artifact: "part_openclaw_canon_runtime_private_001",
      world_artifact: "part_openclaw_world_runtime_private_001",
      wiki_artifact: "part_openclaw_wiki_runtime_private_001",
      manifest: "pmf_openclaw_runtime_private_001",
    },
  });

  assert.match(projection.markdown, /\[actor:actor_agent_runtime_private_current\]/);
  assert.match(projection.markdown, /\[owner:actor_owner_runtime_private_current\]/);
  assert.match(projection.markdown, /\[world:wcl_runtime_private_current\]/);
  assert.doesNotMatch(projection.markdown, /\[world:wcl_runtime_private_foreign\]/);
  assert.ok(projection.manifest.suppressed_refs?.includes("wcl_runtime_private_foreign"));
  assert.ok(
    projection.manifest.suppressed_records?.some(
      (entry) => entry.id === "wcl_runtime_private_foreign" && entry.reason_code === "runtime_private_runtime_instance_mismatch",
    ),
  );
});

test("projection manifests require declared context refs and coherent suppression metadata", () => {
  const issues = validateCoreRecord({
    id: "pmf_invalid_projection_001",
    kind: "projection_manifest",
    layer: "derived",
    authoritative_home: "governance",
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "projection_manifest",
      source_ref: "derived/manifests/pmf_invalid_projection_001.json",
      evidence_refs: ["mem_test_001"],
    },
    adapter: "openclaw",
    projection_profile: "bootstrap",
    audience: "runtime",
    read_policy_version: DEFAULT_PROJECTION_READ_POLICY_VERSION,
    compiler_version: 7,
    actor_identity_ref: "actor_agent_test_001",
    owner_identity_ref: "actor_owner_test_001",
    runtime_instance_ref: "runtime_test_001",
    source_checkpoint_ref: "chkpt_projection_invalid_001",
    continuity_epoch: 12,
    generation: -1,
    snapshot_strategy: "mixed_state_tolerant",
    context_refs: ["runtime_test_001"],
    suppressed_refs: ["foreign_world_claim"],
    suppressed_records: [
      {
        id: "other_world_claim",
        kind: "preference",
        reason_code: "owner_private_runtime_instance_mismatch",
      },
    ],
    retrieval_traces: [
      {
        query_ref: "retrieval_query_invalid_projection_001",
        recipe_ref: "retrieval_recipe_invalid_projection_001",
        included_candidate_refs: ["candidate_projection_invalid_001"],
        suppressed_candidate_refs: [],
        suppression_reasons: [],
      },
    ],
    artifact_refs: ["part_openclaw_world_invalid_001"],
    upstream_refs: ["mem_test_001"],
  });

  assert.ok(issues.some((issue) => issue.path === "context_refs" && issue.message.includes("actor_agent_test_001")));
  assert.ok(issues.some((issue) => issue.path === "context_refs" && issue.message.includes("actor_owner_test_001")));
  assert.ok(issues.some((issue) => issue.path === "compiler_version"));
  assert.ok(issues.some((issue) => issue.path === "continuity_epoch"));
  assert.ok(issues.some((issue) => issue.path === "generation"));
  assert.ok(issues.some((issue) => issue.path === "snapshot_strategy" && issue.message.includes("checkpoint_consistent")));
  assert.ok(issues.some((issue) => issue.path === "retrieval_traces[0].read_policy_version"));
  assert.ok(issues.some((issue) => issue.path === "suppressed_refs" && issue.message.includes("foreign_world_claim")));
  assert.ok(issues.some((issue) => issue.path === "suppressed_records" && issue.message.includes("other_world_claim")));
});

test("projection manifests require complete lineage markers for checkpoint-consistent snapshots", () => {
  const issues = validateCoreRecord({
    id: "pmf_invalid_checkpoint_projection_001",
    kind: "projection_manifest",
    layer: "derived",
    authoritative_home: "governance",
    created_at: "2026-04-23T15:00:00.000Z",
    updated_at: "2026-04-23T15:00:00.000Z",
    visibility_state: {
      privacy_scope: "shareable",
    },
    provenance: {
      source_type: "projection_manifest",
      source_ref: "derived/manifests/pmf_invalid_checkpoint_projection_001.json",
      evidence_refs: ["mem_test_001"],
    },
    adapter: "hermes",
    projection_profile: "hermes/runtime-bootstrap",
    audience: "runtime",
    read_policy_version: DEFAULT_PROJECTION_READ_POLICY_VERSION,
    compiler_version: "hermes.runtime.v1",
    snapshot_strategy: "checkpoint_consistent",
    context_refs: [],
    artifact_refs: ["part_hermes_invalid_checkpoint_projection_001"],
    upstream_refs: ["mem_test_001"],
  });

  assert.ok(issues.some((issue) => issue.path === "source_checkpoint_ref" && issue.message.includes("checkpoint_consistent")));
  assert.ok(issues.some((issue) => issue.path === "continuity_epoch" && issue.message.includes("checkpoint_consistent")));
  assert.ok(issues.some((issue) => issue.path === "generation" && issue.message.includes("checkpoint_consistent")));
});

test("actor identities reject runtime-private visibility", () => {
  const issues = validateCoreRecord({
    id: "actor_invalid_runtime_private_001",
    kind: "actor_identity",
    layer: "canon",
    authoritative_home: "canon",
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "runtime_private",
    },
    provenance: {
      source_type: "runtime_identity",
      source_ref: "runtime/test#turn-001",
    },
    actor_kind: "agent",
    label: "Invalid Runtime Private Actor",
    status: "active",
  });

  assert.ok(
    issues.some(
      (issue) =>
        issue.path === "visibility_state.privacy_scope" &&
        issue.message === 'actor identities cannot be "runtime_private"',
    ),
  );
});

test("procedure claims can move from world through governance into canonical memory", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const worldClaim = {
    id: "wcl_procedure_test_001",
    kind: "procedure" as const,
    layer: "world" as const,
    authoritative_home: "world" as const,
    created_at: now,
    updated_at: now,
    visibility_state: {
      privacy_scope: "owner_private" as const,
    },
    provenance: {
      source_type: "workflow_observation",
      source_ref: "runtime/session-procedure#turn-001",
      evidence_refs: ["ep_procedure_test_001"],
      runtime_ref: "runtime_procedure_test_001",
      session_ref: "session_procedure_test_001",
      thread_ref: "thread_procedure_test_001",
    },
    statement: "When processing structured preference signals, normalize subject_label, relation_type, and wiki_path before proposal emission.",
    semantic_slot: "procedure:workflow:structured-preference-signal",
    epistemic_state: "inferred" as const,
    temporal_state: {
      temporal_status: "active" as const,
      valid_from: now,
      valid_to: null,
    },
    support_refs: ["ep_procedure_test_001"],
  };

  const workflow = executeCanonicalProposalWorkflow({
    now,
    actor: "system:test",
    ratification_id: "rat_procedure_test_001",
    canonical_id: "mem_procedure_test_001",
    proposal: {
      id: "prop_procedure_test_001",
      kind: "proposal",
      layer: "governance",
      authoritative_home: "governance",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "world_promotion",
        source_ref: worldClaim.id,
        evidence_refs: [worldClaim.id, ...worldClaim.support_refs],
        runtime_ref: worldClaim.provenance.runtime_ref,
        session_ref: worldClaim.provenance.session_ref,
        thread_ref: worldClaim.provenance.thread_ref,
      },
      operation: "create",
      candidate_kind: "procedure",
      target_layer: "canon",
      target_ref: null,
      candidate_payload: {
        kind: "procedure",
        statement: worldClaim.statement,
        semantic_slot: worldClaim.semantic_slot,
        epistemic_state: "confirmed",
        temporal_state: worldClaim.temporal_state,
      },
      reason: "Repeated workflow evidence supports governing this procedure.",
      evidence_refs: [worldClaim.id, ...worldClaim.support_refs],
      governance_state: "proposed",
    },
  });

  assert.equal(workflow.accepted, true);
  assert.equal(workflow.ratification_record.decision, "approved");
  assert.equal(workflow.created_record?.kind, "procedure");
  assert.equal(workflow.created_record?.statement, worldClaim.statement);
  assert.equal(workflow.created_record?.governance_state, "ratified");
  assert.equal(workflow.created_record?.temporal_state?.temporal_status, "active");
  assert.deepEqual(workflow.updated_records, []);
});

test("structured preference intake can be shaped declaratively without adding a new workflow", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildStructuredPreferenceSignalIntake({
    now,
    statement: "The customer prefers change summaries before code excerpts.",
    source_record: {
      id: "src_structured_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "project_private",
      },
      provenance: {
        source_type: "crm_import",
        source_ref: "crm/customer-001",
      },
      content_ref: "raw/imports/customer-001.json",
    },
    semantic_profile: {
      wiki_title: "Customer Delivery Preferences",
      wiki_path: "wiki/pages/customer-delivery-preferences.md",
      subject_entity_kind: "customer",
      subject_label: "Customer 001",
      preference_topic_label: "Delivery Preferences",
      relation_type: "requests_delivery_style",
      proposal_reason: "Structured CRM evidence indicates a stable delivery preference.",
    },
    ids: buildIds("structured_001"),
  });

  assert.match(intake.observation.summary, /^Structured preference signal:/);
  assert.equal(intake.wiki_page.title, "Customer Delivery Preferences");
  assert.equal(intake.subject_entity.entity_kind, "customer");
  assert.equal(intake.preference_relation.relation_type, "requests_delivery_style");
});

test("participant-originated owner claims are routed to queued review instead of direct canon promotion", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The owner prefers strategic summaries on Fridays.",
    source_record: {
      id: "src_owner_authority_review_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session-owner#turn-001",
        speaker_ref: "actor_external_person_owner_review_001",
      },
      content_ref: "raw/sources/owner-authority-review-001.json",
    },
    identity_context: buildIdentityContext("owner_authority_review_001"),
    semantic_profile: {
      subject_entity_kind: "owner",
      subject_authority_role: "owner",
      subject_label: "Test Owner",
      wiki_title: "Owner Interaction Preferences",
      wiki_path: "wiki/pages/owner-interaction-preferences.md",
      preference_topic_label: "Owner Interaction Preferences",
      relation_type: "expressed_preference",
      proposal_reason: "Participant reported an owner preference that requires owner ratification.",
    },
    ids: buildIds("owner_authority_review_001"),
  });

  assert.equal(intake.proposal.subject_authority_role, "owner");
  assert.equal(intake.proposal.promotion_requirement, "owner_ratification_required");
  assert.deepEqual(intake.disposition_record.outcomes, ["world_update", "wiki_update", "queued_review"]);
  assert.equal(intake.disposition_record.proposal_refs, undefined);
  assert.ok(intake.disposition_record.reason_codes.includes("owner_authority_required"));
  assert.ok(intake.disposition_record.reason_codes.includes("speaker_not_owner"));
});

test("owner speaker_ref alone does not satisfy owner authority", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    authenticated_principal: participantPrincipal("actor_external_person_owner_claim_001"),
    statement: "The owner prefers strategic summaries on Fridays.",
    source_record: {
      id: "src_owner_authority_spoof_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session-owner#turn-claim-001",
        speaker_ref: "actor_owner_owner_authority_spoof_001",
      },
      content_ref: "raw/sources/owner-authority-spoof-001.json",
    },
    identity_context: buildIdentityContext("owner_authority_spoof_001"),
    semantic_profile: {
      subject_entity_kind: "owner",
      subject_authority_role: "owner",
      subject_label: "Test Owner",
      wiki_title: "Owner Interaction Preferences",
      wiki_path: "wiki/pages/owner-interaction-preferences.md",
      preference_topic_label: "Owner Interaction Preferences",
      relation_type: "expressed_preference",
      proposal_reason: "Owner claims still require authenticated owner authority.",
    },
    ids: buildIds("owner_authority_spoof_001"),
  });

  assert.equal(intake.proposal.promotion_requirement, "owner_ratification_required");
  assert.ok(intake.disposition_record.reason_codes.includes("speaker_claim_not_authority"));
});

test("authenticated owner principal can satisfy owner authority", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    authenticated_principal: ownerPrincipal("owner_authority_direct_001"),
    statement: "The owner prefers strategic summaries on Fridays.",
    source_record: {
      id: "src_owner_authority_direct_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session-owner#turn-direct-001",
        speaker_ref: "actor_owner_owner_authority_direct_001",
      },
      content_ref: "raw/sources/owner-authority-direct-001.json",
    },
    identity_context: buildIdentityContext("owner_authority_direct_001"),
    semantic_profile: {
      subject_entity_kind: "owner",
      subject_authority_role: "owner",
      subject_label: "Test Owner",
      wiki_title: "Owner Interaction Preferences",
      wiki_path: "wiki/pages/owner-interaction-preferences.md",
      preference_topic_label: "Owner Interaction Preferences",
      relation_type: "expressed_preference",
      proposal_reason: "Owner-originated preference signal.",
    },
    ids: buildIds("owner_authority_direct_001"),
  });

  assert.equal(intake.proposal.promotion_requirement, "none");
  assert.deepEqual(intake.disposition_record.outcomes, ["world_update", "wiki_update", "proposal_for_canon"]);
});

test("default participant subject key falls back to runtime context instead of owner identity", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers.",
    source_record: {
      id: "src_runtime_subject_fallback_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session#turn-runtime-subject-fallback-001",
        runtime_ref: "runtime_runtime_subject_fallback_001",
      },
      content_ref: "raw/sources/runtime-subject-fallback-001.json",
    },
    identity_context: buildIdentityContext("runtime_subject_fallback_001"),
    ids: buildIds("runtime_subject_fallback_001"),
  });

  assert.match(intake.world_claim.semantic_slot, /runtime-runtime-subject-fallback-001/);
  assert.doesNotMatch(intake.world_claim.semantic_slot, /actor-owner-runtime-subject-fallback-001/);
});

test("canonical workflow rejects owner-scoped proposals that still require owner ratification", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The owner prefers strategic summaries on Fridays.",
    source_record: {
      id: "src_owner_authority_gate_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session-owner#turn-002",
        speaker_ref: "actor_external_person_owner_gate_001",
      },
      content_ref: "raw/sources/owner-authority-gate-001.json",
    },
    identity_context: buildIdentityContext("owner_authority_gate_001"),
    semantic_profile: {
      subject_entity_kind: "owner",
      subject_authority_role: "owner",
      subject_label: "Test Owner",
      wiki_title: "Owner Interaction Preferences",
      wiki_path: "wiki/pages/owner-interaction-preferences.md",
      preference_topic_label: "Owner Interaction Preferences",
      relation_type: "expressed_preference",
      proposal_reason: "Participant reported an owner preference that requires owner ratification.",
    },
    ids: buildIds("owner_authority_gate_001"),
  });

  const workflow = executeCanonicalProposalWorkflow({
    proposal: intake.proposal,
    existing_canon_records: [],
    now,
    actor: "system:test",
    ratification_id: "rat_owner_authority_gate_001",
    diagnostic_id: "diag_owner_authority_gate_001",
    canonical_id: "mem_owner_authority_gate_001",
  });

  assert.equal(workflow.accepted, false);
  assert.equal(workflow.ratification_record.decision, "deferred");
  assert.ok(
    workflow.gate_results.some((gate) => gate.gate === "policy" && gate.reason_code === "owner_ratification_required" && !gate.passed),
  );
  assert.equal(workflow.diagnostic?.code, "proposal_deferred");
});

test("contradiction baseline emits an explicit world contradiction object", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers.",
    source_record: {
      id: "src_contra_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session#turn-contra-001",
      },
      content_ref: "raw/sources/turn-contra-001.json",
    },
    ids: buildIds("contra_001"),
  });

  const contradiction = detectWorldClaimContradiction({
    now,
    contradiction_id: "contra_001",
    candidate_claim: intake.world_claim,
    existing_world_claims: [
      {
        ...intake.world_claim,
        id: "wcl_existing_001",
        statement: "The user prefers exhaustive answers.",
      },
    ],
  });

  assert.equal(contradiction?.status, "open");
  assert.equal(contradiction?.left_ref.id, "wcl_existing_001");
  assert.equal(contradiction?.right_ref.id, intake.world_claim.id);
});

test("contradiction detection ignores statement differences that only vary by normalization", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers.",
    source_record: {
      id: "src_contra_normalized_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session#turn-contra-normalized-001",
      },
      content_ref: "raw/sources/turn-contra-normalized-001.json",
    },
    ids: buildIds("contra_normalized_001"),
  });

  const conflict = findConflictingWorldClaim(intake.world_claim, [
    {
      ...intake.world_claim,
      id: "wcl_existing_normalized_001",
      statement: "  the user   prefers concise answers.  ",
    },
  ]);

  assert.equal(conflict, undefined);
});

test("contradiction handling can propose and apply a richer resolution path", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers.",
    source_record: {
      id: "src_resolution_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session#turn-resolution-001",
      },
      content_ref: "raw/sources/turn-resolution-001.json",
    },
    ids: buildIds("resolution_001"),
  });

  const existing = {
    ...intake.world_claim,
    id: "wcl_existing_resolution_001",
    statement: "The user prefers exhaustive answers.",
    temporal_state: {
      temporal_status: "active" as const,
      valid_from: "2026-04-01T00:00:00.000Z",
      valid_to: null,
    },
  };
  const contradiction = detectWorldClaimContradiction({
    now,
    contradiction_id: "contra_resolution_001",
    candidate_claim: {
      ...intake.world_claim,
      temporal_state: {
        temporal_status: "active",
        valid_from: "2026-04-12T00:00:00.000Z",
        valid_to: null,
      },
    },
    existing_world_claims: [existing],
  });

  assert.ok(contradiction);

  const resolution = proposeContradictionResolution({
    now,
    resolution_id: "cres_resolution_001",
    contradiction: contradiction!,
    existing_claim: existing,
    candidate_claim: intake.world_claim,
  });

  const applied = applyContradictionResolution({
    now,
    contradiction: contradiction!,
    resolution: {
      ...resolution,
      strategy: "coexist_temporally",
      status: "accepted",
    },
    existing_claim: existing,
    candidate_claim: intake.world_claim,
  });

  assert.equal(resolution.status, "proposed");
  assert.equal(applied.contradiction.status, "resolved");
  assert.equal(applied.existing_claim.temporal_state?.temporal_status, "historical");
  assert.equal(applied.existing_claim.temporal_state?.valid_to, "2026-04-12T00:00:00.000Z");
});

test("accepted contradiction resolution requires an explicit acceptance transition", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers.",
    source_record: {
      id: "src_resolution_acceptance_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session#turn-resolution-acceptance-001",
      },
      content_ref: "raw/sources/turn-resolution-acceptance-001.json",
    },
    ids: buildIds("resolution_acceptance_001"),
  });

  const existing = {
    ...intake.world_claim,
    id: "wcl_existing_resolution_acceptance_001",
    statement: "The user prefers exhaustive answers.",
    temporal_state: {
      temporal_status: "active" as const,
      valid_from: "2026-04-01T00:00:00.000Z",
      valid_to: null,
    },
  };
  const contradiction = detectWorldClaimContradiction({
    now,
    contradiction_id: "contra_resolution_acceptance_001",
    candidate_claim: intake.world_claim,
    existing_world_claims: [existing],
  });

  assert.ok(contradiction);

  const resolution = proposeContradictionResolution({
    now,
    resolution_id: "cres_resolution_acceptance_001",
    contradiction: contradiction!,
    existing_claim: existing,
    candidate_claim: intake.world_claim,
  });

  assert.throws(
    () =>
      applyAcceptedContradictionResolution({
        now,
        contradiction: contradiction!,
        resolution,
        existing_claim: existing,
        candidate_claim: intake.world_claim,
      }),
    /Only accepted contradiction resolutions can be applied/,
  );

  const accepted = acceptContradictionResolution({
    now,
    resolution,
  });

  const applied = applyAcceptedContradictionResolution({
    now,
    contradiction: contradiction!,
    resolution: accepted,
    existing_claim: existing,
    candidate_claim: intake.world_claim,
  });

  assert.equal(accepted.status, "accepted");
  assert.equal(applied.resolution.status, "applied");
});

test("accepted contradiction resolution rejects mismatched contradiction participants", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers.",
    source_record: {
      id: "src_resolution_mismatch_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session#turn-resolution-mismatch-001",
      },
      content_ref: "raw/sources/turn-resolution-mismatch-001.json",
    },
    ids: buildIds("resolution_mismatch_001"),
  });

  const existing = {
    ...intake.world_claim,
    id: "wcl_existing_resolution_mismatch_001",
    statement: "The user prefers exhaustive answers.",
    temporal_state: {
      temporal_status: "active" as const,
      valid_from: "2026-04-01T00:00:00.000Z",
      valid_to: null,
    },
  };
  const contradiction = detectWorldClaimContradiction({
    now,
    contradiction_id: "contra_resolution_mismatch_001",
    candidate_claim: intake.world_claim,
    existing_world_claims: [existing],
  });

  assert.ok(contradiction);

  const accepted = acceptContradictionResolution({
    now,
    resolution: proposeContradictionResolution({
      now,
      resolution_id: "cres_resolution_mismatch_001",
      contradiction: contradiction!,
      existing_claim: existing,
      candidate_claim: intake.world_claim,
    }),
  });

  assert.throws(
    () =>
      applyAcceptedContradictionResolution({
        now,
        contradiction: contradiction!,
        resolution: accepted,
        existing_claim: {
          ...existing,
          id: "wcl_existing_resolution_mismatch_other",
        },
        candidate_claim: intake.world_claim,
      }),
    /Contradiction refs do not match the provided existing_claim and candidate_claim/,
  );
});

test("accepted contradiction resolution rejects winning and losing refs that do not match the selected strategy", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers.",
    source_record: {
      id: "src_resolution_strategy_001",
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: {
        privacy_scope: "owner_private",
      },
      provenance: {
        source_type: "conversation",
        source_ref: "runtime/session#turn-resolution-strategy-001",
      },
      content_ref: "raw/sources/turn-resolution-strategy-001.json",
    },
    ids: buildIds("resolution_strategy_001"),
  });

  const existing = {
    ...intake.world_claim,
    id: "wcl_existing_resolution_strategy_001",
    statement: "The user prefers exhaustive answers.",
    temporal_state: {
      temporal_status: "active" as const,
      valid_from: "2026-04-01T00:00:00.000Z",
      valid_to: null,
    },
  };
  const contradiction = detectWorldClaimContradiction({
    now,
    contradiction_id: "contra_resolution_strategy_001",
    candidate_claim: intake.world_claim,
    existing_world_claims: [existing],
  });

  assert.ok(contradiction);

  const accepted = acceptContradictionResolution({
    now,
    resolution: {
      ...proposeContradictionResolution({
        now,
        resolution_id: "cres_resolution_strategy_001",
        contradiction: contradiction!,
        existing_claim: existing,
        candidate_claim: intake.world_claim,
      }),
      winning_ref: {
        id: existing.id,
        kind: existing.kind,
        layer: existing.layer,
      },
      losing_ref: {
        id: intake.world_claim.id,
        kind: intake.world_claim.kind,
        layer: intake.world_claim.layer,
      },
    },
  });

  assert.throws(
    () =>
      applyAcceptedContradictionResolution({
        now,
        contradiction: contradiction!,
        resolution: accepted,
        existing_claim: existing,
        candidate_claim: intake.world_claim,
      }),
    /Resolution winning_ref does not match claim/,
  );
});

test("accepted contradiction resolution compiles into projection with explicit historical trace", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers.",
    source_record: {
      id: "src_resolution_projection_001",
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
        source_ref: "runtime/session#turn-resolution-projection-001",
      },
      content_ref: "raw/sources/turn-resolution-projection-001.json",
    },
    ids: buildIds("resolution_projection_001"),
  });

  const existing = {
    ...intake.world_claim,
    id: "wcl_existing_resolution_projection_001",
    statement: "The user prefers exhaustive answers.",
    temporal_state: {
      temporal_status: "active" as const,
      valid_from: "2026-04-01T00:00:00.000Z",
      valid_to: null,
    },
  };
  const contradiction = detectWorldClaimContradiction({
    now,
    contradiction_id: "contra_resolution_projection_001",
    candidate_claim: intake.world_claim,
    existing_world_claims: [existing],
  });

  assert.ok(contradiction);

  const resolution = proposeContradictionResolution({
    now,
    resolution_id: "cres_resolution_projection_001",
    contradiction: contradiction!,
    existing_claim: existing,
    candidate_claim: intake.world_claim,
  });

  const applied = applyAcceptedContradictionResolution({
    now,
    contradiction: contradiction!,
    resolution: acceptContradictionResolution({
      now,
      resolution,
    }),
    existing_claim: existing,
    candidate_claim: intake.world_claim,
  });

  const projection = executeOpenClawBootstrapWorkflow({
    now,
    visibility_state: intake.world_claim.visibility_state,
    canonical_records: [],
    world_claims: [applied.existing_claim, applied.candidate_claim],
    episodes: [intake.episode],
    entities: [intake.subject_entity, intake.preference_entity],
    relations: [intake.preference_relation],
    contradictions: [applied.contradiction],
    contradiction_resolutions: [applied.resolution],
    wiki_pages: [intake.wiki_page],
    wiki_claims: [intake.wiki_claim],
    ids: {
      canon_artifact: "part_openclaw_canon_resolution_projection_001",
      world_artifact: "part_openclaw_world_resolution_projection_001",
      wiki_artifact: "part_openclaw_wiki_resolution_projection_001",
      manifest: "pmf_openclaw_resolution_projection_001",
    },
  });

  assert.match(projection.markdown, /\[contradiction:contra_resolution_projection_001\] \(resolved\)/);
  assert.match(projection.markdown, /\[contradiction-resolution:cres_resolution_projection_001\] \(applied\) coexist_temporally/);
  assert.match(projection.markdown, /## World Trace/);
  assert.match(projection.markdown, /\[world:wcl_existing_resolution_projection_001\] \(disputed; historical\)/);
  assert.match(projection.markdown, /\[world:wcl_resolution_projection_001\] \(inferred; active\)/);
  const activeWorldSection = projection.markdown.split("## World Trace")[0] ?? projection.markdown;
  assert.ok(!activeWorldSection.includes("[world:wcl_existing_resolution_projection_001]"));
});

test("validation rejects disposition refs without matching outcomes", () => {
  const issues = validateCoreRecord({
    id: "disp_invalid_001",
    kind: "disposition_record",
    layer: "governance",
    authoritative_home: "governance",
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: "runtime/session#turn-invalid-disp",
    },
    input_refs: ["obs_invalid_001"],
    outcomes: ["world_update"],
    target_layers: ["world"],
    proposal_refs: ["prop_invalid_001"],
    reason_codes: ["invalid_mapping"],
  });

  assert.ok(issues.some((issue) => issue.path === "proposal_refs"));
});
