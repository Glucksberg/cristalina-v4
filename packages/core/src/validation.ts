import type {
  ActorIdentity,
  CanonicalMemoryObject,
  ContradictionResolution,
  ConversationThread,
  CoreRecord,
  DispositionRecord,
  ExternalCandidateBatch,
  ExternalRetrievalCandidate,
  Observation,
  Proposal,
  RetrievalCandidate,
  RetrievalQuery,
  RetrievalRecipe,
  RetrievalResult,
  RetrievalSuppressionReason,
  RetrievalTrace,
  RuntimeInstance,
  RuntimeSession,
  SessionResumeReceipt,
  WorkingMemoryCheckpoint,
  SymbolAnchor,
  VectorArtifact,
  WorldClaim,
} from "./types.js";
import { isStoreRelativeWikiPagePath } from "./wiki/path.js";
import {
  ACTOR_KINDS,
  AUTHORITATIVE_HOMES,
  CANONICAL_CLAIM_KINDS,
  CURATION_REVIEW_KINDS,
  DISPOSITION_OUTCOME_REF_REQUIREMENTS,
  DISPOSITION_OUTCOME_TARGET_LAYER,
  DISPOSITION_OUTCOMES,
  CONTRADICTION_RESOLUTION_STATUSES,
  CONTRADICTION_RESOLUTION_STRATEGIES,
  EPISTEMIC_STATES,
  GOVERNANCE_STATES,
  LAYERS,
  MEMORY_OBJECT_KINDS,
  PROPOSAL_OPERATIONS,
  PROJECTION_SNAPSHOT_STRATEGIES,
  RUNTIMES,
  RETRIEVAL_SUPPRESSION_REASONS,
  SESSION_RESUME_RECEIPT_STATUSES,
  SUBJECT_AUTHORITY_ROLES,
  SYMBOL_ANCHOR_LIFECYCLE_STATES,
  TEMPORAL_STATUSES,
  VECTOR_ANN_STRATEGIES,
  VECTOR_BLOB_ENCODINGS,
  VECTOR_ENCODINGS,
  VECTOR_EXPORT_JSONL_ROW_KINDS,
  VECTOR_INDEX_KINDS,
  VECTOR_MAINTENANCE_JOBS,
  VECTOR_METRICS,
  VISIBILITY_SCOPES,
  WIKI_GRAPH_EDGE_TYPES,
  WIKI_MAINTENANCE_EVENTS,
  WIKI_STALENESS_STATES,
} from "./types.js";
import {
  CONTRADICTION_RESOLUTION_SCHEMA_ID,
  DISPOSITION_RECORD_SCHEMA_ID,
  MEMORY_OBJECT_SCHEMA_ID,
  PROJECTION_MANIFEST_SCHEMA_ID,
  RETRIEVAL_CONTRACTS_SCHEMA_ID,
  RUNTIME_IDENTITY_SCHEMA_ID,
  SESSION_RESUME_RECEIPT_SCHEMA_ID,
  SYMBOL_ANCHOR_SCHEMA_ID,
  STORE_MANIFEST_SCHEMA_ID,
  TEMPORAL_WORLD_RECORD_SCHEMA_ID,
  VECTOR_ARTIFACTS_SCHEMA_ID,
  validateAgainstSchema,
} from "./schema-runtime.js";
import type { StoreManifest } from "./store/manifest.js";
import { isStoreRelativeProjectionArtifactPath } from "./adapter-sdk/projection-path.js";

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

const SAFE_RECORD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const WINDOWS_RESERVED_PATH_SEGMENT_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function hasUniqueEntries(value: string[]): boolean {
  return new Set(value).size === value.length;
}

function isEnumValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function pushRequiredString(issues: ValidationIssue[], record: Record<string, unknown>, key: string, path = key): void {
  if (typeof record[key] !== "string" || record[key] === "") {
    issues.push({ path, message: "expected non-empty string" });
  }
}

function pushSafeRecordId(issues: ValidationIssue[], value: unknown, path: string): void {
  if (typeof value !== "string" || value === "") {
    issues.push({ path, message: "expected non-empty string" });
    return;
  }

  if (!SAFE_RECORD_ID_PATTERN.test(value)) {
    issues.push({
      path,
      message: "expected safe record id using only letters, numbers, dot, underscore, and dash",
    });
  }
}

function pushSafePathSegmentRef(issues: ValidationIssue[], value: unknown, path: string): void {
  pushSafeRecordId(issues, value, path);
  if (typeof value !== "string") return;
  if (WINDOWS_RESERVED_PATH_SEGMENT_PATTERN.test(value) || value.endsWith(".")) {
    issues.push({
      path,
      message: "expected safe path segment ref that is not a reserved filename or trailing dot",
    });
  }
}

function pushEnum<T extends string>(
  issues: ValidationIssue[],
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  path = key,
): void {
  if (!isEnumValue(record[key], allowed)) {
    issues.push({ path, message: `expected one of: ${allowed.join(", ")}` });
  }
}

function pushStringArray(issues: ValidationIssue[], record: Record<string, unknown>, key: string, path = key): void {
  if (!isStringArray(record[key])) {
    issues.push({ path, message: "expected string array" });
  }
}

function pushOptionalTimestamp(issues: ValidationIssue[], record: Record<string, unknown>, key: string, path = key): void {
  if (record[key] !== undefined && record[key] !== null && !isIsoTimestamp(record[key])) {
    issues.push({ path, message: "expected ISO-like timestamp or null" });
  }
}

function pushRatio(issues: ValidationIssue[], value: unknown, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    issues.push({ path, message: "expected number between 0 and 1" });
  }
}

function pushReference(issues: ValidationIssue[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "expected reference object" });
    return;
  }

  pushSafeRecordId(issues, value.id, `${path}.id`);

  pushRequiredString(issues, value, "kind", `${path}.kind`);
  pushEnum(issues, value, "layer", LAYERS, `${path}.layer`);
}

function pushAuthenticatedPrincipal(issues: ValidationIssue[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "expected authenticated principal object" });
    return;
  }

  if (!isEnumValue(value.kind, ["owner", "agent", "participant", "system"] as const)) {
    issues.push({ path: `${path}.kind`, message: "expected one of: owner, agent, participant, system" });
  }

  pushRequiredString(issues, value, "actor_ref", `${path}.actor_ref`);

  if (value.kind === "system") {
    pushRequiredString(issues, value, "system_scope", `${path}.system_scope`);
    return;
  }

  if (value.system_scope !== undefined) {
    issues.push({ path: `${path}.system_scope`, message: "non-system principals cannot carry system_scope" });
  }
}

function pushRetrievalSuppressionReasons(
  issues: ValidationIssue[],
  value: unknown,
  path: string,
): RetrievalSuppressionReason[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issues.push({ path, message: "expected retrieval suppression reason array" });
    return undefined;
  }

  const reasons: RetrievalSuppressionReason[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isEnumValue(entry, RETRIEVAL_SUPPRESSION_REASONS)) {
      issues.push({ path: `${path}[${index}]`, message: `expected one of: ${RETRIEVAL_SUPPRESSION_REASONS.join(", ")}` });
      continue;
    }
    reasons.push(entry);
  }
  if (!hasUniqueEntries(reasons)) {
    issues.push({ path, message: "expected unique suppression reasons" });
  }
  return reasons;
}

function pushRetrievalCandidateLegality(issues: ValidationIssue[], value: unknown, path: string): void {
  if (!isRecord(value)) return;

  if (value.can_support_proposal === true) {
    const upstreamPath = path === "$" ? "eligible_upstream_refs" : `${path}.eligible_upstream_refs`;
    if (!isStringArray(value.eligible_upstream_refs) || value.eligible_upstream_refs.length === 0) {
      issues.push({
        path: upstreamPath,
        message: "proposal-supporting retrieval candidates require eligible upstream refs",
      });
    }
  }

  pushRetrievalSuppressionReasons(
    issues,
    value.suppression_reasons,
    path === "$" ? "suppression_reasons" : `${path}.suppression_reasons`,
  );
}

function pushPositiveInteger(issues: ValidationIssue[], value: unknown, path: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    issues.push({ path, message: "expected positive integer" });
  }
}

function pushVectorBlobRef(
  issues: ValidationIssue[],
  value: unknown,
  path: string,
  expectedEncoding?: (typeof VECTOR_BLOB_ENCODINGS)[number],
  expectedDimensions?: unknown,
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "expected vector blob ref object" });
    return;
  }

  pushRequiredString(issues, value, "path", `${path}.path`);
  pushRequiredString(issues, value, "checksum", `${path}.checksum`);
  pushEnum(issues, value, "encoding", VECTOR_BLOB_ENCODINGS, `${path}.encoding`);
  pushRequiredString(issues, value, "generation_id", `${path}.generation_id`);
  pushRequiredString(issues, value, "producing_ref", `${path}.producing_ref`);

  if (expectedEncoding !== undefined && value.encoding !== expectedEncoding) {
    issues.push({ path: `${path}.encoding`, message: `expected ${expectedEncoding}` });
  }

  if (value.dimensions !== undefined) {
    pushPositiveInteger(issues, value.dimensions, `${path}.dimensions`);
  }

  if (
    typeof expectedDimensions === "number" &&
    Number.isInteger(expectedDimensions) &&
    value.dimensions !== undefined &&
    value.dimensions !== expectedDimensions
  ) {
    issues.push({ path: `${path}.dimensions`, message: `expected dimensions to match ${expectedDimensions}` });
  }
}

