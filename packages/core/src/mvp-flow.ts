import type {
  CanonicalMemoryObject,
  Observation,
  Proposal,
  WikiClaim,
  WikiPage,
  WorldClaim,
} from "./types.js";

export interface ConversationPreferenceInput {
  now: string;
  sourceRef: string;
  statement: string;
}

export interface MvpFlow001Artifacts {
  observation: Observation;
  worldClaim: WorldClaim;
  wikiPage: WikiPage;
  wikiClaim: WikiClaim;
  proposal: Proposal;
  canonicalCandidate: CanonicalMemoryObject;
}

export function buildConversationPreferenceFlow(input: ConversationPreferenceInput): MvpFlow001Artifacts {
  const observation: Observation = {
    id: "obs-mvp-001",
    kind: "observation",
    summary: input.statement,
    createdAt: input.now,
    epistemicState: "observed",
    sourceRef: input.sourceRef,
    visibility: "owner_private",
  };

  const worldClaim: WorldClaim = {
    id: "wcl-mvp-001",
    kind: "preference",
    statement: input.statement,
    epistemicState: "inferred",
    temporalStatus: "active",
    supportRefs: [observation.id],
  };

  const wikiPage: WikiPage = {
    id: "wpg-mvp-001",
    kind: "wiki_page",
    pageKind: "entity",
    title: "User Interaction Preferences",
    path: "wiki/pages/user-interaction-preferences.md",
    createdAt: input.now,
    updatedAt: input.now,
    sourceRefs: [input.sourceRef],
    canonicalRefs: [],
    worldRefs: [worldClaim.id],
  };

  const wikiClaim: WikiClaim = {
    id: "wclm-mvp-001",
    kind: "wiki_claim",
    pageRef: wikiPage.id,
    statement: input.statement,
    claimStatus: "candidate_for_promotion",
    sourceRefs: [input.sourceRef],
  };

  const proposal: Proposal = {
    id: "prop-mvp-001",
    kind: "proposal",
    operation: "create",
    candidateKind: "preference",
    targetLayer: "canon",
    targetRef: null,
    candidatePayload: {
      kind: "preference",
      statement: input.statement,
      sourceRef: input.sourceRef,
      supportRefs: [observation.id, worldClaim.id, wikiClaim.id],
    },
    reason: "Conversation indicates a user interaction preference that should become governed memory.",
    evidenceRefs: [observation.id],
    governanceState: "proposed",
  };

  const canonicalCandidate: CanonicalMemoryObject = {
    id: "mem-mvp-001",
    kind: "preference",
    statement: input.statement,
    epistemicState: "confirmed",
    governanceState: "ratified",
    createdAt: input.now,
    sourceRef: input.sourceRef,
    visibility: "owner_private",
  };

  return {
    observation,
    worldClaim,
    wikiPage,
    wikiClaim,
    proposal,
    canonicalCandidate,
  };
}
