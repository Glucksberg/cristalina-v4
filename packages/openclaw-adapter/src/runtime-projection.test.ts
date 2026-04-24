import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  compileOpenClawBootstrapProjection,
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
  buildConversationPreferenceFlowInput,
  type ConversationPreferenceFlowInputFixtureInput,
} from "../../core/dist/test-support/conversation-preference-fixtures.js";

import {
  listOpenClawProjectionRuntimeViews,
  loadLatestOpenClawProjectionRuntimeView,
  loadOpenClawProjectionRuntimeView,
} from "./runtime-projection.js";
import {
  applyOpenClawQueuedConversationPreferenceManualContradictionReview,
  expireOpenClawQueuedConversationPreference,
  listOpenClawConversationPreferenceManualContradictionReviewQueue,
  listOpenClawConversationPreferenceOwnerRatificationQueue,
  ratifyOpenClawQueuedConversationPreference,
  writeOpenClawConversationPreferenceToStore,
  type OpenClawAuthenticatedPrincipal,
  type OpenClawConversationPreferenceWriteInput,
} from "./writeback.js";

function buildOpenClawWriteInput(
  input: ConversationPreferenceFlowInputFixtureInput & {
    authenticated_principal: OpenClawAuthenticatedPrincipal;
  },
): OpenClawConversationPreferenceWriteInput {
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

function buildOpenClawManualReviewInput(
  rootDir: string,
  suffix: string,
  statement: string,
): OpenClawConversationPreferenceWriteInput {
  return buildOpenClawWriteInput({
    rootDir,
    now: "2026-04-16T04:00:00.000Z",
    actor: "system:openclaw-manual-review-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:openclaw-manual-review-test",
      system_scope: "openclaw-manual-review-test",
    },
    statement,
    validation_scope: `test:openclaw-adapter:manual-review:${suffix}`,
    ids: {
      agent_identity: "actor_agent_openclaw_manual_shared",
      owner_identity: "actor_owner_openclaw_manual_shared",
      runtime_instance: "runtime_openclaw_manual_shared",
      runtime_session: "session_openclaw_manual_shared",
      conversation_thread: "thread_openclaw_manual_shared",
      source: `src_openclaw_manual_${suffix}`,
      observation: `obs_openclaw_manual_${suffix}`,
      episode: `ep_openclaw_manual_${suffix}`,
      subject_entity: `ent_subject_openclaw_manual_${suffix}`,
      preference_entity: `ent_preference_openclaw_manual_${suffix}`,
      preference_relation: `rel_preference_openclaw_manual_${suffix}`,
      world_claim: `wcl_openclaw_manual_${suffix}`,
      contradiction: `contra_openclaw_manual_${suffix}`,
      contradiction_resolution: `cres_openclaw_manual_${suffix}`,
      wiki_page: `wpg_openclaw_manual_${suffix}`,
      wiki_claim: `wclm_openclaw_manual_${suffix}`,
      proposal: `prop_openclaw_manual_${suffix}`,
      disposition: `disp_openclaw_manual_${suffix}`,
      ratification: `rat_openclaw_manual_${suffix}`,
      diagnostic: `diag_openclaw_manual_${suffix}`,
      canonical: `mem_openclaw_manual_${suffix}`,
      canon_artifact: `part_openclaw_canon_manual_${suffix}`,
      world_artifact: `part_openclaw_world_manual_${suffix}`,
      wiki_artifact: `part_openclaw_wiki_manual_${suffix}`,
      projection_manifest: `pmf_openclaw_manual_${suffix}`,
    },
    labels: {
      agent: "Cristalina Test Agent",
      owner: "Test Owner",
      session_objective: "Resolve manual contradiction through the OpenClaw adapter",
      session_summary: "OpenClaw manual review adapter session",
      thread_summary: "OpenClaw manual review thread",
    },
    source: {
      source_ref: `runtime/openclaw-manual-review#${suffix}`,
      content_ref: `raw/sources/openclaw-manual-review-${suffix}.json`,
      runtime: "openclaw",
      message: statement,
      message_refs: [`msg_openclaw_manual_${suffix}`],
    },
  });
}

