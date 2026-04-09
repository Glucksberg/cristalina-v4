import type {
  CanonicalMemoryObject,
  DispositionRecord,
  Observation,
  Proposal,
  WikiClaim,
  WikiPage,
  WorldClaim,
} from "./types.js";

export interface ConversationPreferenceInput {
  now: string;
  source_ref: string;
  statement: string;
}

export interface MvpFlow001Artifacts {
  observation: Observation;
  world_claim: WorldClaim;
  wiki_page: WikiPage;
  wiki_claim: WikiClaim;
  proposal: Proposal;
  disposition_record: DispositionRecord;
  canonical_candidate: CanonicalMemoryObject;
}

export function buildConversationPreferenceFlow(input: ConversationPreferenceInput): MvpFlow001Artifacts {
  const provenance = {
    source_type: "conversation",
    source_ref: input.source_ref,
  } as const;

  const observation: Observation = {
    id: "obs-mvp-001",
    kind: "observation",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: input.now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance,
    summary: input.statement,
    epistemic_state: "observed",
  };

  const world_claim: WorldClaim = {
    id: "wcl-mvp-001",
    kind: "preference",
    layer: "world",
    authoritative_home: "world",
    created_at: input.now,
    visibility_state: {
      privacy_scope: "owner_private",
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
    id: "wpg-mvp-001",
    kind: "wiki_page",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      ...provenance,
      evidence_refs: [observation.id, world_claim.id],
    },
    page_kind: "entity",
    title: "User Interaction Preferences",
    path: "wiki/pages/user-interaction-preferences.md",
    source_refs: [input.source_ref],
    canonical_refs: [],
    world_refs: [world_claim.id],
  };

  const wiki_claim: WikiClaim = {
    id: "wclm-mvp-001",
    kind: "wiki_claim",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: input.now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      ...provenance,
      evidence_refs: [observation.id, world_claim.id],
    },
    statement: input.statement,
    page_ref: wiki_page.id,
    claim_status: "candidate_for_promotion",
    source_refs: [input.source_ref],
  };

  const proposal: Proposal = {
    id: "prop-mvp-001",
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: {
      privacy_scope: "owner_private",
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
      source_ref: input.source_ref,
      support_refs: [observation.id, world_claim.id, wiki_claim.id],
    },
    reason: "Conversation indicates a user interaction preference that should become governed memory.",
    evidence_refs: [observation.id],
    governance_state: "proposed",
  };

  const disposition_record: DispositionRecord = {
    id: "disp-mvp-001",
    kind: "disposition_record",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: {
      privacy_scope: "owner_private",
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

  const canonical_candidate: CanonicalMemoryObject = {
    id: "mem-mvp-001",
    kind: "preference",
    layer: "canon",
    authoritative_home: "canon",
    created_at: input.now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      ...provenance,
      evidence_refs: [observation.id, world_claim.id, wiki_claim.id],
    },
    statement: input.statement,
    epistemic_state: "confirmed",
    governance_state: "ratified",
    temporal_state: {
      temporal_status: "active",
      valid_from: input.now,
      valid_to: null,
    },
  };

  return {
    observation,
    world_claim,
    wiki_page,
    wiki_claim,
    proposal,
    disposition_record,
    canonical_candidate,
  };
}
