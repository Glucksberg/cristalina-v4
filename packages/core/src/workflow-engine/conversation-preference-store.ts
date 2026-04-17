import { access, readFile, rm } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import {
  appendAuditChange,
  appendValidationLog,
  type AuditChangeEntry,
  type ValidationLogEntry,
} from "../audit/log.js";
import { defaultOpenClawBootstrapProjectionPath } from "../projection-engine/openclaw.js";
import { ValidationError, validateCoreRecord, type ValidationIssue } from "../validation.js";
import {
  coreRecordPath,
  initializeStore,
  loadActorIdentities,
  loadCanonicalRecords,
  loadConversationThreads,
  loadContradictionResolutions,
  loadCurationPackets,
  loadDiagnostics,
  loadProposals,
  loadRatificationRecords,
  loadRuntimeInstances,
  loadRuntimeSessions,
  loadWikiClaims,
  loadWikiPages,
  loadWorldClaims,
  loadWorldContradictions,
  loadWorldEntities,
  loadWorldEpisodes,
  loadWorldRelations,
  readCoreRecord,
} from "../store/io.js";
import { atomicWriteText, isMissingFileError } from "../store/atomic-write.js";
import type {
  ActorIdentity,
  CanonicalMemoryObject,
  ContradictionResolution,
  Contradiction,
  CoreRecord,
  CurationPacket,
  Diagnostic,
  DispositionRecord,
  Entity,
  Episode,
  Observation,
  ProjectionArtifact,
  ProjectionManifest,
  Proposal,
  RatificationRecord,
  Relation,
  RuntimeInstance,
  RuntimeKind,
  RuntimeSession,
  SourceIntakeKind,
  SourceRecord,
  ConversationThread,
  WikiClaim,
  WikiPage,
  WorldClaim,
} from "../types.js";
import {
  acceptContradictionResolution,
  applyAcceptedContradictionResolution,
  buildConversationPreferenceDispositionRecord,
  buildOpenClawPreferenceFeedbackIntake,
  buildConversationPreferenceIntake,
  buildStructuredPreferenceSignalIntake,
  detectWorldClaimContradiction,
  findConflictingWorldClaim,
  proposeContradictionResolution,
  executeCanonicalProposalWorkflow,
  executeOpenClawBootstrapWorkflow,
  type ConversationPreferenceIntakeArtifacts,
  type ConversationPreferenceRuntimeIdentityContext,
} from "./pipeline.js";
import type { PreferenceSignalSemanticProfile } from "./source-intake.js";

export interface ConversationPreferenceStoreIds {
  observation: string;
  episode: string;
  subject_entity: string;
  preference_entity: string;
  preference_relation: string;
  world_claim: string;
  contradiction?: string;
  contradiction_resolution?: string;
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
  intake_kind?: SourceIntakeKind;
  identity_context?: ConversationPreferenceRuntimeIdentityContext;
  semantic_profile?: Partial<PreferenceSignalSemanticProfile>;
  source: {
    id: string;
    source_ref: string;
    content_ref: string;
    runtime: RuntimeKind;
    message: string;
    source_type?: string;
    speaker_ref?: string | null;
  };
  ids: ConversationPreferenceStoreIds;
  validation_scope?: string;
}

export interface ConversationPreferenceStorePaths {
  raw_source: string;
  source_record: string;
  observation: string;
  episode: string;
  subject_entity: string;
  preference_entity: string;
  preference_relation: string;
  world_claim: string;
  contradiction?: string;
  contradiction_resolution?: string;
  actor_identity?: string;
  owner_identity?: string;
  runtime_instance?: string;
  runtime_session?: string;
  conversation_thread?: string;
  wiki_page_record: string;
  wiki_page_markdown: string;
  wiki_claim: string;
  proposal: string;
  owner_ratification_queue?: string;
  disposition_record: string;
  ratification_record: string;
  diagnostic_record?: string;
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
  contradiction?: Contradiction;
  contradiction_resolution?: ContradictionResolution;
  owner_ratification_queue?: CurationPacket;
  ratification_record: RatificationRecord;
  diagnostic?: Diagnostic;
  canonical_record?: CanonicalMemoryObject;
  projection_artifacts: ProjectionArtifact[];
  projection_manifest: ProjectionManifest;
}

export interface ConversationPreferenceStoreResult {
  reused: boolean;
  paths: ConversationPreferenceStorePaths;
  records: ConversationPreferenceStoreRecords;
  validation_issues: ValidationIssue[];
}

export interface ConversationPreferenceOwnerRatificationInput extends ConversationPreferenceStoreInput {
  owner_actor_ref: string;
}

export interface ConversationPreferenceOwnerRatificationQueueEntry {
  queue_id: string;
  proposal_id: string;
  ratification_id: string;
  diagnostic_id?: string;
  owner_identity_ref?: string | null;
  speaker_ref?: string | null;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
  statement: string;
  semantic_slot: string;
  reason: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationPreferenceQueuedRatificationInput {
  rootDir: string;
  queue_id: string;
  now: string;
  actor: string;
  owner_actor_ref: string;
  validation_scope?: string;
}

export interface ConversationPreferenceQueuedRejectionInput {
  rootDir: string;
  queue_id: string;
  now: string;
  actor: string;
  owner_actor_ref: string;
  validation_scope?: string;
}

export interface ConversationPreferenceQueuedExpirationInput {
  rootDir: string;
  queue_id: string;
  now: string;
  actor: string;
  validation_scope?: string;
}

export interface ConversationPreferenceResolutionStoreResult {
  reused: boolean;
  paths: ConversationPreferenceStorePaths;
  records: ConversationPreferenceStoreRecords & {
    contradiction: Contradiction;
    contradiction_resolution: ContradictionResolution;
    existing_world_claim: WorldClaim;
    candidate_world_claim: WorldClaim;
  };
  validation_issues: ValidationIssue[];
}

interface LoadedAuthoritativeFlow {
  source_record: SourceRecord;
  intake: ConversationPreferenceIntakeArtifacts;
  owner_ratification_queue?: CurationPacket;
  ratification_record: RatificationRecord;
  diagnostic?: Diagnostic;
  canonical_record?: CanonicalMemoryObject;
}

interface MaterializedFile {
  path: string;
  content: string;
}

interface RecoveryJournalFile {
  relative_path: string;
  content: string;
}

interface RecoveryJournal {
  version: 1;
  operation:
    | "conversation_preference_write"
    | "conversation_preference_resolution_apply"
    | "conversation_preference_owner_ratification_apply"
    | "conversation_preference_owner_review_close";
  created_at: string;
  files: RecoveryJournalFile[];
  append_entries?: RecoveryJournalAppendEntry[];
}

type RecoveryJournalAppendEntry =
  | {
      kind: "audit_change";
      entry: AuditChangeEntry;
    }
  | {
      kind: "validation_log";
      entry: ValidationLogEntry;
    };

const LEGAL_SOURCE_CONTENT_PREFIXES = [
  "raw/sources/",
  "raw/imports/",
  "raw/attachments/",
] as const;

function ownerRatificationQueueId(proposalId: string): string {
  return `cur_owner_ratification_${proposalId}`;
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

function assertLegalSourceContentRef(contentRef: string): void {
  if (!LEGAL_SOURCE_CONTENT_PREFIXES.some((prefix) => contentRef.startsWith(prefix))) {
    throw new Error(
      `Source content_ref must stay within raw/ sources, imports, or attachments: ${contentRef}`,
    );
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

function serializeCoreRecordContent(record: CoreRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await atomicWriteText(filePath, content);
}

async function materializeFiles(files: MaterializedFile[]): Promise<void> {
  for (const file of files) {
    await writeTextFile(file.path, file.content);
  }
}

async function ensureFileContent(filePath: string, expectedContent: string): Promise<void> {
  const currentContent = await readFile(filePath, "utf8").catch((error) => {
    if (isMissingFileError(error)) return undefined;
    throw error;
  });
  if (currentContent === expectedContent) {
    return;
  }

  await writeTextFile(filePath, expectedContent);
}

function recoveryJournalPath(
  rootDir: string,
  operation: RecoveryJournal["operation"],
  stableId: string,
): string {
  return resolveStorePath(rootDir, `audits/snapshots/recovery-${operation}-${stableId}.json`);
}

function relativeStorePath(rootDir: string, filePath: string): string {
  const rootPath = resolve(rootDir);
  const targetPath = resolveStorePath(rootDir, filePath);
  return relative(rootPath, targetPath);
}

function parseRecoveryJournalFiles(rootDir: string, files: unknown): MaterializedFile[] {
  if (!Array.isArray(files)) {
    throw new Error("Recovery journal is malformed");
  }

  return files.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`Recovery journal entry ${index} is malformed`);
    }

    const candidate = entry as {
      relative_path?: unknown;
      path?: unknown;
      content?: unknown;
    };
    const rawPath =
      typeof candidate.relative_path === "string"
        ? candidate.relative_path
        : typeof candidate.path === "string"
          ? candidate.path
          : undefined;

    if (!rawPath || typeof candidate.content !== "string") {
      throw new Error(`Recovery journal entry ${index} is malformed`);
    }

    return {
      path: resolveStorePath(rootDir, rawPath),
      content: candidate.content,
    };
  });
}

function buildRecoveryJournal(input: {
  rootDir: string;
  operation: RecoveryJournal["operation"];
  created_at: string;
  files: MaterializedFile[];
  append_entries?: RecoveryJournalAppendEntry[];
}): RecoveryJournal {
  return {
    version: 1,
    operation: input.operation,
    created_at: input.created_at,
    files: input.files.map((file) => ({
      relative_path: relativeStorePath(input.rootDir, file.path),
      content: file.content,
    })),
    append_entries: input.append_entries,
  };
}

async function writeRecoveryJournal(filePath: string, journal: RecoveryJournal): Promise<void> {
  await writeTextFile(filePath, `${JSON.stringify(journal, null, 2)}\n`);
}

async function replayRecoveryJournalEntries(
  rootDir: string,
  entries: RecoveryJournalAppendEntry[] | undefined,
): Promise<void> {
  if (!entries || entries.length === 0) {
    return;
  }

  for (const entry of entries) {
    if (entry.kind === "validation_log") {
      await appendValidationLog(rootDir, entry.entry);
      continue;
    }

    await appendAuditChange(rootDir, entry.entry);
  }
}

async function recoverPendingJournal(rootDir: string, filePath: string): Promise<boolean> {
  if (!(await pathExists(filePath))) {
    return false;
  }

  const source = await readFile(filePath, "utf8");
  const parsed = JSON.parse(source) as Partial<RecoveryJournal>;
  const files = parseRecoveryJournalFiles(rootDir, parsed.files);
  await materializeFiles(files);
  await replayRecoveryJournalEntries(rootDir, parsed.append_entries);
  await rm(filePath, { force: true });
  return true;
}

function serializeSourcePayload(input: ConversationPreferenceStoreInput): string {
  return `${JSON.stringify(
    {
      runtime: input.source.runtime,
      source_type: input.source.source_type ?? "conversation",
      source_ref: input.source.source_ref,
      message: input.source.message,
    },
    null,
    2,
  )}\n`;
}

function selectConversationPreferenceIntakeBuilder(input: ConversationPreferenceStoreInput):
  | typeof buildConversationPreferenceIntake
  | typeof buildOpenClawPreferenceFeedbackIntake
  | typeof buildStructuredPreferenceSignalIntake {
  return input.intake_kind === "openclaw_projection_feedback"
    ? buildOpenClawPreferenceFeedbackIntake
    : input.intake_kind === "structured_preference_signal"
      ? buildStructuredPreferenceSignalIntake
      : buildConversationPreferenceIntake;
}

