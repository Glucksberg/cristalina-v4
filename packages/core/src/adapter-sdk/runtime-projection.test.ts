import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  listProjectionRuntimeViews,
  loadLatestProjectionRuntimeView,
  loadProjectionRuntimeView,
} from "./runtime-projection.js";
import { createProjectionManifest } from "./projection.js";
import {
  listConversationPreferenceOwnerRatificationQueue,
  ratifyQueuedConversationPreferenceProposalToStore,
  writeConversationPreferenceFlowToStore,
} from "../workflow-engine/conversation-preference-store.js";
import {
  buildConversationPreferenceFlowInput,
} from "../test-support/conversation-preference-fixtures.js";
import { createHermesProjectionFixture } from "../test-support/projection-fixtures.js";
import { initializeStore, writeCoreRecord } from "../store/io.js";
import { ValidationError } from "../validation.js";
import { buildSymbolicRetrievalFixture } from "../test-support/symbolic-retrieval-fixtures.js";
import {
  compileOpenClawBootstrapProjection,
  RUNTIME_BOOTSTRAP_PROJECTION_COMPILER_VERSION,
} from "../projection-engine/openclaw.js";
import type { Diagnostic } from "../types.js";

test("runtime projection helper lists and loads OpenClaw projections from real flow state", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-runtime-projection-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildConversationPreferenceFlowInput({
    rootDir,
    now: "2026-04-17T02:00:00.000Z",
    actor: "system:core-runtime-projection-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:core-runtime-projection-test",
      system_scope: "core-runtime-projection-test",
    },
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
  assert.equal(summaries[0]!.read_policy_version, first.records.projection_manifest.read_policy_version);
  assert.equal(summaries[0]!.compiler_version, RUNTIME_BOOTSTRAP_PROJECTION_COMPILER_VERSION.openclaw);
  assert.equal(summaries[0]!.generation, null);
  assert.equal(summaries[0]!.pending_review_count, 1);

  const latest = await loadLatestProjectionRuntimeView(rootDir, "openclaw", {
    consistency_requirement: "allow_mixed_state",
  });
  assert.ok(latest);
  assert.equal(latest!.manifest.id, first.records.projection_manifest.id);
  assert.match(latest!.manifest.boundary_note ?? "", /mixed state/);
  assert.equal(latest!.manifest.observed_layer_updates?.runtime, "2026-04-17T02:00:00.000Z");
  assert.equal(latest!.pending_reviews.length, 1);
  assert.equal(latest!.closed_reviews.length, 0);
  assert.match(latest!.markdown, /## Review Queue/);

  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);
  await ratifyQueuedConversationPreferenceProposalToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-17T02:05:00.000Z",
    actor: input.identity_context!.ids.owner_identity!,
    authenticated_principal: {
      kind: "owner",
      actor_ref: input.identity_context!.ids.owner_identity!,
    },
    owner_actor_ref: input.identity_context!.ids.owner_identity!,
    validation_scope: "test:core:runtime-projection:ratified",
  });

  const view = await loadProjectionRuntimeView({
    rootDir,
    manifest_id: first.records.projection_manifest.id,
    adapter: "openclaw",
    consistency_requirement: "allow_mixed_state",
  });

  assert.equal(view.pending_reviews.length, 0);
  assert.equal(view.closed_reviews.length, 1);
  assert.equal(view.closed_reviews[0]!.status, "applied");
  assert.match(view.markdown, /\(owner_ratification; applied\)/);
});

