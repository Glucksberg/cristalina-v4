import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isAbsolute as isPosixAbsolute, normalize as normalizePosix, relative as relativePosix } from "node:path/posix";

import { appendAuditChange, appendValidationLog, type AuditChangeEntry, type ValidationLogEntry } from "../audit/log.js";
import { atomicWriteText, isMissingFileError } from "../store/atomic-write.js";
import {
  coreRecordPath,
  initializeStore,
  readCoreRecord,
} from "../store/io.js";
import type {
  AuthenticatedPrincipal,
  Diagnostic,
  DispositionRecord,
  NonCanonicalIntakeMode,
  Observation,
  ConversationThread,
  RuntimeInstance,
  RuntimeKind,
  RuntimeSession,
  SourceRecord,
} from "../types.js";
import { DISPOSITION_OUTCOME_TARGET_LAYER } from "../types.js";
import { ValidationError, validateCoreRecord, type ValidationIssue } from "../validation.js";

const LEGAL_SOURCE_CONTENT_PREFIXES = [
  "raw/sources/",
  "raw/imports/",
  "raw/attachments/",
] as const;
const LEGAL_SOURCE_CONTENT_ROOTS = [
  "raw/sources",
  "raw/imports",
  "raw/attachments",
] as const;
const LEGAL_ATTACHMENT_ROOT = "raw/attachments";
const NON_CANONICAL_RECOVERY_PREFIX = "recovery-non-canonical-intake-";
const NON_CANONICAL_RECOVERY_SUFFIX = ".json";
const NON_CANONICAL_INTAKE_LOCK_PREFIX = ".non-canonical-intake-";
const NON_CANONICAL_INTAKE_LOCK_SUFFIX = ".lock";
const NON_CANONICAL_INTAKE_LOCK_TIMEOUT_MS = 120_000;
const NON_CANONICAL_INTAKE_LOCK_STALE_MS = 120_000;
const NON_CANONICAL_INTAKE_LOCK_POLL_MS = 25;

export interface NonCanonicalIntakeIds {
  source: string;
  observation?: string;
  runtime_instance?: string;
  runtime_session?: string;
  conversation_thread?: string;
  disposition: string;
  diagnostic?: string;
}

export interface NonCanonicalIntakeInput {
  rootDir: string;
  now: string;
  actor: string;
  authenticated_principal: AuthenticatedPrincipal;
  mode: NonCanonicalIntakeMode;
  ids: NonCanonicalIntakeIds;
  source: {
    source_ref: string;
    content_ref: string;
    source_type: string;
    payload: unknown;
    observed_at?: string;
    speaker_ref?: string | null;
    runtime?: RuntimeKind;
    runtime_ref?: string | null;
    session_ref?: string | null;
    thread_ref?: string | null;
    agent_identity_ref?: string | null;
    owner_identity_ref?: string | null;
    session_objective?: string | null;
    session_summary?: string | null;
    thread_summary?: string | null;
    message_refs?: string[];
    attachment_refs?: string[];
  };
  diagnostic?: {
    code: string;
    severity: Diagnostic["severity"];
    message: string;
  };
  validation_scope?: string;
}

export interface NonCanonicalIntakePaths {
  raw_payload: string;
  source_record: string;
  runtime_instance?: string;
  runtime_session?: string;
  conversation_thread?: string;
  observation?: string;
  disposition_record: string;
  diagnostic?: string;
}

export interface NonCanonicalIntakeRecords {
  source_record: SourceRecord;
  runtime_instance?: RuntimeInstance;
  runtime_session?: RuntimeSession;
  conversation_thread?: ConversationThread;
  observation?: Observation;
  disposition_record: DispositionRecord;
  diagnostic?: Diagnostic;
}

export interface NonCanonicalIntakeResult {
  reused: boolean;
  paths: NonCanonicalIntakePaths;
  records: NonCanonicalIntakeRecords;
  validation_issues: ValidationIssue[];
}

interface MaterializedFile {
  path: string;
  content: string;
}

type NonCanonicalRecoveryJournalAppendEntry =
  | {
      kind: "audit_change";
      entry: AuditChangeEntry;
    }
  | {
      kind: "validation_log";
      entry: ValidationLogEntry;
    };

