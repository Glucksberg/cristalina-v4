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
  listProjectionRuntimeViews,
  type Diagnostic,
} from "../../core/dist/index.js";
import {
  initializeStore,
  writeCoreRecord,
} from "../../core/dist/testing.js";
import {
  buildSymbolicRetrievalFixture,
} from "../../core/dist/test-support/symbolic-retrieval-fixtures.js";

import {
  listHermesProjectionRuntimeViews,
  loadHermesProjectionRuntimeView,
  loadLatestHermesProjectionRuntimeView,
} from "./runtime-projection.js";
import {
  expireHermesQueuedConversationPreferenceManualContradictionReview,
  listHermesConversationPreferenceManualContradictionReviewQueue,
  ratifyHermesQueuedConversationPreference,
  writeHermesAdapterDriftDiagnosticToStore,
  writeHermesConversationPreferenceToStore,
  writeHermesNonCanonicalIntakeToStore,
  writeHermesProjectionFeedbackToStore,
  type HermesAuthenticatedPrincipal,
  type HermesConversationPreferenceWriteInput,
  type HermesNonCanonicalIntakeInput,
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

function buildHermesManualReviewInput(
  rootDir: string,
  suffix: string,
  statement: string,
): HermesConversationPreferenceWriteInput {
  return buildHermesWriteInput({
    rootDir,
    now: "2026-04-16T04:00:00.000Z",
    actor: "system:hermes-manual-review-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:hermes-manual-review-test",
      system_scope: "hermes-manual-review-test",
    },
    statement,
    validation_scope: `test:hermes-adapter:manual-review:${suffix}`,
    ids: {
      agent_identity: "actor_agent_hermes_manual_shared",
      owner_identity: "actor_owner_hermes_manual_shared",
      runtime_instance: "runtime_hermes_manual_shared",
      runtime_session: "session_hermes_manual_shared",
      conversation_thread: "thread_hermes_manual_shared",
      source: `src_hermes_manual_${suffix}`,
      observation: `obs_hermes_manual_${suffix}`,
      episode: `ep_hermes_manual_${suffix}`,
      subject_entity: `ent_subject_hermes_manual_${suffix}`,
      preference_entity: `ent_preference_hermes_manual_${suffix}`,
      preference_relation: `rel_preference_hermes_manual_${suffix}`,
      world_claim: `wcl_hermes_manual_${suffix}`,
      contradiction: `contra_hermes_manual_${suffix}`,
      contradiction_resolution: `cres_hermes_manual_${suffix}`,
      wiki_page: `wpg_hermes_manual_${suffix}`,
      wiki_claim: `wclm_hermes_manual_${suffix}`,
      proposal: `prop_hermes_manual_${suffix}`,
      disposition: `disp_hermes_manual_${suffix}`,
      ratification: `rat_hermes_manual_${suffix}`,
      diagnostic: `diag_hermes_manual_${suffix}`,
      canonical: `mem_hermes_manual_${suffix}`,
      canon_artifact: `part_hermes_canon_manual_${suffix}`,
      world_artifact: `part_hermes_world_manual_${suffix}`,
      wiki_artifact: `part_hermes_wiki_manual_${suffix}`,
      projection_manifest: `pmf_hermes_manual_${suffix}`,
    },
    labels: {
      agent: "Cristalina Test Agent",
      owner: "Test Owner",
      session_objective: "Resolve manual contradiction through the Hermes adapter",
      session_summary: "Hermes manual review adapter session",
      thread_summary: "Hermes manual review thread",
    },
    source: {
      source_ref: `runtime/hermes-manual-review#${suffix}`,
      content_ref: `raw/sources/hermes-manual-review-${suffix}.json`,
      runtime: "hermes",
      message: statement,
      message_refs: [`msg_hermes_manual_${suffix}`],
    },
  });
}

