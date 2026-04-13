import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadCanonicalRecords, writeCoreRecord } from "../store/io.js";
import {
  applyConversationPreferenceResolutionToStore,
  readConversationPreferenceFlowResult,
  writeConversationPreferenceFlowToStore,
  writeOpenClawPreferenceFeedbackFlowToStore,
  writeStructuredPreferenceSignalFlowToStore,
  type ConversationPreferenceStoreInput,
} from "./conversation-preference-store.js";

function buildInput(rootDir: string): ConversationPreferenceStoreInput {
  return {
    rootDir,
    now: "2026-04-12T00:00:00.000Z",
    actor: "system:test",
    statement: "The user prefers concise answers unless they explicitly ask for depth.",
    identity_context: {
      runtime: "openclaw",
      ids: {
        agent_identity: "actor_agent_test_001",
        owner_identity: "actor_owner_test_001",
        runtime_instance: "runtime_test_001",
        runtime_session: "session_test_001",
        conversation_thread: "thread_test_001",
      },
      agent_label: "Cristalina Test Agent",
      owner_label: "Test Owner",
      session_objective: "Track stable interaction preferences",
      session_summary: "Session summary",
      message_refs: ["msg_test_001"],
      thread_summary: "OpenClaw thread summary",
    },
    source: {
      id: "src_test_001",
      source_ref: "runtime/session-test#turn-001",
      content_ref: "raw/sources/conversation-turn-test-001.json",
      runtime: "openclaw",
      message: "The user says they prefer concise answers unless they explicitly ask for depth.",
    },
    ids: {
      observation: "obs_test_001",
      episode: "ep_test_001",
      subject_entity: "ent_subject_test_001",
      preference_entity: "ent_preference_test_001",
      preference_relation: "rel_preference_test_001",
      world_claim: "wcl_test_001",
      contradiction: "contra_test_001",
      contradiction_resolution: "cres_test_001",
      wiki_page: "wpg_test_001",
      wiki_claim: "wclm_test_001",
      proposal: "prop_test_001",
      disposition: "disp_test_001",
      ratification: "rat_test_001",
      diagnostic: "diag_test_001",
      canonical: "mem_test_001",
      canon_artifact: "part_openclaw_canon_test_001",
      world_artifact: "part_openclaw_world_test_001",
      wiki_artifact: "part_openclaw_wiki_test_001",
      projection_manifest: "pmf_openclaw_test_001",
    },
    validation_scope: "test:conversation-preference",
  };
}

test("writeConversationPreferenceFlowToStore materializes and reuses the same flow", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  const first = await writeConversationPreferenceFlowToStore(input);

  assert.equal(first.reused, false);
  assert.equal(first.validation_issues.length, 0);
  assert.equal(first.records.canonical_record.id, input.ids.canonical);
  assert.equal(first.records.canonical_record.governance_state, "ratified");
  assert.equal(first.records.intake.runtime_instance?.id, input.identity_context?.ids.runtime_instance);
  assert.equal(first.records.intake.episode.id, input.ids.episode);
  assert.equal(first.records.intake.preference_relation.object_ref.id, input.ids.preference_entity);

  const canonicalRecords = await loadCanonicalRecords(rootDir);
  assert.equal(canonicalRecords.length, 1);
  assert.equal(canonicalRecords[0]?.id, input.ids.canonical);

  const wikiMarkdown = await readFile(first.paths.wiki_page_markdown, "utf8");
  assert.match(wikiMarkdown, /User Interaction Preferences/);
  assert.match(wikiMarkdown, /The user prefers concise answers unless they explicitly ask for depth\./);

  const projectionMarkdown = await readFile(first.paths.projection_markdown, "utf8");
  assert.match(projectionMarkdown, /\[canon:mem_test_001\]/);
  assert.match(projectionMarkdown, /\[thread:thread_test_001\]/);
  assert.match(projectionMarkdown, /\[episode:ep_test_001\]/);

  const auditLogBefore = await readFile(join(rootDir, "audits/changes.log"), "utf8");
  const second = await writeConversationPreferenceFlowToStore(input);
  const auditLogAfter = await readFile(join(rootDir, "audits/changes.log"), "utf8");

  assert.equal(second.reused, true);
  assert.equal(second.records.canonical_record.id, first.records.canonical_record.id);
  assert.equal(auditLogAfter, auditLogBefore);
});