interface NonCanonicalRecoveryJournal {
  version: 1;
  operation: "non_canonical_intake";
  created_at: string;
  files: Array<{
    relative_path: string;
    content: string;
  }>;
  append_entries: NonCanonicalRecoveryJournalAppendEntry[];
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

function normalizeLegalRawContentRef(contentRef: string): string {
  const normalized = normalizePosix(contentRef.trim());

  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    isPosixAbsolute(normalized)
  ) {
    throw new Error(`Source content_ref must stay within raw/ sources, imports, or attachments: ${contentRef}`);
  }

  const isWithinAllowedRoot = LEGAL_SOURCE_CONTENT_ROOTS.some((root) => {
    const relativePath = relativePosix(root, normalized);
    return (
      relativePath !== "" &&
      relativePath !== "." &&
      relativePath !== ".." &&
      !relativePath.startsWith("../") &&
      !isPosixAbsolute(relativePath)
    );
  });

  if (!isWithinAllowedRoot || !LEGAL_SOURCE_CONTENT_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error(`Source content_ref must stay within raw/ sources, imports, or attachments: ${contentRef}`);
  }

  return normalized;
}

function normalizeAttachmentRef(attachmentRef: string): string {
  const normalized = normalizePosix(attachmentRef.trim());
  const relativePath = relativePosix(LEGAL_ATTACHMENT_ROOT, normalized);
  if (
    normalized.length === 0 ||
    normalized === "." ||
    isPosixAbsolute(normalized) ||
    relativePath === "" ||
    relativePath === "." ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    isPosixAbsolute(relativePath)
  ) {
    throw new Error(`Attachment refs must stay within raw/attachments: ${attachmentRef}`);
  }
  return normalized;
}

function assertAuthenticatedPrincipal(input: NonCanonicalIntakeInput): void {
  if (!input.authenticated_principal?.actor_ref?.trim()) {
    throw new Error("Non-canonical intake requires an authenticated_principal with actor_ref");
  }
  if (input.authenticated_principal.actor_ref !== input.actor) {
    throw new Error(`Authenticated principal actor_ref ${input.authenticated_principal.actor_ref} must match actor ${input.actor}`);
  }
  if (input.authenticated_principal.kind === "system" && !input.authenticated_principal.system_scope?.trim()) {
    throw new Error("Authenticated system principal requires a non-empty system_scope");
  }
}

function serializePayload(input: NonCanonicalIntakeInput, attachment_refs: string[]): string {
  return `${JSON.stringify(
    {
      source_type: input.source.source_type,
      source_ref: input.source.source_ref,
      mode: input.mode,
      authenticated_principal: input.authenticated_principal,
      payload: input.source.payload,
      attachment_refs,
    },
    null,
    2,
  )}\n`;
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await atomicWriteText(filePath, content);
}

async function materializeFiles(files: MaterializedFile[]): Promise<void> {
  for (const file of files) {
    await writeTextFile(file.path, file.content);
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  return readFile(filePath, "utf8")
    .then(() => true)
    .catch((error) => {
      if (isMissingFileError(error)) return false;
      throw error;
    });
}

async function replayAppendEntries(
  rootDir: string,
  entries: NonCanonicalRecoveryJournalAppendEntry[],
): Promise<void> {
  for (const entry of entries) {
    if (entry.kind === "validation_log") {
      await appendValidationLog(rootDir, entry.entry);
      continue;
    }

    await appendAuditChange(rootDir, entry.entry);
  }
}

async function loadDeclaredSourceRecords(rootDir: string): Promise<SourceRecord[]> {
  const sourcesDir = resolveStorePath(rootDir, "raw/sources");
  const entries = await readdir(sourcesDir, { withFileTypes: true }).catch((error) => {
    if (isMissingFileError(error)) return [];
    throw error;
  });
  const records: SourceRecord[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const candidate = JSON.parse(await readFile(join(sourcesDir, entry.name), "utf8")) as Record<string, unknown>;
    if (
      candidate.kind === "source_record" &&
      typeof candidate.id === "string" &&
      typeof candidate.content_ref === "string"
    ) {
      records.push(candidate as unknown as SourceRecord);
    }
  }

  return records;
}

function sourceContentRefCollisionMessage(input: {
  content_ref: string;
  existing_source_id: string;
  source_id: string;
}): string {
  return `Source content_ref ${input.content_ref} is already owned by source_record ${input.existing_source_id}; cannot reuse it for ${input.source_id}`;
}

async function assertSourceContentRefAvailable(rootDir: string, source_record: SourceRecord): Promise<void> {
  const conflictingRecord = (await loadDeclaredSourceRecords(rootDir)).find(
    (record) => record.content_ref === source_record.content_ref && record.id !== source_record.id,
  );
  if (!conflictingRecord) {
    return;
  }

  throw new Error(
    sourceContentRefCollisionMessage({
      content_ref: source_record.content_ref,
      existing_source_id: conflictingRecord.id,
      source_id: source_record.id,
    }),
  );
}

function safeJournalSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "non_canonical_intake";
}