function validateEnvelope(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return [{ path: "$", message: "expected object" }];
  }

  pushSafeRecordId(issues, value.id, "id");
  pushRequiredString(issues, value, "kind");
  pushEnum(issues, value, "layer", LAYERS);
  pushEnum(issues, value, "authoritative_home", AUTHORITATIVE_HOMES);

  if (!isIsoTimestamp(value.created_at)) {
    issues.push({ path: "created_at", message: "expected ISO-like timestamp" });
  }

  if (value.updated_at !== undefined && value.updated_at !== null && !isIsoTimestamp(value.updated_at)) {
    issues.push({ path: "updated_at", message: "expected ISO-like timestamp or null" });
  }

  if (!isRecord(value.visibility_state)) {
    issues.push({ path: "visibility_state", message: "expected object" });
  } else if (!isEnumValue(value.visibility_state.privacy_scope, VISIBILITY_SCOPES)) {
    issues.push({
      path: "visibility_state.privacy_scope",
      message: `expected one of: ${VISIBILITY_SCOPES.join(", ")}`,
    });
  }

  if (!isRecord(value.provenance)) {
    issues.push({ path: "provenance", message: "expected object" });
  } else {
    pushRequiredString(issues, value.provenance, "source_type", "provenance.source_type");
    pushRequiredString(issues, value.provenance, "source_ref", "provenance.source_ref");

    for (const optionalKey of ["evidence_refs", "actor_ref", "speaker_ref", "runtime_ref", "session_ref", "thread_ref"] as const) {
      const optionalValue = value.provenance[optionalKey];
      if (optionalValue === undefined || optionalValue === null) continue;
      if (optionalKey.endsWith("_refs")) {
        if (!isStringArray(optionalValue)) {
          issues.push({ path: `provenance.${optionalKey}`, message: "expected string array" });
        }
      } else if (typeof optionalValue !== "string") {
        issues.push({ path: `provenance.${optionalKey}`, message: "expected string or null" });
      }
    }
  }

  if (value.upstream_refs !== undefined && !isStringArray(value.upstream_refs)) {
    issues.push({ path: "upstream_refs", message: "expected string array" });
  }

  if (value.temporal_state !== undefined) {
    if (!isRecord(value.temporal_state)) {
      issues.push({ path: "temporal_state", message: "expected object" });
    } else {
      pushEnum(issues, value.temporal_state, "temporal_status", TEMPORAL_STATUSES, "temporal_state.temporal_status");

      if (value.temporal_state.valid_from !== undefined && value.temporal_state.valid_from !== null && !isIsoTimestamp(value.temporal_state.valid_from)) {
        issues.push({ path: "temporal_state.valid_from", message: "expected ISO-like timestamp or null" });
      }

      if (value.temporal_state.valid_to !== undefined && value.temporal_state.valid_to !== null && !isIsoTimestamp(value.temporal_state.valid_to)) {
        issues.push({ path: "temporal_state.valid_to", message: "expected ISO-like timestamp or null" });
      }

      if (
        value.temporal_state.temporal_confidence !== undefined &&
        value.temporal_state.temporal_confidence !== null &&
        typeof value.temporal_state.temporal_confidence !== "number"
      ) {
        issues.push({ path: "temporal_state.temporal_confidence", message: "expected number or null" });
      }
    }
  }

  if (value.epistemic_state !== undefined && !isEnumValue(value.epistemic_state, EPISTEMIC_STATES)) {
    issues.push({ path: "epistemic_state", message: `expected one of: ${EPISTEMIC_STATES.join(", ")}` });
  }

  if (value.governance_state !== undefined && !isEnumValue(value.governance_state, GOVERNANCE_STATES)) {
    issues.push({ path: "governance_state", message: `expected one of: ${GOVERNANCE_STATES.join(", ")}` });
  }

  return issues;
}

function validateObservation(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "observation") issues.push({ path: "kind", message: 'expected "observation"' });
  if (value.layer !== "runtime") issues.push({ path: "layer", message: 'expected "runtime"' });
  if (value.authoritative_home !== "runtime") issues.push({ path: "authoritative_home", message: 'expected "runtime"' });
  pushRequiredString(issues, value, "summary");
  pushEnum(issues, value, "epistemic_state", EPISTEMIC_STATES);
  pushOptionalTimestamp(issues, value, "observed_at");
  if (value.runtime_session_ref !== undefined && value.runtime_session_ref !== null && typeof value.runtime_instance_ref !== "string") {
    issues.push({ path: "runtime_instance_ref", message: "runtime_session_ref requires runtime_instance_ref" });
  }
  if (value.conversation_thread_ref !== undefined && value.conversation_thread_ref !== null) {
    if (typeof value.runtime_instance_ref !== "string") {
      issues.push({ path: "runtime_instance_ref", message: "conversation_thread_ref requires runtime_instance_ref" });
    }
    if (typeof value.runtime_session_ref !== "string") {
      issues.push({ path: "runtime_session_ref", message: "conversation_thread_ref requires runtime_session_ref" });
    }
  }
  return issues;
}

function validateSourceRecord(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "source_record") issues.push({ path: "kind", message: 'expected "source_record"' });
  if (value.layer !== "raw") issues.push({ path: "layer", message: 'expected "raw"' });
  if (value.authoritative_home !== "raw") issues.push({ path: "authoritative_home", message: 'expected "raw"' });
  pushRequiredString(issues, value, "content_ref");
  pushOptionalTimestamp(issues, value, "observed_at");
  return issues;
}

function validateActorIdentity(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "actor_identity") issues.push({ path: "kind", message: 'expected "actor_identity"' });
  if (value.layer !== "canon") issues.push({ path: "layer", message: 'expected "canon"' });
  if (value.authoritative_home !== "canon") issues.push({ path: "authoritative_home", message: 'expected "canon"' });
  pushEnum(issues, value, "actor_kind", ACTOR_KINDS);
  pushRequiredString(issues, value, "label");
  if (isRecord(value.visibility_state) && value.visibility_state.privacy_scope === "runtime_private") {
    issues.push({ path: "visibility_state.privacy_scope", message: 'actor identities cannot be "runtime_private"' });
  }
  if (!isEnumValue(value.status, ["active", "inactive", "archived"] as const)) {
    issues.push({ path: "status", message: 'expected one of: active, inactive, archived' });
  }
  return issues;
}

function validateRuntimeInstance(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "runtime_instance") issues.push({ path: "kind", message: 'expected "runtime_instance"' });
  if (value.layer !== "runtime") issues.push({ path: "layer", message: 'expected "runtime"' });
  if (value.authoritative_home !== "runtime") issues.push({ path: "authoritative_home", message: 'expected "runtime"' });
  pushEnum(issues, value, "runtime", RUNTIMES);
  pushRequiredString(issues, value, "agent_identity_ref");
  if (value.owner_identity_ref !== undefined && value.owner_identity_ref !== null && typeof value.owner_identity_ref !== "string") {
    issues.push({ path: "owner_identity_ref", message: "expected string or null" });
  }
  if (!isEnumValue(value.status, ["active", "paused", "closed"] as const)) {
    issues.push({ path: "status", message: 'expected one of: active, paused, closed' });
  }
  return issues;
}

function validateRuntimeSession(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "runtime_session") issues.push({ path: "kind", message: 'expected "runtime_session"' });
  if (value.layer !== "runtime") issues.push({ path: "layer", message: 'expected "runtime"' });
  if (value.authoritative_home !== "runtime") issues.push({ path: "authoritative_home", message: 'expected "runtime"' });
  pushRequiredString(issues, value, "runtime_instance_ref");
  if (!isEnumValue(value.status, ["active", "paused", "closed"] as const)) {
    issues.push({ path: "status", message: 'expected one of: active, paused, closed' });
  }
  return issues;
}

function validateConversationThread(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "conversation_thread") issues.push({ path: "kind", message: 'expected "conversation_thread"' });
  if (value.layer !== "runtime") issues.push({ path: "layer", message: 'expected "runtime"' });
  if (value.authoritative_home !== "runtime") issues.push({ path: "authoritative_home", message: 'expected "runtime"' });
  pushEnum(issues, value, "runtime", RUNTIMES);
  pushRequiredString(issues, value, "runtime_instance_ref");
  pushRequiredString(issues, value, "runtime_session_ref");
  if (!isStringArray(value.message_refs)) {
    issues.push({ path: "message_refs", message: "expected string array" });
  }
  if (value.summary !== null && typeof value.summary !== "string") {
    issues.push({ path: "summary", message: "expected string or null" });
  }
  return issues;
}

function validateRuntimeMemoryBlock(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "runtime_memory_block") issues.push({ path: "kind", message: 'expected "runtime_memory_block"' });
  if (value.layer !== "runtime") issues.push({ path: "layer", message: 'expected "runtime"' });
  if (value.authoritative_home !== "runtime") issues.push({ path: "authoritative_home", message: 'expected "runtime"' });
  pushRequiredString(issues, value, "name");
  pushRequiredString(issues, value, "description");
  pushRequiredString(issues, value, "content");
  if (!isBoolean(value.read_only)) {
    issues.push({ path: "read_only", message: "expected boolean" });
  }
  return issues;
}

function validateEpisode(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, TEMPORAL_WORLD_RECORD_SCHEMA_ID);
  if (!isRecord(value)) return issues;
  if (value.kind !== "episode") issues.push({ path: "kind", message: 'expected "episode"' });
  if (value.layer !== "world") issues.push({ path: "layer", message: 'expected "world"' });
  if (value.authoritative_home !== "world") issues.push({ path: "authoritative_home", message: 'expected "world"' });
  pushRequiredString(issues, value, "summary");
  pushStringArray(issues, value, "observation_refs");
  if (!isRecord(value.temporal_state)) {
    issues.push({ path: "temporal_state", message: "expected object" });
  }
  return issues;
}

function validateEntity(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, TEMPORAL_WORLD_RECORD_SCHEMA_ID);
  if (!isRecord(value)) return issues;
  if (value.kind !== "entity") issues.push({ path: "kind", message: 'expected "entity"' });
  if (value.layer !== "world") issues.push({ path: "layer", message: 'expected "world"' });
  if (value.authoritative_home !== "world") issues.push({ path: "authoritative_home", message: 'expected "world"' });
  pushRequiredString(issues, value, "entity_kind");
  pushRequiredString(issues, value, "label");
  if (!isEnumValue(value.status, ["active", "inactive", "archived"] as const)) {
    issues.push({ path: "status", message: 'expected one of: active, inactive, archived' });
  }
  return issues;
}

function validateRelation(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, TEMPORAL_WORLD_RECORD_SCHEMA_ID);
  if (!isRecord(value)) return issues;
  if (value.kind !== "relation") issues.push({ path: "kind", message: 'expected "relation"' });
  if (value.layer !== "world") issues.push({ path: "layer", message: 'expected "world"' });
  if (value.authoritative_home !== "world") issues.push({ path: "authoritative_home", message: 'expected "world"' });
  pushReference(issues, value.subject_ref, "subject_ref");
  pushReference(issues, value.object_ref, "object_ref");
  pushRequiredString(issues, value, "relation_type");
  return issues;
}

