import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { appendAuditChange, appendValidationLog } from "../audit/log.js";
import { resolveProjectionArtifactPath } from "../adapter-sdk/projection-path.js";
import {
  DEFAULT_PROJECTION_READ_POLICY_VERSION,
  type ProjectionReadContext,
} from "../adapter-sdk/projection.js";
import { projectionManifestMatchesContract } from "../adapter-sdk/projection-contracts.js";
import {
  compileMemoryBrowserProjection,
  MEMORY_BROWSER_PROJECTION_COMPILER_VERSION,
  readMemoryBrowserProjectionConsistency,
  type MemoryBrowserProjectionResult,
} from "../projection-engine/memory-browser.js";
import { STORAGE_LAYOUT } from "../storage.js";
import { atomicWriteText, isMissingFileError } from "../store/atomic-write.js";
import {
  coreRecordPath,
  initializeStore,
  loadActorIdentities,
  loadCanonicalRecords,
  loadConversationThreads,
  loadContradictionResolutions,
  loadCurationPackets,
  loadDiagnostics,
  loadDispositionRecords,
  loadProjectionArtifacts,
  loadProjectionManifests,
  loadProposals,
  loadRatificationRecords,
  loadRuntimeInstances,
  loadRuntimeSessions,
  loadSourceRecords,
  loadWikiClaims,
  loadWikiMaintenanceRuns,
  loadWikiPages,
  loadWorldClaims,
  loadWorldContradictions,
  loadWorldEntities,
  loadWorldEpisodes,
  loadWorldRelations,
  readCoreRecord,
} from "../store/io.js";
import type {
  AuthenticatedPrincipal,
  CoreRecord,
  Diagnostic,
  ProjectionArtifact,
  ProjectionManifest,
  Proposal,
  Reference,
  RuntimeKind,
  SourceRecord,
  VisibilityState,
  WikiClaim,
  WikiMaintenanceBoundaryReceipt,
  WikiGraphEdge,
  WikiMaintenanceEvent,
  WikiMaintenanceRun,
  WikiPage,
} from "../types.js";
import { ValidationError, validateCoreRecord, type ValidationIssue } from "../validation.js";
import { assertStoreRelativeWikiPagePath } from "../wiki/path.js";

export interface WikiMaintenanceIds {
  run: string;
  source_page?: string;
  topic_page?: string;
  query_page?: string;
  synthesis_page?: string;
  claim?: string;
  diagnostic?: string;
  diagnostics?: string[];
  browser_json_artifact: string;
  browser_html_artifact: string;
  browser_manifest: string;
}

export interface WikiMaintenanceInput {
  rootDir: string;
  now: string;
  actor: string;
  authenticated_principal: AuthenticatedPrincipal;
  memory_browser_adapter?: Exclude<RuntimeKind, "generic">;
  memory_browser_read_context?: ProjectionReadContext;
  event: WikiMaintenanceEvent;
  ids: WikiMaintenanceIds;
  source_record?: SourceRecord;
  support_records?: CoreRecord[];
  source_summary?: string;
  visibility_state?: VisibilityState;
  topic?: {
    title: string;
    summary: string;
    path?: string;
  };
  claim?: {
    statement: string;
    source_refs?: string[];
    support_refs?: string[];
    confidence_score?: number;
    quality_score?: number;
    candidate_for_promotion?: boolean;
    supersedes_ref?: string | null;
  };
  query_capture?: {
    title?: string;
    question: string;
    answer: string;
    upstream_refs: string[];
  };
  session_crystallization?: {
    title: string;
    summary: string;
    upstream_refs: string[];
  };
  lint?: {
    required_concepts?: string[];
    stale_before?: string;
  };
  retention_reviewed_refs?: string[];
  validation_scope?: string;
}

export interface WikiMaintenanceResult {
  reused: boolean;
  run: WikiMaintenanceRun;
  pages: WikiPage[];
  claims: WikiClaim[];
  diagnostics: Diagnostic[];
  memory_browser: MemoryBrowserProjectionResult;
  validation_issues: ValidationIssue[];
}

export interface WikiClaimProposalCandidateInput {
  now: string;
  proposal_id: string;
  claim: WikiClaim;
  upstream_records: CoreRecord[];
  candidate_kind?: "fact" | "belief" | "preference" | "constraint" | "goal" | "procedure" | "value" | "identity_trait";
  semantic_slot?: string;
  reason?: string;
  visibility_state?: VisibilityState;
}

interface PlannedWikiMarkdown {
  page: WikiPage;
  body: string;
}

interface MaterializedFile {
  path: string;
  content: string;
}

type WikiMaintenanceAppendEntry =
  | {
      kind: "validation_log";
      entry: Parameters<typeof appendValidationLog>[1];
    }
  | {
      kind: "audit_change";
      entry: Parameters<typeof appendAuditChange>[1];
    };

interface WikiMaintenanceRecoveryJournal {
  version: 1;
  operation: "wiki_maintenance";
  created_at: string;
  files: Array<{
    path: string;
    content: string;
  }>;
  append_entries: WikiMaintenanceAppendEntry[];
}

const WIKI_MAINTENANCE_LOCK_PATH = "audits/snapshots/.wiki-maintenance.lock";
const WIKI_MAINTENANCE_LOCK_TIMEOUT_MS = 120_000;
const WIKI_MAINTENANCE_LOCK_STALE_MS = 120_000;
const WIKI_MAINTENANCE_LOCK_POLL_MS = 25;
const WIKI_MAINTENANCE_RECOVERY_PREFIX = "recovery-wiki-maintenance-";
const WIKI_MAINTENANCE_RECOVERY_SUFFIX = ".json";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

async function wikiMaintenanceLockIsStale(lockPath: string, nowMs: number): Promise<boolean> {
  const lockStat = await stat(lockPath).catch((error) => {
    if (isMissingFileError(error)) return undefined;
    throw error;
  });
  if (!lockStat) {
    return false;
  }
  return nowMs - lockStat.mtimeMs > WIKI_MAINTENANCE_LOCK_STALE_MS;
}