function buildSourceRecord(input: ConversationPreferenceStoreInput): SourceRecord {
  assertLegalSourceContentRef(input.source.content_ref);

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
      source_type: input.source.source_type ?? "conversation",
      source_ref: input.source.source_ref,
      actor_ref: input.identity_context?.ids.agent_identity,
      speaker_ref: input.source.speaker_ref ?? null,
      runtime_ref: input.identity_context?.ids.runtime_instance,
      session_ref: input.identity_context?.ids.runtime_session,
      thread_ref: input.identity_context?.ids.conversation_thread,
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
  const paths: ConversationPreferenceStorePaths = {
    raw_source: resolveStorePath(rootDir, sourceRecord.content_ref),
    source_record: coreRecordPath(rootDir, sourceRecord),
    observation: coreRecordPath(rootDir, intake.observation),
    episode: coreRecordPath(rootDir, intake.episode),
    subject_entity: coreRecordPath(rootDir, intake.subject_entity),
    preference_entity: coreRecordPath(rootDir, intake.preference_entity),
    preference_relation: coreRecordPath(rootDir, intake.preference_relation),
    world_claim: coreRecordPath(rootDir, intake.world_claim),
    contradiction: input.ids.contradiction
      ? coreRecordPath(
          rootDir,
          {
            id: input.ids.contradiction,
            kind: "contradiction",
            layer: "world",
          } as Contradiction,
        )
      : undefined,
    contradiction_resolution: input.ids.contradiction_resolution
      ? coreRecordPath(
          rootDir,
          {
            id: input.ids.contradiction_resolution,
            kind: "contradiction_resolution",
            layer: "governance",
          } as ContradictionResolution,
        )
      : undefined,
    actor_identity: intake.agent_identity ? coreRecordPath(rootDir, intake.agent_identity) : undefined,
    owner_identity: intake.owner_identity ? coreRecordPath(rootDir, intake.owner_identity) : undefined,
    runtime_instance: intake.runtime_instance ? coreRecordPath(rootDir, intake.runtime_instance) : undefined,
    runtime_session: intake.runtime_session ? coreRecordPath(rootDir, intake.runtime_session) : undefined,
    conversation_thread: intake.conversation_thread ? coreRecordPath(rootDir, intake.conversation_thread) : undefined,
    wiki_page_record: coreRecordPath(rootDir, intake.wiki_page),
    wiki_page_markdown: resolveStorePath(rootDir, intake.wiki_page.path),
    wiki_claim: coreRecordPath(rootDir, intake.wiki_claim),
    proposal: coreRecordPath(rootDir, intake.proposal),
    owner_ratification_queue:
      intake.proposal.promotion_requirement === "owner_ratification_required"
        ? coreRecordPath(
            rootDir,
            {
              id: ownerRatificationQueueId(intake.proposal.id),
              kind: "curation_packet",
              layer: "governance",
            } as CurationPacket,
          )
        : undefined,
    disposition_record: coreRecordPath(rootDir, intake.disposition_record),
    ratification_record: coreRecordPath(
      rootDir,
      {
        id: input.ids.ratification,
        kind: "ratification",
        layer: "governance",
      } as RatificationRecord,
    ),
    diagnostic_record: input.ids.diagnostic
      ? coreRecordPath(
          rootDir,
          {
            id: input.ids.diagnostic,
            kind: "diagnostic",
            layer: "audits",
            authoritative_home: "governance",
          } as Diagnostic,
        )
      : undefined,
    canonical_record: coreRecordPath(
      rootDir,
      {
        id: input.ids.canonical,
        kind: "preference",
        layer: "canon",
      } as CanonicalMemoryObject,
    ),
    projection_markdown: resolveStorePath(rootDir, defaultOpenClawBootstrapProjectionPath(input.ids.projection_manifest)),
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

  assertNoPathCollisions(paths);
  return paths;
}

function definedFlowPaths(paths: ConversationPreferenceStorePaths): Array<[string, string]> {
  return [
    ["raw_source", paths.raw_source],
    ["source_record", paths.source_record],
    ["observation", paths.observation],
    ["episode", paths.episode],
    ["subject_entity", paths.subject_entity],
    ["preference_entity", paths.preference_entity],
    ["preference_relation", paths.preference_relation],
    ["world_claim", paths.world_claim],
    ...(paths.contradiction ? [["contradiction", paths.contradiction] as [string, string]] : []),
    ...(paths.contradiction_resolution
      ? [["contradiction_resolution", paths.contradiction_resolution] as [string, string]]
      : []),
    ...(paths.actor_identity ? [["actor_identity", paths.actor_identity] as [string, string]] : []),
    ...(paths.owner_identity ? [["owner_identity", paths.owner_identity] as [string, string]] : []),
    ...(paths.runtime_instance ? [["runtime_instance", paths.runtime_instance] as [string, string]] : []),
    ...(paths.runtime_session ? [["runtime_session", paths.runtime_session] as [string, string]] : []),
    ...(paths.conversation_thread
      ? [["conversation_thread", paths.conversation_thread] as [string, string]]
      : []),
    ["wiki_page_record", paths.wiki_page_record],
    ["wiki_page_markdown", paths.wiki_page_markdown],
    ["wiki_claim", paths.wiki_claim],
    ["proposal", paths.proposal],
    ...(paths.owner_ratification_queue
      ? [["owner_ratification_queue", paths.owner_ratification_queue] as [string, string]]
      : []),
    ["disposition_record", paths.disposition_record],
    ["ratification_record", paths.ratification_record],
    ...(paths.diagnostic_record ? [["diagnostic_record", paths.diagnostic_record] as [string, string]] : []),
    ["canonical_record", paths.canonical_record],
    ["projection_markdown", paths.projection_markdown],
    ["projection_manifest", paths.projection_manifest],
    ["projection_artifacts.canon", paths.projection_artifacts.canon],
    ["projection_artifacts.world", paths.projection_artifacts.world],
    ["projection_artifacts.wiki", paths.projection_artifacts.wiki],
  ];
}

function assertNoPathCollisions(paths: ConversationPreferenceStorePaths): void {
  const seen = new Map<string, string>();

  for (const [label, filePath] of definedFlowPaths(paths)) {
    const previous = seen.get(filePath);
    if (previous) {
      throw new Error(`Conversation preference flow paths collide: ${previous} and ${label}`);
    }
    seen.set(filePath, label);
  }
}

function writeFlowBaselinePaths(paths: ConversationPreferenceStorePaths): string[] {
  return [
    paths.raw_source,
    paths.source_record,
    paths.observation,
    paths.episode,
    paths.subject_entity,
    paths.preference_entity,
    paths.preference_relation,
    paths.world_claim,
    paths.wiki_page_record,
    paths.wiki_claim,
    paths.proposal,
    ...(paths.owner_ratification_queue ? [paths.owner_ratification_queue] : []),
    paths.disposition_record,
    paths.ratification_record,
  ];
}

function writeFlowOwnedPaths(paths: ConversationPreferenceStorePaths): string[] {
  return [
    ...writeFlowBaselinePaths(paths),
    ...(paths.contradiction ? [paths.contradiction] : []),
    ...(paths.contradiction_resolution ? [paths.contradiction_resolution] : []),
    paths.wiki_page_markdown,
    ...(paths.diagnostic_record ? [paths.diagnostic_record] : []),
    paths.canonical_record,
    paths.projection_markdown,
    paths.projection_manifest,
    paths.projection_artifacts.canon,
    paths.projection_artifacts.world,
    paths.projection_artifacts.wiki,
  ];
}

async function detectPartiallyMaterializedWriteFlow(paths: ConversationPreferenceStorePaths): Promise<boolean> {
  const baselinePaths = writeFlowBaselinePaths(paths);
  const baselinePresence = await Promise.all(baselinePaths.map((filePath) => pathExists(filePath)));
  const hasAnyBaselineState = baselinePresence.some(Boolean);

  if (!hasAnyBaselineState) {
    return false;
  }

  if (!baselinePresence.every(Boolean)) {
    return true;
  }

  const contradictionPair = [paths.contradiction, paths.contradiction_resolution].filter(
    (filePath): filePath is string => typeof filePath === "string",
  );
  if (contradictionPair.length > 0) {
    const contradictionPresence = await Promise.all(contradictionPair.map((filePath) => pathExists(filePath)));
    if (contradictionPresence.some(Boolean) && !contradictionPresence.every(Boolean)) {
      return true;
    }
  }

  if (!(await pathExists(paths.ratification_record))) {
    return false;
  }

  const ratification = await readCoreRecord<RatificationRecord>(paths.ratification_record);
  const canonicalExists = await pathExists(paths.canonical_record);
  const diagnosticExists =
    paths.diagnostic_record ? await pathExists(paths.diagnostic_record) : false;

  if (ratification.decision === "approved" && !canonicalExists) {
    return true;
  }

  if (ratification.decision !== "approved" && canonicalExists) {
    return true;
  }

  if (ratification.decision !== "approved" && paths.diagnostic_record && !diagnosticExists) {
    return true;
  }

  return false;
}

async function resetPartiallyMaterializedWriteFlow(paths: ConversationPreferenceStorePaths): Promise<void> {
  for (const filePath of writeFlowOwnedPaths(paths)) {
    await rm(filePath, { force: true });
  }
}

async function recoverOrResetWriteFlow(
  rootDir: string,
  input: ConversationPreferenceStoreInput,
  paths: ConversationPreferenceStorePaths,
): Promise<void> {
  const journalPath = recoveryJournalPath(rootDir, "conversation_preference_write", input.ids.proposal);
  if (await recoverPendingJournal(rootDir, journalPath)) {
    return;
  }

  if (await detectPartiallyMaterializedWriteFlow(paths)) {
    await resetPartiallyMaterializedWriteFlow(paths);
  }
}

async function recoverResolutionApplication(rootDir: string, input: ConversationPreferenceStoreInput): Promise<void> {
  if (!input.ids.contradiction_resolution) {
    return;
  }

  await recoverPendingJournal(
    rootDir,
    recoveryJournalPath(rootDir, "conversation_preference_resolution_apply", input.ids.contradiction_resolution),
  );
}

async function recoverOwnerRatificationApplication(
  rootDir: string,
  input: ConversationPreferenceOwnerRatificationInput,
): Promise<void> {
  await recoverPendingJournal(
    rootDir,
    recoveryJournalPath(rootDir, "conversation_preference_owner_ratification_apply", input.ids.proposal),
  );
}

async function recoverOwnerReviewClosure(rootDir: string, queue_id: string): Promise<void> {
  await recoverPendingJournal(
    rootDir,
    recoveryJournalPath(rootDir, "conversation_preference_owner_review_close", queue_id),
  );
}

function buildOwnerRatificationQueuePacket(input: {
  now: string;
  source_record: SourceRecord;
  intake: ConversationPreferenceIntakeArtifacts;
  paths: ConversationPreferenceStorePaths;
  ratification_record: RatificationRecord;
  diagnostic?: Diagnostic;
}): CurationPacket | undefined {
  if (
    input.intake.proposal.promotion_requirement !== "owner_ratification_required" ||
    input.ratification_record.decision !== "deferred" ||
    !input.paths.owner_ratification_queue
  ) {
    return undefined;
  }

  return {
    id: ownerRatificationQueueId(input.intake.proposal.id),
    kind: "curation_packet",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: input.intake.proposal.visibility_state,
    provenance: {
      ...input.intake.proposal.provenance,
      evidence_refs: [
        ...new Set([
          ...(input.intake.proposal.provenance.evidence_refs ?? []),
          input.intake.proposal.id,
          input.ratification_record.id,
          ...(input.diagnostic ? [input.diagnostic.id] : []),
        ]),
      ],
    },
    upstream_refs: [
      ...new Set([
        input.source_record.id,
        input.intake.observation.id,
        input.intake.episode.id,
        input.intake.subject_entity.id,
        input.intake.preference_entity.id,
        input.intake.preference_relation.id,
        input.intake.world_claim.id,
        input.intake.wiki_page.id,
        input.intake.wiki_claim.id,
        input.intake.proposal.id,
        input.intake.disposition_record.id,
        input.ratification_record.id,
        ...(input.diagnostic ? [input.diagnostic.id] : []),
        ...(input.intake.agent_identity ? [input.intake.agent_identity.id] : []),
        ...(input.intake.owner_identity ? [input.intake.owner_identity.id] : []),
        ...(input.intake.runtime_instance ? [input.intake.runtime_instance.id] : []),
        ...(input.intake.runtime_session ? [input.intake.runtime_session.id] : []),
        ...(input.intake.conversation_thread ? [input.intake.conversation_thread.id] : []),
      ]),
    ],
    proposal_refs: [input.intake.proposal.id],
    question_count: 1,
    review_kind: "owner_ratification",
    ratification_ref: input.ratification_record.id,
    diagnostic_ref: input.diagnostic?.id ?? null,
    canonical_target_ref: {
      id: basename(input.paths.canonical_record, ".json"),
      kind: "preference",
      layer: "canon",
    },
    source_record_ref: input.source_record.id,
    disposition_ref: input.intake.disposition_record.id,
    subject_entity_ref: input.intake.subject_entity.id,
    preference_entity_ref: input.intake.preference_entity.id,
    preference_relation_ref: input.intake.preference_relation.id,
    world_claim_ref: input.intake.world_claim.id,
    wiki_page_ref: input.intake.wiki_page.id,
    wiki_claim_ref: input.intake.wiki_claim.id,
    actor_identity_ref: input.intake.agent_identity?.id ?? null,
    owner_identity_ref: input.intake.owner_identity?.id ?? null,
    runtime_instance_ref: input.intake.runtime_instance?.id ?? null,
    runtime_session_ref: input.intake.runtime_session?.id ?? null,
    conversation_thread_ref: input.intake.conversation_thread?.id ?? null,
    projection_manifest_ref: basename(input.paths.projection_manifest, ".json"),
    projection_artifact_refs: [
      basename(input.paths.projection_artifacts.canon, ".json"),
      basename(input.paths.projection_artifacts.world, ".json"),
      basename(input.paths.projection_artifacts.wiki, ".json"),
    ],
    status: "pending",
  };
}

function buildConversationPreferenceWriteFiles(input: {
  rootDir: string;
  storeInput: ConversationPreferenceStoreInput;
  paths: ConversationPreferenceStorePaths;
  source_record: SourceRecord;
  intake: ConversationPreferenceIntakeArtifacts;
  contradiction?: Contradiction;
  contradiction_resolution?: ContradictionResolution;
  owner_ratification_queue?: CurationPacket;
  ratification_record: RatificationRecord;
  diagnostic?: Diagnostic;
  canonical_record?: CanonicalMemoryObject;
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
}): MaterializedFile[] {
  const { paths, source_record, intake, contradiction, contradiction_resolution, owner_ratification_queue, ratification_record, diagnostic, canonical_record, projection } = input;

  return [
    {
      path: paths.raw_source,
      content: serializeSourcePayload(input.storeInput),
    },
    {
      path: paths.source_record,
      content: serializeCoreRecordContent(source_record),
    },
    ...(intake.agent_identity
      ? [{ path: paths.actor_identity!, content: serializeCoreRecordContent(intake.agent_identity) }]
      : []),
    ...(intake.owner_identity
      ? [{ path: paths.owner_identity!, content: serializeCoreRecordContent(intake.owner_identity) }]
      : []),
    ...(intake.runtime_instance
      ? [{ path: paths.runtime_instance!, content: serializeCoreRecordContent(intake.runtime_instance) }]
      : []),
    ...(intake.runtime_session
      ? [{ path: paths.runtime_session!, content: serializeCoreRecordContent(intake.runtime_session) }]
      : []),
    ...(intake.conversation_thread
      ? [{ path: paths.conversation_thread!, content: serializeCoreRecordContent(intake.conversation_thread) }]
      : []),
    {
      path: paths.observation,
      content: serializeCoreRecordContent(intake.observation),
    },
    {
      path: paths.episode,
      content: serializeCoreRecordContent(intake.episode),
    },
    {
      path: paths.subject_entity,
      content: serializeCoreRecordContent(intake.subject_entity),
    },
    {
      path: paths.preference_entity,
      content: serializeCoreRecordContent(intake.preference_entity),
    },
    {
      path: paths.preference_relation,
      content: serializeCoreRecordContent(intake.preference_relation),
    },
    {
      path: paths.world_claim,
      content: serializeCoreRecordContent(intake.world_claim),
    },
    ...(contradiction
      ? [{ path: paths.contradiction!, content: serializeCoreRecordContent(contradiction) }]
      : []),
    ...(contradiction_resolution
      ? [{ path: paths.contradiction_resolution!, content: serializeCoreRecordContent(contradiction_resolution) }]
      : []),
    {
      path: paths.wiki_page_record,
      content: serializeCoreRecordContent(intake.wiki_page),
    },
    {
      path: paths.wiki_page_markdown,
      content: renderWikiMarkdown(
        intake.wiki_page,
        source_record,
        intake.world_claim.id,
        input.storeInput.statement,
        canonical_record?.id,
      ),
    },
    {
      path: paths.wiki_claim,
      content: serializeCoreRecordContent(intake.wiki_claim),
    },
    {
      path: paths.proposal,
      content: serializeCoreRecordContent(intake.proposal),
    },
    ...(owner_ratification_queue
      ? [{ path: paths.owner_ratification_queue!, content: serializeCoreRecordContent(owner_ratification_queue) }]
      : []),
    {
      path: paths.disposition_record,
      content: serializeCoreRecordContent(intake.disposition_record),
    },
    {
      path: paths.ratification_record,
      content: serializeCoreRecordContent(ratification_record),
    },
    ...(diagnostic
      ? [{ path: paths.diagnostic_record!, content: serializeCoreRecordContent(diagnostic) }]
      : []),
    ...(canonical_record
      ? [{ path: paths.canonical_record, content: serializeCoreRecordContent(canonical_record) }]
      : []),
    {
      path: paths.projection_markdown,
      content: projection.markdown,
    },
    {
      path: paths.projection_artifacts.canon,
      content: serializeCoreRecordContent(projection.artifacts[0]!),
    },
    {
      path: paths.projection_artifacts.world,
      content: serializeCoreRecordContent(projection.artifacts[1]!),
    },
    {
      path: paths.projection_artifacts.wiki,
      content: serializeCoreRecordContent(projection.artifacts[2]!),
    },
    {
      path: paths.projection_manifest,
      content: serializeCoreRecordContent(projection.manifest),
    },
  ];
}

function buildConversationPreferenceWriteValidationIssues(input: {
  source_record: SourceRecord;
  intake: ConversationPreferenceIntakeArtifacts;
  contradiction?: Contradiction;
  contradiction_resolution?: ContradictionResolution;
  owner_ratification_queue?: CurationPacket;
  ratification_record: RatificationRecord;
  diagnostic?: Diagnostic;
  canonical_record?: CanonicalMemoryObject;
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
}): ValidationIssue[] {
  return [
    input.source_record,
    ...(input.intake.agent_identity ? [input.intake.agent_identity] : []),
    ...(input.intake.owner_identity ? [input.intake.owner_identity] : []),
    ...(input.intake.runtime_instance ? [input.intake.runtime_instance] : []),
    ...(input.intake.runtime_session ? [input.intake.runtime_session] : []),
    ...(input.intake.conversation_thread ? [input.intake.conversation_thread] : []),
    input.intake.observation,
    input.intake.episode,
    input.intake.subject_entity,
    input.intake.preference_entity,
    input.intake.preference_relation,
    input.intake.world_claim,
    ...(input.contradiction ? [input.contradiction] : []),
    input.intake.wiki_page,
    input.intake.wiki_claim,
    input.intake.proposal,
    ...(input.owner_ratification_queue ? [input.owner_ratification_queue] : []),
    input.intake.disposition_record,
    input.ratification_record,
    ...(input.diagnostic ? [input.diagnostic] : []),
    ...(input.canonical_record ? [input.canonical_record] : []),
    ...input.projection.artifacts,
    input.projection.manifest,
    ...(input.contradiction_resolution ? [input.contradiction_resolution] : []),
  ].flatMap((record) => validateCoreRecord(record));
}

function buildConversationPreferenceAuditEntries(input: {
  now: string;
  source_record: SourceRecord;
  intake: ConversationPreferenceIntakeArtifacts;
  owner_ratification_queue?: CurationPacket;
  ratification_record: RatificationRecord;
  canonical_record?: CanonicalMemoryObject;
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
  conflicting_world_claim?: WorldClaim;
}): AuditChangeEntry[] {
  const entries: AuditChangeEntry[] = [
    {
      entry_id: `audit:${input.intake.proposal.id}:record_observation`,
      at: input.now,
      operation: "record_observation",
      record_id: input.intake.observation.id,
      record_kind: input.intake.observation.kind,
      record_layer: input.intake.observation.layer,
      detail: "Recorded observation from conversation preference input.",
      related_refs: [input.source_record.id],
    },
  ];

  if (input.canonical_record) {
    entries.push(
      {
        entry_id: `audit:${input.intake.proposal.id}:governance_accept`,
        at: input.now,
        operation: "governance_accept",
        record_id: input.ratification_record.id,
        record_kind: input.ratification_record.kind,
        record_layer: input.ratification_record.layer,
        detail: "Baseline governance approved create proposal into canon.",
        related_refs: [input.intake.proposal.id],
      },
      {
        entry_id: `audit:${input.intake.proposal.id}:canon_apply_create`,
        at: input.now,
        operation: "canon_apply_create",
        record_id: input.canonical_record.id,
        record_kind: input.canonical_record.kind,
        record_layer: input.canonical_record.layer,
        detail: "Applied approved create proposal into canonical memory.",
        related_refs: [input.intake.proposal.id, input.ratification_record.id],
      },
    );
  } else if (input.ratification_record.decision === "deferred") {
    entries.push({
      entry_id: `audit:${input.intake.proposal.id}:governance_defer`,
      at: input.now,
      operation: "governance_defer",
      record_id: input.ratification_record.id,
      record_kind: input.ratification_record.kind,
      record_layer: input.ratification_record.layer,
      detail: "Governance deferred canonical promotion pending owner ratification.",
      related_refs: [input.intake.proposal.id, ...(input.conflicting_world_claim ? [input.conflicting_world_claim.id] : [])],
    });
    if (input.owner_ratification_queue) {
      entries.push({
        entry_id: `audit:${input.intake.proposal.id}:owner_ratification_queue`,
        at: input.now,
        operation: "record_observation",
        record_id: input.owner_ratification_queue.id,
        record_kind: input.owner_ratification_queue.kind,
        record_layer: input.owner_ratification_queue.layer,
        detail: "Queued proposal for explicit owner ratification review.",
        related_refs: [input.intake.proposal.id, input.ratification_record.id],
      });
    }
  } else {
    entries.push({
      entry_id: `audit:${input.intake.proposal.id}:governance_reject`,
      at: input.now,
      operation: "governance_reject",
      record_id: input.ratification_record.id,
      record_kind: input.ratification_record.kind,
      record_layer: input.ratification_record.layer,
      detail: "Governance rejected canonical promotion and left the signal queued for review.",
      related_refs: [input.intake.proposal.id, ...(input.conflicting_world_claim ? [input.conflicting_world_claim.id] : [])],
    });
  }

  entries.push({
    entry_id: `audit:${input.intake.proposal.id}:projection_compile`,
    at: input.now,
    operation: "projection_compile",
    record_id: input.projection.manifest.id,
    record_kind: input.projection.manifest.kind,
    record_layer: input.projection.manifest.layer,
    detail: "Recompiled runtime projection artifacts for the conversation preference flow.",
    related_refs: input.projection.artifacts.map((artifact) => artifact.id),
  });

  return entries;
}

function buildResolutionApplicationFiles(input: {
  rootDir: string;
  paths: ConversationPreferenceStorePaths;
  applied: ReturnType<typeof applyAcceptedContradictionResolution>;
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
}): MaterializedFile[] {
  return [
    {
      path: input.paths.world_claim,
      content: serializeCoreRecordContent(input.applied.candidate_claim),
    },
    {
      path: input.paths.contradiction!,
      content: serializeCoreRecordContent(input.applied.contradiction),
    },
    {
      path: input.paths.contradiction_resolution!,
      content: serializeCoreRecordContent(input.applied.resolution),
    },
    {
      path: coreRecordPath(input.rootDir, input.applied.existing_claim),
      content: serializeCoreRecordContent(input.applied.existing_claim),
    },
    {
      path: input.paths.projection_markdown,
      content: input.projection.markdown,
    },
    {
      path: input.paths.projection_artifacts.canon,
      content: serializeCoreRecordContent(input.projection.artifacts[0]!),
    },
    {
      path: input.paths.projection_artifacts.world,
      content: serializeCoreRecordContent(input.projection.artifacts[1]!),
    },
    {
      path: input.paths.projection_artifacts.wiki,
      content: serializeCoreRecordContent(input.projection.artifacts[2]!),
    },
    {
      path: input.paths.projection_manifest,
      content: serializeCoreRecordContent(input.projection.manifest),
    },
  ];
}

function buildResolutionApplicationValidationIssues(input: {
  applied: ReturnType<typeof applyAcceptedContradictionResolution>;
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
}): ValidationIssue[] {
  return [
    input.applied.existing_claim,
    input.applied.candidate_claim,
    input.applied.contradiction,
    input.applied.resolution,
    ...input.projection.artifacts,
    input.projection.manifest,
  ].flatMap((record) => validateCoreRecord(record));
}

function buildResolutionApplicationAuditEntries(input: {
  now: string;
  applied: ReturnType<typeof applyAcceptedContradictionResolution>;
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
}): AuditChangeEntry[] {
  return [
    {
      entry_id: `audit:${input.applied.resolution.id}:world_resolution_apply`,
      at: input.now,
      operation: "world_resolution_apply",
      record_id: input.applied.resolution.id,
      record_kind: input.applied.resolution.kind,
      record_layer: input.applied.resolution.layer,
      detail: `Applied contradiction resolution strategy ${input.applied.resolution.strategy} and recompiled projection.`,
      related_refs: [
        input.applied.contradiction.id,
        input.applied.existing_claim.id,
        input.applied.candidate_claim.id,
        input.projection.manifest.id,
      ],
    },
  ];
}

function buildResolvedDeferredDiagnostic(input: {
  now: string;
  proposal: Proposal;
  ratification_record: RatificationRecord;
  canonical_record: CanonicalMemoryObject;
  diagnostic?: Diagnostic;
}): Diagnostic | undefined {
  if (!input.diagnostic) {
    return undefined;
  }

  return {
    ...input.diagnostic,
    updated_at: input.now,
    provenance: {
      ...input.diagnostic.provenance,
      evidence_refs: [
        ...new Set([
          ...(input.diagnostic.provenance.evidence_refs ?? []),
          input.proposal.id,
          input.ratification_record.id,
          input.canonical_record.id,
        ]),
      ],
    },
    code: "proposal_deferred_resolved",
    severity: "info",
    message: `Deferred proposal ${input.proposal.id} was ratified by the owner and promoted into canon.`,
    related_refs: [input.proposal.id, input.ratification_record.id, input.canonical_record.id],
    upstream_refs: [
      ...new Set([
        ...(input.diagnostic.upstream_refs ?? []),
        input.proposal.id,
        input.ratification_record.id,
        input.canonical_record.id,
      ]),
    ],
  };
}

function buildClosedDeferredDiagnostic(input: {
  now: string;
  proposal: Proposal;
  ratification_record: RatificationRecord;
  queue_status: "answered" | "expired";
  diagnostic?: Diagnostic;
}): Diagnostic | undefined {
  if (!input.diagnostic) {
    return undefined;
  }

  const closedCode =
    input.queue_status === "answered"
      ? "proposal_deferred_rejected"
      : "proposal_deferred_expired";
  const closedMessage =
    input.queue_status === "answered"
      ? `Deferred proposal ${input.proposal.id} was explicitly rejected by the owner and remains outside canon.`
      : `Deferred proposal ${input.proposal.id} expired without owner ratification and remains outside canon.`;

  return {
    ...input.diagnostic,
    updated_at: input.now,
    provenance: {
      ...input.diagnostic.provenance,
      evidence_refs: [
        ...new Set([
          ...(input.diagnostic.provenance.evidence_refs ?? []),
          input.proposal.id,
          input.ratification_record.id,
        ]),
      ],
    },
    code: closedCode,
    severity: input.queue_status === "answered" ? "warning" : "info",
    message: closedMessage,
    related_refs: [input.proposal.id, input.ratification_record.id],
    upstream_refs: [
      ...new Set([
        ...(input.diagnostic.upstream_refs ?? []),
        input.proposal.id,
        input.ratification_record.id,
      ]),
    ],
  };
}

function applyOwnerRatificationQueuePacket(input: {
  now: string;
  queue: CurationPacket | undefined;
  proposal: Proposal;
  ratification_record: RatificationRecord;
  canonical_record: CanonicalMemoryObject;
  diagnostic?: Diagnostic;
}): CurationPacket | undefined {
  if (!input.queue) {
    return undefined;
  }

  return {
    ...input.queue,
    updated_at: input.now,
    status: "applied",
    ratification_ref: input.ratification_record.id,
    diagnostic_ref: input.diagnostic?.id ?? input.queue.diagnostic_ref ?? null,
    upstream_refs: [
      ...new Set([
        ...(input.queue.upstream_refs ?? []),
        input.proposal.id,
        input.ratification_record.id,
        input.canonical_record.id,
        ...(input.diagnostic ? [input.diagnostic.id] : []),
      ]),
    ],
    provenance: {
      ...input.queue.provenance,
      evidence_refs: [
        ...new Set([
          ...(input.queue.provenance.evidence_refs ?? []),
          input.proposal.id,
          input.ratification_record.id,
          input.canonical_record.id,
          ...(input.diagnostic ? [input.diagnostic.id] : []),
        ]),
      ],
    },
  };
}

function closeOwnerRatificationQueuePacket(input: {
  now: string;
  queue: CurationPacket | undefined;
  proposal: Proposal;
  ratification_record: RatificationRecord;
  queue_status: "answered" | "expired";
  diagnostic?: Diagnostic;
}): CurationPacket | undefined {
  if (!input.queue) {
    return undefined;
  }

  return {
    ...input.queue,
    updated_at: input.now,
    status: input.queue_status,
    ratification_ref: input.ratification_record.id,
    diagnostic_ref: input.diagnostic?.id ?? input.queue.diagnostic_ref ?? null,
    upstream_refs: [
      ...new Set([
        ...(input.queue.upstream_refs ?? []),
        input.proposal.id,
        input.ratification_record.id,
        ...(input.diagnostic ? [input.diagnostic.id] : []),
      ]),
    ],
    provenance: {
      ...input.queue.provenance,
      evidence_refs: [
        ...new Set([
          ...(input.queue.provenance.evidence_refs ?? []),
          input.proposal.id,
          input.ratification_record.id,
          ...(input.diagnostic ? [input.diagnostic.id] : []),
        ]),
      ],
    },
  };
}

function buildOwnerRatificationFiles(input: {
  paths: ConversationPreferenceStorePaths;
  owner_ratification_queue?: CurationPacket;
  ratification_record: RatificationRecord;
  canonical_record: CanonicalMemoryObject;
  diagnostic?: Diagnostic;
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
}): MaterializedFile[] {
  return [
    ...(input.owner_ratification_queue
      ? [{ path: input.paths.owner_ratification_queue!, content: serializeCoreRecordContent(input.owner_ratification_queue) }]
      : []),
    {
      path: input.paths.ratification_record,
      content: serializeCoreRecordContent(input.ratification_record),
    },
    {
      path: input.paths.canonical_record,
      content: serializeCoreRecordContent(input.canonical_record),
    },
    ...(input.diagnostic
      ? [{ path: input.paths.diagnostic_record!, content: serializeCoreRecordContent(input.diagnostic) }]
      : []),
    {
      path: input.paths.projection_markdown,
      content: input.projection.markdown,
    },
    {
      path: input.paths.projection_artifacts.canon,
      content: serializeCoreRecordContent(input.projection.artifacts[0]!),
    },
    {
      path: input.paths.projection_artifacts.world,
      content: serializeCoreRecordContent(input.projection.artifacts[1]!),
    },
    {
      path: input.paths.projection_artifacts.wiki,
      content: serializeCoreRecordContent(input.projection.artifacts[2]!),
    },
    {
      path: input.paths.projection_manifest,
      content: serializeCoreRecordContent(input.projection.manifest),
    },
  ];
}

function buildOwnerRatificationValidationIssues(input: {
  owner_ratification_queue?: CurationPacket;
  ratification_record: RatificationRecord;
  canonical_record: CanonicalMemoryObject;
  diagnostic?: Diagnostic;
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
}): ValidationIssue[] {
  return [
    ...(input.owner_ratification_queue ? [input.owner_ratification_queue] : []),
    input.ratification_record,
    input.canonical_record,
    ...(input.diagnostic ? [input.diagnostic] : []),
    ...input.projection.artifacts,
    input.projection.manifest,
  ].flatMap((record) => validateCoreRecord(record));
}

function buildOwnerRatificationAuditEntries(input: {
  now: string;
  proposal: Proposal;
  owner_ratification_queue?: CurationPacket;
  ratification_record: RatificationRecord;
  canonical_record: CanonicalMemoryObject;
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
}): AuditChangeEntry[] {
  return [
    {
      entry_id: `audit:${input.proposal.id}:governance_owner_ratify`,
      at: input.now,
      operation: "governance_owner_ratify",
      record_id: input.ratification_record.id,
      record_kind: input.ratification_record.kind,
      record_layer: input.ratification_record.layer,
      detail: "Owner explicitly ratified a deferred proposal and cleared the authority gate.",
      related_refs: [input.proposal.id, input.canonical_record.id],
    },
    {
      entry_id: `audit:${input.proposal.id}:canon_apply_create_owner_ratified`,
      at: input.now,
      operation: "canon_apply_create",
      record_id: input.canonical_record.id,
      record_kind: input.canonical_record.kind,
      record_layer: input.canonical_record.layer,
      detail: "Applied owner-ratified proposal into canonical memory.",
      related_refs: [input.proposal.id, input.ratification_record.id],
    },
    ...(input.owner_ratification_queue
      ? [{
          entry_id: `audit:${input.proposal.id}:owner_ratification_queue_apply`,
          at: input.now,
          operation: "record_observation" as const,
          record_id: input.owner_ratification_queue.id,
          record_kind: input.owner_ratification_queue.kind,
          record_layer: input.owner_ratification_queue.layer,
          detail: "Marked owner ratification queue entry as applied.",
          related_refs: [input.proposal.id, input.ratification_record.id, input.canonical_record.id],
        }]
      : []),
    {
      entry_id: `audit:${input.proposal.id}:projection_compile_owner_ratification`,
      at: input.now,
      operation: "projection_compile",
      record_id: input.projection.manifest.id,
      record_kind: input.projection.manifest.kind,
      record_layer: input.projection.manifest.layer,
      detail: "Recompiled projection after explicit owner ratification.",
      related_refs: [input.proposal.id, input.ratification_record.id, input.canonical_record.id],
    },
  ];
}

function buildOwnerReviewClosureFiles(input: {
  paths: ConversationPreferenceStorePaths;
  owner_ratification_queue?: CurationPacket;
  ratification_record: RatificationRecord;
  diagnostic?: Diagnostic;
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
}): MaterializedFile[] {
  return [
    ...(input.owner_ratification_queue
      ? [{ path: input.paths.owner_ratification_queue!, content: serializeCoreRecordContent(input.owner_ratification_queue) }]
      : []),
    {
      path: input.paths.ratification_record,
      content: serializeCoreRecordContent(input.ratification_record),
    },
    ...(input.diagnostic
      ? [{ path: input.paths.diagnostic_record!, content: serializeCoreRecordContent(input.diagnostic) }]
      : []),
    {
      path: input.paths.projection_markdown,
      content: input.projection.markdown,
    },
    {
      path: input.paths.projection_artifacts.canon,
      content: serializeCoreRecordContent(input.projection.artifacts[0]!),
    },
    {
      path: input.paths.projection_artifacts.world,
      content: serializeCoreRecordContent(input.projection.artifacts[1]!),
    },
    {
      path: input.paths.projection_artifacts.wiki,
      content: serializeCoreRecordContent(input.projection.artifacts[2]!),
    },
    {
      path: input.paths.projection_manifest,
      content: serializeCoreRecordContent(input.projection.manifest),
    },
  ];
}

function buildOwnerReviewClosureValidationIssues(input: {
  owner_ratification_queue?: CurationPacket;
  ratification_record: RatificationRecord;
  diagnostic?: Diagnostic;
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
}): ValidationIssue[] {
  return [
    ...(input.owner_ratification_queue ? [input.owner_ratification_queue] : []),
    input.ratification_record,
    ...(input.diagnostic ? [input.diagnostic] : []),
    ...input.projection.artifacts,
    input.projection.manifest,
  ].flatMap((record) => validateCoreRecord(record));
}

function buildOwnerReviewClosureAuditEntries(input: {
  now: string;
  proposal: Proposal;
  owner_ratification_queue?: CurationPacket;
  ratification_record: RatificationRecord;
  queue_status: "answered" | "expired";
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
}): AuditChangeEntry[] {
  const detail =
    input.queue_status === "answered"
      ? "Owner explicitly rejected a deferred proposal and closed the queue entry."
      : "Deferred proposal expired without owner ratification and the queue entry was closed.";
  const queueDetail =
    input.queue_status === "answered"
      ? "Marked owner ratification queue entry as answered."
      : "Marked owner ratification queue entry as expired.";

  return [
    {
      entry_id: `audit:${input.proposal.id}:governance_owner_review_close`,
      at: input.now,
      operation: input.queue_status === "answered" ? "governance_owner_reject" : "governance_owner_expire",
      record_id: input.ratification_record.id,
      record_kind: input.ratification_record.kind,
      record_layer: input.ratification_record.layer,
      detail,
      related_refs: [input.proposal.id, input.ratification_record.id],
    },
    ...(input.owner_ratification_queue
      ? [{
          entry_id: `audit:${input.proposal.id}:owner_ratification_queue_close`,
          at: input.now,
          operation: "record_observation" as const,
          record_id: input.owner_ratification_queue.id,
          record_kind: input.owner_ratification_queue.kind,
          record_layer: input.owner_ratification_queue.layer,
          detail: queueDetail,
          related_refs: [input.proposal.id, input.ratification_record.id],
        }]
      : []),
    {
      entry_id: `audit:${input.proposal.id}:projection_compile_owner_review_close`,
      at: input.now,
      operation: "projection_compile",
      record_id: input.projection.manifest.id,
      record_kind: input.projection.manifest.kind,
      record_layer: input.projection.manifest.layer,
      detail: "Recompiled projection after closing an owner review queue entry.",
      related_refs: [input.proposal.id, input.ratification_record.id],
    },
  ];
}

function assertNoValidationIssues(issues: ValidationIssue[], context: string): void {
  if (issues.length === 0) {
    return;
  }

  throw new ValidationError(`Invalid ${context}`, issues);
}

function buildConversationPreferenceAppendEntries(input: {
  now: string;
  validation_scope: string;
  proposal_id: string;
  validation_issues: ValidationIssue[];
  audit_entries: AuditChangeEntry[];
}): RecoveryJournalAppendEntry[] {
  return [
    {
      kind: "validation_log",
      entry: {
        entry_id: `validation:${input.proposal_id}`,
        at: input.now,
        scope: input.validation_scope,
        issues: input.validation_issues,
      },
    },
    ...input.audit_entries.map((entry) => ({
      kind: "audit_change" as const,
      entry,
    })),
  ];
}

function buildResolutionApplicationAppendEntries(input: {
  now: string;
  validation_scope: string;
  resolution_id: string;
  validation_issues: ValidationIssue[];
  audit_entries: AuditChangeEntry[];
}): RecoveryJournalAppendEntry[] {
  return [
    {
      kind: "validation_log",
      entry: {
        entry_id: `validation:${input.resolution_id}`,
        at: input.now,
        scope: input.validation_scope,
        issues: input.validation_issues,
      },
    },
    ...input.audit_entries.map((entry) => ({
      kind: "audit_change" as const,
      entry,
    })),
  ];
}

async function loadExistingFlow(
  input: ConversationPreferenceStoreInput,
  paths: ConversationPreferenceStorePaths,
  expectedSourceRecord: SourceRecord,
  expectedIntake: ConversationPreferenceIntakeArtifacts,
): Promise<ConversationPreferenceStoreResult | undefined> {
  const authoritativePaths = [
    paths.raw_source,
    paths.source_record,
    paths.observation,
    paths.episode,
    paths.subject_entity,
    paths.preference_entity,
    paths.preference_relation,
    paths.world_claim,
    paths.wiki_page_record,
    paths.wiki_claim,
    paths.proposal,
    ...(paths.owner_ratification_queue ? [paths.owner_ratification_queue] : []),
    paths.disposition_record,
    paths.ratification_record,
  ];
  const contradictionPair = [paths.contradiction, paths.contradiction_resolution].filter(
    (filePath): filePath is string => typeof filePath === "string",
  );

  const authoritativePresence = await Promise.all(authoritativePaths.map((filePath) => pathExists(filePath)));
  const hasAnyAuthoritativeState = authoritativePresence.some(Boolean);
  const hasCompleteAuthoritativeState = authoritativePresence.every(Boolean);

  if (contradictionPair.length > 0) {
    const contradictionPresence = await Promise.all(contradictionPair.map((filePath) => pathExists(filePath)));
    const hasAnyContradictionState = contradictionPresence.some(Boolean);
    const hasCompleteContradictionState = contradictionPresence.every(Boolean);

    if (hasAnyContradictionState && !hasCompleteContradictionState) {
      throw new Error("Existing conversation preference flow is partially materialized in authoritative storage");
    }
  }

  if (!hasAnyAuthoritativeState) {
    return undefined;
  }

  if (!hasCompleteAuthoritativeState) {
    throw new Error("Existing conversation preference flow is partially materialized in authoritative storage");
  }

  const loaded = await loadAuthoritativeFlow(paths);
  if (
    loaded.ratification_record.decision === "approved" &&
    !(await pathExists(paths.canonical_record))
  ) {
    throw new Error("Existing conversation preference flow is missing approved canonical state");
  }

  if (
    loaded.ratification_record.decision !== "approved" &&
    await pathExists(paths.canonical_record)
  ) {
    throw new Error("Existing conversation preference flow contains canonical state after rejected governance");
  }

  if (
    loaded.ratification_record.decision !== "approved" &&
    paths.diagnostic_record &&
    !(await pathExists(paths.diagnostic_record))
  ) {
    throw new Error("Existing conversation preference flow is missing non-approved diagnostic state");
  }

  if (
    loaded.intake.proposal.promotion_requirement === "owner_ratification_required" &&
    !loaded.owner_ratification_queue
  ) {
    throw new Error("Existing conversation preference flow is missing owner ratification queue state");
  }

  assertLoadedFlowMatchesInput(loaded, expectedSourceRecord, expectedIntake);

  await ensureReplayableArtifacts(input, paths, loaded);

  const requiredPaths = [
    paths.raw_source,
    paths.source_record,
    paths.observation,
    paths.episode,
    paths.subject_entity,
    paths.preference_entity,
    paths.preference_relation,
    paths.world_claim,
    paths.wiki_page_record,
    paths.wiki_page_markdown,
    paths.wiki_claim,
    paths.proposal,
    paths.disposition_record,
    paths.ratification_record,
    paths.projection_markdown,
    paths.projection_manifest,
    paths.projection_artifacts.canon,
    paths.projection_artifacts.world,
    paths.projection_artifacts.wiki,
  ];

  if (loaded.ratification_record.decision === "approved") {
    requiredPaths.push(paths.canonical_record);
  }

  if (loaded.ratification_record.decision !== "approved" && paths.diagnostic_record) {
    requiredPaths.push(paths.diagnostic_record);
  }

  if (!(await Promise.all(requiredPaths.map((filePath) => pathExists(filePath)))).every(Boolean)) {
    throw new Error("Conversation preference flow repair did not restore all expected artifacts");
  }

  const { source_record, intake, ratification_record, diagnostic, canonical_record } = loaded;
  const projection_artifacts = await Promise.all([
    readCoreRecord<ProjectionArtifact>(paths.projection_artifacts.canon),
    readCoreRecord<ProjectionArtifact>(paths.projection_artifacts.world),
    readCoreRecord<ProjectionArtifact>(paths.projection_artifacts.wiki),
  ]);
  const projection_manifest = await readCoreRecord<ProjectionManifest>(paths.projection_manifest);
  const contradiction =
    paths.contradiction && (await pathExists(paths.contradiction))
      ? await readCoreRecord<Contradiction>(paths.contradiction)
      : undefined;
  const contradiction_resolution =
    paths.contradiction_resolution && (await pathExists(paths.contradiction_resolution))
      ? await readCoreRecord<ContradictionResolution>(paths.contradiction_resolution)
      : undefined;

  const validation_issues = [
    source_record,
    intake.observation,
    ...(intake.agent_identity ? [intake.agent_identity] : []),
    ...(intake.owner_identity ? [intake.owner_identity] : []),
    ...(intake.runtime_instance ? [intake.runtime_instance] : []),
    ...(intake.runtime_session ? [intake.runtime_session] : []),
    ...(intake.conversation_thread ? [intake.conversation_thread] : []),
    intake.episode,
    intake.subject_entity,
    intake.preference_entity,
    intake.preference_relation,
    intake.world_claim,
    intake.wiki_page,
    intake.wiki_claim,
    intake.proposal,
    ...(loaded.owner_ratification_queue ? [loaded.owner_ratification_queue] : []),
    intake.disposition_record,
    ratification_record,
    ...(diagnostic ? [diagnostic] : []),
    ...(canonical_record ? [canonical_record] : []),
    ...(contradiction ? [contradiction] : []),
    ...(contradiction_resolution ? [contradiction_resolution] : []),
    ...projection_artifacts,
    projection_manifest,
  ].flatMap((record) => validateCoreRecord(record));

  return {
    reused: true,
    paths,
    records: {
      source_record,
      intake,
      contradiction,
      contradiction_resolution,
      owner_ratification_queue: loaded.owner_ratification_queue,
      ratification_record,
      diagnostic,
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
      agent_identity: paths.actor_identity ? await readCoreRecord<ActorIdentity>(paths.actor_identity) : undefined,
      owner_identity: paths.owner_identity ? await readCoreRecord<ActorIdentity>(paths.owner_identity) : undefined,
      runtime_instance: paths.runtime_instance ? await readCoreRecord<RuntimeInstance>(paths.runtime_instance) : undefined,
      runtime_session: paths.runtime_session ? await readCoreRecord<RuntimeSession>(paths.runtime_session) : undefined,
      conversation_thread: paths.conversation_thread ? await readCoreRecord<ConversationThread>(paths.conversation_thread) : undefined,
      episode: await readCoreRecord<Episode>(paths.episode),
      subject_entity: await readCoreRecord<Entity>(paths.subject_entity),
      preference_entity: await readCoreRecord<Entity>(paths.preference_entity),
      preference_relation: await readCoreRecord<Relation>(paths.preference_relation),
      world_claim: await readCoreRecord<WorldClaim>(paths.world_claim),
      wiki_page: await readCoreRecord<WikiPage>(paths.wiki_page_record),
      wiki_claim: await readCoreRecord<WikiClaim>(paths.wiki_claim),
      proposal: await readCoreRecord<Proposal>(paths.proposal),
      disposition_record: await readCoreRecord<DispositionRecord>(paths.disposition_record),
    },
    ratification_record: await readCoreRecord<RatificationRecord>(paths.ratification_record),
    owner_ratification_queue:
      paths.owner_ratification_queue && (await pathExists(paths.owner_ratification_queue))
        ? await readCoreRecord<CurationPacket>(paths.owner_ratification_queue)
        : undefined,
    diagnostic:
      paths.diagnostic_record && (await pathExists(paths.diagnostic_record))
        ? await readCoreRecord<Diagnostic>(paths.diagnostic_record)
        : undefined,
    canonical_record:
      await pathExists(paths.canonical_record)
        ? await readCoreRecord<CanonicalMemoryObject>(paths.canonical_record)
        : undefined,
  };
}

function assertLoadedFlowMatchesInput(
  loaded: LoadedAuthoritativeFlow,
  expectedSourceRecord: SourceRecord,
  expectedIntake: ConversationPreferenceIntakeArtifacts,
): void {
  const mismatches: string[] = [];
  const expectedProposalStatement =
    typeof expectedIntake.proposal.candidate_payload.statement === "string"
      ? expectedIntake.proposal.candidate_payload.statement
      : undefined;

  if (loaded.source_record.id !== expectedSourceRecord.id) mismatches.push("source.id");
  if (loaded.source_record.content_ref !== expectedSourceRecord.content_ref) mismatches.push("source.content_ref");
  if (loaded.source_record.provenance.source_type !== expectedSourceRecord.provenance.source_type) mismatches.push("source.source_type");
  if (loaded.source_record.provenance.source_ref !== expectedSourceRecord.provenance.source_ref) mismatches.push("source.source_ref");
  if (loaded.source_record.provenance.actor_ref !== expectedSourceRecord.provenance.actor_ref) mismatches.push("source.actor_ref");
  if (loaded.source_record.provenance.speaker_ref !== expectedSourceRecord.provenance.speaker_ref) mismatches.push("source.speaker_ref");
  if (loaded.source_record.provenance.runtime_ref !== expectedSourceRecord.provenance.runtime_ref) mismatches.push("source.runtime_ref");
  if (loaded.source_record.provenance.session_ref !== expectedSourceRecord.provenance.session_ref) mismatches.push("source.session_ref");
  if (loaded.source_record.provenance.thread_ref !== expectedSourceRecord.provenance.thread_ref) mismatches.push("source.thread_ref");
  if (loaded.intake.observation.provenance.source_ref !== expectedIntake.observation.provenance.source_ref) mismatches.push("observation.provenance.source_ref");
  if (loaded.intake.observation.provenance.source_type !== expectedIntake.observation.provenance.source_type) mismatches.push("observation.provenance.source_type");
  if (loaded.intake.observation.summary !== expectedIntake.observation.summary) mismatches.push("observation.summary");
  if (loaded.intake.observation.runtime_instance_ref !== expectedIntake.observation.runtime_instance_ref) mismatches.push("observation.runtime_instance_ref");
  if (loaded.intake.observation.runtime_session_ref !== expectedIntake.observation.runtime_session_ref) mismatches.push("observation.runtime_session_ref");
  if (loaded.intake.observation.conversation_thread_ref !== expectedIntake.observation.conversation_thread_ref) mismatches.push("observation.conversation_thread_ref");
  if (loaded.intake.episode.provenance.source_ref !== expectedIntake.episode.provenance.source_ref) mismatches.push("episode.provenance.source_ref");
  if (loaded.intake.episode.summary !== expectedIntake.episode.summary) mismatches.push("episode.summary");
  if (loaded.intake.world_claim.provenance.source_ref !== expectedIntake.world_claim.provenance.source_ref) mismatches.push("world_claim.provenance.source_ref");
  if (loaded.intake.world_claim.statement !== expectedIntake.world_claim.statement) mismatches.push("world_claim.statement");
  if (loaded.intake.world_claim.semantic_slot !== expectedIntake.world_claim.semantic_slot) mismatches.push("world_claim.semantic_slot");
  if (loaded.intake.subject_entity.label !== expectedIntake.subject_entity.label) mismatches.push("subject_entity.label");
  if (loaded.intake.preference_entity.label !== expectedIntake.preference_entity.label) mismatches.push("preference_entity.label");
  if (loaded.intake.preference_relation.relation_type !== expectedIntake.preference_relation.relation_type) mismatches.push("preference_relation.relation_type");
  if (loaded.intake.preference_relation.subject_ref.id !== expectedIntake.preference_relation.subject_ref.id) mismatches.push("preference_relation.subject_ref.id");
  if (loaded.intake.preference_relation.object_ref.id !== expectedIntake.preference_relation.object_ref.id) mismatches.push("preference_relation.object_ref.id");
  if (loaded.intake.wiki_page.provenance.source_ref !== expectedIntake.wiki_page.provenance.source_ref) mismatches.push("wiki_page.provenance.source_ref");
  if (loaded.intake.wiki_page.title !== expectedIntake.wiki_page.title) mismatches.push("wiki_page.title");
  if (loaded.intake.wiki_page.path !== expectedIntake.wiki_page.path) mismatches.push("wiki_page.path");
  if (loaded.intake.wiki_claim.provenance.source_ref !== expectedIntake.wiki_claim.provenance.source_ref) mismatches.push("wiki_claim.provenance.source_ref");
  if (loaded.intake.wiki_claim.statement !== expectedIntake.wiki_claim.statement) mismatches.push("wiki_claim.statement");
  if (loaded.intake.proposal.provenance.source_ref !== expectedIntake.proposal.provenance.source_ref) mismatches.push("proposal.provenance.source_ref");
  if (loaded.intake.proposal.provenance.source_type !== expectedIntake.proposal.provenance.source_type) mismatches.push("proposal.provenance.source_type");
  if (loaded.intake.proposal.candidate_payload.semantic_slot !== expectedIntake.proposal.candidate_payload.semantic_slot) mismatches.push("proposal.candidate_payload.semantic_slot");
  if (loaded.intake.proposal.candidate_payload.statement !== expectedProposalStatement) mismatches.push("proposal.candidate_payload.statement");
  if (loaded.intake.disposition_record.provenance.source_ref !== expectedIntake.disposition_record.provenance.source_ref) mismatches.push("disposition_record.provenance.source_ref");
  if (loaded.intake.disposition_record.provenance.source_type !== expectedIntake.disposition_record.provenance.source_type) mismatches.push("disposition_record.provenance.source_type");
  if (loaded.ratification_record.provenance.source_ref !== expectedIntake.proposal.provenance.source_ref) mismatches.push("ratification_record.provenance.source_ref");
  if (
    loaded.canonical_record &&
    loaded.canonical_record.provenance.source_ref !== expectedIntake.proposal.provenance.source_ref
  ) mismatches.push("canonical_record.provenance.source_ref");
  if (loaded.canonical_record && loaded.canonical_record.statement !== expectedProposalStatement) mismatches.push("canonical_record.statement");
  if (loaded.canonical_record && loaded.canonical_record.semantic_slot !== expectedIntake.world_claim.semantic_slot) mismatches.push("canonical_record.semantic_slot");
  if (expectedIntake.runtime_instance?.id && loaded.intake.runtime_instance?.id !== expectedIntake.runtime_instance.id) {
    mismatches.push("runtime_instance.id");
  }
  if (expectedIntake.agent_identity?.label && loaded.intake.agent_identity?.label !== expectedIntake.agent_identity.label) {
    mismatches.push("agent_identity.label");
  }
  if (expectedIntake.owner_identity?.label && loaded.intake.owner_identity?.label !== expectedIntake.owner_identity.label) {
    mismatches.push("owner_identity.label");
  }
  if (expectedIntake.runtime_instance?.runtime && loaded.intake.runtime_instance?.runtime !== expectedIntake.runtime_instance.runtime) {
    mismatches.push("runtime_instance.runtime");
  }
  if (expectedIntake.runtime_session?.id && loaded.intake.runtime_session?.id !== expectedIntake.runtime_session.id) {
    mismatches.push("runtime_session.id");
  }
  if (expectedIntake.runtime_session?.objective !== undefined && loaded.intake.runtime_session?.objective !== expectedIntake.runtime_session.objective) {
    mismatches.push("runtime_session.objective");
  }
  if (expectedIntake.runtime_session?.summary !== undefined && loaded.intake.runtime_session?.summary !== expectedIntake.runtime_session.summary) {
    mismatches.push("runtime_session.summary");
  }
  if (expectedIntake.conversation_thread?.id && loaded.intake.conversation_thread?.id !== expectedIntake.conversation_thread.id) {
    mismatches.push("conversation_thread.id");
  }
  if (
    expectedIntake.conversation_thread &&
    JSON.stringify(loaded.intake.conversation_thread?.message_refs ?? []) !== JSON.stringify(expectedIntake.conversation_thread.message_refs)
  ) {
    mismatches.push("conversation_thread.message_refs");
  }
  if (expectedIntake.conversation_thread?.summary !== undefined && loaded.intake.conversation_thread?.summary !== expectedIntake.conversation_thread.summary) {
    mismatches.push("conversation_thread.summary");
  }

  if (mismatches.length > 0) {
    throw new Error(`Existing conversation preference flow does not match input: ${mismatches.join(", ")}`);
  }
}

async function buildProjectionFromStoreState(
  rootDir: string,
  paths: ConversationPreferenceStorePaths,
  input: ConversationPreferenceStoreInput,
  canonicalRecord: CanonicalMemoryObject | undefined,
  intake: ConversationPreferenceIntakeArtifacts,
  now = input.now,
  overrides?: {
    canonical_records?: CanonicalMemoryObject[];
    world_claims?: WorldClaim[];
    episodes?: Episode[];
    entities?: Entity[];
    relations?: Relation[];
    contradictions?: Contradiction[];
    contradiction_resolutions?: ContradictionResolution[];
    curation_packets?: CurationPacket[];
    wiki_pages?: WikiPage[];
    wiki_claims?: WikiClaim[];
    diagnostics?: Diagnostic[];
  },
) {
  const [
    canonical_records,
    world_claims,
    episodes,
    entities,
    relations,
    contradictions,
    contradiction_resolutions,
    curation_packets,
    wiki_pages,
    wiki_claims,
    diagnostics,
  ] = await Promise.all([
    loadCanonicalRecords(rootDir),
    loadWorldClaims(rootDir),
    loadWorldEpisodes(rootDir),
    loadWorldEntities(rootDir),
    loadWorldRelations(rootDir),
    loadWorldContradictions(rootDir),
    loadContradictionResolutions(rootDir),
    loadCurationPackets(rootDir),
    loadWikiPages(rootDir),
    loadWikiClaims(rootDir),
    loadDiagnostics(rootDir),
  ]);

  const mergeById = <T extends { id: string }>(stored: T[], pending: T[] = []): T[] => {
    const merged = new Map(stored.map((record) => [record.id, record]));
    for (const record of pending) {
      merged.set(record.id, record);
    }
    return [...merged.values()];
  };

  const effectiveCanonicalRecords =
    mergeById(
      canonical_records,
      [
        ...(overrides?.canonical_records ?? []),
        ...(canonicalRecord ? [canonicalRecord] : []),
      ],
    );

  return executeOpenClawBootstrapWorkflow({
    now,
    projection_path: relativeStorePath(rootDir, paths.projection_markdown),
    visibility_state: canonicalRecord?.visibility_state ?? intake.world_claim.visibility_state,
    canonical_records: effectiveCanonicalRecords,
    world_claims: mergeById(world_claims, overrides?.world_claims),
    episodes: mergeById(episodes, overrides?.episodes),
    entities: mergeById(entities, overrides?.entities),
    relations: mergeById(relations, overrides?.relations),
    contradictions: mergeById(contradictions, overrides?.contradictions),
    contradiction_resolutions: mergeById(contradiction_resolutions, overrides?.contradiction_resolutions),
    curation_packets: mergeById(curation_packets, overrides?.curation_packets),
    wiki_pages: mergeById(wiki_pages, overrides?.wiki_pages),
    wiki_claims: mergeById(wiki_claims, overrides?.wiki_claims),
    diagnostics: mergeById(diagnostics, overrides?.diagnostics),
    runtime_identity: {
      actor_identity: intake.agent_identity,
      owner_identity: intake.owner_identity,
      runtime_instance: intake.runtime_instance,
      runtime_session: intake.runtime_session,
      conversation_thread: intake.conversation_thread,
    },
    identity_context: {
      actor_identity_ref: intake.agent_identity?.id ?? null,
      owner_identity_ref: intake.owner_identity?.id ?? null,
      runtime_instance_ref: intake.runtime_instance?.id ?? null,
      runtime_session_ref: intake.runtime_session?.id ?? null,
      conversation_thread_ref: intake.conversation_thread?.id ?? null,
    },
    ids: {
      canon_artifact: input.ids.canon_artifact,
      world_artifact: input.ids.world_artifact,
      wiki_artifact: input.ids.wiki_artifact,
      manifest: input.ids.projection_manifest,
    },
  });
}

async function readProjectionArtifacts(paths: ConversationPreferenceStorePaths): Promise<ProjectionArtifact[]> {
  return Promise.all([
    readCoreRecord<ProjectionArtifact>(paths.projection_artifacts.canon),
    readCoreRecord<ProjectionArtifact>(paths.projection_artifacts.world),
    readCoreRecord<ProjectionArtifact>(paths.projection_artifacts.wiki),
  ]);
}

function latestTimestamp(input: {
  fallback: string;
  records: Array<{
    created_at: string;
    updated_at?: string | null;
  }>;
}): string {
  let latest = input.fallback;
  let latestValue = Date.parse(latest);

  for (const record of input.records) {
    for (const candidate of [record.created_at, record.updated_at ?? undefined]) {
      if (!candidate) continue;
      const parsed = Date.parse(candidate);
      if (Number.isNaN(parsed)) continue;
      if (Number.isNaN(latestValue) || parsed > latestValue) {
        latest = candidate;
        latestValue = parsed;
      }
    }
  }

  return latest;
}

async function readPersistedProjectionTimestamp(filePath: string): Promise<string | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as { created_at?: unknown };
    return typeof parsed.created_at === "string" ? parsed.created_at : undefined;
  } catch {
    return undefined;
  }
}

