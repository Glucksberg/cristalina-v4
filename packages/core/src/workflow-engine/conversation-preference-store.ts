import { access, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { appendAuditChange, appendValidationLog } from "../audit/log.js";
import { coreRecordPath, initializeStore, loadCanonicalRecords, readCoreRecord, writeCoreRecord } from "../store/io.js";
import type {
  CanonicalMemoryObject,
  DispositionRecord,
  Observation,
  ProjectionArtifact,
  ProjectionManifest,
  Proposal,
  RatificationRecord,
  RuntimeKind,
  SourceRecord,
  WikiClaim,
  WikiPage,
  WorldClaim,
} from "../types.js";
import { validateCoreRecord, type ValidationIssue } from "../validation.js";
import {
  buildConversationPreferenceIntake,
  executeCanonicalProposalWorkflow,
  executeOpenClawBootstrapWorkflow,
  type ConversationPreferenceIntakeArtifacts,
} from "./pipeline.js";

export interface ConversationPreferenceStoreIds {
  observation: string;
  world_claim: string;
  wiki_page: string;
  wiki_claim: string;
  proposal: string;
  disposition: string;
  ratification: string;
  diagnostic?: string;
  canonical: string;
  canon_artifact: string;
  world_artifact: string;
  wiki_artifact: string;
  projection_manifest: string;
}

export interface ConversationPreferenceStoreInput {
  rootDir: string;
  now: string;
  actor: string;
  statement: string;
  source: {
    id: string;
    source_ref: string;
    content_ref: string;
    runtime: RuntimeKind;
    message: string;
  };
  ids: ConversationPreferenceStoreIds;
  validation_scope?: string;
}

export interface ConversationPreferenceStorePaths {
  raw_source: string;
  source_record: string;
  observation: string;
  world_claim: string;
  wiki_page_record: string;
  wiki_page_markdown: string;
  wiki_claim: string;
  proposal: string;
  disposition_record: string;
  ratification_record: string;
  canonical_record: string;
  projection_markdown: string;
  projection_manifest: string;
  projection_artifacts: {
    canon: string;
    world: string;
    wiki: string;
  };
}

export interface ConversationPreferenceStoreRecords {
  source_record: SourceRecord;
  intake: ConversationPreferenceIntakeArtifacts;
  ratification_record: RatificationRecord;
  canonical_record: CanonicalMemoryObject;
  projection_artifacts: ProjectionArtifact[];
  projection_manifest: ProjectionManifest;
}

export interface ConversationPreferenceStoreResult {
  reused: boolean;
  paths: ConversationPreferenceStorePaths;
  records: ConversationPreferenceStoreRecords;
  validation_issues: ValidationIssue[];
}

interface LoadedAuthoritativeFlow {
  source_record: SourceRecord;
  intake: ConversationPreferenceIntakeArtifacts;
  ratification_record: RatificationRecord;
  canonical_record: CanonicalMemoryObject;
}

function resolveStorePath(rootDir: string, relativePath: string): string {
  const rootPath = resolve(rootDir);
  const targetPath = resolve(rootPath, relativePath);
  const relativePathFromRoot = relative(rootPath, targetPath);

  if (
    relativePathFromRoot === "" ||
    relativePathFromRoot.startsWith("..") ||
    isAbsolute(relativePathFromRoot)
  ) {
    throw new Error(`Resolved path escapes store root: ${relativePath}`);
  }

  return targetPath;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function serializeSourcePayload(input: ConversationPreferenceStoreInput): string {
  return `${JSON.stringify(
    {
      runtime: input.source.runtime,
      source_ref: input.source.source_ref,
      message: input.source.message,
    },
    null,
    2,
  )}\n`;
}

function buildSourceRecord(input: ConversationPreferenceStoreInput): SourceRecord {
  return {
    id: input.source.id,
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
      source_ref: input.source.source_ref,
    },
    content_ref: input.source.content_ref,
  };
}

function buildPaths(
  rootDir: string,
  sourceRecord: SourceRecord,
  intake: ConversationPreferenceIntakeArtifacts,
  input: ConversationPreferenceStoreInput,
): ConversationPreferenceStorePaths {
  return {
    raw_source: resolveStorePath(rootDir, sourceRecord.content_ref),
    source_record: coreRecordPath(rootDir, sourceRecord),
    observation: coreRecordPath(rootDir, intake.observation),
    world_claim: coreRecordPath(rootDir, intake.world_claim),
    wiki_page_record: coreRecordPath(rootDir, intake.wiki_page),
    wiki_page_markdown: resolveStorePath(rootDir, intake.wiki_page.path),
    wiki_claim: coreRecordPath(rootDir, intake.wiki_claim),
    proposal: coreRecordPath(rootDir, intake.proposal),
    disposition_record: coreRecordPath(rootDir, intake.disposition_record),
    ratification_record: coreRecordPath(
      rootDir,
      {
        id: input.ids.ratification,
        kind: "ratification",
        layer: "governance",
      } as RatificationRecord,
    ),
    canonical_record: coreRecordPath(
      rootDir,
      {
        id: input.ids.canonical,
        kind: "preference",
        layer: "canon",
      } as CanonicalMemoryObject,
    ),
    projection_markdown: resolveStorePath(rootDir, "derived/openclaw/bootstrap-memory.md"),
    projection_manifest: coreRecordPath(
      rootDir,
      {
        id: input.ids.projection_manifest,
        kind: "projection_manifest",
        layer: "derived",
        adapter: "openclaw",
      } as ProjectionManifest,
    ),
    projection_artifacts: {
      canon: coreRecordPath(
        rootDir,
        {
          id: input.ids.canon_artifact,
          kind: "projection_artifact",
          layer: "derived",
          adapter: "openclaw",
        } as ProjectionArtifact,
      ),
      world: coreRecordPath(
        rootDir,
        {
          id: input.ids.world_artifact,
          kind: "projection_artifact",
          layer: "derived",
          adapter: "openclaw",
        } as ProjectionArtifact,
      ),
      wiki: coreRecordPath(
        rootDir,
        {
          id: input.ids.wiki_artifact,
          kind: "projection_artifact",
          layer: "derived",
          adapter: "openclaw",
        } as ProjectionArtifact,
      ),
    },
  };
}

async function loadExistingFlow(
  input: ConversationPreferenceStoreInput,
  paths: ConversationPreferenceStorePaths,
): Promise<ConversationPreferenceStoreResult | undefined> {
  const authoritativePaths = [
    paths.raw_source,
    paths.source_record,
    paths.observation,
    paths.world_claim,
    paths.wiki_page_record,
    paths.wiki_claim,
    paths.proposal,
    paths.disposition_record,
    paths.ratification_record,
    paths.canonical_record,
  ];

  const authoritativePresence = await Promise.all(authoritativePaths.map((filePath) => pathExists(filePath)));
  const hasAnyAuthoritativeState = authoritativePresence.some(Boolean);
  const hasCompleteAuthoritativeState = authoritativePresence.every(Boolean);

  if (!hasAnyAuthoritativeState) {
    return undefined;
  }

  if (!hasCompleteAuthoritativeState) {
    throw new Error("Existing conversation preference flow is partially materialized in authoritative storage");
  }

  const loaded = await loadAuthoritativeFlow(paths);
  assertLoadedFlowMatchesInput(loaded, input);

  await ensureReplayableArtifacts(input, paths, loaded);

  const requiredPaths = [
    paths.raw_source,
    paths.source_record,
    paths.observation,
    paths.world_claim,
    paths.wiki_page_record,
    paths.wiki_page_markdown,
    paths.wiki_claim,
    paths.proposal,
    paths.disposition_record,
    paths.ratification_record,
    paths.canonical_record,
    paths.projection_markdown,
    paths.projection_manifest,
    paths.projection_artifacts.canon,
    paths.projection_artifacts.world,
    paths.projection_artifacts.wiki,
  ];

  if (!(await Promise.all(requiredPaths.map((filePath) => pathExists(filePath)))).every(Boolean)) {
    throw new Error("Conversation preference flow repair did not restore all expected artifacts");
  }

  const { source_record, intake, ratification_record, canonical_record } = loaded;
  const projection_artifacts = await Promise.all([
    readCoreRecord<ProjectionArtifact>(paths.projection_artifacts.canon),
    readCoreRecord<ProjectionArtifact>(paths.projection_artifacts.world),
    readCoreRecord<ProjectionArtifact>(paths.projection_artifacts.wiki),
  ]);
  const projection_manifest = await readCoreRecord<ProjectionManifest>(paths.projection_manifest);

  const validation_issues = [
    source_record,
    intake.observation,
    intake.world_claim,
    intake.wiki_page,
    intake.wiki_claim,
    intake.proposal,
    intake.disposition_record,
    ratification_record,
    canonical_record,
    ...projection_artifacts,
    projection_manifest,
  ].flatMap((record) => validateCoreRecord(record));

  return {
    reused: true,
    paths,
    records: {
      source_record,
      intake,
      ratification_record,
      canonical_record,
      projection_artifacts,
      projection_manifest,
    },
    validation_issues,
  };
}

async function loadAuthoritativeFlow(paths: ConversationPreferenceStorePaths): Promise<LoadedAuthoritativeFlow> {
  return {
    source_record: await readCoreRecord<SourceRecord>(paths.source_record),
    intake: {
      observation: await readCoreRecord<Observation>(paths.observation),
      world_claim: await readCoreRecord<WorldClaim>(paths.world_claim),
      wiki_page: await readCoreRecord<WikiPage>(paths.wiki_page_record),
      wiki_claim: await readCoreRecord<WikiClaim>(paths.wiki_claim),
      proposal: await readCoreRecord<Proposal>(paths.proposal),
      disposition_record: await readCoreRecord<DispositionRecord>(paths.disposition_record),
    },
    ratification_record: await readCoreRecord<RatificationRecord>(paths.ratification_record),
    canonical_record: await readCoreRecord<CanonicalMemoryObject>(paths.canonical_record),
  };
}

function assertLoadedFlowMatchesInput(
  loaded: LoadedAuthoritativeFlow,
  input: ConversationPreferenceStoreInput,
): void {
  const mismatches: string[] = [];
  const proposalStatement =
    typeof loaded.intake.proposal.candidate_payload.statement === "string"
      ? loaded.intake.proposal.candidate_payload.statement
      : undefined;

  if (loaded.source_record.id !== input.source.id) mismatches.push("source.id");
  if (loaded.source_record.content_ref !== input.source.content_ref) mismatches.push("source.content_ref");
  if (loaded.source_record.provenance.source_ref !== input.source.source_ref) mismatches.push("source.source_ref");
  if (loaded.intake.observation.summary !== input.statement) mismatches.push("observation.summary");
  if (loaded.intake.world_claim.statement !== input.statement) mismatches.push("world_claim.statement");
  if (loaded.intake.wiki_claim.statement !== input.statement) mismatches.push("wiki_claim.statement");
  if (proposalStatement !== input.statement) mismatches.push("proposal.candidate_payload.statement");
  if (loaded.canonical_record.statement !== input.statement) mismatches.push("canonical_record.statement");

  if (mismatches.length > 0) {
    throw new Error(`Existing conversation preference flow does not match input: ${mismatches.join(", ")}`);
  }
}

async function ensureReplayableArtifacts(
  input: ConversationPreferenceStoreInput,
  paths: ConversationPreferenceStorePaths,
  loaded: LoadedAuthoritativeFlow,
): Promise<void> {
  const persistedSource = await readFile(paths.raw_source, "utf8");
  if (persistedSource !== serializeSourcePayload(input)) {
    throw new Error("Existing conversation preference source payload does not match input");
  }

  if (!(await pathExists(paths.wiki_page_markdown))) {
    await writeFile(
      paths.wiki_page_markdown,
      renderWikiMarkdown(
        loaded.intake.wiki_page,
        loaded.source_record,
        loaded.intake.world_claim.id,
        loaded.canonical_record.statement,
        loaded.canonical_record.id,
      ),
      "utf8",
    );
  }

  const projection = executeOpenClawBootstrapWorkflow({
    now: loaded.canonical_record.updated_at ?? loaded.canonical_record.created_at,
    canonical_records: [loaded.canonical_record],
    world_claims: [loaded.intake.world_claim],
    wiki_pages: [loaded.intake.wiki_page],
    wiki_claims: [loaded.intake.wiki_claim],
    ids: {
      canon_artifact: input.ids.canon_artifact,
      world_artifact: input.ids.world_artifact,
      wiki_artifact: input.ids.wiki_artifact,
      manifest: input.ids.projection_manifest,
    },
  });

  if (!(await pathExists(paths.projection_markdown))) {
    await writeFile(paths.projection_markdown, projection.markdown, "utf8");
  }
  if (!(await pathExists(paths.projection_artifacts.canon))) {
    await writeCoreRecord(resolve(input.rootDir), projection.artifacts[0]!);
  }
  if (!(await pathExists(paths.projection_artifacts.world))) {
    await writeCoreRecord(resolve(input.rootDir), projection.artifacts[1]!);
  }
  if (!(await pathExists(paths.projection_artifacts.wiki))) {
    await writeCoreRecord(resolve(input.rootDir), projection.artifacts[2]!);
  }
  if (!(await pathExists(paths.projection_manifest))) {
    await writeCoreRecord(resolve(input.rootDir), projection.manifest);
  }
}

function renderWikiMarkdown(wikiPage: WikiPage, sourceRecord: SourceRecord, worldClaimId: string, statement: string, canonicalId: string): string {
  return [
    "---",
    `page_id: ${wikiPage.id}`,
    "page_kind: entity",
    `title: ${wikiPage.title}`,
    `source_refs: [${sourceRecord.id}]`,
    `world_refs: [${worldClaimId}]`,
    "---",
    "",
    "# User Interaction Preferences",
    "",
    `- ${statement}`,
    "",
    `Canonical candidate: ${canonicalId}`,
    "",
  ].join("\n");
}

export async function writeConversationPreferenceFlowToStore(
  input: ConversationPreferenceStoreInput,
): Promise<ConversationPreferenceStoreResult> {
  const rootDir = resolve(input.rootDir);
  await initializeStore(rootDir, input.now);

  const source_record = buildSourceRecord(input);
  const intake = buildConversationPreferenceIntake({
    now: input.now,
    statement: input.statement,
    source_record,
    ids: {
      observation: input.ids.observation,
      world_claim: input.ids.world_claim,
      wiki_page: input.ids.wiki_page,
      wiki_claim: input.ids.wiki_claim,
      proposal: input.ids.proposal,
      disposition: input.ids.disposition,
    },
  });
  const paths = buildPaths(rootDir, source_record, intake, input);

  const existingFlow = await loadExistingFlow(input, paths);
  if (existingFlow) {
    return existingFlow;
  }

  const existingCanonicalRecords = await loadCanonicalRecords(rootDir);
  const canonicalWorkflow = executeCanonicalProposalWorkflow({
    proposal: intake.proposal,
    existing_canon_records: existingCanonicalRecords,
    now: input.now,
    actor: input.actor,
    ratification_id: input.ids.ratification,
    diagnostic_id: input.ids.diagnostic,
    canonical_id: input.ids.canonical,
  });

  if (!canonicalWorkflow.accepted || !canonicalWorkflow.created_record) {
    throw new Error("Conversation preference workflow must produce an approved canonical record");
  }

  await writeFile(
    paths.raw_source,
    serializeSourcePayload(input),
    "utf8",
  );

  await writeCoreRecord(rootDir, source_record);
  await writeCoreRecord(rootDir, intake.observation);
  await writeCoreRecord(rootDir, intake.world_claim);
  await writeCoreRecord(rootDir, intake.wiki_page);
  await writeCoreRecord(rootDir, intake.wiki_claim);
  await writeCoreRecord(rootDir, intake.proposal);
  await writeCoreRecord(rootDir, intake.disposition_record);
  await writeCoreRecord(rootDir, canonicalWorkflow.ratification_record);
  await writeCoreRecord(rootDir, canonicalWorkflow.created_record);
  if (canonicalWorkflow.diagnostic) {
    await writeCoreRecord(rootDir, canonicalWorkflow.diagnostic);
  }

  await writeFile(
    paths.wiki_page_markdown,
    renderWikiMarkdown(
      intake.wiki_page,
      source_record,
      intake.world_claim.id,
      input.statement,
      canonicalWorkflow.created_record.id,
    ),
    "utf8",
  );

  const projection = executeOpenClawBootstrapWorkflow({
    now: input.now,
    canonical_records: [canonicalWorkflow.created_record],
    world_claims: [intake.world_claim],
    wiki_pages: [intake.wiki_page],
    wiki_claims: [intake.wiki_claim],
    ids: {
      canon_artifact: input.ids.canon_artifact,
      world_artifact: input.ids.world_artifact,
      wiki_artifact: input.ids.wiki_artifact,
      manifest: input.ids.projection_manifest,
    },
  });

  await writeFile(paths.projection_markdown, projection.markdown, "utf8");
  for (const artifact of projection.artifacts) {
    await writeCoreRecord(rootDir, artifact);
  }
  await writeCoreRecord(rootDir, projection.manifest);

  const validation_issues = [
    source_record,
    intake.observation,
    intake.world_claim,
    intake.wiki_page,
    intake.wiki_claim,
    intake.proposal,
    intake.disposition_record,
    canonicalWorkflow.ratification_record,
    canonicalWorkflow.created_record,
    ...projection.artifacts,
    projection.manifest,
  ].flatMap((record) => validateCoreRecord(record));

  await appendValidationLog(rootDir, {
    at: input.now,
    scope: input.validation_scope ?? "workflow:conversation-preference",
    issues: validation_issues,
  });

  await appendAuditChange(rootDir, {
    at: input.now,
    operation: "record_observation",
    record_id: intake.observation.id,
    record_kind: intake.observation.kind,
    record_layer: intake.observation.layer,
    detail: "Recorded observation from conversation preference input.",
    related_refs: [source_record.id],
  });

  await appendAuditChange(rootDir, {
    at: input.now,
    operation: "governance_accept",
    record_id: canonicalWorkflow.ratification_record.id,
    record_kind: canonicalWorkflow.ratification_record.kind,
    record_layer: canonicalWorkflow.ratification_record.layer,
    detail: "Baseline governance approved create proposal into canon.",
    related_refs: [intake.proposal.id],
  });

  await appendAuditChange(rootDir, {
    at: input.now,
    operation: "canon_apply_create",
    record_id: canonicalWorkflow.created_record.id,
    record_kind: canonicalWorkflow.created_record.kind,
    record_layer: canonicalWorkflow.created_record.layer,
    detail: "Applied approved create proposal into canonical memory.",
    related_refs: [intake.proposal.id, canonicalWorkflow.ratification_record.id],
  });

  await appendAuditChange(rootDir, {
    at: input.now,
    operation: "projection_compile",
    record_id: projection.manifest.id,
    record_kind: projection.manifest.kind,
    record_layer: projection.manifest.layer,
    detail: "Compiled projection fragments and manifest for OpenClaw bootstrap package.",
    related_refs: projection.artifacts.map((artifact) => artifact.id),
  });

  return {
    reused: false,
    paths,
    records: {
      source_record,
      intake,
      ratification_record: canonicalWorkflow.ratification_record,
      canonical_record: canonicalWorkflow.created_record,
      projection_artifacts: projection.artifacts,
      projection_manifest: projection.manifest,
    },
    validation_issues,
  };
}

export async function readConversationPreferenceFlowResult(
  input: ConversationPreferenceStoreInput,
): Promise<ConversationPreferenceStoreResult | undefined> {
  const rootDir = resolve(input.rootDir);
  const source_record = buildSourceRecord(input);
  const intake = buildConversationPreferenceIntake({
    now: input.now,
    statement: input.statement,
    source_record,
    ids: {
      observation: input.ids.observation,
      world_claim: input.ids.world_claim,
      wiki_page: input.ids.wiki_page,
      wiki_claim: input.ids.wiki_claim,
      proposal: input.ids.proposal,
      disposition: input.ids.disposition,
    },
  });

  return loadExistingFlow(input, buildPaths(rootDir, source_record, intake, input));
}
