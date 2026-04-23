import assert from "node:assert/strict";
import { access, mkdir, readFile, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadCanonicalRecords, writeCoreRecord } from "../store/io.js";
import {
  applyConversationPreferenceResolutionToStore,
  type AuthenticatedConversationPreferenceStoreInput,
  applyQueuedConversationPreferenceManualContradictionReviewToStore,
  expireQueuedConversationPreferenceManualContradictionReviewToStore,
  expireQueuedConversationPreferenceProposalToStore,
  listConversationPreferenceManualContradictionReviewQueue,
  listConversationPreferenceOwnerRatificationQueue,
  readConversationPreferenceFlowResult,
  rejectQueuedConversationPreferenceProposalToStore,
  ratifyDeferredConversationPreferenceProposalToStore,
  ratifyQueuedConversationPreferenceProposalToStore,
  writeConversationPreferenceFlowToStore,
  writeOpenClawPreferenceFeedbackFlowToStore,
  writeStructuredPreferenceSignalFlowToStore,
  type ConversationPreferenceStoreInput,
} from "./conversation-preference-store.js";
import { buildDefaultConversationPreferenceFlowInput } from "../test-support/conversation-preference-fixtures.js";

function buildInput(rootDir: string): AuthenticatedConversationPreferenceStoreInput {
  return buildDefaultConversationPreferenceFlowInput(rootDir);
}

function cloneInputWithSuffix(
  rootDir: string,
  suffix: string,
  statement: string,
): AuthenticatedConversationPreferenceStoreInput {
  const input = buildInput(rootDir);
  input.statement = statement;
  input.source.id = `${input.source.id}_${suffix}`;
  input.source.source_ref = `${input.source.source_ref}-${suffix}`;
  input.source.content_ref = `raw/sources/conversation-turn-${suffix}.json`;
  input.source.message = statement;
  input.ids = Object.fromEntries(
    Object.entries(input.ids).map(([key, value]) => [key, `${value}_${suffix}`]),
  ) as unknown as AuthenticatedConversationPreferenceStoreInput["ids"];
  input.validation_scope = `test:conversation-preference:${suffix}`;
  return input;
}

function ownerPrincipal(input: ConversationPreferenceStoreInput) {
  return {
    kind: "owner" as const,
    actor_ref: input.identity_context!.ids.owner_identity!,
  };
}

function participantPrincipal(actor_ref = "actor_participant_test_001") {
  return {
    kind: "participant" as const,
    actor_ref,
  };
}

function systemPrincipal(actor_ref = "system:test") {
  return {
    kind: "system" as const,
    actor_ref,
    system_scope: actor_ref.replace(/^system:/, "") || actor_ref,
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
  assert.equal(first.records.canonical_record?.id, input.ids.canonical);
  assert.equal(first.records.canonical_record?.governance_state, "ratified");
  assert.equal(first.records.source_record.intake_profile_ref, "preference_signal/conversation_preference");
  assert.equal(first.records.source_record.intake_runner_contract_version, "registered_intake_profile.v1");
  assert.match(first.records.source_record.semantic_profile_fingerprint ?? "", /^preference_signal:/);
  assert.equal(first.records.intake.runtime_instance?.id, input.identity_context?.ids.runtime_instance);
  assert.equal(first.records.intake.episode.id, input.ids.episode);
  assert.equal(first.records.intake.preference_relation.object_ref.id, input.ids.preference_entity);
  assert.deepEqual(
    new Set([
      first.records.source_record.layer,
      first.records.intake.observation.layer,
      first.records.intake.episode.layer,
      first.records.intake.subject_entity.layer,
      first.records.intake.preference_entity.layer,
      first.records.intake.preference_relation.layer,
      first.records.intake.world_claim.layer,
      first.records.intake.wiki_page.layer,
      first.records.intake.wiki_claim.layer,
      first.records.intake.proposal.layer,
      first.records.intake.disposition_record.layer,
      first.records.ratification_record.layer,
      first.records.canonical_record?.layer,
      first.records.projection_manifest.layer,
    ]),
    new Set(["raw", "runtime", "world", "wiki", "governance", "canon", "derived"]),
  );

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
  assert.equal(second.records.canonical_record?.id, first.records.canonical_record?.id);
  assert.equal(auditLogAfter, auditLogBefore);
});

test("writeConversationPreferenceFlowToStore rejects canonical id reuse across create flows", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const first = buildInput(rootDir);
  const firstResult = await writeConversationPreferenceFlowToStore(first);
  const second = cloneInputWithSuffix(
    rootDir,
    "canonical_id_collision_002",
    "The user prefers thorough answers for architecture reviews.",
  );
  second.source.speaker_ref = "actor_external_person_canonical_collision_002";
  second.ids.canonical = first.ids.canonical;

  await assert.rejects(
    () => writeConversationPreferenceFlowToStore(second),
    /cannot reuse existing canonical id/,
  );

  const canonicalRecords = await loadCanonicalRecords(rootDir);
  assert.equal(canonicalRecords.length, 1);
  assert.equal(canonicalRecords[0]?.id, first.ids.canonical);
  assert.equal(canonicalRecords[0]?.statement, firstResult.records.canonical_record?.statement);
});

test("writeConversationPreferenceFlowToStore requires an authenticated principal", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  const unauthenticated = {
    ...input,
    authenticated_principal: undefined,
  } as unknown as Parameters<typeof writeConversationPreferenceFlowToStore>[0];

  await assert.rejects(
    () => writeConversationPreferenceFlowToStore(unauthenticated),
    /requires an authenticated_principal/,
  );
});

test("writeConversationPreferenceFlowToStore preserves speaker provenance", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.source.speaker_ref = "actor_external_person_test_001";

  const result = await writeConversationPreferenceFlowToStore(input);

  assert.equal(result.records.source_record.provenance.speaker_ref, input.source.speaker_ref);
  assert.equal(result.records.intake.observation.provenance.speaker_ref, input.source.speaker_ref);
  assert.equal(result.records.intake.disposition_record.provenance.speaker_ref, input.source.speaker_ref);
});

test("writeConversationPreferenceFlowToStore derives distinct semantic slots for distinct speakers", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const first = buildInput(rootDir);
  first.source.speaker_ref = "actor_external_person_slot_001";
  first.source.message = "Participant A says they prefer concise answers.";
  first.validation_scope = "test:conversation-preference:speaker-slot-001";

  const second = cloneInputWithSuffix(rootDir, "speaker_slot_002", first.statement);
  second.source.speaker_ref = "actor_external_person_slot_002";
  second.source.message = "Participant B says they prefer concise answers.";

  const [firstResult, secondResult] = await Promise.all([
    writeConversationPreferenceFlowToStore(first),
    writeConversationPreferenceFlowToStore(second),
  ]);

  assert.notEqual(
    firstResult.records.intake.world_claim.semantic_slot,
    secondResult.records.intake.world_claim.semantic_slot,
  );
  assert.equal(firstResult.records.ratification_record.decision, "approved");
  assert.equal(secondResult.records.ratification_record.decision, "approved");
});

test("writeConversationPreferenceFlowToStore routes participant-originated owner claims to review instead of canon", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.statement = "The owner prefers strategic summaries on Fridays.";
  input.source.message = "A participant says the owner prefers strategic summaries on Fridays.";
  input.source.speaker_ref = "actor_external_person_owner_review_001";
  input.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant reported an owner preference that requires owner ratification.",
  };

  const result = await writeConversationPreferenceFlowToStore(input);

  assert.equal(result.records.intake.proposal.promotion_requirement, "owner_ratification_required");
  assert.deepEqual(result.records.intake.disposition_record.outcomes, ["world_update", "wiki_update", "queued_review"]);
  assert.equal(result.records.intake.disposition_record.proposal_refs, undefined);
  assert.equal(result.records.ratification_record.decision, "deferred");
  assert.equal(result.records.canonical_record, undefined);
  assert.equal(result.records.diagnostic?.code, "proposal_deferred");
  assert.equal(result.records.owner_ratification_queue?.status, "pending");
  assert.equal(result.records.owner_ratification_queue?.proposal_refs[0], input.ids.proposal);

  const projectionMarkdown = await readFile(result.paths.projection_markdown, "utf8");
  assert.doesNotMatch(projectionMarkdown, /\[canon:/);
  assert.match(projectionMarkdown, /## Review Queue/);
  assert.match(projectionMarkdown, /\[review:cur_owner_ratification_prop_test_001\] \(owner_ratification; pending\)/);
  assert.ok(result.records.projection_manifest.review_refs?.includes("cur_owner_ratification_prop_test_001"));
});

