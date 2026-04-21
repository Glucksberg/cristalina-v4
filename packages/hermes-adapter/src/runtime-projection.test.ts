import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
import { listProjectionRuntimeViews } from "../../core/dist/index.js";

import {
  listHermesProjectionRuntimeViews,
  loadHermesProjectionRuntimeView,
  loadLatestHermesProjectionRuntimeView,
} from "./runtime-projection.js";
import {
  writeHermesConversationPreferenceToStore,
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

  const latest = await loadLatestHermesProjectionRuntimeView(rootDir);
  assert.ok(latest);
  assert.equal(latest!.manifest.id, fixture.manifest.id);
  assert.equal(latest!.pending_reviews.length, 1);
  assert.equal(latest!.closed_reviews.length, 0);
  assert.equal(latest!.reviews[0]!.status, "pending");
  assert.match(latest!.markdown, /## Review Queue/);
  assert.match(latest!.markdown, /\[review:cur_hermes_adapter_test_001\]/);
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
      canon_artifact: "part_openclaw_canon_hermes_adapter_test_001",
      world_artifact: "part_openclaw_world_hermes_adapter_test_001",
      wiki_artifact: "part_openclaw_wiki_hermes_adapter_test_001",
      projection_manifest: "pmf_openclaw_hermes_adapter_test_001",
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
      canon_artifact: "part_openclaw_canon_hermes_adapter_test_owner_001",
      world_artifact: "part_openclaw_world_hermes_adapter_test_owner_001",
      wiki_artifact: "part_openclaw_wiki_hermes_adapter_test_owner_001",
      projection_manifest: "pmf_openclaw_hermes_adapter_test_owner_001",
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
