export const MEMORY_OBJECT_KINDS = [
  "fact",
  "belief",
  "preference",
  "constraint",
  "goal",
  "procedure",
  "value",
  "identity_trait",
  "entity",
  "relation",
  "episode",
] as const;

export const EPISTEMIC_STATES = [
  "observed",
  "inferred",
  "hypothesized",
  "confirmed",
  "disputed",
] as const;

export const GOVERNANCE_STATES = [
  "draft",
  "proposed",
  "ratified",
  "superseded",
  "archived",
  "rejected",
] as const;

export const TEMPORAL_STATUSES = [
  "active",
  "bounded",
  "historical",
  "unresolved",
] as const;

export const VISIBILITY_SCOPES = [
  "runtime_private",
  "owner_private",
  "agent_operational",
  "project_private",
  "shareable",
  "public_safe",
] as const;

export const LAYERS = [
  "raw",
  "runtime",
  "world",
  "canon",
  "wiki",
  "governance",
  "derived",
  "audits",
] as const;

export const AUTHORITATIVE_HOMES = [
  "raw",
  "runtime",
  "world",
  "canon",
  "wiki",
  "governance",
] as const;

export const CANONICAL_CLAIM_KINDS = MEMORY_OBJECT_KINDS.filter(
  (kind) => !["entity", "relation", "episode"].includes(kind),
) as ReadonlyArray<Exclude<(typeof MEMORY_OBJECT_KINDS)[number], "entity" | "relation" | "episode">>;

export const ACTOR_KINDS = [
  "owner",
  "agent",
  "external_person",
  "external_organization",
  "system",
] as const;

export const RUNTIMES = [
  "openclaw",
  "hermes",
  "generic",
] as const;

export const SOURCE_INTAKE_KINDS = [
  "conversation_preference",
  "openclaw_projection_feedback",
  "structured_preference_signal",
] as const;

export const PROPOSAL_OPERATIONS = [
  "create",
  "revise",
  "supersede",
] as const;

export const DISPOSITION_OUTCOMES = [
  "evidence_only",
  "runtime_only",
  "world_update",
  "wiki_update",
  "proposal_for_canon",
  "queued_review",
  "diagnostic_only",
] as const;

export const NON_CANONICAL_INTAKE_MODES = [
  "evidence_only",
  "runtime_only",
  "diagnostic_only",
] as const;

export const CONTRADICTION_RESOLUTION_STRATEGIES = [
  "manual_review",
  "coexist_temporally",
  "supersede_existing",
  "supersede_candidate",
  "dismiss_contradiction",
] as const;

export const CONTRADICTION_RESOLUTION_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "applied",
] as const;

export const CURATION_REVIEW_KINDS = [
  "owner_ratification",
  "contradiction_manual_review",
] as const;

export const SUBJECT_AUTHORITY_ROLES = [
  "owner",
  "agent",
  "participant",
  "external",
] as const;

export const AUTHENTICATED_PRINCIPAL_KINDS = [
  "owner",
  "agent",
  "participant",
  "system",
] as const;

export type MemoryObjectKind = typeof MEMORY_OBJECT_KINDS[number];
export type EpistemicState = typeof EPISTEMIC_STATES[number];
export type GovernanceState = typeof GOVERNANCE_STATES[number];
export type TemporalStatus = typeof TEMPORAL_STATUSES[number];
export type VisibilityScope = typeof VISIBILITY_SCOPES[number];
export type Layer = typeof LAYERS[number];
export type AuthoritativeHome = typeof AUTHORITATIVE_HOMES[number];
export type CanonicalClaimKind = typeof CANONICAL_CLAIM_KINDS[number];
export type ActorKind = typeof ACTOR_KINDS[number];
export type RuntimeKind = typeof RUNTIMES[number];
export type SourceIntakeKind = typeof SOURCE_INTAKE_KINDS[number];
export type ProposalOperation = typeof PROPOSAL_OPERATIONS[number];
export type ProposalStageState = Exclude<GovernanceState, "ratified" | "superseded">;
export type DispositionOutcome = typeof DISPOSITION_OUTCOMES[number];
export type NonCanonicalIntakeMode = typeof NON_CANONICAL_INTAKE_MODES[number];
export type DispositionTargetLayer = Extract<Layer, "runtime" | "world" | "wiki" | "governance" | "canon" | "audits">;
export type ContradictionResolutionStrategy = typeof CONTRADICTION_RESOLUTION_STRATEGIES[number];
export type ContradictionResolutionStatus = typeof CONTRADICTION_RESOLUTION_STATUSES[number];
export type SubjectAuthorityRole = typeof SUBJECT_AUTHORITY_ROLES[number];
export type CurationReviewKind = typeof CURATION_REVIEW_KINDS[number];
export type AuthenticatedPrincipalKind = typeof AUTHENTICATED_PRINCIPAL_KINDS[number];

