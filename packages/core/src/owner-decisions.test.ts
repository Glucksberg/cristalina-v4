import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadProjectionManifests, writeCoreRecord } from "./store/io.js";
import { applyOwnerDecision, listOwnerDecisionRequests } from "./owner-decisions.js";
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

test("owner decision ratify dry-run previews canon writes without changing the queue", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-owner-decision-ratify-"));
  const proposal: Proposal = {
    id: "prop_owner_decision_ratify_001",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("memory-maturation/hermes/run_002/claim_001"),
    operation: "create",
    candidate_kind: "belief",
    target_layer: "canon",
    target_ref: null,
    candidate_payload: {
      kind: "belief",
      statement: "Memory poisoning is a persistent-agent risk.",
      semantic_slot: "agent_memory.security.memory_poisoning_and_agent_traps",
      epistemic_state: "observed",
      temporal_state: { temporal_status: "active", valid_from: now, valid_to: null },
      support_refs: ["obs_owner_decision_ratify_001"],
    },
    reason: "Owner authority is required for this security principle.",
    evidence_refs: ["src_owner_decision_ratify_001", "obs_owner_decision_ratify_001"],
    subject_authority_role: "owner",
    promotion_requirement: "owner_ratification_required",
    governance_state: "proposed",
  };
  const packet: CurationPacket = {
    id: "cur_owner_decision_ratify_001",
    kind: "curation_packet",
    layer: "governance",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("memory-maturation/hermes/run_002/claim_001"),
    proposal_refs: [proposal.id],
    question_count: 1,
    review_kind: "owner_ratification",
    canonical_target_ref: { id: "mem_owner_decision_ratify_001", kind: "belief", layer: "canon" },
    status: "pending",
  };
  await Promise.all([writeCoreRecord(rootDir, proposal), writeCoreRecord(rootDir, packet)]);

  const preview = await applyOwnerDecision({
    rootDir,
    proposal_ref: proposal.id,
    action: "ratify",
    now,
    actor: "actor_owner_001",
    reason: "Owner ratified this security risk.",
    dry_run: true,
  });

  assert.equal(preview.status, "dry_run");
  assert.equal(preview.records.canonical_record?.semantic_slot, "agent_memory.security.memory_poisoning_and_agent_traps");
  assert.ok(preview.created_refs.some((ref) => ref.startsWith("mem_")));
  assert.equal((await listOwnerDecisionRequests({ rootDir })).owner_decisions.length, 0);
});

test("owner decision ratify handles revise proposals with an explicit canon target", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-owner-decision-revise-"));
  const existingCanon: CanonicalMemoryObject = {
    id: "mem_owner_decision_revise_existing_001",
    kind: "belief",
    layer: "canon",
    authoritative_home: "canon",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("tests/existing-revise-canon"),
    statement: "Memory lifecycle needs governance.",
    semantic_slot: "agent_memory.governance.lifecycle_as_compliance_surface",
    epistemic_state: "confirmed",
    temporal_state: { temporal_status: "active", valid_from: now, valid_to: null },
    governance_state: "ratified",
  };
  const proposal: Proposal = {
    id: "prop_owner_decision_revise_001",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("memory-maturation/hermes/run_revise/claim_001"),
    operation: "revise",
    candidate_kind: "belief",
    target_layer: "canon",
    target_ref: { id: existingCanon.id, kind: existingCanon.kind, layer: existingCanon.layer },
    candidate_payload: {
      kind: "belief",
      statement: "Memory lifecycle is a compliance and trust surface.",
      semantic_slot: existingCanon.semantic_slot,
      epistemic_state: "confirmed",
      temporal_state: { temporal_status: "active", valid_from: now, valid_to: null },
      support_refs: ["obs_owner_decision_revise_001"],
    },
    reason: "Owner authority is required for this revised governance claim.",
    evidence_refs: ["src_owner_decision_revise_001", "obs_owner_decision_revise_001"],
    subject_authority_role: "owner",
    promotion_requirement: "owner_ratification_required",
    governance_state: "proposed",
  };
  await Promise.all([writeCoreRecord(rootDir, existingCanon), writeCoreRecord(rootDir, proposal)]);

  const result = await applyOwnerDecision({
    rootDir,
    proposal_ref: proposal.id,
    action: "ratify",
    now,
    actor: "actor_owner_001",
    reason: "Owner ratified the revised claim.",
    dry_run: true,
  });

  assert.equal(result.status, "dry_run");
  assert.equal(result.records.canonical_record?.statement, "Memory lifecycle is a compliance and trust surface.");
  assert.deepEqual(result.updated_refs, [existingCanon.id]);
});

