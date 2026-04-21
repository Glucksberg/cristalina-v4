import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { appendAuditChange, writeSnapshotManifest, writeSnapshotRecordCopies } from "../audit/log.js";
import { coreRecordPath } from "../store/io.js";
import type { WorldClaim } from "../types.js";
import {
  applyConversationPreferenceResolutionToStore,
  writeConversationPreferenceFlowToStore,
  type AuthenticatedConversationPreferenceStoreInput,
} from "../workflow-engine/conversation-preference-store.js";

function buildInput(rootDir: string): AuthenticatedConversationPreferenceStoreInput {
  return {
    rootDir,
    now: "2026-04-13T00:00:00.000Z",
    actor: "system:auto-ratify-mvp-003",
    authenticated_principal: {
      kind: "system",
      actor_ref: "system:auto-ratify-mvp-003",
      system_scope: "auto-ratify-mvp-003",
    },
    statement: "The user prefers exhaustive answers by default.",
    identity_context: {
      runtime: "openclaw",
      ids: {
        agent_identity: "actor_agent_mvp_003",
        owner_identity: "actor_owner_mvp_003",
        runtime_instance: "runtime_mvp_003",
        runtime_session: "session_mvp_003",
        conversation_thread: "thread_mvp_003",
      },
      agent_label: "Cristalina MVP Agent",
      owner_label: "MVP Owner",
      session_objective: "Persist applied contradiction resolution",
      session_summary: "MVP Flow 003 runtime session",
      message_refs: ["msg_mvp_003_001"],
      thread_summary: "MVP Flow 003 thread",
    },
    source: {
      id: "src_mvp_003_001",
      source_ref: "runtime/session-003#turn-001",
      content_ref: "raw/sources/conversation-turn-003-001.json",
      runtime: "openclaw",
      message: "The user says they prefer exhaustive answers by default.",
    },
    ids: {
      observation: "obs_mvp_003_001",
      episode: "ep_mvp_003_001",
      subject_entity: "ent_subject_mvp_003_001",
      preference_entity: "ent_preference_mvp_003_001",
      preference_relation: "rel_preference_mvp_003_001",
      world_claim: "wcl_mvp_003_001",
      contradiction: "contra_mvp_003_001",
      contradiction_resolution: "cres_mvp_003_001",
      wiki_page: "wpg_mvp_003_001",
      wiki_claim: "wclm_mvp_003_001",
      proposal: "prop_mvp_003_001",
      disposition: "disp_mvp_003_001",
      ratification: "rat_mvp_003_001",
      diagnostic: "diag_mvp_003_001",
      canonical: "mem_mvp_003_001",
      canon_artifact: "part_openclaw_canon_mvp_003_001",
      world_artifact: "part_openclaw_world_mvp_003_001",
      wiki_artifact: "part_openclaw_wiki_mvp_003_001",
      projection_manifest: "pmf_openclaw_mvp_003_001",
    },
    validation_scope: "fixture:mvp-flow-003:first",
  };
}

