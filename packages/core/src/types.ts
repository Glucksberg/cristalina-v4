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

export const WIKI_MAINTENANCE_EVENTS = [
  "source_ingested",
  "page_refreshed",
  "query_captured",
  "lint_run",
  "claim_superseded",
  "session_crystallized",
  "retention_reviewed",
] as const;

export const WIKI_STALENESS_STATES = [
  "current",
  "stale",
  "disputed",
  "superseded",
  "needs_review",
] as const;

export const WIKI_GRAPH_EDGE_TYPES = [
  "mentions",
  "summarizes",
  "compares",
  "supports",
  "contradicts",
  "supersedes",
] as const;

export const SYMBOL_ANCHOR_KINDS = [
  "concept",
  "entity",
  "relation_type",
  "semantic_slot",
  "intake_profile",
  "wiki_topic",
] as const;

export const SYMBOL_ANCHOR_LIFECYCLE_STATES = [
  "active",
  "merged",
  "superseded",
  "archived",
] as const;

export const RETRIEVAL_AUTHORITIES = [
  "evidence",
  "runtime",
  "world",
  "editorial",
  "canon",
  "governance",
  "derived",
] as const;

export const RETRIEVAL_SUPPRESSION_REASONS = [
  "visibility_scope_mismatch",
  "authority_mismatch",
  "stale_record",
  "contradicted_record",
  "unsupported_wiki_claim",
  "missing_upstream_ref",
  "projection_budget_exceeded",
  "invalid_external_candidate",
  "embedding_generation_mismatch",
] as const;

export const RETRIEVAL_EXTERNAL_CANDIDATE_POLICIES = [
  "forbid",
  "allow_normalized",
] as const;

export const VECTOR_METRICS = [
  "cosine",
  "dot",
  "euclidean",
] as const;

export const VECTOR_ENCODINGS = [
  "json_float32",
  "binary_float32",
  "binary_float16",
] as const;

export const VECTOR_INDEX_KINDS = [
  "exact",
  "ann",
] as const;

export const VECTOR_ANN_STRATEGIES = [
  "deterministic_fixture_lsh",
  "hnsw",
  "ivf_flat",
] as const;

export const VECTOR_BLOB_ENCODINGS = [
  "utf8_text",
  "json_float32",
  "binary_float32",
  "binary_float16",
] as const;

export const VECTOR_MAINTENANCE_JOBS = [
  "validate_vector_artifacts",
  "invalidate_changed_chunks",
  "rebuild_vector_corpus",
  "refresh_embedding_batch",
  "rebuild_exact_index",
  "rebuild_ann_index",
  "repair_vector_manifest",
  "run_retrieval_eval",
  "audit_vector_drift",
] as const;

export const VECTOR_EXPORT_JSONL_ROW_KINDS = [
  "chunk_metadata",
  "embedding_metadata",
] as const;