function validateWorldClaim(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, TEMPORAL_WORLD_RECORD_SCHEMA_ID);
  if (!isRecord(value)) return issues;
  if (value.layer !== "world") issues.push({ path: "layer", message: 'expected "world"' });
  if (value.authoritative_home !== "world") issues.push({ path: "authoritative_home", message: 'expected "world"' });
  if (!isEnumValue(value.kind, CANONICAL_CLAIM_KINDS)) {
    issues.push({ path: "kind", message: "expected world-claim kind" });
  }
  pushRequiredString(issues, value, "statement");
  pushRequiredString(issues, value, "semantic_slot");
  pushEnum(issues, value, "epistemic_state", EPISTEMIC_STATES);
  if (!isRecord(value.temporal_state)) {
    issues.push({ path: "temporal_state", message: "expected object" });
  }
  if (!isStringArray(value.support_refs)) {
    issues.push({ path: "support_refs", message: "expected string array" });
  }
  if (value.governance_state !== undefined) {
    issues.push({ path: "governance_state", message: "world claims cannot carry canonical governance state" });
  }
  return issues;
}

function validateCanonicalMemoryObject(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, MEMORY_OBJECT_SCHEMA_ID);
  if (!isRecord(value)) return issues;
  pushRequiredString(issues, value, "semantic_slot");
  if (
    value.governance_state === "superseded" &&
    isRecord(value.temporal_state)
  ) {
    if (value.temporal_state.temporal_status === "active") {
      issues.push({ path: "temporal_state.temporal_status", message: 'superseded canon records cannot remain "active"' });
    }
    if (value.temporal_state.valid_to === undefined || value.temporal_state.valid_to === null) {
      issues.push({ path: "temporal_state.valid_to", message: "superseded canon records require a closing valid_to timestamp" });
    }
  }
  if (value.supersedes_ref !== undefined && value.supersedes_ref !== null && typeof value.supersedes_ref !== "string") {
    issues.push({ path: "supersedes_ref", message: "expected string or null" });
  }
  if (value.superseded_by_ref !== undefined && value.superseded_by_ref !== null && typeof value.superseded_by_ref !== "string") {
    issues.push({ path: "superseded_by_ref", message: "expected string or null" });
  }
  return issues;
}

function validateProposal(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "proposal") issues.push({ path: "kind", message: 'expected "proposal"' });
  if (value.layer !== "governance") issues.push({ path: "layer", message: 'expected "governance"' });
  if (value.authoritative_home !== "governance") issues.push({ path: "authoritative_home", message: 'expected "governance"' });
  pushEnum(issues, value, "operation", PROPOSAL_OPERATIONS);
  pushRequiredString(issues, value, "candidate_kind");
  if (!isEnumValue(value.target_layer, ["world", "canon", "wiki", "governance"] as const)) {
    issues.push({ path: "target_layer", message: "expected one of: world, canon, wiki, governance" });
  }
  if (value.target_ref !== null && value.target_ref !== undefined) {
    pushReference(issues, value.target_ref, "target_ref");
  }
  if (!isRecord(value.candidate_payload)) {
    issues.push({ path: "candidate_payload", message: "expected object" });
  } else if (value.target_layer === "canon") {
    pushRequiredString(issues, value.candidate_payload, "semantic_slot", "candidate_payload.semantic_slot");
  }
  pushRequiredString(issues, value, "reason");
  if (!isStringArray(value.evidence_refs)) {
    issues.push({ path: "evidence_refs", message: "expected string array" });
  }
  if (value.subject_authority_role !== undefined && !isEnumValue(value.subject_authority_role, SUBJECT_AUTHORITY_ROLES)) {
    issues.push({ path: "subject_authority_role", message: `expected one of: ${SUBJECT_AUTHORITY_ROLES.join(", ")}` });
  }
  if (
    value.promotion_requirement !== undefined &&
    !isEnumValue(value.promotion_requirement, ["none", "owner_ratification_required"] as const)
  ) {
    issues.push({
      path: "promotion_requirement",
      message: "expected one of: none, owner_ratification_required",
    });
  }
  if (!isEnumValue(value.governance_state, ["draft", "proposed", "archived", "rejected"] as const)) {
    issues.push({ path: "governance_state", message: "expected proposal-stage governance state" });
  }
  return issues;
}

function validateCurationPacket(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "curation_packet") issues.push({ path: "kind", message: 'expected "curation_packet"' });
  if (value.layer !== "governance") issues.push({ path: "layer", message: 'expected "governance"' });
  if (value.authoritative_home !== "governance") issues.push({ path: "authoritative_home", message: 'expected "governance"' });
  pushStringArray(issues, value, "proposal_refs");
  if (typeof value.question_count !== "number") {
    issues.push({ path: "question_count", message: "expected number" });
  }
  if (value.review_kind !== undefined && !isEnumValue(value.review_kind, CURATION_REVIEW_KINDS)) {
    issues.push({ path: "review_kind", message: `expected one of: ${CURATION_REVIEW_KINDS.join(", ")}` });
  }
  for (const optionalKey of [
    "ratification_ref",
    "diagnostic_ref",
    "contradiction_ref",
    "contradiction_resolution_ref",
    "source_record_ref",
    "disposition_ref",
    "subject_entity_ref",
    "preference_entity_ref",
    "preference_relation_ref",
    "world_claim_ref",
    "wiki_page_ref",
    "wiki_claim_ref",
    "actor_identity_ref",
    "owner_identity_ref",
    "runtime_instance_ref",
    "runtime_session_ref",
    "conversation_thread_ref",
    "projection_manifest_ref",
  ] as const) {
    const optionalValue = value[optionalKey];
    if (optionalValue !== undefined && optionalValue !== null && typeof optionalValue !== "string") {
      issues.push({ path: optionalKey, message: "expected string or null" });
    }
  }
  if (value.canonical_target_ref !== undefined && value.canonical_target_ref !== null) {
    pushReference(issues, value.canonical_target_ref, "canonical_target_ref");
  }
  if (value.projection_artifact_refs !== undefined && !isStringArray(value.projection_artifact_refs)) {
    issues.push({ path: "projection_artifact_refs", message: "expected string array" });
  }
  if (value.review_kind === "owner_ratification" && (value.canonical_target_ref === undefined || value.canonical_target_ref === null)) {
    issues.push({ path: "canonical_target_ref", message: "owner ratification reviews require canonical_target_ref" });
  }
  if (value.review_kind === "contradiction_manual_review") {
    if (typeof value.contradiction_ref !== "string" || value.contradiction_ref.length === 0) {
      issues.push({ path: "contradiction_ref", message: "manual contradiction reviews require contradiction_ref" });
    }
    if (typeof value.contradiction_resolution_ref !== "string" || value.contradiction_resolution_ref.length === 0) {
      issues.push({
        path: "contradiction_resolution_ref",
        message: "manual contradiction reviews require contradiction_resolution_ref",
      });
    }
  }
  if (!isEnumValue(value.status, ["pending", "answered", "expired", "applied"] as const)) {
    issues.push({ path: "status", message: 'expected one of: pending, answered, expired, applied' });
  }
  return issues;
}

function validateRatificationRecord(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "ratification") issues.push({ path: "kind", message: 'expected "ratification"' });
  if (value.layer !== "governance") issues.push({ path: "layer", message: 'expected "governance"' });
  if (value.authoritative_home !== "governance") issues.push({ path: "authoritative_home", message: 'expected "governance"' });
  pushRequiredString(issues, value, "proposal_ref");
  if (!isEnumValue(value.decision, ["approved", "rejected", "deferred", "expired"] as const)) {
    issues.push({ path: "decision", message: 'expected one of: approved, rejected, deferred, expired' });
  }
  pushRequiredString(issues, value, "actor");
  pushOptionalTimestamp(issues, value, "approved_at");
  pushOptionalTimestamp(issues, value, "rejected_at");
  pushOptionalTimestamp(issues, value, "deferred_at");
  pushOptionalTimestamp(issues, value, "expired_at");
  if (value.decision === "approved" && !isIsoTimestamp(value.approved_at)) {
    issues.push({ path: "approved_at", message: "approved ratifications require approved_at" });
  }
  if (value.decision === "rejected" && !isIsoTimestamp(value.rejected_at)) {
    issues.push({ path: "rejected_at", message: "rejected ratifications require rejected_at" });
  }
  if (value.decision === "deferred" && !isIsoTimestamp(value.deferred_at)) {
    issues.push({ path: "deferred_at", message: "deferred ratifications require deferred_at" });
  }
  if (value.decision === "expired" && !isIsoTimestamp(value.expired_at)) {
    issues.push({ path: "expired_at", message: "expired ratifications require expired_at" });
  }
  if (value.decision !== "approved" && value.approved_at !== undefined) {
    issues.push({ path: "approved_at", message: "only approved ratifications may carry approved_at" });
  }
  if (value.decision !== "rejected" && value.rejected_at !== undefined) {
    issues.push({ path: "rejected_at", message: "only rejected ratifications may carry rejected_at" });
  }
  if (value.decision === "rejected" || value.decision === "expired") {
    if (!isIsoTimestamp(value.deferred_at) && value.deferred_at !== undefined) {
      issues.push({ path: "deferred_at", message: "expected ISO-like timestamp or null" });
    }
  } else if (value.decision !== "deferred" && value.decision !== "approved" && value.deferred_at !== undefined) {
    issues.push({ path: "deferred_at", message: "deferred_at is only valid for deferred ratifications and later terminal closures" });
  }
  if (value.decision !== "expired" && value.expired_at !== undefined) {
    issues.push({ path: "expired_at", message: "only expired ratifications may carry expired_at" });
  }
  if (value.authenticated_principal !== undefined && value.authenticated_principal !== null) {
    pushAuthenticatedPrincipal(issues, value.authenticated_principal, "authenticated_principal");
  }
  return issues;
}

