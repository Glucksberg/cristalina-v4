import type {
  ActorIdentity,
  CanonicalMemoryObject,
  ContradictionResolution,
  ConversationThread,
  CoreRecord,
  DispositionRecord,
  Observation,
  Proposal,
  RuntimeInstance,
  RuntimeSession,
  WorldClaim,
} from "./types.js";
import {
  ACTOR_KINDS,
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
  RUNTIMES,
  TEMPORAL_STATUSES,
  VISIBILITY_SCOPES,
} from "./types.js";
import {
  CONTRADICTION_RESOLUTION_SCHEMA_ID,
  DISPOSITION_RECORD_SCHEMA_ID,
  MEMORY_OBJECT_SCHEMA_ID,
  PROJECTION_MANIFEST_SCHEMA_ID,
  RUNTIME_IDENTITY_SCHEMA_ID,
  STORE_MANIFEST_SCHEMA_ID,
  TEMPORAL_WORLD_RECORD_SCHEMA_ID,
  validateAgainstSchema,
} from "./schema-runtime.js";
import type { StoreManifest } from "./store/manifest.js";

const AUTHORITATIVE_HOMES = [
  "raw",
  "runtime",
  "world",
  "canon",
  "wiki",
  "governance",
] as const;

type AuthoritativeHome = typeof AUTHORITATIVE_HOMES[number];

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
const CANONICAL_MEMORY_GOVERNANCE_STATES = [
  "ratified",
  "superseded",
  "archived",
] as const;

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

function pushReference(issues: ValidationIssue[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "expected reference object" });
    return;
  }

  pushSafeRecordId(issues, value.id, `${path}.id`);

  if (value.kind !== undefined && typeof value.kind !== "string") {
    issues.push({ path: `${path}.kind`, message: "expected string" });
  }

  if (value.layer !== undefined && !isEnumValue(value.layer, LAYERS)) {
    issues.push({ path: `${path}.layer`, message: `expected one of: ${LAYERS.join(", ")}` });
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

    for (const optionalKey of ["evidence_refs", "actor_ref", "runtime_ref", "session_ref", "thread_ref"] as const) {
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
  if (!isEnumValue(value.kind, MEMORY_OBJECT_KINDS.filter((kind) => !["entity", "relation", "episode"].includes(kind)))) {
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
  if (value.target_ref !== null && value.target_ref !== undefined && !isRecord(value.target_ref)) {
    issues.push({ path: "target_ref", message: "expected object or null" });
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
  if (!isEnumValue(value.decision, ["approved", "rejected", "deferred"] as const)) {
    issues.push({ path: "decision", message: 'expected one of: approved, rejected, deferred' });
  }
  pushRequiredString(issues, value, "actor");
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
  if (value.winning_ref !== undefined && value.winning_ref !== null) {
    pushReference(issues, value.winning_ref, "winning_ref");
  }
  if (value.losing_ref !== undefined && value.losing_ref !== null) {
    pushReference(issues, value.losing_ref, "losing_ref");
  }
  pushRequiredString(issues, value, "rationale");
  if (value.diagnostic_refs !== undefined && !isStringArray(value.diagnostic_refs)) {
    issues.push({ path: "diagnostic_refs", message: "expected string array" });
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
  if (!isEnumValue(value.page_kind, ["source", "entity", "topic", "comparison", "synthesis", "index", "log"] as const)) {
    issues.push({ path: "page_kind", message: "expected legal wiki page kind" });
  }
  pushRequiredString(issues, value, "title");
  pushRequiredString(issues, value, "path");
  pushStringArray(issues, value, "source_refs");
  pushStringArray(issues, value, "canonical_refs");
  pushStringArray(issues, value, "world_refs");
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
  if (!isEnumValue(value.claim_status, ["editorial", "candidate_for_promotion", "rejected"] as const)) {
    issues.push({ path: "claim_status", message: "expected legal wiki claim status" });
  }
  pushStringArray(issues, value, "source_refs");
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
  pushEnum(issues, value, "source_layer", LAYERS);
  if (!isStringArray(value.upstream_refs)) {
    issues.push({ path: "upstream_refs", message: "expected string array" });
  }
  return issues;
}

function validateProjectionManifest(value: unknown): ValidationIssue[] {
  const issues = validateAgainstSchema(value, PROJECTION_MANIFEST_SCHEMA_ID);
  if (!isRecord(value)) return issues;
  for (const optionalKey of ["actor_identity_ref", "runtime_instance_ref", "runtime_session_ref", "conversation_thread_ref"] as const) {
    const optionalValue = value[optionalKey];
    if (optionalValue !== undefined && optionalValue !== null && typeof optionalValue !== "string") {
      issues.push({ path: optionalKey, message: "expected string or null" });
    }
  }
  if (value.policy_snapshot_ref !== undefined && value.policy_snapshot_ref !== null && typeof value.policy_snapshot_ref !== "string") {
    issues.push({ path: "policy_snapshot_ref", message: "expected string or null" });
  }
  if (!isStringArray(value.context_refs) || !hasUniqueEntries(value.context_refs)) {
    issues.push({ path: "context_refs", message: "expected unique string array" });
  }
  if (value.suppressed_refs !== undefined && (!isStringArray(value.suppressed_refs) || !hasUniqueEntries(value.suppressed_refs))) {
    issues.push({ path: "suppressed_refs", message: "expected unique string array" });
  }
  if (value.suppressed_records !== undefined) {
    if (!Array.isArray(value.suppressed_records)) {
      issues.push({ path: "suppressed_records", message: "expected array" });
    } else {
      for (const [index, entry] of value.suppressed_records.entries()) {
        if (!isRecord(entry)) {
          issues.push({ path: `suppressed_records[${index}]`, message: "expected object" });
          continue;
        }
        pushRequiredString(issues, entry, "id", `suppressed_records[${index}].id`);
        pushRequiredString(issues, entry, "kind", `suppressed_records[${index}].kind`);
        pushRequiredString(issues, entry, "reason_code", `suppressed_records[${index}].reason_code`);
      }
    }
  }
  if (value.diagnostic_refs !== undefined && !isStringArray(value.diagnostic_refs)) {
    issues.push({ path: "diagnostic_refs", message: "expected string array" });
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
): asserts value is ActorIdentity | RuntimeInstance | RuntimeSession | ConversationThread {
  const issues = validateRuntimeIdentityRecord(value);
  if (issues.length > 0) {
    throw new ValidationError("Invalid runtime identity record", issues);
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