test("writeConversationPreferenceFlowToStore rejects reuse with mismatched input", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(input);

  await assert.rejects(
    () =>
      writeConversationPreferenceFlowToStore({
        ...input,
        statement: "The user now prefers exhaustive answers by default.",
        source: {
          ...input.source,
          message: "The user now wants exhaustive answers by default.",
        },
      }),
    /does not match input/,
  );
});

test("writeConversationPreferenceFlowToStore repairs missing derived artifacts on rerun", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  const first = await writeConversationPreferenceFlowToStore(input);
  const auditLogBefore = await readFile(join(rootDir, "audits/changes.log"), "utf8");

  await unlink(first.paths.wiki_page_markdown);
  await unlink(first.paths.projection_artifacts.wiki);

  const repaired = await writeConversationPreferenceFlowToStore(input);
  const auditLogAfter = await readFile(join(rootDir, "audits/changes.log"), "utf8");
  const repairedWikiMarkdown = await readFile(first.paths.wiki_page_markdown, "utf8");

  assert.equal(repaired.reused, true);
  assert.match(repairedWikiMarkdown, /User Interaction Preferences/);
  assert.equal(auditLogAfter, auditLogBefore);
});

test("writeConversationPreferenceFlowToStore records contradictions against existing active world claims", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(firstInput);

  const secondInput: ConversationPreferenceStoreInput = {
    ...buildInput(rootDir),
    now: "2026-04-12T01:00:00.000Z",
    statement: "The user now prefers exhaustive answers by default.",
    source: {
      id: "src_test_002",
      source_ref: "runtime/session-test#turn-002",
      content_ref: "raw/sources/conversation-turn-test-002.json",
      runtime: "openclaw",
      message: "The user now says they prefer exhaustive answers by default.",
    },
    ids: {
      observation: "obs_test_002",
      episode: "ep_test_002",
      subject_entity: "ent_subject_test_002",
      preference_entity: "ent_preference_test_002",
      preference_relation: "rel_preference_test_002",
      world_claim: "wcl_test_002",
      contradiction: "contra_test_002",
      contradiction_resolution: "cres_test_002",
      wiki_page: "wpg_test_002",
      wiki_claim: "wclm_test_002",
      proposal: "prop_test_002",
      disposition: "disp_test_002",
      ratification: "rat_test_002",
      diagnostic: "diag_test_002",
      canonical: "mem_test_002",
      canon_artifact: "part_openclaw_canon_test_002",
      world_artifact: "part_openclaw_world_test_002",
      wiki_artifact: "part_openclaw_wiki_test_002",
      projection_manifest: "pmf_openclaw_test_002",
    },
  };

  const second = await writeConversationPreferenceFlowToStore(secondInput);
  assert.equal(second.records.contradiction?.status, "open");
  assert.equal(second.records.contradiction?.right_ref.id, "wcl_test_002");
  assert.equal(second.records.contradiction_resolution?.strategy, "coexist_temporally");
});