function validateContradiction(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, TEMPORAL_WORLD_RECORD_SCHEMA_ID);
  if (!isRecord(value)) return issues;
  if (value.kind !== "contradiction") issues.push({ path: "kind", message: 'expected "contradiction"' });
  if (value.layer !== "world") issues.push({ path: "layer", message: 'expected "world"' });
  if (value.authoritative_home !== "world") issues.push({ path: "authoritative_home", message: 'expected "world"' });
  pushReference(issues, value.left_ref, "left_ref");
  pushReference(issues, value.right_ref, "right_ref");
  if (!isEnumValue(value.status, ["open", "resolved", "dismissed"] as const)) {
    issues.push({ path: "status", message: 'expected one of: open, resolved, dismissed' });
  }
  if (isRecord(value.left_ref) && isRecord(value.right_ref) && value.left_ref.id === value.right_ref.id) {
    issues.push({ path: "right_ref.id", message: "contradiction sides must point to different records" });
  }
  return issues;
}

function validateContradictionResolution(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, CONTRADICTION_RESOLUTION_SCHEMA_ID);
  if (!isRecord(value)) return issues;
  if (value.kind !== "contradiction_resolution") issues.push({ path: "kind", message: 'expected "contradiction_resolution"' });
  if (value.layer !== "governance") issues.push({ path: "layer", message: 'expected "governance"' });
  if (value.authoritative_home !== "governance") issues.push({ path: "authoritative_home", message: 'expected "governance"' });
  pushRequiredString(issues, value, "contradiction_ref");
  pushEnum(issues, value, "strategy", CONTRADICTION_RESOLUTION_STRATEGIES);
  pushEnum(issues, value, "status", CONTRADICTION_RESOLUTION_STATUSES);
  pushOptionalTimestamp(issues, value, "accepted_at");
  pushOptionalTimestamp(issues, value, "rejected_at");
  pushOptionalTimestamp(issues, value, "applied_at");
  if (value.winning_ref !== undefined && value.winning_ref !== null) {
    pushReference(issues, value.winning_ref, "winning_ref");
  }
  if (value.losing_ref !== undefined && value.losing_ref !== null) {
    pushReference(issues, value.losing_ref, "losing_ref");
  }
  if (isRecord(value.winning_ref) && isRecord(value.losing_ref) && value.winning_ref.id === value.losing_ref.id) {
    issues.push({ path: "losing_ref.id", message: "winning_ref and losing_ref must point to different records" });
  }
  if (
    (value.strategy === "coexist_temporally" || value.strategy === "supersede_existing" || value.strategy === "supersede_candidate") &&
    (value.winning_ref === undefined || value.winning_ref === null || value.losing_ref === undefined || value.losing_ref === null)
  ) {
    issues.push({ path: "winning_ref", message: "selected strategy requires both winning_ref and losing_ref" });
  }
  pushRequiredString(issues, value, "rationale");
  if (value.diagnostic_refs !== undefined && !isStringArray(value.diagnostic_refs)) {
    issues.push({ path: "diagnostic_refs", message: "expected string array" });
  }
  if (value.status === "accepted" && !isIsoTimestamp(value.accepted_at)) {
    issues.push({ path: "accepted_at", message: "accepted resolutions require accepted_at" });
  }
  if (value.status === "rejected" && !isIsoTimestamp(value.rejected_at)) {
    issues.push({ path: "rejected_at", message: "rejected resolutions require rejected_at" });
  }
  if (value.status === "applied") {
    if (!isIsoTimestamp(value.accepted_at)) {
      issues.push({ path: "accepted_at", message: "applied resolutions must preserve accepted_at" });
    }
    if (!isIsoTimestamp(value.applied_at)) {
      issues.push({ path: "applied_at", message: "applied resolutions require applied_at" });
    }
  }
  if (value.status === "proposed" && value.accepted_at !== undefined) {
    issues.push({ path: "accepted_at", message: "proposed resolutions cannot carry accepted_at" });
  }
  if (value.status !== "rejected" && value.rejected_at !== undefined) {
    issues.push({ path: "rejected_at", message: "only rejected resolutions may carry rejected_at" });
  }
  if (value.status !== "applied" && value.applied_at !== undefined) {
    issues.push({ path: "applied_at", message: "only applied resolutions may carry applied_at" });
  }
  return issues;
}

function validateOntologyDefinition(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "ontology_definition") issues.push({ path: "kind", message: 'expected "ontology_definition"' });
  if (value.layer !== "world") issues.push({ path: "layer", message: 'expected "world"' });
  if (value.authoritative_home !== "world") issues.push({ path: "authoritative_home", message: 'expected "world"' });
  if (!isEnumValue(value.mode, ["prescribed", "learned", "hybrid"] as const)) {
    issues.push({ path: "mode", message: 'expected one of: prescribed, learned, hybrid' });
  }
  pushStringArray(issues, value, "entity_types");
  pushStringArray(issues, value, "relation_types");
  return issues;
}

function validatePolicySnapshot(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "policy_snapshot") issues.push({ path: "kind", message: 'expected "policy_snapshot"' });
  if (value.layer !== "governance") issues.push({ path: "layer", message: 'expected "governance"' });
  if (value.authoritative_home !== "governance") issues.push({ path: "authoritative_home", message: 'expected "governance"' });
  pushRequiredString(issues, value, "policy_family");
  pushRequiredString(issues, value, "version");
  if (!isBoolean(value.active)) {
    issues.push({ path: "active", message: "expected boolean" });
  }
  return issues;
}

function validateWikiPage(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "wiki_page") issues.push({ path: "kind", message: 'expected "wiki_page"' });
  if (value.layer !== "wiki") issues.push({ path: "layer", message: 'expected "wiki"' });
  if (value.authoritative_home !== "wiki") issues.push({ path: "authoritative_home", message: 'expected "wiki"' });
  if (!isEnumValue(value.page_kind, ["source", "entity", "topic", "comparison", "synthesis", "analysis", "query_answer", "research_question", "index", "log"] as const)) {
    issues.push({ path: "page_kind", message: "expected legal wiki page kind" });
  }
  pushRequiredString(issues, value, "title");
  pushRequiredString(issues, value, "path");
  if (typeof value.path === "string" && !isStoreRelativeWikiPagePath(value.path)) {
    issues.push({ path: "path", message: "wiki page path must stay within wiki/pages and end with .md" });
  }
  pushStringArray(issues, value, "source_refs");
  pushStringArray(issues, value, "canonical_refs");
  pushStringArray(issues, value, "world_refs");
  for (const optionalArray of ["wiki_claim_refs", "outgoing_links", "incoming_links"] as const) {
    if (value[optionalArray] !== undefined && !isStringArray(value[optionalArray])) {
      issues.push({ path: optionalArray, message: "expected string array" });
    }
  }
  for (const numericKey of ["quality_score"] as const) {
    if (value[numericKey] !== undefined && typeof value[numericKey] !== "number") {
      issues.push({ path: numericKey, message: "expected number" });
    }
  }
  if (value.retention_priority !== undefined && !isEnumValue(value.retention_priority, ["low", "normal", "high"] as const)) {
    issues.push({ path: "retention_priority", message: "expected one of: low, normal, high" });
  }
  if (value.staleness_state !== undefined && !isEnumValue(value.staleness_state, WIKI_STALENESS_STATES)) {
    issues.push({ path: "staleness_state", message: `expected one of: ${WIKI_STALENESS_STATES.join(", ")}` });
  }
  if (value.governance_state !== undefined) {
    issues.push({ path: "governance_state", message: "wiki pages cannot carry canonical governance state" });
  }
  if (value.epistemic_state !== undefined) {
    issues.push({ path: "epistemic_state", message: "wiki pages cannot act as epistemic truth objects" });
  }
  return issues;
}

function validateWikiClaim(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "wiki_claim") issues.push({ path: "kind", message: 'expected "wiki_claim"' });
  if (value.layer !== "wiki") issues.push({ path: "layer", message: 'expected "wiki"' });
  if (value.authoritative_home !== "wiki") issues.push({ path: "authoritative_home", message: 'expected "wiki"' });
  pushRequiredString(issues, value, "statement");
  pushRequiredString(issues, value, "page_ref");
  if (!isEnumValue(value.claim_status, ["editorial", "candidate_for_promotion", "rejected", "stale", "disputed", "superseded"] as const)) {
    issues.push({ path: "claim_status", message: "expected legal wiki claim status" });
  }
  pushStringArray(issues, value, "source_refs");
  if (value.support_refs !== undefined && !isStringArray(value.support_refs)) {
    issues.push({ path: "support_refs", message: "expected string array" });
  }
  for (const numericKey of ["confidence_score", "support_count", "quality_score"] as const) {
    if (value[numericKey] !== undefined && typeof value[numericKey] !== "number") {
      issues.push({ path: numericKey, message: "expected number" });
    }
  }
  for (const timestampKey of ["last_confirmed_at", "last_seen_at"] as const) {
    if (value[timestampKey] !== undefined && value[timestampKey] !== null && !isIsoTimestamp(value[timestampKey])) {
      issues.push({ path: timestampKey, message: "expected ISO-like timestamp or null" });
    }
  }
  if (value.staleness_state !== undefined && !isEnumValue(value.staleness_state, WIKI_STALENESS_STATES)) {
    issues.push({ path: "staleness_state", message: `expected one of: ${WIKI_STALENESS_STATES.join(", ")}` });
  }
  for (const refKey of ["supersedes_ref", "superseded_by_ref"] as const) {
    if (value[refKey] !== undefined && value[refKey] !== null && typeof value[refKey] !== "string") {
      issues.push({ path: refKey, message: "expected string or null" });
    }
  }
  if (value.retention_priority !== undefined && !isEnumValue(value.retention_priority, ["low", "normal", "high"] as const)) {
    issues.push({ path: "retention_priority", message: "expected one of: low, normal, high" });
  }
  if (value.governance_state !== undefined) {
    issues.push({ path: "governance_state", message: "wiki claims cannot carry canonical governance state" });
  }
  if (value.epistemic_state !== undefined) {
    issues.push({ path: "epistemic_state", message: "wiki claims cannot act as epistemic truth objects" });
  }
  if (value.temporal_state !== undefined) {
    issues.push({ path: "temporal_state", message: "wiki claims should reference world/canon temporality instead of defining it" });
  }
  return issues;
}

