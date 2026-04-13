import { applyApprovedCanonicalProposal } from "../canon/engine.js";
import { evaluateCanonicalProposal, type GovernanceEvaluationResult } from "../governance/engine.js";
import { compileOpenClawBootstrapProjection } from "../projection-engine/openclaw.js";
import { resolvePreferenceSignalSemanticProfile, type PreferenceSignalSemanticProfile } from "./source-intake.js";
import type {
  ActorIdentity,
  CanonicalMemoryObject,
  Contradiction,
  ContradictionResolution,
  Diagnostic,
  DispositionRecord,
  Entity,
  Episode,
  Observation,
  ProjectionArtifact,
  ProjectionManifest,
  Proposal,
  Relation,
  RuntimeInstance,
  RuntimeKind,
  RuntimeSession,
  SourceIntakeKind,
  RatificationRecord,
  SourceRecord,
  VisibilityState,
  ConversationThread,
  WikiClaim,
  WikiPage,
  WorldClaim,
} from "../types.js";
import { DISPOSITION_OUTCOME_TARGET_LAYER } from "../types.js";

export interface ConversationPreferenceIntakeIds {
  observation: string;
  world_claim: string;
  wiki_page: string;
  wiki_claim: string;
  proposal: string;
  disposition: string;
  episode: string;
  subject_entity: string;
  preference_entity: string;
  preference_relation: string;
}

export interface ConversationPreferenceRuntimeIdentityIds {
  agent_identity: string;
  owner_identity?: string;
  runtime_instance: string;
  runtime_session: string;
  conversation_thread: string;
}

export interface ConversationPreferenceRuntimeIdentityContext {
  runtime: RuntimeKind;
  ids: ConversationPreferenceRuntimeIdentityIds;
  agent_label: string;
  owner_label?: string;
  session_objective?: string | null;
  session_summary?: string | null;
  message_refs: string[];
  thread_summary?: string | null;
}

export interface ConversationPreferenceIntakeInput {
  now: string;
  source_record: SourceRecord;
  statement: string;
  intake_kind?: SourceIntakeKind;
  ids: ConversationPreferenceIntakeIds;
  identity_context?: ConversationPreferenceRuntimeIdentityContext;
  semantic_profile?: Partial<PreferenceSignalSemanticProfile>;
  disposition_strategy?: ConversationPreferenceDispositionStrategy;
}

export interface ConversationPreferenceIntakeArtifacts {
  observation: Observation;
  agent_identity?: ActorIdentity;
  owner_identity?: ActorIdentity;
  runtime_instance?: RuntimeInstance;
  runtime_session?: RuntimeSession;
  conversation_thread?: ConversationThread;
  episode: Episode;
  subject_entity: Entity;
  preference_entity: Entity;
  preference_relation: Relation;
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

function normalizeCanonicalIdentityPrivacyScope(
  scope: SourceRecord["visibility_state"]["privacy_scope"],
): SourceRecord["visibility_state"]["privacy_scope"] {
  return scope === "runtime_private" ? "owner_private" : scope;
}

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

function buildRuntimeIdentityArtifacts(
  input: Pick<ConversationPreferenceIntakeInput, "now" | "source_record"> & {
    identity_context?: ConversationPreferenceRuntimeIdentityContext;
  },
): Pick<
  ConversationPreferenceIntakeArtifacts,
  "agent_identity" | "owner_identity" | "runtime_instance" | "runtime_session" | "conversation_thread"
> {
  const context = input.identity_context;
  if (!context) {
    return {};
  }

  const agent_identity: ActorIdentity = {
    id: context.ids.agent_identity,
    kind: "actor_identity",
    layer: "canon",
    authoritative_home: "canon",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: normalizeCanonicalIdentityPrivacyScope(input.source_record.visibility_state.privacy_scope),
    },
    provenance: {
      source_type: "runtime_identity",
      source_ref: input.source_record.provenance.source_ref,
    },
    actor_kind: "agent",
    label: context.agent_label,
    status: "active",
  };

  const owner_identity = context.owner_label
    ? ({
        id: context.ids.owner_identity ?? `${context.ids.runtime_instance}.owner`,
        kind: "actor_identity",
        layer: "canon",
        authoritative_home: "canon",
        created_at: input.now,
        updated_at: input.now,
        visibility_state: {
          privacy_scope: normalizeCanonicalIdentityPrivacyScope(input.source_record.visibility_state.privacy_scope),
        },
        provenance: {
          source_type: "runtime_identity",
          source_ref: input.source_record.provenance.source_ref,
        },
        actor_kind: "owner",
        label: context.owner_label,
        status: "active",
      } satisfies ActorIdentity)
    : undefined;