test("OpenClaw adapter exposes pending owner review items from the latest projection", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-openclaw-adapter-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const result = await writeOpenClawConversationPreferenceToStore(buildOpenClawWriteInput({
    rootDir,
    now: "2026-04-16T02:00:00.000Z",
    actor: "system:openclaw-adapter-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:openclaw-adapter-test",
      system_scope: "openclaw-adapter-test",
    },
    statement: "The owner prefers strategic summaries on Fridays.",
    validation_scope: "test:openclaw-adapter:projection-runtime",
    ids: {
      agent_identity: "actor_agent_openclaw_adapter_test_001",
      owner_identity: "actor_owner_openclaw_adapter_test_001",
      runtime_instance: "runtime_openclaw_adapter_test_001",
      runtime_session: "session_openclaw_adapter_test_001",
      conversation_thread: "thread_openclaw_adapter_test_001",
      source: "src_openclaw_adapter_test_001",
      observation: "obs_openclaw_adapter_test_001",
      episode: "ep_openclaw_adapter_test_001",
      subject_entity: "ent_subject_openclaw_adapter_test_001",
      preference_entity: "ent_preference_openclaw_adapter_test_001",
      preference_relation: "rel_preference_openclaw_adapter_test_001",
      world_claim: "wcl_openclaw_adapter_test_001",
      contradiction: "contra_openclaw_adapter_test_001",
      contradiction_resolution: "cres_openclaw_adapter_test_001",
      wiki_page: "wpg_openclaw_adapter_test_001",
      wiki_claim: "wclm_openclaw_adapter_test_001",
      proposal: "prop_openclaw_adapter_test_001",
      disposition: "disp_openclaw_adapter_test_001",
      ratification: "rat_openclaw_adapter_test_001",
      diagnostic: "diag_openclaw_adapter_test_001",
      canonical: "mem_openclaw_adapter_test_001",
      canon_artifact: "part_openclaw_canon_openclaw_adapter_test_001",
      world_artifact: "part_openclaw_world_openclaw_adapter_test_001",
      wiki_artifact: "part_openclaw_wiki_openclaw_adapter_test_001",
      projection_manifest: "pmf_openclaw_adapter_test_001",
    },
    labels: {
      agent: "Cristalina Test Agent",
      owner: "Test Owner",
      session_objective: "Expose owner review queue through the OpenClaw adapter",
      session_summary: "OpenClaw adapter projection session",
      thread_summary: "OpenClaw adapter review thread",
    },
    semantic_profile: {
      subject: "Test Owner",
      wiki_title: "Owner Interaction Preferences",
      wiki_path: "wiki/pages/owner-interaction-preferences.md",
      preference_topic_label: "Owner Interaction Preferences",
      proposal_reason: "Participant reported an owner preference that requires owner ratification.",
    },
    source: {
      source_ref: "runtime/openclaw-adapter-test#turn-001",
      content_ref: "raw/sources/openclaw-adapter-turn-001.json",
      runtime: "openclaw",
      message: "A participant says the owner prefers strategic summaries on Fridays.",
      speaker_ref: "actor_external_person_openclaw_adapter_test_001",
      message_refs: ["msg_openclaw_adapter_test_001"],
    },
  }));
  const summaries = await listOpenClawProjectionRuntimeViews(rootDir);

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]!.manifest_id, result.records.projection_manifest.id);
  assert.equal(summaries[0]!.pending_review_count, 1);

  const latest = await loadLatestOpenClawProjectionRuntimeView(rootDir, {
    consistency_requirement: "allow_mixed_state",
  });
  assert.ok(latest);
  assert.equal(latest!.manifest.id, result.records.projection_manifest.id);
  assert.equal(latest!.pending_reviews.length, 1);
  assert.equal(latest!.closed_reviews.length, 0);
  assert.equal(latest!.pending_reviews[0]!.status, "pending");
  assert.match(latest!.markdown, /## Review Queue/);
  assert.match(latest!.markdown, /\[review:cur_owner_ratification_prop_openclaw_adapter_test_001\]/);
});