test("applyConversationPreferenceResolutionToStore persists applied resolution and recompiles projection", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(firstInput);

  const secondInput: ConversationPreferenceStoreInput = {
    ...buildInput(rootDir),
    now: "2026-04-12T01:00:00.000Z",
    statement: "The user now prefers exhaustive answers by default.",
    source: {
      id: "src_test_apply_002",
      source_ref: "runtime/session-test#turn-apply-002",
      content_ref: "raw/sources/conversation-turn-test-apply-002.json",
      runtime: "openclaw",
      message: "The user now says they prefer exhaustive answers by default.",
    },
    ids: {
      observation: "obs_test_apply_002",
      episode: "ep_test_apply_002",
      subject_entity: "ent_subject_test_apply_002",
      preference_entity: "ent_preference_test_apply_002",
      preference_relation: "rel_preference_test_apply_002",
      world_claim: "wcl_test_apply_002",
      contradiction: "contra_test_apply_002",
      contradiction_resolution: "cres_test_apply_002",
      wiki_page: "wpg_test_apply_002",
      wiki_claim: "wclm_test_apply_002",
      proposal: "prop_test_apply_002",
      disposition: "disp_test_apply_002",
      ratification: "rat_test_apply_002",
      diagnostic: "diag_test_apply_002",
      canonical: "mem_test_apply_002",
      canon_artifact: "part_openclaw_canon_test_apply_002",
      world_artifact: "part_openclaw_world_test_apply_002",
      wiki_artifact: "part_openclaw_wiki_test_apply_002",
      projection_manifest: "pmf_openclaw_test_apply_002",
    },
  };

  await writeConversationPreferenceFlowToStore(secondInput);

  const applied = await applyConversationPreferenceResolutionToStore({
    ...secondInput,
    now: "2026-04-12T01:05:00.000Z",
    validation_scope: "test:conversation-preference:resolution-application",
  });

  assert.equal(applied.reused, false);
  assert.equal(applied.records.contradiction.status, "resolved");
  assert.equal(applied.records.contradiction_resolution.status, "applied");
  assert.equal(applied.records.existing_world_claim.temporal_state?.temporal_status, "historical");

  const projectionMarkdown = await readFile(applied.paths.projection_markdown, "utf8");
  assert.match(projectionMarkdown, /Compiled at: 2026-04-12T01:05:00.000Z/);
  assert.match(projectionMarkdown, /\[contradiction:contra_test_apply_002\] \(resolved\)/);
  assert.match(projectionMarkdown, /\[contradiction-resolution:cres_test_apply_002\] \(applied\) coexist_temporally/);
  assert.match(projectionMarkdown, /\[world:wcl_test_001\] \(disputed; historical\)/);
  assert.match(projectionMarkdown, /\[world:wcl_test_apply_002\] \(inferred; active\)/);

  const reloaded = await readConversationPreferenceFlowResult(secondInput);
  assert.equal(reloaded?.records.contradiction_resolution?.status, "applied");
  const projectionManifestSource = await readFile(applied.paths.projection_manifest, "utf8");
  assert.match(projectionManifestSource, /"created_at": "2026-04-12T01:05:00.000Z"/);

  const appliedAgain = await applyConversationPreferenceResolutionToStore({
    ...secondInput,
    now: "2026-04-12T01:06:00.000Z",
    validation_scope: "test:conversation-preference:resolution-application-reused",
  });
  assert.equal(appliedAgain.reused, true);
  assert.equal(appliedAgain.records.contradiction_resolution.status, "applied");
});

