import { applyApprovedCanonicalProposal } from "../canon/engine.js";
import { evaluateCanonicalProposal, type GovernanceEvaluationResult } from "../governance/engine.js";
import { compileOpenClawBootstrapProjection } from "../projection-engine/openclaw.js";
import type {
  CanonicalMemoryObject,
  Diagnostic,
  DispositionRecord,
  Observation,
  ProjectionArtifact,
  ProjectionManifest,
  Proposal,
  RatificationRecord,
  SourceRecord,
  VisibilityState,
  WikiClaim,
  WikiPage,
  WorldClaim,
} from "../types.js";

export interface ConversationPreferenceIntakeIds {
  observation: string;
  world_claim: string;
  wiki_page: string;
  wiki_claim: string;
  proposal: string;
  disposition: string;
}

export interface ConversationPreferenceIntakeInput {
  now: string;
  source_record: SourceRecord;
  statement: string;
  ids: ConversationPreferenceIntakeIds;
  disposition_strategy?: ConversationPreferenceDispositionStrategy;
}

export interface ConversationPreferenceIntakeArtifacts {
  observation: Observation;
  world_claim: WorldClaim;
  wiki_page: WikiPage;
  wiki_claim: WikiClaim;
  proposal: Proposal;
  disposition_record: DispositionRecord;
}

export interface ConversationPreferenceDispositionStrategy {
  world_update?: boolean;
  wiki_update?: boolean;
  proposal_for_canon?: boolean;
  runtime_only?: boolean;
  evidence_only?: boolean;
  queued_review?: boolean;
  diagnostic_refs?: string[];
  reason_codes?: string[];
}

const DEFAULT_CONVERSATION_PREFERENCE_DISPOSITION: Required<
  Pick<ConversationPreferenceDispositionStrategy, "world_update" | "wiki_update" | "proposal_for_canon">
> = {
  world_update: true,
  wiki_update: true,
  proposal_for_canon: true,
};

function defaultConversationPreferenceReasonCodes(strategy: ConversationPreferenceDispositionStrategy): string[] {
  const codes: string[] = [];
  if (strategy.evidence_only) codes.push("evidence_retained");
  if (strategy.runtime_only) codes.push("runtime_local_signal");
  if (strategy.world_update) codes.push("preference_signal");
  if (strategy.wiki_update) codes.push("editorial_update");
  if (strategy.proposal_for_canon) codes.push("durable_candidate");
  if (strategy.queued_review) codes.push("review_required");
  if ((strategy.diagnostic_refs?.length ?? 0) > 0) codes.push("diagnostic_emitted");
  return codes;
}

export function buildConversationPreferenceDispositionRecord(input: {
  now: string;
  source_record: SourceRecord;
  observation_id: string;
  disposition_id: string;
  proposal_id?: string;
  strategy?: ConversationPreferenceDispositionStrategy;
}): DispositionRecord {
  const strategy = {
    ...DEFAULT_CONVERSATION_PREFERENCE_DISPOSITION,
    ...input.strategy,
  };

  const outcomes: DispositionRecord["outcomes"] = [];
  const target_layers: DispositionRecord["target_layers"] = [];

  if (strategy.evidence_only) outcomes.push("evidence_only");
  if (strategy.evidence_only) target_layers.push("governance");
  if (strategy.runtime_only) {
    outcomes.push("runtime_only");
    target_layers.push("runtime");
  }
  if (strategy.world_update) {
    outcomes.push("world_update");
    target_layers.push("world");
  }
  if (strategy.wiki_update) {
    outcomes.push("wiki_update");
    target_layers.push("wiki");
  }
  if (strategy.proposal_for_canon) {
    outcomes.push("proposal_for_canon");
    target_layers.push("canon");
  }
  if (strategy.queued_review) {
    outcomes.push("queued_review");
    target_layers.push("governance");
  }
  if ((strategy.diagnostic_refs?.length ?? 0) > 0) {
    outcomes.push("diagnostic_only");
    target_layers.push("audits");
  }

  if (outcomes.length === 0) {
    throw new Error("Conversation preference disposition must emit at least one outcome");
  }

  if (strategy.proposal_for_canon && !input.proposal_id) {
    throw new Error("Conversation preference disposition requires proposal_id when proposal_for_canon is emitted");
  }

  return {
    id: input.disposition_id,
    kind: "disposition_record",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      source_type: "conversation",
      source_ref: input.source_record.provenance.source_ref,
      evidence_refs: [input.observation_id],
    },
    input_refs: [input.observation_id],
    outcomes: [...new Set(outcomes)],
    target_layers: [...new Set(target_layers)],
    proposal_refs: strategy.proposal_for_canon && input.proposal_id ? [input.proposal_id] : undefined,
    diagnostic_refs: strategy.diagnostic_refs,
    reason_codes: strategy.reason_codes ?? defaultConversationPreferenceReasonCodes(strategy),
  };
}