async function deriveReplayProjectionTimestamp(
  input: ConversationPreferenceStoreInput,
  paths: ConversationPreferenceStorePaths,
  loaded: LoadedAuthoritativeFlow,
): Promise<string> {
  const records: Array<{
    created_at: string;
    updated_at?: string | null;
  }> = [
    loaded.source_record,
    loaded.intake.observation,
    ...(loaded.intake.agent_identity ? [loaded.intake.agent_identity] : []),
    ...(loaded.intake.owner_identity ? [loaded.intake.owner_identity] : []),
    ...(loaded.intake.runtime_instance ? [loaded.intake.runtime_instance] : []),
    ...(loaded.intake.runtime_session ? [loaded.intake.runtime_session] : []),
    ...(loaded.intake.conversation_thread ? [loaded.intake.conversation_thread] : []),
    loaded.intake.episode,
    loaded.intake.subject_entity,
    loaded.intake.preference_entity,
    loaded.intake.preference_relation,
    loaded.intake.world_claim,
    loaded.intake.wiki_page,
    loaded.intake.wiki_claim,
    loaded.intake.proposal,
    loaded.intake.disposition_record,
    loaded.ratification_record,
    ...(loaded.diagnostic ? [loaded.diagnostic] : []),
    ...(loaded.canonical_record ? [loaded.canonical_record] : []),
  ];

  if (paths.contradiction && (await pathExists(paths.contradiction))) {
    records.push(await readCoreRecord<Contradiction>(paths.contradiction));
  }
  if (paths.contradiction_resolution && (await pathExists(paths.contradiction_resolution))) {
    records.push(await readCoreRecord<ContradictionResolution>(paths.contradiction_resolution));
  }

  return latestTimestamp({
    fallback: input.now,
    records,
  });
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

  await ensureFileContent(
    paths.wiki_page_markdown,
    renderWikiMarkdown(
      loaded.intake.wiki_page,
      loaded.source_record,
      loaded.intake.world_claim.id,
      loaded.intake.world_claim.statement,
      loaded.canonical_record?.id,
    ),
  );

  const projectionTimestamp =
    await readPersistedProjectionTimestamp(paths.projection_manifest) ??
    await deriveReplayProjectionTimestamp(input, paths, loaded);
  const projection = await buildProjectionFromStoreState(
    resolve(input.rootDir),
    paths,
    input,
    loaded.canonical_record,
    loaded.intake,
    projectionTimestamp,
  );

  await ensureFileContent(paths.projection_markdown, projection.markdown);
  await ensureFileContent(paths.projection_artifacts.canon, serializeCoreRecordContent(projection.artifacts[0]!));
  await ensureFileContent(paths.projection_artifacts.world, serializeCoreRecordContent(projection.artifacts[1]!));
  await ensureFileContent(paths.projection_artifacts.wiki, serializeCoreRecordContent(projection.artifacts[2]!));
  await ensureFileContent(paths.projection_manifest, serializeCoreRecordContent(projection.manifest));
}

