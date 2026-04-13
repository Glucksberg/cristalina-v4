import { access, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { appendAuditChange, appendValidationLog } from "../audit/log.js";
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
  writeCoreRecord,
} from "../store/io.js";
import type {
  ActorIdentity,
  CanonicalMemoryObject,
  ContradictionResolution,
  Contradiction,
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
      source_type: input.source.source_type ?? "conversation",
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
    paths.canonical_record,
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
  assertLoadedFlowMatchesInput(loaded, input);

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
    canonical_record,
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
  if (loaded.intake.observation.provenance.source_ref !== input.source.source_ref) mismatches.push("observation.provenance.source_ref");
  if (loaded.intake.observation.summary !== input.statement) mismatches.push("observation.summary");
  if (loaded.intake.episode.provenance.source_ref !== input.source.source_ref) mismatches.push("episode.provenance.source_ref");
  if (loaded.intake.world_claim.provenance.source_ref !== input.source.source_ref) mismatches.push("world_claim.provenance.source_ref");
  if (loaded.intake.world_claim.statement !== input.statement) mismatches.push("world_claim.statement");
  if (loaded.intake.wiki_page.provenance.source_ref !== input.source.source_ref) mismatches.push("wiki_page.provenance.source_ref");
  if (loaded.intake.wiki_claim.provenance.source_ref !== input.source.source_ref) mismatches.push("wiki_claim.provenance.source_ref");
  if (loaded.intake.wiki_claim.statement !== input.statement) mismatches.push("wiki_claim.statement");
  if (loaded.intake.proposal.provenance.source_ref !== input.source.source_ref) mismatches.push("proposal.provenance.source_ref");
  if (proposalStatement !== input.statement) mismatches.push("proposal.candidate_payload.statement");
  if (loaded.intake.disposition_record.provenance.source_ref !== input.source.source_ref) mismatches.push("disposition_record.provenance.source_ref");
  if (loaded.ratification_record.provenance.source_ref !== input.source.source_ref) mismatches.push("ratification_record.provenance.source_ref");
  if (loaded.canonical_record.provenance.source_ref !== input.source.source_ref) mismatches.push("canonical_record.provenance.source_ref");
  if (loaded.canonical_record.statement !== input.statement) mismatches.push("canonical_record.statement");
  if (input.identity_context?.ids.runtime_instance && loaded.intake.runtime_instance?.id !== input.identity_context.ids.runtime_instance) {
    mismatches.push("runtime_instance.id");
  }
  if (input.identity_context?.ids.runtime_session && loaded.intake.runtime_session?.id !== input.identity_context.ids.runtime_session) {
    mismatches.push("runtime_session.id");
  }
  if (input.identity_context?.ids.conversation_thread && loaded.intake.conversation_thread?.id !== input.identity_context.ids.conversation_thread) {
    mismatches.push("conversation_thread.id");
  }

  if (mismatches.length > 0) {
    throw new Error(`Existing conversation preference flow does not match input: ${mismatches.join(", ")}`);
  }
}

async function buildProjectionFromStoreState(
  rootDir: string,
  input: ConversationPreferenceStoreInput,
  canonicalRecord: CanonicalMemoryObject,
  intake: ConversationPreferenceIntakeArtifacts,
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

  const effectiveCanonicalRecords =
    canonical_records.length > 0 ? canonical_records : [canonicalRecord];

  return executeOpenClawBootstrapWorkflow({
    now: canonicalRecord.updated_at ?? canonicalRecord.created_at,
    visibility_state: canonicalRecord.visibility_state,
    canonical_records: effectiveCanonicalRecords,
    world_claims,
    episodes,
    entities,
    relations,
    contradictions,
    contradiction_resolutions,
    wiki_pages,
    wiki_claims,
    diagnostics,
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

  const projection = await buildProjectionFromStoreState(resolve(input.rootDir), input, loaded.canonical_record, loaded.intake);

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
  const intakeBuilder =
    input.intake_kind === "openclaw_projection_feedback"
      ? buildOpenClawPreferenceFeedbackIntake
      : input.intake_kind === "structured_preference_signal"
        ? buildStructuredPreferenceSignalIntake
        : buildConversationPreferenceIntake;
  const intake = intakeBuilder({
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
    },
  });
  const paths = buildPaths(rootDir, source_record, intake, input);

  const existingFlow = await loadExistingFlow(input, paths);
  if (existingFlow) {
    return existingFlow;
  }

  const [existingCanonicalRecords, existingWorldClaims] = await Promise.all([
    loadCanonicalRecords(rootDir),
    loadWorldClaims(rootDir),
  ]);
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

  const conflicting_world_claim = findConflictingWorldClaim(intake.world_claim, existingWorldClaims);
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

  await writeFile(
    paths.raw_source,
    serializeSourcePayload(input),
    "utf8",
  );

  await writeCoreRecord(rootDir, source_record);
  if (intake.agent_identity) await writeCoreRecord(rootDir, intake.agent_identity);
  if (intake.owner_identity) await writeCoreRecord(rootDir, intake.owner_identity);
  if (intake.runtime_instance) await writeCoreRecord(rootDir, intake.runtime_instance);
  if (intake.runtime_session) await writeCoreRecord(rootDir, intake.runtime_session);
  if (intake.conversation_thread) await writeCoreRecord(rootDir, intake.conversation_thread);
  await writeCoreRecord(rootDir, intake.observation);
  await writeCoreRecord(rootDir, intake.episode);
  await writeCoreRecord(rootDir, intake.subject_entity);
  await writeCoreRecord(rootDir, intake.preference_entity);
  await writeCoreRecord(rootDir, intake.preference_relation);
  await writeCoreRecord(rootDir, intake.world_claim);
  if (contradiction) {
    await writeCoreRecord(rootDir, contradiction);
  }
  if (contradiction_resolution) {
    await writeCoreRecord(rootDir, contradiction_resolution);
  }
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

  const projection = await buildProjectionFromStoreState(rootDir, input, canonicalWorkflow.created_record, intake);

  await writeFile(paths.projection_markdown, projection.markdown, "utf8");
  for (const artifact of projection.artifacts) {
    await writeCoreRecord(rootDir, artifact);
  }
  await writeCoreRecord(rootDir, projection.manifest);

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
    canonicalWorkflow.created_record,
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
      contradiction,
      contradiction_resolution,
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
  const intakeBuilder =
    input.intake_kind === "openclaw_projection_feedback"
      ? buildOpenClawPreferenceFeedbackIntake
      : input.intake_kind === "structured_preference_signal"
        ? buildStructuredPreferenceSignalIntake
        : buildConversationPreferenceIntake;
  const intake = intakeBuilder({
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
    },
  });

  return loadExistingFlow(input, buildPaths(rootDir, source_record, intake, input));
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