async function main(): Promise<void> {
  const outputRoot = resolve(process.argv[2] ?? "examples/mvp-flow-003/.cristalina-v4");

  const first = buildInput(outputRoot);
  await writeConversationPreferenceFlowToStore(first);

  const second: AuthenticatedConversationPreferenceStoreInput = {
    ...buildInput(outputRoot),
    now: "2026-04-13T01:00:00.000Z",
    statement: "The user now prefers concise answers by default.",
    source: {
      id: "src_mvp_003_002",
      source_ref: "runtime/session-003#turn-002",
      content_ref: "raw/sources/conversation-turn-003-002.json",
      runtime: "openclaw",
      message: "The user now says they prefer concise answers by default.",
    },
    ids: {
      observation: "obs_mvp_003_002",
      episode: "ep_mvp_003_002",
      subject_entity: "ent_subject_mvp_003_002",
      preference_entity: "ent_preference_mvp_003_002",
      preference_relation: "rel_preference_mvp_003_002",
      world_claim: "wcl_mvp_003_002",
      contradiction: "contra_mvp_003_002",
      contradiction_resolution: "cres_mvp_003_002",
      wiki_page: "wpg_mvp_003_002",
      wiki_claim: "wclm_mvp_003_002",
      proposal: "prop_mvp_003_002",
      disposition: "disp_mvp_003_002",
      ratification: "rat_mvp_003_002",
      diagnostic: "diag_mvp_003_002",
      canonical: "mem_mvp_003_002",
      canon_artifact: "part_openclaw_canon_mvp_003_002",
      world_artifact: "part_openclaw_world_mvp_003_002",
      wiki_artifact: "part_openclaw_wiki_mvp_003_002",
      projection_manifest: "pmf_openclaw_mvp_003_002",
    },
    validation_scope: "fixture:mvp-flow-003:second",
  };

  const secondFlow = await writeConversationPreferenceFlowToStore(second);
  const applied = await applyConversationPreferenceResolutionToStore({
    ...second,
    now: "2026-04-13T01:05:00.000Z",
    validation_scope: "fixture:mvp-flow-003:resolution",
  });

  const snapshotId = "snap-mvp-003-001";
  const snapshotSourceRecords = [
    secondFlow.records.source_record,
    secondFlow.records.intake.observation,
    secondFlow.records.intake.episode,
    secondFlow.records.intake.subject_entity,
    secondFlow.records.intake.preference_entity,
    secondFlow.records.intake.preference_relation,
    applied.records.existing_world_claim,
    applied.records.candidate_world_claim,
    applied.records.contradiction!,
    applied.records.contradiction_resolution!,
    applied.records.canonical_record,
    ...applied.records.projection_artifacts,
    applied.records.projection_manifest,
  ].filter((record): record is NonNullable<typeof record> => record !== undefined);
  const snapshotRecords = await writeSnapshotRecordCopies(outputRoot, snapshotId, snapshotSourceRecords);

  const snapshotPath = await writeSnapshotManifest(outputRoot, {
    snapshot_id: snapshotId,
    created_at: "2026-04-13T01:05:00.000Z",
    reason: "Applied contradiction resolution flow snapshot",
    record_refs: [...new Set(snapshotRecords.map((record) => record.record_id))],
    record_entries: snapshotRecords,
  });

  await appendAuditChange(outputRoot, {
    at: "2026-04-13T01:05:00.000Z",
    operation: "fixture_snapshot",
    record_id: applied.records.projection_manifest.id,
    record_kind: applied.records.projection_manifest.kind,
    record_layer: applied.records.projection_manifest.layer,
    detail: "Recorded applied contradiction resolution fixture snapshot.",
    related_refs: [snapshotId],
  });

  const projectionMarkdown = await readFile(applied.paths.projection_markdown, "utf8");
  const summaryPath = join(outputRoot, "fixture-summary.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        root: outputRoot,
        contradiction: applied.paths.contradiction,
        contradiction_resolution: applied.paths.contradiction_resolution,
        existing_world_claim: coreRecordPath(
          outputRoot,
          {
            id: applied.records.existing_world_claim.id,
            kind: applied.records.existing_world_claim.kind,
            layer: applied.records.existing_world_claim.layer,
          } as WorldClaim,
        ),
        candidate_world_claim: coreRecordPath(
          outputRoot,
          {
            id: applied.records.candidate_world_claim.id,
            kind: applied.records.candidate_world_claim.kind,
            layer: applied.records.candidate_world_claim.layer,
          } as WorldClaim,
        ),
        projection_markdown: applied.paths.projection_markdown,
        projection_manifest: applied.paths.projection_manifest,
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
  const detail =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : "Unknown error";

  process.stderr.write(`${detail}\n`);
  process.exitCode = 1;
});
