export const MEMORY_OBJECT_KINDS = [
  "fact",
  "belief",
  "preference",
  "constraint",
  "goal",
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

export type MemoryObjectKind = typeof MEMORY_OBJECT_KINDS[number];
export type EpistemicState = typeof EPISTEMIC_STATES[number];
export type GovernanceState = typeof GOVERNANCE_STATES[number];
export type TemporalStatus = typeof TEMPORAL_STATUSES[number];
export type VisibilityScope = typeof VISIBILITY_SCOPES[number];
export type Layer = typeof LAYERS[number];

export interface Reference {
  id: string;
  kind?: string;
  layer?: Layer;
}

export interface Provenance {
  sourceType: string;
  sourceRef: string;
  evidenceRefs?: string[];
}

export interface SourceRecord {
  id: string;
  kind: "source_record";
  createdAt: string;
  sourceType: string;
  sourceRef: string;
  contentRef: string;
  visibility: VisibilityScope;
}

export interface Observation {
  id: string;
  kind: "observation";
  summary: string;
  createdAt: string;
  epistemicState: EpistemicState;
  sourceRef: string;
  visibility: VisibilityScope;
}

export interface Episode {
  id: string;
  kind: "episode";
  summary: string;
  observationRefs: string[];
  validFrom: string;
  validTo: string | null;
}

export interface Entity {
  id: string;
  kind: "entity";
  entityKind: string;
  label: string;
  status: "active" | "inactive" | "archived";
}

export interface Relation {
  id: string;
  kind: "relation";
  subjectRef: Reference;
  objectRef: Reference;
  relationType: string;
  validFrom: string | null;
  validTo: string | null;
}

export interface WorldClaim {
  id: string;
  kind: Exclude<MemoryObjectKind, "entity" | "relation" | "episode">;
  statement: string;
  epistemicState: EpistemicState;
  temporalStatus: TemporalStatus;
  supportRefs: string[];
}

export interface CanonicalMemoryObject {
  id: string;
  kind: Exclude<MemoryObjectKind, "entity" | "relation" | "episode">;
  statement: string;
  epistemicState: EpistemicState;
  governanceState: GovernanceState;
  createdAt: string;
  sourceRef: string;
  visibility: VisibilityScope;
}

export const PROPOSAL_OPERATIONS = [
  "create",
  "revise",
  "confirm",
  "supersede",
  "deprecate",
  "link",
  "contradict",
] as const;

export type ProposalOperation = typeof PROPOSAL_OPERATIONS[number];

export interface Proposal {
  id: string;
  kind: "proposal";
  operation: ProposalOperation;
  candidateKind: string;
  targetLayer: Extract<Layer, "world" | "canon" | "wiki" | "governance">;
  targetRef: Reference | null;
  candidatePayload: Record<string, unknown>;
  reason: string;
  evidenceRefs: string[];
  governanceState: Exclude<GovernanceState, "ratified" | "superseded">;
}

export interface RatificationRecord {
  id: string;
  kind: "ratification";
  proposalRef: string;
  decision: "approved" | "rejected" | "deferred";
  actor: string;
  createdAt: string;
}

export interface Contradiction {
  id: string;
  kind: "contradiction";
  leftRef: Reference;
  rightRef: Reference;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
}

export interface WikiPage {
  id: string;
  kind: "wiki_page";
  pageKind: "source" | "entity" | "topic" | "comparison" | "synthesis" | "index" | "log";
  title: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  sourceRefs: string[];
  canonicalRefs: string[];
  worldRefs: string[];
}

export interface WikiClaim {
  id: string;
  kind: "wiki_claim";
  pageRef: string;
  statement: string;
  claimStatus: "editorial" | "candidate_for_promotion" | "rejected";
  sourceRefs: string[];
}

export interface ProjectionArtifact {
  id: string;
  kind: "projection_artifact";
  adapter: "openclaw" | "hermes";
  artifactKind: string;
  path: string;
  upstreamRefs: string[];
  createdAt: string;
}

export interface Diagnostic {
  id: string;
  kind: "diagnostic";
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  relatedRefs: string[];
}

export type CoreRecord =
  | SourceRecord
  | Observation
  | Episode
  | Entity
  | Relation
  | WorldClaim
  | CanonicalMemoryObject
  | Proposal
  | RatificationRecord
  | Contradiction
  | WikiPage
  | WikiClaim
  | ProjectionArtifact
  | Diagnostic;
