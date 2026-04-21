import { mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { isAbsolute as isPosixAbsolute, normalize as normalizePosix, relative as relativePosix } from "node:path/posix";

import { appendAuditChange, appendValidationLog } from "../audit/log.js";
import { atomicWriteText, isMissingFileError } from "../store/atomic-write.js";
import {
  coreRecordPath,
  initializeStore,
  readCoreRecord,
  writeCoreRecord,
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

async function pathExists(filePath: string): Promise<boolean> {
  return readFile(filePath, "utf8")
    .then(() => true)
    .catch((error) => {
      if (isMissingFileError(error)) return false;
      throw error;
    });
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
  await initializeStore(rootDir, input.now);

  const content_ref = normalizeLegalRawContentRef(input.source.content_ref);
  const attachment_refs = [...new Set(input.source.attachment_refs?.map(normalizeAttachmentRef) ?? [])];
  const source_record = buildSourceRecord(input, content_ref, attachment_refs);
  const runtime_context = buildRuntimeContext(input, source_record);
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

  const reused =
    (await pathExists(paths.source_record)) &&
    (await pathExists(paths.disposition_record)) &&
    (!paths.runtime_instance || (await pathExists(paths.runtime_instance))) &&
    (!paths.runtime_session || (await pathExists(paths.runtime_session))) &&
    (!paths.conversation_thread || (await pathExists(paths.conversation_thread))) &&
    (!paths.observation || (await pathExists(paths.observation))) &&
    (!paths.diagnostic || (await pathExists(paths.diagnostic)));

  if (!reused) {
    await writeTextFile(paths.raw_payload, serializePayload(input, attachment_refs));
    await writeCoreRecord(rootDir, source_record);
    if (runtime_context.runtime_instance) await writeCoreRecord(rootDir, runtime_context.runtime_instance);
    if (runtime_context.runtime_session) await writeCoreRecord(rootDir, runtime_context.runtime_session);
    if (runtime_context.conversation_thread) await writeCoreRecord(rootDir, runtime_context.conversation_thread);
    if (observation) await writeCoreRecord(rootDir, observation);
    if (diagnostic) await writeCoreRecord(rootDir, diagnostic);
    await writeCoreRecord(rootDir, disposition_record);
    await appendValidationLog(rootDir, {
      entry_id: `validation:${disposition_record.id}:non-canonical-intake`,
      at: input.now,
      scope: input.validation_scope ?? `workflow:non-canonical:${input.mode}`,
      issues: validation_issues,
    });
    await appendAuditChange(rootDir, {
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
    });
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
