import { applyApprovedCanonicalProposal } from "../canon/engine.js";
import { evaluateCanonicalProposal, type GovernanceEvaluationResult } from "../governance/engine.js";
import { compileOpenClawBootstrapProjection } from "../projection-engine/openclaw.js";
import type {
  CanonicalMemoryObject,
  DispositionRecord,
  Observation,
  ProjectionArtifact,
  ProjectionManifest,
  Proposal,
  RatificationRecord,
  SourceRecord,
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
}

export interface ConversationPreferenceIntakeArtifacts {
  observation: Observation;
  world_claim: WorldClaim;
  wiki_page: WikiPage;
  wiki_claim: WikiClaim;
  proposal: Proposal;
  disposition_record: DispositionRecord;
}

export function buildConversationPreferenceIntake(input: ConversationPreferenceIntakeInput): ConversationPreferenceIntakeArtifacts {
  const provenance = {
    source_type: "conversation",
    source_ref: input.source_record.id,
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

  const disposition_record: DispositionRecord = {
    id: input.ids.disposition,
    kind: "disposition_record",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: input.source_record.visibility_state.privacy_scope,
    },
    provenance: {
      ...provenance,
      evidence_refs: [observation.id],
    },
    input_refs: [observation.id],
    outcomes: ["world_update", "wiki_update", "proposal_for_canon"],
    target_layers: ["world", "wiki", "canon"],
    proposal_refs: [proposal.id],
    reason_codes: ["preference_signal", "editorial_update", "durable_candidate"],
  };

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

function mergeExistingCanonRecords(input: CanonicalProposalWorkflowInput): CanonicalMemoryObject[] {
  const merged = [...(input.existing_canon_records ?? [])];
  if (input.existing_record && !merged.some((record) => record.id === input.existing_record?.id)) {
    merged.push(input.existing_record);
  }
  return merged;
}

export function executeCanonicalProposalWorkflow(input: CanonicalProposalWorkflowInput): CanonicalProposalWorkflowResult {
  const governance = evaluateCanonicalProposal({
    proposal: input.proposal,
    existing_canon_records: mergeExistingCanonRecords(input),
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
    existing_record: input.existing_record,
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
  canonical_records: CanonicalMemoryObject[];
  world_claims: WorldClaim[];
  wiki_pages: WikiPage[];
  wiki_claims: WikiClaim[];
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
    visibility_state: {
      privacy_scope: "owner_private",
    },
    projection_path: "derived/openclaw/bootstrap-memory.md",
    canonical_records: input.canonical_records,
    world_claims: input.world_claims,
    wiki_pages: input.wiki_pages,
    wiki_claims: input.wiki_claims,
    ids: input.ids,
  });
}