function buildHermesNonCanonicalInput(
  rootDir: string,
  mode: HermesNonCanonicalIntakeInput["mode"],
  suffix: string,
): HermesNonCanonicalIntakeInput {
  const actor = "system:hermes-noncanonical-test";
  return {
    rootDir,
    now: "2026-04-21T01:00:00.000Z",
    actor,
    authenticated_principal: {
      kind: "system",
      actor_ref: actor,
      system_scope: "hermes-noncanonical-test",
    },
    mode,
    ids: {
      source: `src_hermes_noncanonical_${mode}_${suffix}`,
      runtime_instance: `runtime_hermes_noncanonical_${suffix}`,
      runtime_session: `session_hermes_noncanonical_${suffix}`,
      conversation_thread: `thread_hermes_noncanonical_${suffix}`,
      observation: `obs_hermes_noncanonical_${mode}_${suffix}`,
      disposition: `disp_hermes_noncanonical_${mode}_${suffix}`,
      diagnostic: `diag_hermes_noncanonical_${mode}_${suffix}`,
    },
    source: {
      source_ref: `runtime/hermes-noncanonical#${mode}-${suffix}`,
      content_ref: `raw/sources/hermes-noncanonical-${mode}-${suffix}.json`,
      source_type: "hermes_adapter_noncanonical_fixture",
      payload: {
        note: `Hermes ${mode} adapter fixture`,
      },
      runtime_ref: `runtime_hermes_noncanonical_${suffix}`,
      session_ref: `session_hermes_noncanonical_${suffix}`,
      thread_ref: `thread_hermes_noncanonical_${suffix}`,
      agent_identity_ref: "actor_agent_hermes_noncanonical_001",
      owner_identity_ref: "actor_owner_hermes_noncanonical_001",
      session_objective: "Exercise non-canonical Hermes adapter write-through",
      session_summary: "Hermes non-canonical adapter session",
      thread_summary: "Hermes non-canonical adapter thread",
      message_refs: [`msg_hermes_noncanonical_${mode}_${suffix}`],
    },
    diagnostic: {
      code: "hermes_adapter_noncanonical_fixture",
      severity: "info",
      message: `Hermes ${mode} adapter fixture diagnostic`,
    },
    validation_scope: `test:hermes-adapter:noncanonical:${mode}`,
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
    projection_profile: "bootstrap",
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
    projection_profile: "bootstrap",
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

test("Hermes adapter can expire manual contradiction reviews through adapter writeback", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-hermes-adapter-manual-review-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await writeHermesConversationPreferenceToStore(
    buildHermesManualReviewInput(
      rootDir,
      "001",
      "The user prefers concise answers unless they explicitly ask for depth.",
    ),
  );
  const second = await writeHermesConversationPreferenceToStore(
    buildHermesManualReviewInput(
      rootDir,
      "002",
      "The user now prefers exhaustive answers by default.",
    ),
  );

  assert.equal(second.records.contradiction_resolution?.strategy, "manual_review");
  assert.equal(second.records.manual_contradiction_review_queue?.status, "pending");

  const queue = await listHermesConversationPreferenceManualContradictionReviewQueue(rootDir);
  assert.equal(queue.length, 1);
  assert.equal(queue[0]!.runtime, "hermes");

  const expired = await expireHermesQueuedConversationPreferenceManualContradictionReview({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-16T04:05:00.000Z",
    actor: "system:hermes-manual-review-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:hermes-manual-review-test",
      system_scope: "hermes-manual-review-test",
    },
    validation_scope: "test:hermes-adapter:manual-review:expire",
  });

  assert.equal(expired.records.contradiction_resolution.status, "rejected");
  assert.equal(expired.records.manual_contradiction_review_queue?.status, "expired");
  assert.equal((await listHermesConversationPreferenceManualContradictionReviewQueue(rootDir)).length, 0);

  const latest = await loadLatestHermesProjectionRuntimeView(rootDir, {
    consistency_requirement: "allow_mixed_state",
  });
  assert.ok(latest);
  assert.match(latest!.markdown, /\(contradiction_manual_review; expired\)/);
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

test("Hermes adapter writes non-canonical intake through core runtime law", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-hermes-adapter-noncanonical-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const evidence = await writeHermesNonCanonicalIntakeToStore(
    buildHermesNonCanonicalInput(rootDir, "evidence_only", "001"),
  );
  const runtime = await writeHermesNonCanonicalIntakeToStore(
    buildHermesNonCanonicalInput(rootDir, "runtime_only", "002"),
  );
  const diagnostic = await writeHermesNonCanonicalIntakeToStore(
    buildHermesNonCanonicalInput(rootDir, "diagnostic_only", "003"),
  );

  assert.deepEqual(evidence.records.disposition_record.outcomes, ["evidence_only"]);
  assert.equal(evidence.records.observation, undefined);
  assert.deepEqual(runtime.records.disposition_record.outcomes, ["runtime_only"]);
  assert.equal(runtime.records.runtime_instance?.runtime, "hermes");
  assert.equal(runtime.records.observation?.runtime_instance_ref, "runtime_hermes_noncanonical_002");
  assert.deepEqual(diagnostic.records.disposition_record.outcomes, ["diagnostic_only"]);
  assert.equal(diagnostic.records.diagnostic?.code, "hermes_adapter_noncanonical_fixture");
  assert.equal((await listHermesProjectionRuntimeViews(rootDir)).length, 0);
  assert.equal((await listProjectionRuntimeViews(rootDir, "openclaw")).length, 0);
});

test("Hermes adapter rejects non-canonical runtime context ref drift", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-hermes-adapter-noncanonical-drift-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildHermesNonCanonicalInput(rootDir, "runtime_only", "004");
  input.source.runtime_ref = "runtime_hermes_noncanonical_foreign";

  await assert.rejects(
    () => writeHermesNonCanonicalIntakeToStore(input),
    /Hermes adapter non-canonical intake runtime_instance mismatch/,
  );

  const sessionInput = buildHermesNonCanonicalInput(rootDir, "runtime_only", "005");
  sessionInput.source.session_ref = "session_hermes_noncanonical_foreign";
  await assert.rejects(
    () => writeHermesNonCanonicalIntakeToStore(sessionInput),
    /Hermes adapter non-canonical intake runtime_session mismatch/,
  );

  const threadInput = buildHermesNonCanonicalInput(rootDir, "runtime_only", "006");
  threadInput.source.thread_ref = "thread_hermes_noncanonical_foreign";
  await assert.rejects(
    () => writeHermesNonCanonicalIntakeToStore(threadInput),
    /Hermes adapter non-canonical intake conversation_thread mismatch/,
  );
});

test("Hermes adapter records drift diagnostics without runtime identity writes", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-hermes-adapter-drift-diagnostic-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildHermesNonCanonicalInput(rootDir, "diagnostic_only", "007");
  const result = await writeHermesAdapterDriftDiagnosticToStore({
    ...input,
    diagnostic: {
      code: "hermes_adapter_runtime_drift",
      severity: "warning",
      message: "Hermes runtime state drift was detected and reported as diagnostics only.",
    },
  });

  assert.deepEqual(result.records.disposition_record.outcomes, ["diagnostic_only"]);
  assert.equal(result.records.runtime_instance, undefined);
  assert.equal(result.records.observation, undefined);
  assert.equal(result.records.diagnostic?.code, "hermes_adapter_runtime_drift");
  assert.equal((await listHermesProjectionRuntimeViews(rootDir)).length, 0);
  assert.equal((await listProjectionRuntimeViews(rootDir, "openclaw")).length, 0);
});
