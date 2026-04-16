import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { appendAuditChange, appendValidationLog } from "../audit/log.js";
import { defaultOpenClawBootstrapProjectionPath } from "../projection-engine/openclaw.js";
import {
  coreRecordPath,
  initializeStore,
  loadActorIdentities,
  loadCanonicalRecords,
  loadConversationThreads,
  loadContradictionResolutions,
  loadDiagnostics,
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
import type {
  ActorIdentity,
  CanonicalMemoryObject,
  ContradictionResolution,
  Contradiction,
  CoreRecord,
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
import { validateCoreRecord, type ValidationIssue } from "../validation.js";
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
  operation: "conversation_preference_write" | "conversation_preference_resolution_apply";
  created_at: string;
  files: RecoveryJournalFile[];
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

function serializeCoreRecordContent(record: CoreRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function materializeFiles(files: MaterializedFile[]): Promise<void> {
  for (const file of files) {
    await writeTextFile(file.path, file.content);
  }
}

async function ensureFileContent(filePath: string, expectedContent: string): Promise<void> {
  const currentContent = await readFile(filePath, "utf8").catch(() => undefined);
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
}): RecoveryJournal {
  return {
    version: 1,
    operation: input.operation,
    created_at: input.created_at,
    files: input.files.map((file) => ({
      relative_path: relativeStorePath(input.rootDir, file.path),
      content: file.content,
    })),
  };
}

async function writeRecoveryJournal(filePath: string, journal: RecoveryJournal): Promise<void> {
  await writeTextFile(filePath, `${JSON.stringify(journal, null, 2)}\n`);
}

async function recoverPendingJournal(rootDir: string, filePath: string): Promise<boolean> {
  if (!(await pathExists(filePath))) {
    return false;
  }

  const source = await readFile(filePath, "utf8");
  const parsed = JSON.parse(source) as Partial<RecoveryJournal>;
  const files = parseRecoveryJournalFiles(rootDir, parsed.files);
  await materializeFiles(files);
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
  return {
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
}

function writeFlowBaselinePaths(paths: ConversationPreferenceStorePaths): string[] {
  return [
    paths.raw_source,
    paths.source_record,
    ...(paths.actor_identity ? [paths.actor_identity] : []),
    ...(paths.owner_identity ? [paths.owner_identity] : []),
    ...(paths.runtime_instance ? [paths.runtime_instance] : []),
    ...(paths.runtime_session ? [paths.runtime_session] : []),
    ...(paths.conversation_thread ? [paths.conversation_thread] : []),
    paths.observation,
    paths.episode,
    paths.subject_entity,
    paths.preference_entity,
    paths.preference_relation,
    paths.world_claim,
    paths.wiki_page_record,
    paths.wiki_claim,
    paths.proposal,
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

  if (ratification.decision === "rejected" && paths.diagnostic_record && !diagnosticExists) {
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

function buildConversationPreferenceWriteFiles(input: {
  rootDir: string;
  storeInput: ConversationPreferenceStoreInput;
  paths: ConversationPreferenceStorePaths;
  source_record: SourceRecord;
  intake: ConversationPreferenceIntakeArtifacts;
  contradiction?: Contradiction;
  contradiction_resolution?: ContradictionResolution;
  ratification_record: RatificationRecord;
  diagnostic?: Diagnostic;
  canonical_record?: CanonicalMemoryObject;
  projection: Awaited<ReturnType<typeof buildProjectionFromStoreState>>;
}): MaterializedFile[] {
  const { paths, source_record, intake, contradiction, contradiction_resolution, ratification_record, diagnostic, canonical_record, projection } = input;

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
    loaded.ratification_record.decision === "rejected" &&
    paths.diagnostic_record &&
    !(await pathExists(paths.diagnostic_record))
  ) {
    throw new Error("Existing conversation preference flow is missing rejection diagnostic state");
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

  if (loaded.ratification_record.decision === "rejected" && paths.diagnostic_record) {
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
  if (loaded.source_record.provenance.source_ref !== expectedSourceRecord.provenance.source_ref) mismatches.push("source.source_ref");
  if (loaded.intake.observation.provenance.source_ref !== expectedIntake.observation.provenance.source_ref) mismatches.push("observation.provenance.source_ref");
  if (loaded.intake.observation.summary !== expectedIntake.observation.summary) mismatches.push("observation.summary");
  if (loaded.intake.episode.provenance.source_ref !== expectedIntake.episode.provenance.source_ref) mismatches.push("episode.provenance.source_ref");
  if (loaded.intake.world_claim.provenance.source_ref !== expectedIntake.world_claim.provenance.source_ref) mismatches.push("world_claim.provenance.source_ref");
  if (loaded.intake.world_claim.statement !== expectedIntake.world_claim.statement) mismatches.push("world_claim.statement");
  if (loaded.intake.world_claim.semantic_slot !== expectedIntake.world_claim.semantic_slot) mismatches.push("world_claim.semantic_slot");
  if (loaded.intake.wiki_page.provenance.source_ref !== expectedIntake.wiki_page.provenance.source_ref) mismatches.push("wiki_page.provenance.source_ref");
  if (loaded.intake.wiki_claim.provenance.source_ref !== expectedIntake.wiki_claim.provenance.source_ref) mismatches.push("wiki_claim.provenance.source_ref");
  if (loaded.intake.wiki_claim.statement !== expectedIntake.wiki_claim.statement) mismatches.push("wiki_claim.statement");
  if (loaded.intake.proposal.provenance.source_ref !== expectedIntake.proposal.provenance.source_ref) mismatches.push("proposal.provenance.source_ref");
  if (loaded.intake.proposal.candidate_payload.semantic_slot !== expectedIntake.proposal.candidate_payload.semantic_slot) mismatches.push("proposal.candidate_payload.semantic_slot");
  if (loaded.intake.proposal.candidate_payload.statement !== expectedProposalStatement) mismatches.push("proposal.candidate_payload.statement");
  if (loaded.intake.disposition_record.provenance.source_ref !== expectedIntake.disposition_record.provenance.source_ref) mismatches.push("disposition_record.provenance.source_ref");
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
  if (expectedIntake.runtime_session?.id && loaded.intake.runtime_session?.id !== expectedIntake.runtime_session.id) {
    mismatches.push("runtime_session.id");
  }
  if (expectedIntake.conversation_thread?.id && loaded.intake.conversation_thread?.id !== expectedIntake.conversation_thread.id) {
    mismatches.push("conversation_thread.id");
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

  const previewIntake = buildPreviewIntake(input, source_record, intakeBuilder);

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
    ratification_record: canonicalWorkflow.ratification_record,
    diagnostic: canonicalWorkflow.diagnostic,
    canonical_record: canonicalWorkflow.created_record,
    projection,
  });
  const journalPath = recoveryJournalPath(rootDir, "conversation_preference_write", input.ids.proposal);
  await writeRecoveryJournal(
    journalPath,
    buildRecoveryJournal({
      rootDir,
      operation: "conversation_preference_write",
      created_at: input.now,
      files,
    }),
  );
  await materializeFiles(files);
  await rm(journalPath, { force: true });

  const validation_issues = [
    source_record,
    ...(intake.agent_identity ? [intake.agent_identity] : []),
    ...(intake.owner_identity ? [intake.owner_identity] : []),
    ...(intake.runtime_instance ? [intake.runtime_instance] : []),
    ...(intake.runtime_session ? [intake.runtime_session] : []),
    ...(intake.conversation_thread ? [intake.conversation_thread] : []),
    intake.observation,
    intake.episode,
    intake.subject_entity,
    intake.preference_entity,
    intake.preference_relation,
    intake.world_claim,
    ...(contradiction ? [contradiction] : []),
    intake.wiki_page,
    intake.wiki_claim,
    intake.proposal,
    intake.disposition_record,
    canonicalWorkflow.ratification_record,
    ...(canonicalWorkflow.diagnostic ? [canonicalWorkflow.diagnostic] : []),
    ...(canonicalWorkflow.created_record ? [canonicalWorkflow.created_record] : []),
    ...projection.artifacts,
    projection.manifest,
    ...(contradiction_resolution ? [contradiction_resolution] : []),
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

  if (canonicalWorkflow.accepted && canonicalWorkflow.created_record) {
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
  } else {
    await appendAuditChange(rootDir, {
      at: input.now,
      operation: "governance_reject",
      record_id: canonicalWorkflow.ratification_record.id,
      record_kind: canonicalWorkflow.ratification_record.kind,
      record_layer: canonicalWorkflow.ratification_record.layer,
      detail: "Governance rejected canonical promotion and left the signal queued for review.",
      related_refs: [intake.proposal.id, ...(conflicting_world_claim ? [conflicting_world_claim.id] : [])],
    });
  }

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
      contradiction,
      contradiction_resolution,
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
        id: records.contradiction_resolution.losing_ref?.id ?? records.contradiction.left_ref.id,
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
        candidate_world_claim: records.intake.world_claim,
        projection_artifacts,
        projection_manifest,
      },
      validation_issues: [
        ...existingFlow.validation_issues,
        ...validateCoreRecord(existing_world_claim),
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
    candidate_claim: records.intake.world_claim,
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
    }),
  );
  await materializeFiles(files);
  await rm(journalPath, { force: true });

  const validation_issues = [
    applied.existing_claim,
    applied.candidate_claim,
    applied.contradiction,
    applied.resolution,
    ...projection.artifacts,
    projection.manifest,
  ].flatMap((record) => validateCoreRecord(record));

  await appendValidationLog(rootDir, {
    at: input.now,
    scope: input.validation_scope ?? "workflow:conversation-preference:resolution-application",
    issues: validation_issues,
  });

  await appendAuditChange(rootDir, {
    at: input.now,
    operation: "world_resolution_apply",
    record_id: applied.resolution.id,
    record_kind: applied.resolution.kind,
    record_layer: applied.resolution.layer,
    detail: `Applied contradiction resolution strategy ${applied.resolution.strategy} and recompiled projection.`,
    related_refs: [applied.contradiction.id, applied.existing_claim.id, applied.candidate_claim.id, projection.manifest.id],
  });

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