export const SESSION_RESUME_RECEIPT_STATUSES = [
  "consumed",
  "applied",
  "rejected",
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
export type WikiMaintenanceEvent = typeof WIKI_MAINTENANCE_EVENTS[number];
export type WikiStalenessState = typeof WIKI_STALENESS_STATES[number];
export type WikiGraphEdgeType = typeof WIKI_GRAPH_EDGE_TYPES[number];
export type SymbolAnchorKind = typeof SYMBOL_ANCHOR_KINDS[number];
export type SymbolAnchorLifecycleState = typeof SYMBOL_ANCHOR_LIFECYCLE_STATES[number];
export type RetrievalAuthority = typeof RETRIEVAL_AUTHORITIES[number];
export type RetrievalSuppressionReason = typeof RETRIEVAL_SUPPRESSION_REASONS[number];
export type RetrievalExternalCandidatePolicy = typeof RETRIEVAL_EXTERNAL_CANDIDATE_POLICIES[number];
export type VectorMetric = typeof VECTOR_METRICS[number];
export type VectorEncoding = typeof VECTOR_ENCODINGS[number];
export type VectorIndexKind = typeof VECTOR_INDEX_KINDS[number];
export type VectorAnnStrategy = typeof VECTOR_ANN_STRATEGIES[number];
export type VectorBlobEncoding = typeof VECTOR_BLOB_ENCODINGS[number];
export type VectorMaintenanceJob = typeof VECTOR_MAINTENANCE_JOBS[number];
export type VectorExportJsonlRowKind = typeof VECTOR_EXPORT_JSONL_ROW_KINDS[number];
export type SessionResumeReceiptStatus = typeof SESSION_RESUME_RECEIPT_STATUSES[number];
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

export interface SymbolAnchor {
  id: string;
  kind: SymbolAnchorKind;
  label: string;
  aliases: string[];
  description?: string;
  target_refs: string[];
  upstream_refs: string[];
  authority: "navigation_only";
  lifecycle_state: SymbolAnchorLifecycleState;
  namespace: string;
  canonical_symbol_ref?: string | null;
  supersedes_ref?: string | null;
  superseded_by_ref?: string | null;
  merged_into_ref?: string | null;
  diagnostic_refs?: string[];
}

export interface RetrievalQuery {
  id: string;
  query_text: string;
  recipe_ref: string;
  requested_layers: Layer[];
  symbol_hints?: string[];
  semantic_slot_hints?: string[];
  runtime_context_ref?: string | null;
  actor_ref?: string | null;
  authenticated_principal?: AuthenticatedPrincipal | null;
  read_policy_version: string;
  projection_profile?: string | null;
  audience?: string | null;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
}

export interface RetrievalRecipe {
  id: string;
  name: string;
  layer_scope: Layer[];
  allow_editorial_wiki: boolean;
  require_canon_for_truth_claims: boolean;
  vector_top_k: number;
  final_top_k: number;
  include_suppression_trace: boolean;
  read_policy_version: string;
  required_authenticated_principal_kind?: AuthenticatedPrincipalKind | null;
  external_candidate_policy?: RetrievalExternalCandidatePolicy;
  can_support_proposal_from_layers?: Layer[];
  max_candidates_per_layer?: Partial<Record<Layer, number>>;
}

export interface RetrievalCandidate {
  id: string;
  ref: Reference;
  layer: Layer;
  authority: RetrievalAuthority;
  text_ref?: string;
  text_preview?: string;
  visibility_state?: VisibilityState;
  symbol_refs: string[];
  semantic_slot?: string;
  vector_score?: number;
  lexical_score?: number;
  symbolic_score?: number;
  semantic_slot_score?: number;
  authority_score?: number;
  temporal_score?: number;
  provenance_score?: number;
  final_score?: number;
  why_retrieved: string[];
  suppression_reasons?: RetrievalSuppressionReason[];
  can_support_proposal: boolean;
  eligible_upstream_refs?: string[];
}

export interface ExternalRetrievalCandidate {
  provider_id: string;
  external_candidate_id: string;
  mapped_ref?: Reference | null;
  source_layer?: Layer | null;
  authority?: RetrievalAuthority | null;
  score?: number;
  score_normalization?: string;
  model_ref?: string | null;
  index_ref?: string | null;
  retrieved_at: string;
  symbol_refs?: string[];
  semantic_slot?: string;
  text_preview?: string;
  unsupported_mapping_reasons?: string[];
}

export interface ExternalCandidateBatch {
  id: string;
  provider_id: string;
  external_run_id?: string | null;
  query_ref?: string | null;
  recipe_ref?: string | null;
  retrieved_at: string;
  score_normalization?: string | null;
  model_ref?: string | null;
  index_ref?: string | null;
  candidates: ExternalRetrievalCandidate[];
  diagnostic_refs?: string[];
}

export interface RetrievalResult {
  query_ref: string;
  recipe_ref: string;
  included_candidates: RetrievalCandidate[];
  suppressed_candidates: RetrievalCandidate[];
  trace_ref?: string;
}

export interface RetrievalTrace {
  id: string;
  query_ref: string;
  recipe_ref: string;
  read_policy_version: string;
  projection_profile?: string | null;
  audience?: string | null;
  provider_run_refs?: string[];
  included_candidate_refs: string[];
  suppressed_candidate_refs: string[];
  suppression_reasons: RetrievalSuppressionReason[];
}

export interface ProjectionRetrievalTrace {
  trace_ref?: string;
  query_ref: string;
  recipe_ref: string;
  included_candidate_refs: string[];
  suppressed_candidate_refs: string[];
  suppression_reasons: RetrievalSuppressionReason[];
}

export interface VectorBlobRef {
  path: string;
  checksum: string;
  encoding: VectorBlobEncoding;
  dimensions?: number;
  generation_id: string;
  producing_ref: string;
}

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

export interface VectorCorpus extends RecordEnvelope {
  kind: "vector_corpus";
  layer: "derived";
  source_refs: string[];
  source_layers: Layer[];
  chunk_policy_version: string;
  corpus_generation: string;
  chunk_refs: string[];
  embedding_model_ref?: string | null;
}

export interface VectorChunk extends RecordEnvelope {
  kind: "vector_chunk";
  layer: "derived";
  source_ref: string;
  source_layer: Layer;
  chunk_text_ref: VectorBlobRef;
  chunk_hash: string;
  chunk_policy_version: string;
  symbol_refs: string[];
  semantic_slot?: string;
  temporal_state?: TemporalState;
  upstream_refs: string[];
  corpus_generation: string;
  chunk_generation: string;
  normalized_text_hash: string;
  source_record_hash: string;
}

export interface EmbeddingModelManifest extends RecordEnvelope {
  kind: "embedding_model_manifest";
  layer: "derived";
  provider_id: string;
  model_id: string;
  dimensions: number;
  metric: VectorMetric;
  normalization_mode: string;
  vector_encoding: VectorEncoding;
  deterministic_fixture_mode: boolean;
  replacement_ref?: string | null;
  deprecated_at?: string | null;
}

export interface EmbeddingRecord extends RecordEnvelope {
  kind: "embedding_record";
  layer: "derived";
  chunk_ref: string;
  embedding_model_ref: string;
  dimensions: number;
  metric: VectorMetric;
  vector_ref: VectorBlobRef;
  source_text_hash: string;
  embedding_generation: string;
  vector_encoding: VectorEncoding;
  vector_checksum: string;
}

export interface EmbeddingBatchRun extends RecordEnvelope {
  kind: "embedding_batch_run";
  layer: "derived";
  embedding_model_ref: string;
  chunk_refs: string[];
  embedding_refs: string[];
  dimensions: number;
  metric: VectorMetric;
  embedding_generation: string;
  status: "completed" | "completed_with_diagnostics" | "rejected";
  diagnostic_refs?: string[];
}

export interface VectorIndexManifest extends RecordEnvelope {
  kind: "vector_index_manifest";
  layer: "derived";
  index_ref: VectorBlobRef;
  corpus_ref: string;
  embedding_model_ref: string;
  dimensions: number;
  metric: VectorMetric;
  index_kind: VectorIndexKind;
  chunk_policy_version: string;
  source_refs: string[];
  stale_chunk_refs?: string[];
  invalidated_refs?: string[];
  updated_at?: string | null;
  corpus_generation: string;
  embedding_generation: string;
  index_generation: string;
  vector_encoding: VectorEncoding;
  index_checksum?: string;
  ann_strategy?: VectorAnnStrategy | null;
  ann_parameters?: Record<string, string | number | boolean>;
  exact_baseline_index_ref?: string | null;
  ann_recall_floor?: number;
  ann_baseline_eval_ref?: string | null;
}

export interface VectorSearchRun extends RecordEnvelope {
  kind: "vector_search_run";
  layer: "derived";
  query_ref: string;
  index_manifest_ref: string;
  recipe_ref?: string | null;
  requested_layers: Layer[];
  candidate_refs: string[];
  suppressed_candidate_refs: string[];
  metric: VectorMetric;
  top_k: number;
  search_generation: string;
}

export interface RetrievalAudit extends RecordEnvelope {
  kind: "retrieval_audit";
  layer: "derived";
  query_ref: string;
  recipe_ref: string;
  result_ref?: string | null;
  trace_ref?: string | null;
  vector_search_run_refs: string[];
  included_candidate_refs: string[];
  suppressed_candidate_refs: string[];
  suppression_reasons: RetrievalSuppressionReason[];
}

export interface RetrievalEvalRun extends RecordEnvelope {
  kind: "retrieval_eval_run";
  layer: "derived";
  eval_case_ref: string;
  query_ref: string;
  recipe_ref: string;
  result_ref?: string | null;
  trace_ref?: string | null;
  expected_included_candidate_refs: string[];
  expected_suppressed_candidate_refs: string[];
  observed_included_candidate_refs: string[];
  observed_suppressed_candidate_refs: string[];
  recall_at_k: number;
  precision_at_k: number;
  authority_correct: boolean;
  provenance_complete: boolean;
  passed: boolean;
  failure_reasons: string[];
}

export interface VectorMaintenanceRun extends RecordEnvelope {
  kind: "vector_maintenance_run";
  layer: "derived";
  job: VectorMaintenanceJob;
  status: "passed" | "completed_with_issues" | "rejected";
  corpus_ref?: string | null;
  index_manifest_ref?: string | null;
  checked_artifact_refs: string[];
  issue_codes: string[];
  diagnostic_refs?: string[];
  invalidated_artifact_refs?: string[];
  rebuilt_artifact_refs?: string[];
  rebuild_candidate_refs?: string[];
  repair_candidate_refs?: string[];
}

export interface VectorExportJsonlRow extends RecordEnvelope {
  kind: "vector_export_jsonl_row";
  layer: "derived";
  export_run_ref: string;
  schema_version: string;
  row_kind: VectorExportJsonlRowKind;
  source_artifact_ref: string;
  corpus_ref?: string | null;
  chunk_ref?: string | null;
  source_ref?: string | null;
  source_layer?: Layer | null;
  chunk_text_ref?: VectorBlobRef | null;
  chunk_hash?: string | null;
  chunk_text_preview?: string | null;
  symbol_refs?: string[];
  semantic_slot?: string | null;
  embedding_ref?: string | null;
  embedding_model_ref?: string | null;
  dimensions?: number | null;
  metric?: VectorMetric | null;
  vector_ref?: VectorBlobRef | null;
  vector_encoding?: VectorEncoding | null;
  vector_checksum?: string | null;
  corpus_generation?: string | null;
  chunk_generation?: string | null;
  embedding_generation?: string | null;
}

export type VectorArtifact =
  | VectorCorpus
  | VectorChunk
  | EmbeddingModelManifest
  | EmbeddingRecord
  | EmbeddingBatchRun
  | VectorIndexManifest
  | VectorSearchRun
  | RetrievalAudit
  | RetrievalEvalRun
  | VectorMaintenanceRun
  | VectorExportJsonlRow;

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

export interface WorkingMemoryCheckpoint extends RecordEnvelope {
  kind: "working_memory_checkpoint";
  layer: "runtime";
  authoritative_home: "runtime";
  runtime_instance_ref: string;
  runtime_session_ref: string;
  conversation_thread_ref: string;
  continuity_epoch: string;
  generation: number;
  read_policy_version: string;
  upstream_refs: string[];
  summary?: string | null;
  status: "active" | "superseded" | "invalidated";
  supersedes_ref?: string | null;
  superseded_by_ref?: string | null;
  policy_snapshot_ref?: string | null;
}

export interface SessionResumeReceipt extends RecordEnvelope {
  kind: "session_resume_receipt";
  layer: "audits";
  authoritative_home: "governance";
  receipt_status: SessionResumeReceiptStatus;
  adapter: Exclude<RuntimeKind, "generic">;
  projection_manifest_ref: string;
  projection_artifact_refs: string[];
  checkpoint_ref: string;
  runtime_instance_ref: string;
  runtime_session_ref: string;
  conversation_thread_ref: string;
  continuity_epoch: string;
  generation: number;
  read_policy_version: string;
  upstream_refs: string[];
  authenticated_principal?: AuthenticatedPrincipal | null;
  diagnostic_refs?: string[];
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
  page_kind: "source" | "entity" | "topic" | "comparison" | "synthesis" | "analysis" | "query_answer" | "research_question" | "index" | "log";
  title: string;
  path: string;
  source_refs: string[];
  canonical_refs: string[];
  world_refs: string[];
  wiki_claim_refs?: string[];
  outgoing_links?: string[];
  incoming_links?: string[];
  index_summary?: string;
  quality_score?: number;
  retention_priority?: "low" | "normal" | "high";
  staleness_state?: WikiStalenessState;
}

export interface WikiClaim extends RecordEnvelope {
  kind: "wiki_claim";
  layer: "wiki";
  authoritative_home: "wiki";
  statement: string;
  page_ref: string;
  claim_status: "editorial" | "candidate_for_promotion" | "rejected" | "stale" | "disputed" | "superseded";
  source_refs: string[];
  support_refs?: string[];
  confidence_score?: number;
  support_count?: number;
  last_confirmed_at?: string | null;
  last_seen_at?: string | null;
  staleness_state?: WikiStalenessState;
  supersedes_ref?: string | null;
  superseded_by_ref?: string | null;
  retention_priority?: "low" | "normal" | "high";
  quality_score?: number;
}

export interface WikiGraphEdge {
  edge_type: WikiGraphEdgeType;
  from_ref: Reference;
  to_ref: Reference;
  upstream_refs: string[];
}

export interface WikiMaintenanceRun extends RecordEnvelope {
  kind: "wiki_maintenance_run";
  layer: "wiki";
  authoritative_home: "wiki";
  event: WikiMaintenanceEvent;
  status: "completed" | "completed_with_diagnostics" | "rejected";
  input_refs: string[];
  page_refs: string[];
  claim_refs: string[];
  diagnostic_refs: string[];
  graph_edges: WikiGraphEdge[];
  quality_score?: number;
  retention_reviewed_refs?: string[];
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
  retrieval_trace_refs?: string[];
  included_retrieval_candidate_refs?: string[];
  suppressed_retrieval_candidate_refs?: string[];
  retrieval_traces?: ProjectionRetrievalTrace[];
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
  | WorkingMemoryCheckpoint
  | SessionResumeReceipt
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
  | WikiMaintenanceRun
  | ProjectionArtifact
  | ProjectionManifest
  | Diagnostic
  | DispositionRecord;