async function acquireWikiMaintenanceLock(rootDir: string): Promise<() => Promise<void>> {
  const lockPath = resolveStorePath(rootDir, WIKI_MAINTENANCE_LOCK_PATH);
  const deadline = Date.now() + WIKI_MAINTENANCE_LOCK_TIMEOUT_MS;

  while (true) {
    try {
      await mkdir(lockPath, { recursive: false });
      return async () => {
        await rm(lockPath, { recursive: true, force: true });
      };
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      const nowMs = Date.now();
      if (await wikiMaintenanceLockIsStale(lockPath, nowMs)) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }

      if (nowMs >= deadline) {
        throw new Error("Timed out acquiring wiki maintenance write lock");
      }

      await sleep(WIKI_MAINTENANCE_LOCK_POLL_MS);
    }
  }
}

async function withWikiMaintenanceLock<T>(rootDir: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireWikiMaintenanceLock(rootDir);
  try {
    return await fn();
  } finally {
    await release();
  }
}

function safeJournalSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "wiki_maintenance";
}

function wikiMaintenanceRecoveryJournalPath(rootDir: string, runId: string): string {
  return resolveStorePath(rootDir, `audits/snapshots/${WIKI_MAINTENANCE_RECOVERY_PREFIX}${safeJournalSegment(runId)}${WIKI_MAINTENANCE_RECOVERY_SUFFIX}`);
}

function serializeCoreRecordContent(record: CoreRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

async function materializeFiles(files: MaterializedFile[]): Promise<void> {
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    await atomicWriteText(file.path, file.content);
  }
}

async function replayWikiMaintenanceAppendEntries(rootDir: string, entries: WikiMaintenanceAppendEntry[]): Promise<void> {
  for (const entry of entries) {
    if (entry.kind === "validation_log") {
      await appendValidationLog(rootDir, entry.entry);
      continue;
    }

    await appendAuditChange(rootDir, entry.entry);
  }
}

function relativeStorePath(rootDir: string, filePath: string): string {
  const rootPath = resolve(rootDir);
  const targetPath = resolveStorePath(rootDir, filePath);
  return relative(rootPath, targetPath);
}

function buildWikiMaintenanceRecoveryJournal(input: {
  rootDir: string;
  created_at: string;
  files: MaterializedFile[];
  append_entries: WikiMaintenanceAppendEntry[];
}): WikiMaintenanceRecoveryJournal {
  return {
    version: 1,
    operation: "wiki_maintenance",
    created_at: input.created_at,
    files: input.files.map((file) => ({
      path: relativeStorePath(input.rootDir, file.path),
      content: file.content,
    })),
    append_entries: input.append_entries,
  };
}

async function writeWikiMaintenanceRecoveryJournal(
  filePath: string,
  journal: WikiMaintenanceRecoveryJournal,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await atomicWriteText(filePath, `${JSON.stringify(journal, null, 2)}\n`);
}

async function recoverWikiMaintenanceJournal(rootDir: string, journalPath: string): Promise<void> {
  const parsed = JSON.parse(await readFile(journalPath, "utf8")) as Partial<WikiMaintenanceRecoveryJournal>;
  if (parsed.operation !== "wiki_maintenance" || !Array.isArray(parsed.files)) {
    throw new Error(`Wiki maintenance recovery journal is malformed: ${relativeStorePath(rootDir, journalPath)}`);
  }

  const files = parsed.files.map((file, index) => {
    if (
      typeof file !== "object" ||
      file === null ||
      typeof file.path !== "string" ||
      typeof file.content !== "string"
    ) {
      throw new Error(`Wiki maintenance recovery journal entry ${index} is malformed`);
    }
    return {
      path: resolveStorePath(rootDir, file.path),
      content: file.content,
    };
  });
  await materializeFiles(files);
  await replayWikiMaintenanceAppendEntries(rootDir, parsed.append_entries ?? []);
  await rm(journalPath, { force: true });
}

async function recoverPendingWikiMaintenanceJournals(rootDir: string): Promise<void> {
  const snapshotsDir = resolveStorePath(rootDir, STORAGE_LAYOUT.audits.snapshots);
  const entries = await readdir(snapshotsDir).catch((error) => {
    if (isMissingFileError(error)) return [];
    throw error;
  });
  const journalNames = entries
    .filter((entry) => entry.startsWith(WIKI_MAINTENANCE_RECOVERY_PREFIX) && entry.endsWith(WIKI_MAINTENANCE_RECOVERY_SUFFIX))
    .sort();

  for (const journalName of journalNames) {
    await recoverWikiMaintenanceJournal(rootDir, resolveStorePath(rootDir, `audits/snapshots/${journalName}`));
  }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "wiki-page";
}

function defaultVisibility(input: WikiMaintenanceInput): VisibilityState {
  return input.visibility_state ?? input.source_record?.visibility_state ?? { privacy_scope: "project_private" };
}

function provenance(input: WikiMaintenanceInput, sourceRef: string, evidenceRefs: string[] = []) {
  return {
    source_type: "wiki_maintenance",
    source_ref: sourceRef,
    evidence_refs: unique(evidenceRefs),
    actor_ref: input.actor,
  };
}

function assertAuthenticatedPrincipal(input: WikiMaintenanceInput): void {
  if (!input.authenticated_principal?.actor_ref?.trim()) {
    throw new Error("Wiki maintenance requires an authenticated_principal with actor_ref");
  }
  if (input.authenticated_principal.actor_ref !== input.actor) {
    throw new Error(`Authenticated principal actor_ref ${input.authenticated_principal.actor_ref} must match actor ${input.actor}`);
  }
  if (input.authenticated_principal.kind === "system" && !input.authenticated_principal.system_scope?.trim()) {
    throw new Error("Authenticated system principal requires a non-empty system_scope");
  }
}

function reference(record: { id: string; kind: string; layer: string }): Reference {
  return { id: record.id, kind: record.kind, layer: record.layer as Reference["layer"] };
}