function relativeStorePath(rootDir: string, filePath: string): string {
  const rootPath = resolve(rootDir);
  const targetPath = resolveStorePath(rootDir, filePath);
  return relative(rootPath, targetPath);
}

function recoveryJournalPath(rootDir: string, stableId: string): string {
  return resolveStorePath(
    rootDir,
    `audits/snapshots/${NON_CANONICAL_RECOVERY_PREFIX}${safeJournalSegment(stableId)}${NON_CANONICAL_RECOVERY_SUFFIX}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function nonCanonicalIntakeLockPath(rootDir: string, stableId: string): string {
  return resolveStorePath(
    rootDir,
    `audits/snapshots/${NON_CANONICAL_INTAKE_LOCK_PREFIX}${safeJournalSegment(stableId)}${NON_CANONICAL_INTAKE_LOCK_SUFFIX}`,
  );
}

async function nonCanonicalIntakeLockIsStale(lockPath: string, nowMs: number): Promise<boolean> {
  const lockStat = await stat(lockPath).catch((error) => {
    if (isMissingFileError(error)) return undefined;
    throw error;
  });
  if (!lockStat) {
    return false;
  }
  return nowMs - lockStat.mtimeMs > NON_CANONICAL_INTAKE_LOCK_STALE_MS;
}

async function acquireNonCanonicalIntakeLock(rootDir: string, stableId: string): Promise<() => Promise<void>> {
  const lockPath = nonCanonicalIntakeLockPath(rootDir, stableId);
  const deadline = Date.now() + NON_CANONICAL_INTAKE_LOCK_TIMEOUT_MS;

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
      if (await nonCanonicalIntakeLockIsStale(lockPath, nowMs)) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }

      if (nowMs >= deadline) {
        throw new Error(`Timed out acquiring non-canonical intake lock for ${stableId}`);
      }

      await sleep(NON_CANONICAL_INTAKE_LOCK_POLL_MS);
    }
  }
}

async function withNonCanonicalIntakeLocks<T>(
  rootDir: string,
  stableIds: string[],
  fn: () => Promise<T>,
): Promise<T> {
  const sortedStableIds = [...new Set(stableIds)].sort();
  const releases: Array<() => Promise<void>> = [];

  try {
    for (const stableId of sortedStableIds) {
      releases.push(await acquireNonCanonicalIntakeLock(rootDir, stableId));
    }
    return await fn();
  } finally {
    for (const release of releases.reverse()) {
      await release();
    }
  }
}

function buildRecoveryJournal(input: {
  rootDir: string;
  created_at: string;
  files: MaterializedFile[];
  append_entries: NonCanonicalRecoveryJournalAppendEntry[];
}): NonCanonicalRecoveryJournal {
  return {
    version: 1,
    operation: "non_canonical_intake",
    created_at: input.created_at,
    files: input.files.map((file) => ({
      relative_path: relativeStorePath(input.rootDir, file.path),
      content: file.content,
    })),
    append_entries: input.append_entries,
  };
}

async function writeRecoveryJournal(filePath: string, journal: NonCanonicalRecoveryJournal): Promise<void> {
  await writeTextFile(filePath, `${JSON.stringify(journal, null, 2)}\n`);
}

async function recoverPendingJournal(rootDir: string, filePath: string): Promise<boolean> {
  if (!(await pathExists(filePath))) {
    return false;
  }

  const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<NonCanonicalRecoveryJournal>;
  if (parsed.operation !== "non_canonical_intake" || !Array.isArray(parsed.files)) {
    throw new Error(`Non-canonical intake recovery journal is malformed: ${relativeStorePath(rootDir, filePath)}`);
  }

  const files = parsed.files.map((file, index) => {
    if (
      typeof file !== "object" ||
      file === null ||
      typeof file.relative_path !== "string" ||
      typeof file.content !== "string"
    ) {
      throw new Error(`Non-canonical intake recovery journal entry ${index} is malformed`);
    }
    return {
      path: resolveStorePath(rootDir, file.relative_path),
      content: file.content,
    };
  });

  await materializeFiles(files);
  await replayAppendEntries(rootDir, parsed.append_entries ?? []);
  await rm(filePath, { force: true });
  return true;
}

function definedIntakePaths(paths: NonCanonicalIntakePaths): Array<[string, string]> {
  return [
    ["raw_payload", paths.raw_payload],
    ["source_record", paths.source_record],
    ...(paths.runtime_instance ? [["runtime_instance", paths.runtime_instance] as [string, string]] : []),
    ...(paths.runtime_session ? [["runtime_session", paths.runtime_session] as [string, string]] : []),
    ...(paths.conversation_thread ? [["conversation_thread", paths.conversation_thread] as [string, string]] : []),
    ...(paths.observation ? [["observation", paths.observation] as [string, string]] : []),
    ["disposition_record", paths.disposition_record],
    ...(paths.diagnostic ? [["diagnostic", paths.diagnostic] as [string, string]] : []),
  ];
}

function ownedIntakePaths(paths: NonCanonicalIntakePaths): Array<[string, string]> {
  return [
    ["raw_payload", paths.raw_payload],
    ["source_record", paths.source_record],
    ...(paths.observation ? [["observation", paths.observation] as [string, string]] : []),
    ["disposition_record", paths.disposition_record],
    ...(paths.diagnostic ? [["diagnostic", paths.diagnostic] as [string, string]] : []),
  ];
}

function assertNoPathCollisions(paths: NonCanonicalIntakePaths): void {
  const seen = new Map<string, string>();
  for (const [label, filePath] of definedIntakePaths(paths)) {
    const previous = seen.get(filePath);
    if (previous) {
      throw new Error(`Non-canonical intake paths collide: ${previous} and ${label}`);
    }
    seen.set(filePath, label);
  }
}

async function resetPartiallyMaterializedIntake(paths: NonCanonicalIntakePaths): Promise<void> {
  for (const [, filePath] of ownedIntakePaths(paths)) {
    await rm(filePath, { force: true });
  }
}

function assertRecordMatches<T>(label: string, expected: T, actual: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Existing non-canonical intake does not match input: ${label}`);
  }
}