export const DISPOSITION_OUTCOME_TARGET_LAYER: Record<DispositionOutcome, DispositionTargetLayer> = {
  evidence_only: "governance",
  runtime_only: "runtime",
  world_update: "world",
  wiki_update: "wiki",
  proposal_for_canon: "canon",
  queued_review: "governance",
  diagnostic_only: "audits",
};

export const DISPOSITION_OUTCOME_REF_REQUIREMENTS: Partial<
  Record<DispositionOutcome, "proposal_refs" | "diagnostic_refs">
> = {
  proposal_for_canon: "proposal_refs",
  diagnostic_only: "diagnostic_refs",
};

export interface Reference {
  id: string;
  kind?: string;
  layer?: Layer;
  path?: string;
}

export interface TemporalState {
  temporal_status: TemporalStatus;
  valid_from?: string | null;
  valid_to?: string | null;
  temporal_confidence?: number | null;
}

export interface VisibilityState {
  privacy_scope: VisibilityScope;
  audience_tags?: string[];
}

export interface Provenance {
  source_type: string;
  source_ref: string;
  evidence_refs?: string[];
  actor_ref?: string | null;
  speaker_ref?: string | null;
  runtime_ref?: string | null;
  session_ref?: string | null;
  thread_ref?: string | null;
}

export type AuthenticatedPrincipal =
  | {
      kind: "owner";
      actor_ref: string;
      system_scope?: never;
    }
  | {
      kind: "agent";
      actor_ref: string;
      system_scope?: never;
    }
  | {
      kind: "participant";
      actor_ref: string;
      system_scope?: never;
    }
  | {
      kind: "system";
      actor_ref: string;
      system_scope: string;
    };

export interface RecordEnvelope {
  id: string;
  kind: string;
  layer: Layer;
  authoritative_home: AuthoritativeHome;
  created_at: string;
  updated_at?: string | null;
  visibility_state: VisibilityState;
  provenance: Provenance;
  // Cumulative refs that materially shaped the current record state, including
  // creation inputs and later lifecycle events such as supersession or reconciliation.
  upstream_refs?: string[];
}

export interface ClaimEnvelope extends RecordEnvelope {
  statement: string;
  semantic_slot: string;
  epistemic_state: EpistemicState;
  governance_state?: GovernanceState;
  temporal_state?: TemporalState;
}

export interface SourceRecord extends RecordEnvelope {
  kind: "source_record";
  layer: "raw";
  authoritative_home: "raw";
  content_ref: string;
  intake_profile_ref?: string;
  intake_runner_contract_version?: string;
  semantic_profile_fingerprint?: string;
}

export interface Observation extends RecordEnvelope {
  kind: "observation";
  layer: "runtime";
  authoritative_home: "runtime";
  summary: string;
  epistemic_state: EpistemicState;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
}

export interface ActorIdentity extends RecordEnvelope {
  kind: "actor_identity";
  layer: "canon";
  authoritative_home: "canon";
  actor_kind: ActorKind;
  label: string;
  status: "active" | "inactive" | "archived";
  aliases?: string[];
}

