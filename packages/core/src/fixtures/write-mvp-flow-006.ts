import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { appendAuditChange, writeSnapshotManifest, writeSnapshotRecordCopies } from "../audit/log.js";
import {
  listConversationPreferenceOwnerRatificationQueue,
  rejectQueuedConversationPreferenceProposalToStore,
  writeConversationPreferenceFlowToStore,
  type ConversationPreferenceStoreInput,
} from "../workflow-engine/conversation-preference-store.js";

function buildInput(rootDir: string): ConversationPreferenceStoreInput {
  return {
    rootDir,
    now: "2026-04-16T01:00:00.000Z",
    actor: "system:fixture-mvp-006",
    statement: "The owner prefers voice notes for daily summaries.",
    identity_context: {
      runtime: "openclaw",
      ids: {
        agent_identity: "actor_agent_mvp_006",
        owner_identity: "actor_owner_mvp_006",
        runtime_instance: "runtime_mvp_006",
        runtime_session: "session_mvp_006",
        conversation_thread: "thread_mvp_006",
      },
      agent_label: "Cristalina MVP Agent",
      owner_label: "MVP Owner",
      session_objective: "Prove explicit owner rejection on shared-memory review queue",
      session_summary: "MVP Flow 006 runtime session",
      message_refs: ["msg_mvp_006_001"],
      thread_summary: "MVP Flow 006 authority rejection thread",
    },
    source: {
      id: "src_mvp_006_001",
      source_ref: "runtime/session-006#turn-001",
      content_ref: "raw/sources/conversation-turn-006-001.json",
      runtime: "openclaw",
      message: "A participant says the owner prefers voice notes for daily summaries.",
      speaker_ref: "actor_external_person_mvp_006_participant",
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
      observation: "obs_mvp_006_001",
      episode: "ep_mvp_006_001",
      subject_entity: "ent_subject_mvp_006_001",
      preference_entity: "ent_preference_mvp_006_001",
      preference_relation: "rel_preference_mvp_006_001",
      world_claim: "wcl_mvp_006_001",
      contradiction: "contra_mvp_006_001",
      contradiction_resolution: "cres_mvp_006_001",
      wiki_page: "wpg_mvp_006_001",
      wiki_claim: "wclm_mvp_006_001",
      proposal: "prop_mvp_006_001",
      disposition: "disp_mvp_006_001",
      ratification: "rat_mvp_006_001",
      diagnostic: "diag_mvp_006_001",
      canonical: "mem_mvp_006_001",
      canon_artifact: "part_openclaw_canon_mvp_006_001",
      world_artifact: "part_openclaw_world_mvp_006_001",
      wiki_artifact: "part_openclaw_wiki_mvp_006_001",
      projection_manifest: "pmf_openclaw_mvp_006_001",
    },
    validation_scope: "fixture:mvp-flow-006:participant-report",
  };
}

async function main(): Promise<void> {
  const outputRoot = resolve(process.argv[2] ?? "examples/mvp-flow-006/.cristalina-v4");

  const participantReport = await writeConversationPreferenceFlowToStore(buildInput(outputRoot));
  const queue = await listConversationPreferenceOwnerRatificationQueue(outputRoot);
  const queueEntry = queue[0];
  if (!queueEntry) {
    throw new Error("Expected a pending owner ratification queue entry");
  }

  const ownerRejection = await rejectQueuedConversationPreferenceProposalToStore({
    rootDir: outputRoot,
    queue_id: queueEntry.queue_id,
    now: "2026-04-16T01:05:00.000Z",
    actor: "owner:mvp-006",
    owner_actor_ref: "actor_owner_mvp_006",
    validation_scope: "fixture:mvp-flow-006:owner-rejection",
  });
  if (ownerRejection.records.canonical_record) {
    throw new Error("Explicit owner rejection must not materialize canonical state");
  }

  const snapshotId = "snap-mvp-006-001";
  const snapshotRecords = await writeSnapshotRecordCopies(outputRoot, snapshotId, [
    participantReport.records.source_record,
    participantReport.records.intake.observation,
    participantReport.records.intake.world_claim,
    participantReport.records.intake.wiki_page,
    participantReport.records.intake.wiki_claim,
    participantReport.records.intake.proposal,
    participantReport.records.intake.disposition_record,
    participantReport.records.owner_ratification_queue!,
    participantReport.records.ratification_record,
    participantReport.records.diagnostic!,
    ownerRejection.records.owner_ratification_queue!,
    ownerRejection.records.ratification_record,
    ownerRejection.records.diagnostic!,
    ...ownerRejection.records.projection_artifacts,
    ownerRejection.records.projection_manifest,
  ].filter((record): record is NonNullable<typeof record> => record !== undefined));

  const snapshotPath = await writeSnapshotManifest(outputRoot, {
    snapshot_id: snapshotId,
    created_at: "2026-04-16T01:05:00.000Z",
    reason: "Owner authority rejection fixture",
    record_refs: [...new Set(snapshotRecords.map((record) => record.record_id))],
    record_entries: snapshotRecords,
  });

  await appendAuditChange(outputRoot, {
    at: "2026-04-16T01:05:00.000Z",
    operation: "fixture_snapshot",
    record_id: ownerRejection.records.projection_manifest.id,
    record_kind: ownerRejection.records.projection_manifest.kind,
    record_layer: ownerRejection.records.projection_manifest.layer,
    detail: "Recorded owner authority rejection fixture snapshot.",
    related_refs: [snapshotId],
  });

  const projectionMarkdown = await readFile(ownerRejection.paths.projection_markdown, "utf8");
  const summaryPath = join(outputRoot, "fixture-summary.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        root: outputRoot,
        participant_report: {
          queue_id: queueEntry.queue_id,
          ratification_decision: participantReport.records.ratification_record.decision,
          queue_status: participantReport.records.owner_ratification_queue?.status ?? null,
          diagnostic_code: participantReport.records.diagnostic?.code ?? null,
          canonical_record: participantReport.records.canonical_record?.id ?? null,
        },
        owner_rejection: {
          ratification_decision: ownerRejection.records.ratification_record.decision,
          queue_status: ownerRejection.records.owner_ratification_queue?.status ?? null,
          diagnostic_code: ownerRejection.records.diagnostic?.code ?? null,
          canonical_record: null,
        },
        projection_markdown: ownerRejection.paths.projection_markdown,
        projection_manifest: ownerRejection.paths.projection_manifest,
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
