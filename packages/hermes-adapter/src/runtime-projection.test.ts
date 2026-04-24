import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createHermesProjectionFixture,
} from "../../core/dist/test-support/projection-fixtures.js";
import {
  buildConversationPreferenceFlowInput,
  type ConversationPreferenceFlowInputFixtureInput,
} from "../../core/dist/test-support/conversation-preference-fixtures.js";
import {
  compileOpenClawBootstrapProjection,
  initializeStore,
  listProjectionRuntimeViews,
  writeCoreRecord,
  type Diagnostic,
} from "../../core/dist/index.js";
import {
  buildSymbolicRetrievalFixture,
} from "../../core/dist/test-support/symbolic-retrieval-fixtures.js";

import {
  listHermesProjectionRuntimeViews,
  loadHermesProjectionRuntimeView,
  loadLatestHermesProjectionRuntimeView,
} from "./runtime-projection.js";
import {
  ratifyHermesQueuedConversationPreference,
  writeHermesConversationPreferenceToStore,
  writeHermesProjectionFeedbackToStore,
  type HermesAuthenticatedPrincipal,
  type HermesConversationPreferenceWriteInput,
} from "./writeback.js";

function buildHermesWriteInput(
  input: ConversationPreferenceFlowInputFixtureInput & {
    authenticated_principal: HermesAuthenticatedPrincipal;
  },
): HermesConversationPreferenceWriteInput {
  const storeInput = buildConversationPreferenceFlowInput(input);
  const {
    authenticated_principal: _authenticated_principal,
    intake_kind: _intake_kind,
    source: storeSource,
    ...rest
  } = storeInput;
  const { runtime: _runtime, ...source } = storeSource;

  return {
    ...rest,
    authenticated_principal: input.authenticated_principal,
    source,
  };
}

test("Hermes adapter lists and loads pending projection reviews", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-hermes-adapter-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const fixture = await createHermesProjectionFixture(rootDir, {
    now: "2026-04-16T03:00:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_adapter_test_001",
    diagnostic_id: "diag_hermes_adapter_test_001",
    review_id: "cur_hermes_adapter_test_001",
    proposal_ref: "prop_hermes_adapter_test_001",
    markdown_heading: "Hermes Runtime Memory",
    diagnostic_message: "Hermes adapter test review is pending owner authority.",
    provenance_source_ref: "tests/hermes-adapter/runtime-projection",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "2026-04-16.group-interaction",
    owner_identity_ref: "actor_owner_hermes_adapter_test_001",
    runtime_instance_ref: "runtime_hermes_adapter_test_001",
    runtime_session_ref: "session_hermes_adapter_test_001",
    conversation_thread_ref: "thread_hermes_adapter_test_001",
    markdown_artifact_id: "part_hermes_adapter_test_001",
    canon_artifact_id: "part_hermes_adapter_test_002",
  });
  const summaries = await listHermesProjectionRuntimeViews(rootDir);

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]!.manifest_id, fixture.manifest.id);
  assert.equal(summaries[0]!.diagnostic_count, 1);
  assert.equal(summaries[0]!.review_count, 1);
  assert.equal(summaries[0]!.pending_review_count, 1);

  const latest = await loadLatestHermesProjectionRuntimeView(rootDir, {
    consistency_requirement: "allow_mixed_state",
  });
  assert.ok(latest);
  assert.equal(latest!.manifest.id, fixture.manifest.id);
  assert.equal(latest!.pending_reviews.length, 1);
  assert.equal(latest!.closed_reviews.length, 0);
  assert.equal(latest!.reviews[0]!.status, "pending");
  assert.match(latest!.markdown, /## Review Queue/);
  assert.match(latest!.markdown, /\[review:cur_hermes_adapter_test_001\]/);
});