test("owner decision ratify rejects revise proposals without a matching canon target", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-owner-decision-revise-missing-"));
  const proposal: Proposal = {
    id: "prop_owner_decision_revise_missing_001",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("memory-maturation/hermes/run_revise_missing/claim_001"),
    operation: "revise",
    candidate_kind: "belief",
    target_layer: "canon",
    target_ref: { id: "mem_missing_target", kind: "belief", layer: "canon" },
    candidate_payload: {
      kind: "belief",
      statement: "Memory lifecycle is a compliance and trust surface.",
      semantic_slot: "agent_memory.governance.lifecycle_as_compliance_surface",
      epistemic_state: "confirmed",
      temporal_state: { temporal_status: "active", valid_from: now, valid_to: null },
      support_refs: ["obs_owner_decision_revise_missing_001"],
    },
    reason: "Owner authority is required for this revised governance claim.",
    evidence_refs: ["src_owner_decision_revise_missing_001", "obs_owner_decision_revise_missing_001"],
    subject_authority_role: "owner",
    promotion_requirement: "owner_ratification_required",
    governance_state: "proposed",
  };
  await writeCoreRecord(rootDir, proposal);

  const result = await applyOwnerDecision({
    rootDir,
    proposal_ref: proposal.id,
    action: "ratify",
    now,
    actor: "actor_owner_001",
    reason: "Owner ratified the revised claim.",
  });

  assert.equal(result.status, "rejected_by_validation");
  assert.match(result.warnings[0] ?? "", /requires a target_ref/);
});

test("owner decision apply refreshes the Hermes recognition projection", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-owner-decision-projection-"));
  const proposal: Proposal = {
    id: "prop_owner_decision_projection_001",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("memory-maturation/hermes/run_projection/claim_001"),
    operation: "create",
    candidate_kind: "belief",
    target_layer: "canon",
    target_ref: null,
    candidate_payload: {
      kind: "belief",
      statement: "Owner decisions must refresh provider-facing projections.",
      semantic_slot: "cristalina.governance.owner_decision_projection_refresh",
      epistemic_state: "confirmed",
      temporal_state: { temporal_status: "active", valid_from: now, valid_to: null },
      support_refs: ["obs_owner_decision_projection_001"],
    },
    reason: "Projection visibility must follow owner decisions.",
    evidence_refs: ["src_owner_decision_projection_001", "obs_owner_decision_projection_001"],
    subject_authority_role: "owner",
    promotion_requirement: "owner_ratification_required",
    governance_state: "proposed",
  };
  await writeCoreRecord(rootDir, proposal);

  const result = await applyOwnerDecision({
    rootDir,
    proposal_ref: proposal.id,
    action: "ratify",
    now,
    actor: "actor_owner_001",
    reason: "Owner ratified projection refresh behavior.",
  });

  const manifests = await loadProjectionManifests(rootDir);
  assert.equal(result.records.projection_manifest?.adapter, "hermes");
  assert.equal(result.records.projection_manifest?.audience, "memory_provider");
  assert.equal(manifests.some((manifest) => manifest.id === result.records.projection_manifest?.id), true);

  const replay = await applyOwnerDecision({
    rootDir,
    proposal_ref: proposal.id,
    action: "ratify",
    now,
    actor: "actor_owner_001",
    reason: "Owner ratified projection refresh behavior.",
  });
  assert.equal(replay.status, "already_applied");
  assert.equal(replay.records.projection_manifest?.adapter, "hermes");
});