test("openclaw feedback round-trip preserves runtime identity and recompiles projection", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const seed = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(seed);

  const roundTrip = await writeOpenClawPreferenceFeedbackFlowToStore({
    ...seed,
    now: "2026-04-12T02:00:00.000Z",
    statement: "OpenClaw confirms the concise-answer preference is still active.",
    source: {
      id: "src_feedback_test_001",
      source_ref: "openclaw/runtime-001#thread-001",
      content_ref: "raw/imports/openclaw-feedback-test-001.json",
      runtime: "openclaw",
      message: "Runtime feedback confirms the concise-answer preference.",
      source_type: "openclaw_runtime_feedback",
    },
    ids: {
      observation: "obs_feedback_test_001",
      episode: "ep_feedback_test_001",
      subject_entity: "ent_subject_feedback_test_001",
      preference_entity: "ent_preference_feedback_test_001",
      preference_relation: "rel_preference_feedback_test_001",
      world_claim: "wcl_feedback_test_001",
      contradiction: "contra_feedback_test_001",
      contradiction_resolution: "cres_feedback_test_001",
      wiki_page: "wpg_feedback_test_001",
      wiki_claim: "wclm_feedback_test_001",
      proposal: "prop_feedback_test_001",
      disposition: "disp_feedback_test_001",
      ratification: "rat_feedback_test_001",
      diagnostic: "diag_feedback_test_001",
      canonical: "mem_feedback_test_001",
      canon_artifact: "part_openclaw_canon_feedback_test_001",
      world_artifact: "part_openclaw_world_feedback_test_001",
      wiki_artifact: "part_openclaw_wiki_feedback_test_001",
      projection_manifest: "pmf_openclaw_feedback_test_001",
    },
    validation_scope: "test:openclaw-roundtrip",
  });

  const projectionMarkdown = await readFile(roundTrip.paths.projection_markdown, "utf8");
  assert.equal(roundTrip.records.intake.runtime_instance?.id, seed.identity_context?.ids.runtime_instance);
  assert.equal(roundTrip.records.projection_manifest.runtime_instance_ref, seed.identity_context?.ids.runtime_instance);
  assert.match(projectionMarkdown, /\[runtime:runtime_test_001\]/);
  assert.match(projectionMarkdown, /\[wiki:wpg_feedback_test_001\]/);
  assert.match(projectionMarkdown, /## Contradiction Resolutions/);
});

test("structured preference signal flow reuses the generic intake framework", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  const result = await writeStructuredPreferenceSignalFlowToStore({
    ...input,
    source: {
      ...input.source,
      id: "src_structured_store_001",
      source_ref: "import/customer-001",
      content_ref: "raw/imports/customer-001.json",
      source_type: "structured_import",
    },
    statement: "The customer prefers executive summaries before implementation detail.",
    semantic_profile: {
      wiki_title: "Customer Delivery Preferences",
      wiki_path: "wiki/pages/customer-delivery-preferences.md",
      subject_entity_kind: "customer",
      subject_label: "Customer 001",
      preference_topic_label: "Delivery Preferences",
      relation_type: "requests_delivery_style",
      proposal_reason: "Structured import confirms a delivery preference worth governing.",
    },
    ids: {
      observation: "obs_structured_store_001",
      episode: "ep_structured_store_001",
      subject_entity: "ent_subject_structured_store_001",
      preference_entity: "ent_preference_structured_store_001",
      preference_relation: "rel_preference_structured_store_001",
      world_claim: "wcl_structured_store_001",
      contradiction: "contra_structured_store_001",
      contradiction_resolution: "cres_structured_store_001",
      wiki_page: "wpg_structured_store_001",
      wiki_claim: "wclm_structured_store_001",
      proposal: "prop_structured_store_001",
      disposition: "disp_structured_store_001",
      ratification: "rat_structured_store_001",
      diagnostic: "diag_structured_store_001",
      canonical: "mem_structured_store_001",
      canon_artifact: "part_openclaw_canon_structured_store_001",
      world_artifact: "part_openclaw_world_structured_store_001",
      wiki_artifact: "part_openclaw_wiki_structured_store_001",
      projection_manifest: "pmf_openclaw_structured_store_001",
    },
  });

  assert.equal(result.records.intake.subject_entity.entity_kind, "customer");
  assert.equal(result.records.intake.wiki_page.title, "Customer Delivery Preferences");
});

test("loadCanonicalRecords excludes canonical identity records", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(input);

  await writeCoreRecord(rootDir, {
    id: "actor_test_001",
    kind: "actor_identity",
    layer: "canon",
    authoritative_home: "canon",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "operator",
      source_ref: "user:test",
    },
    actor_kind: "owner",
    label: "Test Owner",
    status: "active",
  });

  const canonicalRecords = await loadCanonicalRecords(rootDir);
  assert.equal(canonicalRecords.length, 1);
  assert.equal(canonicalRecords[0]?.kind, "preference");
});