function renderWikiMarkdown(
  wikiPage: WikiPage,
  sourceRecord: SourceRecord,
  worldClaimId: string,
  statement: string,
  canonicalId?: string,
): string {
  return [
    "---",
    `page_id: ${wikiPage.id}`,
    `page_kind: ${wikiPage.page_kind}`,
    `title: ${wikiPage.title}`,
    `source_refs: [${sourceRecord.id}]`,
    `world_refs: [${worldClaimId}]`,
    "---",
    "",
    `# ${wikiPage.title}`,
    "",
    `- ${statement}`,
    "",
    canonicalId ? `Canonical candidate: ${canonicalId}` : "Canonical candidate: pending review",
    "",
  ].join("\n");
}

function buildPreviewIntake(
  input: ConversationPreferenceStoreInput,
  source_record: SourceRecord,
  intakeBuilder: (
    input: {
      now: string;
      statement: string;
      source_record: SourceRecord;
      identity_context?: ConversationPreferenceRuntimeIdentityContext;
      semantic_profile?: Partial<PreferenceSignalSemanticProfile>;
      ids: ConversationPreferenceStoreInput["ids"] & {
        wiki_page: string;
        wiki_claim: string;
        proposal: string;
        disposition: string;
      };
    },
  ) => ConversationPreferenceIntakeArtifacts,
): ConversationPreferenceIntakeArtifacts {
  return intakeBuilder({
    now: input.now,
    statement: input.statement,
    source_record,
    identity_context: input.identity_context,
    semantic_profile: input.semantic_profile,
    ids: {
      observation: input.ids.observation,
      episode: input.ids.episode,
      subject_entity: input.ids.subject_entity,
      preference_entity: input.ids.preference_entity,
      preference_relation: input.ids.preference_relation,
      world_claim: input.ids.world_claim,
      wiki_page: input.ids.wiki_page,
      wiki_claim: input.ids.wiki_claim,
      proposal: input.ids.proposal,
      disposition: input.ids.disposition,
      contradiction: input.ids.contradiction,
      contradiction_resolution: input.ids.contradiction_resolution,
      ratification: input.ids.ratification,
      diagnostic: input.ids.diagnostic,
      canonical: input.ids.canonical,
      canon_artifact: input.ids.canon_artifact,
      world_artifact: input.ids.world_artifact,
      wiki_artifact: input.ids.wiki_artifact,
      projection_manifest: input.ids.projection_manifest,
    },
  });
}

