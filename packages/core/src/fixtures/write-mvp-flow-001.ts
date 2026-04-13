import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { appendAuditChange, writeSnapshotManifest } from "../audit/log.js";
import type { Proposal } from "../types.js";
import { coreRecordPath, loadCanonicalRecords, writeCoreRecord } from "../store/io.js";
import { evaluateCanonicalProposal } from "../governance/engine.js";
import { writeConversationPreferenceFlowToStore } from "../workflow-engine/conversation-preference-store.js";

async function main(): Promise<void> {
  const outputRoot = resolve(process.argv[2] ?? "examples/mvp-flow-001/.cristalina-v4");
  const now = new Date().toISOString();

  const flow = await writeConversationPreferenceFlowToStore({
    rootDir: outputRoot,
    now,
    actor: "system:auto-ratify-mvp",
    statement: "The user prefers concise answers unless they explicitly ask for depth.",
    identity_context: {
      runtime: "openclaw",
      ids: {
        agent_identity: "actor-agent-mvp-001",
        owner_identity: "actor-owner-mvp-001",
        runtime_instance: "runtime-mvp-001",
        runtime_session: "session-mvp-001",
        conversation_thread: "thread-mvp-001",
      },
      agent_label: "Cristalina MVP Agent",
      owner_label: "MVP Owner",
      session_objective: "Bootstrap governed preference memory",
      session_summary: "MVP Flow 001 runtime session",
      message_refs: ["msg-mvp-001"],
      thread_summary: "MVP Flow 001 thread",
    },
    source: {
      id: "src-mvp-001",
      source_ref: "runtime/session-001#turn-001",
      content_ref: "raw/sources/conversation-turn-001.json",
      runtime: "openclaw",
      message: "The user says they prefer concise answers unless they explicitly ask for depth.",
    },
    ids: {
      observation: "obs-mvp-001",
      episode: "ep-mvp-001",
      subject_entity: "ent-subject-mvp-001",
      preference_entity: "ent-preference-mvp-001",
      preference_relation: "rel-preference-mvp-001",
      world_claim: "wcl-mvp-001",
      contradiction: "contra-mvp-001",
      wiki_page: "wpg-mvp-001",
      wiki_claim: "wclm-mvp-001",
      proposal: "prop-mvp-001",
      disposition: "disp-mvp-001",
      ratification: "rat-mvp-001",
      diagnostic: "diag-mvp-001",
      canonical: "mem-mvp-001",
      canon_artifact: "part-openclaw-canon-mvp-001",
      world_artifact: "part-openclaw-world-mvp-001",
      wiki_artifact: "part-openclaw-wiki-mvp-001",
      projection_manifest: "pmf-openclaw-mvp-001",
    },
    validation_scope: "fixture:mvp-flow-001",
  });

  const sourceRecord = flow.records.source_record;
  const intake = flow.records.intake;
  const canonicalRecord = flow.records.canonical_record;
  const ratificationRecord = flow.records.ratification_record;

  const existingCanon = await loadCanonicalRecords(outputRoot);
  const duplicateProposal: Proposal = {
    ...intake.proposal,
    id: "prop-mvp-002",
    created_at: now,
    updated_at: now,
    provenance: {
      ...intake.proposal.provenance,
      evidence_refs: [...(intake.proposal.provenance.evidence_refs ?? []), canonicalRecord.id],
    },
    reason: "Intentional duplicate create to exercise conflict gate against canon.",
  };

  const duplicateGovernance = evaluateCanonicalProposal({
    proposal: duplicateProposal,
    existing_canon_records: existingCanon,
    now,
    actor: "system:auto-ratify-mvp",
    ratification_id: "rat-mvp-002",
    diagnostic_id: "diag-mvp-002",
  });

  await writeCoreRecord(outputRoot, duplicateProposal);
  await writeCoreRecord(outputRoot, duplicateGovernance.ratification_record);
  if (duplicateGovernance.diagnostic) {
    await writeCoreRecord(outputRoot, duplicateGovernance.diagnostic);
  }

  await appendAuditChange(outputRoot, {
    at: now,
    operation: "governance_reject",
    record_id: duplicateGovernance.ratification_record.id,
    record_kind: duplicateGovernance.ratification_record.kind,
    record_layer: duplicateGovernance.ratification_record.layer,
    detail: "Duplicate create proposal rejected by conflict gate against existing canon.",
    related_refs: [duplicateProposal.id, canonicalRecord.id],
  });

  const snapshotPath = await writeSnapshotManifest(outputRoot, {
    snapshot_id: "snap-mvp-001",
    created_at: now,
    reason: "Post-canon MVP Flow 001 baseline snapshot",
    record_refs: [
      sourceRecord.id,
      intake.observation.id,
      intake.world_claim.id,
      intake.wiki_page.id,
      intake.wiki_claim.id,
      intake.proposal.id,
      intake.disposition_record.id,
      ratificationRecord.id,
      canonicalRecord.id,
      duplicateProposal.id,
      duplicateGovernance.ratification_record.id,
      ...(duplicateGovernance.diagnostic ? [duplicateGovernance.diagnostic.id] : []),
      ...flow.records.projection_artifacts.map((artifact) => artifact.id),
      flow.records.projection_manifest.id,
    ],
  });

  const summaryPath = join(outputRoot, "fixture-summary.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        root: outputRoot,
        source_record: flow.paths.source_record,
        observation: flow.paths.observation,
        world_claim: flow.paths.world_claim,
        wiki_page_record: flow.paths.wiki_page_record,
        wiki_page_markdown: flow.paths.wiki_page_markdown,
        proposal: flow.paths.proposal,
        duplicate_proposal: coreRecordPath(outputRoot, duplicateProposal),
        disposition_record: flow.paths.disposition_record,
        ratification_record: flow.paths.ratification_record,
        duplicate_ratification_record: coreRecordPath(outputRoot, duplicateGovernance.ratification_record),
        duplicate_diagnostic: duplicateGovernance.diagnostic ? coreRecordPath(outputRoot, duplicateGovernance.diagnostic) : null,
        canonical_candidate: flow.paths.canonical_record,
        openclaw_projection: flow.paths.projection_markdown,
        projection_manifest: flow.paths.projection_manifest,
        snapshot_manifest: snapshotPath,
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
