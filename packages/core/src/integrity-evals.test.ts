import assert from "node:assert/strict";
import test from "node:test";

import { runCoreIntegrityEvals } from "./evals.js";
import type { CanonicalMemoryObject } from "./types.js";
import { validateCoreRecord } from "./validation.js";
import {
  applyAcceptedContradictionResolution,
  buildConversationPreferenceIntake,
  detectWorldClaimContradiction,
  executeOpenClawBootstrapWorkflow,
  proposeContradictionResolution,
} from "./workflow-engine/pipeline.js";

test("core integrity eval harness passes the baseline identity-aware preference flow", () => {
  const now = "2026-04-12T00:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers unless they explicitly ask for depth.",
    source_record: {
      id: "src_eval_001",
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
        source_ref: "runtime/session-eval#turn-001",
      },
      content_ref: "raw/sources/eval-001.json",
    },
    identity_context: {
      runtime: "openclaw",
      ids: {
        agent_identity: "actor_agent_eval_001",
        owner_identity: "actor_owner_eval_001",
        runtime_instance: "runtime_eval_001",
        runtime_session: "session_eval_001",
        conversation_thread: "thread_eval_001",
      },
      agent_label: "Cristalina Eval Agent",
      owner_label: "Eval Owner",
      session_objective: "Integrity eval",
      session_summary: "Eval session",
      message_refs: ["msg_eval_001"],
      thread_summary: "Eval thread",
    },
    ids: {
      observation: "obs_eval_001",
      episode: "ep_eval_001",
      subject_entity: "ent_subject_eval_001",
      preference_entity: "ent_preference_eval_001",
      preference_relation: "rel_preference_eval_001",
      world_claim: "wcl_eval_001",
      wiki_page: "wpg_eval_001",
      wiki_claim: "wclm_eval_001",
      proposal: "prop_eval_001",
      disposition: "disp_eval_001",
    },
  });

  const canonical_record: CanonicalMemoryObject = {
    id: "mem_eval_001",
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
      source_ref: "runtime/session-eval#turn-001",
      evidence_refs: [intake.observation.id, intake.world_claim.id],
    },
    statement: intake.world_claim.statement,
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

  const projection = executeOpenClawBootstrapWorkflow({
    now,
    visibility_state: canonical_record.visibility_state,
    canonical_records: [canonical_record],
    world_claims: [intake.world_claim],
    episodes: [intake.episode],
    entities: [intake.subject_entity, intake.preference_entity],
    relations: [intake.preference_relation],
    wiki_pages: [intake.wiki_page],
    wiki_claims: [intake.wiki_claim],
    runtime_identity: {
      actor_identity: intake.agent_identity,
      owner_identity: intake.owner_identity,
      runtime_instance: intake.runtime_instance,
      runtime_session: intake.runtime_session,
      conversation_thread: intake.conversation_thread,
    },
    identity_context: {
      actor_identity_ref: intake.agent_identity?.id ?? null,
      runtime_instance_ref: intake.runtime_instance?.id ?? null,
      runtime_session_ref: intake.runtime_session?.id ?? null,
      conversation_thread_ref: intake.conversation_thread?.id ?? null,
    },
    ids: {
      canon_artifact: "part_openclaw_canon_eval_001",
      world_artifact: "part_openclaw_world_eval_001",
      wiki_artifact: "part_openclaw_wiki_eval_001",
      manifest: "pmf_openclaw_eval_001",
    },
  });

  const results = runCoreIntegrityEvals({
    observationIssues: validateCoreRecord(intake.observation),
    worldIssues: [
      ...validateCoreRecord(intake.episode),
      ...validateCoreRecord(intake.subject_entity),
      ...validateCoreRecord(intake.preference_entity),
      ...validateCoreRecord(intake.preference_relation),
      ...validateCoreRecord(intake.world_claim),
    ],
    wikiIssues: [
      ...validateCoreRecord(intake.wiki_page),
      ...validateCoreRecord(intake.wiki_claim),
    ],
    canonIssues: validateCoreRecord(canonical_record),
    governanceIssues: [],
    projectionMarkdown: projection.markdown,
  });

  assert.equal(results.length, 5);
  assert.ok(results.every((result) => result.passed), JSON.stringify(results, null, 2));
});