async function buildExpectedIntakeForStore(
  rootDir: string,
  input: ConversationPreferenceStoreInput,
  source_record: SourceRecord,
  intakeBuilder: (
    input: {
      now: string;
      statement: string;
      source_record: SourceRecord;
      identity_context?: ConversationPreferenceRuntimeIdentityContext;
      semantic_profile?: Partial<PreferenceSignalSemanticProfile>;
      ids: ConversationPreferenceStoreInput["ids"] & {
        wiki_page: string;
        wiki_claim: string;
        proposal: string;
        disposition: string;
      };
    },
  ) => ConversationPreferenceIntakeArtifacts,
): Promise<{
  intake: ConversationPreferenceIntakeArtifacts;
  existingCanonicalRecords: CanonicalMemoryObject[];
  existingWorldClaims: WorldClaim[];
  conflicting_world_claim?: WorldClaim;
}> {
  const [existingCanonicalRecords, existingWorldClaims] = await Promise.all([
    loadCanonicalRecords(rootDir),
    loadWorldClaims(rootDir),
  ]);

  const previewIntake = await reconcilePersistedRuntimeIdentityArtifacts(
    rootDir,
    buildPreviewIntake(input, source_record, intakeBuilder),
  );

  const conflicting_world_claim = findConflictingWorldClaim(previewIntake.world_claim, existingWorldClaims);

  if (!conflicting_world_claim) {
    return {
      intake: previewIntake,
      existingCanonicalRecords,
      existingWorldClaims,
    };
  }

  return {
    intake: {
      ...previewIntake,
      disposition_record: buildConversationPreferenceDispositionRecord({
        now: input.now,
        source_record: {
          ...source_record,
          provenance: previewIntake.observation.provenance,
        },
        observation_id: previewIntake.observation.id,
        episode_id: previewIntake.episode.id,
        disposition_id: input.ids.disposition,
        proposal_id: previewIntake.proposal.id,
        strategy: {
          world_update: true,
          wiki_update: true,
          proposal_for_canon: false,
          queued_review: true,
          reason_codes: [
            "preference_signal",
            "editorial_update",
            "review_required",
            "active_world_conflict",
          ],
        },
      }),
    },
    existingCanonicalRecords,
    existingWorldClaims,
    conflicting_world_claim,
  };
}