test("runtime projection helper exposes retrieval context from projection manifests", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-runtime-projection-retrieval-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const now = "2026-04-21T00:00:00.000Z";
  const fixture = buildSymbolicRetrievalFixture();
  const diagnostic: Diagnostic = {
    id: "diag_runtime_projection_retrieval_001",
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
      source_ref: "tests/core/runtime-projection-retrieval",
      evidence_refs: ["candidate_wiki_symbolic_001"],
    },
    code: "retrieval_recipe_partial",
    severity: "warning",
    message: "Retrieval recipe suppressed an editorial wiki candidate before runtime projection.",
    related_refs: ["candidate_wiki_symbolic_001"],
  };
  const projectionPath = "derived/openclaw/pmf_openclaw_runtime_projection_retrieval_001/bootstrap-memory.md";
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
      canon_artifact: "part_openclaw_runtime_projection_retrieval_canon_001",
      world_artifact: "part_openclaw_runtime_projection_retrieval_world_001",
      wiki_artifact: "part_openclaw_runtime_projection_retrieval_wiki_001",
      manifest: "pmf_openclaw_runtime_projection_retrieval_001",
    },
  });

  await initializeStore(rootDir, now);
  await mkdir(join(rootDir, "derived/openclaw/pmf_openclaw_runtime_projection_retrieval_001"), { recursive: true });
  await writeFile(join(rootDir, projectionPath), projection.markdown, "utf8");
  await Promise.all([
    ...projection.artifacts.map((artifact) => writeCoreRecord(rootDir, artifact)),
    writeCoreRecord(rootDir, diagnostic),
    writeCoreRecord(rootDir, projection.manifest),
  ]);

  const view = await loadProjectionRuntimeView({
    rootDir,
    manifest_id: projection.manifest.id,
    adapter: "openclaw",
    consistency_requirement: "allow_mixed_state",
  });

  assert.equal(view.retrieval_context.available, true);
  assert.deepEqual(view.retrieval_context.trace_refs, ["retrieval_trace_symbolic_fixture_001"]);
  assert.deepEqual(view.retrieval_context.included_candidate_refs, [
    "candidate_canon_symbolic_001",
    "candidate_raw_symbolic_001",
  ]);
  assert.deepEqual(view.retrieval_context.suppressed_candidate_refs, ["candidate_wiki_symbolic_001"]);
  assert.deepEqual(view.retrieval_context.suppression_reasons, ["unsupported_wiki_claim"]);
  assert.deepEqual(view.retrieval_context.traces, projection.manifest.retrieval_traces);
  assert.deepEqual(view.retrieval_context.diagnostics.map((record) => record.id), [diagnostic.id]);
  assert.match(view.markdown, /## Retrieval/);
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

  const latest = await loadLatestProjectionRuntimeView(rootDir, "hermes", {
    consistency_requirement: "allow_mixed_state",
  });
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
    consistency_requirement: "allow_mixed_state",
  });

  assert.equal(direct.markdown, storedMarkdown);
  assert.equal(direct.diagnostics[0]!.id, "diag_hermes_core_runtime_projection_test_001");
  assert.match(direct.markdown, /\(owner_ratification; answered\)/);

  await assert.rejects(
    () =>
      loadProjectionRuntimeView({
        rootDir,
        manifest_id: fixture.manifest.id,
        adapter: "hermes",
        consistency_requirement: "require_checkpoint_consistent",
      }),
    /does not satisfy require_checkpoint_consistent/,
  );
});