test("owner decision subsume links a proposal to existing canon and removes it from active decisions", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-owner-decision-subsume-"));
  const proposal: Proposal = {
    id: "prop_owner_decision_subsume_001",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("memory-maturation/hermes/run_003/claim_001"),
    operation: "create",
    candidate_kind: "belief",
    target_layer: "canon",
    target_ref: null,
    candidate_payload: {
      kind: "belief",
      statement: "Retrieval and ranking matter more than storage volume.",
      semantic_slot: "agent_memory.recall_quality.retrieval_ranking_not_storage_only",
      epistemic_state: "inferred",
      temporal_state: { temporal_status: "active", valid_from: now, valid_to: null },
      support_refs: ["obs_owner_decision_subsume_001"],
    },
    reason: "Owner authority is required because a related canon exists.",
    evidence_refs: ["src_owner_decision_subsume_001", "obs_owner_decision_subsume_001"],
    subject_authority_role: "owner",
    promotion_requirement: "owner_ratification_required",
    governance_state: "proposed",
  };
  const packet: CurationPacket = {
    id: "cur_owner_decision_subsume_001",
    kind: "curation_packet",
    layer: "governance",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("memory-maturation/hermes/run_003/claim_001"),
    proposal_refs: [proposal.id],
    question_count: 1,
    review_kind: "owner_ratification",
    canonical_target_ref: { id: "mem_owner_decision_subsume_001", kind: "belief", layer: "canon" },
    status: "pending",
  };
  const existingCanon: CanonicalMemoryObject = {
    id: "mem_existing_recall_quality_001",
    kind: "belief",
    layer: "canon",
    authoritative_home: "canon",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("tests/existing-recall-canon"),
    statement: "Agent memory quality depends on retrieval and ranking.",
    semantic_slot: "agent_memory.recall_quality.retrieval_ranking_not_storage_only",
    epistemic_state: "confirmed",
    temporal_state: { temporal_status: "active" },
    governance_state: "ratified",
  };
  await Promise.all([
    writeCoreRecord(rootDir, proposal),
    writeCoreRecord(rootDir, packet),
    writeCoreRecord(rootDir, existingCanon),
  ]);

  const result = await applyOwnerDecision({
    rootDir,
    proposal_ref: proposal.id,
    action: "subsume",
    target_canon_ref: existingCanon.id,
    now,
    actor: "actor_owner_001",
    reason: "Covered by existing recall-quality canon.",
  });

  assert.equal(result.status, "applied");
  assert.deepEqual(result.linked_refs, [existingCanon.id]);
  assert.equal(result.records.curation_packet?.status, "answered");
  assert.equal(result.records.disposition?.owner_decision_action, "subsume");
  assert.equal(result.records.disposition?.target_canon_ref, existingCanon.id);
  assert.equal((await listOwnerDecisionRequests({ rootDir })).owner_decisions.length, 0);
});

test("owner decision move_to_wiki preserves planning material outside canon", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-owner-decision-wiki-"));
  const proposal: Proposal = {
    id: "prop_owner_decision_wiki_001",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("memory-maturation/hermes/run_004/claim_001"),
    operation: "create",
    candidate_kind: "goal",
    target_layer: "canon",
    target_ref: null,
    candidate_payload: {
      kind: "goal",
      statement: "Build a BEAM-style benchmark plan for governed memory.",
      semantic_slot: "cristalina_beam_governed_memory_benchmark_plan",
      epistemic_state: "observed",
      temporal_state: { temporal_status: "active", valid_from: now, valid_to: null },
      support_refs: ["obs_owner_decision_wiki_001"],
    },
    reason: "Owner wants this preserved as planning material.",
    evidence_refs: ["src_owner_decision_wiki_001", "obs_owner_decision_wiki_001"],
    subject_authority_role: "owner",
    promotion_requirement: "owner_ratification_required",
    governance_state: "proposed",
  };
  await writeCoreRecord(rootDir, proposal);

  const result = await applyOwnerDecision({
    rootDir,
    proposal_ref: proposal.id,
    action: "move_to_wiki",
    wiki_page: "wpg_cristalina_beam_governed_memory_benchmark_plan",
    now,
    actor: "actor_owner_001",
    reason: "Useful plan/reference, not canon.",
  });

  assert.equal(result.status, "applied");
  assert.equal(result.records.wiki_page?.id, "wpg_cristalina_beam_governed_memory_benchmark_plan");
  assert.equal(result.records.wiki_claim?.claim_status, "editorial");
  assert.equal(result.records.disposition?.wiki_page_ref, "wpg_cristalina_beam_governed_memory_benchmark_plan");
  assert.equal((await listOwnerDecisionRequests({ rootDir })).owner_decisions.length, 0);
});
