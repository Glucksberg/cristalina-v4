import type {
  EpistemicState,
  ProjectionArtifact,
  ProjectionManifest,
  Provenance,
  RuntimeKind,
  TemporalState,
  VisibilityState,
} from "../types.js";

export const DEFAULT_PROJECTION_READ_POLICY_VERSION = "projection-read-v2";

export interface ProjectionReadContext {
  adapter: Exclude<RuntimeKind, "generic">;
  audience: string;
  actor_identity_ref?: string | null;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
}

export interface ProjectionReadableRecord {
  id: string;
  kind: string;
  visibility_state: VisibilityState;
  provenance: Provenance;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
}

export interface ProjectionReadDecision {
  include: boolean;
  reason_code: string;
}

export interface ProjectionReadFilterResult<T extends ProjectionReadableRecord> {
  included: T[];
  suppressed: Array<{
    id: string;
    kind: string;
    reason_code: string;
  }>;
}

export interface ProjectionTraceableClaimRecord extends ProjectionReadableRecord {
  epistemic_state?: EpistemicState;
  temporal_state?: TemporalState;
}

export interface ProjectionClaimPartitionResult<T extends ProjectionTraceableClaimRecord> {
  active: T[];
  trace: T[];
}

function readContextMismatch(recordRef: string | null | undefined, contextRef: string | null | undefined): boolean {
  return typeof recordRef === "string" && recordRef !== contextRef;
}

function resolveRecordRuntimeContext(record: ProjectionReadableRecord): {
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
} {
  return {
    runtime_instance_ref:
      record.runtime_instance_ref ??
      record.provenance.runtime_ref ??
      (record.kind === "runtime_instance" ? record.id : null),
    runtime_session_ref:
      record.runtime_session_ref ??
      record.provenance.session_ref ??
      (record.kind === "runtime_session" ? record.id : null),
    conversation_thread_ref:
      record.conversation_thread_ref ??
      record.provenance.thread_ref ??
      (record.kind === "conversation_thread" ? record.id : null),
  };
}

function evaluateScopedContextDecision(input: {
  scope: "runtime_private" | "owner_private";
  hasScopedContext: boolean;
  recordContext: ReturnType<typeof resolveRecordRuntimeContext>;
  context: ProjectionReadContext;
}): ProjectionReadDecision {
  const scopePrefix = input.scope;

  if (!input.hasScopedContext) {
    if (input.scope === "runtime_private") {
      return {
        include: false,
        reason_code: "runtime_private_missing_context_binding",
      };
    }

    return {
      include: true,
      reason_code: "owner_private_unscoped",
    };
  }

  if (!input.context.runtime_instance_ref && !input.context.runtime_session_ref && !input.context.conversation_thread_ref) {
    return {
      include: false,
      reason_code: `${scopePrefix}_requires_projection_context`,
    };
  }

  if (readContextMismatch(input.recordContext.runtime_instance_ref, input.context.runtime_instance_ref)) {
    return {
      include: false,
      reason_code: `${scopePrefix}_runtime_instance_mismatch`,
    };
  }

  if (readContextMismatch(input.recordContext.runtime_session_ref, input.context.runtime_session_ref)) {
    return {
      include: false,
      reason_code: `${scopePrefix}_runtime_session_mismatch`,
    };
  }

  if (readContextMismatch(input.recordContext.conversation_thread_ref, input.context.conversation_thread_ref)) {
    return {
      include: false,
      reason_code: `${scopePrefix}_conversation_thread_mismatch`,
    };
  }

  return {
    include: true,
    reason_code: `${scopePrefix}_context_match`,
  };
}

export function evaluateProjectionReadDecision(
  record: ProjectionReadableRecord,
  context: ProjectionReadContext,
): ProjectionReadDecision {
  if (
    record.visibility_state.privacy_scope !== "runtime_private" &&
    record.visibility_state.privacy_scope !== "owner_private"
  ) {
    return {
      include: true,
      reason_code: "scope_allows_projection",
    };
  }

  const recordContext = resolveRecordRuntimeContext(record);
  const hasScopedContext = Boolean(
    recordContext.runtime_instance_ref ||
    recordContext.runtime_session_ref ||
    recordContext.conversation_thread_ref,
  );

  return evaluateScopedContextDecision({
    scope: record.visibility_state.privacy_scope,
    hasScopedContext,
    recordContext,
    context,
  });
}

