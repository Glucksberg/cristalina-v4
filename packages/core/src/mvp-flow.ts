import type {
  CanonicalMemoryObject,
  Diagnostic,
  DispositionRecord,
  Observation,
  Proposal,
  RatificationRecord,
  WikiClaim,
  WikiPage,
  WorldClaim,
} from "./types.js";
import { buildConversationPreferenceIntake, executeCanonicalProposalWorkflow } from "./workflow-engine/pipeline.js";

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
  ratification_record: RatificationRecord;
  canonical_candidate: CanonicalMemoryObject;
  diagnostic?: Diagnostic;
}

export function buildConversationPreferenceFlow(input: ConversationPreferenceInput): MvpFlow001Artifacts {
  const source_record = {
    id: input.source_ref,
    kind: "source_record",
    layer: "raw",
    authoritative_home: "raw",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      privacy_scope: "owner_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: input.source_ref,
    },
    content_ref: `raw/sources/${input.source_ref}.json`,
  } as const;

  const intake = buildConversationPreferenceIntake({
    now: input.now,
    source_record,
    statement: input.statement,
    ids: {
      observation: "obs-mvp-001",
      world_claim: "wcl-mvp-001",
      wiki_page: "wpg-mvp-001",
      wiki_claim: "wclm-mvp-001",
      proposal: "prop-mvp-001",
      disposition: "disp-mvp-001",
    },
  });

  const governance_result = executeCanonicalProposalWorkflow({
    proposal: intake.proposal,
    existing_canon_records: [],
    now: input.now,
    actor: "system:auto-ratify-mvp",
    ratification_id: "rat-mvp-001",
    diagnostic_id: "diag-mvp-001",
    canonical_id: "mem-mvp-001",
  });

  if (!governance_result.accepted) {
    throw new Error("MVP flow proposal should be accepted by baseline governance");
  }

  const ratification_record: RatificationRecord = governance_result.ratification_record;
  const canonical_candidate = governance_result.created_record as CanonicalMemoryObject;

  return {
    observation: intake.observation,
    world_claim: intake.world_claim,
    wiki_page: intake.wiki_page,
    wiki_claim: intake.wiki_claim,
    proposal: intake.proposal,
    disposition_record: intake.disposition_record,
    ratification_record,
    canonical_candidate,
    diagnostic: governance_result.diagnostic,
  };
}