function validateWikiMaintenanceRun(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "wiki_maintenance_run") issues.push({ path: "kind", message: 'expected "wiki_maintenance_run"' });
  if (value.layer !== "wiki") issues.push({ path: "layer", message: 'expected "wiki"' });
  if (value.authoritative_home !== "wiki") issues.push({ path: "authoritative_home", message: 'expected "wiki"' });
  pushEnum(issues, value, "event", WIKI_MAINTENANCE_EVENTS);
  if (!isEnumValue(value.status, ["completed", "completed_with_diagnostics", "rejected"] as const)) {
    issues.push({ path: "status", message: "expected legal wiki maintenance status" });
  }
  for (const key of ["input_refs", "page_refs", "claim_refs", "diagnostic_refs"] as const) {
    pushStringArray(issues, value, key);
  }
  if (!Array.isArray(value.graph_edges)) {
    issues.push({ path: "graph_edges", message: "expected array" });
  } else {
    value.graph_edges.forEach((edge, index) => {
      if (!isRecord(edge)) {
        issues.push({ path: `graph_edges.${index}`, message: "expected object" });
        return;
      }
      pushEnum(issues, edge, "edge_type", WIKI_GRAPH_EDGE_TYPES, `graph_edges.${index}.edge_type`);
      pushReference(issues, edge.from_ref, `graph_edges.${index}.from_ref`);
      pushReference(issues, edge.to_ref, `graph_edges.${index}.to_ref`);
      if (!isStringArray(edge.upstream_refs)) {
        issues.push({ path: `graph_edges.${index}.upstream_refs`, message: "expected string array" });
      }
    });
  }
  if (value.quality_score !== undefined && typeof value.quality_score !== "number") {
    issues.push({ path: "quality_score", message: "expected number" });
  }
  if (value.retention_reviewed_refs !== undefined && !isStringArray(value.retention_reviewed_refs)) {
    issues.push({ path: "retention_reviewed_refs", message: "expected string array" });
  }
  if (value.memory_browser_boundary !== undefined && value.memory_browser_boundary !== null) {
    if (!isRecord(value.memory_browser_boundary)) {
      issues.push({ path: "memory_browser_boundary", message: "expected object" });
    } else {
      if (value.memory_browser_boundary.snapshot_strategy !== "mixed_state_tolerant") {
        issues.push({
          path: "memory_browser_boundary.snapshot_strategy",
          message: 'expected "mixed_state_tolerant"',
        });
      }
      if (
        typeof value.memory_browser_boundary.boundary_note !== "string" ||
        value.memory_browser_boundary.boundary_note.length === 0
      ) {
        issues.push({ path: "memory_browser_boundary.boundary_note", message: "expected non-empty string" });
      }
      if (!isRecord(value.memory_browser_boundary.observed_layer_updates)) {
        issues.push({ path: "memory_browser_boundary.observed_layer_updates", message: "expected object" });
      } else {
        for (const key of ["raw", "runtime", "world", "canon", "wiki", "governance", "derived", "audits"] as const) {
          const observedAt = value.memory_browser_boundary.observed_layer_updates[key];
          if (observedAt !== null && typeof observedAt !== "string") {
            issues.push({
              path: `memory_browser_boundary.observed_layer_updates.${key}`,
              message: "expected string or null",
            });
          }
        }
      }
    }
  }
  return issues;
}

function validateProjectionArtifact(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "projection_artifact") issues.push({ path: "kind", message: 'expected "projection_artifact"' });
  if (value.layer !== "derived") issues.push({ path: "layer", message: 'expected "derived"' });
  if (!isEnumValue(value.adapter, ["openclaw", "hermes"] as const)) {
    issues.push({ path: "adapter", message: 'expected one of: openclaw, hermes' });
  }
  pushRequiredString(issues, value, "artifact_kind");
  pushRequiredString(issues, value, "path");
  if (typeof value.path === "string" && !isStoreRelativeProjectionArtifactPath(value.path)) {
    issues.push({ path: "path", message: "projection artifacts must use a store-relative path inside derived storage" });
  }
  pushEnum(issues, value, "source_layer", LAYERS);
  if (!isStringArray(value.upstream_refs)) {
    issues.push({ path: "upstream_refs", message: "expected string array" });
  }
  return issues;
}

function validateProjectionManifest(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, PROJECTION_MANIFEST_SCHEMA_ID);
  if (!isRecord(value)) return issues;
  for (const optionalKey of ["actor_identity_ref", "owner_identity_ref", "runtime_instance_ref", "runtime_session_ref", "conversation_thread_ref"] as const) {
    const optionalValue = value[optionalKey];
    if (optionalValue !== undefined && optionalValue !== null && typeof optionalValue !== "string") {
      issues.push({ path: optionalKey, message: "expected string or null" });
    }
  }
  if (value.policy_snapshot_ref !== undefined && value.policy_snapshot_ref !== null && typeof value.policy_snapshot_ref !== "string") {
    issues.push({ path: "policy_snapshot_ref", message: "expected string or null" });
  }
  pushRequiredString(issues, value, "compiler_version");
  for (const optionalStringKey of ["source_checkpoint_ref", "continuity_epoch"] as const) {
    const optionalValue = value[optionalStringKey];
    if (optionalValue !== undefined && optionalValue !== null && typeof optionalValue !== "string") {
      issues.push({ path: optionalStringKey, message: "expected string or null" });
    }
  }
  if (value.generation !== undefined && value.generation !== null) {
    if (typeof value.generation !== "number" || !Number.isInteger(value.generation) || value.generation < 0) {
      issues.push({ path: "generation", message: "expected non-negative integer or null" });
    }
  }
  if (typeof value.snapshot_strategy !== "string") {
    issues.push({
      path: "snapshot_strategy",
      message: "projection manifests require snapshot_strategy",
    });
  } else if (!isEnumValue(value.snapshot_strategy, PROJECTION_SNAPSHOT_STRATEGIES)) {
    issues.push({
      path: "snapshot_strategy",
      message: `expected one of: ${PROJECTION_SNAPSHOT_STRATEGIES.join(", ")}`,
    });
  }
  const hasSourceCheckpointRef = typeof value.source_checkpoint_ref === "string" && value.source_checkpoint_ref.length > 0;
  const hasContinuityEpoch = typeof value.continuity_epoch === "string" && value.continuity_epoch.length > 0;
  const hasGeneration = typeof value.generation === "number" && Number.isInteger(value.generation) && value.generation >= 0;
  if (value.snapshot_strategy === "checkpoint_consistent") {
    if (!hasSourceCheckpointRef) {
      issues.push({
        path: "source_checkpoint_ref",
        message: "checkpoint_consistent manifests require source_checkpoint_ref",
      });
    }
    if (!hasContinuityEpoch) {
      issues.push({
        path: "continuity_epoch",
        message: "checkpoint_consistent manifests require continuity_epoch",
      });
    }
    if (!hasGeneration) {
      issues.push({
        path: "generation",
        message: "checkpoint_consistent manifests require generation",
      });
    }
  } else if (hasSourceCheckpointRef || hasContinuityEpoch || hasGeneration) {
    issues.push({
      path: "snapshot_strategy",
      message: "source_checkpoint_ref, continuity_epoch, and generation require checkpoint_consistent snapshot strategy",
    });
  }
  if (!isStringArray(value.context_refs) || !hasUniqueEntries(value.context_refs)) {
    issues.push({ path: "context_refs", message: "expected unique string array" });
  }
  const declaredContextRefs = [
    value.actor_identity_ref,
    value.owner_identity_ref,
    value.runtime_instance_ref,
    value.runtime_session_ref,
    value.conversation_thread_ref,
  ].filter((entry): entry is string => typeof entry === "string");
  if (isStringArray(value.context_refs)) {
    for (const ref of declaredContextRefs) {
      if (!value.context_refs.includes(ref)) {
        issues.push({ path: "context_refs", message: `missing declared context ref: ${ref}` });
      }
    }
  }
  if (value.suppressed_refs !== undefined && (!isStringArray(value.suppressed_refs) || !hasUniqueEntries(value.suppressed_refs))) {
    issues.push({ path: "suppressed_refs", message: "expected unique string array" });
  }
  let suppressedRecordIds: string[] | undefined;
  if (value.suppressed_records !== undefined) {
    if (!Array.isArray(value.suppressed_records)) {
      issues.push({ path: "suppressed_records", message: "expected array" });
    } else {
      suppressedRecordIds = [];
      for (const [index, entry] of value.suppressed_records.entries()) {
        if (!isRecord(entry)) {
          issues.push({ path: `suppressed_records[${index}]`, message: "expected object" });
          continue;
        }
        pushRequiredString(issues, entry, "id", `suppressed_records[${index}].id`);
        pushRequiredString(issues, entry, "kind", `suppressed_records[${index}].kind`);
        pushRequiredString(issues, entry, "reason_code", `suppressed_records[${index}].reason_code`);
        if (typeof entry.id === "string" && entry.id.length > 0) {
          suppressedRecordIds.push(entry.id);
        }
      }
    }
  }
  if ((value.suppressed_refs === undefined) !== (value.suppressed_records === undefined)) {
    issues.push({
      path: value.suppressed_refs === undefined ? "suppressed_refs" : "suppressed_records",
      message: "suppressed_refs and suppressed_records must appear together",
    });
  }
  if (isStringArray(value.suppressed_refs) && suppressedRecordIds) {
    const suppressedRefSet = new Set(value.suppressed_refs);
    const suppressedRecordSet = new Set(suppressedRecordIds);
    for (const ref of suppressedRefSet) {
      if (!suppressedRecordSet.has(ref)) {
        issues.push({ path: "suppressed_refs", message: `missing suppressed_record for ref: ${ref}` });
      }
    }
    for (const ref of suppressedRecordSet) {
      if (!suppressedRefSet.has(ref)) {
        issues.push({ path: "suppressed_records", message: `missing suppressed_ref for record: ${ref}` });
      }
    }
  }
  for (const optionalUniqueRefKey of [
    "retrieval_trace_refs",
    "included_retrieval_candidate_refs",
    "suppressed_retrieval_candidate_refs",
  ] as const) {
    if (value[optionalUniqueRefKey] !== undefined && (!isStringArray(value[optionalUniqueRefKey]) || !hasUniqueEntries(value[optionalUniqueRefKey]))) {
      issues.push({ path: optionalUniqueRefKey, message: "expected unique string array" });
    }
  }
  if (value.retrieval_traces !== undefined) {
    if (!Array.isArray(value.retrieval_traces)) {
      issues.push({ path: "retrieval_traces", message: "expected array" });
    } else {
      for (const [index, trace] of value.retrieval_traces.entries()) {
        const tracePath = `retrieval_traces[${index}]`;
        if (!isRecord(trace)) {
          issues.push({ path: tracePath, message: "expected object" });
          continue;
        }
        if (trace.trace_ref !== undefined && typeof trace.trace_ref !== "string") {
          issues.push({ path: `${tracePath}.trace_ref`, message: "expected string" });
        }
        pushRequiredString(issues, trace, "query_ref", `${tracePath}.query_ref`);
        pushRequiredString(issues, trace, "recipe_ref", `${tracePath}.recipe_ref`);
        pushRequiredString(issues, trace, "read_policy_version", `${tracePath}.read_policy_version`);
        if (!isStringArray(trace.included_candidate_refs) || !hasUniqueEntries(trace.included_candidate_refs)) {
          issues.push({ path: `${tracePath}.included_candidate_refs`, message: "expected unique string array" });
        }
        if (!isStringArray(trace.suppressed_candidate_refs) || !hasUniqueEntries(trace.suppressed_candidate_refs)) {
          issues.push({ path: `${tracePath}.suppressed_candidate_refs`, message: "expected unique string array" });
        }
        if (!Array.isArray(trace.suppression_reasons)) {
          issues.push({ path: `${tracePath}.suppression_reasons`, message: "expected retrieval suppression reason array" });
        } else {
          trace.suppression_reasons.forEach((reason, reasonIndex) => {
            if (!isEnumValue(reason, RETRIEVAL_SUPPRESSION_REASONS)) {
              issues.push({
                path: `${tracePath}.suppression_reasons[${reasonIndex}]`,
                message: `expected one of: ${RETRIEVAL_SUPPRESSION_REASONS.join(", ")}`,
              });
            }
          });
        }
      }
    }
  }
  if (Array.isArray(value.retrieval_traces)) {
    const traceRefs = new Set<string>();
    const includedCandidateRefs = new Set<string>();
    const suppressedCandidateRefs = new Set<string>();

    for (const trace of value.retrieval_traces) {
      if (!isRecord(trace)) continue;
      if (typeof trace.trace_ref === "string") traceRefs.add(trace.trace_ref);
      if (isStringArray(trace.included_candidate_refs)) {
        for (const ref of trace.included_candidate_refs) includedCandidateRefs.add(ref);
      }
      if (isStringArray(trace.suppressed_candidate_refs)) {
        for (const ref of trace.suppressed_candidate_refs) suppressedCandidateRefs.add(ref);
      }
    }

    for (const [field, expectedRefs] of [
      ["retrieval_trace_refs", traceRefs],
      ["included_retrieval_candidate_refs", includedCandidateRefs],
      ["suppressed_retrieval_candidate_refs", suppressedCandidateRefs],
    ] as const) {
      if (!isStringArray(value[field])) continue;
      const declaredRefs = new Set(value[field]);
      for (const ref of expectedRefs) {
        if (!declaredRefs.has(ref)) {
          issues.push({ path: field, message: `missing retrieval metadata ref: ${ref}` });
        }
      }
      for (const ref of declaredRefs) {
        if (!expectedRefs.has(ref)) {
          issues.push({ path: field, message: `retrieval metadata did not declare ref: ${ref}` });
        }
      }
    }
  }
  if (value.diagnostic_refs !== undefined && !isStringArray(value.diagnostic_refs)) {
    issues.push({ path: "diagnostic_refs", message: "expected string array" });
  }
  if (value.review_refs !== undefined && !isStringArray(value.review_refs)) {
    issues.push({ path: "review_refs", message: "expected string array" });
  }
  if (!isStringArray(value.upstream_refs) || value.upstream_refs.length === 0) {
    issues.push({ path: "upstream_refs", message: "expected non-empty string array" });
  }
  if (!isStringArray(value.artifact_refs) || !hasUniqueEntries(value.artifact_refs)) {
    issues.push({ path: "artifact_refs", message: "expected unique string array" });
  }
  return issues;
}