  const runtime_instance: RuntimeInstance = {
    id: context.ids.runtime_instance,
    kind: "runtime_instance",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      source_type: "runtime_identity",
      source_ref: input.source_record.provenance.source_ref,
      actor_ref: agent_identity.id,
    },
    runtime: context.runtime,
    agent_identity_ref: agent_identity.id,
    owner_identity_ref: owner_identity?.id ?? null,
    status: "active",
  };

  const runtime_session: RuntimeSession = {
    id: context.ids.runtime_session,
    kind: "runtime_session",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      source_type: "runtime_identity",
      source_ref: input.source_record.provenance.source_ref,
      actor_ref: agent_identity.id,
      runtime_ref: runtime_instance.id,
    },
    runtime_instance_ref: runtime_instance.id,
    status: "active",
    objective: context.session_objective ?? null,
    summary: context.session_summary ?? null,
  };

  const conversation_thread: ConversationThread = {
    id: context.ids.conversation_thread,
    kind: "conversation_thread",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      source_type: "runtime_identity",
      source_ref: input.source_record.provenance.source_ref,
      actor_ref: agent_identity.id,
      runtime_ref: runtime_instance.id,
      session_ref: runtime_session.id,
    },
    runtime: context.runtime,
    runtime_instance_ref: runtime_instance.id,
    runtime_session_ref: runtime_session.id,
    message_refs: context.message_refs,
    summary: context.thread_summary ?? null,
  };

  return {
    agent_identity,
    owner_identity,
    runtime_instance,
    runtime_session,
    conversation_thread,
  };
}

function buildSharedProvenance(
  input: Pick<ConversationPreferenceIntakeInput, "source_record" | "identity_context">,
): SourceRecord["provenance"] {
  return {
    source_type: input.identity_context?.runtime === "openclaw" && input.source_record.provenance.source_type !== "conversation"
      ? "openclaw_runtime_feedback"
      : "conversation",
    source_ref: input.source_record.provenance.source_ref,
    actor_ref: input.identity_context?.ids.agent_identity,
    runtime_ref: input.identity_context?.ids.runtime_instance,
    session_ref: input.identity_context?.ids.runtime_session,
    thread_ref: input.identity_context?.ids.conversation_thread,
  };
}

export function buildConversationPreferenceDispositionRecord(input: {
  now: string;
  source_record: SourceRecord;
  observation_id: string;
  episode_id?: string;
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

  const flags: Array<[boolean | undefined, DispositionRecord["outcomes"][number]]> = [
    [strategy.evidence_only, "evidence_only"],
    [strategy.runtime_only, "runtime_only"],
    [strategy.world_update, "world_update"],
    [strategy.wiki_update, "wiki_update"],
    [strategy.proposal_for_canon, "proposal_for_canon"],
    [strategy.queued_review, "queued_review"],
    [(strategy.diagnostic_refs?.length ?? 0) > 0, "diagnostic_only"],
  ];

  for (const [enabled, outcome] of flags) {
    if (!enabled) continue;
    outcomes.push(outcome);
    target_layers.push(DISPOSITION_OUTCOME_TARGET_LAYER[outcome]);
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
      source_type: input.source_record.provenance.source_type,
      source_ref: input.source_record.provenance.source_ref,
      evidence_refs: [input.observation_id, ...(input.episode_id ? [input.episode_id] : [])],
      actor_ref: input.source_record.provenance.actor_ref ?? null,
      runtime_ref: input.source_record.provenance.runtime_ref ?? null,
      session_ref: input.source_record.provenance.session_ref ?? null,
      thread_ref: input.source_record.provenance.thread_ref ?? null,
    },
    input_refs: [input.observation_id, ...(input.episode_id ? [input.episode_id] : [])],
    outcomes: [...new Set(outcomes)],
    target_layers: [...new Set(target_layers)],
    ...(strategy.proposal_for_canon && input.proposal_id ? { proposal_refs: [input.proposal_id] } : {}),
    ...((strategy.diagnostic_refs?.length ?? 0) > 0 ? { diagnostic_refs: strategy.diagnostic_refs } : {}),
    reason_codes: strategy.reason_codes ?? defaultConversationPreferenceReasonCodes(strategy),
  };
}

