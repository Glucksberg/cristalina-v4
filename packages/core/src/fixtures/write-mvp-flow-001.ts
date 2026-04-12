import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { appendAuditChange, appendValidationLog, writeSnapshotManifest } from "../audit/log.js";
import { compileOpenClawBootstrapProjection } from "../projection-engine/openclaw.js";
import type { Proposal, SourceRecord } from "../types.js";
import { STORAGE_LAYOUT } from "../storage.js";
import { coreRecordPath, initializeStore, loadCanonicalRecords, writeCoreRecord } from "../store/io.js";
import { evaluateCanonicalProposal } from "../governance/engine.js";
import { buildConversationPreferenceIntake, executeCanonicalProposalWorkflow } from "../workflow-engine/pipeline.js";
import { validateCoreRecord } from "../validation.js";

async function main(): Promise<void> {
  const outputRoot = resolve(process.argv[2] ?? "examples/mvp-flow-001/.cristalina-v4");
  const now = new Date().toISOString();

  await initializeStore(outputRoot, now);

  const sourceRecord: SourceRecord = {
    id: "src-mvp-001",
    kind: "source_record",
    layer: "raw",
    authoritative_home: "raw",
    created_at: now,
    updated_at: now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: "runtime/session-001#turn-001",
    },
    content_ref: "raw/sources/conversation-turn-001.json",
  };

  const rawSourcePath = join(outputRoot, sourceRecord.content_ref);
  await writeFile(
    rawSourcePath,
    `${JSON.stringify(
      {
        runtime: "openclaw",
        source_ref: sourceRecord.provenance.source_ref,
        message: "The user says they prefer concise answers unless they explicitly ask for depth.",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const intake = buildConversationPreferenceIntake({
    now,
    statement: "The user prefers concise answers unless they explicitly ask for depth.",
    source_record: sourceRecord,
    ids: {
      observation: "obs-mvp-001",
      world_claim: "wcl-mvp-001",
      wiki_page: "wpg-mvp-001",
      wiki_claim: "wclm-mvp-001",
      proposal: "prop-mvp-001",
      disposition: "disp-mvp-001",
    },
  });

  const canonicalWorkflow = executeCanonicalProposalWorkflow({
    proposal: intake.proposal,
    existing_canon_records: [],
    now,
    actor: "system:auto-ratify-mvp",
    ratification_id: "rat-mvp-001",
    diagnostic_id: "diag-mvp-001",
    canonical_id: "mem-mvp-001",
  });

  if (!canonicalWorkflow.accepted || !canonicalWorkflow.created_record) {
    throw new Error("Expected MVP flow 001 canonical workflow to succeed");
  }

  await writeCoreRecord(outputRoot, sourceRecord);
  await writeCoreRecord(outputRoot, intake.observation);
  await writeCoreRecord(outputRoot, intake.world_claim);
  await writeCoreRecord(outputRoot, intake.wiki_page);
  await writeCoreRecord(outputRoot, intake.wiki_claim);
  await writeCoreRecord(outputRoot, intake.proposal);
  await writeCoreRecord(outputRoot, intake.disposition_record);
  await writeCoreRecord(outputRoot, canonicalWorkflow.ratification_record);
  await writeCoreRecord(outputRoot, canonicalWorkflow.created_record);
  if (canonicalWorkflow.diagnostic) {
    await writeCoreRecord(outputRoot, canonicalWorkflow.diagnostic);
  }

  const validationIssues = [
    ...validateCoreRecord(sourceRecord),
    ...validateCoreRecord(intake.observation),
    ...validateCoreRecord(intake.world_claim),
    ...validateCoreRecord(intake.wiki_page),
    ...validateCoreRecord(intake.wiki_claim),
    ...validateCoreRecord(intake.proposal),
    ...validateCoreRecord(intake.disposition_record),
    ...validateCoreRecord(canonicalWorkflow.ratification_record),
    ...validateCoreRecord(canonicalWorkflow.created_record),
  ];

  await appendValidationLog(outputRoot, {
    at: now,
    scope: "fixture:mvp-flow-001",
    issues: validationIssues,
  });

  await appendAuditChange(outputRoot, {
    at: now,
    operation: "record_observation",
    record_id: intake.observation.id,
    record_kind: intake.observation.kind,
    record_layer: intake.observation.layer,
    detail: "Recorded observation from conversation preference input.",
    related_refs: [sourceRecord.id],
  });

  await appendAuditChange(outputRoot, {
    at: now,
    operation: "governance_accept",
    record_id: canonicalWorkflow.ratification_record.id,
    record_kind: canonicalWorkflow.ratification_record.kind,
    record_layer: canonicalWorkflow.ratification_record.layer,
    detail: "Baseline governance approved create proposal into canon.",
    related_refs: [intake.proposal.id],
  });

  await appendAuditChange(outputRoot, {
    at: now,
    operation: "canon_apply_create",
    record_id: canonicalWorkflow.created_record.id,
    record_kind: canonicalWorkflow.created_record.kind,
    record_layer: canonicalWorkflow.created_record.layer,
    detail: "Applied approved create proposal into canonical memory.",
    related_refs: [intake.proposal.id, canonicalWorkflow.ratification_record.id],
  });

  const existingCanon = await loadCanonicalRecords(outputRoot);
  const duplicateProposal: Proposal = {
    ...intake.proposal,
    id: "prop-mvp-002",
    created_at: now,
    updated_at: now,
    provenance: {
      ...intake.proposal.provenance,
      evidence_refs: [...(intake.proposal.provenance.evidence_refs ?? []), canonicalWorkflow.created_record.id],
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
    related_refs: [duplicateProposal.id, canonicalWorkflow.created_record.id],
  });

  const wikiMarkdownPath = join(outputRoot, intake.wiki_page.path);
  await writeFile(
    wikiMarkdownPath,
    [
      "---",
      `page_id: ${intake.wiki_page.id}`,
      "page_kind: entity",
      `title: ${intake.wiki_page.title}`,
      `source_refs: [${sourceRecord.id}]`,
      `world_refs: [${intake.world_claim.id}]`,
      "---",
      "",
      "# User Interaction Preferences",
      "",
      "- The user prefers concise answers unless they explicitly ask for depth.",
      "",
      `Canonical candidate: ${canonicalWorkflow.created_record.id}`,
      "",
    ].join("\n"),
    "utf8",
  );

  const projectionPath = join(outputRoot, STORAGE_LAYOUT.derived.openclaw, "bootstrap-memory.md");
  const compiled = compileOpenClawBootstrapProjection({
    now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    projection_path: "derived/openclaw/bootstrap-memory.md",
    canonical_records: [canonicalWorkflow.created_record],
    world_claims: [intake.world_claim],
    wiki_pages: [intake.wiki_page],
    wiki_claims: [intake.wiki_claim],
    ids: {
      canon_artifact: "part-openclaw-canon-mvp-001",
      world_artifact: "part-openclaw-world-mvp-001",
      wiki_artifact: "part-openclaw-wiki-mvp-001",
      manifest: "pmf-openclaw-mvp-001",
    },
  });

  await writeFile(projectionPath, compiled.markdown, "utf8");

  for (const artifact of compiled.artifacts) {
    await writeCoreRecord(outputRoot, artifact);
  }
  await writeCoreRecord(outputRoot, compiled.manifest);

  await appendAuditChange(outputRoot, {
    at: now,
    operation: "projection_compile",
    record_id: compiled.manifest.id,
    record_kind: compiled.manifest.kind,
    record_layer: compiled.manifest.layer,
    detail: "Compiled projection fragments and manifest for OpenClaw bootstrap package.",
    related_refs: compiled.artifacts.map((artifact) => artifact.id),
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
      canonicalWorkflow.ratification_record.id,
      canonicalWorkflow.created_record.id,
      duplicateProposal.id,
      duplicateGovernance.ratification_record.id,
      ...(duplicateGovernance.diagnostic ? [duplicateGovernance.diagnostic.id] : []),
      ...compiled.artifacts.map((artifact) => artifact.id),
      compiled.manifest.id,
    ],
  });

  const summaryPath = join(outputRoot, "fixture-summary.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        root: outputRoot,
        source_record: coreRecordPath(outputRoot, sourceRecord),
        observation: coreRecordPath(outputRoot, intake.observation),
        world_claim: coreRecordPath(outputRoot, intake.world_claim),
        wiki_page_record: coreRecordPath(outputRoot, intake.wiki_page),
        wiki_page_markdown: wikiMarkdownPath,
        proposal: coreRecordPath(outputRoot, intake.proposal),
        duplicate_proposal: coreRecordPath(outputRoot, duplicateProposal),
        disposition_record: coreRecordPath(outputRoot, intake.disposition_record),
        ratification_record: coreRecordPath(outputRoot, canonicalWorkflow.ratification_record),
        duplicate_ratification_record: coreRecordPath(outputRoot, duplicateGovernance.ratification_record),
        duplicate_diagnostic: duplicateGovernance.diagnostic ? coreRecordPath(outputRoot, duplicateGovernance.diagnostic) : null,
        canonical_candidate: coreRecordPath(outputRoot, canonicalWorkflow.created_record),
        openclaw_projection: projectionPath,
        projection_manifest: coreRecordPath(outputRoot, compiled.manifest),
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