function validateDiagnostic(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "diagnostic") issues.push({ path: "kind", message: 'expected "diagnostic"' });
  if (value.layer !== "audits") issues.push({ path: "layer", message: 'expected "audits"' });
  if (value.authoritative_home !== "governance") issues.push({ path: "authoritative_home", message: 'expected "governance"' });
  pushRequiredString(issues, value, "code");
  if (!isEnumValue(value.severity, ["info", "warning", "error"] as const)) {
    issues.push({ path: "severity", message: 'expected one of: info, warning, error' });
  }
  pushRequiredString(issues, value, "message");
  pushStringArray(issues, value, "related_refs");
  return issues;
}

function validateDispositionRecordInternal(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, DISPOSITION_RECORD_SCHEMA_ID);
  if (!isRecord(value)) return issues;
  if (!isStringArray(value.input_refs) || !hasUniqueEntries(value.input_refs)) {
    issues.push({ path: "input_refs", message: "expected unique string array" });
  }
  if (Array.isArray(value.outcomes) && !hasUniqueEntries(value.outcomes.filter((entry): entry is string => typeof entry === "string"))) {
    issues.push({ path: "outcomes", message: "expected unique outcomes" });
  }
  if (Array.isArray(value.target_layers) && !hasUniqueEntries(value.target_layers.filter((entry): entry is string => typeof entry === "string"))) {
    issues.push({ path: "target_layers", message: "expected unique target layers" });
  }
  if (isStringArray(value.reason_codes) && !hasUniqueEntries(value.reason_codes)) {
    issues.push({ path: "reason_codes", message: "expected unique reason codes" });
  }
  if (isStringArray(value.outcomes) && isStringArray(value.target_layers)) {
    for (const outcome of value.outcomes) {
      if (!isEnumValue(outcome, DISPOSITION_OUTCOMES)) continue;

      const requiredTarget = DISPOSITION_OUTCOME_TARGET_LAYER[outcome];
      if (!value.target_layers.includes(requiredTarget)) {
        issues.push({
          path: "target_layers",
          message: `${outcome} requires target layer ${requiredTarget}`,
        });
      }

      const requiredRefField = DISPOSITION_OUTCOME_REF_REQUIREMENTS[outcome];
      if (requiredRefField) {
        const refs = value[requiredRefField];
        if (!isStringArray(refs) || refs.length === 0) {
          issues.push({
            path: requiredRefField,
            message: `${outcome} requires ${requiredRefField}`,
          });
        }
      }
    }
  }

  const outcomeValues = isStringArray(value.outcomes) ? value.outcomes : undefined;

  if (value.proposal_refs !== undefined && isStringArray(value.proposal_refs) && !outcomeValues?.includes("proposal_for_canon")) {
    issues.push({ path: "proposal_refs", message: "proposal_refs require proposal_for_canon outcome" });
  }
  if (value.diagnostic_refs !== undefined && isStringArray(value.diagnostic_refs) && !outcomeValues?.includes("diagnostic_only")) {
    issues.push({ path: "diagnostic_refs", message: "diagnostic_refs require diagnostic_only outcome" });
  }
  return issues;
}

function validateGenericRecord(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  return issues;
}

function validateWorkingMemoryCheckpoint(value: unknown): ValidationIssue[] {
  const issues = validateEnvelope(value);
  if (!isRecord(value)) return issues;
  if (value.kind !== "working_memory_checkpoint") issues.push({ path: "kind", message: 'expected "working_memory_checkpoint"' });
  if (value.layer !== "runtime") issues.push({ path: "layer", message: 'expected "runtime"' });
  if (value.authoritative_home !== "runtime") issues.push({ path: "authoritative_home", message: 'expected "runtime"' });
  pushSafePathSegmentRef(issues, value.runtime_instance_ref, "runtime_instance_ref");
  pushSafePathSegmentRef(issues, value.runtime_session_ref, "runtime_session_ref");
  pushSafePathSegmentRef(issues, value.conversation_thread_ref, "conversation_thread_ref");
  pushSafePathSegmentRef(issues, value.continuity_epoch, "continuity_epoch");
  pushRequiredString(issues, value, "read_policy_version");
  pushPositiveInteger(issues, value.generation, "generation");
  if (!isStringArray(value.upstream_refs) || value.upstream_refs.length === 0 || !hasUniqueEntries(value.upstream_refs)) {
    issues.push({ path: "upstream_refs", message: "working memory checkpoints require unique upstream refs" });
  }
  if (!isEnumValue(value.status, ["active", "superseded", "invalidated"] as const)) {
    issues.push({ path: "status", message: "expected legal working memory checkpoint status" });
  }
  if (value.status === "active" && value.superseded_by_ref !== undefined && value.superseded_by_ref !== null) {
    issues.push({ path: "superseded_by_ref", message: "active checkpoints cannot point at a superseding checkpoint" });
  }
  if (value.status === "superseded" && (typeof value.superseded_by_ref !== "string" || value.superseded_by_ref.length === 0)) {
    issues.push({ path: "superseded_by_ref", message: "superseded checkpoints require superseded_by_ref" });
  }
  return issues;
}