async function assertReusedIntakeMatchesInput(input: {
  paths: NonCanonicalIntakePaths;
  raw_payload: string;
  source_record: SourceRecord;
  runtime_instance?: RuntimeInstance;
  runtime_session?: RuntimeSession;
  conversation_thread?: ConversationThread;
  observation?: Observation;
  disposition_record: DispositionRecord;
  diagnostic?: Diagnostic;
}): Promise<void> {
  const existingPayload = await readFile(input.paths.raw_payload, "utf8");
  if (existingPayload !== input.raw_payload) {
    throw new Error("Existing non-canonical intake does not match input: raw_payload");
  }
  assertRecordMatches("source_record", input.source_record, await readCoreRecord<SourceRecord>(input.paths.source_record));
  if (input.paths.runtime_instance && input.runtime_instance) {
    assertRecordMatches("runtime_instance", input.runtime_instance, await readCoreRecord<RuntimeInstance>(input.paths.runtime_instance));
  }
  if (input.paths.runtime_session && input.runtime_session) {
    assertRecordMatches("runtime_session", input.runtime_session, await readCoreRecord<RuntimeSession>(input.paths.runtime_session));
  }
  if (input.paths.conversation_thread && input.conversation_thread) {
    assertRecordMatches("conversation_thread", input.conversation_thread, await readCoreRecord<ConversationThread>(input.paths.conversation_thread));
  }
  if (input.paths.observation && input.observation) {
    assertRecordMatches("observation", input.observation, await readCoreRecord<Observation>(input.paths.observation));
  }
  assertRecordMatches("disposition_record", input.disposition_record, await readCoreRecord<DispositionRecord>(input.paths.disposition_record));
  if (input.paths.diagnostic && input.diagnostic) {
    assertRecordMatches("diagnostic", input.diagnostic, await readCoreRecord<Diagnostic>(input.paths.diagnostic));
  }
}

