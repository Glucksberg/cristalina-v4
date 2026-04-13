import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOpenClawPreferenceFeedbackIntake,
  buildConversationPreferenceDispositionRecord,
  buildConversationPreferenceIntake,
  detectWorldClaimContradiction,
  executeCanonicalProposalWorkflow,
  executeOpenClawBootstrapWorkflow,
  reconcileConversationPreferenceSupersede,
} from "./pipeline.js";
import { isLegalLayerTransition } from "../transitions.js";
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
        privacy_scope: "owner_private",
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
    identity_context: buildIdentityContext("test_003"),
    ids: buildIds("test_003"),
  });

  assert.equal(intake.observation.provenance.source_ref, "runtime/session-test#turn-003");
  assert.equal(intake.observation.runtime_instance_ref, "runtime_test_003");
  assert.equal(intake.episode.observation_refs[0], intake.observation.id);
  assert.equal(intake.preference_relation.subject_ref.id, intake.subject_entity.id);
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
  assert.equal(projection.manifest.runtime_instance_ref, intake.runtime_instance?.id);
  assert.equal(projection.manifest.runtime_session_ref, intake.runtime_session?.id);
  assert.equal(projection.manifest.conversation_thread_ref, intake.conversation_thread?.id);
  assert.deepEqual(projection.manifest.diagnostic_refs, ["diag_test_004"]);
  assert.match(projection.markdown, /\(disputed; historical\)/);
  assert.match(projection.markdown, /\(editorial\)/);
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