test("runtime projection helper requires runtime context when multiple latest manifests exist", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-runtime-projection-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildConversationPreferenceFlowInput({
    rootDir,
    now: "2026-04-17T05:00:00.000Z",
    actor: "system:runtime-projection-ambiguity-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:runtime-projection-ambiguity-test",
      system_scope: "runtime-projection-ambiguity-test",
    },
    statement: "The owner prefers concise summaries in thread A.",
    validation_scope: "test:core:runtime-projection:ambiguity:a",
    ids: {
      agent_identity: "actor_agent_runtime_projection_ambiguity_a",
      owner_identity: "actor_owner_runtime_projection_ambiguity_a",
      runtime_instance: "runtime_runtime_projection_ambiguity_a",
      runtime_session: "session_runtime_projection_ambiguity_a",
      conversation_thread: "thread_runtime_projection_ambiguity_a",
      source: "src_runtime_projection_ambiguity_a",
      observation: "obs_runtime_projection_ambiguity_a",
      episode: "ep_runtime_projection_ambiguity_a",
      subject_entity: "ent_subject_runtime_projection_ambiguity_a",
      preference_entity: "ent_preference_runtime_projection_ambiguity_a",
      preference_relation: "rel_preference_runtime_projection_ambiguity_a",
      world_claim: "wcl_runtime_projection_ambiguity_a",
      contradiction: "contra_runtime_projection_ambiguity_a",
      contradiction_resolution: "cres_runtime_projection_ambiguity_a",
      wiki_page: "wpg_runtime_projection_ambiguity_a",
      wiki_claim: "wclm_runtime_projection_ambiguity_a",
      proposal: "prop_runtime_projection_ambiguity_a",
      disposition: "disp_runtime_projection_ambiguity_a",
      ratification: "rat_runtime_projection_ambiguity_a",
      diagnostic: "diag_runtime_projection_ambiguity_a",
      canonical: "mem_runtime_projection_ambiguity_a",
      canon_artifact: "part_openclaw_canon_runtime_projection_ambiguity_a",
      world_artifact: "part_openclaw_world_runtime_projection_ambiguity_a",
      wiki_artifact: "part_openclaw_wiki_runtime_projection_ambiguity_a",
      projection_manifest: "pmf_openclaw_runtime_projection_ambiguity_a",
    },
    labels: {
      agent: "Ambiguity Agent A",
      owner: "Ambiguity Owner A",
      session_objective: "Ambiguity runtime projection A",
      session_summary: "Ambiguity runtime projection A",
      thread_summary: "Ambiguity thread A",
    },
    source: {
      source_ref: "runtime/ambiguity-a#turn-001",
      content_ref: "raw/sources/runtime-projection-ambiguity-a.json",
      runtime: "openclaw",
      message: "Thread A says the owner prefers concise summaries.",
      message_refs: ["msg_runtime_projection_ambiguity_a"],
    },
  });
  const secondInput = buildConversationPreferenceFlowInput({
    rootDir,
    now: "2026-04-17T05:01:00.000Z",
    actor: "system:runtime-projection-ambiguity-test",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:runtime-projection-ambiguity-test",
      system_scope: "runtime-projection-ambiguity-test",
    },
    statement: "The owner prefers exhaustive summaries in thread B.",
    validation_scope: "test:core:runtime-projection:ambiguity:b",
    ids: {
      agent_identity: "actor_agent_runtime_projection_ambiguity_b",
      owner_identity: "actor_owner_runtime_projection_ambiguity_b",
      runtime_instance: "runtime_runtime_projection_ambiguity_b",
      runtime_session: "session_runtime_projection_ambiguity_b",
      conversation_thread: "thread_runtime_projection_ambiguity_b",
      source: "src_runtime_projection_ambiguity_b",
      observation: "obs_runtime_projection_ambiguity_b",
      episode: "ep_runtime_projection_ambiguity_b",
      subject_entity: "ent_subject_runtime_projection_ambiguity_b",
      preference_entity: "ent_preference_runtime_projection_ambiguity_b",
      preference_relation: "rel_preference_runtime_projection_ambiguity_b",
      world_claim: "wcl_runtime_projection_ambiguity_b",
      contradiction: "contra_runtime_projection_ambiguity_b",
      contradiction_resolution: "cres_runtime_projection_ambiguity_b",
      wiki_page: "wpg_runtime_projection_ambiguity_b",
      wiki_claim: "wclm_runtime_projection_ambiguity_b",
      proposal: "prop_runtime_projection_ambiguity_b",
      disposition: "disp_runtime_projection_ambiguity_b",
      ratification: "rat_runtime_projection_ambiguity_b",
      diagnostic: "diag_runtime_projection_ambiguity_b",
      canonical: "mem_runtime_projection_ambiguity_b",
      canon_artifact: "part_openclaw_canon_runtime_projection_ambiguity_b",
      world_artifact: "part_openclaw_world_runtime_projection_ambiguity_b",
      wiki_artifact: "part_openclaw_wiki_runtime_projection_ambiguity_b",
      projection_manifest: "pmf_openclaw_runtime_projection_ambiguity_b",
    },
    labels: {
      agent: "Ambiguity Agent B",
      owner: "Ambiguity Owner B",
      session_objective: "Ambiguity runtime projection B",
      session_summary: "Ambiguity runtime projection B",
      thread_summary: "Ambiguity thread B",
    },
    source: {
      source_ref: "runtime/ambiguity-b#turn-001",
      content_ref: "raw/sources/runtime-projection-ambiguity-b.json",
      runtime: "openclaw",
      message: "Thread B says the owner prefers exhaustive summaries.",
      message_refs: ["msg_runtime_projection_ambiguity_b"],
    },
  });

  await writeConversationPreferenceFlowToStore(firstInput);
  await writeConversationPreferenceFlowToStore(secondInput);

  await assert.rejects(
    () => loadLatestProjectionRuntimeView(rootDir, "openclaw", {
      consistency_requirement: "allow_mixed_state",
    }),
    /ambiguous without full runtime and identity context/,
  );

  const latestForThreadA = await loadLatestProjectionRuntimeView(rootDir, "openclaw", {
    consistency_requirement: "allow_mixed_state",
    conversation_thread_ref: "thread_runtime_projection_ambiguity_a",
  });
  assert.ok(latestForThreadA);
  assert.equal(latestForThreadA!.manifest.id, "pmf_openclaw_runtime_projection_ambiguity_a");
});