function buildSourceRecord(input: NonCanonicalIntakeInput, content_ref: string, attachment_refs: string[]): SourceRecord {
  return {
    id: input.ids.source,
    kind: "source_record",
    layer: "raw",
    authoritative_home: "raw",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: input.source.source_type,
      source_ref: input.source.source_ref,
      actor_ref: input.actor,
      speaker_ref: input.source.speaker_ref ?? null,
      runtime_ref: input.source.runtime_ref ?? null,
      session_ref: input.source.session_ref ?? null,
      thread_ref: input.source.thread_ref ?? null,
      evidence_refs: attachment_refs,
    },
    content_ref,
    observed_at: input.source.observed_at ?? input.now,
    intake_profile_ref: `non_canonical/${input.mode}`,
    intake_runner_contract_version: "registered_intake_profile.v1",
    semantic_profile_fingerprint: `non_canonical:${input.mode}:${input.source.source_type}`,
  };
}

function buildObservation(input: NonCanonicalIntakeInput, source_record: SourceRecord): Observation | undefined {
  if (input.mode !== "runtime_only") {
    return undefined;
  }
  if (!input.ids.observation) {
    throw new Error("runtime_only intake requires ids.observation");
  }

  return {
    id: input.ids.observation,
    kind: "observation",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: source_record.visibility_state,
    provenance: source_record.provenance,
    summary: typeof input.source.payload === "string" ? input.source.payload : JSON.stringify(input.source.payload),
    epistemic_state: "observed",
    observed_at: source_record.observed_at ?? input.now,
    runtime_instance_ref: input.source.runtime_ref ?? null,
    runtime_session_ref: input.source.session_ref ?? null,
    conversation_thread_ref: input.source.thread_ref ?? null,
  };
}

function buildRuntimeContext(input: NonCanonicalIntakeInput, source_record: SourceRecord): {
  runtime_instance?: RuntimeInstance;
  runtime_session?: RuntimeSession;
  conversation_thread?: ConversationThread;
} {
  if (input.mode !== "runtime_only") {
    return {};
  }

  const runtime_instance_id = input.ids.runtime_instance ?? input.source.runtime_ref;
  const runtime_session_id = input.ids.runtime_session ?? input.source.session_ref;
  const conversation_thread_id = input.ids.conversation_thread ?? input.source.thread_ref;
  if (!runtime_instance_id || !runtime_session_id || !conversation_thread_id) {
    throw new Error("runtime_only intake requires runtime_instance, runtime_session, and conversation_thread ids or refs");
  }

  const runtime = input.source.runtime ?? "generic";
  const runtime_instance: RuntimeInstance = {
    id: runtime_instance_id,
    kind: "runtime_instance",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: source_record.visibility_state,
    provenance: {
      ...source_record.provenance,
      runtime_ref: runtime_instance_id,
    },
    runtime,
    agent_identity_ref: input.source.agent_identity_ref ?? input.actor,
    owner_identity_ref: input.source.owner_identity_ref ?? null,
    status: "active",
  };

  const runtime_session: RuntimeSession = {
    id: runtime_session_id,
    kind: "runtime_session",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: source_record.visibility_state,
    provenance: {
      ...source_record.provenance,
      runtime_ref: runtime_instance.id,
      session_ref: runtime_session_id,
    },
    runtime_instance_ref: runtime_instance.id,
    status: "active",
    objective: input.source.session_objective ?? null,
    summary: input.source.session_summary ?? null,
  };

  const conversation_thread: ConversationThread = {
    id: conversation_thread_id,
    kind: "conversation_thread",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: source_record.visibility_state,
    provenance: {
      ...source_record.provenance,
      runtime_ref: runtime_instance.id,
      session_ref: runtime_session.id,
      thread_ref: conversation_thread_id,
    },
    runtime,
    runtime_instance_ref: runtime_instance.id,
    runtime_session_ref: runtime_session.id,
    message_refs: input.source.message_refs ?? [],
    summary: input.source.thread_summary ?? null,
  };

  return {
    runtime_instance,
    runtime_session,
    conversation_thread,
  };
}

