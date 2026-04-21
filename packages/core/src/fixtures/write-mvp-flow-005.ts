import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { appendAuditChange, writeSnapshotManifest, writeSnapshotRecordCopies } from "../audit/log.js";
import {
  writeConversationPreferenceFlowToStore,
  type AuthenticatedConversationPreferenceStoreInput,
} from "../workflow-engine/conversation-preference-store.js";

function buildInput(rootDir: string): AuthenticatedConversationPreferenceStoreInput {
  return {
    rootDir,
    now: "2026-04-16T01:00:00.000Z",
    actor: "system:fixture-mvp-005",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:fixture-mvp-005",
      system_scope: "fixture-mvp-005",
    },
    statement: "Customer 001 prefers weekly status summaries.",
    identity_context: {
      runtime: "openclaw",
      ids: {
        agent_identity: "actor_agent_mvp_005",
        owner_identity: "actor_owner_mvp_005",
        runtime_instance: "runtime_mvp_005",
        runtime_session: "session_mvp_005",
        conversation_thread: "thread_mvp_005",
      },
      agent_label: "Cristalina MVP Agent",
      owner_label: "MVP Owner",
      session_objective: "Prove participant disagreement becomes explicit contradiction",
      session_summary: "MVP Flow 005 runtime session",
      message_refs: ["msg_mvp_005_001"],
      thread_summary: "MVP Flow 005 disagreement thread",
    },
    source: {
      id: "src_mvp_005_001",
      source_ref: "runtime/session-005#turn-001",
      content_ref: "raw/sources/conversation-turn-005-001.json",
      runtime: "openclaw",
      message: "Participant A says Customer 001 prefers weekly status summaries.",
      speaker_ref: "actor_external_person_mvp_005_a",
    },
    semantic_profile: {
      subject_entity_kind: "customer",
      subject_authority_role: "participant",
      subject_label: "Customer 001",
      wiki_title: "Customer Delivery Preferences",
      wiki_path: "wiki/pages/customer-delivery-preferences.md",
      preference_topic_label: "Delivery Preferences",
      relation_type: "requests_delivery_style",
      proposal_reason: "Participant-provided customer preference signal.",
    },
    ids: {
      observation: "obs_mvp_005_001",
      episode: "ep_mvp_005_001",
      subject_entity: "ent_subject_mvp_005_001",
      preference_entity: "ent_preference_mvp_005_001",
      preference_relation: "rel_preference_mvp_005_001",
      world_claim: "wcl_mvp_005_001",
      contradiction: "contra_mvp_005_001",
      contradiction_resolution: "cres_mvp_005_001",
      wiki_page: "wpg_mvp_005_001",
      wiki_claim: "wclm_mvp_005_001",
      proposal: "prop_mvp_005_001",
      disposition: "disp_mvp_005_001",
      ratification: "rat_mvp_005_001",
      diagnostic: "diag_mvp_005_001",
      canonical: "mem_mvp_005_001",
      canon_artifact: "part_openclaw_canon_mvp_005_001",
      world_artifact: "part_openclaw_world_mvp_005_001",
      wiki_artifact: "part_openclaw_wiki_mvp_005_001",
      projection_manifest: "pmf_openclaw_mvp_005_001",
    },
    validation_scope: "fixture:mvp-flow-005:first",
  };
}