test("runtime projection helper requires identity context when one thread has projections for multiple principals", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-runtime-projection-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await createHermesProjectionFixture(rootDir, {
    now: "2026-04-17T06:00:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_identity_ambiguity_a",
    diagnostic_id: "diag_hermes_identity_ambiguity_a",
    review_id: "cur_hermes_identity_ambiguity_a",
    proposal_ref: "prop_hermes_identity_ambiguity_a",
    markdown_heading: "Hermes Runtime Memory A",
    diagnostic_message: "Identity ambiguity fixture A.",
    provenance_source_ref: "tests/runtime-projection/identity-ambiguity-a",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "projection-read-v2",
    actor_identity_ref: "actor_agent_identity_ambiguity_a",
    owner_identity_ref: "actor_owner_identity_ambiguity_shared",
    runtime_instance_ref: "runtime_identity_ambiguity_shared",
    runtime_session_ref: "session_identity_ambiguity_shared",
    conversation_thread_ref: "thread_identity_ambiguity_shared",
    markdown_artifact_id: "part_hermes_identity_ambiguity_a",
    canon_artifact_id: "part_hermes_identity_ambiguity_a_canon",
  });

  await createHermesProjectionFixture(rootDir, {
    now: "2026-04-17T06:01:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_identity_ambiguity_b",
    diagnostic_id: "diag_hermes_identity_ambiguity_b",
    review_id: "cur_hermes_identity_ambiguity_b",
    proposal_ref: "prop_hermes_identity_ambiguity_b",
    markdown_heading: "Hermes Runtime Memory B",
    diagnostic_message: "Identity ambiguity fixture B.",
    provenance_source_ref: "tests/runtime-projection/identity-ambiguity-b",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "projection-read-v2",
    actor_identity_ref: "actor_agent_identity_ambiguity_b",
    owner_identity_ref: "actor_owner_identity_ambiguity_shared",
    runtime_instance_ref: "runtime_identity_ambiguity_shared",
    runtime_session_ref: "session_identity_ambiguity_shared",
    conversation_thread_ref: "thread_identity_ambiguity_shared",
    markdown_artifact_id: "part_hermes_identity_ambiguity_b",
    canon_artifact_id: "part_hermes_identity_ambiguity_b_canon",
  });

  await assert.rejects(
    () => loadLatestProjectionRuntimeView(rootDir, "hermes", {
      consistency_requirement: "allow_mixed_state",
      conversation_thread_ref: "thread_identity_ambiguity_shared",
    }),
    /ambiguous without full runtime and identity context/,
  );

  const latest = await loadLatestProjectionRuntimeView(rootDir, "hermes", {
    consistency_requirement: "allow_mixed_state",
    conversation_thread_ref: "thread_identity_ambiguity_shared",
    actor_identity_ref: "actor_agent_identity_ambiguity_b",
    owner_identity_ref: "actor_owner_identity_ambiguity_shared",
  });

  assert.ok(latest);
  assert.equal(latest!.manifest.id, "pmf_hermes_identity_ambiguity_b");
});