function buildReferenceIndex(records: CoreRecord[]): Map<string, Reference> {
  return new Map(records.map((record) => [record.id, reference(record)]));
}

function resolveTypedReference(ref: string, referencesById: Map<string, Reference>): Reference | undefined {
  return referencesById.get(ref);
}

function buildPage(input: {
  base: WikiMaintenanceInput;
  id: string;
  page_kind: WikiPage["page_kind"];
  title: string;
  path?: string;
  source_refs?: string[];
  canonical_refs?: string[];
  world_refs?: string[];
  wiki_claim_refs?: string[];
  outgoing_links?: string[];
  upstream_refs?: string[];
  index_summary?: string;
  existing?: WikiPage;
}): WikiPage {
  const path = input.path ?? input.existing?.path ?? `wiki/pages/${slugify(input.title)}.md`;
  assertStoreRelativeWikiPagePath(path);
  return {
    id: input.existing?.id ?? input.id,
    kind: "wiki_page",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: input.existing?.created_at ?? input.base.now,
    updated_at: input.base.now,
    visibility_state: input.existing?.visibility_state ?? defaultVisibility(input.base),
    provenance: provenance(input.base, input.upstream_refs?.[0] ?? input.base.ids.run, input.upstream_refs),
    upstream_refs: unique([...(input.existing?.upstream_refs ?? []), ...(input.upstream_refs ?? [])]),
    page_kind: input.page_kind,
    title: input.title,
    path,
    source_refs: unique([...(input.existing?.source_refs ?? []), ...(input.source_refs ?? [])]),
    canonical_refs: unique([...(input.existing?.canonical_refs ?? []), ...(input.canonical_refs ?? [])]),
    world_refs: unique([...(input.existing?.world_refs ?? []), ...(input.world_refs ?? [])]),
    wiki_claim_refs: unique([...(input.existing?.wiki_claim_refs ?? []), ...(input.wiki_claim_refs ?? [])]),
    outgoing_links: unique([...(input.existing?.outgoing_links ?? []), ...(input.outgoing_links ?? [])]),
    incoming_links: input.existing?.incoming_links ?? [],
    index_summary: input.index_summary ?? input.existing?.index_summary,
    quality_score: input.existing?.quality_score ?? 0.8,
    retention_priority: input.existing?.retention_priority ?? "normal",
    staleness_state: "current",
  };
}

function renderMarkdown(page: WikiPage, body: string): string {
  return `# ${page.title}

${body}

---

Kind: ${page.page_kind}
Status: ${page.staleness_state ?? "current"}
Quality: ${page.quality_score ?? "unknown"}
Editorial: wiki pages are not canonical authority.
`;
}

function findExistingPage(existingPages: WikiPage[], id: string | undefined, title: string, path?: string): WikiPage | undefined {
  return existingPages.find((page) => page.id === id) ??
    existingPages.find((page) => path !== undefined && page.path === path) ??
    existingPages.find((page) => page.title.trim().toLowerCase() === title.trim().toLowerCase());
}

function buildClaim(input: {
  base: WikiMaintenanceInput;
  id: string;
  page_ref: string;
  claim: NonNullable<WikiMaintenanceInput["claim"]>;
  existing?: WikiClaim;
}): WikiClaim {
  const existingSourceRefs = input.existing?.source_refs ?? [];
  const existingSupportRefs = input.existing?.support_refs ?? [];
  const source_refs = unique([
    ...existingSourceRefs,
    ...(input.claim.source_refs ?? []),
    ...(input.base.source_record ? [input.base.source_record.id] : []),
  ]);
  const support_refs = unique([
    ...existingSupportRefs,
    ...(input.claim.support_refs ?? []),
    ...source_refs,
  ]);
  const hasNewSourceEvidence = source_refs.some((ref) => !existingSourceRefs.includes(ref));
  const hasNewSupportEvidence = support_refs.some((ref) => !existingSupportRefs.includes(ref));
  const hasNewEvidence = hasNewSourceEvidence || hasNewSupportEvidence;
  return {
    id: input.existing?.id ?? input.id,
    kind: "wiki_claim",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: input.existing?.created_at ?? input.base.now,
    updated_at: input.base.now,
    visibility_state: input.existing?.visibility_state ?? defaultVisibility(input.base),
    provenance: provenance(input.base, input.base.ids.run, support_refs),
    upstream_refs: unique([...(input.existing?.upstream_refs ?? []), ...support_refs]),
    statement: input.claim.statement,
    page_ref: input.page_ref,
    claim_status: input.claim.candidate_for_promotion ? "candidate_for_promotion" : "editorial",
    source_refs,
    support_refs,
    confidence_score: input.claim.confidence_score ?? input.existing?.confidence_score ?? 0.7,
    support_count: support_refs.length,
    last_confirmed_at:
      support_refs.length === 0
        ? (input.existing?.last_confirmed_at ?? null)
        : hasNewSupportEvidence || !input.existing
          ? input.base.now
          : (input.existing?.last_confirmed_at ?? input.base.now),
    last_seen_at:
      hasNewEvidence || !input.existing
        ? input.base.now
        : (input.existing?.last_seen_at ?? input.base.now),
    staleness_state: "current",
    supersedes_ref: input.claim.supersedes_ref ?? input.existing?.supersedes_ref ?? null,
    superseded_by_ref: input.existing?.superseded_by_ref ?? null,
    retention_priority: input.existing?.retention_priority ?? "normal",
    quality_score: input.claim.quality_score ?? input.existing?.quality_score ?? 0.75,
  };
}

function diagnostic(input: {
  base: WikiMaintenanceInput;
  id: string;
  code: string;
  severity: Diagnostic["severity"];
  message: string;
  related_refs: string[];
}): Diagnostic {
  return {
    id: input.id,
    kind: "diagnostic",
    layer: "audits",
    authoritative_home: "governance",
    created_at: input.base.now,
    updated_at: input.base.now,
    visibility_state: defaultVisibility(input.base),
    provenance: provenance(input.base, input.base.ids.run, input.related_refs),
    code: input.code,
    severity: input.severity,
    message: input.message,
    related_refs: unique(input.related_refs),
  };
}