test("Hermes adapter exposes core retrieval context without redefining retrieval law", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-hermes-adapter-retrieval-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const now = "2026-04-21T00:00:00.000Z";
  const fixture = buildSymbolicRetrievalFixture();
  const diagnostic: Diagnostic = {
    id: "diag_hermes_adapter_retrieval_001",
    kind: "diagnostic",
    layer: "audits",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state: {
      privacy_scope: "shareable",
    },
    provenance: {
      source_type: "test_fixture",
      source_ref: "tests/hermes-adapter/retrieval-context",
      evidence_refs: ["candidate_wiki_symbolic_001"],
    },
    code: "retrieval_recipe_partial",
    severity: "warning",
    message: "Hermes adapter received suppressed retrieval context from the core projection manifest.",
    related_refs: ["candidate_wiki_symbolic_001"],
  };
  const projectionPath = "derived/hermes/pmf_hermes_adapter_retrieval_001/bootstrap-memory.md";
  const projection = compileOpenClawBootstrapProjection({
    adapter: "hermes",
    now,
    visibility_state: {
      privacy_scope: "shareable",
    },
    projection_path: projectionPath,
    canonical_records: [fixture.canonical_record],
    world_claims: [fixture.world_claim],
    wiki_pages: [fixture.wiki_page],
    wiki_claims: [fixture.wiki_claim],
    diagnostics: [diagnostic],
    retrieval_results: [fixture.retrieval_result],
    ids: {
      canon_artifact: "part_hermes_adapter_retrieval_canon_001",
      world_artifact: "part_hermes_adapter_retrieval_world_001",
      wiki_artifact: "part_hermes_adapter_retrieval_wiki_001",
      manifest: "pmf_hermes_adapter_retrieval_001",
    },
  });

  await initializeStore(rootDir, now);
  await mkdir(join(rootDir, "derived/hermes/pmf_hermes_adapter_retrieval_001"), { recursive: true });
  await writeFile(join(rootDir, projectionPath), projection.markdown, "utf8");
  await Promise.all([
    ...projection.artifacts.map((artifact) => writeCoreRecord(rootDir, artifact)),
    writeCoreRecord(rootDir, diagnostic),
    writeCoreRecord(rootDir, projection.manifest),
  ]);

  const latest = await loadLatestHermesProjectionRuntimeView(rootDir, {
    consistency_requirement: "allow_mixed_state",
  });

  assert.ok(latest);
  assert.equal(latest!.retrieval_context.available, true);
  assert.deepEqual(latest!.retrieval_context.included_candidate_refs, [
    "candidate_canon_symbolic_001",
    "candidate_raw_symbolic_001",
  ]);
  assert.deepEqual(latest!.retrieval_context.suppressed_candidate_refs, ["candidate_wiki_symbolic_001"]);
  assert.deepEqual(latest!.retrieval_context.suppression_reasons, ["unsupported_wiki_claim"]);
  assert.deepEqual(latest!.retrieval_context.diagnostics.map((record) => record.id), [diagnostic.id]);
});

test("Hermes adapter resolves markdown artifacts and closed review state from the manifest", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-hermes-adapter-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const fixture = await createHermesProjectionFixture(rootDir, {
    now: "2026-04-16T03:00:00.000Z",
    status: "answered",
    manifest_id: "pmf_hermes_adapter_test_001",
    diagnostic_id: "diag_hermes_adapter_test_001",
    review_id: "cur_hermes_adapter_test_001",
    proposal_ref: "prop_hermes_adapter_test_001",
    markdown_heading: "Hermes Runtime Memory",
    diagnostic_message: "Hermes adapter test review is pending owner authority.",
    provenance_source_ref: "tests/hermes-adapter/runtime-projection",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "2026-04-16.group-interaction",
    owner_identity_ref: "actor_owner_hermes_adapter_test_001",
    runtime_instance_ref: "runtime_hermes_adapter_test_001",
    runtime_session_ref: "session_hermes_adapter_test_001",
    conversation_thread_ref: "thread_hermes_adapter_test_001",
    markdown_artifact_id: "part_hermes_adapter_test_001",
    canon_artifact_id: "part_hermes_adapter_test_002",
  });
  const view = await loadHermesProjectionRuntimeView({
    rootDir,
    manifest_id: fixture.manifest.id,
    consistency_requirement: "allow_mixed_state",
  });

  const storedMarkdown = await readFile(join(rootDir, fixture.markdownRelativePath), "utf8");
  assert.equal(view.markdown, storedMarkdown);
  assert.equal(view.pending_reviews.length, 0);
  assert.equal(view.closed_reviews.length, 1);
  assert.equal(view.closed_reviews[0]!.status, "answered");
  assert.equal(view.diagnostics[0]!.id, "diag_hermes_adapter_test_001");
  assert.match(view.markdown, /\(owner_ratification; answered\)/);
});