test("runtime projection helper prefers higher generation within the same continuity epoch when timestamps tie", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-runtime-projection-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await createHermesProjectionFixture(rootDir, {
    now: "2026-04-23T12:00:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_generation_001",
    diagnostic_id: "diag_hermes_generation_001",
    review_id: "cur_hermes_generation_001",
    proposal_ref: "prop_hermes_generation_001",
    markdown_heading: "Hermes Runtime Memory Generation 1",
    diagnostic_message: "Generation 1 fixture.",
    provenance_source_ref: "tests/runtime-projection/generation-001",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "projection-read-v2",
    owner_identity_ref: "actor_owner_generation_shared",
    runtime_instance_ref: "runtime_generation_shared",
    runtime_session_ref: "session_generation_shared",
    conversation_thread_ref: "thread_generation_shared",
    markdown_artifact_id: "part_hermes_generation_001",
    canon_artifact_id: "part_hermes_generation_001_canon",
    compiler_version: "hermes.runtime.v1",
    source_checkpoint_ref: "chkpt_generation_shared",
    continuity_epoch: "epoch_generation_shared",
    generation: 1,
    snapshot_strategy: "checkpoint_consistent",
  });

  await createHermesProjectionFixture(rootDir, {
    now: "2026-04-23T12:00:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_generation_002",
    diagnostic_id: "diag_hermes_generation_002",
    review_id: "cur_hermes_generation_002",
    proposal_ref: "prop_hermes_generation_002",
    markdown_heading: "Hermes Runtime Memory Generation 2",
    diagnostic_message: "Generation 2 fixture.",
    provenance_source_ref: "tests/runtime-projection/generation-002",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "projection-read-v2",
    owner_identity_ref: "actor_owner_generation_shared",
    runtime_instance_ref: "runtime_generation_shared",
    runtime_session_ref: "session_generation_shared",
    conversation_thread_ref: "thread_generation_shared",
    markdown_artifact_id: "part_hermes_generation_002",
    canon_artifact_id: "part_hermes_generation_002_canon",
    compiler_version: "hermes.runtime.v1",
    source_checkpoint_ref: "chkpt_generation_shared",
    continuity_epoch: "epoch_generation_shared",
    generation: 2,
    snapshot_strategy: "checkpoint_consistent",
  });

  const summaries = await listProjectionRuntimeViews(rootDir, "hermes", {
    owner_identity_ref: "actor_owner_generation_shared",
    runtime_instance_ref: "runtime_generation_shared",
    runtime_session_ref: "session_generation_shared",
    conversation_thread_ref: "thread_generation_shared",
  });

  assert.equal(summaries[0]!.manifest_id, "pmf_hermes_generation_002");
  assert.equal(summaries[0]!.generation, 2);
  assert.equal(summaries[0]!.continuity_epoch, "epoch_generation_shared");
  assert.equal(summaries[0]!.source_checkpoint_ref, "chkpt_generation_shared");
  assert.equal(summaries[0]!.snapshot_strategy, "checkpoint_consistent");

  const latest = await loadLatestProjectionRuntimeView(rootDir, "hermes", {
    consistency_requirement: "allow_mixed_state",
    owner_identity_ref: "actor_owner_generation_shared",
    runtime_instance_ref: "runtime_generation_shared",
    runtime_session_ref: "session_generation_shared",
    conversation_thread_ref: "thread_generation_shared",
  });

  assert.ok(latest);
  assert.equal(latest!.manifest.id, "pmf_hermes_generation_002");
  assert.equal(latest!.manifest.generation, 2);
});

