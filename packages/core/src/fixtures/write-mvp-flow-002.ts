import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { appendAuditChange, appendValidationLog, writeSnapshotManifest, writeSnapshotRecordCopies } from "../audit/log.js";
import { STORAGE_LAYOUT } from "../storage.js";
import { coreRecordPath, initializeStore, writeCoreRecord } from "../store/io.js";
import type {
  CanonicalMemoryObject,
  Proposal,
  SourceRecord,
  WikiClaim,
  WikiPage,
  WorldClaim,
} from "../types.js";
import { validateCoreRecord } from "../validation.js";
import {
  executeCanonicalProposalWorkflow,
  executeOpenClawBootstrapWorkflow,
  reconcileConversationPreferenceSupersede,
} from "../workflow-engine/pipeline.js";

function sourceRecord(input: {
  id: string;
  now: string;
  turnRef: string;
  contentRef: string;
}): SourceRecord {
  return {
    id: input.id,
    kind: "source_record",
    layer: "raw",
    authoritative_home: "raw",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: input.turnRef,
    },
    content_ref: input.contentRef,
  };
}

async function writeConversationSource(root: string, record: SourceRecord, message: string): Promise<void> {
  await writeFile(
    join(root, record.content_ref),
    `${JSON.stringify(
      {
        runtime: "openclaw",
        source_ref: record.provenance.source_ref,
        message,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function uniqueRecordRefs(recordIds: string[]): string[] {
  return [...new Set(recordIds)];
}

async function main(): Promise<void> {
  const outputRoot = resolve(process.argv[2] ?? "examples/mvp-flow-002/.cristalina-v4");
  const now = new Date().toISOString();
  await initializeStore(outputRoot, now);

  const src1 = sourceRecord({
    id: "src-mvp-002-001",
    now,
    turnRef: "runtime/session-002#turn-001",
    contentRef: "raw/sources/conversation-turn-002-001.json",
  });
  const src2 = sourceRecord({
    id: "src-mvp-002-002",
    now,
    turnRef: "runtime/session-002#turn-002",
    contentRef: "raw/sources/conversation-turn-002-002.json",
  });
  const src3 = sourceRecord({
    id: "src-mvp-002-003",
    now,
    turnRef: "runtime/session-002#turn-003",
    contentRef: "raw/sources/conversation-turn-002-003.json",
  });

  await writeConversationSource(outputRoot, src1, "The user says they prefer concise answers unless they explicitly ask for depth.");
  await writeConversationSource(outputRoot, src2, "The user clarifies that concise is the default, but implementation details should be more explicit when requested.");
  await writeConversationSource(outputRoot, src3, "The user says this preference should be treated as temporarily inactive until further confirmation.");

  const observation1 = {
    id: "obs-mvp-002-001",
    kind: "observation",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: now,
    updated_at: now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: src1.provenance.source_ref,
    },
    summary: "The user prefers concise answers unless they explicitly ask for depth.",
    epistemic_state: "observed",
  } as const;

  const worldClaim1: WorldClaim = {
    id: "wcl-mvp-002-001",
    kind: "preference",
    layer: "world",
    authoritative_home: "world",
    created_at: now,
    updated_at: now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: src1.provenance.source_ref,
      evidence_refs: [observation1.id],
    },
    statement: "The user prefers concise answers unless they explicitly ask for depth.",
    epistemic_state: "inferred",
    temporal_state: {
      temporal_status: "active",
      valid_from: now,
      valid_to: null,
    },
    support_refs: [observation1.id],
  };

  const wikiPage: WikiPage = {
    id: "wpg-mvp-002-001",
    kind: "wiki_page",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: now,
    updated_at: now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: src1.provenance.source_ref,
      evidence_refs: [observation1.id, worldClaim1.id],
    },
    page_kind: "entity",
    title: "User Interaction Preferences",
    path: "wiki/pages/user-interaction-preferences-v2.md",
    source_refs: [src1.id, src2.id, src3.id],
    canonical_refs: [],
    world_refs: [worldClaim1.id],
  };

  const wikiClaim: WikiClaim = {
    id: "wclm-mvp-002-001",
    kind: "wiki_claim",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: now,
    updated_at: now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: src1.provenance.source_ref,
      evidence_refs: [observation1.id, worldClaim1.id],
    },
    statement: "The user currently prefers concise answers by default.",
    page_ref: wikiPage.id,
    claim_status: "candidate_for_promotion",
    source_refs: [src1.id, src2.id],
  };

  const createProposal: Proposal = {
    id: "prop-mvp-002-001",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: src1.provenance.source_ref,
      evidence_refs: [observation1.id, worldClaim1.id, wikiClaim.id],
    },
    operation: "create",
    candidate_kind: "preference",
    target_layer: "canon",
    target_ref: null,
    candidate_payload: {
      kind: "preference",
      statement: "The user prefers concise answers unless they explicitly ask for depth.",
      temporal_state: {
        temporal_status: "active",
        valid_from: now,
        valid_to: null,
      },
      epistemic_state: "confirmed",
    },
    reason: "Initial durable preference candidate.",
    evidence_refs: [observation1.id],
    governance_state: "proposed",
  };

  const createWorkflow = executeCanonicalProposalWorkflow({
    proposal: createProposal,
    existing_canon_records: [],
    now,
    actor: "system:auto-ratify-flow-002",
    ratification_id: "rat-mvp-002-001",
    diagnostic_id: "diag-mvp-002-001",
    canonical_id: "mem-mvp-002-001",
  });
  if (!createWorkflow.accepted || !createWorkflow.created_record) throw new Error("Expected create proposal to be accepted");
  const canon1 = createWorkflow.created_record as CanonicalMemoryObject;

  const reviseProposal: Proposal = {
    ...createProposal,
    id: "prop-mvp-002-002",
    provenance: {
      source_type: "conversation",
      source_ref: src2.provenance.source_ref,
      evidence_refs: [canon1.id, src2.id],
    },
    operation: "revise",
    target_ref: {
      id: canon1.id,
      kind: canon1.kind,
      layer: canon1.layer,
    },
    candidate_payload: {
      kind: "preference",
      statement: "The user prefers concise answers by default, but wants more explicit detail when they ask for implementation depth.",
      temporal_state: {
        temporal_status: "active",
        valid_from: now,
        valid_to: null,
      },
      epistemic_state: "confirmed",
    },
    reason: "Refined formulation based on user clarification.",
  };

  const reviseWorkflow = executeCanonicalProposalWorkflow({
    proposal: reviseProposal,
    existing_canon_records: [canon1],
    existing_record: canon1,
    now,
    actor: "system:auto-ratify-flow-002",
    ratification_id: "rat-mvp-002-002",
    diagnostic_id: "diag-mvp-002-002",
    canonical_id: "mem-mvp-002-002",
  });
  if (!reviseWorkflow.accepted || !reviseWorkflow.created_record) throw new Error("Expected revise proposal to be accepted");

  const revisedCanon = reviseWorkflow.created_record as CanonicalMemoryObject;
  const supersededOriginal = reviseWorkflow.updated_records[0];

  const supersedeProposal: Proposal = {
    ...createProposal,
    id: "prop-mvp-002-003",
    provenance: {
      source_type: "conversation",
      source_ref: src3.provenance.source_ref,
      evidence_refs: [revisedCanon.id, src3.id],
    },
    operation: "supersede",
    target_ref: {
      id: revisedCanon.id,
      kind: revisedCanon.kind,
      layer: revisedCanon.layer,
    },
    candidate_payload: {
      kind: "preference",
      reason: "Temporarily inactive pending future confirmation.",
    },
    reason: "Withdraw currently active preference from canon pending confirmation.",
  };

  const supersedeWorkflow = executeCanonicalProposalWorkflow({
    proposal: supersedeProposal,
    existing_canon_records: [supersededOriginal, revisedCanon],
    existing_record: revisedCanon,
    now,
    actor: "system:auto-ratify-flow-002",
    ratification_id: "rat-mvp-002-003",
    diagnostic_id: "diag-mvp-002-003",
    canonical_id: "unused-mvp-002-003",
  });
  if (!supersedeWorkflow.accepted) throw new Error("Expected supersede proposal to be accepted");

  const supersededRevised = supersedeWorkflow.updated_records[0];
  const reconciledContext = reconcileConversationPreferenceSupersede({
    now,
    world_claim: worldClaim1,
    wiki_page: wikiPage,
    wiki_claim: wikiClaim,
    superseded_canonical_ref: supersededRevised.id,
    proposal_ref: supersedeProposal.id,
    ratification_ref: supersedeWorkflow.ratification_record.id,
  });

  const allRecords = [
    src1,
    src2,
    src3,
    observation1,
    reconciledContext.world_claim,
    reconciledContext.wiki_page,
    reconciledContext.wiki_claim,
    createProposal,
    createWorkflow.ratification_record,
    canon1,
    reviseProposal,
    reviseWorkflow.ratification_record,
    revisedCanon,
    supersededOriginal,
    supersedeProposal,
    supersedeWorkflow.ratification_record,
    supersededRevised,
  ];

  for (const record of allRecords) {
    await writeCoreRecord(outputRoot, record);
  }

  const validationIssues = allRecords.flatMap((record) => validateCoreRecord(record));
  await appendValidationLog(outputRoot, {
    at: now,
    scope: "fixture:mvp-flow-002",
    issues: validationIssues,
  });

  await appendAuditChange(outputRoot, {
    at: now,
    operation: "canon_apply_create",
    record_id: canon1.id,
    record_kind: canon1.kind,
    record_layer: canon1.layer,
    detail: "Applied initial create proposal.",
    related_refs: [createProposal.id, createWorkflow.ratification_record.id],
  });

  await appendAuditChange(outputRoot, {
    at: now,
    operation: "canon_apply_revise",
    record_id: revisedCanon.id,
    record_kind: revisedCanon.kind,
    record_layer: revisedCanon.layer,
    detail: "Applied revise proposal and superseded previous canonical record.",
    related_refs: [reviseProposal.id, reviseWorkflow.ratification_record.id, supersededOriginal.id],
  });

  await appendAuditChange(outputRoot, {
    at: now,
    operation: "canon_apply_supersede",
    record_id: supersededRevised.id,
    record_kind: supersededRevised.kind,
    record_layer: supersededRevised.layer,
    detail: "Applied supersede proposal to deactivate the revised canonical record.",
    related_refs: [supersedeProposal.id, supersedeWorkflow.ratification_record.id],
  });

  await appendAuditChange(outputRoot, {
    at: now,
    operation: "world_reconcile_after_supersede",
    record_id: reconciledContext.world_claim.id,
    record_kind: reconciledContext.world_claim.kind,
    record_layer: reconciledContext.world_claim.layer,
    detail: "Marked the world claim as disputed historical state after canonical supersede.",
    related_refs: [supersededRevised.id, supersedeProposal.id, supersedeWorkflow.ratification_record.id],
  });

  await appendAuditChange(outputRoot, {
    at: now,
    operation: "wiki_reconcile_after_supersede",
    record_id: reconciledContext.wiki_claim.id,
    record_kind: reconciledContext.wiki_claim.kind,
    record_layer: reconciledContext.wiki_claim.layer,
    detail: "Downgraded the wiki claim to editorial state after canonical supersede.",
    related_refs: [supersededRevised.id, supersedeProposal.id, supersedeWorkflow.ratification_record.id],
  });

  const wikiMarkdownPath = join(outputRoot, reconciledContext.wiki_page.path);
  await writeFile(
    wikiMarkdownPath,
    [
      "---",
      `page_id: ${reconciledContext.wiki_page.id}`,
      "page_kind: entity",
      `title: ${reconciledContext.wiki_page.title}`,
      `source_refs: [${reconciledContext.wiki_page.source_refs.join(", ")}]`,
      "---",
      "",
      "# User Interaction Preferences",
      "",
      "- Initial canon: concise unless depth is requested.",
      "- Revised canon: concise by default, more explicit when implementation depth is requested.",
      "- Current status: no active canonical preference; the previous preference is pending further confirmation.",
      "",
    ].join("\n"),
    "utf8",
  );

  const finalCanonRecords = [supersededOriginal, supersededRevised];
  const activeCanon = finalCanonRecords.filter((record) => record.governance_state === "ratified");
  const compiled = executeOpenClawBootstrapWorkflow({
    now,
    visibility_state: supersededRevised.visibility_state,
    canonical_records: activeCanon,
    world_claims: [reconciledContext.world_claim],
    wiki_pages: [reconciledContext.wiki_page],
    wiki_claims: [reconciledContext.wiki_claim],
    ids: {
      canon_artifact: "part-openclaw-flow2-canon-001",
      world_artifact: "part-openclaw-flow2-world-001",
      wiki_artifact: "part-openclaw-flow2-wiki-001",
      manifest: "pmf-openclaw-flow2-001",
    },
  });

  const projectionFilePath = join(outputRoot, STORAGE_LAYOUT.derived.openclaw, "bootstrap-memory.md");
  await writeFile(projectionFilePath, compiled.markdown, "utf8");
  for (const artifact of compiled.artifacts) {
    await writeCoreRecord(outputRoot, artifact);
  }
  await writeCoreRecord(outputRoot, compiled.manifest);

  const snapshotId = "snap-mvp-002-001";
  const snapshotRecords = await writeSnapshotRecordCopies(outputRoot, snapshotId, [
    ...allRecords,
    ...compiled.artifacts,
    compiled.manifest,
  ]);
  const snapshot = await writeSnapshotManifest(outputRoot, {
    snapshot_id: snapshotId,
    created_at: now,
    reason: "Create, revise, supersede flow snapshot",
    record_refs: uniqueRecordRefs(snapshotRecords.map((record) => record.record_id)),
    record_entries: snapshotRecords,
  });

  const canon1SnapshotPath = snapshotRecords[9]?.path ?? "";
  const revisedCanonSnapshotPath = snapshotRecords[12]?.path ?? "";
  const supersededOriginalSnapshotPath = snapshotRecords[13]?.path ?? "";
  const supersededRevisedSnapshotPath = snapshotRecords[16]?.path ?? "";

  const summary = {
    root: outputRoot,
    initial_canon: canon1SnapshotPath,
    revised_canon: revisedCanonSnapshotPath,
    superseded_original: supersededOriginalSnapshotPath,
    superseded_revised: supersededRevisedSnapshotPath,
    live_initial_canon: coreRecordPath(outputRoot, canon1),
    live_revised_canon: coreRecordPath(outputRoot, revisedCanon),
    create_proposal: coreRecordPath(outputRoot, createProposal),
    revise_proposal: coreRecordPath(outputRoot, reviseProposal),
    supersede_proposal: coreRecordPath(outputRoot, supersedeProposal),
    projection_manifest: coreRecordPath(outputRoot, compiled.manifest),
    openclaw_projection: projectionFilePath,
    snapshot_manifest: snapshot,
  };

  await writeFile(join(outputRoot, "fixture-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
  process.stderr.write(`${detail}\n`);
  process.exitCode = 1;
});