async function main(): Promise<void> {
  const outputRoot = resolve(process.argv[2] ?? "examples/mvp-flow-005/.cristalina-v4");

  const first = await writeConversationPreferenceFlowToStore(buildInput(outputRoot));
  if (!first.records.canonical_record) {
    throw new Error("Expected first participant claim to materialize canonical state");
  }

  const secondInput: AuthenticatedConversationPreferenceStoreInput = {
    ...buildInput(outputRoot),
    now: "2026-04-16T01:05:00.000Z",
    statement: "Customer 001 prefers daily status summaries.",
    source: {
      id: "src_mvp_005_002",
      source_ref: "runtime/session-005#turn-002",
      content_ref: "raw/sources/conversation-turn-005-002.json",
      runtime: "openclaw",
      message: "Participant B says Customer 001 prefers daily status summaries.",
      speaker_ref: "actor_external_person_mvp_005_b",
    },
    ids: {
      observation: "obs_mvp_005_002",
      episode: "ep_mvp_005_002",
      subject_entity: "ent_subject_mvp_005_002",
      preference_entity: "ent_preference_mvp_005_002",
      preference_relation: "rel_preference_mvp_005_002",
      world_claim: "wcl_mvp_005_002",
      contradiction: "contra_mvp_005_002",
      contradiction_resolution: "cres_mvp_005_002",
      wiki_page: "wpg_mvp_005_002",
      wiki_claim: "wclm_mvp_005_002",
      proposal: "prop_mvp_005_002",
      disposition: "disp_mvp_005_002",
      ratification: "rat_mvp_005_002",
      diagnostic: "diag_mvp_005_002",
      canonical: "mem_mvp_005_002",
      canon_artifact: "part_openclaw_canon_mvp_005_002",
      world_artifact: "part_openclaw_world_mvp_005_002",
      wiki_artifact: "part_openclaw_wiki_mvp_005_002",
      projection_manifest: "pmf_openclaw_mvp_005_002",
    },
    validation_scope: "fixture:mvp-flow-005:second",
  };

  const second = await writeConversationPreferenceFlowToStore(secondInput);
  if (!second.records.contradiction || !second.records.contradiction_resolution) {
    throw new Error("Expected second participant claim to create an explicit contradiction and resolution proposal");
  }

  const snapshotId = "snap-mvp-005-001";
  const snapshotRecords = await writeSnapshotRecordCopies(outputRoot, snapshotId, [
    first.records.source_record,
    first.records.intake.observation,
    first.records.intake.world_claim,
    first.records.intake.wiki_page,
    first.records.intake.wiki_claim,
    first.records.intake.proposal,
    first.records.intake.disposition_record,
    first.records.ratification_record,
    first.records.canonical_record,
    second.records.source_record,
    second.records.intake.observation,
    second.records.intake.world_claim,
    second.records.intake.wiki_page,
    second.records.intake.wiki_claim,
    second.records.intake.proposal,
    second.records.intake.disposition_record,
    second.records.ratification_record,
    second.records.diagnostic!,
    second.records.contradiction,
    second.records.contradiction_resolution,
    ...second.records.projection_artifacts,
    second.records.projection_manifest,
  ].filter((record): record is NonNullable<typeof record> => record !== undefined));

  const snapshotPath = await writeSnapshotManifest(outputRoot, {
    snapshot_id: snapshotId,
    created_at: "2026-04-16T01:05:00.000Z",
    reason: "Participant disagreement contradiction fixture",
    record_refs: [...new Set(snapshotRecords.map((record) => record.record_id))],
    record_entries: snapshotRecords,
  });

  await appendAuditChange(outputRoot, {
    at: "2026-04-16T01:05:00.000Z",
    operation: "fixture_snapshot",
    record_id: second.records.projection_manifest.id,
    record_kind: second.records.projection_manifest.kind,
    record_layer: second.records.projection_manifest.layer,
    detail: "Recorded participant disagreement contradiction fixture snapshot.",
    related_refs: [snapshotId],
  });

  const projectionMarkdown = await readFile(second.paths.projection_markdown, "utf8");
  const summaryPath = join(outputRoot, "fixture-summary.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        root: outputRoot,
        first_claim: {
          ratification_decision: first.records.ratification_record.decision,
          canonical_record: first.records.canonical_record?.id ?? null,
        },
        second_claim: {
          ratification_decision: second.records.ratification_record.decision,
          contradiction: second.records.contradiction?.id ?? null,
          contradiction_resolution: second.records.contradiction_resolution?.id ?? null,
          disposition_outcomes: second.records.intake.disposition_record.outcomes,
        },
        projection_markdown: second.paths.projection_markdown,
        projection_manifest: second.paths.projection_manifest,
        snapshot_manifest: snapshotPath,
        projection_excerpt: projectionMarkdown.split("\n").slice(0, 28),
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
