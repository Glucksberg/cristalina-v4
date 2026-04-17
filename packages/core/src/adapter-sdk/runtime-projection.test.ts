import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  listProjectionRuntimeViews,
  loadLatestProjectionRuntimeView,
  loadProjectionRuntimeView,
} from "./runtime-projection.js";
import {
  listConversationPreferenceOwnerRatificationQueue,
  ratifyQueuedConversationPreferenceProposalToStore,
  writeConversationPreferenceFlowToStore,
} from "../workflow-engine/conversation-preference-store.js";
import {
  buildConversationPreferenceFlowInput,
} from "../test-support/conversation-preference-fixtures.js";
import { createHermesProjectionFixture } from "../test-support/projection-fixtures.js";

test("runtime projection helper lists and loads OpenClaw projections from real flow state", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-runtime-projection-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildConversationPreferenceFlowInput({
    rootDir,
    now: "2026-04-17T02:00:00.000Z",
    actor: "system:core-runtime-projection-test",
    statement: "The owner prefers strategic summaries on Fridays.",
    validation_scope: "test:core:runtime-projection",
    ids: {
      agent_identity: "actor_agent_core_runtime_projection_test_001",
      owner_identity: "actor_owner_core_runtime_projection_test_001",
      runtime_instance: "runtime_core_runtime_projection_test_001",
      runtime_session: "session_core_runtime_projection_test_001",
      conversation_thread: "thread_core_runtime_projection_test_001",
      source: "src_core_runtime_projection_test_001",
      observation: "obs_core_runtime_projection_test_001",
      episode: "ep_core_runtime_projection_test_001",
      subject_entity: "ent_subject_core_runtime_projection_test_001",
      preference_entity: "ent_preference_core_runtime_projection_test_001",
      preference_relation: "rel_preference_core_runtime_projection_test_001",
      world_claim: "wcl_core_runtime_projection_test_001",
      contradiction: "contra_core_runtime_projection_test_001",
      contradiction_resolution: "cres_core_runtime_projection_test_001",
      wiki_page: "wpg_core_runtime_projection_test_001",
      wiki_claim: "wclm_core_runtime_projection_test_001",
      proposal: "prop_core_runtime_projection_test_001",
      disposition: "disp_core_runtime_projection_test_001",
      ratification: "rat_core_runtime_projection_test_001",
      diagnostic: "diag_core_runtime_projection_test_001",
      canonical: "mem_core_runtime_projection_test_001",
      canon_artifact: "part_openclaw_canon_core_runtime_projection_test_001",
      world_artifact: "part_openclaw_world_core_runtime_projection_test_001",
      wiki_artifact: "part_openclaw_wiki_core_runtime_projection_test_001",
      projection_manifest: "pmf_openclaw_core_runtime_projection_test_001",
    },
    labels: {
      agent: "Cristalina Test Agent",
      owner: "Test Owner",
      session_objective: "Expose runtime projection queue through the core helper",
      session_summary: "Core runtime projection test session",
      thread_summary: "Core runtime projection review thread",
    },
    semantic_profile: {
      subject: "Test Owner",
      wiki_title: "Owner Interaction Preferences",
      wiki_path: "wiki/pages/owner-interaction-preferences.md",
      preference_topic_label: "Owner Interaction Preferences",
      proposal_reason: "Participant reported an owner preference that requires owner ratification.",
    },
    source: {
      source_ref: "runtime/core-runtime-projection-test#turn-001",
      content_ref: "raw/sources/core-runtime-projection-turn-001.json",
      runtime: "openclaw",
      message: "A participant says the owner prefers strategic summaries on Fridays.",
      speaker_ref: "actor_external_person_core_runtime_projection_test_001",
      message_refs: ["msg_core_runtime_projection_test_001"],
    },
  });
  const first = await writeConversationPreferenceFlowToStore(input);
  const summaries = await listProjectionRuntimeViews(rootDir, "openclaw");

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]!.manifest_id, first.records.projection_manifest.id);
  assert.equal(summaries[0]!.pending_review_count, 1);

  const latest = await loadLatestProjectionRuntimeView(rootDir, "openclaw");
  assert.ok(latest);
  assert.equal(latest!.manifest.id, first.records.projection_manifest.id);
  assert.equal(latest!.pending_reviews.length, 1);
  assert.equal(latest!.closed_reviews.length, 0);
  assert.match(latest!.markdown, /## Review Queue/);

  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);
  await ratifyQueuedConversationPreferenceProposalToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-17T02:05:00.000Z",
    actor: "owner:core-runtime-projection-test",
    owner_actor_ref: input.identity_context!.ids.owner_identity!,
    validation_scope: "test:core:runtime-projection:ratified",
  });

  const view = await loadProjectionRuntimeView({
    rootDir,
    manifest_id: first.records.projection_manifest.id,
    adapter: "openclaw",
  });

  assert.equal(view.pending_reviews.length, 0);
  assert.equal(view.closed_reviews.length, 1);
  assert.equal(view.closed_reviews[0]!.status, "applied");
  assert.match(view.markdown, /\(owner_ratification; applied\)/);
});

test("runtime projection helper resolves Hermes projection markdown from manifest artifacts", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-runtime-projection-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const fixture = await createHermesProjectionFixture(rootDir, {
    now: "2026-04-17T03:00:00.000Z",
    status: "answered",
    manifest_id: "pmf_hermes_core_runtime_projection_test_001",
    diagnostic_id: "diag_hermes_core_runtime_projection_test_001",
    review_id: "cur_hermes_core_runtime_projection_test_001",
    proposal_ref: "prop_hermes_core_runtime_projection_test_001",
    markdown_heading: "Hermes Runtime Memory",
    diagnostic_message: "Hermes runtime projection helper test review is pending owner authority.",
    provenance_source_ref: "tests/core/runtime-projection",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "2026-04-17.group-interaction",
    owner_identity_ref: "actor_owner_hermes_core_runtime_projection_test_001",
    runtime_instance_ref: "runtime_hermes_core_runtime_projection_test_001",
    runtime_session_ref: "session_hermes_core_runtime_projection_test_001",
    conversation_thread_ref: "thread_hermes_core_runtime_projection_test_001",
    markdown_artifact_id: "part_hermes_core_runtime_projection_test_001",
    canon_artifact_id: "part_hermes_core_runtime_projection_test_002",
  });
  const summaries = await listProjectionRuntimeViews(rootDir, "hermes");

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]!.manifest_id, fixture.manifest.id);
  assert.equal(summaries[0]!.diagnostic_count, 1);
  assert.equal(summaries[0]!.review_count, 1);
  assert.equal(summaries[0]!.pending_review_count, 0);

  const latest = await loadLatestProjectionRuntimeView(rootDir, "hermes");
  assert.ok(latest);
  assert.equal(latest!.manifest.id, fixture.manifest.id);
  assert.equal(latest!.pending_reviews.length, 0);
  assert.equal(latest!.closed_reviews.length, 1);
  assert.equal(latest!.closed_reviews[0]!.status, "answered");

  const storedMarkdown = await readFile(join(rootDir, fixture.markdownRelativePath), "utf8");
  const direct = await loadProjectionRuntimeView({
    rootDir,
    manifest_id: fixture.manifest.id,
    adapter: "hermes",
  });

  assert.equal(direct.markdown, storedMarkdown);
  assert.equal(direct.diagnostics[0]!.id, "diag_hermes_core_runtime_projection_test_001");
  assert.match(direct.markdown, /\(owner_ratification; answered\)/);
});
