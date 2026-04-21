import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { appendAuditChange, writeSnapshotManifest, writeSnapshotRecordCopies } from "../audit/log.js";
import {
  listConversationPreferenceOwnerRatificationQueue,
  ratifyQueuedConversationPreferenceProposalToStore,
  writeConversationPreferenceFlowToStore,
  type AuthenticatedConversationPreferenceStoreInput,
} from "../workflow-engine/conversation-preference-store.js";

function buildInput(rootDir: string): AuthenticatedConversationPreferenceStoreInput {
  return {
    rootDir,
    now: "2026-04-16T00:00:00.000Z",
    actor: "system:fixture-mvp-004",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:fixture-mvp-004",
      system_scope: "fixture-mvp-004",
    },
    statement: "The owner prefers strategic summaries on Fridays.",
    identity_context: {
      runtime: "openclaw",
      ids: {
        agent_identity: "actor_agent_mvp_004",
        owner_identity: "actor_owner_mvp_004",
        runtime_instance: "runtime_mvp_004",
        runtime_session: "session_mvp_004",
        conversation_thread: "thread_mvp_004",
      },
      agent_label: "Cristalina MVP Agent",
      owner_label: "MVP Owner",
      session_objective: "Prove owner authority gating and owner-originated promotion",
      session_summary: "MVP Flow 004 runtime session",
      message_refs: ["msg_mvp_004_001"],
      thread_summary: "MVP Flow 004 authority thread",
    },
    source: {
      id: "src_mvp_004_001",
      source_ref: "runtime/session-004#turn-001",
      content_ref: "raw/sources/conversation-turn-004-001.json",
      runtime: "openclaw",
      message: "A participant says the owner prefers strategic summaries on Fridays.",
      speaker_ref: "actor_external_person_mvp_004_participant",
    },
    semantic_profile: {
      subject_entity_kind: "owner",
      subject_authority_role: "owner",
      subject_label: "MVP Owner",
      wiki_title: "Owner Interaction Preferences",
      wiki_path: "wiki/pages/owner-interaction-preferences.md",
      preference_topic_label: "Owner Interaction Preferences",
      relation_type: "expressed_preference",
      proposal_reason: "Owner-scoped preference signal.",
    },
    ids: {
      observation: "obs_mvp_004_001",
      episode: "ep_mvp_004_001",
      subject_entity: "ent_subject_mvp_004_001",
      preference_entity: "ent_preference_mvp_004_001",
      preference_relation: "rel_preference_mvp_004_001",
      world_claim: "wcl_mvp_004_001",
      contradiction: "contra_mvp_004_001",
      contradiction_resolution: "cres_mvp_004_001",
      wiki_page: "wpg_mvp_004_001",
      wiki_claim: "wclm_mvp_004_001",
      proposal: "prop_mvp_004_001",
      disposition: "disp_mvp_004_001",
      ratification: "rat_mvp_004_001",
      diagnostic: "diag_mvp_004_001",
      canonical: "mem_mvp_004_001",
      canon_artifact: "part_openclaw_canon_mvp_004_001",
      world_artifact: "part_openclaw_world_mvp_004_001",
      wiki_artifact: "part_openclaw_wiki_mvp_004_001",
      projection_manifest: "pmf_openclaw_mvp_004_001",
    },
    validation_scope: "fixture:mvp-flow-004:participant-report",
  };
}

async function main(): Promise<void> {
  const outputRoot = resolve(process.argv[2] ?? "examples/mvp-flow-004/.cristalina-v4");

  const participantReport = await writeConversationPreferenceFlowToStore(buildInput(outputRoot));
  const queue = await listConversationPreferenceOwnerRatificationQueue(outputRoot);
  const queueEntry = queue[0];
  if (!queueEntry) {
    throw new Error("Expected a pending owner ratification queue entry");
  }

  const ownerRatification = await ratifyQueuedConversationPreferenceProposalToStore({
    rootDir: outputRoot,
    queue_id: queueEntry.queue_id,
    now: "2026-04-16T00:05:00.000Z",
    actor: "actor_owner_mvp_004",
    authenticated_principal: {
      kind: "owner",
      actor_ref: "actor_owner_mvp_004",
    },
    owner_actor_ref: "actor_owner_mvp_004",
    validation_scope: "fixture:mvp-flow-004:owner-ratification",
  });
  if (!ownerRatification.records.canonical_record) {
    throw new Error("Expected explicit owner ratification to materialize canonical state");
  }

  const snapshotId = "snap-mvp-004-001";
  const snapshotRecords = await writeSnapshotRecordCopies(outputRoot, snapshotId, [
    participantReport.records.source_record,
    participantReport.records.intake.observation,
    participantReport.records.intake.world_claim,
    participantReport.records.intake.wiki_page,
    participantReport.records.intake.wiki_claim,
    participantReport.records.intake.proposal,
    participantReport.records.intake.disposition_record,
    participantReport.records.ratification_record,
    participantReport.records.owner_ratification_queue!,
    participantReport.records.diagnostic!,
    ownerRatification.records.owner_ratification_queue!,
    ownerRatification.records.ratification_record,
    ownerRatification.records.diagnostic!,
    ownerRatification.records.canonical_record,
    ...ownerRatification.records.projection_artifacts,
    ownerRatification.records.projection_manifest,
  ].filter((record): record is NonNullable<typeof record> => record !== undefined));

  const snapshotPath = await writeSnapshotManifest(outputRoot, {
    snapshot_id: snapshotId,
    created_at: "2026-04-16T00:05:00.000Z",
    reason: "Owner authority gating and owner-originated promotion fixture",
    record_refs: [...new Set(snapshotRecords.map((record) => record.record_id))],
    record_entries: snapshotRecords,
  });

  await appendAuditChange(outputRoot, {
    at: "2026-04-16T00:05:00.000Z",
    operation: "fixture_snapshot",
    record_id: ownerRatification.records.projection_manifest.id,
    record_kind: ownerRatification.records.projection_manifest.kind,
    record_layer: ownerRatification.records.projection_manifest.layer,
    detail: "Recorded owner authority gating fixture snapshot.",
    related_refs: [snapshotId],
  });

  const projectionMarkdown = await readFile(ownerRatification.paths.projection_markdown, "utf8");
  const summaryPath = join(outputRoot, "fixture-summary.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        root: outputRoot,
        participant_report: {
          queue_id: queueEntry.queue_id,
          ratification_decision: participantReport.records.ratification_record.decision,
          proposal_promotion_requirement: participantReport.records.intake.proposal.promotion_requirement,
          disposition_outcomes: participantReport.records.intake.disposition_record.outcomes,
          diagnostic_code: participantReport.records.diagnostic?.code ?? null,
          queue_status: participantReport.records.owner_ratification_queue?.status ?? null,
          canonical_record: participantReport.records.canonical_record?.id ?? null,
        },
        owner_ratification: {
          ratification_decision: ownerRatification.records.ratification_record.decision,
          diagnostic_code: ownerRatification.records.diagnostic?.code ?? null,
          queue_status: ownerRatification.records.owner_ratification_queue?.status ?? null,
          canonical_record: ownerRatification.records.canonical_record?.id ?? null,
        },
        projection_markdown: ownerRatification.paths.projection_markdown,
        projection_manifest: ownerRatification.paths.projection_manifest,
        snapshot_manifest: snapshotPath,
        projection_excerpt: projectionMarkdown.split("\n").slice(0, 24),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
  process.stderr.write(`${detail}\n`);
  process.exitCode = 1;
});