export function buildConversationPreferenceIntake(input: ConversationPreferenceIntakeInput): ConversationPreferenceIntakeArtifacts {
  const source_ref = input.source_record.provenance.source_ref;
  const provenance = {
    source_type: "conversation",
    source_ref,
  } as const;

  const observation: Observation = {
    id: input.ids.observation,
    kind: "observation",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance,
    summary: input.statement,
    epistemic_state: "observed",
  };

  const world_claim: WorldClaim = {
    id: input.ids.world_claim,
    kind: "preference",
    layer: "world",
    authoritative_home: "world",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      ...provenance,
      evidence_refs: [observation.id],
    },
    statement: input.statement,
    epistemic_state: "inferred",
    temporal_state: {
      temporal_status: "active",
      valid_from: input.now,
      valid_to: null,
    },
    support_refs: [observation.id],
  };

  const wiki_page: WikiPage = {
    id: input.ids.wiki_page,
    kind: "wiki_page",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      ...provenance,
      evidence_refs: [observation.id, world_claim.id],
    },
    page_kind: "entity",
    title: "User Interaction Preferences",
    path: "wiki/pages/user-interaction-preferences.md",
    source_refs: [input.source_record.id],
    canonical_refs: [],
    world_refs: [world_claim.id],
  };

  const wiki_claim: WikiClaim = {
    id: input.ids.wiki_claim,
    kind: "wiki_claim",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      ...provenance,
      evidence_refs: [observation.id, world_claim.id],
    },
    statement: input.statement,
    page_ref: wiki_page.id,
    claim_status: "candidate_for_promotion",
    source_refs: [input.source_record.id],
  };

  const proposal: Proposal = {
    id: input.ids.proposal,
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      ...provenance,
      evidence_refs: [observation.id, world_claim.id, wiki_claim.id],
    },
    operation: "create",
    candidate_kind: "preference",
    target_layer: "canon",
    target_ref: null,
    candidate_payload: {
      kind: "preference",
      statement: input.statement,
      temporal_state: {
        temporal_status: "active",
        valid_from: input.now,
        valid_to: null,
      },
      epistemic_state: "confirmed",
      support_refs: [observation.id, world_claim.id, wiki_claim.id],
    },
    reason: "Conversation indicates a user interaction preference that should become governed memory.",
    evidence_refs: [observation.id],
    governance_state: "proposed",
  };

  const disposition_record = buildConversationPreferenceDispositionRecord({
    now: input.now,
    source_record: input.source_record,
    observation_id: observation.id,
    disposition_id: input.ids.disposition,
    proposal_id: proposal.id,
    strategy: input.disposition_strategy,
  });

  return {
    observation,
    world_claim,
    wiki_page,
    wiki_claim,
    proposal,
    disposition_record,
  };
}

export interface CanonicalProposalWorkflowInput {
  proposal: Proposal;
  existing_canon_records?: CanonicalMemoryObject[];
  existing_record?: CanonicalMemoryObject;
  now: string;
  actor: string;
  ratification_id: string;
  diagnostic_id?: string;
  canonical_id: string;
}

export interface CanonicalProposalWorkflowResult extends GovernanceEvaluationResult {
  created_record?: CanonicalMemoryObject;
  updated_records: CanonicalMemoryObject[];
}

export interface ConversationPreferenceSupersedeReconciliationInput {
  now: string;
  world_claim: WorldClaim;
  wiki_page: WikiPage;
  wiki_claim: WikiClaim;
  superseded_canonical_ref: string;
  proposal_ref: string;
  ratification_ref: string;
  active_canonical_refs?: string[];
}

export interface ConversationPreferenceSupersedeReconciliationResult {
  world_claim: WorldClaim;
  wiki_page: WikiPage;
  wiki_claim: WikiClaim;
}

function closeWorldClaimTemporalState(record: WorldClaim, now: string): WorldClaim["temporal_state"] {
  const temporal_state = record.temporal_state;
  return {
    temporal_status: "historical",
    valid_from: temporal_state?.valid_from ?? record.created_at,
    valid_to: now,
    temporal_confidence: temporal_state?.temporal_confidence ?? null,
  };
}