test("owner ratification queue lists deferred owner-scoped claims and can ratify them by queue id", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.statement = "The owner prefers strategic summaries on Fridays.";
  input.source.message = "A participant says the owner prefers strategic summaries on Fridays.";
  input.source.speaker_ref = "actor_external_person_owner_review_001";
  input.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant reported an owner preference that requires owner ratification.",
  };

  await writeConversationPreferenceFlowToStore(input);
  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);

  assert.equal(queue.length, 1);
  assert.equal(queue[0]!.proposal_id, input.ids.proposal);
  assert.equal(queue[0]!.owner_identity_ref, input.identity_context?.ids.owner_identity ?? null);
  assert.equal(queue[0]!.statement, input.statement);

  const ratified = await ratifyQueuedConversationPreferenceProposalToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-12T00:05:00.000Z",
    actor: input.identity_context!.ids.owner_identity!,
    authenticated_principal: ownerPrincipal(input),
    owner_actor_ref: input.identity_context!.ids.owner_identity!,
    validation_scope: "test:conversation-preference:owner-ratification",
  });

  assert.equal(ratified.records.ratification_record.decision, "approved");
  assert.deepEqual(ratified.records.ratification_record.authenticated_principal, ownerPrincipal(input));
  assert.equal(ratified.records.canonical_record?.statement, input.statement);
  assert.equal(ratified.records.diagnostic?.code, "proposal_deferred_resolved");
  assert.equal(ratified.records.owner_ratification_queue?.status, "applied");

  const projectionMarkdown = await readFile(ratified.paths.projection_markdown, "utf8");
  assert.match(projectionMarkdown, /\[canon:/);
  assert.match(projectionMarkdown, /## Review Trace/);
  assert.match(projectionMarkdown, /\[review:cur_owner_ratification_prop_test_001\] \(owner_ratification; applied\)/);

  const queueAfter = await listConversationPreferenceOwnerRatificationQueue(rootDir);
  assert.deepEqual(queueAfter, []);

  const ratifiedReplay = await ratifyQueuedConversationPreferenceProposalToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-12T00:06:00.000Z",
    actor: input.identity_context!.ids.owner_identity!,
    authenticated_principal: ownerPrincipal(input),
    owner_actor_ref: input.identity_context!.ids.owner_identity!,
    validation_scope: "test:conversation-preference:owner-ratification-replay",
  });
  assert.equal(ratifiedReplay.reused, true);
  assert.equal(ratifiedReplay.records.owner_ratification_queue?.status, "applied");
  assert.equal(ratifiedReplay.records.ratification_record.decision, "approved");
});