test("Hermes adapter forwards authenticated principals through write-through ingress", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-hermes-adapter-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const deferred = await writeHermesConversationPreferenceToStore(buildHermesWriteInput({
    rootDir,
    now: "2026-04-16T03:00:00.000Z",
    actor: "actor_participant_hermes_adapter_test_001",
    authenticated_principal: {
      kind: "participant",
      actor_ref: "actor_participant_hermes_adapter_test_001",
    },
    statement: "The owner prefers strategic summaries on Fridays.",
    validation_scope: "test:hermes-adapter:write-through:deferred",
    ids: {
      agent_identity: "actor_agent_hermes_adapter_test_001",
      owner_identity: "actor_owner_hermes_adapter_test_001",
      runtime_instance: "runtime_hermes_adapter_test_001",
      runtime_session: "session_hermes_adapter_test_001",
      conversation_thread: "thread_hermes_adapter_test_001",
      source: "src_hermes_adapter_test_001",
      observation: "obs_hermes_adapter_test_001",
      episode: "ep_hermes_adapter_test_001",
      subject_entity: "ent_subject_hermes_adapter_test_001",
      preference_entity: "ent_preference_hermes_adapter_test_001",
      preference_relation: "rel_preference_hermes_adapter_test_001",
      world_claim: "wcl_hermes_adapter_test_001",
      contradiction: "contra_hermes_adapter_test_001",
      contradiction_resolution: "cres_hermes_adapter_test_001",
      wiki_page: "wpg_hermes_adapter_test_001",
      wiki_claim: "wclm_hermes_adapter_test_001",
      proposal: "prop_hermes_adapter_test_001",
      disposition: "disp_hermes_adapter_test_001",
      ratification: "rat_hermes_adapter_test_001",
      diagnostic: "diag_hermes_adapter_test_001",
      canonical: "mem_hermes_adapter_test_001",
      canon_artifact: "part_hermes_canon_hermes_adapter_test_001",
      world_artifact: "part_hermes_world_hermes_adapter_test_001",
      wiki_artifact: "part_hermes_wiki_hermes_adapter_test_001",
      projection_manifest: "pmf_hermes_adapter_test_write_001",
    },
    labels: {
      agent: "Cristalina Test Agent",
      owner: "Test Owner",
      session_objective: "Hermes write-through authority test",
      session_summary: "Hermes adapter projection session",
      thread_summary: "Hermes adapter review thread",
    },
    semantic_profile: {
      subject: "Test Owner",
      wiki_title: "Owner Interaction Preferences",
      wiki_path: "wiki/pages/owner-interaction-preferences.md",
      preference_topic_label: "Owner Interaction Preferences",
      proposal_reason: "Participant reported an owner preference that requires owner ratification.",
    },
    source: {
      source_ref: "runtime/hermes-adapter-test#turn-001",
      content_ref: "raw/sources/hermes-adapter-turn-001.json",
      runtime: "hermes",
      message: "A participant says the owner prefers strategic summaries on Fridays.",
      speaker_ref: "actor_owner_hermes_adapter_test_001",
      message_refs: ["msg_hermes_adapter_test_001"],
    },
  }));

  assert.equal(deferred.records.intake.runtime_instance?.runtime, "hermes");
  assert.equal(deferred.records.intake.proposal.promotion_requirement, "owner_ratification_required");
  assert.equal(deferred.records.ratification_record.decision, "deferred");
  assert.equal((await listHermesProjectionRuntimeViews(rootDir)).length, 1);
  assert.equal((await listProjectionRuntimeViews(rootDir, "openclaw")).length, 0);

  const ratified = await ratifyHermesQueuedConversationPreference({
    rootDir,
    queue_id: deferred.records.owner_ratification_queue!.id,
    now: "2026-04-16T03:30:00.000Z",
    actor: "actor_owner_hermes_adapter_test_001",
    authenticated_principal: {
      kind: "owner",
      actor_ref: "actor_owner_hermes_adapter_test_001",
    },
    validation_scope: "test:hermes-adapter:write-through:queued-ratification",
  });
  assert.equal(ratified.records.projection_manifest.adapter, "hermes");
  assert.equal(ratified.records.owner_ratification_queue?.status, "applied");
  assert.equal((await listHermesProjectionRuntimeViews(rootDir)).length, 1);
  assert.equal((await listProjectionRuntimeViews(rootDir, "openclaw")).length, 0);
  const ratifiedView = await loadLatestHermesProjectionRuntimeView(rootDir, {
    consistency_requirement: "allow_mixed_state",
  });
  assert.ok(ratifiedView);
  assert.match(ratifiedView!.markdown, /\[review:cur_owner_ratification_prop_hermes_adapter_test_001\] \(owner_ratification; applied\)/);

  const ownerRootDir = await mkdtemp(join(tmpdir(), "cristalina-hermes-adapter-owner-"));
  t.after(async () => {
    await rm(ownerRootDir, { recursive: true, force: true });
  });

  const approved = await writeHermesConversationPreferenceToStore(buildHermesWriteInput({
    rootDir: ownerRootDir,
    now: "2026-04-16T03:00:00.000Z",
    actor: "actor_owner_hermes_adapter_test_owner_001",
    authenticated_principal: {
      kind: "owner",
      actor_ref: "actor_owner_hermes_adapter_test_owner_001",
    },
    statement: "The owner prefers strategic summaries on Fridays.",
    validation_scope: "test:hermes-adapter:write-through:owner",
    ids: {
      agent_identity: "actor_agent_hermes_adapter_test_owner_001",
      owner_identity: "actor_owner_hermes_adapter_test_owner_001",
      runtime_instance: "runtime_hermes_adapter_test_owner_001",
      runtime_session: "session_hermes_adapter_test_owner_001",
      conversation_thread: "thread_hermes_adapter_test_owner_001",
      source: "src_hermes_adapter_test_owner_001",
      observation: "obs_hermes_adapter_test_owner_001",
      episode: "ep_hermes_adapter_test_owner_001",
      subject_entity: "ent_subject_hermes_adapter_test_owner_001",
      preference_entity: "ent_preference_hermes_adapter_test_owner_001",
      preference_relation: "rel_preference_hermes_adapter_test_owner_001",
      world_claim: "wcl_hermes_adapter_test_owner_001",
      contradiction: "contra_hermes_adapter_test_owner_001",
      contradiction_resolution: "cres_hermes_adapter_test_owner_001",
      wiki_page: "wpg_hermes_adapter_test_owner_001",
      wiki_claim: "wclm_hermes_adapter_test_owner_001",
      proposal: "prop_hermes_adapter_test_owner_001",
      disposition: "disp_hermes_adapter_test_owner_001",
      ratification: "rat_hermes_adapter_test_owner_001",
      diagnostic: "diag_hermes_adapter_test_owner_001",
      canonical: "mem_hermes_adapter_test_owner_001",
      canon_artifact: "part_hermes_canon_hermes_adapter_test_owner_001",
      world_artifact: "part_hermes_world_hermes_adapter_test_owner_001",
      wiki_artifact: "part_hermes_wiki_hermes_adapter_test_owner_001",
      projection_manifest: "pmf_hermes_adapter_test_owner_001",
    },
    labels: {
      agent: "Cristalina Test Agent",
      owner: "Test Owner",
      session_objective: "Hermes write-through owner authority test",
      session_summary: "Hermes adapter projection session",
      thread_summary: "Hermes adapter review thread",
    },
    semantic_profile: {
      subject: "Test Owner",
      wiki_title: "Owner Interaction Preferences",
      wiki_path: "wiki/pages/owner-interaction-preferences.md",
      preference_topic_label: "Owner Interaction Preferences",
      proposal_reason: "Owner-originated preference signal.",
    },
    source: {
      source_ref: "runtime/hermes-adapter-test#turn-002",
      content_ref: "raw/sources/hermes-adapter-turn-002.json",
      runtime: "hermes",
      message: "The owner confirms they prefer strategic summaries on Fridays.",
      speaker_ref: "actor_owner_hermes_adapter_test_owner_001",
      message_refs: ["msg_hermes_adapter_test_owner_001"],
    },
  }));

  assert.equal(approved.records.intake.runtime_instance?.runtime, "hermes");
  assert.equal(approved.records.intake.proposal.promotion_requirement, "none");
  assert.equal(approved.records.ratification_record.decision, "approved");
  assert.equal((await listHermesProjectionRuntimeViews(ownerRootDir)).length, 1);
  assert.equal((await listProjectionRuntimeViews(ownerRootDir, "openclaw")).length, 0);
});