test("runtime projection helper requires explicit consistency intent and prefers checkpoint-consistent latest views", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-runtime-projection-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await createHermesProjectionFixture(rootDir, {
    now: "2026-04-23T13:00:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_consistency_old",
    diagnostic_id: "diag_hermes_consistency_old",
    review_id: "cur_hermes_consistency_old",
    proposal_ref: "prop_hermes_consistency_old",
    markdown_heading: "Hermes Runtime Memory Consistent",
    diagnostic_message: "Checkpoint-consistent fixture.",
    provenance_source_ref: "tests/runtime-projection/consistency-old",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "projection-read-v2",
    owner_identity_ref: "actor_owner_consistency_shared",
    runtime_instance_ref: "runtime_consistency_shared",
    runtime_session_ref: "session_consistency_shared",
    conversation_thread_ref: "thread_consistency_shared",
    markdown_artifact_id: "part_hermes_consistency_old",
    canon_artifact_id: "part_hermes_consistency_old_canon",
    compiler_version: "hermes.runtime.v1",
    source_checkpoint_ref: "chkpt_consistency_shared",
    continuity_epoch: "epoch_consistency_shared",
    generation: 1,
    snapshot_strategy: "checkpoint_consistent",
  });

  await createHermesProjectionFixture(rootDir, {
    now: "2026-04-23T13:01:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_consistency_new",
    diagnostic_id: "diag_hermes_consistency_new",
    review_id: "cur_hermes_consistency_new",
    proposal_ref: "prop_hermes_consistency_new",
    markdown_heading: "Hermes Runtime Memory Mixed",
    diagnostic_message: "Mixed-state tolerant fixture.",
    provenance_source_ref: "tests/runtime-projection/consistency-new",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "projection-read-v2",
    owner_identity_ref: "actor_owner_consistency_shared",
    runtime_instance_ref: "runtime_consistency_shared",
    runtime_session_ref: "session_consistency_shared",
    conversation_thread_ref: "thread_consistency_shared",
    markdown_artifact_id: "part_hermes_consistency_new",
    canon_artifact_id: "part_hermes_consistency_new_canon",
    snapshot_strategy: "mixed_state_tolerant",
  });

  await assert.rejects(
    () =>
      (loadLatestProjectionRuntimeView as unknown as (
        rootDir: string,
        adapter: "hermes",
        filter?: unknown,
      ) => Promise<unknown>)(rootDir, "hermes"),
    /requires an explicit consistency_requirement/,
  );

  await assert.rejects(
    () =>
      (loadProjectionRuntimeView as unknown as (input: {
        rootDir: string;
        manifest_id: string;
        adapter: "hermes";
        consistency_requirement?: unknown;
      }) => Promise<unknown>)({
        rootDir,
        manifest_id: "pmf_hermes_consistency_old",
        adapter: "hermes",
      }),
    /projection loads require an explicit consistency_requirement/,
  );

  const latestAllowed = await loadLatestProjectionRuntimeView(rootDir, "hermes", {
    consistency_requirement: "allow_mixed_state",
    owner_identity_ref: "actor_owner_consistency_shared",
    runtime_instance_ref: "runtime_consistency_shared",
    runtime_session_ref: "session_consistency_shared",
    conversation_thread_ref: "thread_consistency_shared",
  });
  assert.ok(latestAllowed);
  assert.equal(latestAllowed!.manifest.id, "pmf_hermes_consistency_old");
  assert.equal(latestAllowed!.manifest.snapshot_strategy, "checkpoint_consistent");

  const latestConsistent = await loadLatestProjectionRuntimeView(rootDir, "hermes", {
    owner_identity_ref: "actor_owner_consistency_shared",
    runtime_instance_ref: "runtime_consistency_shared",
    runtime_session_ref: "session_consistency_shared",
    conversation_thread_ref: "thread_consistency_shared",
    consistency_requirement: "require_checkpoint_consistent",
  });
  assert.ok(latestConsistent);
  assert.equal(latestConsistent!.manifest.id, "pmf_hermes_consistency_old");
  assert.equal(latestConsistent!.manifest.snapshot_strategy, "checkpoint_consistent");

  const mixedOnlyRootDir = await mkdtemp(join(tmpdir(), "cristalina-core-runtime-projection-"));
  t.after(async () => {
    await rm(mixedOnlyRootDir, { recursive: true, force: true });
  });

  await createHermesProjectionFixture(mixedOnlyRootDir, {
    now: "2026-04-23T13:02:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_consistency_only_mixed",
    diagnostic_id: "diag_hermes_consistency_only_mixed",
    review_id: "cur_hermes_consistency_only_mixed",
    proposal_ref: "prop_hermes_consistency_only_mixed",
    markdown_heading: "Hermes Runtime Memory Mixed Only",
    diagnostic_message: "Only mixed-state fixture.",
    provenance_source_ref: "tests/runtime-projection/consistency-only-mixed",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "projection-read-v2",
    owner_identity_ref: "actor_owner_consistency_only_mixed",
    runtime_instance_ref: "runtime_consistency_only_mixed",
    runtime_session_ref: "session_consistency_only_mixed",
    conversation_thread_ref: "thread_consistency_only_mixed",
    markdown_artifact_id: "part_hermes_consistency_only_mixed",
    canon_artifact_id: "part_hermes_consistency_only_mixed_canon",
    snapshot_strategy: "mixed_state_tolerant",
  });

  const latestMixedOnly = await loadLatestProjectionRuntimeView(mixedOnlyRootDir, "hermes", {
    consistency_requirement: "allow_mixed_state",
    owner_identity_ref: "actor_owner_consistency_only_mixed",
    runtime_instance_ref: "runtime_consistency_only_mixed",
    runtime_session_ref: "session_consistency_only_mixed",
    conversation_thread_ref: "thread_consistency_only_mixed",
  });
  assert.ok(latestMixedOnly);
  assert.equal(latestMixedOnly!.manifest.id, "pmf_hermes_consistency_only_mixed");

  await assert.rejects(
    () =>
      loadLatestProjectionRuntimeView(mixedOnlyRootDir, "hermes", {
        owner_identity_ref: "actor_owner_consistency_only_mixed",
        runtime_instance_ref: "runtime_consistency_only_mixed",
        runtime_session_ref: "session_consistency_only_mixed",
        conversation_thread_ref: "thread_consistency_only_mixed",
        consistency_requirement: "require_checkpoint_consistent",
      }),
    /did not satisfy require_checkpoint_consistent/,
  );
});