export interface RuntimeInstance extends RecordEnvelope {
  kind: "runtime_instance";
  layer: "runtime";
  authoritative_home: "runtime";
  runtime: RuntimeKind;
  agent_identity_ref: string;
  owner_identity_ref?: string | null;
  status: "active" | "paused" | "closed";
}

export interface RuntimeSession extends RecordEnvelope {
  kind: "runtime_session";
  layer: "runtime";
  authoritative_home: "runtime";
  runtime_instance_ref: string;
  status: "active" | "paused" | "closed";
  objective?: string | null;
  summary?: string | null;
}

export interface RuntimeMemoryBlock extends RecordEnvelope {
  kind: "runtime_memory_block";
  layer: "runtime";
  authoritative_home: "runtime";
  name: string;
  description: string;
  content: string;
  read_only: boolean;
  runtime_instance_ref?: string | null;
}

export interface ConversationThread extends RecordEnvelope {
  kind: "conversation_thread";
  layer: "runtime";
  authoritative_home: "runtime";
  runtime: RuntimeKind;
  runtime_instance_ref: string;
  runtime_session_ref: string;
  message_refs: string[];
  summary: string | null;
}

export interface Episode extends RecordEnvelope {
  kind: "episode";
  layer: "world";
  authoritative_home: "world";
  summary: string;
  observation_refs: string[];
  temporal_state: TemporalState;
}

export interface Entity extends RecordEnvelope {
  kind: "entity";
  layer: "world";
  authoritative_home: "world";
  entity_kind: string;
  label: string;
  status: "active" | "inactive" | "archived";
}

export interface Relation extends RecordEnvelope {
  kind: "relation";
  layer: "world";
  authoritative_home: "world";
  subject_ref: Reference;
  object_ref: Reference;
  relation_type: string;
  temporal_state?: TemporalState;
}

export interface WorldClaim extends ClaimEnvelope {
  kind: CanonicalClaimKind;
  layer: "world";
  authoritative_home: "world";
  support_refs: string[];
}

export interface CanonicalMemoryObject extends ClaimEnvelope {
  kind: CanonicalClaimKind;
  layer: "canon";
  authoritative_home: "canon";
  governance_state: GovernanceState;
  // Present when this record was created as the successor of another canonical record.
  supersedes_ref?: string | null;
  // Present when this record was replaced by a successor; null is intentional for retirement without replacement.
  superseded_by_ref?: string | null;
}

export interface Proposal extends RecordEnvelope {
  kind: "proposal";
  layer: "governance";
  authoritative_home: "governance";
  // `supersede` retires an existing canonical record without creating a replacement.
  operation: ProposalOperation;
  candidate_kind: string;
  target_layer: Extract<Layer, "world" | "canon" | "wiki" | "governance">;
  target_ref: Reference | null;
  candidate_payload: Record<string, unknown>;
  reason: string;
  evidence_refs: string[];
  subject_authority_role?: SubjectAuthorityRole;
  promotion_requirement?: "none" | "owner_ratification_required";
  // This is the proposal's pre-ratification stage, not the canonical record's governance lifecycle.
  governance_state: ProposalStageState;
}

export interface CurationPacket extends RecordEnvelope {
  kind: "curation_packet";
  layer: "governance";
  authoritative_home: "governance";
  proposal_refs: string[];
  question_count: number;
  review_kind?: CurationReviewKind;
  ratification_ref?: string | null;
  diagnostic_ref?: string | null;
  canonical_target_ref?: Reference | null;
  contradiction_ref?: string | null;
  contradiction_resolution_ref?: string | null;
  source_record_ref?: string | null;
  disposition_ref?: string | null;
  subject_entity_ref?: string | null;
  preference_entity_ref?: string | null;
  preference_relation_ref?: string | null;
  world_claim_ref?: string | null;
  wiki_page_ref?: string | null;
  wiki_claim_ref?: string | null;
  actor_identity_ref?: string | null;
  owner_identity_ref?: string | null;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
  projection_manifest_ref?: string | null;
  projection_artifact_refs?: string[];
  status: "pending" | "answered" | "expired" | "applied";
}