test("Hermes adapter writes projection feedback through the runtime-neutral intake profile", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-hermes-adapter-feedback-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const result = await writeHermesProjectionFeedbackToStore(buildHermesWriteInput({
    rootDir,
    now: "2026-04-16T04:00:00.000Z",
    actor: "system:hermes-adapter-feedback-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:hermes-adapter-feedback-test",
      system_scope: "hermes-adapter-feedback-test",
    },
    statement: "Hermes projection feedback says the owner prefers compact memory summaries.",
    validation_scope: "test:hermes-adapter:projection-feedback",
    ids: {
      agent_identity: "actor_agent_hermes_feedback_test_001",
      owner_identity: "actor_owner_hermes_feedback_test_001",
      runtime_instance: "runtime_hermes_feedback_test_001",
      runtime_session: "session_hermes_feedback_test_001",
      conversation_thread: "thread_hermes_feedback_test_001",
      source: "src_hermes_feedback_test_001",
      observation: "obs_hermes_feedback_test_001",
      episode: "ep_hermes_feedback_test_001",
      subject_entity: "ent_subject_hermes_feedback_test_001",
      preference_entity: "ent_preference_hermes_feedback_test_001",
      preference_relation: "rel_preference_hermes_feedback_test_001",
      world_claim: "wcl_hermes_feedback_test_001",
      contradiction: "contra_hermes_feedback_test_001",
      contradiction_resolution: "cres_hermes_feedback_test_001",
      wiki_page: "wpg_hermes_feedback_test_001",
      wiki_claim: "wclm_hermes_feedback_test_001",
      proposal: "prop_hermes_feedback_test_001",
      disposition: "disp_hermes_feedback_test_001",
      ratification: "rat_hermes_feedback_test_001",
      diagnostic: "diag_hermes_feedback_test_001",
      canonical: "mem_hermes_feedback_test_001",
      canon_artifact: "part_hermes_feedback_canon_001",
      world_artifact: "part_hermes_feedback_world_001",
      wiki_artifact: "part_hermes_feedback_wiki_001",
      projection_manifest: "pmf_hermes_feedback_test_001",
    },
    labels: {
      agent: "Cristalina Test Agent",
      owner: "Test Owner",
      session_objective: "Write Hermes projection feedback",
      session_summary: "Hermes projection feedback session",
      thread_summary: "Hermes projection feedback thread",
    },
    source: {
      source_ref: "runtime/hermes-feedback-test#projection-feedback-001",
      content_ref: "raw/sources/hermes-feedback-test-001.json",
      runtime: "hermes",
      message: "Hermes projection feedback says the owner prefers compact memory summaries.",
      speaker_ref: "actor_agent_hermes_feedback_test_001",
      message_refs: ["msg_hermes_feedback_test_001"],
    },
  }));

  assert.equal(result.records.source_record.intake_profile_ref, "preference_signal/projection_feedback");
  assert.equal(result.records.intake.runtime_instance?.runtime, "hermes");
  assert.equal(result.records.projection_manifest.adapter, "hermes");
  assert.equal((await listHermesProjectionRuntimeViews(rootDir)).length, 1);
  assert.equal((await listProjectionRuntimeViews(rootDir, "openclaw")).length, 0);
});