test("OpenClaw adapter exposes core retrieval context without redefining retrieval law", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-openclaw-adapter-retrieval-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const now = "2026-04-21T00:00:00.000Z";
  const fixture = buildSymbolicRetrievalFixture();
  const diagnostic: Diagnostic = {
    id: "diag_openclaw_adapter_retrieval_001",
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
      source_ref: "tests/openclaw-adapter/retrieval-context",
      evidence_refs: ["candidate_wiki_symbolic_001"],
    },
    code: "retrieval_recipe_partial",
    severity: "warning",
    message: "OpenClaw adapter received suppressed retrieval context from the core projection manifest.",
    related_refs: ["candidate_wiki_symbolic_001"],
  };
  const projectionPath = "derived/openclaw/pmf_openclaw_adapter_retrieval_001/bootstrap-memory.md";
  const projection = compileOpenClawBootstrapProjection({
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
      canon_artifact: "part_openclaw_adapter_retrieval_canon_001",
      world_artifact: "part_openclaw_adapter_retrieval_world_001",
      wiki_artifact: "part_openclaw_adapter_retrieval_wiki_001",
      manifest: "pmf_openclaw_adapter_retrieval_001",
    },
  });

  await initializeStore(rootDir, now);
  await mkdir(join(rootDir, "derived/openclaw/pmf_openclaw_adapter_retrieval_001"), { recursive: true });
  await writeFile(join(rootDir, projectionPath), projection.markdown, "utf8");
  await Promise.all([
    ...projection.artifacts.map((artifact) => writeCoreRecord(rootDir, artifact)),
    writeCoreRecord(rootDir, diagnostic),
    writeCoreRecord(rootDir, projection.manifest),
  ]);

  const latest = await loadLatestOpenClawProjectionRuntimeView(rootDir, {
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

test("OpenClaw adapter exposes closed owner review items after queue ratification", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-openclaw-adapter-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildOpenClawWriteInput({
    rootDir,
    now: "2026-04-16T02:00:00.000Z",
    actor: "system:openclaw-adapter-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:openclaw-adapter-test",
      system_scope: "openclaw-adapter-test",
    },
    statement: "The owner prefers strategic summaries on Fridays.",
    validation_scope: "test:openclaw-adapter:projection-runtime",
    ids: {
      agent_identity: "actor_agent_openclaw_adapter_test_001",
      owner_identity: "actor_owner_openclaw_adapter_test_001",
      runtime_instance: "runtime_openclaw_adapter_test_001",
      runtime_session: "session_openclaw_adapter_test_001",
      conversation_thread: "thread_openclaw_adapter_test_001",
      source: "src_openclaw_adapter_test_001",
      observation: "obs_openclaw_adapter_test_001",
      episode: "ep_openclaw_adapter_test_001",
      subject_entity: "ent_subject_openclaw_adapter_test_001",
      preference_entity: "ent_preference_openclaw_adapter_test_001",
      preference_relation: "rel_preference_openclaw_adapter_test_001",
      world_claim: "wcl_openclaw_adapter_test_001",
      contradiction: "contra_openclaw_adapter_test_001",
      contradiction_resolution: "cres_openclaw_adapter_test_001",
      wiki_page: "wpg_openclaw_adapter_test_001",
      wiki_claim: "wclm_openclaw_adapter_test_001",
      proposal: "prop_openclaw_adapter_test_001",
      disposition: "disp_openclaw_adapter_test_001",
      ratification: "rat_openclaw_adapter_test_001",
      diagnostic: "diag_openclaw_adapter_test_001",
      canonical: "mem_openclaw_adapter_test_001",
      canon_artifact: "part_openclaw_canon_openclaw_adapter_test_001",
      world_artifact: "part_openclaw_world_openclaw_adapter_test_001",
      wiki_artifact: "part_openclaw_wiki_openclaw_adapter_test_001",
      projection_manifest: "pmf_openclaw_adapter_test_001",
    },
    labels: {
      agent: "Cristalina Test Agent",
      owner: "Test Owner",
      session_objective: "Expose owner review queue through the OpenClaw adapter",
      session_summary: "OpenClaw adapter projection session",
      thread_summary: "OpenClaw adapter review thread",
    },
    semantic_profile: {
      subject: "Test Owner",
      wiki_title: "Owner Interaction Preferences",
      wiki_path: "wiki/pages/owner-interaction-preferences.md",
      preference_topic_label: "Owner Interaction Preferences",
      proposal_reason: "Participant reported an owner preference that requires owner ratification.",
    },
    source: {
      source_ref: "runtime/openclaw-adapter-test#turn-001",
      content_ref: "raw/sources/openclaw-adapter-turn-001.json",
      runtime: "openclaw",
      message: "A participant says the owner prefers strategic summaries on Fridays.",
      speaker_ref: "actor_external_person_openclaw_adapter_test_001",
      message_refs: ["msg_openclaw_adapter_test_001"],
    },
  });
  const first = await writeOpenClawConversationPreferenceToStore(input);
  const queue = await listOpenClawConversationPreferenceOwnerRatificationQueue(rootDir);
  await ratifyOpenClawQueuedConversationPreference({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-16T02:05:00.000Z",
    actor: input.identity_context!.ids.owner_identity!,
    authenticated_principal: {
      kind: "owner",
      actor_ref: input.identity_context!.ids.owner_identity!,
    },
    owner_actor_ref: input.identity_context!.ids.owner_identity!,
    validation_scope: "test:openclaw-adapter:projection-runtime:ratified",
  });

  const view = await loadOpenClawProjectionRuntimeView({
    rootDir,
    manifest_id: first.records.projection_manifest.id,
    consistency_requirement: "allow_mixed_state",
  });

  assert.equal(view.pending_reviews.length, 0);
  assert.equal(view.closed_reviews.length, 1);
  assert.equal(view.closed_reviews[0]!.status, "applied");
  assert.match(view.markdown, /## Review Trace/);
  assert.match(view.markdown, /\(owner_ratification; applied\)/);
});

test("OpenClaw adapter can close manual contradiction reviews through adapter writeback", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-openclaw-adapter-manual-review-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await writeOpenClawConversationPreferenceToStore(
    buildOpenClawManualReviewInput(
      rootDir,
      "001",
      "The user prefers concise answers unless they explicitly ask for depth.",
    ),
  );
  const second = await writeOpenClawConversationPreferenceToStore(
    buildOpenClawManualReviewInput(
      rootDir,
      "002",
      "The user now prefers exhaustive answers by default.",
    ),
  );

  assert.equal(second.records.contradiction_resolution?.strategy, "manual_review");
  assert.equal(second.records.manual_contradiction_review_queue?.status, "pending");

  const queue = await listOpenClawConversationPreferenceManualContradictionReviewQueue(rootDir);
  assert.equal(queue.length, 1);
  assert.equal(queue[0]!.runtime, "openclaw");

  const applied = await applyOpenClawQueuedConversationPreferenceManualContradictionReview({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-16T04:05:00.000Z",
    actor: "system:openclaw-manual-review-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:openclaw-manual-review-test",
      system_scope: "openclaw-manual-review-test",
    },
    strategy: "supersede_existing",
    validation_scope: "test:openclaw-adapter:manual-review:apply",
  });

  assert.equal(applied.records.contradiction_resolution.status, "applied");
  assert.equal(applied.records.manual_contradiction_review_queue?.status, "applied");
  assert.equal((await listOpenClawConversationPreferenceManualContradictionReviewQueue(rootDir)).length, 0);

  const latest = await loadLatestOpenClawProjectionRuntimeView(rootDir, {
    consistency_requirement: "allow_mixed_state",
  });
  assert.ok(latest);
  assert.match(latest!.markdown, /\(contradiction_manual_review; applied\)/);
});