test("owner ratification queue recovers pending owner-ratification journals before applying by queue id", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.statement = "The owner prefers strategic summaries on Fridays.";
  input.source.message = "A participant says the owner prefers strategic summaries on Fridays.";
  input.source.speaker_ref = "actor_external_person_owner_review_001";
  input.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant reported an owner preference that requires owner ratification.",
  };

  await writeConversationPreferenceFlowToStore(input);
  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);
  const recoveryJournalPath = join(
    rootDir,
    `audits/snapshots/recovery-conversation_preference_owner_ratification_apply-${input.ids.proposal}.json`,
  );
  const recoveryMarkerRelativePath = "audits/snapshots/queued-owner-ratification-recovered.txt";
  const recoveryMarkerPath = join(rootDir, recoveryMarkerRelativePath);

  await writeFile(
    recoveryJournalPath,
    `${JSON.stringify(
      {
        version: 1,
        operation: "conversation_preference_owner_ratification_apply",
        created_at: "2026-04-12T00:04:30.000Z",
        files: [
          {
            relative_path: recoveryMarkerRelativePath,
            content: "recovered queued owner ratification\n",
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await ratifyQueuedConversationPreferenceProposalToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-12T00:05:00.000Z",
    actor: input.identity_context!.ids.owner_identity!,
    authenticated_principal: ownerPrincipal(input),
    owner_actor_ref: input.identity_context!.ids.owner_identity!,
    validation_scope: "test:conversation-preference:owner-ratification-recovery",
  });

  assert.equal(await readFile(recoveryMarkerPath, "utf8"), "recovered queued owner ratification\n");
  await assert.rejects(() => access(recoveryJournalPath), /ENOENT/);
});

test("owner ratification queue refuses stale promotion when a conflicting world claim is still active", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildInput(rootDir);
  firstInput.statement = "The owner prefers strategic summaries on Fridays.";
  firstInput.source.message = "A participant says the owner prefers strategic summaries on Fridays.";
  firstInput.source.speaker_ref = "actor_external_person_owner_review_001";
  firstInput.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant reported an owner preference that requires owner ratification.",
  };

  await writeConversationPreferenceFlowToStore(firstInput);

  const secondInput = cloneInputWithSuffix(
    rootDir,
    "owner_conflict_002",
    "The owner prefers tactical summaries on Fridays.",
  );
  secondInput.source.message = "A participant says the owner prefers tactical summaries on Fridays.";
  secondInput.source.speaker_ref = "actor_external_person_owner_review_002";
  secondInput.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant reported an owner preference that requires owner ratification.",
  };

  const secondResult = await writeConversationPreferenceFlowToStore(secondInput);
  assert.equal(secondResult.records.ratification_record.decision, "rejected");
  assert.equal(secondResult.records.contradiction?.status, "open");

  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);
  assert.equal(queue.length, 1);
  assert.equal(queue[0]!.proposal_id, firstInput.ids.proposal);

  await assert.rejects(
    () =>
      ratifyQueuedConversationPreferenceProposalToStore({
        rootDir,
        queue_id: queue[0]!.queue_id,
        now: "2026-04-12T00:05:00.000Z",
        actor: firstInput.identity_context!.ids.owner_identity!,
        authenticated_principal: ownerPrincipal(firstInput),
        owner_actor_ref: firstInput.identity_context!.ids.owner_identity!,
        validation_scope: "test:conversation-preference:owner-ratification-conflict",
      }),
    /conflict:active_world_conflict/,
  );

  const reloaded = await readConversationPreferenceFlowResult(firstInput);
  assert.equal(reloaded?.records.ratification_record.decision, "deferred");
  assert.equal(reloaded?.records.canonical_record, undefined);
  assert.equal(reloaded?.records.owner_ratification_queue?.status, "pending");
});

test("owner ratification queue can be explicitly rejected by the owner", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.statement = "The owner prefers strategic summaries on Fridays.";
  input.source.message = "A participant says the owner prefers strategic summaries on Fridays.";
  input.source.speaker_ref = "actor_external_person_owner_review_001";
  input.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant reported an owner preference that requires owner ratification.",
  };

  await writeConversationPreferenceFlowToStore(input);
  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);

  const rejected = await rejectQueuedConversationPreferenceProposalToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-12T00:05:00.000Z",
    actor: input.identity_context!.ids.owner_identity!,
    authenticated_principal: ownerPrincipal(input),
    owner_actor_ref: input.identity_context!.ids.owner_identity!,
    validation_scope: "test:conversation-preference:owner-rejection",
  });

  assert.equal(rejected.records.ratification_record.decision, "rejected");
  assert.equal(rejected.records.owner_ratification_queue?.status, "answered");
  assert.equal(rejected.records.canonical_record, undefined);
  assert.equal(rejected.records.diagnostic?.code, "proposal_deferred_rejected");
  const rejectionProjection = await readFile(rejected.paths.projection_markdown, "utf8");
  assert.match(rejectionProjection, /\[review:cur_owner_ratification_prop_test_001\] \(owner_ratification; answered\)/);

  const queueAfter = await listConversationPreferenceOwnerRatificationQueue(rootDir);
  assert.deepEqual(queueAfter, []);

  const rejectedReplay = await rejectQueuedConversationPreferenceProposalToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-12T00:06:00.000Z",
    actor: input.identity_context!.ids.owner_identity!,
    authenticated_principal: ownerPrincipal(input),
    owner_actor_ref: input.identity_context!.ids.owner_identity!,
    validation_scope: "test:conversation-preference:owner-rejection-replay",
  });
  assert.equal(rejectedReplay.reused, true);
  assert.equal(rejectedReplay.records.owner_ratification_queue?.status, "answered");
  assert.equal(rejectedReplay.records.ratification_record.decision, "rejected");
});

test("owner ratification queue rejects a non-owner actor even when owner_actor_ref matches", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.statement = "The owner prefers strategic summaries on Fridays.";
  input.source.message = "A participant says the owner prefers strategic summaries on Fridays.";
  input.source.speaker_ref = "actor_external_person_owner_review_001";
  input.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant reported an owner preference that requires owner ratification.",
  };

  await writeConversationPreferenceFlowToStore(input);
  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);

  await assert.rejects(
    () =>
      ratifyQueuedConversationPreferenceProposalToStore({
        rootDir,
        queue_id: queue[0]!.queue_id,
        now: "2026-04-12T00:05:00.000Z",
        actor: "actor_intruder_test_001",
        authenticated_principal: participantPrincipal("actor_intruder_test_001"),
        owner_actor_ref: input.identity_context!.ids.owner_identity!,
        validation_scope: "test:conversation-preference:owner-ratification-forged-actor",
      }),
    /requires authenticated owner principal actor_owner_test_001/,
  );

  const queueAfter = await listConversationPreferenceOwnerRatificationQueue(rootDir);
  assert.equal(queueAfter.length, 1);
  assert.equal(queueAfter[0]!.queue_id, queue[0]!.queue_id);
});

test("owner ratification queue can expire without owner ratification and blocks later approval", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.statement = "The owner prefers strategic summaries on Fridays.";
  input.source.message = "A participant says the owner prefers strategic summaries on Fridays.";
  input.source.speaker_ref = "actor_external_person_owner_review_001";
  input.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant reported an owner preference that requires owner ratification.",
  };

  await writeConversationPreferenceFlowToStore(input);
  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);

  const expired = await expireQueuedConversationPreferenceProposalToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-12T00:05:00.000Z",
    actor: "system:test-expirer",
    authenticated_principal: systemPrincipal("system:test-expirer"),
    validation_scope: "test:conversation-preference:owner-expiration",
  });

  assert.equal(expired.records.ratification_record.decision, "expired");
  assert.deepEqual(
    expired.records.ratification_record.authenticated_principal,
    systemPrincipal("system:test-expirer"),
  );
  assert.equal(expired.records.owner_ratification_queue?.status, "expired");
  assert.equal(expired.records.canonical_record, undefined);
  assert.equal(expired.records.diagnostic?.code, "proposal_deferred_expired");
  const expiredProjection = await readFile(expired.paths.projection_markdown, "utf8");
  assert.match(expiredProjection, /\[review:cur_owner_ratification_prop_test_001\] \(owner_ratification; expired\)/);

  await assert.rejects(
    () =>
      ratifyQueuedConversationPreferenceProposalToStore({
        rootDir,
        queue_id: queue[0]!.queue_id,
        now: "2026-04-12T00:10:00.000Z",
        actor: input.identity_context!.ids.owner_identity!,
        authenticated_principal: ownerPrincipal(input),
        owner_actor_ref: input.identity_context!.ids.owner_identity!,
        validation_scope: "test:conversation-preference:owner-ratification-after-expire",
      }),
    /already closed with status expired/,
  );

  const expiredReplay = await expireQueuedConversationPreferenceProposalToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-12T00:06:00.000Z",
    actor: "system:test-expirer",
    authenticated_principal: systemPrincipal("system:test-expirer"),
    validation_scope: "test:conversation-preference:owner-expiration-replay",
  });
  assert.equal(expiredReplay.reused, true);
  assert.equal(expiredReplay.records.owner_ratification_queue?.status, "expired");
  assert.equal(expiredReplay.records.ratification_record.decision, "expired");
});

test("owner ratification queue rejects expiration by a non-owner non-system principal", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.statement = "The owner prefers strategic summaries on Fridays.";
  input.source.message = "A participant says the owner prefers strategic summaries on Fridays.";
  input.source.speaker_ref = "actor_external_person_owner_review_001";
  input.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant reported an owner preference that requires owner ratification.",
  };

  await writeConversationPreferenceFlowToStore(input);
  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);

  await assert.rejects(
    () =>
      expireQueuedConversationPreferenceProposalToStore({
        rootDir,
        queue_id: queue[0]!.queue_id,
        now: "2026-04-12T00:05:00.000Z",
        actor: "actor_participant_expirer_001",
        authenticated_principal: participantPrincipal("actor_participant_expirer_001"),
        validation_scope: "test:conversation-preference:owner-expiration-forbidden",
      }),
    /requires authenticated system principal or owner actor_owner_test_001/,
  );
});

test("owner review terminal actions append distinct validation log entries per phase", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.statement = "The owner prefers strategic summaries on Fridays.";
  input.source.message = "A participant says the owner prefers strategic summaries on Fridays.";
  input.source.speaker_ref = "actor_external_person_owner_review_001";
  input.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant reported an owner preference that requires owner ratification.",
  };

  await writeConversationPreferenceFlowToStore(input);
  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);

  await rejectQueuedConversationPreferenceProposalToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-12T00:05:00.000Z",
    actor: input.identity_context!.ids.owner_identity!,
    authenticated_principal: ownerPrincipal(input),
    owner_actor_ref: input.identity_context!.ids.owner_identity!,
    validation_scope: "test:conversation-preference:owner-rejection",
  });

  const validationLog = await readFile(join(rootDir, "audits/validation.log"), "utf8");
  assert.match(validationLog, /"entry_id":"validation:prop_test_001:write"/);
  assert.match(validationLog, /"entry_id":"validation:prop_test_001:owner-review-close"/);
});

test("ratifyDeferredConversationPreferenceProposalToStore remains compatible with the original input-shaped API", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.statement = "The owner prefers strategic summaries on Fridays.";
  input.source.message = "A participant says the owner prefers strategic summaries on Fridays.";
  input.source.speaker_ref = "actor_external_person_owner_review_001";
  input.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant reported an owner preference that requires owner ratification.",
  };

  await writeConversationPreferenceFlowToStore(input);

  const ratified = await ratifyDeferredConversationPreferenceProposalToStore({
    ...input,
    now: "2026-04-12T00:05:00.000Z",
    actor: input.identity_context!.ids.owner_identity!,
    authenticated_principal: ownerPrincipal(input),
    owner_actor_ref: input.identity_context!.ids.owner_identity!,
    validation_scope: "test:conversation-preference:owner-ratification:compat",
  });

  assert.equal(ratified.records.ratification_record.decision, "approved");
  assert.equal(ratified.records.owner_ratification_queue?.status, "applied");
});

test("writeConversationPreferenceFlowToStore serializes concurrent canonical writes for the same semantic slot", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const left = cloneInputWithSuffix(rootDir, "parallel_a", "The user prefers concise answers.");
  const right = cloneInputWithSuffix(rootDir, "parallel_b", "The user prefers expansive answers.");

  const [leftResult, rightResult] = await Promise.all([
    writeConversationPreferenceFlowToStore(left),
    writeConversationPreferenceFlowToStore(right),
  ]);

  const canonicalRecords = await loadCanonicalRecords(rootDir);
  const semanticSlot = leftResult.records.intake.world_claim.semantic_slot;
  const activeCanonical = canonicalRecords.filter(
    (record) => record.semantic_slot === semanticSlot && record.governance_state === "ratified",
  );

  assert.equal(activeCanonical.length, 1);
  assert.equal(
    [leftResult.records.canonical_record, rightResult.records.canonical_record].filter((record) => record !== undefined).length,
    1,
  );
  assert.equal(
    [leftResult.records.ratification_record.decision, rightResult.records.ratification_record.decision].filter((decision) => decision === "approved").length,
    1,
  );
  assert.equal(
    [leftResult.records.ratification_record.decision, rightResult.records.ratification_record.decision].filter((decision) => decision === "rejected").length,
    1,
  );
});

test("writeConversationPreferenceFlowToStore promotes owner-originated owner claims into canon", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.actor = input.identity_context!.ids.owner_identity!;
  input.authenticated_principal = ownerPrincipal(input);
  input.statement = "The owner prefers strategic summaries on Fridays.";
  input.source.message = "The owner confirms they prefer strategic summaries on Fridays.";
  input.source.speaker_ref = input.identity_context?.ids.owner_identity;
  input.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Owner-originated preference signal.",
  };

  const result = await writeConversationPreferenceFlowToStore(input);

  assert.equal(result.records.intake.proposal.promotion_requirement, "none");
  assert.deepEqual(result.records.intake.disposition_record.outcomes, ["world_update", "wiki_update", "proposal_for_canon"]);
  assert.equal(result.records.ratification_record.decision, "approved");
  assert.equal(result.records.canonical_record?.statement, input.statement);
});

test("writeConversationPreferenceFlowToStore does not treat owner speaker_ref as owner authority without an authenticated owner principal", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.actor = "actor_participant_owner_spoof_001";
  input.authenticated_principal = participantPrincipal(input.actor);
  input.statement = "The owner prefers strategic summaries on Fridays.";
  input.source.message = "A participant claims the owner prefers strategic summaries on Fridays.";
  input.source.speaker_ref = input.identity_context?.ids.owner_identity;
  input.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant-originated owner claim should still require owner ratification.",
  };

  const result = await writeConversationPreferenceFlowToStore(input);

  assert.equal(result.records.intake.proposal.promotion_requirement, "owner_ratification_required");
  assert.equal(result.records.ratification_record.decision, "deferred");
  assert.equal(result.records.canonical_record, undefined);
  assert.ok(result.records.intake.disposition_record.reason_codes.includes("speaker_claim_not_authority"));
});

test("writeConversationPreferenceFlowToStore keeps default participant subject neutral when speaker_ref is absent", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const result = await writeConversationPreferenceFlowToStore(buildInput(rootDir));

  assert.match(result.records.intake.world_claim.semantic_slot, /runtime-test-001/);
  assert.doesNotMatch(result.records.intake.world_claim.semantic_slot, /actor_owner_test_001/);
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

test("writeConversationPreferenceFlowToStore rejects reuse when raw source payload changes", async (t) => {
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
        source: {
          ...input.source,
          message: "Same normalized claim arrived with a different raw payload.",
        },
      }),
    /source\.payload/,
  );
});

test("writeConversationPreferenceFlowToStore rejects reuse when semantic profile fingerprint changes", async (t) => {
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
        semantic_profile: {
          proposal_reason: "Same evidence is being routed under a changed semantic profile.",
        },
      }),
    /source\.semantic_profile_fingerprint/,
  );
});

test("writeConversationPreferenceFlowToStore rejects reuse with mismatched identity metadata", async (t) => {
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
        identity_context: {
          ...input.identity_context!,
          owner_label: "Other Owner",
          thread_summary: "Changed summary",
          message_refs: ["msg_test_changed_001"],
        },
      }),
    /does not match input/,
  );
});

test("writeConversationPreferenceFlowToStore rejects reuse when authenticated authority changes", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.actor = "actor_participant_authority_change_001";
  input.authenticated_principal = participantPrincipal(input.actor);
  input.statement = "The owner prefers strategic summaries on Fridays.";
  input.source.message = "A participant says the owner prefers strategic summaries on Fridays.";
  input.source.speaker_ref = input.identity_context?.ids.owner_identity;
  input.semantic_profile = {
    subject_entity_kind: "owner",
    subject_authority_role: "owner",
    subject_label: "Test Owner",
    wiki_title: "Owner Interaction Preferences",
    wiki_path: "wiki/pages/owner-interaction-preferences.md",
    preference_topic_label: "Owner Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Participant-originated owner claim should still require owner ratification.",
  };

  const first = await writeConversationPreferenceFlowToStore(input);
  assert.equal(first.records.intake.proposal.promotion_requirement, "owner_ratification_required");

  await assert.rejects(
    () =>
      writeConversationPreferenceFlowToStore({
        ...input,
        now: "2026-04-12T00:05:00.000Z",
        actor: input.identity_context!.ids.owner_identity!,
        authenticated_principal: ownerPrincipal(input),
      }),
    /does not match input/,
  );
});

test("writeConversationPreferenceFlowToStore rejects authenticated system principals without scope", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.actor = "system:test-missing-scope";
  input.authenticated_principal = {
    kind: "system",
    actor_ref: input.actor,
    system_scope: "",
  } as unknown as NonNullable<ConversationPreferenceStoreInput["authenticated_principal"]>;

  await assert.rejects(
    () => writeConversationPreferenceFlowToStore(input),
    /requires a non-empty system_scope/,
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

test("writeConversationPreferenceFlowToStore repairs drifted derived artifacts on rerun", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  const first = await writeConversationPreferenceFlowToStore(input);
  const auditLogBefore = await readFile(join(rootDir, "audits/changes.log"), "utf8");

  await writeFile(first.paths.wiki_page_markdown, "# drifted\n", "utf8");
  await writeFile(first.paths.projection_markdown, "# drifted projection\n", "utf8");
  await writeFile(first.paths.projection_artifacts.wiki, "{\n  \"broken\": true\n}\n", "utf8");

  const repaired = await writeConversationPreferenceFlowToStore(input);
  const auditLogAfter = await readFile(join(rootDir, "audits/changes.log"), "utf8");
  const repairedWikiMarkdown = await readFile(first.paths.wiki_page_markdown, "utf8");
  const repairedProjectionMarkdown = await readFile(first.paths.projection_markdown, "utf8");

  assert.equal(repaired.reused, true);
  assert.match(repairedWikiMarkdown, /User Interaction Preferences/);
  assert.match(repairedProjectionMarkdown, /\[canon:mem_test_001\]/);
  assert.equal(auditLogAfter, auditLogBefore);
});

test("writeConversationPreferenceFlowToStore recovers from partial authoritative materialization on rerun", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  const first = await writeConversationPreferenceFlowToStore(input);

  await unlink(first.paths.canonical_record);

  const recovered = await writeConversationPreferenceFlowToStore(input);
  const projectionMarkdown = await readFile(first.paths.projection_markdown, "utf8");

  assert.equal(recovered.reused, false);
  assert.equal(recovered.records.canonical_record?.id, input.ids.canonical);
  assert.match(projectionMarkdown, /\[canon:mem_test_001\]/);
});

test("writeConversationPreferenceFlowToStore rejects source payloads outside raw storage", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await assert.rejects(
    () =>
      writeConversationPreferenceFlowToStore({
        ...buildInput(rootDir),
        source: {
          ...buildInput(rootDir).source,
          content_ref: "wiki/index.md",
        },
      }),
    /Source content_ref must stay within raw\/ sources, imports, or attachments/,
  );
});

test("writeConversationPreferenceFlowToStore rejects source payload traversal into another layer", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const escapedPath = join(rootDir, "canon/preferences/foreign-overwrite.json");

  await assert.rejects(
    () =>
      writeConversationPreferenceFlowToStore({
        ...buildInput(rootDir),
        source: {
          ...buildInput(rootDir).source,
          content_ref: "raw/sources/../../canon/preferences/foreign-overwrite.json",
        },
      }),
    /Source content_ref must stay within raw\/ sources, imports, or attachments/,
  );

  await assert.rejects(() => access(escapedPath));
});

test("writeConversationPreferenceFlowToStore normalizes source payload paths that stay within raw", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const result = await writeConversationPreferenceFlowToStore({
    ...buildInput(rootDir),
    source: {
      ...buildInput(rootDir).source,
      content_ref: "raw/sources/../sources/conversation-turn-test-001.json",
    },
  });

  assert.equal(
    result.records.source_record.content_ref,
    "raw/sources/conversation-turn-test-001.json",
  );
  assert.equal(
    result.paths.raw_source,
    join(rootDir, "raw/sources/conversation-turn-test-001.json"),
  );
});

test("writeConversationPreferenceFlowToStore rejects path collisions between raw payload and authoritative records", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  await assert.rejects(
    () =>
      writeConversationPreferenceFlowToStore({
        ...input,
        source: {
          ...input.source,
          content_ref: `raw/sources/${input.source.id}.json`,
        },
      }),
    /paths collide: raw_source and source_record/,
  );
});

test("writeConversationPreferenceFlowToStore rejects reusing a raw content_ref owned by another source record", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const first = buildInput(rootDir);
  const firstResult = await writeConversationPreferenceFlowToStore(first);
  const originalPayload = await readFile(firstResult.paths.raw_source, "utf8");

  const second = cloneInputWithSuffix(
    rootDir,
    "content_ref_reuse_002",
    "The user prefers exhaustive answers for audits.",
  );
  second.source.content_ref = first.source.content_ref;

  await assert.rejects(
    () => writeConversationPreferenceFlowToStore(second),
    /already owned by source_record/,
  );

  assert.equal(await readFile(firstResult.paths.raw_source, "utf8"), originalPayload);
});

test("writeConversationPreferenceFlowToStore rejects wiki paths outside wiki/pages markdown storage", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  input.semantic_profile = {
    subject_entity_kind: "participant",
    subject_authority_role: "participant",
    subject_label: "Conversation Participant",
    wiki_title: "User Interaction Preferences",
    wiki_path: "manifest.yaml",
    preference_topic_label: "User Interaction Preferences",
    relation_type: "expressed_preference",
    proposal_reason: "Conversation indicates a user interaction preference that should become governed memory.",
  };

  await assert.rejects(
    () => writeConversationPreferenceFlowToStore(input),
    /Wiki page path must stay within wiki\/pages and end with \.md/,
  );
});

test("writeConversationPreferenceFlowToStore preserves canonical identity records across distinct flows", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(firstInput);

  const secondInput: AuthenticatedConversationPreferenceStoreInput = {
    ...buildInput(rootDir),
    now: "2026-04-13T00:00:00.000Z",
    statement: "The user now asks for terse summaries first.",
    identity_context: {
      ...buildInput(rootDir).identity_context!,
      agent_label: "Changed Agent Label",
      owner_label: "Changed Owner Label",
    },
    source: {
      id: "src_test_002",
      source_ref: "runtime/session-test#turn-002",
      content_ref: "raw/sources/conversation-turn-test-002.json",
      runtime: "openclaw",
      message: "The user now asks for terse summaries first.",
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

  await writeConversationPreferenceFlowToStore(secondInput);

  const actorIdentity = JSON.parse(
    await readFile(join(rootDir, "canon/identity/actor_agent_test_001.json"), "utf8"),
  ) as {
    created_at: string;
    updated_at?: string | null;
    label: string;
    provenance: { source_ref: string };
  };

  assert.equal(actorIdentity.created_at, firstInput.now);
  assert.equal(actorIdentity.updated_at, firstInput.now);
  assert.equal(actorIdentity.label, firstInput.identity_context?.agent_label);
  assert.equal(actorIdentity.provenance.source_ref, firstInput.source.source_ref);

  const ownerIdentity = JSON.parse(
    await readFile(join(rootDir, "canon/identity/actor_owner_test_001.json"), "utf8"),
  ) as {
    updated_at?: string | null;
    label: string;
  };

  assert.equal(ownerIdentity.updated_at, firstInput.now);
  assert.equal(ownerIdentity.label, firstInput.identity_context?.owner_label);
});

test("writeConversationPreferenceFlowToStore merges thread message_refs across distinct flows in the same thread", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const first = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(first);

  const second = cloneInputWithSuffix(
    rootDir,
    "thread_merge_002",
    "The user now asks for terse summaries first.",
  );
  second.identity_context = {
    ...second.identity_context!,
    message_refs: ["msg_test_002"],
  };

  await writeConversationPreferenceFlowToStore(second);

  const thread = JSON.parse(
    await readFile(join(rootDir, "runtime/threads/thread_test_001.json"), "utf8"),
  ) as {
    message_refs: string[];
  };

  assert.deepEqual(thread.message_refs, ["msg_test_001", "msg_test_002"]);
});

test("writeConversationPreferenceFlowToStore does not leak unscoped owner-private records into another runtime projection", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await writeStructuredPreferenceSignalFlowToStore({
    ...buildInput(rootDir),
    source: {
      ...buildInput(rootDir).source,
      id: "src_structured_scope_001",
      source_ref: "import/customer-001",
      content_ref: "raw/imports/customer-001.json",
      runtime: "generic",
      message: "Customer 001 prefers weekly status summaries.",
      source_type: "structured_import",
    },
    identity_context: undefined,
    statement: "Customer 001 prefers weekly status summaries.",
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
      observation: "obs_structured_scope_001",
      episode: "ep_structured_scope_001",
      subject_entity: "ent_subject_structured_scope_001",
      preference_entity: "ent_preference_structured_scope_001",
      preference_relation: "rel_preference_structured_scope_001",
      world_claim: "wcl_structured_scope_001",
      contradiction: "contra_structured_scope_001",
      contradiction_resolution: "cres_structured_scope_001",
      wiki_page: "wpg_structured_scope_001",
      wiki_claim: "wclm_structured_scope_001",
      proposal: "prop_structured_scope_001",
      disposition: "disp_structured_scope_001",
      ratification: "rat_structured_scope_001",
      diagnostic: "diag_structured_scope_001",
      canonical: "mem_structured_scope_001",
      canon_artifact: "part_openclaw_canon_structured_scope_001",
      world_artifact: "part_openclaw_world_structured_scope_001",
      wiki_artifact: "part_openclaw_wiki_structured_scope_001",
      projection_manifest: "pmf_openclaw_structured_scope_001",
    },
  });

  const runtimeFlow = await writeConversationPreferenceFlowToStore(buildInput(rootDir));
  const projectionMarkdown = await readFile(runtimeFlow.paths.projection_markdown, "utf8");

  assert.doesNotMatch(projectionMarkdown, /\[canon:mem_structured_scope_001\]/);
  assert.doesNotMatch(projectionMarkdown, /\[world:wcl_structured_scope_001\]/);
  assert.doesNotMatch(projectionMarkdown, /\[wiki:wpg_structured_scope_001\]/);
});

test("writeConversationPreferenceFlowToStore keeps projection markdown isolated per manifest", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildInput(rootDir);
  const first = await writeConversationPreferenceFlowToStore(firstInput);
  const firstProjectionBefore = await readFile(first.paths.projection_markdown, "utf8");

  const secondInput: AuthenticatedConversationPreferenceStoreInput = {
    ...buildInput(rootDir),
    now: "2026-04-12T01:00:00.000Z",
    statement: "The user now prefers exhaustive answers by default.",
    source: {
      id: "src_test_projection_002",
      source_ref: "runtime/session-test#turn-projection-002",
      content_ref: "raw/sources/conversation-turn-test-projection-002.json",
      runtime: "openclaw",
      message: "The user now says they prefer exhaustive answers by default.",
    },
    ids: {
      observation: "obs_test_projection_002",
      episode: "ep_test_projection_002",
      subject_entity: "ent_subject_test_projection_002",
      preference_entity: "ent_preference_test_projection_002",
      preference_relation: "rel_preference_test_projection_002",
      world_claim: "wcl_test_projection_002",
      contradiction: "contra_test_projection_002",
      contradiction_resolution: "cres_test_projection_002",
      wiki_page: "wpg_test_projection_002",
      wiki_claim: "wclm_test_projection_002",
      proposal: "prop_test_projection_002",
      disposition: "disp_test_projection_002",
      ratification: "rat_test_projection_002",
      diagnostic: "diag_test_projection_002",
      canonical: "mem_test_projection_002",
      canon_artifact: "part_openclaw_canon_test_projection_002",
      world_artifact: "part_openclaw_world_test_projection_002",
      wiki_artifact: "part_openclaw_wiki_test_projection_002",
      projection_manifest: "pmf_openclaw_test_projection_002",
    },
  };

  const second = await writeConversationPreferenceFlowToStore(secondInput);
  const firstProjectionAfter = await readFile(first.paths.projection_markdown, "utf8");
  const secondProjection = await readFile(second.paths.projection_markdown, "utf8");

  assert.notEqual(first.paths.projection_markdown, second.paths.projection_markdown);
  assert.equal(firstProjectionAfter, firstProjectionBefore);
  assert.match(firstProjectionAfter, /\[canon:mem_test_001\]/);
  assert.match(secondProjection, /\[canon:mem_test_001\]/);
  assert.match(secondProjection, /\[world:wcl_test_projection_002\]/);
});

test("writeConversationPreferenceFlowToStore records contradictions against existing active world claims", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(firstInput);

  const secondInput: AuthenticatedConversationPreferenceStoreInput = {
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
  assert.equal(second.records.ratification_record.decision, "rejected");
  assert.equal(second.records.canonical_record, undefined);
  assert.equal(second.records.diagnostic?.code, "proposal_rejected");
  assert.deepEqual(second.records.intake.disposition_record.outcomes, ["world_update", "wiki_update", "queued_review"]);

  const projectionMarkdown = await readFile(second.paths.projection_markdown, "utf8");
  assert.match(projectionMarkdown, /\[canon:mem_test_001\] \(ratified; active\)/);
  assert.doesNotMatch(projectionMarkdown, /\[canon:mem_test_002\]/);
});

test("readConversationPreferenceFlowResult rejects recovery journals that escape the store root", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  const outsidePath = join(tmpdir(), "cristalina-core-recovery-escape.txt");
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await rm(outsidePath, { force: true });
  });

  const input = buildInput(rootDir);
  await mkdir(join(rootDir, "audits/snapshots"), { recursive: true });
  await writeFile(
    join(rootDir, `audits/snapshots/recovery-conversation_preference_write-${input.ids.proposal}.json`),
    JSON.stringify({
      version: 1,
      operation: "conversation_preference_write",
      created_at: input.now,
      files: [
        {
          path: outsidePath,
          content: "escape\n",
        },
      ],
    }, null, 2),
    "utf8",
  );

  await assert.rejects(
    () => readConversationPreferenceFlowResult(input),
    /Resolved path escapes store root/,
  );
  await assert.rejects(() => readFile(outsidePath, "utf8"));
});

test("readConversationPreferenceFlowResult waits for the active store lock before attempting repair", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(input);

  const lockDir = join(rootDir, "audits/snapshots/.store-write.lock");
  await mkdir(lockDir, { recursive: true });
  await writeFile(
    join(lockDir, "owner.json"),
    JSON.stringify({
      holder: "test:foreign-lock",
      acquired_at: "2026-04-12T00:00:00.000Z",
      heartbeat_at: new Date().toISOString(),
    }, null, 2),
    "utf8",
  );

  const releaseTimer = setTimeout(() => {
    void rm(lockDir, { recursive: true, force: true });
  }, 60);
  t.after(() => clearTimeout(releaseTimer));

  const startedAt = Date.now();
  const result = await readConversationPreferenceFlowResult(input);
  const elapsedMs = Date.now() - startedAt;

  assert.ok(result);
  assert.ok(elapsedMs >= 40, `expected read to wait for store lock, got ${elapsedMs}ms`);
});

test("applyConversationPreferenceResolutionToStore persists applied resolution and recompiles projection", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(firstInput);

  const secondInput: AuthenticatedConversationPreferenceStoreInput = {
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
  assert.equal(applied.records.canonical_record, undefined);

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

test("applyConversationPreferenceResolutionToStore supports supersede_candidate resolutions", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(firstInput);

  const secondInput: AuthenticatedConversationPreferenceStoreInput = {
    ...buildInput(rootDir),
    now: "2026-04-12T01:00:00.000Z",
    statement: "The user now prefers exhaustive answers by default.",
    source: {
      id: "src_test_supersede_candidate_002",
      source_ref: "runtime/session-test#turn-supersede-candidate-002",
      content_ref: "raw/sources/conversation-turn-test-supersede-candidate-002.json",
      runtime: "openclaw",
      message: "The user now says they prefer exhaustive answers by default.",
    },
    ids: {
      observation: "obs_test_supersede_candidate_002",
      episode: "ep_test_supersede_candidate_002",
      subject_entity: "ent_subject_test_supersede_candidate_002",
      preference_entity: "ent_preference_test_supersede_candidate_002",
      preference_relation: "rel_preference_test_supersede_candidate_002",
      world_claim: "wcl_test_supersede_candidate_002",
      contradiction: "contra_test_supersede_candidate_002",
      contradiction_resolution: "cres_test_supersede_candidate_002",
      wiki_page: "wpg_test_supersede_candidate_002",
      wiki_claim: "wclm_test_supersede_candidate_002",
      proposal: "prop_test_supersede_candidate_002",
      disposition: "disp_test_supersede_candidate_002",
      ratification: "rat_test_supersede_candidate_002",
      diagnostic: "diag_test_supersede_candidate_002",
      canonical: "mem_test_supersede_candidate_002",
      canon_artifact: "part_openclaw_canon_test_supersede_candidate_002",
      world_artifact: "part_openclaw_world_test_supersede_candidate_002",
      wiki_artifact: "part_openclaw_wiki_test_supersede_candidate_002",
      projection_manifest: "pmf_openclaw_test_supersede_candidate_002",
    },
  };

  const second = await writeConversationPreferenceFlowToStore(secondInput);
  await writeCoreRecord(rootDir, {
    ...second.records.contradiction_resolution!,
    strategy: "supersede_candidate",
    winning_ref: second.records.contradiction!.left_ref,
    losing_ref: second.records.contradiction!.right_ref,
    status: "proposed",
    rationale: "Reviewer kept the existing claim and retired the candidate.",
  });

  const applied = await applyConversationPreferenceResolutionToStore({
    ...secondInput,
    now: "2026-04-12T01:05:00.000Z",
    validation_scope: "test:conversation-preference:supersede-candidate",
  });

  assert.equal(applied.reused, false);
  assert.equal(applied.records.contradiction_resolution.strategy, "supersede_candidate");
  assert.equal(applied.records.existing_world_claim.temporal_state?.temporal_status, "active");
  assert.equal(applied.records.candidate_world_claim.temporal_state?.temporal_status, "historical");
  assert.equal(applied.records.candidate_world_claim.epistemic_state, "disputed");

  const projectionMarkdown = await readFile(applied.paths.projection_markdown, "utf8");
  assert.match(projectionMarkdown, /\[contradiction-resolution:cres_test_supersede_candidate_002\] \(applied\) supersede_candidate/);
  assert.match(projectionMarkdown, /\[world:wcl_test_supersede_candidate_002\] \(disputed; historical\)/);
});

test("applyConversationPreferenceResolutionToStore blocks auto-application of manual-review resolutions", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(firstInput);

  const secondInput: AuthenticatedConversationPreferenceStoreInput = {
    ...buildInput(rootDir),
    now: firstInput.now,
    statement: "The user now prefers exhaustive answers by default.",
    source: {
      id: "src_test_manual_002",
      source_ref: "runtime/session-test#turn-manual-002",
      content_ref: "raw/sources/conversation-turn-test-manual-002.json",
      runtime: "openclaw",
      message: "The user now says they prefer exhaustive answers by default.",
    },
    ids: {
      observation: "obs_test_manual_002",
      episode: "ep_test_manual_002",
      subject_entity: "ent_subject_test_manual_002",
      preference_entity: "ent_preference_test_manual_002",
      preference_relation: "rel_preference_test_manual_002",
      world_claim: "wcl_test_manual_002",
      contradiction: "contra_test_manual_002",
      contradiction_resolution: "cres_test_manual_002",
      wiki_page: "wpg_test_manual_002",
      wiki_claim: "wclm_test_manual_002",
      proposal: "prop_test_manual_002",
      disposition: "disp_test_manual_002",
      ratification: "rat_test_manual_002",
      diagnostic: "diag_test_manual_002",
      canonical: "mem_test_manual_002",
      canon_artifact: "part_openclaw_canon_test_manual_002",
      world_artifact: "part_openclaw_world_test_manual_002",
      wiki_artifact: "part_openclaw_wiki_test_manual_002",
      projection_manifest: "pmf_openclaw_test_manual_002",
    },
  };

  const second = await writeConversationPreferenceFlowToStore(secondInput);
  assert.equal(second.records.contradiction_resolution?.strategy, "manual_review");
  assert.equal(second.records.manual_contradiction_review_queue?.status, "pending");
  assert.match(
    await readFile(second.paths.projection_markdown, "utf8"),
    /\[review:cur_manual_contradiction_cres_test_manual_002\] \(contradiction_manual_review; pending\)/,
  );

  await assert.rejects(
    () =>
      applyConversationPreferenceResolutionToStore({
        ...secondInput,
        now: "2026-04-12T00:05:00.000Z",
      }),
    /Manual-review contradiction resolutions require explicit review/,
  );
});

test("manual contradiction review queue lists pending reviews and can apply an explicit resolution strategy", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(firstInput);

  const secondInput: AuthenticatedConversationPreferenceStoreInput = {
    ...buildInput(rootDir),
    now: firstInput.now,
    statement: "The user now prefers exhaustive answers by default.",
    source: {
      id: "src_test_manual_queue_002",
      source_ref: "runtime/session-test#turn-manual-queue-002",
      content_ref: "raw/sources/conversation-turn-test-manual-queue-002.json",
      runtime: "openclaw",
      message: "The user now says they prefer exhaustive answers by default.",
    },
    ids: {
      observation: "obs_test_manual_queue_002",
      episode: "ep_test_manual_queue_002",
      subject_entity: "ent_subject_test_manual_queue_002",
      preference_entity: "ent_preference_test_manual_queue_002",
      preference_relation: "rel_preference_test_manual_queue_002",
      world_claim: "wcl_test_manual_queue_002",
      contradiction: "contra_test_manual_queue_002",
      contradiction_resolution: "cres_test_manual_queue_002",
      wiki_page: "wpg_test_manual_queue_002",
      wiki_claim: "wclm_test_manual_queue_002",
      proposal: "prop_test_manual_queue_002",
      disposition: "disp_test_manual_queue_002",
      ratification: "rat_test_manual_queue_002",
      diagnostic: "diag_test_manual_queue_002",
      canonical: "mem_test_manual_queue_002",
      canon_artifact: "part_openclaw_canon_test_manual_queue_002",
      world_artifact: "part_openclaw_world_test_manual_queue_002",
      wiki_artifact: "part_openclaw_wiki_test_manual_queue_002",
      projection_manifest: "pmf_openclaw_test_manual_queue_002",
    },
  };

  const second = await writeConversationPreferenceFlowToStore(secondInput);
  assert.equal(second.records.contradiction_resolution?.strategy, "manual_review");
  assert.equal(second.records.manual_contradiction_review_queue?.status, "pending");

  const queue = await listConversationPreferenceManualContradictionReviewQueue(rootDir);
  assert.equal(queue.length, 1);
  assert.equal(queue[0]!.queue_id, "cur_manual_contradiction_cres_test_manual_queue_002");
  assert.equal(queue[0]!.contradiction_resolution_id, "cres_test_manual_queue_002");
  assert.equal(queue[0]!.candidate_statement, secondInput.statement);
  assert.equal(queue[0]!.strategy, "manual_review");

  const applied = await applyQueuedConversationPreferenceManualContradictionReviewToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-12T00:06:00.000Z",
    actor: "system:manual-contradiction-review",
    authenticated_principal: systemPrincipal("system:manual-contradiction-review"),
    strategy: "supersede_candidate",
    validation_scope: "test:conversation-preference:manual-contradiction-review",
  });

  assert.equal(applied.records.contradiction_resolution.status, "applied");
  assert.equal(applied.records.contradiction_resolution.strategy, "supersede_candidate");
  assert.equal(applied.records.manual_contradiction_review_queue?.status, "applied");
  assert.equal(applied.records.candidate_world_claim.epistemic_state, "disputed");
  assert.equal(applied.records.candidate_world_claim.temporal_state?.temporal_status, "historical");

  const projectionMarkdown = await readFile(applied.paths.projection_markdown, "utf8");
  assert.match(projectionMarkdown, /\[contradiction-resolution:cres_test_manual_queue_002\] \(applied\) supersede_candidate/);
  assert.match(projectionMarkdown, /\[review:cur_manual_contradiction_cres_test_manual_queue_002\] \(contradiction_manual_review; applied\)/);

  const queueAfter = await listConversationPreferenceManualContradictionReviewQueue(rootDir);
  assert.deepEqual(queueAfter, []);
});

test("manual contradiction review queue rejects calls without an authenticated owner or system principal", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(firstInput);

  const secondInput: AuthenticatedConversationPreferenceStoreInput = {
    ...buildInput(rootDir),
    now: firstInput.now,
    statement: "The user now prefers exhaustive answers by default.",
    source: {
      id: "src_test_manual_queue_auth_002",
      source_ref: "runtime/session-test#turn-manual-queue-auth-002",
      content_ref: "raw/sources/conversation-turn-test-manual-queue-auth-002.json",
      runtime: "openclaw",
      message: "The user now says they prefer exhaustive answers by default.",
    },
    ids: {
      observation: "obs_test_manual_queue_auth_002",
      episode: "ep_test_manual_queue_auth_002",
      subject_entity: "ent_subject_test_manual_queue_auth_002",
      preference_entity: "ent_preference_test_manual_queue_auth_002",
      preference_relation: "rel_preference_test_manual_queue_auth_002",
      world_claim: "wcl_test_manual_queue_auth_002",
      contradiction: "contra_test_manual_queue_auth_002",
      contradiction_resolution: "cres_test_manual_queue_auth_002",
      wiki_page: "wpg_test_manual_queue_auth_002",
      wiki_claim: "wclm_test_manual_queue_auth_002",
      proposal: "prop_test_manual_queue_auth_002",
      disposition: "disp_test_manual_queue_auth_002",
      ratification: "rat_test_manual_queue_auth_002",
      diagnostic: "diag_test_manual_queue_auth_002",
      canonical: "mem_test_manual_queue_auth_002",
      canon_artifact: "part_openclaw_canon_test_manual_queue_auth_002",
      world_artifact: "part_openclaw_world_test_manual_queue_auth_002",
      wiki_artifact: "part_openclaw_wiki_test_manual_queue_auth_002",
      projection_manifest: "pmf_openclaw_test_manual_queue_auth_002",
    },
  };

  const second = await writeConversationPreferenceFlowToStore(secondInput);
  assert.equal(second.records.contradiction_resolution?.strategy, "manual_review");

  const queue = await listConversationPreferenceManualContradictionReviewQueue(rootDir);
  await assert.rejects(
    () =>
      applyQueuedConversationPreferenceManualContradictionReviewToStore({
        rootDir,
        queue_id: queue[0]!.queue_id,
        now: "2026-04-12T00:06:00.000Z",
        actor: "actor_participant_manual_review_001",
        authenticated_principal: participantPrincipal("actor_participant_manual_review_001"),
        strategy: "supersede_candidate",
        validation_scope: "test:conversation-preference:manual-contradiction-review-auth",
      }),
    /Manual contradiction review requires authenticated system principal or owner actor_owner_test_001/,
  );
});

test("manual contradiction review queue can expire without changing world truth and supports retry idempotence", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const firstInput = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(firstInput);

  const secondInput: AuthenticatedConversationPreferenceStoreInput = {
    ...buildInput(rootDir),
    now: firstInput.now,
    statement: "The user now prefers exhaustive answers by default.",
    source: {
      id: "src_test_manual_queue_expire_002",
      source_ref: "runtime/session-test#turn-manual-queue-expire-002",
      content_ref: "raw/sources/conversation-turn-test-manual-queue-expire-002.json",
      runtime: "openclaw",
      message: "The user now says they prefer exhaustive answers by default.",
    },
    ids: {
      observation: "obs_test_manual_queue_expire_002",
      episode: "ep_test_manual_queue_expire_002",
      subject_entity: "ent_subject_test_manual_queue_expire_002",
      preference_entity: "ent_preference_test_manual_queue_expire_002",
      preference_relation: "rel_preference_test_manual_queue_expire_002",
      world_claim: "wcl_test_manual_queue_expire_002",
      contradiction: "contra_test_manual_queue_expire_002",
      contradiction_resolution: "cres_test_manual_queue_expire_002",
      wiki_page: "wpg_test_manual_queue_expire_002",
      wiki_claim: "wclm_test_manual_queue_expire_002",
      proposal: "prop_test_manual_queue_expire_002",
      disposition: "disp_test_manual_queue_expire_002",
      ratification: "rat_test_manual_queue_expire_002",
      diagnostic: "diag_test_manual_queue_expire_002",
      canonical: "mem_test_manual_queue_expire_002",
      canon_artifact: "part_openclaw_canon_test_manual_queue_expire_002",
      world_artifact: "part_openclaw_world_test_manual_queue_expire_002",
      wiki_artifact: "part_openclaw_wiki_test_manual_queue_expire_002",
      projection_manifest: "pmf_openclaw_test_manual_queue_expire_002",
    },
  };

  const second = await writeConversationPreferenceFlowToStore(secondInput);
  assert.equal(second.records.contradiction_resolution?.strategy, "manual_review");
  assert.equal(second.records.manual_contradiction_review_queue?.status, "pending");

  const queue = await listConversationPreferenceManualContradictionReviewQueue(rootDir);
  const expired = await expireQueuedConversationPreferenceManualContradictionReviewToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-12T00:06:00.000Z",
    actor: "system:manual-contradiction-review",
    authenticated_principal: systemPrincipal("system:manual-contradiction-review"),
    validation_scope: "test:conversation-preference:manual-contradiction-review-expire",
  });

  assert.equal(expired.records.contradiction.status, "open");
  assert.equal(expired.records.contradiction_resolution.status, "rejected");
  assert.equal(expired.records.manual_contradiction_review_queue?.status, "expired");
  assert.equal(expired.records.existing_world_claim.temporal_state?.temporal_status, "active");
  assert.equal(expired.records.candidate_world_claim.temporal_state?.temporal_status, "active");

  const projectionMarkdown = await readFile(expired.paths.projection_markdown, "utf8");
  assert.match(projectionMarkdown, /\[contradiction-resolution:cres_test_manual_queue_expire_002\] \(rejected\) manual_review/);
  assert.match(projectionMarkdown, /\[review:cur_manual_contradiction_cres_test_manual_queue_expire_002\] \(contradiction_manual_review; expired\)/);

  const queueAfter = await listConversationPreferenceManualContradictionReviewQueue(rootDir);
  assert.deepEqual(queueAfter, []);

  const expiredReplay = await expireQueuedConversationPreferenceManualContradictionReviewToStore({
    rootDir,
    queue_id: queue[0]!.queue_id,
    now: "2026-04-12T00:06:00.000Z",
    actor: "system:manual-contradiction-review",
    authenticated_principal: systemPrincipal("system:manual-contradiction-review"),
    validation_scope: "test:conversation-preference:manual-contradiction-review-expire",
  });
  assert.equal(expiredReplay.reused, true);
  assert.equal(expiredReplay.records.manual_contradiction_review_queue?.status, "expired");
  assert.equal(expiredReplay.records.contradiction_resolution.status, "rejected");
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
  const projectionManifestSource = await readFile(roundTrip.paths.projection_manifest, "utf8");
  const canonArtifactSource = await readFile(roundTrip.paths.projection_artifacts.canon, "utf8");
  const worldArtifactSource = await readFile(roundTrip.paths.projection_artifacts.world, "utf8");
  const wikiArtifactSource = await readFile(roundTrip.paths.projection_artifacts.wiki, "utf8");
  assert.equal(roundTrip.records.intake.runtime_instance?.id, seed.identity_context?.ids.runtime_instance);
  assert.equal(roundTrip.records.projection_manifest.runtime_instance_ref, seed.identity_context?.ids.runtime_instance);
  assert.equal(roundTrip.records.intake.observation.provenance.source_type, "openclaw_runtime_feedback");
  assert.match(projectionMarkdown, /\[runtime:runtime_test_001\]/);
  assert.match(projectionMarkdown, /\[wiki:wpg_feedback_test_001\]/);
  assert.match(projectionMarkdown, /## Contradiction Resolutions/);

  await writeCoreRecord(rootDir, {
    id: "mem_feedback_unrelated_001",
    kind: "fact",
    layer: "canon",
    authoritative_home: "canon",
    created_at: "2026-04-12T01:30:00.000Z",
    updated_at: "2026-04-12T01:30:00.000Z",
    visibility_state: {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "fixture",
      source_ref: "fixture:feedback-unrelated",
    },
    statement: "An unrelated canonical fact must not rewrite replayed projection artifacts.",
    semantic_slot: "fact:feedback-unrelated",
    epistemic_state: "confirmed",
    governance_state: "ratified",
    temporal_state: {
      temporal_status: "active",
    },
  });

  const replayed = await writeOpenClawPreferenceFeedbackFlowToStore({
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
  assert.equal(replayed.reused, true);
  assert.equal(await readFile(replayed.paths.projection_markdown, "utf8"), projectionMarkdown);
  assert.equal(await readFile(replayed.paths.projection_manifest, "utf8"), projectionManifestSource);
  assert.equal(await readFile(replayed.paths.projection_artifacts.canon, "utf8"), canonArtifactSource);
  assert.equal(await readFile(replayed.paths.projection_artifacts.world, "utf8"), worldArtifactSource);
  assert.equal(await readFile(replayed.paths.projection_artifacts.wiki, "utf8"), wikiArtifactSource);
});

test("projection excludes superseded canonical records during recompilation", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const seed = buildInput(rootDir);
  const initial = await writeConversationPreferenceFlowToStore(seed);
  const canonicalRecord = initial.records.canonical_record;
  if (!canonicalRecord) {
    throw new Error("Expected seeded flow to materialize canonical state");
  }

  await writeCoreRecord(rootDir, {
    ...canonicalRecord,
    id: "mem_test_superseded_001",
    created_at: "2026-04-11T23:00:00.000Z",
    updated_at: "2026-04-11T23:30:00.000Z",
    statement: "The user previously preferred ultra-concise answers.",
    governance_state: "superseded",
    temporal_state: {
      temporal_status: "historical",
      valid_from: "2026-04-11T23:00:00.000Z",
      valid_to: "2026-04-11T23:30:00.000Z",
    },
    superseded_by_ref: canonicalRecord.id,
  });

  const roundTrip = await writeOpenClawPreferenceFeedbackFlowToStore({
    ...seed,
    now: "2026-04-12T02:00:00.000Z",
    statement: "OpenClaw confirms the concise-answer preference is still active.",
    source: {
      id: "src_feedback_projection_test_001",
      source_ref: "openclaw/runtime-001#thread-projection-001",
      content_ref: "raw/imports/openclaw-feedback-projection-test-001.json",
      runtime: "openclaw",
      message: "Runtime feedback confirms the concise-answer preference.",
      source_type: "openclaw_runtime_feedback",
    },
    ids: {
      observation: "obs_feedback_projection_test_001",
      episode: "ep_feedback_projection_test_001",
      subject_entity: "ent_subject_feedback_projection_test_001",
      preference_entity: "ent_preference_feedback_projection_test_001",
      preference_relation: "rel_preference_feedback_projection_test_001",
      world_claim: "wcl_feedback_projection_test_001",
      contradiction: "contra_feedback_projection_test_001",
      contradiction_resolution: "cres_feedback_projection_test_001",
      wiki_page: "wpg_feedback_projection_test_001",
      wiki_claim: "wclm_feedback_projection_test_001",
      proposal: "prop_feedback_projection_test_001",
      disposition: "disp_feedback_projection_test_001",
      ratification: "rat_feedback_projection_test_001",
      diagnostic: "diag_feedback_projection_test_001",
      canonical: "mem_feedback_projection_test_001",
      canon_artifact: "part_openclaw_canon_feedback_projection_test_001",
      world_artifact: "part_openclaw_world_feedback_projection_test_001",
      wiki_artifact: "part_openclaw_wiki_feedback_projection_test_001",
      projection_manifest: "pmf_openclaw_feedback_projection_test_001",
    },
    validation_scope: "test:openclaw-projection-canon-filter",
  });

  const projectionMarkdown = await readFile(roundTrip.paths.projection_markdown, "utf8");
  assert.match(projectionMarkdown, /\[canon:mem_test_001\] \(ratified; active\)/);
  assert.doesNotMatch(projectionMarkdown, /\[canon:mem_test_superseded_001\]/);
});

test("structured preference signal flow reuses the generic intake framework", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  await writeConversationPreferenceFlowToStore(input);

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
  assert.equal(result.records.intake.observation.provenance.source_type, "structured_import");
  assert.equal(result.records.contradiction, undefined);
  assert.equal(result.records.canonical_record?.id, "mem_structured_store_001");

  const wikiMarkdown = await readFile(result.paths.wiki_page_markdown, "utf8");
  assert.match(wikiMarkdown, /^page_kind: entity$/m);
  assert.match(wikiMarkdown, /^title: Customer Delivery Preferences$/m);
  assert.match(wikiMarkdown, /^# Customer Delivery Preferences$/m);

  const replayed = await writeStructuredPreferenceSignalFlowToStore({
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
  assert.equal(replayed.reused, true);
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