async function reconcilePersistedRuntimeContext(
  rootDir: string,
  context: {
    runtime_instance?: RuntimeInstance;
    runtime_session?: RuntimeSession;
    conversation_thread?: ConversationThread;
  },
): Promise<{
  runtime_instance?: RuntimeInstance;
  runtime_session?: RuntimeSession;
  conversation_thread?: ConversationThread;
}> {
  function latestTimestamp(left?: string | null, right?: string | null): string | null | undefined {
    if (!left) return right;
    if (!right) return left;
    return left >= right ? left : right;
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
    if (existing.id !== record.id || existing.kind !== record.kind || existing.layer !== record.layer) {
      throw new Error(`Existing runtime identity record does not match expected identity: ${record.kind}:${record.id}`);
    }
    if ("runtime_instance_ref" in existing && "runtime_instance_ref" in record && existing.runtime_instance_ref !== record.runtime_instance_ref) {
      throw new Error(`Existing ${record.kind} ${record.id} belongs to runtime_instance ${existing.runtime_instance_ref}, not ${record.runtime_instance_ref}`);
    }
    if ("runtime_session_ref" in existing && "runtime_session_ref" in record && existing.runtime_session_ref !== record.runtime_session_ref) {
      throw new Error(`Existing ${record.kind} ${record.id} belongs to runtime_session ${existing.runtime_session_ref}, not ${record.runtime_session_ref}`);
    }
    if ("runtime" in existing && "runtime" in record && existing.runtime !== record.runtime) {
      throw new Error(`Existing ${record.kind} ${record.id} belongs to runtime ${existing.runtime}, not ${record.runtime}`);
    }

    const preservedRecord: T = {
      ...record,
      created_at: existing.created_at,
      updated_at: latestTimestamp(existing.updated_at, record.updated_at),
      provenance: existing.provenance,
      upstream_refs: existing.upstream_refs ?? record.upstream_refs,
    };

    if (record.kind === "conversation_thread" && existing.kind === "conversation_thread") {
      return {
        ...preservedRecord,
        message_refs: [...new Set([...existing.message_refs, ...record.message_refs])],
      } as T;
    }

    return preservedRecord;
  }

  return {
    runtime_instance: await preserveRuntimeRecord(context.runtime_instance),
    runtime_session: await preserveRuntimeRecord(context.runtime_session),
    conversation_thread: await preserveRuntimeRecord(context.conversation_thread),
  };
}

function buildDiagnostic(input: NonCanonicalIntakeInput, source_record: SourceRecord): Diagnostic | undefined {
  if (input.mode !== "diagnostic_only") {
    return undefined;
  }
  if (!input.ids.diagnostic || !input.diagnostic) {
    throw new Error("diagnostic_only intake requires ids.diagnostic and diagnostic detail");
  }

  return {
    id: input.ids.diagnostic,
    kind: "diagnostic",
    layer: "audits",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: source_record.visibility_state,
    provenance: {
      ...source_record.provenance,
      source_type: "non_canonical_diagnostic",
      evidence_refs: [source_record.id],
    },
    code: input.diagnostic.code,
    severity: input.diagnostic.severity,
    message: input.diagnostic.message,
    related_refs: [source_record.id],
  };
}

function buildDispositionRecord(input: {
  root: NonCanonicalIntakeInput;
  source_record: SourceRecord;
  observation?: Observation;
  diagnostic?: Diagnostic;
}): DispositionRecord {
  const outcome = input.root.mode;
  const input_refs = [
    input.source_record.id,
    ...(input.observation ? [input.observation.id] : []),
  ];

  return {
    id: input.root.ids.disposition,
    kind: "disposition_record",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.root.now,
    updated_at: input.root.now,
    visibility_state: input.source_record.visibility_state,
    provenance: {
      ...input.source_record.provenance,
      evidence_refs: input_refs,
    },
    input_refs,
    outcomes: [outcome],
    target_layers: [DISPOSITION_OUTCOME_TARGET_LAYER[outcome]],
    ...(input.diagnostic ? { diagnostic_refs: [input.diagnostic.id] } : {}),
    reason_codes: [outcome],
  };
}

function assertNoValidationIssues(issues: ValidationIssue[], context: string): void {
  if (issues.length > 0) {
    throw new ValidationError(`Invalid ${context}`, issues);
  }
}

export async function writeNonCanonicalIntakeToStore(
  input: NonCanonicalIntakeInput,
): Promise<NonCanonicalIntakeResult> {
  const rootDir = resolve(input.rootDir);
  assertAuthenticatedPrincipal(input);
  const content_ref = normalizeLegalRawContentRef(input.source.content_ref);
  await initializeStore(rootDir, input.now);
  return withNonCanonicalIntakeLocks(
    rootDir,
    [
      input.ids.disposition,
      `content_ref:${content_ref}`,
      ...runtimeIdentityLockIds(input),
    ],
    () => writeNonCanonicalIntakeToStoreLocked(rootDir, input, content_ref),
  );
}