function validateSessionResumeReceipt(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, SESSION_RESUME_RECEIPT_SCHEMA_ID);
  if (!isRecord(value)) return issues;
  if (value.kind !== "session_resume_receipt") issues.push({ path: "kind", message: 'expected "session_resume_receipt"' });
  if (value.layer !== "audits") issues.push({ path: "layer", message: 'expected "audits"' });
  if (value.authoritative_home !== "governance") issues.push({ path: "authoritative_home", message: 'expected "governance"' });
  pushSafeRecordId(issues, value.receipt_key, "receipt_key");
  pushEnum(issues, value, "receipt_status", SESSION_RESUME_RECEIPT_STATUSES);
  pushEnum(issues, value, "adapter", ["openclaw", "hermes"] as const);
  pushSafePathSegmentRef(issues, value.projection_manifest_ref, "projection_manifest_ref");
  pushSafePathSegmentRef(issues, value.checkpoint_ref, "checkpoint_ref");
  pushSafePathSegmentRef(issues, value.runtime_instance_ref, "runtime_instance_ref");
  pushSafePathSegmentRef(issues, value.runtime_session_ref, "runtime_session_ref");
  pushSafePathSegmentRef(issues, value.conversation_thread_ref, "conversation_thread_ref");
  pushSafePathSegmentRef(issues, value.continuity_epoch, "continuity_epoch");
  pushRequiredString(issues, value, "read_policy_version");
  pushPositiveInteger(issues, value.generation, "generation");
  if (value.policy_snapshot_ref !== undefined && value.policy_snapshot_ref !== null && typeof value.policy_snapshot_ref !== "string") {
    issues.push({ path: "policy_snapshot_ref", message: "expected string or null" });
  }
  if (typeof value.compiler_version !== "string" || value.compiler_version.length === 0) {
    issues.push({ path: "compiler_version", message: "session resume receipts require compiler_version" });
  }
  if (
    !isStringArray(value.projection_artifact_refs) ||
    value.projection_artifact_refs.length === 0 ||
    !hasUniqueEntries(value.projection_artifact_refs)
  ) {
    issues.push({ path: "projection_artifact_refs", message: "session resume receipts require unique projection artifact refs" });
  }
  if (!isStringArray(value.upstream_refs) || value.upstream_refs.length === 0 || !hasUniqueEntries(value.upstream_refs)) {
    issues.push({ path: "upstream_refs", message: "session resume receipts require unique upstream refs" });
  }
  if (value.authenticated_principal === undefined || value.authenticated_principal === null) {
    issues.push({ path: "authenticated_principal", message: "session resume receipts require authenticated_principal" });
  } else {
    const authenticated_principal = value.authenticated_principal;
    pushAuthenticatedPrincipal(issues, authenticated_principal, "authenticated_principal");
    const provenanceActorRef =
      isRecord(value.provenance) && typeof value.provenance["actor_ref"] === "string"
        ? value.provenance["actor_ref"]
        : undefined;
    const authenticatedActorRef =
      isRecord(authenticated_principal) && typeof authenticated_principal["actor_ref"] === "string"
        ? authenticated_principal["actor_ref"]
        : undefined;
    if (
      typeof provenanceActorRef === "string" &&
      provenanceActorRef.length > 0 &&
      typeof authenticatedActorRef === "string" &&
      authenticatedActorRef !== provenanceActorRef
    ) {
      issues.push({
        path: "provenance.actor_ref",
        message: "session resume receipt provenance.actor_ref must match authenticated_principal.actor_ref",
      });
    }
  }
  if (isStringArray(value.upstream_refs)) {
    for (const requiredRef of [value.projection_manifest_ref, value.checkpoint_ref]) {
      if (typeof requiredRef === "string" && !value.upstream_refs.includes(requiredRef)) {
        issues.push({ path: "upstream_refs", message: `missing required upstream ref ${requiredRef}` });
      }
    }
  }
  return issues;
}

export function validateStoreManifest(value: unknown): ValidationIssue[] {
  return validateAgainstSchema(value, STORE_MANIFEST_SCHEMA_ID);
}

export function assertStoreManifest(value: unknown): asserts value is StoreManifest {
  const issues = validateStoreManifest(value);
  if (issues.length > 0) {
    throw new ValidationError("Invalid store manifest", issues);
  }
}

export function validateRuntimeIdentityRecord(
  value: unknown,
): ValidationIssue[] {
  return validateAgainstSchema(value, RUNTIME_IDENTITY_SCHEMA_ID);
}

export function assertRuntimeIdentityRecord(
  value: unknown,
): asserts value is ActorIdentity | RuntimeInstance | RuntimeSession | WorkingMemoryCheckpoint | ConversationThread {
  const issues = validateRuntimeIdentityRecord(value);
  if (issues.length > 0) {
    throw new ValidationError("Invalid runtime identity record", issues);
  }
}

export function validateSessionResumeReceiptRecord(value: unknown): ValidationIssue[] {
  return validateSessionResumeReceipt(value);
}

export function assertSessionResumeReceiptRecord(value: unknown): asserts value is SessionResumeReceipt {
  const issues = validateSessionResumeReceipt(value);
  if (issues.length > 0) {
    throw new ValidationError("Invalid session resume receipt", issues);
  }
}

export function validateDispositionRecord(value: unknown): ValidationIssue[] {
  return validateDispositionRecordInternal(value);
}

export function assertDispositionRecord(value: unknown): asserts value is DispositionRecord {
  const issues = validateDispositionRecord(value);
  if (issues.length > 0) {
    throw new ValidationError("Invalid disposition record", issues);
  }
}

export function validateSymbolAnchor(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, SYMBOL_ANCHOR_SCHEMA_ID);
  if (!isRecord(value)) return issues;

  if (typeof value.id === "string" && typeof value.namespace === "string") {
    const expectedPrefix = `sym:${value.namespace}/`;
    if (!value.id.startsWith(expectedPrefix)) {
      issues.push({ path: "id", message: `symbol id must start with ${expectedPrefix}` });
    }
  }

  if (value.lifecycle_state === "merged" && (typeof value.merged_into_ref !== "string" || value.merged_into_ref.length === 0)) {
    issues.push({ path: "merged_into_ref", message: "merged symbols require merged_into_ref" });
  }

  if (
    value.lifecycle_state === "superseded" &&
    (typeof value.superseded_by_ref !== "string" || value.superseded_by_ref.length === 0)
  ) {
    issues.push({ path: "superseded_by_ref", message: "superseded symbols require superseded_by_ref" });
  }

  if (value.lifecycle_state === "active") {
    for (const refKey of ["merged_into_ref", "superseded_by_ref"] as const) {
      if (value[refKey] !== undefined && value[refKey] !== null) {
        issues.push({ path: refKey, message: "active symbols cannot point at a terminal lifecycle successor" });
      }
    }
  }

  if (value.lifecycle_state !== undefined && !isEnumValue(value.lifecycle_state, SYMBOL_ANCHOR_LIFECYCLE_STATES)) {
    issues.push({ path: "lifecycle_state", message: `expected one of: ${SYMBOL_ANCHOR_LIFECYCLE_STATES.join(", ")}` });
  }

  return issues;
}

export function assertSymbolAnchor(value: unknown): asserts value is SymbolAnchor {
  const issues = validateSymbolAnchor(value);
  if (issues.length > 0) {
    throw new ValidationError("Invalid symbol anchor", issues);
  }
}

export function validateRetrievalContract(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, RETRIEVAL_CONTRACTS_SCHEMA_ID);
  if (!isRecord(value)) return issues;

  pushRetrievalCandidateLegality(issues, value, "$");

  for (const candidateArrayKey of ["included_candidates", "suppressed_candidates"] as const) {
    if (Array.isArray(value[candidateArrayKey])) {
      value[candidateArrayKey].forEach((candidate, index) => {
        pushRetrievalCandidateLegality(issues, candidate, `${candidateArrayKey}[${index}]`);
      });
    }
  }
  if (Array.isArray(value.candidates) && typeof value.provider_id === "string") {
    if (typeof value.recipe_ref !== "string" || value.recipe_ref.length === 0) {
      issues.push({ path: "recipe_ref", message: "external candidate batches require recipe_ref" });
    }
    value.candidates.forEach((candidate, index) => {
      if (isRecord(candidate) && candidate.provider_id !== value.provider_id) {
        issues.push({
          path: `candidates[${index}].provider_id`,
          message: "external candidate batch candidates must share provider_id",
        });
      }
    });
  }

  return issues;
}

export function assertRetrievalContract(
  value: unknown,
): asserts value is ExternalCandidateBatch | ExternalRetrievalCandidate | RetrievalCandidate | RetrievalQuery | RetrievalRecipe | RetrievalResult | RetrievalTrace {
  const issues = validateRetrievalContract(value);
  if (issues.length > 0) {
    throw new ValidationError("Invalid retrieval contract", issues);
  }
}