async function reconcilePersistedRuntimeIdentityArtifacts(
  rootDir: string,
  intake: ConversationPreferenceIntakeArtifacts,
): Promise<ConversationPreferenceIntakeArtifacts> {
  async function preserveExistingActorIdentity(record: ActorIdentity | undefined): Promise<ActorIdentity | undefined> {
    if (!record) {
      return undefined;
    }

    const filePath = coreRecordPath(rootDir, record);
    if (!(await pathExists(filePath))) {
      return record;
    }

    return readCoreRecord<ActorIdentity>(filePath);
  }

  async function preserveRuntimeRecord<
    T extends RuntimeInstance | RuntimeSession | ConversationThread,
  >(record: T | undefined): Promise<T | undefined> {
    if (!record) {
      return undefined;
    }

    const filePath = coreRecordPath(rootDir, record);
    if (!(await pathExists(filePath))) {
      return record;
    }

    const existing = await readCoreRecord<T>(filePath);
    return {
      ...record,
      created_at: existing.created_at,
      provenance: existing.provenance,
      upstream_refs: existing.upstream_refs ?? record.upstream_refs,
    };
  }

  return {
    ...intake,
    agent_identity: await preserveExistingActorIdentity(intake.agent_identity),
    owner_identity: await preserveExistingActorIdentity(intake.owner_identity),
    runtime_instance: await preserveRuntimeRecord(intake.runtime_instance),
    runtime_session: await preserveRuntimeRecord(intake.runtime_session),
    conversation_thread: await preserveRuntimeRecord(intake.conversation_thread),
  };
}