export function buildPreferenceSignalIntake(input: ConversationPreferenceIntakeInput): ConversationPreferenceIntakeArtifacts {
  const intake_kind = input.intake_kind ?? "conversation_preference";
  const runtimeIdentity = buildRuntimeIdentityArtifacts(input);
  const provenance = buildSharedProvenance(input);
  const semanticProfile = resolvePreferenceSignalSemanticProfile({
    kind: intake_kind,
    owner_label: input.identity_context?.owner_label,
    overrides: input.semantic_profile,
  });
  const evidencePrefix = [
    runtimeIdentity.runtime_instance?.id,
    runtimeIdentity.runtime_session?.id,
    runtimeIdentity.conversation_thread?.id,
  ].filter((value): value is string => typeof value === "string");

  const observationSummary =
    semanticProfile.observation_prefix
      ? `${semanticProfile.observation_prefix}${input.statement}`
      : input.statement;

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
    summary: observationSummary,
    epistemic_state: "observed",
    runtime_instance_ref: runtimeIdentity.runtime_instance?.id ?? null,
    runtime_session_ref: runtimeIdentity.runtime_session?.id ?? null,
    conversation_thread_ref: runtimeIdentity.conversation_thread?.id ?? null,
  };

  const episode: Episode = {
    id: input.ids.episode,
    kind: "episode",
    layer: "world",
    authoritative_home: "world",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      ...provenance,
      evidence_refs: [...evidencePrefix, observation.id],
    },
    summary: semanticProfile.episode_summary,
    observation_refs: [observation.id],
    temporal_state: {
      temporal_status: "active",
      valid_from: input.now,
      valid_to: null,
    },
  };

  const subject_entity: Entity = {
    id: input.ids.subject_entity,
    kind: "entity",
    layer: "world",
    authoritative_home: "world",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      ...provenance,
      evidence_refs: [...evidencePrefix, observation.id, episode.id],
    },
    entity_kind: semanticProfile.subject_entity_kind,
    label: semanticProfile.subject_label,
    status: "active",
  };

  const preference_entity: Entity = {
    id: input.ids.preference_entity,
    kind: "entity",
    layer: "world",
    authoritative_home: "world",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      ...provenance,
      evidence_refs: [...evidencePrefix, observation.id, episode.id],
    },
    entity_kind: "topic",
    label: semanticProfile.preference_topic_label,
    status: "active",
  };

  const preference_relation: Relation = {
    id: input.ids.preference_relation,
    kind: "relation",
    layer: "world",
    authoritative_home: "world",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      ...provenance,
      evidence_refs: [...evidencePrefix, observation.id, episode.id],
    },
    subject_ref: {
      id: subject_entity.id,
      kind: subject_entity.kind,
      layer: subject_entity.layer,
    },
    object_ref: {
      id: preference_entity.id,
      kind: preference_entity.kind,
      layer: preference_entity.layer,
    },
    relation_type: semanticProfile.relation_type,
    temporal_state: {
      temporal_status: "active",
      valid_from: input.now,
      valid_to: null,
    },
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
      evidence_refs: [...evidencePrefix, observation.id, episode.id, preference_relation.id],
    },
    statement: input.statement,
    epistemic_state: "inferred",
    temporal_state: {
      temporal_status: "active",
      valid_from: input.now,
      valid_to: null,
    },
    support_refs: [observation.id, episode.id, preference_relation.id],
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
      evidence_refs: [...evidencePrefix, observation.id, episode.id, world_claim.id],
    },
    page_kind: "entity",
    title: semanticProfile.wiki_title,
    path: semanticProfile.wiki_path,
    source_refs: [input.source_record.id],
    canonical_refs: [],
    world_refs: [world_claim.id, episode.id, subject_entity.id, preference_entity.id, preference_relation.id],
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
      evidence_refs: [...evidencePrefix, observation.id, episode.id, world_claim.id],
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
      evidence_refs: [...evidencePrefix, observation.id, episode.id, world_claim.id, wiki_claim.id],
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
      support_refs: [observation.id, episode.id, world_claim.id, wiki_claim.id, preference_relation.id],
    },
    reason: semanticProfile.proposal_reason,
    evidence_refs: [observation.id, episode.id],
    governance_state: "proposed",
  };

  const disposition_record = buildConversationPreferenceDispositionRecord({
    now: input.now,
    source_record: {
      ...input.source_record,
      provenance,
    },
    observation_id: observation.id,
    episode_id: episode.id,
    disposition_id: input.ids.disposition,
    proposal_id: proposal.id,
    strategy: input.disposition_strategy,
  });

  return {
    ...runtimeIdentity,
    observation,
    episode,
    subject_entity,
    preference_entity,
    preference_relation,
    world_claim,
    wiki_page,
    wiki_claim,
    proposal,
    disposition_record,
  };
}