test("runtime projection helper can require a compiler version for the selected runtime context", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-runtime-projection-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await createHermesProjectionFixture(rootDir, {
    now: "2026-04-23T14:00:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_compiler_old",
    diagnostic_id: "diag_hermes_compiler_old",
    review_id: "cur_hermes_compiler_old",
    proposal_ref: "prop_hermes_compiler_old",
    markdown_heading: "Hermes Runtime Memory Compiler Old",
    diagnostic_message: "Older compiler fixture.",
    provenance_source_ref: "tests/runtime-projection/compiler-old",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "projection-read-v2",
    owner_identity_ref: "actor_owner_compiler_shared",
    runtime_instance_ref: "runtime_compiler_shared",
    runtime_session_ref: "session_compiler_shared",
    conversation_thread_ref: "thread_compiler_shared",
    markdown_artifact_id: "part_hermes_compiler_old",
    canon_artifact_id: "part_hermes_compiler_old_canon",
    compiler_version: "hermes.runtime.v1",
  });

  await createHermesProjectionFixture(rootDir, {
    now: "2026-04-23T14:01:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_compiler_new",
    diagnostic_id: "diag_hermes_compiler_new",
    review_id: "cur_hermes_compiler_new",
    proposal_ref: "prop_hermes_compiler_new",
    markdown_heading: "Hermes Runtime Memory Compiler New",
    diagnostic_message: "Newer compiler fixture.",
    provenance_source_ref: "tests/runtime-projection/compiler-new",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "projection-read-v2",
    owner_identity_ref: "actor_owner_compiler_shared",
    runtime_instance_ref: "runtime_compiler_shared",
    runtime_session_ref: "session_compiler_shared",
    conversation_thread_ref: "thread_compiler_shared",
    markdown_artifact_id: "part_hermes_compiler_new",
    canon_artifact_id: "part_hermes_compiler_new_canon",
    compiler_version: "hermes.runtime.v2",
  });

  const latestAny = await loadLatestProjectionRuntimeView(rootDir, "hermes", {
    consistency_requirement: "allow_mixed_state",
    owner_identity_ref: "actor_owner_compiler_shared",
    runtime_instance_ref: "runtime_compiler_shared",
    runtime_session_ref: "session_compiler_shared",
    conversation_thread_ref: "thread_compiler_shared",
  });
  assert.ok(latestAny);
  assert.equal(latestAny!.manifest.id, "pmf_hermes_compiler_new");

  const latestV1 = await loadLatestProjectionRuntimeView(rootDir, "hermes", {
    consistency_requirement: "allow_mixed_state",
    compiler_version: "hermes.runtime.v1",
    owner_identity_ref: "actor_owner_compiler_shared",
    runtime_instance_ref: "runtime_compiler_shared",
    runtime_session_ref: "session_compiler_shared",
    conversation_thread_ref: "thread_compiler_shared",
  });
  assert.ok(latestV1);
  assert.equal(latestV1!.manifest.id, "pmf_hermes_compiler_old");

  await assert.rejects(
    () =>
      loadLatestProjectionRuntimeView(rootDir, "hermes", {
        consistency_requirement: "allow_mixed_state",
        compiler_version: "hermes.runtime.v3",
        owner_identity_ref: "actor_owner_compiler_shared",
        runtime_instance_ref: "runtime_compiler_shared",
        runtime_session_ref: "session_compiler_shared",
        conversation_thread_ref: "thread_compiler_shared",
      }),
    /did not satisfy compiler_version=hermes\.runtime\.v3/,
  );
});