export async function writeConversationPreferenceFlowToStore(
  input: ConversationPreferenceStoreInput,
): Promise<ConversationPreferenceStoreResult> {
  const rootDir = resolve(input.rootDir);
  await initializeStore(rootDir, input.now);

  const source_record = buildSourceRecord(input);
  const intakeBuilder = selectConversationPreferenceIntakeBuilder(input);
  const previewPaths = buildPaths(rootDir, source_record, buildPreviewIntake(input, source_record, intakeBuilder), input);
  await recoverOrResetWriteFlow(rootDir, input, previewPaths);
  const {
    intake,
    existingCanonicalRecords,
    existingWorldClaims,
    conflicting_world_claim,
  } = await buildExpectedIntakeForStore(rootDir, input, source_record, intakeBuilder);
  const paths = buildPaths(rootDir, source_record, intake, input);

  const existingFlow = await loadExistingFlow(input, paths, source_record, intake);
  if (existingFlow) {
    return existingFlow;
  }

  const canonicalWorkflow = executeCanonicalProposalWorkflow({
    proposal: intake.proposal,
    existing_canon_records: existingCanonicalRecords,
    blocking_world_conflict_ref: conflicting_world_claim?.id ?? null,
    now: input.now,
    actor: input.actor,
    ratification_id: input.ids.ratification,
    diagnostic_id: input.ids.diagnostic,
    canonical_id: input.ids.canonical,
  });

  if (canonicalWorkflow.accepted && !canonicalWorkflow.created_record) {
    throw new Error("Conversation preference workflow produced an accepted proposal without canonical state");
  }

  const owner_ratification_queue = buildOwnerRatificationQueuePacket({
    now: input.now,
    source_record,
    intake,
    paths,
    ratification_record: canonicalWorkflow.ratification_record,
    diagnostic: canonicalWorkflow.diagnostic,
  });

  const contradiction =
    input.ids.contradiction && conflicting_world_claim
      ? detectWorldClaimContradiction({
          now: input.now,
          contradiction_id: input.ids.contradiction,
          candidate_claim: intake.world_claim,
          existing_world_claims: existingWorldClaims,
        })
      : undefined;
  const contradiction_resolution =
    contradiction && conflicting_world_claim && input.ids.contradiction_resolution
      ? proposeContradictionResolution({
          now: input.now,
          resolution_id: input.ids.contradiction_resolution,
          contradiction,
          existing_claim: conflicting_world_claim,
          candidate_claim: intake.world_claim,
        })
      : undefined;
  const projection = await buildProjectionFromStoreState(rootDir, paths, input, canonicalWorkflow.created_record, intake, input.now, {
    canonical_records: canonicalWorkflow.created_record ? [canonicalWorkflow.created_record] : [],
    world_claims: [intake.world_claim],
    episodes: [intake.episode],
    entities: [intake.subject_entity, intake.preference_entity],
    relations: [intake.preference_relation],
    contradictions: contradiction ? [contradiction] : [],
    contradiction_resolutions: contradiction_resolution ? [contradiction_resolution] : [],
    curation_packets: owner_ratification_queue ? [owner_ratification_queue] : [],
    wiki_pages: [intake.wiki_page],
    wiki_claims: [intake.wiki_claim],
    diagnostics: canonicalWorkflow.diagnostic ? [canonicalWorkflow.diagnostic] : [],
  });
  const files = buildConversationPreferenceWriteFiles({
    rootDir,
    storeInput: input,
    paths,
    source_record,
    intake,
    contradiction,
    contradiction_resolution,
    owner_ratification_queue,
    ratification_record: canonicalWorkflow.ratification_record,
    diagnostic: canonicalWorkflow.diagnostic,
    canonical_record: canonicalWorkflow.created_record,
    projection,
  });
  const validation_issues = buildConversationPreferenceWriteValidationIssues({
    source_record,
    intake,
    contradiction,
    contradiction_resolution,
    owner_ratification_queue,
    ratification_record: canonicalWorkflow.ratification_record,
    diagnostic: canonicalWorkflow.diagnostic,
    canonical_record: canonicalWorkflow.created_record,
    projection,
  });
  assertNoValidationIssues(validation_issues, "conversation preference write flow");
  const audit_entries = buildConversationPreferenceAuditEntries({
    now: input.now,
    source_record,
    intake,
    owner_ratification_queue,
    ratification_record: canonicalWorkflow.ratification_record,
    canonical_record: canonicalWorkflow.created_record,
    projection,
    conflicting_world_claim,
  });
  const append_entries = buildConversationPreferenceAppendEntries({
    now: input.now,
    validation_scope: input.validation_scope ?? "workflow:conversation-preference",
    proposal_id: intake.proposal.id,
    validation_issues,
    audit_entries,
  });
  const journalPath = recoveryJournalPath(rootDir, "conversation_preference_write", input.ids.proposal);
  await writeRecoveryJournal(
    journalPath,
    buildRecoveryJournal({
      rootDir,
      operation: "conversation_preference_write",
      created_at: input.now,
      files,
      append_entries,
    }),
  );
  await materializeFiles(files);
  await replayRecoveryJournalEntries(rootDir, append_entries);
  await rm(journalPath, { force: true });

  return {
    reused: false,
    paths,
    records: {
      source_record,
      intake,
      contradiction,
      contradiction_resolution,
      owner_ratification_queue,
      ratification_record: canonicalWorkflow.ratification_record,
      diagnostic: canonicalWorkflow.diagnostic,
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
  const intakeBuilder = selectConversationPreferenceIntakeBuilder(input);
  const previewPaths = buildPaths(rootDir, source_record, buildPreviewIntake(input, source_record, intakeBuilder), input);
  await recoverOrResetWriteFlow(rootDir, input, previewPaths);
  const { intake } = await buildExpectedIntakeForStore(rootDir, input, source_record, intakeBuilder);

  return loadExistingFlow(input, buildPaths(rootDir, source_record, intake, input), source_record, intake);
}

export async function writeOpenClawPreferenceFeedbackFlowToStore(
  input: Omit<ConversationPreferenceStoreInput, "intake_kind">,
): Promise<ConversationPreferenceStoreResult> {
  return writeConversationPreferenceFlowToStore({
    ...input,
    intake_kind: "openclaw_projection_feedback",
  });
}

export async function writeStructuredPreferenceSignalFlowToStore(
  input: Omit<ConversationPreferenceStoreInput, "intake_kind">,
): Promise<ConversationPreferenceStoreResult> {
  return writeConversationPreferenceFlowToStore({
    ...input,
    intake_kind: "structured_preference_signal",
  });
}

export async function applyConversationPreferenceResolutionToStore(
  input: ConversationPreferenceStoreInput,
): Promise<ConversationPreferenceResolutionStoreResult> {
  const rootDir = resolve(input.rootDir);
  await recoverResolutionApplication(rootDir, input);
  const existingFlow = await readConversationPreferenceFlowResult(input);
  if (!existingFlow) {
    throw new Error("Conversation preference flow must exist before applying contradiction resolution");
  }

  const { paths, records } = existingFlow;
  if (!records.contradiction) {
    throw new Error("Conversation preference flow does not contain a contradiction to apply");
  }
  if (!records.contradiction_resolution) {
    throw new Error("Conversation preference flow does not contain a contradiction resolution to apply");
  }
  if (records.contradiction_resolution.strategy === "manual_review") {
    throw new Error("Manual-review contradiction resolutions require explicit review before application");
  }

  const existing_world_claim = await readCoreRecord<WorldClaim>(
    coreRecordPath(
      rootDir,
      {
        id: records.contradiction.left_ref.id,
        kind: "preference",
        layer: "world",
      } as WorldClaim,
    ),
  );
  const candidate_world_claim = await readCoreRecord<WorldClaim>(
    coreRecordPath(
      rootDir,
      {
        id: records.contradiction.right_ref.id,
        kind: "preference",
        layer: "world",
      } as WorldClaim,
    ),
  );

  if (records.contradiction_resolution.status === "applied") {
    const projection_artifacts = await readProjectionArtifacts(paths);
    const projection_manifest = await readCoreRecord<ProjectionManifest>(paths.projection_manifest);

    return {
      reused: true,
      paths,
      records: {
        ...records,
        contradiction: records.contradiction,
        contradiction_resolution: records.contradiction_resolution,
        existing_world_claim,
        candidate_world_claim,
        projection_artifacts,
        projection_manifest,
      },
      validation_issues: [
        ...existingFlow.validation_issues,
        ...validateCoreRecord(existing_world_claim),
        ...validateCoreRecord(candidate_world_claim),
      ],
    };
  }

  const applied = applyAcceptedContradictionResolution({
    now: input.now,
    contradiction: records.contradiction,
    resolution: acceptContradictionResolution({
      now: input.now,
      resolution: records.contradiction_resolution,
    }),
    existing_claim: existing_world_claim,
    candidate_claim: candidate_world_claim,
  });

  const projection = await buildProjectionFromStoreState(rootDir, paths, input, records.canonical_record, {
    ...records.intake,
    world_claim: applied.candidate_claim,
  }, input.now, {
    world_claims: [applied.existing_claim, applied.candidate_claim],
    contradictions: [applied.contradiction],
    contradiction_resolutions: [applied.resolution],
  });
  const files = buildResolutionApplicationFiles({
    rootDir,
    paths,
    applied,
    projection,
  });
  const validation_issues = buildResolutionApplicationValidationIssues({
    applied,
    projection,
  });
  assertNoValidationIssues(validation_issues, "conversation preference resolution application");
  const audit_entries = buildResolutionApplicationAuditEntries({
    now: input.now,
    applied,
    projection,
  });
  const append_entries = buildResolutionApplicationAppendEntries({
    now: input.now,
    validation_scope: input.validation_scope ?? "workflow:conversation-preference:resolution-application",
    resolution_id: applied.resolution.id,
    validation_issues,
    audit_entries,
  });
  const journalPath = recoveryJournalPath(
    rootDir,
    "conversation_preference_resolution_apply",
    records.contradiction_resolution.id,
  );
  await writeRecoveryJournal(
    journalPath,
    buildRecoveryJournal({
      rootDir,
      operation: "conversation_preference_resolution_apply",
      created_at: input.now,
      files,
      append_entries,
    }),
  );
  await materializeFiles(files);
  await replayRecoveryJournalEntries(rootDir, append_entries);
  await rm(journalPath, { force: true });

  return {
    reused: false,
    paths,
    records: {
      ...records,
      intake: {
        ...records.intake,
        world_claim: applied.candidate_claim,
      },
      contradiction: applied.contradiction,
      contradiction_resolution: applied.resolution,
      existing_world_claim: applied.existing_claim,
      candidate_world_claim: applied.candidate_claim,
      projection_artifacts: projection.artifacts,
      projection_manifest: projection.manifest,
    },
    validation_issues,
  };
}

function buildSyntheticInputForStoredFlow(
  rootDir: string,
  flow: ConversationPreferenceStoreResult,
  now: string,
  actor: string,
  validation_scope?: string,
): ConversationPreferenceStoreInput {
  return {
    rootDir,
    now,
    actor,
    statement: flow.records.intake.world_claim.statement,
    source: {
      id: flow.records.source_record.id,
      source_ref: flow.records.source_record.provenance.source_ref,
      content_ref: flow.records.source_record.content_ref,
      runtime: flow.records.intake.runtime_instance?.runtime ?? "generic",
      message: flow.records.intake.world_claim.statement,
      source_type: flow.records.source_record.provenance.source_type,
      speaker_ref: flow.records.source_record.provenance.speaker_ref ?? null,
    },
    ids: {
      observation: flow.records.intake.observation.id,
      episode: flow.records.intake.episode.id,
      subject_entity: flow.records.intake.subject_entity.id,
      preference_entity: flow.records.intake.preference_entity.id,
      preference_relation: flow.records.intake.preference_relation.id,
      world_claim: flow.records.intake.world_claim.id,
      contradiction: flow.records.contradiction?.id,
      contradiction_resolution: flow.records.contradiction_resolution?.id,
      wiki_page: flow.records.intake.wiki_page.id,
      wiki_claim: flow.records.intake.wiki_claim.id,
      proposal: flow.records.intake.proposal.id,
      disposition: flow.records.intake.disposition_record.id,
      ratification: flow.records.ratification_record.id,
      diagnostic: flow.records.diagnostic?.id,
      canonical: basename(flow.paths.canonical_record, ".json"),
      canon_artifact: flow.records.projection_artifacts[0]!.id,
      world_artifact: flow.records.projection_artifacts[1]!.id,
      wiki_artifact: flow.records.projection_artifacts[2]!.id,
      projection_manifest: flow.records.projection_manifest.id,
    },
    validation_scope,
  };
}

async function loadConversationPreferenceFlowFromOwnerRatificationQueue(
  rootDir: string,
  queue_id: string,
): Promise<ConversationPreferenceStoreResult | undefined> {
  const queuePacket = (await loadCurationPackets(rootDir)).find(
    (packet) => packet.id === queue_id && packet.review_kind === "owner_ratification",
  );
  if (!queuePacket) {
    return undefined;
  }

  const proposalId = queuePacket.proposal_refs[0];
  if (!proposalId) {
    throw new Error(`Owner ratification queue ${queue_id} is missing proposal_refs`);
  }
  if (
    !queuePacket.ratification_ref ||
    !queuePacket.source_record_ref ||
    !queuePacket.disposition_ref ||
    !queuePacket.subject_entity_ref ||
    !queuePacket.preference_entity_ref ||
    !queuePacket.preference_relation_ref ||
    !queuePacket.world_claim_ref ||
    !queuePacket.wiki_page_ref ||
    !queuePacket.wiki_claim_ref ||
    !queuePacket.canonical_target_ref ||
    !queuePacket.projection_manifest_ref ||
    (queuePacket.projection_artifact_refs?.length ?? 0) !== 3
  ) {
    throw new Error(`Owner ratification queue ${queue_id} does not carry enough flow refs`);
  }
  const projectionArtifactRefs = queuePacket.projection_artifact_refs as [string, string, string];

  const proposalPath = coreRecordPath(
    rootDir,
    {
      id: proposalId,
      kind: "proposal",
      layer: "governance",
    } as Proposal,
  );
  const proposal = await readCoreRecord<Proposal>(proposalPath);
  const [observationId, episodeId] = proposal.evidence_refs;
  if (!observationId || !episodeId) {
    throw new Error(`Proposal ${proposal.id} does not carry observation and episode refs`);
  }

  const sourceRecordPath = coreRecordPath(
    rootDir,
    {
      id: queuePacket.source_record_ref,
      kind: "source_record",
      layer: "raw",
    } as SourceRecord,
  );
  const source_record = await readCoreRecord<SourceRecord>(sourceRecordPath);
  const paths: ConversationPreferenceStorePaths = {
    raw_source: resolveStorePath(rootDir, source_record.content_ref),
    source_record: sourceRecordPath,
    observation: coreRecordPath(rootDir, { id: observationId, kind: "observation", layer: "runtime" } as Observation),
    episode: coreRecordPath(rootDir, { id: episodeId, kind: "episode", layer: "world" } as Episode),
    subject_entity: coreRecordPath(rootDir, { id: queuePacket.subject_entity_ref, kind: "entity", layer: "world" } as Entity),
    preference_entity: coreRecordPath(rootDir, { id: queuePacket.preference_entity_ref, kind: "entity", layer: "world" } as Entity),
    preference_relation: coreRecordPath(rootDir, { id: queuePacket.preference_relation_ref, kind: "relation", layer: "world" } as Relation),
    world_claim: coreRecordPath(rootDir, { id: queuePacket.world_claim_ref, kind: "preference", layer: "world" } as WorldClaim),
    actor_identity: queuePacket.actor_identity_ref
      ? coreRecordPath(rootDir, { id: queuePacket.actor_identity_ref, kind: "actor_identity", layer: "canon" } as ActorIdentity)
      : undefined,
    owner_identity: queuePacket.owner_identity_ref
      ? coreRecordPath(rootDir, { id: queuePacket.owner_identity_ref, kind: "actor_identity", layer: "canon" } as ActorIdentity)
      : undefined,
    runtime_instance: queuePacket.runtime_instance_ref
      ? coreRecordPath(rootDir, { id: queuePacket.runtime_instance_ref, kind: "runtime_instance", layer: "runtime" } as RuntimeInstance)
      : undefined,
    runtime_session: queuePacket.runtime_session_ref
      ? coreRecordPath(rootDir, { id: queuePacket.runtime_session_ref, kind: "runtime_session", layer: "runtime" } as RuntimeSession)
      : undefined,
    conversation_thread: queuePacket.conversation_thread_ref
      ? coreRecordPath(rootDir, { id: queuePacket.conversation_thread_ref, kind: "conversation_thread", layer: "runtime" } as ConversationThread)
      : undefined,
    wiki_page_record: coreRecordPath(rootDir, { id: queuePacket.wiki_page_ref, kind: "wiki_page", layer: "wiki" } as WikiPage),
    wiki_page_markdown: resolveStorePath(
      rootDir,
      (await readCoreRecord<WikiPage>(coreRecordPath(rootDir, { id: queuePacket.wiki_page_ref, kind: "wiki_page", layer: "wiki" } as WikiPage))).path,
    ),
    wiki_claim: coreRecordPath(rootDir, { id: queuePacket.wiki_claim_ref, kind: "wiki_claim", layer: "wiki" } as WikiClaim),
    proposal: proposalPath,
    owner_ratification_queue: coreRecordPath(rootDir, queuePacket),
    disposition_record: coreRecordPath(
      rootDir,
      { id: queuePacket.disposition_ref, kind: "disposition_record", layer: "governance" } as DispositionRecord,
    ),
    ratification_record: coreRecordPath(
      rootDir,
      { id: queuePacket.ratification_ref, kind: "ratification", layer: "governance" } as RatificationRecord,
    ),
    diagnostic_record: queuePacket.diagnostic_ref
      ? coreRecordPath(rootDir, { id: queuePacket.diagnostic_ref, kind: "diagnostic", layer: "audits" } as Diagnostic)
      : undefined,
    canonical_record: coreRecordPath(
      rootDir,
      {
        id: queuePacket.canonical_target_ref.id,
        kind: queuePacket.canonical_target_ref.kind ?? "preference",
        layer: queuePacket.canonical_target_ref.layer ?? "canon",
      } as CanonicalMemoryObject,
    ),
    projection_markdown: resolveStorePath(rootDir, defaultOpenClawBootstrapProjectionPath(queuePacket.projection_manifest_ref)),
    projection_manifest: coreRecordPath(
      rootDir,
      { id: queuePacket.projection_manifest_ref, kind: "projection_manifest", layer: "derived", adapter: "openclaw" } as ProjectionManifest,
    ),
    projection_artifacts: {
      canon: coreRecordPath(rootDir, { id: projectionArtifactRefs[0]!, kind: "projection_artifact", layer: "derived", adapter: "openclaw" } as ProjectionArtifact),
      world: coreRecordPath(rootDir, { id: projectionArtifactRefs[1]!, kind: "projection_artifact", layer: "derived", adapter: "openclaw" } as ProjectionArtifact),
      wiki: coreRecordPath(rootDir, { id: projectionArtifactRefs[2]!, kind: "projection_artifact", layer: "derived", adapter: "openclaw" } as ProjectionArtifact),
    },
  };

  const loaded = await loadAuthoritativeFlow(paths);
  const projection_artifacts = await readProjectionArtifacts(paths);
  const projection_manifest = await readCoreRecord<ProjectionManifest>(paths.projection_manifest);
  const flow: ConversationPreferenceStoreResult = {
    reused: true,
    paths,
    records: {
      source_record: loaded.source_record,
      intake: loaded.intake,
      contradiction: undefined,
      contradiction_resolution: undefined,
      owner_ratification_queue: loaded.owner_ratification_queue,
      ratification_record: loaded.ratification_record,
      diagnostic: loaded.diagnostic,
      canonical_record: loaded.canonical_record,
      projection_artifacts,
      projection_manifest,
    },
    validation_issues: [
      loaded.source_record,
      ...(loaded.intake.agent_identity ? [loaded.intake.agent_identity] : []),
      ...(loaded.intake.owner_identity ? [loaded.intake.owner_identity] : []),
      ...(loaded.intake.runtime_instance ? [loaded.intake.runtime_instance] : []),
      ...(loaded.intake.runtime_session ? [loaded.intake.runtime_session] : []),
      ...(loaded.intake.conversation_thread ? [loaded.intake.conversation_thread] : []),
      loaded.intake.observation,
      loaded.intake.episode,
      loaded.intake.subject_entity,
      loaded.intake.preference_entity,
      loaded.intake.preference_relation,
      loaded.intake.world_claim,
      loaded.intake.wiki_page,
      loaded.intake.wiki_claim,
      loaded.intake.proposal,
      loaded.intake.disposition_record,
      ...(loaded.owner_ratification_queue ? [loaded.owner_ratification_queue] : []),
      loaded.ratification_record,
      ...(loaded.diagnostic ? [loaded.diagnostic] : []),
      ...(loaded.canonical_record ? [loaded.canonical_record] : []),
      ...projection_artifacts,
      projection_manifest,
    ].flatMap((record) => validateCoreRecord(record)),
  };

  return {
    ...flow,
    reused: flow.records.ratification_record.decision === "approved",
  };
}

async function applyOwnerRatificationToExistingFlow(
  rootDir: string,
  existingFlow: ConversationPreferenceStoreResult,
  projectionInput: ConversationPreferenceStoreInput,
  input: {
    now: string;
    actor: string;
    owner_actor_ref: string;
    validation_scope?: string;
  },
): Promise<ConversationPreferenceStoreResult> {
  if (existingFlow.records.owner_ratification_queue?.status && existingFlow.records.owner_ratification_queue.status !== "pending") {
    throw new Error(`Owner ratification queue entry is already closed with status ${existingFlow.records.owner_ratification_queue.status}`);
  }

  if (existingFlow.records.ratification_record.decision === "approved") {
    return existingFlow;
  }

  if (existingFlow.records.ratification_record.decision !== "deferred") {
    throw new Error("Only deferred conversation preference flows can be explicitly owner-ratified");
  }

  const ownerIdentityRef = existingFlow.records.intake.owner_identity?.id;
  if (!ownerIdentityRef) {
    throw new Error("Deferred conversation preference flow does not carry an owner identity");
  }

  if (input.owner_actor_ref !== ownerIdentityRef) {
    throw new Error(`Explicit owner ratification requires owner_actor_ref ${ownerIdentityRef}`);
  }

  if (existingFlow.records.intake.proposal.promotion_requirement !== "owner_ratification_required") {
    throw new Error("Conversation preference flow is not waiting on owner ratification");
  }

  const canonicalWorkflow = executeCanonicalProposalWorkflow({
    proposal: {
      ...existingFlow.records.intake.proposal,
      promotion_requirement: "none",
    },
    existing_canon_records: await loadCanonicalRecords(rootDir),
    now: input.now,
    actor: input.actor,
    ratification_id: existingFlow.records.ratification_record.id,
    canonical_id: basename(existingFlow.paths.canonical_record, ".json"),
  });

  if (!canonicalWorkflow.accepted || !canonicalWorkflow.created_record) {
    const failedReasons = canonicalWorkflow.gate_results
      .filter((gate) => !gate.passed)
      .map((gate) => `${gate.gate}:${gate.reason_code}`)
      .join(", ");
    throw new Error(`Explicit owner ratification could not promote the proposal: ${failedReasons}`);
  }

  const updatedDiagnostic = buildResolvedDeferredDiagnostic({
    now: input.now,
    proposal: existingFlow.records.intake.proposal,
    ratification_record: canonicalWorkflow.ratification_record,
    canonical_record: canonicalWorkflow.created_record,
    diagnostic: existingFlow.records.diagnostic,
  });
  const updatedQueue = applyOwnerRatificationQueuePacket({
    now: input.now,
    queue: existingFlow.records.owner_ratification_queue,
    proposal: existingFlow.records.intake.proposal,
    ratification_record: canonicalWorkflow.ratification_record,
    canonical_record: canonicalWorkflow.created_record,
    diagnostic: updatedDiagnostic,
  });

  const projection = await buildProjectionFromStoreState(
    rootDir,
    existingFlow.paths,
    projectionInput,
    canonicalWorkflow.created_record,
    existingFlow.records.intake,
    input.now,
    {
      canonical_records: [canonicalWorkflow.created_record],
      curation_packets: updatedQueue ? [updatedQueue] : [],
      diagnostics: updatedDiagnostic ? [updatedDiagnostic] : [],
    },
  );

  const files = buildOwnerRatificationFiles({
    paths: existingFlow.paths,
    owner_ratification_queue: updatedQueue,
    ratification_record: canonicalWorkflow.ratification_record,
    canonical_record: canonicalWorkflow.created_record,
    diagnostic: updatedDiagnostic,
    projection,
  });
  const validation_issues = buildOwnerRatificationValidationIssues({
    owner_ratification_queue: updatedQueue,
    ratification_record: canonicalWorkflow.ratification_record,
    canonical_record: canonicalWorkflow.created_record,
    diagnostic: updatedDiagnostic,
    projection,
  });
  assertNoValidationIssues(validation_issues, "conversation preference explicit owner ratification");
  const audit_entries = buildOwnerRatificationAuditEntries({
    now: input.now,
    proposal: existingFlow.records.intake.proposal,
    owner_ratification_queue: updatedQueue,
    ratification_record: canonicalWorkflow.ratification_record,
    canonical_record: canonicalWorkflow.created_record,
    projection,
  });
  const append_entries = buildConversationPreferenceAppendEntries({
    now: input.now,
    validation_scope: input.validation_scope ?? "workflow:conversation-preference:owner-ratification",
    proposal_id: existingFlow.records.intake.proposal.id,
    validation_issues,
    audit_entries,
  });
  const journalPath = recoveryJournalPath(
    rootDir,
    "conversation_preference_owner_ratification_apply",
    existingFlow.records.intake.proposal.id,
  );
  await writeRecoveryJournal(
    journalPath,
    buildRecoveryJournal({
      rootDir,
      operation: "conversation_preference_owner_ratification_apply",
      created_at: input.now,
      files,
      append_entries,
    }),
  );
  await materializeFiles(files);
  await replayRecoveryJournalEntries(rootDir, append_entries);
  await rm(journalPath, { force: true });

  return {
    reused: false,
    paths: existingFlow.paths,
    records: {
      ...existingFlow.records,
      owner_ratification_queue: updatedQueue,
      ratification_record: canonicalWorkflow.ratification_record,
      diagnostic: updatedDiagnostic,
      canonical_record: canonicalWorkflow.created_record,
      projection_artifacts: projection.artifacts,
      projection_manifest: projection.manifest,
    },
    validation_issues,
  };
}

async function closeOwnerReviewQueueToExistingFlow(
  rootDir: string,
  existingFlow: ConversationPreferenceStoreResult,
  projectionInput: ConversationPreferenceStoreInput,
  input: {
    now: string;
    actor: string;
    owner_actor_ref?: string;
    validation_scope?: string;
    queue_status: "answered" | "expired";
  },
): Promise<ConversationPreferenceStoreResult> {
  const queue = existingFlow.records.owner_ratification_queue;
  if (!queue) {
    throw new Error("Conversation preference flow does not have an owner review queue entry");
  }

  if (queue.status !== "pending") {
    throw new Error(`Owner ratification queue entry is already closed with status ${queue.status}`);
  }

  if (existingFlow.records.ratification_record.decision === "approved") {
    throw new Error("Approved conversation preference flows cannot be closed as rejected or expired");
  }

  const ownerIdentityRef = existingFlow.records.intake.owner_identity?.id;
  if (input.queue_status === "answered") {
    if (!ownerIdentityRef) {
      throw new Error("Deferred conversation preference flow does not carry an owner identity");
    }
    if (input.owner_actor_ref !== ownerIdentityRef) {
      throw new Error(`Explicit owner rejection requires owner_actor_ref ${ownerIdentityRef}`);
    }
  }

  const ratification_record: RatificationRecord =
    input.queue_status === "answered"
      ? {
          ...existingFlow.records.ratification_record,
          updated_at: input.now,
          decision: "rejected",
          actor: input.actor,
          upstream_refs: [
            ...new Set([
              ...(existingFlow.records.ratification_record.upstream_refs ?? []),
              existingFlow.records.intake.proposal.id,
              queue.id,
            ]),
          ],
        }
      : {
          ...existingFlow.records.ratification_record,
          updated_at: input.now,
          upstream_refs: [
            ...new Set([
              ...(existingFlow.records.ratification_record.upstream_refs ?? []),
              existingFlow.records.intake.proposal.id,
              queue.id,
            ]),
          ],
        };

  const diagnostic = buildClosedDeferredDiagnostic({
    now: input.now,
    proposal: existingFlow.records.intake.proposal,
    ratification_record,
    queue_status: input.queue_status,
    diagnostic: existingFlow.records.diagnostic,
  });
  const updatedQueue = closeOwnerRatificationQueuePacket({
    now: input.now,
    queue,
    proposal: existingFlow.records.intake.proposal,
    ratification_record,
    queue_status: input.queue_status,
    diagnostic,
  });

  const projection = await buildProjectionFromStoreState(
    rootDir,
    existingFlow.paths,
    projectionInput,
    undefined,
    existingFlow.records.intake,
    input.now,
    {
      curation_packets: updatedQueue ? [updatedQueue] : [],
      diagnostics: diagnostic ? [diagnostic] : [],
    },
  );
  const files = buildOwnerReviewClosureFiles({
    paths: existingFlow.paths,
    owner_ratification_queue: updatedQueue,
    ratification_record,
    diagnostic,
    projection,
  });
  const validation_issues = buildOwnerReviewClosureValidationIssues({
    owner_ratification_queue: updatedQueue,
    ratification_record,
    diagnostic,
    projection,
  });
  assertNoValidationIssues(validation_issues, "conversation preference owner review closure");
  const audit_entries = buildOwnerReviewClosureAuditEntries({
    now: input.now,
    proposal: existingFlow.records.intake.proposal,
    owner_ratification_queue: updatedQueue,
    ratification_record,
    queue_status: input.queue_status,
    projection,
  });
  const append_entries = buildConversationPreferenceAppendEntries({
    now: input.now,
    validation_scope: input.validation_scope ?? "workflow:conversation-preference:owner-review-close",
    proposal_id: existingFlow.records.intake.proposal.id,
    validation_issues,
    audit_entries,
  });
  const journalPath = recoveryJournalPath(
    rootDir,
    "conversation_preference_owner_review_close",
    queue.id,
  );
  await writeRecoveryJournal(
    journalPath,
    buildRecoveryJournal({
      rootDir,
      operation: "conversation_preference_owner_review_close",
      created_at: input.now,
      files,
      append_entries,
    }),
  );
  await materializeFiles(files);
  await replayRecoveryJournalEntries(rootDir, append_entries);
  await rm(journalPath, { force: true });

  return {
    reused: false,
    paths: existingFlow.paths,
    records: {
      ...existingFlow.records,
      owner_ratification_queue: updatedQueue,
      ratification_record,
      diagnostic,
      projection_artifacts: projection.artifacts,
      projection_manifest: projection.manifest,
    },
    validation_issues,
  };
}

export async function listConversationPreferenceOwnerRatificationQueue(
  rootDir: string,
): Promise<ConversationPreferenceOwnerRatificationQueueEntry[]> {
  const [queuePackets, proposals, ratifications] = await Promise.all([
    loadCurationPackets(rootDir),
    loadProposals(rootDir),
    loadRatificationRecords(rootDir),
  ]);

  return queuePackets
    .filter((packet) => packet.review_kind === "owner_ratification" && packet.status === "pending")
    .map((packet) => {
      const proposal = proposals.find((candidate) => candidate.id === packet.proposal_refs[0]);
      if (!proposal) {
        throw new Error(`Owner ratification queue ${packet.id} references missing proposal ${packet.proposal_refs[0]}`);
      }
      const ratification = ratifications.find((candidate) => candidate.id === packet.ratification_ref);
      if (!ratification) {
        throw new Error(`Owner ratification queue ${packet.id} references missing ratification ${packet.ratification_ref}`);
      }
      return {
        queue_id: packet.id,
        proposal_id: proposal.id,
        ratification_id: ratification.id,
        diagnostic_id: packet.diagnostic_ref ?? undefined,
        owner_identity_ref: packet.owner_identity_ref ?? null,
        speaker_ref: proposal.provenance.speaker_ref ?? null,
        runtime_instance_ref: packet.runtime_instance_ref ?? null,
        runtime_session_ref: packet.runtime_session_ref ?? null,
        conversation_thread_ref: packet.conversation_thread_ref ?? null,
        statement:
          typeof proposal.candidate_payload.statement === "string"
            ? proposal.candidate_payload.statement
            : "(missing statement)",
        semantic_slot:
          typeof proposal.candidate_payload.semantic_slot === "string"
            ? proposal.candidate_payload.semantic_slot
            : "(missing semantic_slot)",
        reason: proposal.reason,
        created_at: packet.created_at,
        updated_at: packet.updated_at ?? packet.created_at,
      };
    })
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export async function ratifyQueuedConversationPreferenceProposalToStore(
  input: ConversationPreferenceQueuedRatificationInput,
): Promise<ConversationPreferenceStoreResult> {
  const rootDir = resolve(input.rootDir);
  await recoverOwnerReviewClosure(rootDir, input.queue_id);
  const existingFlow = await loadConversationPreferenceFlowFromOwnerRatificationQueue(
    rootDir,
    input.queue_id,
  );
  if (!existingFlow) {
    throw new Error(`Owner ratification queue entry ${input.queue_id} does not exist`);
  }

  return applyOwnerRatificationToExistingFlow(
    rootDir,
    existingFlow,
    buildSyntheticInputForStoredFlow(rootDir, existingFlow, input.now, input.actor, input.validation_scope),
    input,
  );
}

export async function rejectQueuedConversationPreferenceProposalToStore(
  input: ConversationPreferenceQueuedRejectionInput,
): Promise<ConversationPreferenceStoreResult> {
  const rootDir = resolve(input.rootDir);
  await recoverOwnerReviewClosure(rootDir, input.queue_id);
  const existingFlow = await loadConversationPreferenceFlowFromOwnerRatificationQueue(
    rootDir,
    input.queue_id,
  );
  if (!existingFlow) {
    throw new Error(`Owner ratification queue entry ${input.queue_id} does not exist`);
  }

  return closeOwnerReviewQueueToExistingFlow(
    rootDir,
    existingFlow,
    buildSyntheticInputForStoredFlow(rootDir, existingFlow, input.now, input.actor, input.validation_scope),
    {
      ...input,
      queue_status: "answered",
    },
  );
}

export async function expireQueuedConversationPreferenceProposalToStore(
  input: ConversationPreferenceQueuedExpirationInput,
): Promise<ConversationPreferenceStoreResult> {
  const rootDir = resolve(input.rootDir);
  await recoverOwnerReviewClosure(rootDir, input.queue_id);
  const existingFlow = await loadConversationPreferenceFlowFromOwnerRatificationQueue(
    rootDir,
    input.queue_id,
  );
  if (!existingFlow) {
    throw new Error(`Owner ratification queue entry ${input.queue_id} does not exist`);
  }

  return closeOwnerReviewQueueToExistingFlow(
    rootDir,
    existingFlow,
    buildSyntheticInputForStoredFlow(rootDir, existingFlow, input.now, input.actor, input.validation_scope),
    {
      ...input,
      queue_status: "expired",
    },
  );
}

export async function ratifyDeferredConversationPreferenceProposalToStore(
  input: ConversationPreferenceOwnerRatificationInput,
): Promise<ConversationPreferenceStoreResult> {
  const rootDir = resolve(input.rootDir);
  await recoverOwnerRatificationApplication(rootDir, input);

  const existingFlow = await readConversationPreferenceFlowResult(input);
  if (!existingFlow) {
    throw new Error("Conversation preference flow must exist before explicit owner ratification");
  }
  return applyOwnerRatificationToExistingFlow(rootDir, existingFlow, input, input);
}