test("core integrity eval harness passes an applied contradiction-resolution flow without collapsing layers", () => {
  const now = "2026-04-12T01:00:00.000Z";
  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers by default.",
    source_record: {
      id: "src_eval_002",
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
        source_ref: "runtime/session-eval#turn-002",
      },
      content_ref: "raw/sources/eval-002.json",
    },
    ids: {
      observation: "obs_eval_002",
      episode: "ep_eval_002",
      subject_entity: "ent_subject_eval_002",
      preference_entity: "ent_preference_eval_002",
      preference_relation: "rel_preference_eval_002",
      world_claim: "wcl_eval_002",
      wiki_page: "wpg_eval_002",
      wiki_claim: "wclm_eval_002",
      proposal: "prop_eval_002",
      disposition: "disp_eval_002",
    },
  });

  const existing_world_claim = {
    ...intake.world_claim,
    id: "wcl_eval_existing_002",
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    statement: "The user prefers exhaustive answers by default.",
    temporal_state: {
      temporal_status: "active" as const,
      valid_from: "2026-04-01T00:00:00.000Z",
      valid_to: null,
    },
  };

  const contradiction = detectWorldClaimContradiction({
    now,
    contradiction_id: "contra_eval_002",
    candidate_claim: intake.world_claim,
    existing_world_claims: [existing_world_claim],
  });
  assert.ok(contradiction);

  const proposed_resolution = proposeContradictionResolution({
    now,
    resolution_id: "cres_eval_002",
    contradiction: contradiction!,
    existing_claim: existing_world_claim,
    candidate_claim: intake.world_claim,
  });

  const applied = applyAcceptedContradictionResolution({
    now,
    contradiction: contradiction!,
    resolution: proposed_resolution,
    existing_claim: existing_world_claim,
    candidate_claim: intake.world_claim,
  });

  const canonical_record: CanonicalMemoryObject = {
    id: "mem_eval_002",
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
      source_ref: "runtime/session-eval#turn-002",
      evidence_refs: [intake.observation.id, intake.world_claim.id],
    },
    statement: intake.world_claim.statement,
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

  const projection = executeOpenClawBootstrapWorkflow({
    now,
    visibility_state: canonical_record.visibility_state,
    canonical_records: [canonical_record],
    world_claims: [applied.existing_claim, applied.candidate_claim],
    episodes: [intake.episode],
    entities: [intake.subject_entity, intake.preference_entity],
    relations: [intake.preference_relation],
    contradictions: [applied.contradiction],
    contradiction_resolutions: [applied.resolution],
    wiki_pages: [intake.wiki_page],
    wiki_claims: [intake.wiki_claim],
    ids: {
      canon_artifact: "part_openclaw_canon_eval_002",
      world_artifact: "part_openclaw_world_eval_002",
      wiki_artifact: "part_openclaw_wiki_eval_002",
      manifest: "pmf_openclaw_eval_002",
    },
  });

  const results = runCoreIntegrityEvals({
    observationIssues: validateCoreRecord(intake.observation),
    worldIssues: [
      ...validateCoreRecord(intake.episode),
      ...validateCoreRecord(intake.subject_entity),
      ...validateCoreRecord(intake.preference_entity),
      ...validateCoreRecord(intake.preference_relation),
      ...validateCoreRecord(applied.existing_claim),
      ...validateCoreRecord(applied.candidate_claim),
      ...validateCoreRecord(applied.contradiction),
    ],
    wikiIssues: [
      ...validateCoreRecord(intake.wiki_page),
      ...validateCoreRecord(intake.wiki_claim),
    ],
    canonIssues: validateCoreRecord(canonical_record),
    governanceIssues: validateCoreRecord(applied.resolution),
    projectionMarkdown: projection.markdown,
  });

  assert.equal(results.length, 5);
  assert.ok(results.every((result) => result.passed), JSON.stringify(results, null, 2));
  assert.match(projection.markdown, /\[contradiction-resolution:cres_eval_002\] \(applied\) coexist_temporally/);
  assert.match(projection.markdown, /\[world:wcl_eval_existing_002\] \(disputed; historical\)/);
});