function runtimeIdentityLockIds(input: NonCanonicalIntakeInput): string[] {
  if (input.mode !== "runtime_only") {
    return [];
  }

  return [
    input.ids.runtime_instance ?? input.source.runtime_ref,
    input.ids.runtime_session ?? input.source.session_ref,
    input.ids.conversation_thread ?? input.source.thread_ref,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => `runtime_identity:${value}`);
}

async function writeNonCanonicalIntakeToStoreLocked(
  rootDir: string,
  input: NonCanonicalIntakeInput,
  normalizedContentRef?: string,
): Promise<NonCanonicalIntakeResult> {
  const content_ref = normalizedContentRef ?? normalizeLegalRawContentRef(input.source.content_ref);
  const attachment_refs = [...new Set(input.source.attachment_refs?.map(normalizeAttachmentRef) ?? [])];
  const source_record = buildSourceRecord(input, content_ref, attachment_refs);
  await assertSourceContentRefAvailable(rootDir, source_record);
  const runtime_context = await reconcilePersistedRuntimeContext(rootDir, buildRuntimeContext(input, source_record));
  const observation = buildObservation(
    {
      ...input,
      source: {
        ...input.source,
        runtime_ref: runtime_context.runtime_instance?.id ?? input.source.runtime_ref,
        session_ref: runtime_context.runtime_session?.id ?? input.source.session_ref,
        thread_ref: runtime_context.conversation_thread?.id ?? input.source.thread_ref,
      },
    },
    source_record,
  );
  const diagnostic = buildDiagnostic(input, source_record);
  const disposition_record = buildDispositionRecord({
    root: input,
    source_record,
    observation,
    diagnostic,
  });

  const paths: NonCanonicalIntakePaths = {
    raw_payload: resolveStorePath(rootDir, source_record.content_ref),
    source_record: coreRecordPath(rootDir, source_record),
    runtime_instance: runtime_context.runtime_instance ? coreRecordPath(rootDir, runtime_context.runtime_instance) : undefined,
    runtime_session: runtime_context.runtime_session ? coreRecordPath(rootDir, runtime_context.runtime_session) : undefined,
    conversation_thread: runtime_context.conversation_thread ? coreRecordPath(rootDir, runtime_context.conversation_thread) : undefined,
    observation: observation ? coreRecordPath(rootDir, observation) : undefined,
    disposition_record: coreRecordPath(rootDir, disposition_record),
    diagnostic: diagnostic ? coreRecordPath(rootDir, diagnostic) : undefined,
  };
  assertNoPathCollisions(paths);
  const journalPath = recoveryJournalPath(rootDir, disposition_record.id);
  await recoverPendingJournal(rootDir, journalPath);

  if ((await pathExists(paths.raw_payload)) && !(await pathExists(paths.source_record))) {
    const persistedRawPayload = await readFile(paths.raw_payload, "utf8");
    const expectedRawPayload = serializePayload(input, attachment_refs);
    if (persistedRawPayload !== expectedRawPayload) {
      throw new Error(
        `Raw payload path ${paths.raw_payload} is already occupied by different evidence; choose a distinct content_ref`,
      );
    }
  }

  const validation_issues = [
    source_record,
    ...(runtime_context.runtime_instance ? [runtime_context.runtime_instance] : []),
    ...(runtime_context.runtime_session ? [runtime_context.runtime_session] : []),
    ...(runtime_context.conversation_thread ? [runtime_context.conversation_thread] : []),
    ...(observation ? [observation] : []),
    disposition_record,
    ...(diagnostic ? [diagnostic] : []),
  ].flatMap((record) => validateCoreRecord(record));
  assertNoValidationIssues(validation_issues, "non-canonical intake");

  const requiredPaths = definedIntakePaths(paths).map(([, filePath]) => filePath);
  const requiredPresence = await Promise.all(requiredPaths.map((filePath) => pathExists(filePath)));
  const hasAnyState = requiredPresence.some(Boolean);
  const hasCompleteState = requiredPresence.every(Boolean);
  if (hasAnyState && !hasCompleteState) {
    await resetPartiallyMaterializedIntake(paths);
  }
  const refreshedPresence = hasAnyState && !hasCompleteState
    ? await Promise.all(requiredPaths.map((filePath) => pathExists(filePath)))
    : requiredPresence;
  const reused = refreshedPresence.every(Boolean);
  const raw_payload = serializePayload(input, attachment_refs);

  if (reused) {
    await assertReusedIntakeMatchesInput({
      paths,
      raw_payload,
      source_record,
      runtime_instance: runtime_context.runtime_instance,
      runtime_session: runtime_context.runtime_session,
      conversation_thread: runtime_context.conversation_thread,
      observation,
      disposition_record,
      diagnostic,
    });
  }

  if (!reused) {
    const files: MaterializedFile[] = [
      {
        path: paths.raw_payload,
        content: raw_payload,
      },
      {
        path: paths.source_record,
        content: `${JSON.stringify(source_record, null, 2)}\n`,
      },
      ...(runtime_context.runtime_instance
        ? [{ path: paths.runtime_instance!, content: `${JSON.stringify(runtime_context.runtime_instance, null, 2)}\n` }]
        : []),
      ...(runtime_context.runtime_session
        ? [{ path: paths.runtime_session!, content: `${JSON.stringify(runtime_context.runtime_session, null, 2)}\n` }]
        : []),
      ...(runtime_context.conversation_thread
        ? [{ path: paths.conversation_thread!, content: `${JSON.stringify(runtime_context.conversation_thread, null, 2)}\n` }]
        : []),
      ...(observation
        ? [{ path: paths.observation!, content: `${JSON.stringify(observation, null, 2)}\n` }]
        : []),
      ...(diagnostic
        ? [{ path: paths.diagnostic!, content: `${JSON.stringify(diagnostic, null, 2)}\n` }]
        : []),
      {
        path: paths.disposition_record,
        content: `${JSON.stringify(disposition_record, null, 2)}\n`,
      },
    ];
    const append_entries: NonCanonicalRecoveryJournalAppendEntry[] = [
      {
        kind: "validation_log",
        entry: {
          entry_id: `validation:${disposition_record.id}:non-canonical-intake`,
          at: input.now,
          scope: input.validation_scope ?? `workflow:non-canonical:${input.mode}`,
          issues: validation_issues,
        },
      },
      {
        kind: "audit_change",
        entry: {
          entry_id: `audit:${disposition_record.id}:non_canonical_intake`,
          at: input.now,
          operation: "record_observation",
          record_id: disposition_record.id,
          record_kind: disposition_record.kind,
          record_layer: disposition_record.layer,
          detail: `Recorded ${input.mode} non-canonical intake without canon proposal.`,
          related_refs: [
            source_record.id,
            ...(runtime_context.runtime_instance ? [runtime_context.runtime_instance.id] : []),
            ...(runtime_context.runtime_session ? [runtime_context.runtime_session.id] : []),
            ...(runtime_context.conversation_thread ? [runtime_context.conversation_thread.id] : []),
            ...(observation ? [observation.id] : []),
            ...(diagnostic ? [diagnostic.id] : []),
          ],
        },
      },
    ];

    await writeRecoveryJournal(
      journalPath,
      buildRecoveryJournal({
        rootDir,
        created_at: input.now,
        files,
        append_entries,
      }),
    );
    await materializeFiles(files);
    await replayAppendEntries(rootDir, append_entries);
    await rm(journalPath, { force: true });
  }

  return {
    reused,
    paths,
    records: {
      source_record: reused ? await readCoreRecord<SourceRecord>(paths.source_record) : source_record,
      runtime_instance: paths.runtime_instance ? await readCoreRecord<RuntimeInstance>(paths.runtime_instance) : runtime_context.runtime_instance,
      runtime_session: paths.runtime_session ? await readCoreRecord<RuntimeSession>(paths.runtime_session) : runtime_context.runtime_session,
      conversation_thread: paths.conversation_thread ? await readCoreRecord<ConversationThread>(paths.conversation_thread) : runtime_context.conversation_thread,
      observation: paths.observation ? await readCoreRecord<Observation>(paths.observation) : observation,
      disposition_record: reused ? await readCoreRecord<DispositionRecord>(paths.disposition_record) : disposition_record,
      diagnostic: paths.diagnostic ? await readCoreRecord<Diagnostic>(paths.diagnostic) : diagnostic,
    },
    validation_issues,
  };
}