function diagnosticId(input: WikiMaintenanceInput, index: number): string {
  return input.ids.diagnostics?.[index] ?? (index === 0 && input.ids.diagnostic ? input.ids.diagnostic : `${input.ids.run}_diagnostic_${String(index + 1).padStart(2, "0")}`);
}

function buildLintDiagnostics(input: WikiMaintenanceInput, pages: WikiPage[], claims: WikiClaim[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const pageIds = new Set(pages.map((page) => page.id));
  const titleCounts = pages.reduce<Map<string, WikiPage[]>>((counts, page) => {
    const key = page.title.trim().toLowerCase();
    counts.set(key, [...(counts.get(key) ?? []), page]);
    return counts;
  }, new Map());

  for (const page of pages) {
    const isOrphan = page.page_kind !== "index" && page.page_kind !== "log" &&
      page.source_refs.length === 0 &&
      page.canonical_refs.length === 0 &&
      page.world_refs.length === 0 &&
      (page.wiki_claim_refs ?? []).length === 0 &&
      (page.outgoing_links ?? []).length === 0 &&
      (page.incoming_links ?? []).length === 0;
    if (isOrphan) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_orphan_page",
        severity: "warning",
        message: `Wiki page ${page.id} has no upstream or graph links.`,
        related_refs: [page.id],
      }));
    }

    const brokenLinks = (page.outgoing_links ?? []).filter((link) => !pageIds.has(link));
    if (brokenLinks.length > 0) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_broken_link",
        severity: "warning",
        message: `Wiki page ${page.id} links to missing pages: ${brokenLinks.join(", ")}.`,
        related_refs: [page.id, ...brokenLinks],
      }));
    }

    if (input.lint?.stale_before && typeof page.updated_at === "string" && page.updated_at < input.lint.stale_before) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_stale_page",
        severity: "info",
        message: `Wiki page ${page.id} has not been refreshed since ${page.updated_at}.`,
        related_refs: [page.id],
      }));
    }
  }

  for (const [, duplicates] of titleCounts) {
    if (duplicates.length > 1) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_duplicate_title",
        severity: "warning",
        message: `Wiki pages share title "${duplicates[0]?.title ?? ""}".`,
        related_refs: duplicates.map((page) => page.id),
      }));
    }
  }

  for (const claim of claims) {
    if (claim.source_refs.length === 0 && (claim.support_refs ?? []).length === 0) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_unsupported_claim",
        severity: "error",
        message: `Wiki claim ${claim.id} has no upstream support refs.`,
        related_refs: [claim.id, claim.page_ref],
      }));
    }

    if (input.lint?.stale_before && typeof claim.last_seen_at === "string" && claim.last_seen_at < input.lint.stale_before) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_stale_claim",
        severity: "info",
        message: `Wiki claim ${claim.id} has not been seen since ${claim.last_seen_at}.`,
        related_refs: [claim.id],
      }));
    }
  }

  for (const concept of input.lint?.required_concepts ?? []) {
    if (!pages.some((page) => page.title.trim().toLowerCase() === concept.trim().toLowerCase())) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_missing_concept_page",
        severity: "warning",
        message: `Required concept page is missing: ${concept}.`,
        related_refs: [],
      }));
    }
  }

  return diagnostics;
}

async function buildWikiIndexAndLogFiles(
  rootDir: string,
  input: WikiMaintenanceInput,
  pages: WikiPage[],
  claims: WikiClaim[],
  diagnostics: Diagnostic[],
): Promise<MaterializedFile[]> {
  const allPages = await loadWikiPages(rootDir);
  const mergedPages = [...allPages.filter((page) => !pages.some((written) => written.id === page.id)), ...pages]
    .sort((a, b) => a.title.localeCompare(b.title));
  const index = [
    "# Index",
    "",
    ...mergedPages.map((page) => `- [${page.title}](${page.path.replace(/^wiki\//, "")}) (${page.page_kind}; ${page.staleness_state ?? "current"})`),
    "",
  ].join("\n");
  const logPath = resolveStorePath(rootDir, STORAGE_LAYOUT.wiki.log);
  const existingLog = await readFile(logPath, "utf8").catch((error) => {
    if (isMissingFileError(error)) return "# Log\n";
    throw error;
  });
  const logEntry = [
    `- ${input.now} ${input.event} ${input.ids.run}`,
    `  - pages: ${pages.map((page) => page.id).join(", ") || "none"}`,
    `  - claims: ${claims.map((claim) => claim.id).join(", ") || "none"}`,
    `  - diagnostics: ${diagnostics.map((item) => item.id).join(", ") || "none"}`,
  ].join("\n");

  return [
    {
      path: resolveStorePath(rootDir, STORAGE_LAYOUT.wiki.index),
      content: index,
    },
    {
      path: logPath,
      content: `${existingLog.trimEnd()}\n${logEntry}\n`,
    },
  ];
}

function mergeById<T extends { id: string }>(stored: T[], pending: T[] = []): T[] {
  const merged = new Map(stored.map((record) => [record.id, record]));
  for (const record of pending) {
    merged.set(record.id, record);
  }
  return [...merged.values()];
}