export interface RatificationRecord extends RecordEnvelope {
  kind: "ratification";
  layer: "governance";
  authoritative_home: "governance";
  proposal_ref: string;
  decision: "approved" | "rejected" | "deferred" | "expired";
  actor: string;
  authenticated_principal?: AuthenticatedPrincipal | null;
}

export interface Contradiction extends RecordEnvelope {
  kind: "contradiction";
  layer: "world";
  authoritative_home: "world";
  left_ref: Reference;
  right_ref: Reference;
  status: "open" | "resolved" | "dismissed";
}

export interface ContradictionResolution extends RecordEnvelope {
  kind: "contradiction_resolution";
  layer: "governance";
  authoritative_home: "governance";
  contradiction_ref: string;
  strategy: ContradictionResolutionStrategy;
  status: ContradictionResolutionStatus;
  winning_ref?: Reference | null;
  losing_ref?: Reference | null;
  rationale: string;
  diagnostic_refs?: string[];
}

export interface OntologyDefinition extends RecordEnvelope {
  kind: "ontology_definition";
  layer: "world";
  authoritative_home: "world";
  mode: "prescribed" | "learned" | "hybrid";
  entity_types: string[];
  relation_types: string[];
}

export interface PolicySnapshot extends RecordEnvelope {
  kind: "policy_snapshot";
  layer: "governance";
  authoritative_home: "governance";
  policy_family: string;
  version: string;
  active: boolean;
}

export interface WikiPage extends RecordEnvelope {
  kind: "wiki_page";
  layer: "wiki";
  authoritative_home: "wiki";
  page_kind: "source" | "entity" | "topic" | "comparison" | "synthesis" | "index" | "log";
  title: string;
  path: string;
  source_refs: string[];
  canonical_refs: string[];
  world_refs: string[];
}

export interface WikiClaim extends RecordEnvelope {
  kind: "wiki_claim";
  layer: "wiki";
  authoritative_home: "wiki";
  statement: string;
  page_ref: string;
  claim_status: "editorial" | "candidate_for_promotion" | "rejected";
  source_refs: string[];
}

export interface ProjectionArtifact extends RecordEnvelope {
  kind: "projection_artifact";
  layer: "derived";
  adapter: Exclude<RuntimeKind, "generic">;
  artifact_kind: string;
  path: string;
  source_layer: Layer;
  authoritative_home: AuthoritativeHome;
  upstream_refs: string[];
}

export interface ProjectionManifest extends RecordEnvelope {
  kind: "projection_manifest";
  layer: "derived";
  adapter: Exclude<RuntimeKind, "generic">;
  projection_profile: string;
  audience: string;
  read_policy_version: string;
  actor_identity_ref?: string | null;
  owner_identity_ref?: string | null;
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
  review_refs?: string[];
  upstream_refs: string[];
  artifact_refs: string[];
}

export interface Diagnostic extends RecordEnvelope {
  kind: "diagnostic";
  layer: "audits";
  authoritative_home: "governance";
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  related_refs: string[];
}

export interface DispositionRecord extends RecordEnvelope {
  kind: "disposition_record";
  layer: "governance";
  authoritative_home: "governance";
  input_refs: string[];
  outcomes: DispositionOutcome[];
  target_layers: DispositionTargetLayer[];
  proposal_refs?: string[];
  diagnostic_refs?: string[];
  reason_codes: string[];
}

export type CoreRecord =
  | SourceRecord
  | Observation
  | ActorIdentity
  | RuntimeInstance
  | RuntimeSession
  | RuntimeMemoryBlock
  | ConversationThread
  | Episode
  | Entity
  | Relation
  | WorldClaim
  | CanonicalMemoryObject
  | Proposal
  | CurationPacket
  | RatificationRecord
  | Contradiction
  | ContradictionResolution
  | OntologyDefinition
  | PolicySnapshot
  | WikiPage
  | WikiClaim
  | ProjectionArtifact
  | ProjectionManifest
  | Diagnostic
  | DispositionRecord;