export function buildConversationPreferenceIntake(input: ConversationPreferenceIntakeInput): ConversationPreferenceIntakeArtifacts {
  return buildPreferenceSignalIntake({
    ...input,
    intake_kind: "conversation_preference",
  });
}

export function buildOpenClawPreferenceFeedbackIntake(
  input: Omit<ConversationPreferenceIntakeInput, "intake_kind">,
): ConversationPreferenceIntakeArtifacts {
  return buildPreferenceSignalIntake({
    ...input,
    intake_kind: "openclaw_projection_feedback",
  });
}

export function buildStructuredPreferenceSignalIntake(
  input: Omit<ConversationPreferenceIntakeInput, "intake_kind">,
): ConversationPreferenceIntakeArtifacts {
  return buildPreferenceSignalIntake({
    ...input,
    intake_kind: "structured_preference_signal",
  });
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

export interface ContradictionDetectionInput {
  now: string;
  contradiction_id: string;
  candidate_claim: WorldClaim;
  existing_world_claims: WorldClaim[];
}

export function findConflictingWorldClaim(
  candidate_claim: WorldClaim,
  existing_world_claims: WorldClaim[],
): WorldClaim | undefined {
  return existing_world_claims.find((record) => {
    const isComparableKind = record.kind === candidate_claim.kind;
    const isDifferentRecord = record.id !== candidate_claim.id;
    const isActive = record.temporal_state?.temporal_status === "active";
    const isDifferentStatement = record.statement !== candidate_claim.statement;
    return isComparableKind && isDifferentRecord && isActive && isDifferentStatement;
  });
}

export interface ContradictionResolutionProposalInput {
  now: string;
  resolution_id: string;
  contradiction: Contradiction;
  existing_claim: WorldClaim;
  candidate_claim: WorldClaim;
}

export interface ContradictionResolutionApplicationResult {
  contradiction: Contradiction;
  existing_claim: WorldClaim;
  candidate_claim: WorldClaim;
}

export interface AcceptedContradictionResolutionApplicationResult extends ContradictionResolutionApplicationResult {
  resolution: ContradictionResolution;
}

export function acceptContradictionResolution(input: {
  now: string;
  resolution: ContradictionResolution;
}): ContradictionResolution {
  if (input.resolution.status === "rejected") {
    throw new Error("Rejected contradiction resolutions cannot be accepted");
  }

  if (input.resolution.status === "applied") {
    throw new Error("Applied contradiction resolutions cannot be accepted again");
  }

  return {
    ...input.resolution,
    updated_at: input.now,
    status: "accepted",
  };
}

export function detectWorldClaimContradiction(
  input: ContradictionDetectionInput,
): Contradiction | undefined {
  const conflictingClaim = findConflictingWorldClaim(input.candidate_claim, input.existing_world_claims);

  if (!conflictingClaim) {
    return undefined;
  }

  return {
    id: input.contradiction_id,
    kind: "contradiction",
    layer: "world",
    authoritative_home: "world",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: input.candidate_claim.visibility_state,
    provenance: {
      ...input.candidate_claim.provenance,
      source_type: "contradiction_detection",
      evidence_refs: [conflictingClaim.id, input.candidate_claim.id],
    },
    left_ref: {
      id: conflictingClaim.id,
      kind: conflictingClaim.kind,
      layer: conflictingClaim.layer,
    },
    right_ref: {
      id: input.candidate_claim.id,
      kind: input.candidate_claim.kind,
      layer: input.candidate_claim.layer,
    },
    status: "open",
  };
}

export function proposeContradictionResolution(
  input: ContradictionResolutionProposalInput,
): ContradictionResolution {
  const canCoexistTemporally =
    !!input.candidate_claim.temporal_state?.valid_from &&
    !!input.existing_claim.temporal_state?.valid_from &&
    input.candidate_claim.temporal_state.valid_from !== input.existing_claim.temporal_state.valid_from;

  const strategy = canCoexistTemporally ? "coexist_temporally" : "manual_review";
  const rationale = canCoexistTemporally
    ? "Claims appear to describe different temporal windows; propose explicit temporal coexistence and closing of the older active claim."
    : "Claims conflict without enough temporal structure for automatic resolution; require review.";

  return {
    id: input.resolution_id,
    kind: "contradiction_resolution",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: input.candidate_claim.visibility_state,
    provenance: {
      ...input.candidate_claim.provenance,
      source_type: "contradiction_resolution",
      evidence_refs: [input.contradiction.id, input.existing_claim.id, input.candidate_claim.id],
    },
    contradiction_ref: input.contradiction.id,
    strategy,
    status: "proposed",
    winning_ref: {
      id: input.candidate_claim.id,
      kind: input.candidate_claim.kind,
      layer: input.candidate_claim.layer,
    },
    losing_ref: {
      id: input.existing_claim.id,
      kind: input.existing_claim.kind,
      layer: input.existing_claim.layer,
    },
    rationale,
  };
}

export function applyContradictionResolution(input: {
  now: string;
  contradiction: Contradiction;
  resolution: ContradictionResolution;
  existing_claim: WorldClaim;
  candidate_claim: WorldClaim;
}): ContradictionResolutionApplicationResult {
  const contradictionBase: Contradiction = {
    ...input.contradiction,
    updated_at: input.now,
  };

  switch (input.resolution.strategy) {
    case "dismiss_contradiction":
      return {
        contradiction: {
          ...contradictionBase,
          status: "dismissed",
        },
        existing_claim: input.existing_claim,
        candidate_claim: input.candidate_claim,
      };
    case "supersede_candidate":
      return {
        contradiction: {
          ...contradictionBase,
          status: "resolved",
        },
        existing_claim: input.existing_claim,
        candidate_claim: {
          ...input.candidate_claim,
          updated_at: input.now,
          epistemic_state: "disputed",
          temporal_state: closeWorldClaimTemporalState(input.candidate_claim, input.now),
        },
      };
    case "coexist_temporally":
    case "supersede_existing":
      return {
        contradiction: {
          ...contradictionBase,
          status: "resolved",
        },
        existing_claim: {
          ...input.existing_claim,
          updated_at: input.now,
          epistemic_state: "disputed",
          temporal_state: closeWorldClaimTemporalState(input.existing_claim, input.now),
        },
        candidate_claim: input.candidate_claim,
      };
    case "manual_review":
    default:
      return {
        contradiction: contradictionBase,
        existing_claim: input.existing_claim,
        candidate_claim: input.candidate_claim,
      };
  }
}

export function applyAcceptedContradictionResolution(input: {
  now: string;
  contradiction: Contradiction;
  resolution: ContradictionResolution;
  existing_claim: WorldClaim;
  candidate_claim: WorldClaim;
}): AcceptedContradictionResolutionApplicationResult {
  if (input.resolution.status !== "accepted") {
    throw new Error("Only accepted contradiction resolutions can be applied");
  }

  const resolution: ContradictionResolution = {
    ...input.resolution,
    updated_at: input.now,
    status: "applied",
  };

  const applied = applyContradictionResolution({
    ...input,
    resolution,
  });

  return {
    resolution,
    ...applied,
  };
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
  episodes?: Episode[];
  entities?: Entity[];
  relations?: Relation[];
  contradictions?: Contradiction[];
  contradiction_resolutions?: ContradictionResolution[];
  wiki_pages: WikiPage[];
  wiki_claims: WikiClaim[];
  diagnostics?: Diagnostic[];
  runtime_identity?: {
    actor_identity?: ActorIdentity;
    owner_identity?: ActorIdentity;
    runtime_instance?: RuntimeInstance;
    runtime_session?: RuntimeSession;
    conversation_thread?: ConversationThread;
  };
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
    episodes: input.episodes ?? [],
    entities: input.entities ?? [],
    relations: input.relations ?? [],
    contradictions: input.contradictions ?? [],
    contradiction_resolutions: input.contradiction_resolutions ?? [],
    wiki_pages: input.wiki_pages,
    wiki_claims: input.wiki_claims,
    diagnostics: input.diagnostics,
    runtime_identity: input.runtime_identity,
    identity_context: input.identity_context,
    ids: input.ids,
  });
}