test("OpenClaw adapter requires authenticated owner authority for owner-scoped claims and allows explicit system expiration", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-openclaw-adapter-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildOpenClawWriteInput({
    rootDir,
    now: "2026-04-16T02:00:00.000Z",
    actor: "actor_participant_openclaw_adapter_test_001",
    authenticated_principal: {
      kind: "participant",
      actor_ref: "actor_participant_openclaw_adapter_test_001",
    },
    statement: "The owner prefers strategic summaries on Fridays.",
    validation_scope: "test:openclaw-adapter:projection-runtime:spoofed-owner",
    ids: {
      agent_identity: "actor_agent_openclaw_adapter_test_002",
      owner_identity: "actor_owner_openclaw_adapter_test_002",
      runtime_instance: "runtime_openclaw_adapter_test_002",
      runtime_session: "session_openclaw_adapter_test_002",
      conversation_thread: "thread_openclaw_adapter_test_002",
      source: "src_openclaw_adapter_test_002",
      observation: "obs_openclaw_adapter_test_002",
      episode: "ep_openclaw_adapter_test_002",
      subject_entity: "ent_subject_openclaw_adapter_test_002",
      preference_entity: "ent_preference_openclaw_adapter_test_002",
      preference_relation: "rel_preference_openclaw_adapter_test_002",
      world_claim: "wcl_openclaw_adapter_test_002",
      contradiction: "contra_openclaw_adapter_test_002",
      contradiction_resolution: "cres_openclaw_adapter_test_002",
      wiki_page: "wpg_openclaw_adapter_test_002",
      wiki_claim: "wclm_openclaw_adapter_test_002",
      proposal: "prop_openclaw_adapter_test_002",
      disposition: "disp_openclaw_adapter_test_002",
      ratification: "rat_openclaw_adapter_test_002",
      diagnostic: "diag_openclaw_adapter_test_002",
      canonical: "mem_openclaw_adapter_test_002",
      canon_artifact: "part_openclaw_canon_openclaw_adapter_test_002",
      world_artifact: "part_openclaw_world_openclaw_adapter_test_002",
      wiki_artifact: "part_openclaw_wiki_openclaw_adapter_test_002",
      projection_manifest: "pmf_openclaw_adapter_test_002",
    },
    labels: {
      agent: "Cristalina Test Agent",
      owner: "Test Owner",
      session_objective: "Expose owner review queue through the OpenClaw adapter",
      session_summary: "OpenClaw adapter projection session",
      thread_summary: "OpenClaw adapter review thread",
    },
    semantic_profile: {
      subject: "Test Owner",
      wiki_title: "Owner Interaction Preferences",
      wiki_path: "wiki/pages/owner-interaction-preferences.md",
      preference_topic_label: "Owner Interaction Preferences",
      proposal_reason: "Participant reported an owner preference that requires owner ratification.",
    },
    source: {
      source_ref: "runtime/openclaw-adapter-test#turn-002",
      content_ref: "raw/sources/openclaw-adapter-turn-002.json",
      runtime: "openclaw",
      message: "A participant claims the owner prefers strategic summaries on Fridays.",
      speaker_ref: "actor_owner_openclaw_adapter_test_002",
      message_refs: ["msg_openclaw_adapter_test_002"],
    },
  });

  const result = await writeOpenClawConversationPreferenceToStore(input);
  assert.equal(result.records.intake.proposal.promotion_requirement, "owner_ratification_required");
  assert.equal(result.records.ratification_record.decision, "deferred");

  const queue = await listOpenClawConversationPreferenceOwnerRatificationQueue(rootDir);
  const expired = await expireOpenClawQueuedConversationPreference({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-16T02:05:00.000Z",
    actor: "system:openclaw-adapter-expirer",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:openclaw-adapter-expirer",
      system_scope: "openclaw-adapter-expirer",
    },
    validation_scope: "test:openclaw-adapter:projection-runtime:expired",
  });

  assert.equal(expired.records.ratification_record.decision, "expired");
  assert.equal(expired.records.owner_ratification_queue?.status, "expired");
});