export function reconcileConversationPreferenceSupersede(
  input: ConversationPreferenceSupersedeReconciliationInput,
): ConversationPreferenceSupersedeReconciliationResult {
  const sharedRefs = [
    input.superseded_canonical_ref,
    input.proposal_ref,
    input.ratification_ref,
  ];

  return {
    world_claim: {
      ...input.world_claim,
      updated_at: input.now,
      epistemic_state: "disputed",
      temporal_state: closeWorldClaimTemporalState(input.world_claim, input.now),
      upstream_refs: [...new Set([...(input.world_claim.upstream_refs ?? []), ...sharedRefs])],
    },
    wiki_page: {
      ...input.wiki_page,
      updated_at: input.now,
      canonical_refs: [...new Set(input.active_canonical_refs ?? [])],
      upstream_refs: [...new Set([...(input.wiki_page.upstream_refs ?? []), ...sharedRefs])],
    },
    wiki_claim: {
      ...input.wiki_claim,
      updated_at: input.now,
      statement: "The previous concise-answer preference is not currently active canon and is pending further confirmation.",
      claim_status: "editorial",
      upstream_refs: [...new Set([...(input.wiki_claim.upstream_refs ?? []), ...sharedRefs])],
    },
  };
}

function mergeExistingCanonRecords(input: CanonicalProposalWorkflowInput): CanonicalMemoryObject[] {
  const merged = [...(input.existing_canon_records ?? [])];
  if (input.existing_record && !merged.some((record) => record.id === input.existing_record?.id)) {
    merged.push(input.existing_record);
  }
  return merged;
}

function resolveWorkflowExistingRecord(
  input: CanonicalProposalWorkflowInput,
  existingRecords: CanonicalMemoryObject[],
): CanonicalMemoryObject | undefined {
  const targetId =
    input.proposal.target_ref && typeof input.proposal.target_ref.id === "string"
      ? input.proposal.target_ref.id
      : undefined;
  const targetRecord = targetId
    ? existingRecords.find((record) => record.id === targetId)
    : undefined;

  if (
    input.existing_record &&
    targetRecord &&
    input.existing_record.id !== targetRecord.id
  ) {
    throw new Error(
      `Workflow existing_record ${input.existing_record.id} does not match target_ref ${targetRecord.id}`,
    );
  }

  return targetRecord ?? input.existing_record;
}

export function executeCanonicalProposalWorkflow(input: CanonicalProposalWorkflowInput): CanonicalProposalWorkflowResult {
  const existingRecords = mergeExistingCanonRecords(input);
  const resolvedExistingRecord = resolveWorkflowExistingRecord(input, existingRecords);
  const governance = evaluateCanonicalProposal({
    proposal: input.proposal,
    existing_canon_records: existingRecords,
    now: input.now,
    actor: input.actor,
    ratification_id: input.ratification_id,
    diagnostic_id: input.diagnostic_id,
  });

  if (!governance.accepted) {
    return {
      ...governance,
      updated_records: [],
    };
  }

  const applyResult = applyApprovedCanonicalProposal({
    proposal: input.proposal,
    ratification_record: governance.ratification_record,
    existing_record: resolvedExistingRecord,
    canonical_id: input.canonical_id,
    now: input.now,
  });

  return {
    ...governance,
    created_record: applyResult.created_record,
    updated_records: applyResult.updated_records,
  };
}

export interface OpenClawBootstrapWorkflowInput {
  now: string;
  visibility_state: VisibilityState;
  canonical_records: CanonicalMemoryObject[];
  world_claims: WorldClaim[];
  wiki_pages: WikiPage[];
  wiki_claims: WikiClaim[];
  diagnostics?: Diagnostic[];
  identity_context?: {
    actor_identity_ref?: string | null;
    runtime_instance_ref?: string | null;
    runtime_session_ref?: string | null;
    conversation_thread_ref?: string | null;
  };
  ids: {
    canon_artifact: string;
    world_artifact: string;
    wiki_artifact: string;
    manifest: string;
  };
}

export interface OpenClawBootstrapWorkflowResult {
  markdown: string;
  artifacts: ProjectionArtifact[];
  manifest: ProjectionManifest;
}

export function executeOpenClawBootstrapWorkflow(input: OpenClawBootstrapWorkflowInput): OpenClawBootstrapWorkflowResult {
  return compileOpenClawBootstrapProjection({
    now: input.now,
    visibility_state: input.visibility_state,
    projection_path: "derived/openclaw/bootstrap-memory.md",
    canonical_records: input.canonical_records,
    world_claims: input.world_claims,
    wiki_pages: input.wiki_pages,
    wiki_claims: input.wiki_claims,
    diagnostics: input.diagnostics,
    identity_context: input.identity_context,
    ids: input.ids,
  });
}