async function compileMemoryBrowserFromStoreState(
  rootDir: string,
  input: WikiMaintenanceInput,
  pending?: {
    source_records?: SourceRecord[];
    wiki_pages?: WikiPage[];
    wiki_claims?: WikiClaim[];
    wiki_maintenance_runs?: WikiMaintenanceRun[];
    diagnostics?: Diagnostic[];
  },
): Promise<MemoryBrowserProjectionResult> {
  return compileMemoryBrowserProjection({
    adapter: input.memory_browser_adapter ?? input.memory_browser_read_context?.adapter,
    now: input.now,
    visibility_state: defaultVisibility(input),
    read_context: input.memory_browser_read_context,
    ids: {
      json_artifact: input.ids.browser_json_artifact,
      html_artifact: input.ids.browser_html_artifact,
      manifest: input.ids.browser_manifest,
    },
    source_records: mergeById(await loadSourceRecords(rootDir), pending?.source_records),
    actor_identities: await loadActorIdentities(rootDir),
    runtime_instances: await loadRuntimeInstances(rootDir),
    runtime_sessions: await loadRuntimeSessions(rootDir),
    conversation_threads: await loadConversationThreads(rootDir),
    canonical_records: await loadCanonicalRecords(rootDir),
    world_claims: await loadWorldClaims(rootDir),
    episodes: await loadWorldEpisodes(rootDir),
    entities: await loadWorldEntities(rootDir),
    relations: await loadWorldRelations(rootDir),
    contradictions: await loadWorldContradictions(rootDir),
    contradiction_resolutions: await loadContradictionResolutions(rootDir),
    wiki_pages: mergeById(await loadWikiPages(rootDir), pending?.wiki_pages),
    wiki_claims: mergeById(await loadWikiClaims(rootDir), pending?.wiki_claims),
    wiki_maintenance_runs: mergeById(await loadWikiMaintenanceRuns(rootDir), pending?.wiki_maintenance_runs),
    proposals: await loadProposals(rootDir),
    curation_packets: await loadCurationPackets(rootDir),
    ratification_records: await loadRatificationRecords(rootDir),
    disposition_records: await loadDispositionRecords(rootDir),
    diagnostics: mergeById(await loadDiagnostics(rootDir), pending?.diagnostics),
    projection_artifacts: await loadProjectionArtifacts(rootDir),
    projection_manifests: await loadProjectionManifests(rootDir),
  });
}

async function loadPersistedMemoryBrowserProjection(
  rootDir: string,
  input: WikiMaintenanceInput,
): Promise<MemoryBrowserProjectionResult> {
  const manifest = await readCoreRecord<ProjectionManifest>(
    coreRecordPath(
      rootDir,
      {
        id: input.ids.browser_manifest,
        kind: "projection_manifest",
        layer: "derived",
      } as ProjectionManifest,
    ),
  );
  const artifacts = await Promise.all(
    manifest.artifact_refs.map((artifact_ref) =>
      readCoreRecord<ProjectionArtifact>(
        coreRecordPath(
          rootDir,
          {
            id: artifact_ref,
            kind: "projection_artifact",
            layer: "derived",
            adapter: manifest.adapter,
          } as ProjectionArtifact,
        ),
      ),
    ),
  );
  const jsonArtifact = artifacts.find((artifact) => artifact.artifact_kind === "memory_browser_json");
  const htmlArtifact = artifacts.find((artifact) => artifact.artifact_kind === "memory_browser_html");
  if (!jsonArtifact || !htmlArtifact) {
    throw new Error(`Persisted wiki maintenance run ${input.ids.run} is missing memory browser artifacts`);
  }

  const [json, html] = await Promise.all([
    readFile(resolveProjectionArtifactPath(rootDir, jsonArtifact.path), "utf8"),
    readFile(resolveProjectionArtifactPath(rootDir, htmlArtifact.path), "utf8"),
  ]);
  const snapshot = JSON.parse(json) as Record<string, unknown>;
  const consistency = readMemoryBrowserProjectionConsistency(snapshot);
  if (manifest.snapshot_strategy !== consistency.snapshot_strategy) {
    throw new Error(
      `Persisted wiki maintenance run ${input.ids.run} has memory browser snapshot strategy ${consistency.snapshot_strategy} but manifest declares ${manifest.snapshot_strategy}`,
    );
  }
  if (manifest.boundary_note !== consistency.boundary_note) {
    throw new Error(`Persisted wiki maintenance run ${input.ids.run} has mismatched memory browser boundary_note`);
  }
  if (JSON.stringify(manifest.observed_layer_updates ?? null) !== JSON.stringify(consistency.observed_layer_updates)) {
    throw new Error(`Persisted wiki maintenance run ${input.ids.run} has mismatched memory browser observed_layer_updates`);
  }

  return {
    snapshot,
    json,
    html,
    artifacts,
    manifest,
  };
}

async function canReusePersistedMemoryBrowserProjection(
  rootDir: string,
  input: WikiMaintenanceInput,
): Promise<boolean> {
  const manifest = await readCoreRecord<ProjectionManifest>(
    coreRecordPath(
      rootDir,
      {
        id: input.ids.browser_manifest,
        kind: "projection_manifest",
        layer: "derived",
      } as ProjectionManifest,
    ),
  );

  return (
    projectionManifestMatchesContract({
      manifest,
      adapter: input.memory_browser_adapter ?? input.memory_browser_read_context?.adapter ?? manifest.adapter,
      projection_profile: "memory_browser",
      audience: "memory_browser",
      compiler_version: MEMORY_BROWSER_PROJECTION_COMPILER_VERSION,
      read_policy_version: DEFAULT_PROJECTION_READ_POLICY_VERSION,
      snapshot_strategy: "mixed_state_tolerant",
      require_boundary_metadata: true,
    }) &&
    manifest.artifact_refs.length === 2 &&
    manifest.artifact_refs.includes(input.ids.browser_json_artifact) &&
    manifest.artifact_refs.includes(input.ids.browser_html_artifact)
  );
}

function readProjectionManifestMixedStateBoundary(manifest: ProjectionManifest): WikiMaintenanceBoundaryReceipt {
  if (manifest.snapshot_strategy !== "mixed_state_tolerant") {
    throw new Error(`Projection manifest ${manifest.id} must declare snapshot_strategy=mixed_state_tolerant`);
  }
  if (typeof manifest.boundary_note !== "string" || manifest.boundary_note.length === 0) {
    throw new Error(`Projection manifest ${manifest.id} is missing boundary_note`);
  }
  if (!manifest.observed_layer_updates) {
    throw new Error(`Projection manifest ${manifest.id} is missing observed_layer_updates`);
  }

  return {
    snapshot_strategy: "mixed_state_tolerant",
    boundary_note: manifest.boundary_note,
    observed_layer_updates: manifest.observed_layer_updates,
  };
}