export function validateVectorArtifact(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, VECTOR_ARTIFACTS_SCHEMA_ID);
  if (!isRecord(value)) return issues;

  if (value.layer !== "derived") {
    issues.push({ path: "layer", message: 'vector artifacts must live in the "derived" layer' });
  }

  switch (value.kind) {
    case "vector_chunk":
      pushVectorBlobRef(issues, value.chunk_text_ref, "chunk_text_ref", "utf8_text");
      if (isStringArray(value.upstream_refs) && typeof value.source_ref === "string" && !value.upstream_refs.includes(value.source_ref)) {
        issues.push({ path: "upstream_refs", message: "vector chunks must include source_ref in upstream_refs" });
      }
      break;
    case "embedding_model_manifest":
      pushPositiveInteger(issues, value.dimensions, "dimensions");
      pushEnum(issues, value, "metric", VECTOR_METRICS);
      pushEnum(issues, value, "vector_encoding", VECTOR_ENCODINGS);
      break;
    case "embedding_record":
      pushPositiveInteger(issues, value.dimensions, "dimensions");
      pushEnum(issues, value, "metric", VECTOR_METRICS);
      pushEnum(issues, value, "vector_encoding", VECTOR_ENCODINGS);
      pushVectorBlobRef(
        issues,
        value.vector_ref,
        "vector_ref",
        isEnumValue(value.vector_encoding, VECTOR_ENCODINGS) ? value.vector_encoding : undefined,
        value.dimensions,
      );
      if (isRecord(value.vector_ref) && value.vector_checksum !== value.vector_ref.checksum) {
        issues.push({ path: "vector_checksum", message: "vector_checksum must match vector_ref.checksum" });
      }
      break;
    case "embedding_batch_run":
      pushPositiveInteger(issues, value.dimensions, "dimensions");
      pushEnum(issues, value, "metric", VECTOR_METRICS);
      if (value.status === "completed" && Array.isArray(value.chunk_refs) && Array.isArray(value.embedding_refs) && value.chunk_refs.length !== value.embedding_refs.length) {
        issues.push({ path: "embedding_refs", message: "completed embedding batches require one embedding ref per chunk ref" });
      }
      break;
    case "vector_index_manifest":
      pushPositiveInteger(issues, value.dimensions, "dimensions");
      pushEnum(issues, value, "metric", VECTOR_METRICS);
      pushEnum(issues, value, "index_kind", VECTOR_INDEX_KINDS);
      pushEnum(issues, value, "vector_encoding", VECTOR_ENCODINGS);
      pushVectorBlobRef(
        issues,
        value.index_ref,
        "index_ref",
        isEnumValue(value.vector_encoding, VECTOR_ENCODINGS) ? value.vector_encoding : undefined,
        value.dimensions,
      );
      if (value.index_kind === "exact" && value.index_checksum === undefined) {
        issues.push({ path: "index_checksum", message: "exact vector indexes require index_checksum" });
      }
      if (value.index_kind === "exact") {
        for (const key of [
          "ann_strategy",
          "ann_parameters",
          "exact_baseline_index_ref",
          "ann_recall_floor",
          "ann_baseline_eval_ref",
        ] as const) {
          if (value[key] !== undefined && value[key] !== null) {
            issues.push({ path: key, message: "exact vector indexes cannot carry ANN metadata" });
          }
        }
      }
      if (value.index_kind === "ann") {
        pushEnum(issues, value, "ann_strategy", VECTOR_ANN_STRATEGIES);
        pushRequiredString(issues, value, "exact_baseline_index_ref");
        pushRatio(issues, value.ann_recall_floor, "ann_recall_floor");
        if (value.index_checksum === undefined) {
          issues.push({ path: "index_checksum", message: "ANN vector indexes require index_checksum" });
        }
        if (!isRecord(value.ann_parameters) || Object.keys(value.ann_parameters).length === 0) {
          issues.push({ path: "ann_parameters", message: "ANN vector indexes require non-empty ann_parameters" });
        } else {
          for (const [key, parameter] of Object.entries(value.ann_parameters)) {
            if (typeof parameter !== "string" && typeof parameter !== "number" && typeof parameter !== "boolean") {
              issues.push({ path: `ann_parameters.${key}`, message: "expected string, number, or boolean" });
            }
          }
        }
      }
      break;
    case "vector_search_run":
      pushEnum(issues, value, "metric", VECTOR_METRICS);
      if (typeof value.top_k !== "number" || !Number.isInteger(value.top_k) || value.top_k < 0) {
        issues.push({ path: "top_k", message: "expected non-negative integer" });
      }
      break;
    case "retrieval_audit":
      pushRetrievalSuppressionReasons(issues, value.suppression_reasons, "suppression_reasons");
      break;
    case "retrieval_eval_run":
      pushRatio(issues, value.recall_at_k, "recall_at_k");
      pushRatio(issues, value.precision_at_k, "precision_at_k");
      for (const key of [
        "expected_included_candidate_refs",
        "expected_suppressed_candidate_refs",
        "observed_included_candidate_refs",
        "observed_suppressed_candidate_refs",
        "failure_reasons",
      ] as const) {
        if (!isStringArray(value[key]) || !hasUniqueEntries(value[key])) {
          issues.push({ path: key, message: "expected unique string array" });
        }
      }
      for (const key of ["authority_correct", "provenance_complete", "passed"] as const) {
        if (typeof value[key] !== "boolean") {
          issues.push({ path: key, message: "expected boolean" });
        }
      }
      if (value.passed === true && Array.isArray(value.failure_reasons) && value.failure_reasons.length > 0) {
        issues.push({ path: "failure_reasons", message: "passed retrieval eval runs must not list failure reasons" });
      }
      if (value.passed === false && Array.isArray(value.failure_reasons) && value.failure_reasons.length === 0) {
        issues.push({ path: "failure_reasons", message: "failed retrieval eval runs require failure reasons" });
      }
      break;
    case "vector_maintenance_run":
      pushEnum(issues, value, "job", VECTOR_MAINTENANCE_JOBS);
      if (!isEnumValue(value.status, ["passed", "completed_with_issues", "rejected"] as const)) {
        issues.push({ path: "status", message: "expected legal vector maintenance status" });
      }
      for (const key of ["checked_artifact_refs", "issue_codes"] as const) {
        if (!isStringArray(value[key]) || !hasUniqueEntries(value[key])) {
          issues.push({ path: key, message: "expected unique string array" });
        }
      }
      if (value.status === "passed" && Array.isArray(value.issue_codes) && value.issue_codes.length > 0) {
        issues.push({ path: "issue_codes", message: "passed vector maintenance runs must not list issue codes" });
      }
      if (value.status === "completed_with_issues" && Array.isArray(value.issue_codes) && value.issue_codes.length === 0) {
        issues.push({ path: "issue_codes", message: "completed_with_issues maintenance runs require issue codes" });
      }
      if (value.diagnostic_refs !== undefined && (!isStringArray(value.diagnostic_refs) || !hasUniqueEntries(value.diagnostic_refs))) {
        issues.push({ path: "diagnostic_refs", message: "expected unique string array" });
      }
      if (value.invalidated_artifact_refs !== undefined && (!isStringArray(value.invalidated_artifact_refs) || !hasUniqueEntries(value.invalidated_artifact_refs))) {
        issues.push({ path: "invalidated_artifact_refs", message: "expected unique string array" });
      }
      if (value.rebuilt_artifact_refs !== undefined && (!isStringArray(value.rebuilt_artifact_refs) || !hasUniqueEntries(value.rebuilt_artifact_refs))) {
        issues.push({ path: "rebuilt_artifact_refs", message: "expected unique string array" });
      }
      if (value.rebuild_candidate_refs !== undefined && (!isStringArray(value.rebuild_candidate_refs) || !hasUniqueEntries(value.rebuild_candidate_refs))) {
        issues.push({ path: "rebuild_candidate_refs", message: "expected unique string array" });
      }
      if (value.repair_candidate_refs !== undefined && (!isStringArray(value.repair_candidate_refs) || !hasUniqueEntries(value.repair_candidate_refs))) {
        issues.push({ path: "repair_candidate_refs", message: "expected unique string array" });
      }
      break;
    case "vector_export_jsonl_row":
      pushEnum(issues, value, "row_kind", VECTOR_EXPORT_JSONL_ROW_KINDS);
      if (value.row_kind === "chunk_metadata") {
        pushRequiredString(issues, value, "chunk_ref");
        pushRequiredString(issues, value, "source_ref");
        pushEnum(issues, value, "source_layer", LAYERS);
        pushVectorBlobRef(issues, value.chunk_text_ref, "chunk_text_ref", "utf8_text");
      }
      if (value.row_kind === "embedding_metadata") {
        pushRequiredString(issues, value, "embedding_ref");
        pushRequiredString(issues, value, "chunk_ref");
        pushRequiredString(issues, value, "embedding_model_ref");
        pushPositiveInteger(issues, value.dimensions, "dimensions");
        pushEnum(issues, value, "metric", VECTOR_METRICS);
        pushEnum(issues, value, "vector_encoding", VECTOR_ENCODINGS);
        pushVectorBlobRef(
          issues,
          value.vector_ref,
          "vector_ref",
          isEnumValue(value.vector_encoding, VECTOR_ENCODINGS) ? value.vector_encoding : undefined,
          typeof value.dimensions === "number" ? value.dimensions : undefined,
        );
        if (isRecord(value.vector_ref) && value.vector_checksum !== value.vector_ref.checksum) {
          issues.push({ path: "vector_checksum", message: "vector_checksum must match vector_ref.checksum" });
        }
      }
      if (value.symbol_refs !== undefined && (!isStringArray(value.symbol_refs) || !hasUniqueEntries(value.symbol_refs))) {
        issues.push({ path: "symbol_refs", message: "expected unique string array" });
      }
      break;
    case "vector_corpus":
      if (isStringArray(value.source_refs) && value.source_refs.length === 0) {
        issues.push({ path: "source_refs", message: "vector corpora require at least one source ref" });
      }
      break;
    default:
      break;
  }

  return issues;
}

export function assertVectorArtifact(value: unknown): asserts value is VectorArtifact {
  const issues = validateVectorArtifact(value);
  if (issues.length > 0) {
    throw new ValidationError("Invalid vector artifact", issues);
  }
}

export function validateCoreRecord(value: unknown): ValidationIssue[] {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return validateEnvelope(value);
  }

  switch (value.kind) {
    case "source_record":
      return validateSourceRecord(value);
    case "actor_identity":
      return validateActorIdentity(value);
    case "runtime_instance":
      return validateRuntimeInstance(value);
    case "runtime_session":
      return validateRuntimeSession(value);
    case "conversation_thread":
      return validateConversationThread(value);
    case "observation":
      return validateObservation(value);
    case "runtime_memory_block":
      return validateRuntimeMemoryBlock(value);
    case "working_memory_checkpoint":
      return validateWorkingMemoryCheckpoint(value);
    case "session_resume_receipt":
      return validateSessionResumeReceipt(value);
    case "episode":
      return validateEpisode(value);
    case "entity":
      return validateEntity(value);
    case "relation":
      return validateRelation(value);
    case "proposal":
      return validateProposal(value);
    case "curation_packet":
      return validateCurationPacket(value);
    case "ratification":
      return validateRatificationRecord(value);
    case "contradiction":
      return validateContradiction(value);
    case "contradiction_resolution":
      return validateContradictionResolution(value);
    case "ontology_definition":
      return validateOntologyDefinition(value);
    case "policy_snapshot":
      return validatePolicySnapshot(value);
    case "wiki_page":
      return validateWikiPage(value);
    case "wiki_claim":
      return validateWikiClaim(value);
    case "wiki_maintenance_run":
      return validateWikiMaintenanceRun(value);
    case "projection_artifact":
      return validateProjectionArtifact(value);
    case "projection_manifest":
      return validateProjectionManifest(value);
    case "diagnostic":
      return validateDiagnostic(value);
    case "disposition_record":
      return validateDispositionRecordInternal(value);
    default:
      if (value.layer === "world") return validateWorldClaim(value);
      if (value.layer === "canon") return validateCanonicalMemoryObject(value);
      return validateEnvelope(value);
  }
}

export function assertCoreRecord(value: unknown): asserts value is CoreRecord {
  const issues = validateCoreRecord(value);
  if (issues.length > 0) {
    throw new ValidationError("Invalid core record", issues);
  }
}
