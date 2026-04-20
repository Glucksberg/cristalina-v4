import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  listConversationPreferenceOwnerRatificationQueue,
} from "../../core/dist/index.js";
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
  expireOpenClawQueuedConversationPreference,
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

  const latest = await loadLatestOpenClawProjectionRuntimeView(rootDir);
  assert.ok(latest);
  assert.equal(latest!.manifest.id, result.records.projection_manifest.id);
  assert.equal(latest!.pending_reviews.length, 1);
  assert.equal(latest!.closed_reviews.length, 0);
  assert.equal(latest!.pending_reviews[0]!.status, "pending");
  assert.match(latest!.markdown, /## Review Queue/);
  assert.match(latest!.markdown, /\[review:cur_owner_ratification_prop_openclaw_adapter_test_001\]/);
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
  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);
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
  });

  assert.equal(view.pending_reviews.length, 0);
  assert.equal(view.closed_reviews.length, 1);
  assert.equal(view.closed_reviews[0]!.status, "applied");
  assert.match(view.markdown, /## Review Trace/);
  assert.match(view.markdown, /\(owner_ratification; applied\)/);
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

  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);
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