function buildMemoryBrowserFiles(rootDir: string, projection: MemoryBrowserProjectionResult): MaterializedFile[] {
  return [
    {
      path: resolveProjectionArtifactPath(rootDir, projection.artifacts[0]!.path),
      content: projection.json,
    },
    {
      path: resolveProjectionArtifactPath(rootDir, projection.artifacts[1]!.path),
      content: projection.html,
    },
    ...projection.artifacts.map((artifact) => ({
      path: coreRecordPath(rootDir, artifact),
      content: serializeCoreRecordContent(artifact),
    })),
    {
      path: coreRecordPath(rootDir, projection.manifest),
      content: serializeCoreRecordContent(projection.manifest),
    },
  ];
}

function assertNoValidationIssues(issues: ValidationIssue[], scope: string): void {
  if (issues.length > 0) {
    throw new ValidationError(`Invalid ${scope}`, issues);
  }
}

function assertRecordMatches<T>(label: string, expected: T, actual: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Existing wiki maintenance run does not match input: ${label}`);
  }
}

async function assertReusedWikiMaintenanceMatchesInput(input: {
  rootDir: string;
  source_record?: SourceRecord;
  run: WikiMaintenanceRun;
  pages: WikiPage[];
  claims: WikiClaim[];
  diagnostics: Diagnostic[];
  markdowns: PlannedWikiMarkdown[];
  skip_run?: boolean;
}): Promise<void> {
  if (!input.skip_run) {
    assertRecordMatches("run", input.run, await readCoreRecord<WikiMaintenanceRun>(coreRecordPath(input.rootDir, input.run)));
  }
  if (input.source_record) {
    assertRecordMatches("source_record", input.source_record, await readCoreRecord<SourceRecord>(coreRecordPath(input.rootDir, input.source_record)));
  }
  for (const page of input.pages) {
    assertRecordMatches("wiki_page", page, await readCoreRecord<WikiPage>(coreRecordPath(input.rootDir, page)));
  }
  for (const claim of input.claims) {
    assertRecordMatches("wiki_claim", claim, await readCoreRecord<WikiClaim>(coreRecordPath(input.rootDir, claim)));
  }
  for (const diagnosticRecord of input.diagnostics) {
    assertRecordMatches("diagnostic", diagnosticRecord, await readCoreRecord<Diagnostic>(coreRecordPath(input.rootDir, diagnosticRecord)));
  }
  for (const markdown of input.markdowns) {
    const existing = await readFile(resolveStorePath(input.rootDir, markdown.page.path), "utf8");
    const expected = renderMarkdown(markdown.page, markdown.body);
    if (existing !== expected) {
      throw new Error(`Existing wiki maintenance run does not match input: markdown:${markdown.page.id}`);
    }
  }
}

function isEligibleProposalEvidenceRecord(record: CoreRecord): boolean {
  return record.layer === "raw" || record.layer === "world" || record.layer === "canon" || record.layer === "governance";
}

export function buildWikiClaimProposalCandidate(input: WikiClaimProposalCandidateInput): Proposal {
  const supportRefs = unique([...(input.claim.support_refs ?? []), ...input.claim.source_refs]);
  if (supportRefs.length === 0) {
    throw new Error("Wiki claim proposal candidates require upstream support refs.");
  }
  const eligibleRecords = new Map(
    input.upstream_records
      .filter(isEligibleProposalEvidenceRecord)
      .map((record) => [record.id, record]),
  );
  const missingOrIneligibleRefs = supportRefs.filter((ref) => !eligibleRecords.has(ref));
  if (missingOrIneligibleRefs.length > 0) {
    throw new Error(`Wiki claim proposal candidates must dereference eligible upstream source/world/canon/governance records: ${missingOrIneligibleRefs.join(", ")}`);
  }
  const candidateKind = input.candidate_kind ?? "fact";
  return {
    id: input.proposal_id,
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: input.visibility_state ?? input.claim.visibility_state,
    provenance: {
      source_type: "wiki_claim",
      source_ref: input.claim.id,
      evidence_refs: supportRefs,
    },
    operation: "create",
    candidate_kind: candidateKind,
    target_layer: "canon",
    target_ref: null,
    candidate_payload: {
      kind: candidateKind,
      statement: input.claim.statement,
      semantic_slot: input.semantic_slot ?? `wiki:${input.claim.id}`,
      epistemic_state: "confirmed",
      temporal_state: {
        temporal_status: "active",
        valid_from: input.now,
        valid_to: null,
      },
      support_refs: supportRefs,
    },
    reason: input.reason ?? `Promote supported wiki claim ${input.claim.id} through governance.`,
    evidence_refs: supportRefs,
    subject_authority_role: "external",
    promotion_requirement: "none",
    governance_state: "proposed",
  };
}

export async function runWikiMaintenanceToStore(input: WikiMaintenanceInput): Promise<WikiMaintenanceResult> {
  assertAuthenticatedPrincipal(input);
  const rootDir = resolve(input.rootDir);
  await initializeStore(rootDir, input.now);
  return withWikiMaintenanceLock(rootDir, async () => {
    await recoverPendingWikiMaintenanceJournals(rootDir);
    return runWikiMaintenanceToStoreLocked({
      ...input,
      rootDir,
    });
  });
}

async function runWikiMaintenanceToStoreLocked(input: WikiMaintenanceInput): Promise<WikiMaintenanceResult> {
  const existingPages = await loadWikiPages(input.rootDir);
  const existingClaims = await loadWikiClaims(input.rootDir);
  const existingSupportRecords = await Promise.all([
    loadSourceRecords(input.rootDir),
    loadCanonicalRecords(input.rootDir),
    loadWorldClaims(input.rootDir),
    loadProposals(input.rootDir),
  ]);
  const pages: WikiPage[] = [];
  const claims: WikiClaim[] = [];
  const graph_edges: WikiGraphEdge[] = [];
  const markdowns: PlannedWikiMarkdown[] = [];
  let diagnostics: Diagnostic[] = [];

  if (input.event === "source_ingested" || input.event === "page_refreshed") {
    const sourceRefs = input.source_record ? [input.source_record.id] : [];
    if (input.source_record && input.ids.source_page) {
      const sourcePage = buildPage({
        base: input,
        id: input.ids.source_page,
        page_kind: "source",
        title: input.topic?.title ? `${input.topic.title} source` : input.source_record.id,
        source_refs: sourceRefs,
        upstream_refs: sourceRefs,
        index_summary: input.source_summary,
        existing: findExistingPage(existingPages, input.ids.source_page, input.source_record.id),
      });
      pages.push(sourcePage);
      markdowns.push({
        page: sourcePage,
        body: input.source_summary ?? `Source record: ${input.source_record.id}`,
      });
    }

    if (input.topic) {
      const topicPage = buildPage({
        base: input,
        id: input.ids.topic_page ?? `wiki_topic_${slugify(input.topic.title)}`,
        page_kind: "topic",
        title: input.topic.title,
        path: input.topic.path,
        source_refs: sourceRefs,
        upstream_refs: sourceRefs,
        index_summary: input.topic.summary,
        existing: findExistingPage(existingPages, input.ids.topic_page, input.topic.title, input.topic.path),
      });
      pages.push(topicPage);
      markdowns.push({
        page: topicPage,
        body: input.topic.summary,
      });
      if (input.source_record) {
        graph_edges.push({
          edge_type: "summarizes",
          from_ref: reference(topicPage),
          to_ref: reference(input.source_record),
          upstream_refs: sourceRefs,
        });
      }
    }
  }

  if (input.event === "query_captured" && input.query_capture) {
    const title = input.query_capture.title ?? input.query_capture.question;
    const queryPage = buildPage({
      base: input,
      id: input.ids.query_page ?? `wiki_query_${slugify(title)}`,
      page_kind: "query_answer",
      title,
      source_refs: input.query_capture.upstream_refs,
      upstream_refs: input.query_capture.upstream_refs,
      index_summary: input.query_capture.answer,
      existing: findExistingPage(existingPages, input.ids.query_page, title),
    });
    pages.push(queryPage);
    markdowns.push({
      page: queryPage,
      body: `Question: ${input.query_capture.question}\n\n${input.query_capture.answer}`,
    });
  }

  if (input.event === "session_crystallized" && input.session_crystallization) {
    const synthesisPage = buildPage({
      base: input,
      id: input.ids.synthesis_page ?? `wiki_synthesis_${slugify(input.session_crystallization.title)}`,
      page_kind: "synthesis",
      title: input.session_crystallization.title,
      source_refs: input.session_crystallization.upstream_refs,
      upstream_refs: input.session_crystallization.upstream_refs,
      index_summary: input.session_crystallization.summary,
      existing: findExistingPage(existingPages, input.ids.synthesis_page, input.session_crystallization.title),
    });
    pages.push(synthesisPage);
    markdowns.push({
      page: synthesisPage,
      body: input.session_crystallization.summary,
    });
  }

  const supersededClaimPageRef = input.claim?.supersedes_ref
    ? existingClaims.find((claim) => claim.id === input.claim?.supersedes_ref)?.page_ref
    : undefined;
  const claimPageRef = pages.find((page) => page.page_kind === "topic")?.id ??
    pages[0]?.id ??
    supersededClaimPageRef ??
    existingPages[0]?.id;
  if (input.claim && input.ids.claim && claimPageRef) {
    const newClaim = buildClaim({
      base: input,
      id: input.ids.claim,
      page_ref: claimPageRef,
      claim: input.claim,
      existing: existingClaims.find((claim) => claim.id === input.ids.claim),
    });
    claims.push(newClaim);
    const page = pages.find((candidate) => candidate.id === claimPageRef);
    if (page && !(page.wiki_claim_refs ?? []).includes(newClaim.id)) {
      page.wiki_claim_refs = unique([...(page.wiki_claim_refs ?? []), newClaim.id]);
    }

    const referencesById = buildReferenceIndex([
      ...existingSupportRecords.flat(),
      ...existingPages,
      ...existingClaims,
      ...(input.source_record ? [input.source_record] : []),
      ...(input.support_records ?? []),
      ...pages,
      ...claims,
    ]);
    for (const sourceRef of newClaim.support_refs ?? newClaim.source_refs) {
      const toRef = resolveTypedReference(sourceRef, referencesById);
      if (!toRef) {
        diagnostics.push(diagnostic({
          base: input,
          id: diagnosticId(input, diagnostics.length),
          code: "wiki_unresolved_support_ref",
          severity: "warning",
          message: `Wiki claim ${newClaim.id} references support ${sourceRef} without a typed upstream record.`,
          related_refs: [newClaim.id, sourceRef],
        }));
        continue;
      }
      graph_edges.push({
        edge_type: "supports",
        from_ref: reference(newClaim),
        to_ref: toRef,
        upstream_refs: [sourceRef],
      });
    }
  }

  if (input.event === "claim_superseded" && input.claim?.supersedes_ref && input.ids.claim) {
    const oldClaim = existingClaims.find((claim) => claim.id === input.claim?.supersedes_ref);
    if (oldClaim) {
      claims.push({
        ...oldClaim,
        updated_at: input.now,
        claim_status: "superseded",
        staleness_state: "superseded",
        superseded_by_ref: input.ids.claim,
        upstream_refs: unique([...(oldClaim.upstream_refs ?? []), input.ids.claim, input.ids.run]),
      });
      graph_edges.push({
        edge_type: "supersedes",
        from_ref: { id: input.ids.claim, kind: "wiki_claim", layer: "wiki" },
        to_ref: reference(oldClaim),
        upstream_refs: [oldClaim.id, input.ids.claim],
      });
    }
  }

  if (input.event === "lint_run") {
    diagnostics = buildLintDiagnostics(input, existingPages, existingClaims);
  }

  const inputRefs = unique([
    ...(input.source_record ? [input.source_record.id] : []),
    ...pages.flatMap((page) => page.source_refs),
    ...claims.flatMap((claim) => claim.support_refs ?? claim.source_refs),
    ...(input.query_capture?.upstream_refs ?? []),
    ...(input.session_crystallization?.upstream_refs ?? []),
    ...(input.retention_reviewed_refs ?? []),
  ]);
  const pendingRun: WikiMaintenanceRun = {
    id: input.ids.run,
    kind: "wiki_maintenance_run",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: defaultVisibility(input),
    provenance: provenance(input, input.ids.run, inputRefs),
    event: input.event,
    status: diagnostics.some((item) => item.severity === "error" || item.severity === "warning") ? "completed_with_diagnostics" : "completed",
    input_refs: inputRefs,
    page_refs: unique(pages.map((page) => page.id)),
    claim_refs: unique(claims.map((claim) => claim.id)),
    diagnostic_refs: diagnostics.map((item) => item.id),
    graph_edges,
    quality_score: claims[0]?.quality_score ?? pages[0]?.quality_score,
    retention_reviewed_refs: input.retention_reviewed_refs,
    memory_browser_boundary: null,
  };
  const reusedAuthoritative = await readFile(coreRecordPath(input.rootDir, {
    id: input.ids.run,
    kind: "wiki_maintenance_run",
    layer: "wiki",
  } as WikiMaintenanceRun), "utf8")
    .then(() => true)
    .catch((error) => {
      if (isMissingFileError(error)) return false;
      throw error;
    });

  const reusedMemoryBrowser = reusedAuthoritative && await canReusePersistedMemoryBrowserProjection(input.rootDir, input);
  const memory_browser = reusedMemoryBrowser
    ? await loadPersistedMemoryBrowserProjection(input.rootDir, input)
    : await compileMemoryBrowserFromStoreState(input.rootDir, input, {
        source_records: input.source_record ? [input.source_record] : [],
        wiki_pages: pages,
        wiki_claims: claims,
        wiki_maintenance_runs: [pendingRun],
        diagnostics,
      });
  const memory_browser_boundary = readProjectionManifestMixedStateBoundary(memory_browser.manifest);
  const run: WikiMaintenanceRun = {
    ...pendingRun,
    memory_browser_boundary,
  };

  const records: CoreRecord[] = [
    ...pages,
    ...claims,
    ...diagnostics,
    run,
  ];
  const validation_issues = records.flatMap((record) => validateCoreRecord(record));
  assertNoValidationIssues(validation_issues, "wiki maintenance");

  if (reusedAuthoritative) {
    await assertReusedWikiMaintenanceMatchesInput({
      rootDir: input.rootDir,
      source_record: input.source_record,
      run,
      pages,
      claims,
      diagnostics,
      markdowns,
      skip_run: !reusedMemoryBrowser,
    });
  }
  const writeFiles: MaterializedFile[] = [
    ...(!reusedAuthoritative && input.source_record
      ? [{
          path: coreRecordPath(input.rootDir, input.source_record),
          content: serializeCoreRecordContent(input.source_record),
        }]
      : []),
    ...(!reusedAuthoritative
      ? records.map((record) => ({
          path: coreRecordPath(input.rootDir, record),
          content: serializeCoreRecordContent(record),
        }))
      : []),
    ...(!reusedAuthoritative
      ? markdowns.map((markdown) => ({
          path: resolveStorePath(input.rootDir, markdown.page.path),
          content: renderMarkdown(markdown.page, markdown.body),
        }))
      : []),
    ...(!reusedAuthoritative ? await buildWikiIndexAndLogFiles(input.rootDir, input, pages, claims, diagnostics) : []),
    ...(reusedAuthoritative && !reusedMemoryBrowser
      ? [{
          path: coreRecordPath(input.rootDir, run),
          content: serializeCoreRecordContent(run),
        }]
      : []),
    ...(!reusedMemoryBrowser ? buildMemoryBrowserFiles(input.rootDir, memory_browser) : []),
  ];
  const append_entries: WikiMaintenanceAppendEntry[] = !reusedAuthoritative
    ? [
        {
          kind: "validation_log",
          entry: {
            entry_id: `validation:${run.id}:wiki-maintenance`,
            at: input.now,
            scope: input.validation_scope ?? `workflow:wiki:${input.event}`,
            issues: validation_issues,
          },
        },
        {
          kind: "audit_change",
          entry: {
            entry_id: `audit:${run.id}:wiki_maintenance`,
            at: input.now,
            operation: input.event,
            record_id: run.id,
            record_kind: run.kind,
            record_layer: run.layer,
            detail: `Completed wiki maintenance event ${input.event}.`,
            related_refs: unique([...run.page_refs, ...run.claim_refs, ...run.diagnostic_refs, ...run.input_refs]),
          },
        },
      ]
    : [];
  const journalPath = wikiMaintenanceRecoveryJournalPath(input.rootDir, input.ids.run);
  await writeWikiMaintenanceRecoveryJournal(
    journalPath,
    buildWikiMaintenanceRecoveryJournal({
      rootDir: input.rootDir,
      created_at: input.now,
      files: writeFiles,
      append_entries,
    }),
  );
  await materializeFiles(writeFiles);
  await replayWikiMaintenanceAppendEntries(input.rootDir, append_entries);
  await rm(journalPath, { force: true });

  const reused = reusedAuthoritative && reusedMemoryBrowser;
  const storedRun = reusedAuthoritative ? await readCoreRecord<WikiMaintenanceRun>(coreRecordPath(input.rootDir, run)) : run;
  return {
    reused,
    run: storedRun,
    pages,
    claims,
    diagnostics,
    memory_browser,
    validation_issues,
  };
}