export function filterProjectionRecords<T extends ProjectionReadableRecord>(
  records: T[],
  context: ProjectionReadContext,
): ProjectionReadFilterResult<T> {
  const included: T[] = [];
  const suppressed: ProjectionReadFilterResult<T>["suppressed"] = [];

  for (const record of records) {
    const decision = evaluateProjectionReadDecision(record, context);
    if (decision.include) {
      included.push(record);
      continue;
    }

    suppressed.push({
      id: record.id,
      kind: record.kind,
      reason_code: decision.reason_code,
    });
  }

  return {
    included,
    suppressed,
  };
}

export function partitionProjectionClaimsForRuntime<T extends ProjectionTraceableClaimRecord>(
  records: T[],
  context: ProjectionReadContext,
): ProjectionClaimPartitionResult<T> {
  if (context.audience !== "runtime") {
    return {
      active: records,
      trace: [],
    };
  }

  const active: T[] = [];
  const trace: T[] = [];

  for (const record of records) {
    const isHistorical = record.temporal_state?.temporal_status === "historical";
    const isDisputed = record.epistemic_state === "disputed";

    if (isHistorical || isDisputed) {
      trace.push(record);
      continue;
    }

    active.push(record);
  }

  return {
    active,
    trace,
  };
}

export interface ProjectionFragmentInput {
  id: string;
  adapter: Exclude<RuntimeKind, "generic">;
  artifact_kind: string;
  path: string;
  source_layer: ProjectionArtifact["source_layer"];
  authoritative_home: ProjectionArtifact["authoritative_home"];
  upstream_refs: string[];
  now: string;
  visibility_state: VisibilityState;
}

export function createProjectionArtifact(input: ProjectionFragmentInput): ProjectionArtifact {
  return {
    id: input.id,
    kind: "projection_artifact",
    layer: "derived",
    authoritative_home: input.authoritative_home,
    created_at: input.now,
    updated_at: input.now,
    visibility_state: input.visibility_state,
    provenance: {
      source_type: "projection_compiler",
      source_ref: input.path,
      evidence_refs: input.upstream_refs,
    },
    adapter: input.adapter,
    artifact_kind: input.artifact_kind,
    path: input.path,
    source_layer: input.source_layer,
    upstream_refs: input.upstream_refs,
  };
}

export interface ProjectionManifestInput {
  id: string;
  adapter: Exclude<RuntimeKind, "generic">;
  projection_profile: string;
  audience: string;
  read_policy_version: string;
  actor_identity_ref?: string | null;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
  policy_snapshot_ref?: string | null;
  context_refs: string[];
  suppressed_refs?: string[];
  suppressed_records?: Array<{
    id: string;
    kind: string;
    reason_code: string;
  }>;
  diagnostic_refs?: string[];
  artifact_refs: string[];
  upstream_refs: string[];
  now: string;
  visibility_state: VisibilityState;
}

export function createProjectionManifest(input: ProjectionManifestInput): ProjectionManifest {
  return {
    id: input.id,
    kind: "projection_manifest",
    layer: "derived",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: input.visibility_state,
    provenance: {
      source_type: "projection_manifest",
      source_ref: `derived/manifests/${input.id}.json`,
      evidence_refs: input.upstream_refs,
    },
    adapter: input.adapter,
    projection_profile: input.projection_profile,
    audience: input.audience,
    read_policy_version: input.read_policy_version,
    actor_identity_ref: input.actor_identity_ref ?? null,
    runtime_instance_ref: input.runtime_instance_ref ?? null,
    runtime_session_ref: input.runtime_session_ref ?? null,
    conversation_thread_ref: input.conversation_thread_ref ?? null,
    policy_snapshot_ref: input.policy_snapshot_ref ?? null,
    context_refs: input.context_refs,
    ...(input.suppressed_refs !== undefined ? { suppressed_refs: input.suppressed_refs } : {}),
    ...(input.suppressed_records !== undefined ? { suppressed_records: input.suppressed_records } : {}),
    ...(input.diagnostic_refs !== undefined ? { diagnostic_refs: input.diagnostic_refs } : {}),
    upstream_refs: input.upstream_refs,
    artifact_refs: input.artifact_refs,
  };
}