test("runtime projection helper can require a read policy version for the selected runtime context", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-runtime-projection-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await createHermesProjectionFixture(rootDir, {
    now: "2026-04-23T15:00:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_policy_old",
    diagnostic_id: "diag_hermes_policy_old",
    review_id: "cur_hermes_policy_old",
    proposal_ref: "prop_hermes_policy_old",
    markdown_heading: "Hermes Runtime Memory Policy Old",
    diagnostic_message: "Older policy fixture.",
    provenance_source_ref: "tests/runtime-projection/policy-old",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "projection-read-v1",
    owner_identity_ref: "actor_owner_policy_shared",
    runtime_instance_ref: "runtime_policy_shared",
    runtime_session_ref: "session_policy_shared",
    conversation_thread_ref: "thread_policy_shared",
    markdown_artifact_id: "part_hermes_policy_old",
    canon_artifact_id: "part_hermes_policy_old_canon",
    compiler_version: "hermes.runtime.v1",
  });

  await createHermesProjectionFixture(rootDir, {
    now: "2026-04-23T15:01:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_policy_new",
    diagnostic_id: "diag_hermes_policy_new",
    review_id: "cur_hermes_policy_new",
    proposal_ref: "prop_hermes_policy_new",
    markdown_heading: "Hermes Runtime Memory Policy New",
    diagnostic_message: "Newer policy fixture.",
    provenance_source_ref: "tests/runtime-projection/policy-new",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "projection-read-v2",
    owner_identity_ref: "actor_owner_policy_shared",
    runtime_instance_ref: "runtime_policy_shared",
    runtime_session_ref: "session_policy_shared",
    conversation_thread_ref: "thread_policy_shared",
    markdown_artifact_id: "part_hermes_policy_new",
    canon_artifact_id: "part_hermes_policy_new_canon",
    compiler_version: "hermes.runtime.v1",
  });

  const latestAny = await loadLatestProjectionRuntimeView(rootDir, "hermes", {
    consistency_requirement: "allow_mixed_state",
    owner_identity_ref: "actor_owner_policy_shared",
    runtime_instance_ref: "runtime_policy_shared",
    runtime_session_ref: "session_policy_shared",
    conversation_thread_ref: "thread_policy_shared",
  });
  assert.ok(latestAny);
  assert.equal(latestAny!.manifest.id, "pmf_hermes_policy_new");

  const latestV1 = await loadLatestProjectionRuntimeView(rootDir, "hermes", {
    consistency_requirement: "allow_mixed_state",
    read_policy_version: "projection-read-v1",
    owner_identity_ref: "actor_owner_policy_shared",
    runtime_instance_ref: "runtime_policy_shared",
    runtime_session_ref: "session_policy_shared",
    conversation_thread_ref: "thread_policy_shared",
  });
  assert.ok(latestV1);
  assert.equal(latestV1!.manifest.id, "pmf_hermes_policy_old");

  await assert.rejects(
    () =>
      loadLatestProjectionRuntimeView(rootDir, "hermes", {
        consistency_requirement: "allow_mixed_state",
        read_policy_version: "projection-read-v3",
        owner_identity_ref: "actor_owner_policy_shared",
        runtime_instance_ref: "runtime_policy_shared",
        runtime_session_ref: "session_policy_shared",
        conversation_thread_ref: "thread_policy_shared",
      }),
    /did not satisfy read_policy_version=projection-read-v3/,
  );
});

test("runtime projection helper rejects stored projection artifacts that escape derived storage", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-runtime-projection-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await initializeStore(rootDir, "2026-04-17T04:00:00.000Z");

  await writeFile(
    join(rootDir, "derived/hermes/part_hermes_escape_test_001.json"),
    `${JSON.stringify(
      {
        id: "part_hermes_escape_test_001",
        kind: "projection_artifact",
        layer: "derived",
        authoritative_home: "wiki",
        created_at: "2026-04-17T04:00:00.000Z",
        updated_at: "2026-04-17T04:00:00.000Z",
        visibility_state: {
          privacy_scope: "shareable",
        },
        provenance: {
          source_type: "corrupted_fixture",
          source_ref: "../outside.md",
          evidence_refs: ["ref_escape_test_001"],
        },
        adapter: "hermes",
        artifact_kind: "runtime_memory_markdown",
        path: "../outside.md#reviews",
        source_layer: "derived",
        upstream_refs: ["ref_escape_test_001"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeCoreRecord(
    rootDir,
    createProjectionManifest({
      id: "pmf_hermes_escape_test_001",
      adapter: "hermes",
      projection_profile: "hermes/runtime-bootstrap",
      audience: "runtime",
      read_policy_version: "projection-read-v2",
      compiler_version: "hermes.runtime.v1",
      snapshot_strategy: "mixed_state_tolerant",
      context_refs: [],
      artifact_refs: ["part_hermes_escape_test_001"],
      upstream_refs: ["ref_escape_test_001"],
      now: "2026-04-17T04:00:00.000Z",
      visibility_state: {
        privacy_scope: "shareable",
      },
    }),
  );

  await assert.rejects(
    () =>
      loadProjectionRuntimeView({
        rootDir,
        manifest_id: "pmf_hermes_escape_test_001",
        adapter: "hermes",
        consistency_requirement: "allow_mixed_state",
      }),
    (error: unknown) =>
      error instanceof ValidationError &&
      error.issues.some(
        (issue) =>
          issue.path === "path" &&
          issue.message === "projection artifacts must use a store-relative path inside derived storage",
      ),
  );
});
