import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { applyApprovedCanonicalProposal } from "./canon/engine.js";
import { evaluateCanonicalProposal } from "./governance/engine.js";
import {
  CANONICAL_CLAIM_KINDS,
  DISPOSITION_OUTCOMES,
  EPISTEMIC_STATES,
  SUBJECT_AUTHORITY_ROLES,
  type AuthenticatedPrincipal,
  type CanonicalMemoryObject,
  type CoreRecord,
  type CurationPacket,
  type Diagnostic,
  type DispositionOutcome,
  type DispositionRecord,
  type Entity,
  type EpistemicState,
  type Episode,
  type Observation,
  type Proposal,
  type RatificationRecord,
  type RuntimeKind,
  type SourceRecord,
  type SubjectAuthorityRole,
  type WikiClaim,
  type WikiPage,
  type WorldClaim,
} from "./types.js";
import {
  initializeStore,
  loadCanonicalRecords,
  loadRuntimeObservations,
  loadSourceRecords,
  loadWikiPages,
  writeCoreRecord,
} from "./store/io.js";
import type { MemoryConsolidation, MemoryConsolidationItem } from "./memory-consolidation.js";

export type MemoryMaturationConfidence = "low" | "medium" | "high";
export type MemoryMaturationRisk = "low" | "medium" | "high";

export interface StructuredMemoryClaimCandidate {
  candidate_id: string;
  statement: string;
  memory_kind: typeof CANONICAL_CLAIM_KINDS[number];
  epistemic_state: EpistemicState;
  semantic_slot: string;
  subject_authority_role: SubjectAuthorityRole;
  confidence: MemoryMaturationConfidence;
  risk: MemoryMaturationRisk;
  support_refs: string[];
  recommended_dispositions: DispositionOutcome[];
  rationale: string;
  wiki_title?: string;
  wiki_path?: string;
  evaluation_episode?: StructuredMemoryEvaluationEpisode;
  corroboration?: {
    semantic_slot: string;
    support_count: number;
    prior_candidate_count: number;
    distinct_observation_days: number;
    support_refs: string[];
    auto_canon_eligible: boolean;
    rationale: string;
  };
}

export interface StructuredMemoryEvaluationEpisode {
  record_type: "evaluation_episode" | "test_fixture" | "fictional_example_episode";
  entity: {
    name: string;
    type: string;
    reality: "fictional" | "test_only" | "synthetic";
  };
  scope: string[];
  purpose: string;
  initial_claim?: {
    statement: string;
    status: string;
    authority?: string;
    scope?: string;
  };
  correction_claim?: {
    statement: string;
    status: string;
    authority?: string;
    scope?: string;
  };
  supersession_relation?: {
    from: string;
    to: string;
    relation: string;
    reason?: string;
  };
  lifecycle_state: string;
  usage_policy: {
    allowed: string[];
    forbidden: string[];
  };
  linked_governance_slots?: string[];
  projection_hint: string;
}

export interface MemoryMaturationEvidencePackage {
  schema_version: 1;
  maturation_contract: "cristalina.memory_maturation.v1";
  runtime: RuntimeKind;
  source_consolidation_ref: string;
  source_consolidation_id: string;
  skipped_already_matured_observation_refs: string[];
  selected_items: MemoryConsolidationItem[];
  observations: Array<{
    observation_ref: string;
    observed_at: string;
    summary_preview: string;
    full_summary: string;
  }>;
  instructions: string[];
}

export interface MemoryMaturation {
  schema_version: 1;
  maturation_contract: "cristalina.memory_maturation.v1";
  maturation_id: string;
  created_at: string;
  runtime: RuntimeKind;
  source_consolidation_ref: string;
  source_consolidation_id: string;
  mode: "llm_structured_claims";
  llm_contract_version: "structured_memory_claims.v1";
  candidates: StructuredMemoryClaimCandidate[];
  diagnostics: string[];
  authority_note: string;
}

export interface RunMemoryMaturationInput {
  rootDir: string;
  runtime: RuntimeKind;
  llmOutput: unknown;
  write?: boolean;
  maxItems?: number;
  now?: string;
  authenticated_principal?: AuthenticatedPrincipal;
}

export interface RunMemoryMaturationResult {
  schema_version: 1;
  status: "compiled" | "applied";
  maturation: MemoryMaturation;
  evidence_package: MemoryMaturationEvidencePackage;
  applied?: {
    record_refs: string[];
    canonical_record_refs: string[];
    queued_review_refs: string[];
    diagnostic_refs: string[];
  };
}

export interface MemoryCanonCandidateSummary {
  semantic_slot: string;
  candidate_count: number;
  support_count: number;
  distinct_observation_days: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  latest_statement: string | null;
  latest_memory_kind: typeof CANONICAL_CLAIM_KINDS[number] | null;
  latest_epistemic_state: EpistemicState | null;
  latest_confidence: MemoryMaturationConfidence | null;
  latest_risk: MemoryMaturationRisk | null;
  latest_subject_authority_role: SubjectAuthorityRole | null;
  latest_rationale: string | null;
  subject_authority_roles: SubjectAuthorityRole[];
  has_active_canon: boolean;
  auto_canon_eligible: boolean;
  suggested_action: "already_canon" | "auto_canon_ready" | "needs_more_support" | "owner_review" | "keep_evidence";
  support_refs: string[];
}

export interface MemoryCanonCandidateReport {
  schema_version: 1;
  runtime: RuntimeKind;
  generated_at: string;
  totals: {
    semantic_slots: number;
    auto_canon_ready: number;
    already_canon: number;
    needs_more_support: number;
    owner_review: number;
  };
  candidates: MemoryCanonCandidateSummary[];
}

export interface PromoteMemoryCanonCandidatesResult {
  schema_version: 1;
  status: "planned" | "applied";
  runtime: RuntimeKind;
  generated_at: string;
  selected: Array<{
    semantic_slot: string;
    action: "canon" | "wiki";
    reason: string;
    support_count: number;
    distinct_observation_days: number;
  }>;
  skipped: Array<{
    semantic_slot: string;
    reason: string;
  }>;
  owner_review: Array<{
    semantic_slot: string;
    question: string;
    support_count: number;
    distinct_observation_days: number;
  }>;
  applied?: {
    record_refs: string[];
    canonical_record_refs: string[];
    queued_review_refs: string[];
    diagnostic_refs: string[];
  };
}

interface MemoryMaturationRawFile {
  relative_path: string;
  payload: unknown;
}

interface MemoryMaturationRecoveryJournal {
  version: 1;
  operation: "memory_maturation";
  created_at: string;
  raw_files: MemoryMaturationRawFile[];
  records: CoreRecord[];
}

const CLAIM_KIND_SET = new Set<string>(CANONICAL_CLAIM_KINDS);
const EPISTEMIC_STATE_SET = new Set<string>(EPISTEMIC_STATES);
const AUTHORITY_ROLE_SET = new Set<string>(SUBJECT_AUTHORITY_ROLES);
const DISPOSITION_SET = new Set<string>(DISPOSITION_OUTCOMES);
const MEMORY_MATURATION_RECOVERY_PREFIX = "recovery-memory-maturation-";
const MEMORY_MATURATION_RECOVERY_SUFFIX = ".json";
const MEMORY_MATURATION_LOCK_TIMEOUT_MS = 120_000;
const MEMORY_MATURATION_LOCK_STALE_MS = 120_000;
const MEMORY_MATURATION_LOCK_POLL_MS = 25;

function stableDigest(value: unknown, length = 16): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
}

function safeIdPart(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) return "claim";
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 59)}_${stableDigest(normalized, 12)}`;
}

function parseObservationSummary(observation: Observation): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(observation.summary) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function observationEventType(observation: Observation): string | null {
  const parsed = parseObservationSummary(observation);
  return typeof parsed?.event_type === "string" ? parsed.event_type : null;
}

function observationConsolidation(observation: Observation): MemoryConsolidation | null {
  const parsed = parseObservationSummary(observation);
  const consolidation = parsed?.consolidation;
  if (
    consolidation &&
    typeof consolidation === "object" &&
    (consolidation as { consolidation_contract?: unknown }).consolidation_contract === "cristalina.memory_consolidation.v1"
  ) {
    return consolidation as MemoryConsolidation;
  }
  return null;
}

function observationText(observation: Observation): string {
  const parsed = parseObservationSummary(observation);
  if (typeof parsed?.message === "string") return parsed.message;
  return observation.summary;
}

function compareObservedAtDesc(left: Observation, right: Observation): number {
  return Date.parse(right.observed_at ?? right.created_at) - Date.parse(left.observed_at ?? left.created_at) ||
    right.id.localeCompare(left.id);
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 40;
  return Math.max(1, Math.min(Math.floor(value!), 120));
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((entry) => rightSet.has(entry));
}

function normalizeDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function mergeUniqueStrings(...groups: string[][]): string[] {
  const out: string[] = [];
  for (const group of groups) {
    for (const value of group) {
      if (value && !out.includes(value)) out.push(value);
    }
  }
  return out;
}

function emptySlotSummary(semanticSlot: string): MemoryCanonCandidateSummary {
  return {
    semantic_slot: semanticSlot,
    candidate_count: 0,
    support_count: 0,
    distinct_observation_days: 0,
    first_seen_at: null,
    last_seen_at: null,
    latest_statement: null,
    latest_memory_kind: null,
    latest_epistemic_state: null,
    latest_confidence: null,
    latest_risk: null,
    latest_subject_authority_role: null,
    latest_rationale: null,
    subject_authority_roles: [],
    has_active_canon: false,
    auto_canon_eligible: false,
    suggested_action: "needs_more_support",
    support_refs: [],
  };
}

function updateSlotSummary(input: {
  summary: MemoryCanonCandidateSummary;
  candidate: StructuredMemoryClaimCandidate;
  createdAt: string | null;
  observationDaysByRef: Map<string, string>;
}): MemoryCanonCandidateSummary {
  const supportRefs = mergeUniqueStrings(input.summary.support_refs, input.candidate.support_refs);
  const days = new Set(
    supportRefs
      .map((ref) => input.observationDaysByRef.get(ref))
      .filter((day): day is string => Boolean(day)),
  );
  const firstSeen = [input.summary.first_seen_at, input.createdAt].filter((entry): entry is string => Boolean(entry)).sort()[0] ?? null;
  const lastSeen = [input.summary.last_seen_at, input.createdAt].filter((entry): entry is string => Boolean(entry)).sort().at(-1) ?? null;
  return {
    ...input.summary,
    candidate_count: input.summary.candidate_count + 1,
    support_count: supportRefs.length,
    distinct_observation_days: days.size,
    first_seen_at: firstSeen,
    last_seen_at: lastSeen,
    latest_statement: input.candidate.statement,
    latest_memory_kind: input.candidate.memory_kind,
    latest_epistemic_state: input.candidate.epistemic_state,
    latest_confidence: input.candidate.confidence,
    latest_risk: input.candidate.risk,
    latest_subject_authority_role: input.candidate.subject_authority_role,
    latest_rationale: input.candidate.rationale,
    subject_authority_roles: mergeUniqueStrings(input.summary.subject_authority_roles, [input.candidate.subject_authority_role]) as SubjectAuthorityRole[],
    support_refs: supportRefs,
  };
}

function isLowRiskCanonEligible(input: {
  candidate: StructuredMemoryClaimCandidate;
  supportCount: number;
  distinctDays: number;
  priorCandidateCount: number;
}): boolean {
  if (input.candidate.subject_authority_role === "owner") return false;
  if (input.candidate.risk !== "low") return false;
  if (input.candidate.confidence === "low") return false;
  if (input.candidate.epistemic_state === "hypothesized" || input.candidate.epistemic_state === "disputed") return false;
  if (input.supportCount >= 5) return true;
  if (input.supportCount >= 3 && input.distinctDays >= 2) return true;
  return input.priorCandidateCount >= 1 && input.supportCount >= 3;
}

function shouldProposeReviewFromCorroboration(input: {
  candidate: StructuredMemoryClaimCandidate;
  supportCount: number;
  distinctDays: number;
}): boolean {
  if (input.candidate.subject_authority_role === "owner") return true;
  if (input.candidate.risk === "high") return false;
  return input.supportCount >= 5 || input.distinctDays >= 3;
}

function applyCorroborationPolicy(
  candidate: StructuredMemoryClaimCandidate,
  historical: MemoryCanonCandidateSummary | undefined,
  observationDaysByRef: Map<string, string>,
): StructuredMemoryClaimCandidate {
  const supportRefs = mergeUniqueStrings(historical?.support_refs ?? [], candidate.support_refs);
  const distinctDays = new Set(
    supportRefs
      .map((ref) => observationDaysByRef.get(ref))
      .filter((day): day is string => Boolean(day)),
  ).size;
  const priorCandidateCount = historical?.candidate_count ?? 0;
  const supportCount = supportRefs.length;
  const autoCanonEligible = isLowRiskCanonEligible({ candidate, supportCount, distinctDays, priorCandidateCount });
  const reviewProposalEligible = !autoCanonEligible && shouldProposeReviewFromCorroboration({ candidate, supportCount, distinctDays });
  const dispositions = new Set(candidate.recommended_dispositions);

  if (autoCanonEligible || reviewProposalEligible) {
    dispositions.delete("evidence_only");
    dispositions.add("world_update");
    dispositions.add("wiki_update");
    dispositions.add("proposal_for_canon");
  }
  if (autoCanonEligible) {
    dispositions.delete("queued_review");
  } else if (reviewProposalEligible) {
    dispositions.add("queued_review");
  }

  return {
    ...candidate,
    recommended_dispositions: [...dispositions],
    corroboration: {
      semantic_slot: candidate.semantic_slot,
      support_count: supportCount,
      prior_candidate_count: priorCandidateCount,
      distinct_observation_days: distinctDays,
      support_refs: supportRefs,
      auto_canon_eligible: autoCanonEligible,
      rationale: autoCanonEligible
        ? "Promoted by corroboration policy: low risk, non-owner authority, repeated support, and no disputed epistemic state."
        : reviewProposalEligible
          ? "Escalated by corroboration policy: repeated support deserves governed review before canon."
          : "Retained below auto-canon threshold.",
    },
  };
}

async function loadObservationDaysByRef(rootDir: string): Promise<Map<string, string>> {
  const observations = await loadRuntimeObservations(rootDir);
  return new Map(
    observations
      .map((observation) => [observation.id, normalizeDay(observation.observed_at ?? observation.created_at)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
}

async function loadMemoryMaturationSlotSummaries(rootDir: string, runtime: RuntimeKind): Promise<Map<string, MemoryCanonCandidateSummary>> {
  const observationDaysByRef = await loadObservationDaysByRef(rootDir);
  const summaries = new Map<string, MemoryCanonCandidateSummary>();
  const sources = await loadSourceRecords(rootDir);
  for (const record of sources) {
    if (record.provenance.source_type !== "memory_maturation") continue;
    if (!record.content_ref.startsWith("raw/sources/")) continue;
    try {
      const payload = JSON.parse(await readFile(join(rootDir, record.content_ref), "utf8")) as {
        evidence_package?: { runtime?: unknown };
        maturation?: { diagnostics?: unknown; candidates?: unknown[]; created_at?: unknown };
      };
      if (payload.evidence_package?.runtime !== runtime) continue;
      if (!Array.isArray(payload.maturation?.diagnostics) || payload.maturation.diagnostics.length !== 0) continue;
      for (const entry of payload.maturation.candidates ?? []) {
        const candidate = entry as Partial<StructuredMemoryClaimCandidate>;
        if (typeof candidate.semantic_slot !== "string" || !candidate.semantic_slot) continue;
        if (!Array.isArray(candidate.support_refs)) continue;
        const normalized = candidate as StructuredMemoryClaimCandidate;
        const current = summaries.get(candidate.semantic_slot) ?? emptySlotSummary(candidate.semantic_slot);
        summaries.set(candidate.semantic_slot, updateSlotSummary({
          summary: current,
          candidate: normalized,
          createdAt: typeof payload.maturation.created_at === "string" ? payload.maturation.created_at : record.created_at,
          observationDaysByRef,
        }));
      }
    } catch {
      continue;
    }
  }
  return summaries;
}

async function loadCompletedMemoryMaturationObservationRefs(rootDir: string, runtime: RuntimeKind): Promise<Set<string>> {
  const processed = new Set<string>();
  const sources = await loadSourceRecords(rootDir);
  for (const record of sources) {
    if (record.provenance.source_type !== "memory_maturation") continue;
    if (!record.content_ref.startsWith("raw/sources/")) continue;
    try {
      const payload = JSON.parse(await readFile(join(rootDir, record.content_ref), "utf8")) as {
        evidence_package?: {
          runtime?: unknown;
          observations?: Array<{ observation_ref?: unknown }>;
          selected_items?: Array<{ observation_ref?: unknown }>;
        };
        maturation?: { diagnostics?: unknown };
      };
      if (payload.evidence_package?.runtime !== runtime) continue;
      if (!Array.isArray(payload.maturation?.diagnostics) || payload.maturation.diagnostics.length !== 0) continue;
      for (const observation of payload.evidence_package.observations ?? []) {
        if (typeof observation.observation_ref === "string" && observation.observation_ref) {
          processed.add(observation.observation_ref);
        }
      }
      for (const item of payload.evidence_package.selected_items ?? []) {
        if (typeof item.observation_ref === "string" && item.observation_ref) {
          processed.add(item.observation_ref);
        }
      }
    } catch {
      continue;
    }
  }
  return processed;
}

export async function prepareMemoryMaturationEvidence(input: {
  rootDir: string;
  runtime: RuntimeKind;
  maxItems?: number;
}): Promise<MemoryMaturationEvidencePackage> {
  const observations = await loadRuntimeObservations(input.rootDir);
  const consolidations = observations
    .filter((observation) => observationEventType(observation) === "memory_consolidation")
    .map((observation) => ({ observation, consolidation: observationConsolidation(observation) }))
    .filter((entry): entry is { observation: Observation; consolidation: MemoryConsolidation } => entry.consolidation !== null)
    .filter((entry) => entry.consolidation.runtime === input.runtime)
    .sort((left, right) => compareObservedAtDesc(left.observation, right.observation));

  const latest = consolidations[0];
  if (!latest) {
    throw new Error(`No memory_consolidation observation found for runtime ${input.runtime}`);
  }

  const limit = normalizeLimit(input.maxItems);
  const processedRefs = await loadCompletedMemoryMaturationObservationRefs(input.rootDir, input.runtime);
  const candidateItems = latest.consolidation.items
    .filter((item) => item.suggested_route !== "dedupe_or_archive" && item.suggested_route !== "keep_runtime");
  const selectedItems = candidateItems
    .filter((item) => !processedRefs.has(item.observation_ref))
    .slice(0, limit);
  const skippedAlreadyMaturedRefs = candidateItems
    .filter((item) => processedRefs.has(item.observation_ref))
    .map((item) => item.observation_ref);
  const selectedRefs = new Set(selectedItems.map((item) => item.observation_ref));
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  const selectedObservations = [...selectedRefs]
    .map((ref) => byId.get(ref))
    .filter((observation): observation is Observation => Boolean(observation));

  return {
    schema_version: 1,
    maturation_contract: "cristalina.memory_maturation.v1",
    runtime: input.runtime,
    source_consolidation_ref: latest.observation.id,
    source_consolidation_id: latest.consolidation.consolidation_id,
    skipped_already_matured_observation_refs: skippedAlreadyMaturedRefs,
    selected_items: selectedItems,
    observations: selectedObservations.map((observation) => ({
      observation_ref: observation.id,
      observed_at: observation.observed_at ?? observation.created_at,
      summary_preview: observationText(observation).replace(/\s+/g, " ").trim().slice(0, 600),
      full_summary: observationText(observation),
    })),
    instructions: [
      "Extract source-neutral structured memory claim candidates from the evidence.",
      "Use existing Cristalina memory kinds, epistemic states, authority roles, and disposition outcomes.",
      "Do not create source-specific routes for X/Twitter, Telegram, heartbeat, or direct chat.",
      "Do not propose Cristalina code changes as product self-modification.",
      "Prefer stable semantic_slot names because Cristalina uses them to corroborate recurring claims over time.",
      "For non-operational but auditably useful test fixtures, fictional examples, adversarial strings, or corrected examples, include optional evaluation_episode with record_type, entity, scope, purpose, initial_claim/correction_claim when applicable, supersession_relation when applicable, lifecycle_state, usage_policy, linked_governance_slots, and projection_hint.",
      "Do not use evaluation_episode to turn a fixture into an operational fact; its purpose is safe recall as evidence/test context.",
      "Low-risk, non-owner claims with repeated support may become canon through governance; owner-scoped claims still require review.",
      "Return strict JSON with a top-level candidates array.",
    ],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function candidateDiagnostics(candidate: Record<string, unknown>, allowedRefs: Set<string>, index: number): string[] {
  const diagnostics: string[] = [];
  const path = `candidates[${index}]`;
  const requiredStrings = ["statement", "semantic_slot", "rationale"];
  for (const key of requiredStrings) {
    if (typeof candidate[key] !== "string" || !candidate[key]) diagnostics.push(`${path}.${key} must be a non-empty string`);
  }
  if (!CLAIM_KIND_SET.has(String(candidate.memory_kind))) diagnostics.push(`${path}.memory_kind must be a canonical claim kind`);
  if (!EPISTEMIC_STATE_SET.has(String(candidate.epistemic_state))) diagnostics.push(`${path}.epistemic_state is invalid`);
  if (!AUTHORITY_ROLE_SET.has(String(candidate.subject_authority_role))) diagnostics.push(`${path}.subject_authority_role is invalid`);
  if (candidate.confidence !== "low" && candidate.confidence !== "medium" && candidate.confidence !== "high") {
    diagnostics.push(`${path}.confidence must be low, medium, or high`);
  }
  if (candidate.risk !== "low" && candidate.risk !== "medium" && candidate.risk !== "high") {
    diagnostics.push(`${path}.risk must be low, medium, or high`);
  }
  const supportRefs = candidate.support_refs;
  if (!Array.isArray(supportRefs) || supportRefs.length === 0 || !supportRefs.every((ref) => typeof ref === "string" && allowedRefs.has(ref))) {
    diagnostics.push(`${path}.support_refs must contain known observation refs`);
  }
  const dispositions = candidate.recommended_dispositions ?? candidate.recommended_disposition;
  const dispositionValues = Array.isArray(dispositions) ? dispositions : [dispositions];
  if (dispositionValues.length === 0 || !dispositionValues.every((entry) => typeof entry === "string" && DISPOSITION_SET.has(entry))) {
    diagnostics.push(`${path}.recommended_dispositions must use existing disposition outcomes`);
  }
  const evaluationEpisode = asRecord(candidate.evaluation_episode);
  if (candidate.evaluation_episode !== undefined && !evaluationEpisode) {
    diagnostics.push(`${path}.evaluation_episode must be an object when present`);
  } else if (evaluationEpisode) {
    if (!dispositionValues.includes("world_update") && !dispositionValues.includes("wiki_update")) {
      diagnostics.push(`${path}.evaluation_episode requires world_update or wiki_update disposition for governed recall`);
    }
    if (
      evaluationEpisode.record_type !== "evaluation_episode" &&
      evaluationEpisode.record_type !== "test_fixture" &&
      evaluationEpisode.record_type !== "fictional_example_episode"
    ) {
      diagnostics.push(`${path}.evaluation_episode.record_type is invalid`);
    }
    const entity = asRecord(evaluationEpisode.entity);
    if (!entity) {
      diagnostics.push(`${path}.evaluation_episode.entity must be an object`);
    } else {
      if (typeof entity.name !== "string" || !entity.name) diagnostics.push(`${path}.evaluation_episode.entity.name must be a non-empty string`);
      if (typeof entity.type !== "string" || !entity.type) diagnostics.push(`${path}.evaluation_episode.entity.type must be a non-empty string`);
      if (entity.reality !== "fictional" && entity.reality !== "test_only" && entity.reality !== "synthetic") {
        diagnostics.push(`${path}.evaluation_episode.entity.reality is invalid`);
      }
    }
    if (!Array.isArray(evaluationEpisode.scope) || evaluationEpisode.scope.length === 0 || !evaluationEpisode.scope.every((entry) => typeof entry === "string" && entry)) {
      diagnostics.push(`${path}.evaluation_episode.scope must be a non-empty string array`);
    }
    if (typeof evaluationEpisode.purpose !== "string" || !evaluationEpisode.purpose) {
      diagnostics.push(`${path}.evaluation_episode.purpose must be a non-empty string`);
    }
    if (typeof evaluationEpisode.lifecycle_state !== "string" || !evaluationEpisode.lifecycle_state) {
      diagnostics.push(`${path}.evaluation_episode.lifecycle_state must be a non-empty string`);
    }
    if (typeof evaluationEpisode.projection_hint !== "string" || !evaluationEpisode.projection_hint) {
      diagnostics.push(`${path}.evaluation_episode.projection_hint must be a non-empty string`);
    }
    const usagePolicy = asRecord(evaluationEpisode.usage_policy);
    if (!usagePolicy) {
      diagnostics.push(`${path}.evaluation_episode.usage_policy must be an object`);
    } else {
      if (!Array.isArray(usagePolicy.allowed) || !usagePolicy.allowed.every((entry) => typeof entry === "string" && entry)) {
        diagnostics.push(`${path}.evaluation_episode.usage_policy.allowed must be a string array`);
      }
      if (!Array.isArray(usagePolicy.forbidden) || !usagePolicy.forbidden.every((entry) => typeof entry === "string" && entry)) {
        diagnostics.push(`${path}.evaluation_episode.usage_policy.forbidden must be a string array`);
      }
    }
    for (const key of ["initial_claim", "correction_claim"] as const) {
      const claim = asRecord(evaluationEpisode[key]);
      if (!claim) continue;
      if (typeof claim.statement !== "string" || !claim.statement) diagnostics.push(`${path}.evaluation_episode.${key}.statement must be a non-empty string`);
      if (typeof claim.status !== "string" || !claim.status) diagnostics.push(`${path}.evaluation_episode.${key}.status must be a non-empty string`);
    }
    const relation = asRecord(evaluationEpisode.supersession_relation);
    if (relation) {
      if (typeof relation.from !== "string" || !relation.from) diagnostics.push(`${path}.evaluation_episode.supersession_relation.from must be a non-empty string`);
      if (typeof relation.to !== "string" || !relation.to) diagnostics.push(`${path}.evaluation_episode.supersession_relation.to must be a non-empty string`);
      if (typeof relation.relation !== "string" || !relation.relation) diagnostics.push(`${path}.evaluation_episode.supersession_relation.relation must be a non-empty string`);
    }
  }
  return diagnostics;
}

function normalizeEvaluationEpisode(value: unknown): StructuredMemoryEvaluationEpisode | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const entity = asRecord(record.entity)!;
  const usagePolicy = asRecord(record.usage_policy)!;
  const initialClaim = asRecord(record.initial_claim);
  const correctionClaim = asRecord(record.correction_claim);
  const supersessionRelation = asRecord(record.supersession_relation);
  return {
    record_type: record.record_type as StructuredMemoryEvaluationEpisode["record_type"],
    entity: {
      name: String(entity.name),
      type: String(entity.type),
      reality: entity.reality as StructuredMemoryEvaluationEpisode["entity"]["reality"],
    },
    scope: [...new Set(record.scope as string[])],
    purpose: String(record.purpose),
    ...(initialClaim ? {
      initial_claim: {
        statement: String(initialClaim.statement),
        status: String(initialClaim.status),
        ...(typeof initialClaim.authority === "string" && initialClaim.authority ? { authority: initialClaim.authority } : {}),
        ...(typeof initialClaim.scope === "string" && initialClaim.scope ? { scope: initialClaim.scope } : {}),
      },
    } : {}),
    ...(correctionClaim ? {
      correction_claim: {
        statement: String(correctionClaim.statement),
        status: String(correctionClaim.status),
        ...(typeof correctionClaim.authority === "string" && correctionClaim.authority ? { authority: correctionClaim.authority } : {}),
        ...(typeof correctionClaim.scope === "string" && correctionClaim.scope ? { scope: correctionClaim.scope } : {}),
      },
    } : {}),
    ...(supersessionRelation ? {
      supersession_relation: {
        from: String(supersessionRelation.from),
        to: String(supersessionRelation.to),
        relation: String(supersessionRelation.relation),
        ...(typeof supersessionRelation.reason === "string" && supersessionRelation.reason ? { reason: supersessionRelation.reason } : {}),
      },
    } : {}),
    lifecycle_state: String(record.lifecycle_state),
    usage_policy: {
      allowed: [...new Set(usagePolicy.allowed as string[])],
      forbidden: [...new Set(usagePolicy.forbidden as string[])],
    },
    ...(Array.isArray(record.linked_governance_slots)
      ? { linked_governance_slots: [...new Set(record.linked_governance_slots.filter((entry) => typeof entry === "string" && entry) as string[])] }
      : {}),
    projection_hint: String(record.projection_hint),
  };
}

function normalizeCandidate(
  candidate: Record<string, unknown>,
  index: number,
): StructuredMemoryClaimCandidate {
  const dispositionInput = candidate.recommended_dispositions ?? candidate.recommended_disposition;
  const recommendedDispositions = [...new Set((Array.isArray(dispositionInput) ? dispositionInput : [dispositionInput]) as string[])] as DispositionOutcome[];
  const statement = String(candidate.statement);
  const candidateId = typeof candidate.candidate_id === "string" && candidate.candidate_id
    ? safeIdPart(candidate.candidate_id)
    : `claim_${index + 1}_${stableDigest(statement, 10)}`;
  const normalized: StructuredMemoryClaimCandidate = {
    candidate_id: candidateId,
    statement,
    memory_kind: candidate.memory_kind as StructuredMemoryClaimCandidate["memory_kind"],
    epistemic_state: candidate.epistemic_state as EpistemicState,
    semantic_slot: String(candidate.semantic_slot),
    subject_authority_role: candidate.subject_authority_role as SubjectAuthorityRole,
    confidence: candidate.confidence as MemoryMaturationConfidence,
    risk: candidate.risk as MemoryMaturationRisk,
    support_refs: [...new Set(candidate.support_refs as string[])],
    recommended_dispositions: recommendedDispositions,
    rationale: String(candidate.rationale),
    ...(typeof candidate.wiki_title === "string" && candidate.wiki_title ? { wiki_title: candidate.wiki_title } : {}),
    ...(typeof candidate.wiki_path === "string" && candidate.wiki_path ? { wiki_path: candidate.wiki_path } : {}),
    ...(candidate.evaluation_episode ? { evaluation_episode: normalizeEvaluationEpisode(candidate.evaluation_episode) } : {}),
  };
  if (
    normalized.recommended_dispositions.includes("proposal_for_canon") &&
    (
      normalized.subject_authority_role === "owner" ||
      normalized.confidence !== "high" ||
      normalized.risk === "high"
    ) &&
    !normalized.recommended_dispositions.includes("queued_review")
  ) {
    normalized.recommended_dispositions.push("queued_review");
  }
  return normalized;
}

export function compileMemoryMaturation(input: {
  evidence: MemoryMaturationEvidencePackage;
  llmOutput: unknown;
  now?: string;
  historicalSlots?: ReadonlyMap<string, MemoryCanonCandidateSummary>;
  observationDaysByRef?: ReadonlyMap<string, string>;
}): MemoryMaturation {
  const now = input.now ?? new Date().toISOString();
  const output = asRecord(input.llmOutput);
  const rawCandidates = Array.isArray(output?.candidates) ? output.candidates : [];
  const allowedRefs = new Set(input.evidence.observations.map((observation) => observation.observation_ref));
  const observationDaysByRef = input.observationDaysByRef instanceof Map
    ? input.observationDaysByRef
    : new Map(input.evidence.observations.map((observation) => [
        observation.observation_ref,
        normalizeDay(observation.observed_at) ?? normalizeDay(now) ?? now.slice(0, 10),
      ]));
  const diagnostics: string[] = [];
  const candidates: StructuredMemoryClaimCandidate[] = [];

  if (!output) diagnostics.push("LLM output must be a JSON object");
  if (!Array.isArray(output?.candidates)) diagnostics.push("LLM output must contain a candidates array");

  rawCandidates.forEach((entry, index) => {
    const candidate = asRecord(entry);
    if (!candidate) {
      diagnostics.push(`candidates[${index}] must be an object`);
      return;
    }
    const issues = candidateDiagnostics(candidate, allowedRefs, index);
    diagnostics.push(...issues);
    if (issues.length === 0) {
      const normalized = normalizeCandidate(candidate, index);
      candidates.push(applyCorroborationPolicy(
        normalized,
        input.historicalSlots?.get(normalized.semantic_slot),
        observationDaysByRef,
      ));
    }
  });

  const maturationId = `memory_maturation_${input.evidence.runtime}_${stableDigest({
    source_consolidation_ref: input.evidence.source_consolidation_ref,
    candidates,
    diagnostics,
  })}`;

  return {
    schema_version: 1,
    maturation_contract: "cristalina.memory_maturation.v1",
    maturation_id: maturationId,
    created_at: now,
    runtime: input.evidence.runtime,
    source_consolidation_ref: input.evidence.source_consolidation_ref,
    source_consolidation_id: input.evidence.source_consolidation_id,
    mode: "llm_structured_claims",
    llm_contract_version: "structured_memory_claims.v1",
    candidates,
    diagnostics,
    authority_note: "LLM output proposes structured candidates only; Cristalina validates disposition, authority, and governance before any promotion.",
  };
}

function canSystemRatify(candidate: StructuredMemoryClaimCandidate): boolean {
  return (
    candidate.recommended_dispositions.includes("proposal_for_canon") &&
    candidate.subject_authority_role !== "owner" &&
    (
      (candidate.confidence === "high" && candidate.risk !== "high") ||
      candidate.corroboration?.auto_canon_eligible === true
    )
  );
}

function targetWikiPath(candidate: StructuredMemoryClaimCandidate): string {
  if (candidate.wiki_path?.startsWith("wiki/pages/") && candidate.wiki_path.endsWith(".md")) {
    return candidate.wiki_path;
  }
  return `wiki/pages/${safeIdPart(candidate.semantic_slot)}.md`;
}

function uniqueRefs(...groups: Array<Array<string | null | undefined> | string | null | undefined>): string[] {
  const refs: string[] = [];
  for (const group of groups) {
    const entries = Array.isArray(group) ? group : [group];
    for (const entry of entries) {
      if (typeof entry === "string" && entry && !refs.includes(entry)) {
        refs.push(entry);
      }
    }
  }
  return refs;
}

function baseProvenance(input: {
  maturation: MemoryMaturation;
  candidate: StructuredMemoryClaimCandidate;
  principal: AuthenticatedPrincipal;
}): SourceRecord["provenance"] {
  return {
    source_type: "structured_memory_claim",
    source_ref: `memory-maturation/${input.maturation.runtime}/${input.maturation.maturation_id}/${input.candidate.candidate_id}`,
    actor_ref: input.principal.actor_ref,
    evidence_refs: [input.maturation.source_consolidation_ref, ...input.candidate.support_refs],
  };
}

async function writeRawJson(rootDir: string, relativePath: string, payload: unknown): Promise<void> {
  const filePath = join(rootDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function acquireMemoryMaturationLock(rootDir: string, stableId: string): Promise<() => Promise<void>> {
  const lockPath = join(rootDir, "audits", "snapshots", `.memory-maturation-${safeIdPart(stableId)}.lock`);
  const deadline = Date.now() + MEMORY_MATURATION_LOCK_TIMEOUT_MS;
  await mkdir(dirname(lockPath), { recursive: true });

  while (true) {
    try {
      await mkdir(lockPath, { recursive: false });
      await writeFile(join(lockPath, "holder.json"), `${JSON.stringify({
        created_at: new Date().toISOString(),
        stable_id: stableId,
      }, null, 2)}\n`);
      return () => rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      const lockStat = await stat(lockPath).catch(() => null);
      if (lockStat && Date.now() - lockStat.mtimeMs > MEMORY_MATURATION_LOCK_STALE_MS) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out acquiring memory maturation lock for ${stableId}`);
      }
      await sleep(MEMORY_MATURATION_LOCK_POLL_MS);
    }
  }
}

async function withMemoryMaturationLock<T>(rootDir: string, stableId: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireMemoryMaturationLock(rootDir, stableId);
  try {
    return await fn();
  } finally {
    await release();
  }
}

function memoryMaturationRecoveryJournalPath(rootDir: string, stableId: string): string {
  return join(
    rootDir,
    "audits",
    "snapshots",
    `${MEMORY_MATURATION_RECOVERY_PREFIX}${safeIdPart(stableId)}${MEMORY_MATURATION_RECOVERY_SUFFIX}`,
  );
}

async function writeMemoryMaturationRecoveryJournal(
  rootDir: string,
  stableId: string,
  journal: MemoryMaturationRecoveryJournal,
): Promise<string> {
  const journalPath = memoryMaturationRecoveryJournalPath(rootDir, stableId);
  await mkdir(dirname(journalPath), { recursive: true });
  await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  return journalPath;
}

async function recoverMemoryMaturationJournal(rootDir: string, journalPath: string): Promise<void> {
  const parsed = JSON.parse(await readFile(journalPath, "utf8")) as Partial<MemoryMaturationRecoveryJournal>;
  if (parsed.operation !== "memory_maturation" || !Array.isArray(parsed.raw_files) || !Array.isArray(parsed.records)) {
    throw new Error(`Memory maturation recovery journal is malformed: ${journalPath}`);
  }
  for (const rawFile of parsed.raw_files) {
    if (
      typeof rawFile !== "object" ||
      rawFile === null ||
      typeof rawFile.relative_path !== "string" ||
      !rawFile.relative_path.startsWith("raw/sources/")
    ) {
      throw new Error(`Memory maturation recovery journal contains an invalid raw file ref`);
    }
    await writeRawJson(rootDir, rawFile.relative_path, rawFile.payload);
  }
  for (const record of parsed.records) {
    await writeCoreRecord(rootDir, record);
  }
  await rm(journalPath, { force: true });
}

async function recoverPendingMemoryMaturationJournals(rootDir: string): Promise<void> {
  const snapshotDir = join(rootDir, "audits", "snapshots");
  if (!(await pathExists(snapshotDir))) return;
  const entries = await readdir(snapshotDir, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.isFile() &&
      entry.name.startsWith(MEMORY_MATURATION_RECOVERY_PREFIX) &&
      entry.name.endsWith(MEMORY_MATURATION_RECOVERY_SUFFIX)
    ) {
      await recoverMemoryMaturationJournal(rootDir, join(snapshotDir, entry.name));
    }
  }
}

async function materializeMemoryMaturationBatch(input: {
  rootDir: string;
  stableId: string;
  now: string;
  raw_files: MemoryMaturationRawFile[];
  records: CoreRecord[];
}): Promise<void> {
  if (input.raw_files.length === 0 && input.records.length === 0) return;
  const journalPath = await writeMemoryMaturationRecoveryJournal(input.rootDir, input.stableId, {
    version: 1,
    operation: "memory_maturation",
    created_at: input.now,
    raw_files: input.raw_files,
    records: input.records,
  });
  for (const rawFile of input.raw_files) {
    await writeRawJson(input.rootDir, rawFile.relative_path, rawFile.payload);
  }
  for (const record of input.records) {
    await writeCoreRecord(input.rootDir, record);
  }
  await rm(journalPath, { force: true });
}

async function findCompletedMemoryMaturationSource(
  rootDir: string,
  sourceConsolidationRef: string,
  selectedObservationRefs: string[],
): Promise<SourceRecord | undefined> {
  if (selectedObservationRefs.length === 0) return undefined;
  const candidates = (await loadSourceRecords(rootDir)).filter(
    (record) =>
      record.provenance.source_type === "memory_maturation" &&
      record.provenance.evidence_refs?.includes(sourceConsolidationRef),
  );
  for (const record of candidates) {
    if (!record.content_ref.startsWith("raw/sources/")) continue;
    try {
      const payload = JSON.parse(await readFile(join(rootDir, record.content_ref), "utf8")) as {
        evidence_package?: {
          observations?: Array<{ observation_ref?: unknown }>;
          selected_items?: Array<{ observation_ref?: unknown }>;
        };
        maturation?: { diagnostics?: unknown };
      };
      const maturedRefs = [
        ...(payload.evidence_package?.observations ?? []).map((observation) => observation.observation_ref),
        ...(payload.evidence_package?.selected_items ?? []).map((item) => item.observation_ref),
      ].filter((ref): ref is string => typeof ref === "string" && ref.length > 0);
      if (
        Array.isArray(payload.maturation?.diagnostics) &&
        payload.maturation.diagnostics.length === 0 &&
        sameStringSet([...new Set(maturedRefs)], selectedObservationRefs)
      ) {
        return record;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function finalizeCanonCandidateSummary(summary: MemoryCanonCandidateSummary, existingCanon: CanonicalMemoryObject[]): MemoryCanonCandidateSummary {
  const hasActiveCanon = existingCanon.some((record) =>
    record.semantic_slot === summary.semantic_slot &&
    record.governance_state === "ratified" &&
    record.temporal_state?.temporal_status === "active"
  );
  const ownerScoped = summary.subject_authority_roles.includes("owner");
  const lowRisk = summary.latest_risk === "low";
  const confidenceUsable = summary.latest_confidence === "medium" || summary.latest_confidence === "high";
  const autoCanonEligible = !hasActiveCanon && !ownerScoped && lowRisk && confidenceUsable && (
    summary.support_count >= 5 ||
    (summary.support_count >= 3 && summary.distinct_observation_days >= 2) ||
    (summary.candidate_count >= 2 && summary.support_count >= 3)
  );
  const suggestedAction: MemoryCanonCandidateSummary["suggested_action"] = hasActiveCanon
    ? "already_canon"
    : autoCanonEligible
      ? "auto_canon_ready"
      : ownerScoped
        ? "owner_review"
        : summary.support_count >= 3
          ? "needs_more_support"
          : "keep_evidence";
  return {
    ...summary,
    has_active_canon: hasActiveCanon,
    auto_canon_eligible: autoCanonEligible,
    suggested_action: suggestedAction,
  };
}

function isOperationalSelfObservationSummary(summary: MemoryCanonCandidateSummary): boolean {
  if (summary.subject_authority_roles.some((role) => role !== "agent")) return false;
  const text = `${summary.semantic_slot} ${summary.latest_statement ?? ""}`.toLowerCase();
  return (
    text.includes("heartbeat") ||
    text.includes("maturation_batch") ||
    text.includes("research workflow") ||
    text.includes("research method") ||
    text.includes("x/twitter scan") ||
    text.includes("x/twitter research")
  );
}

function candidateFromSummary(input: {
  summary: MemoryCanonCandidateSummary;
  action: "canon" | "wiki";
}): StructuredMemoryClaimCandidate | null {
  const { summary } = input;
  if (
    !summary.latest_statement ||
    !summary.latest_memory_kind ||
    !summary.latest_epistemic_state ||
    !summary.latest_confidence ||
    !summary.latest_risk ||
    !summary.latest_subject_authority_role
  ) {
    return null;
  }
  const supportRefs = [...summary.support_refs];
  const dispositions: DispositionOutcome[] = input.action === "canon"
    ? ["world_update", "wiki_update", "proposal_for_canon"]
    : ["world_update", "wiki_update"];
  return {
    candidate_id: `candidate_${safeIdPart(summary.semantic_slot)}`,
    statement: summary.latest_statement,
    memory_kind: summary.latest_memory_kind,
    epistemic_state: summary.latest_epistemic_state,
    semantic_slot: summary.semantic_slot,
    subject_authority_role: summary.latest_subject_authority_role,
    confidence: summary.latest_confidence,
    risk: summary.latest_risk,
    support_refs: supportRefs,
    recommended_dispositions: dispositions,
    rationale: summary.latest_rationale ?? `Promoted from corroborated memory candidate ${summary.semantic_slot}.`,
    corroboration: {
      semantic_slot: summary.semantic_slot,
      support_count: summary.support_count,
      prior_candidate_count: summary.candidate_count,
      distinct_observation_days: summary.distinct_observation_days,
      support_refs: supportRefs,
      auto_canon_eligible: input.action === "canon",
      rationale: input.action === "canon"
        ? "Promoted by nightly candidate promotion: historical candidate was corroborated and auto-canon-ready."
        : "Kept in wiki by nightly candidate promotion: operational self-observation is useful context but not durable canon by default.",
    },
  };
}

export async function summarizeMemoryCanonCandidates(input: {
  rootDir: string;
  runtime: RuntimeKind;
  limit?: number;
  now?: string;
}): Promise<MemoryCanonCandidateReport> {
  const summaries = await loadMemoryMaturationSlotSummaries(input.rootDir, input.runtime);
  const existingCanon = await loadCanonicalRecords(input.rootDir);
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 50), 500));
  const finalized = [...summaries.values()]
    .map((summary) => finalizeCanonCandidateSummary(summary, existingCanon))
    .sort((left, right) =>
      Number(right.auto_canon_eligible) - Number(left.auto_canon_eligible) ||
      Number(right.has_active_canon) - Number(left.has_active_canon) ||
      right.support_count - left.support_count ||
      right.candidate_count - left.candidate_count ||
      String(right.last_seen_at ?? "").localeCompare(String(left.last_seen_at ?? "")));
  const candidates = finalized.slice(0, limit);
  return {
    schema_version: 1,
    runtime: input.runtime,
    generated_at: input.now ?? new Date().toISOString(),
    totals: {
      semantic_slots: summaries.size,
      auto_canon_ready: finalized.filter((candidate) => candidate.suggested_action === "auto_canon_ready").length,
      already_canon: finalized.filter((candidate) => candidate.suggested_action === "already_canon").length,
      needs_more_support: finalized.filter((candidate) => candidate.suggested_action === "needs_more_support").length,
      owner_review: finalized.filter((candidate) => candidate.suggested_action === "owner_review").length,
    },
    candidates,
  };
}

export async function promoteMemoryCanonCandidates(input: {
  rootDir: string;
  runtime: RuntimeKind;
  write?: boolean;
  limit?: number;
  now?: string;
  authenticated_principal?: AuthenticatedPrincipal;
}): Promise<PromoteMemoryCanonCandidatesResult> {
  const now = input.now ?? new Date().toISOString();
  const principal = input.authenticated_principal ?? {
    kind: "system",
    actor_ref: "system:cristalina-memory-candidate-promotion",
    system_scope: "cristalina-memory-candidate-promotion",
  } satisfies AuthenticatedPrincipal;
  const report = await summarizeMemoryCanonCandidates({
    rootDir: input.rootDir,
    runtime: input.runtime,
    limit: input.limit ?? 100,
    now,
  });
  const existingWikiPages = await loadWikiPages(input.rootDir).catch(() => [] as WikiPage[]);
  const selected: PromoteMemoryCanonCandidatesResult["selected"] = [];
  const skipped: PromoteMemoryCanonCandidatesResult["skipped"] = [];
  const ownerReview: PromoteMemoryCanonCandidatesResult["owner_review"] = [];
  const candidates: StructuredMemoryClaimCandidate[] = [];

  for (const summary of report.candidates) {
    if (summary.suggested_action === "already_canon") {
      skipped.push({ semantic_slot: summary.semantic_slot, reason: "already_canon" });
      continue;
    }
    if (summary.suggested_action !== "auto_canon_ready") {
      if (summary.suggested_action === "owner_review") {
        ownerReview.push({
          semantic_slot: summary.semantic_slot,
          question: `Should Cristalina ratify this owner-scoped memory candidate? ${summary.latest_statement ?? summary.semantic_slot}`,
          support_count: summary.support_count,
          distinct_observation_days: summary.distinct_observation_days,
        });
      }
      skipped.push({ semantic_slot: summary.semantic_slot, reason: summary.suggested_action });
      continue;
    }
    const operationalSelfObservation = isOperationalSelfObservationSummary(summary);
    if (
      operationalSelfObservation &&
      existingWikiPages.some((page) => page.id === `wpg_${safeIdPart(summary.semantic_slot)}` || page.path === `wiki/pages/${safeIdPart(summary.semantic_slot)}.md`)
    ) {
      skipped.push({ semantic_slot: summary.semantic_slot, reason: "operational_self_observation_already_wiki" });
      continue;
    }
    const action: "canon" | "wiki" = operationalSelfObservation ? "wiki" : "canon";
    const candidate = candidateFromSummary({ summary, action });
    if (!candidate) {
      skipped.push({ semantic_slot: summary.semantic_slot, reason: "incomplete_candidate_summary" });
      continue;
    }
    selected.push({
      semantic_slot: summary.semantic_slot,
      action,
      reason: operationalSelfObservation
        ? "operational_self_observation_promoted_to_wiki"
        : "historical_auto_canon_ready",
      support_count: summary.support_count,
      distinct_observation_days: summary.distinct_observation_days,
    });
    candidates.push(candidate);
  }

  const resultBase = {
    schema_version: 1 as const,
    status: input.write ? "applied" as const : "planned" as const,
    runtime: input.runtime,
    generated_at: now,
    selected,
    skipped,
    owner_review: ownerReview.slice(0, 5),
  };

  if (!input.write || candidates.length === 0) {
    return resultBase;
  }

  await initializeStore(input.rootDir, now);
  return withMemoryMaturationLock(input.rootDir, `candidate-promotion-${input.runtime}`, async () => {
    await recoverPendingMemoryMaturationJournals(input.rootDir);
    let existingCanon = await loadCanonicalRecords(input.rootDir);
    let existingWikiPages = await loadWikiPages(input.rootDir);
    const applied = {
      record_refs: [] as string[],
      canonical_record_refs: [] as string[],
      queued_review_refs: [] as string[],
      diagnostic_refs: [] as string[],
    };
    const maturation: MemoryMaturation = {
      schema_version: 1,
      maturation_contract: "cristalina.memory_maturation.v1",
      maturation_id: `memory_candidate_promotion_${input.runtime}`,
      created_at: now,
      runtime: input.runtime,
      source_consolidation_ref: `memory_candidates:${input.runtime}`,
      source_consolidation_id: `memory_candidates_${input.runtime}`,
      mode: "llm_structured_claims",
      llm_contract_version: "structured_memory_claims.v1",
      candidates,
      diagnostics: [],
      authority_note: "Deterministic nightly candidate promotion reuses previously matured structured claims and still routes promotion through proposal, ratification, and canon governance.",
    };

    for (const candidate of candidates) {
      const applyResult = await applyCandidate({
        rootDir: input.rootDir,
        now,
        maturation,
        candidate,
        principal,
        existingCanon,
        existingWikiPages,
      });
      applied.record_refs.push(...applyResult.record_refs);
      applied.canonical_record_refs.push(...applyResult.canonical_record_refs);
      applied.queued_review_refs.push(...applyResult.queued_review_refs);
      applied.diagnostic_refs.push(...applyResult.diagnostic_refs);
      existingCanon = await loadCanonicalRecords(input.rootDir);
      existingWikiPages = await loadWikiPages(input.rootDir);
    }

    return {
      ...resultBase,
      applied,
    };
  });
}

async function applyCandidate(input: {
  rootDir: string;
  now: string;
  maturation: MemoryMaturation;
  candidate: StructuredMemoryClaimCandidate;
  principal: AuthenticatedPrincipal;
  existingCanon: CanonicalMemoryObject[];
  existingWikiPages: WikiPage[];
}): Promise<{
  record_refs: string[];
  canonical_record_refs: string[];
  queued_review_refs: string[];
  diagnostic_refs: string[];
}> {
  const { rootDir, now, maturation, candidate, principal } = input;
  const idPart = safeIdPart(`${maturation.runtime}_${maturation.maturation_id}_${candidate.candidate_id}`);
  const provenance = baseProvenance({ maturation, candidate, principal });
  const visibility_state = { privacy_scope: "owner_private" as const };
  const rawContentRef = `raw/sources/${idPart}.json`;
  const recordRefs: string[] = [];
  const canonicalRefs: string[] = [];
  const queuedReviewRefs: string[] = [];
  const diagnosticRefs: string[] = [];
  const rawFiles: MemoryMaturationRawFile[] = [{ relative_path: rawContentRef, payload: { maturation, candidate } }];
  const records: CoreRecord[] = [];

  const source: SourceRecord = {
    id: `src_${idPart}`,
    kind: "source_record",
    layer: "raw",
    authoritative_home: "raw",
    created_at: now,
    updated_at: now,
    visibility_state,
    provenance,
    content_ref: rawContentRef,
    observed_at: now,
    intake_profile_ref: "structured_memory_claim",
    intake_runner_contract_version: "registered_intake_profile.v1",
    semantic_profile_fingerprint: `structured_memory_claim:${candidate.memory_kind}:${candidate.semantic_slot}`,
  };
  records.push(source);
  recordRefs.push(source.id);

  const observation: Observation = {
    id: `obs_${idPart}`,
    kind: "observation",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: now,
    updated_at: now,
    visibility_state,
    provenance,
    summary: candidate.statement,
    epistemic_state: candidate.epistemic_state,
    observed_at: now,
    runtime_instance_ref: null,
    runtime_session_ref: null,
    conversation_thread_ref: null,
  };
  records.push(observation);
  recordRefs.push(observation.id);

  let episode: Episode | undefined;
  let episodeEntity: Entity | undefined;
  if (candidate.evaluation_episode) {
    const evaluationEpisode = candidate.evaluation_episode;
    const entityId = `ent_${idPart}_${safeIdPart(evaluationEpisode.entity.name)}`;
    episodeEntity = {
      id: entityId,
      kind: "entity",
      layer: "world",
      authoritative_home: "world",
      created_at: now,
      updated_at: now,
      visibility_state,
      provenance: { ...provenance, evidence_refs: [...(provenance.evidence_refs ?? []), source.id, observation.id] },
      entity_kind: evaluationEpisode.entity.type,
      label: evaluationEpisode.entity.name,
      status: "active",
      reality: evaluationEpisode.entity.reality,
      scope_tags: evaluationEpisode.scope,
      usage_policy: evaluationEpisode.usage_policy,
      upstream_refs: [source.id, observation.id, ...candidate.support_refs],
    };
    const claims = [evaluationEpisode.initial_claim, evaluationEpisode.correction_claim]
      .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim));
    episode = {
      id: `epi_${idPart}`,
      kind: "episode",
      layer: "world",
      authoritative_home: "world",
      created_at: now,
      updated_at: now,
      visibility_state,
      provenance: { ...provenance, evidence_refs: [...(provenance.evidence_refs ?? []), source.id, observation.id] },
      summary: evaluationEpisode.projection_hint,
      observation_refs: uniqueRefs(observation.id, candidate.support_refs),
      temporal_state: {
        temporal_status: "active",
        valid_from: now,
        valid_to: null,
        temporal_confidence: candidate.confidence === "high" ? 0.9 : candidate.confidence === "medium" ? 0.65 : 0.35,
      },
      episode_type: evaluationEpisode.record_type,
      semantic_slot: candidate.semantic_slot,
      entity_refs: [{ id: episodeEntity.id, kind: episodeEntity.kind, layer: episodeEntity.layer }],
      scope_tags: evaluationEpisode.scope,
      purpose: evaluationEpisode.purpose,
      lifecycle_state: evaluationEpisode.lifecycle_state,
      ...(claims.length > 0 ? { claims } : {}),
      ...(evaluationEpisode.supersession_relation ? {
        supersession: {
          from: evaluationEpisode.supersession_relation.from,
          to: evaluationEpisode.supersession_relation.to,
          relation: evaluationEpisode.supersession_relation.relation,
          ...(evaluationEpisode.supersession_relation.reason ? { reason: evaluationEpisode.supersession_relation.reason } : {}),
        },
      } : {}),
      usage_policy: evaluationEpisode.usage_policy,
      linked_governance_slots: evaluationEpisode.linked_governance_slots ?? [candidate.semantic_slot],
      projection_hint: evaluationEpisode.projection_hint,
      upstream_refs: [source.id, observation.id, episodeEntity.id, ...candidate.support_refs],
    };
    records.push(episodeEntity, episode);
    recordRefs.push(episodeEntity.id, episode.id);
  }

  let worldClaim: WorldClaim | undefined;
  if (
    candidate.recommended_dispositions.includes("world_update") ||
    candidate.recommended_dispositions.includes("wiki_update") ||
    candidate.recommended_dispositions.includes("proposal_for_canon")
  ) {
    worldClaim = {
      id: `wcl_${idPart}`,
      kind: candidate.memory_kind,
      layer: "world",
      authoritative_home: "world",
      created_at: now,
      updated_at: now,
      visibility_state,
      provenance: { ...provenance, evidence_refs: [...(provenance.evidence_refs ?? []), source.id, observation.id] },
      statement: candidate.statement,
      semantic_slot: candidate.semantic_slot,
      epistemic_state: candidate.epistemic_state,
      temporal_state: {
        temporal_status: candidate.epistemic_state === "disputed" ? "unresolved" : "active",
        valid_from: now,
        valid_to: null,
        temporal_confidence: candidate.confidence === "high" ? 0.9 : candidate.confidence === "medium" ? 0.65 : 0.35,
      },
      support_refs: candidate.support_refs,
      upstream_refs: [source.id, observation.id, maturation.source_consolidation_ref, ...candidate.support_refs],
    };
    records.push(worldClaim);
    recordRefs.push(worldClaim.id);
  }

  let wikiClaim: WikiClaim | undefined;
  if (candidate.recommended_dispositions.includes("wiki_update")) {
    const wikiPath = targetWikiPath(candidate);
    const fallbackWikiPageId = `wpg_${safeIdPart(candidate.semantic_slot)}`;
    const existingWikiPage = input.existingWikiPages.find((page) => page.id === fallbackWikiPageId || page.path === wikiPath);
    const wikiPageId = existingWikiPage?.id ?? fallbackWikiPageId;
    wikiClaim = {
      id: `wclm_${idPart}`,
      kind: "wiki_claim",
      layer: "wiki",
      authoritative_home: "wiki",
      created_at: now,
      updated_at: now,
      visibility_state,
      provenance,
      statement: candidate.statement,
      page_ref: wikiPageId,
      claim_status: candidate.recommended_dispositions.includes("proposal_for_canon") ? "candidate_for_promotion" : "editorial",
      source_refs: [source.id],
      support_refs: candidate.support_refs,
      confidence_score: candidate.confidence === "high" ? 0.9 : candidate.confidence === "medium" ? 0.65 : 0.35,
      support_count: candidate.support_refs.length,
      last_confirmed_at: candidate.confidence === "high" ? now : null,
      last_seen_at: now,
      staleness_state: "current",
      retention_priority: candidate.confidence === "high" ? "high" : "normal",
      quality_score: candidate.risk === "low" ? 0.8 : 0.55,
    };
    const wikiPage: WikiPage = {
      id: wikiPageId,
      kind: "wiki_page",
      layer: "wiki",
      authoritative_home: "wiki",
      created_at: existingWikiPage?.created_at ?? now,
      updated_at: now,
      visibility_state,
      provenance: existingWikiPage?.provenance ?? provenance,
      page_kind: "synthesis",
      title: existingWikiPage?.title ?? candidate.wiki_title ?? candidate.semantic_slot,
      path: existingWikiPage?.path ?? wikiPath,
      source_refs: uniqueRefs(existingWikiPage?.source_refs, source.id),
      canonical_refs: existingWikiPage?.canonical_refs ?? [],
      world_refs: uniqueRefs(existingWikiPage?.world_refs, worldClaim?.id),
      wiki_claim_refs: uniqueRefs(existingWikiPage?.wiki_claim_refs, wikiClaim.id),
      index_summary: candidate.rationale,
      quality_score: wikiClaim.quality_score,
      retention_priority: wikiClaim.retention_priority,
      staleness_state: "current",
    };
    records.push(wikiPage, wikiClaim);
    recordRefs.push(wikiPage.id, wikiClaim.id);
  }

  let proposal: Proposal | undefined;
  let ratification: RatificationRecord | undefined;
  if (candidate.recommended_dispositions.includes("proposal_for_canon")) {
    proposal = {
      id: `prop_${idPart}`,
      kind: "proposal",
      layer: "governance",
      authoritative_home: "governance",
      created_at: now,
      updated_at: now,
      visibility_state,
      provenance: { ...provenance, evidence_refs: [...(provenance.evidence_refs ?? []), source.id, observation.id, ...(worldClaim ? [worldClaim.id] : [])] },
      operation: "create",
      candidate_kind: candidate.memory_kind,
      target_layer: "canon",
      target_ref: null,
      candidate_payload: {
        kind: candidate.memory_kind,
        statement: candidate.statement,
        semantic_slot: candidate.semantic_slot,
        epistemic_state: candidate.epistemic_state,
        temporal_state: worldClaim?.temporal_state ?? {
          temporal_status: "active",
          valid_from: now,
          valid_to: null,
        },
        support_refs: candidate.support_refs,
      },
      reason: candidate.rationale,
      evidence_refs: [source.id, observation.id, ...(worldClaim ? [worldClaim.id] : []), ...candidate.support_refs],
      subject_authority_role: candidate.subject_authority_role,
      promotion_requirement: canSystemRatify(candidate) ? "none" : "owner_ratification_required",
      governance_state: "proposed",
      upstream_refs: [source.id, observation.id, ...(worldClaim ? [worldClaim.id] : []), ...(wikiClaim ? [wikiClaim.id] : [])],
    };
    const evaluation = evaluateCanonicalProposal({
      proposal,
      existing_canon_records: input.existingCanon,
      now,
      actor: principal.actor_ref,
      authenticated_principal: principal,
      ratification_id: `rat_${idPart}`,
      diagnostic_id: `diag_eval_${idPart}`,
    });
    ratification = evaluation.ratification_record;
    records.push(proposal, ratification);
    recordRefs.push(proposal.id, ratification.id);

    if (evaluation.diagnostic) {
      records.push(evaluation.diagnostic);
      diagnosticRefs.push(evaluation.diagnostic.id);
      recordRefs.push(evaluation.diagnostic.id);
    }

    if (evaluation.accepted) {
      const canonical = applyApprovedCanonicalProposal({
        proposal,
        ratification_record: ratification,
        canonical_id: `mem_${idPart}`,
        now,
      });
      for (const record of [...(canonical.created_record ? [canonical.created_record] : []), ...canonical.updated_records]) {
        records.push(record);
        recordRefs.push(record.id);
        canonicalRefs.push(record.id);
      }
    } else if (ratification.decision === "deferred") {
      const queue: CurationPacket = {
        id: `cur_${idPart}`,
        kind: "curation_packet",
        layer: "governance",
        authoritative_home: "governance",
        created_at: now,
        updated_at: now,
        visibility_state,
        provenance: proposal.provenance,
        proposal_refs: [proposal.id],
        question_count: 1,
        review_kind: "owner_ratification",
        ratification_ref: ratification.id,
        diagnostic_ref: diagnosticRefs[diagnosticRefs.length - 1] ?? null,
        canonical_target_ref: { id: `mem_${idPart}`, kind: candidate.memory_kind, layer: "canon" },
        source_record_ref: source.id,
        disposition_ref: `disp_${idPart}`,
        world_claim_ref: worldClaim?.id ?? null,
        wiki_claim_ref: wikiClaim?.id ?? null,
        status: "pending",
      };
      records.push(queue);
      queuedReviewRefs.push(queue.id);
      recordRefs.push(queue.id);
    }
  }

  if (candidate.recommended_dispositions.includes("diagnostic_only")) {
    const diagnostic: Diagnostic = {
      id: `diag_candidate_${idPart}`,
      kind: "diagnostic",
      layer: "audits",
      authoritative_home: "governance",
      created_at: now,
      updated_at: now,
      visibility_state,
      provenance,
      code: "memory_maturation_diagnostic",
      severity: candidate.risk === "high" ? "warning" : "info",
      message: candidate.statement,
      related_refs: [source.id, observation.id, ...candidate.support_refs],
    };
    records.push(diagnostic);
    diagnosticRefs.push(diagnostic.id);
    recordRefs.push(diagnostic.id);
  }

  const disposition: DispositionRecord = {
    id: `disp_${idPart}`,
    kind: "disposition_record",
    layer: "governance",
    authoritative_home: "governance",
    created_at: now,
    updated_at: now,
    visibility_state,
    provenance,
    input_refs: [source.id, observation.id, ...candidate.support_refs],
    outcomes: candidate.recommended_dispositions,
    target_layers: [...new Set(candidate.recommended_dispositions.map((outcome) => {
      switch (outcome) {
        case "evidence_only": return "governance";
        case "runtime_only": return "runtime";
        case "world_update": return "world";
        case "wiki_update": return "wiki";
        case "proposal_for_canon": return "canon";
        case "queued_review": return "governance";
        case "diagnostic_only": return "audits";
      }
    }))],
    ...(proposal ? { proposal_refs: [proposal.id] } : {}),
    ...(candidate.recommended_dispositions.includes("diagnostic_only") && diagnosticRefs.length > 0 ? { diagnostic_refs: diagnosticRefs } : {}),
    reason_codes: [
      `confidence_${candidate.confidence}`,
      `risk_${candidate.risk}`,
      `authority_${candidate.subject_authority_role}`,
      ...candidate.recommended_dispositions,
    ],
  };
  records.push(disposition);
  recordRefs.push(disposition.id);

  await materializeMemoryMaturationBatch({
    rootDir,
    stableId: idPart,
    now,
    raw_files: rawFiles,
    records,
  });

  return {
    record_refs: recordRefs,
    canonical_record_refs: canonicalRefs,
    queued_review_refs: queuedReviewRefs,
    diagnostic_refs: diagnosticRefs,
  };
}

export async function runMemoryMaturation(input: RunMemoryMaturationInput): Promise<RunMemoryMaturationResult> {
  const now = input.now ?? new Date().toISOString();
  const principal = input.authenticated_principal ?? {
    kind: "system",
    actor_ref: "system:cristalina-memory-maturation",
    system_scope: "cristalina-memory-maturation",
  } satisfies AuthenticatedPrincipal;
  const evidence = await prepareMemoryMaturationEvidence({
    rootDir: input.rootDir,
    runtime: input.runtime,
    maxItems: input.maxItems,
  });
  const [historicalSlots, observationDaysByRef] = await Promise.all([
    loadMemoryMaturationSlotSummaries(input.rootDir, input.runtime),
    loadObservationDaysByRef(input.rootDir),
  ]);
  const maturation = compileMemoryMaturation({
    evidence,
    llmOutput: input.llmOutput,
    now,
    historicalSlots,
    observationDaysByRef,
  });

  if (!input.write) {
    return {
      schema_version: 1,
      status: "compiled",
      maturation,
      evidence_package: evidence,
    };
  }

  await initializeStore(input.rootDir, now);
  return withMemoryMaturationLock(input.rootDir, evidence.source_consolidation_ref, async () => {
    await recoverPendingMemoryMaturationJournals(input.rootDir);
    const completedSource = await findCompletedMemoryMaturationSource(
      input.rootDir,
      evidence.source_consolidation_ref,
      evidence.observations.map((observation) => observation.observation_ref),
    );
    if (completedSource) {
      return {
        schema_version: 1,
        status: "applied",
        maturation,
        evidence_package: evidence,
        applied: {
          record_refs: [completedSource.id],
          canonical_record_refs: [],
          queued_review_refs: [],
          diagnostic_refs: [],
        },
      };
    }

    let existingCanon = await loadCanonicalRecords(input.rootDir);
    let existingWikiPages = await loadWikiPages(input.rootDir);
    const applied = {
      record_refs: [] as string[],
      canonical_record_refs: [] as string[],
      queued_review_refs: [] as string[],
      diagnostic_refs: [] as string[],
    };

    if (maturation.diagnostics.length === 0) {
      for (const candidate of maturation.candidates) {
        const result = await applyCandidate({
          rootDir: input.rootDir,
          now,
          maturation,
          candidate,
          principal,
          existingCanon,
          existingWikiPages,
        });
        applied.record_refs.push(...result.record_refs);
        applied.canonical_record_refs.push(...result.canonical_record_refs);
        applied.queued_review_refs.push(...result.queued_review_refs);
        applied.diagnostic_refs.push(...result.diagnostic_refs);
        existingCanon = await loadCanonicalRecords(input.rootDir);
        existingWikiPages = await loadWikiPages(input.rootDir);
      }
    }

    const maturationIdPart = safeIdPart(maturation.maturation_id);
    const maturationContentRef = `raw/sources/${maturationIdPart}.json`;
    const maturationSource: SourceRecord = {
      id: `src_${maturationIdPart}`,
      kind: "source_record",
      layer: "raw",
      authoritative_home: "raw",
      created_at: now,
      updated_at: now,
      visibility_state: { privacy_scope: "owner_private" },
      provenance: {
        source_type: "memory_maturation",
        source_ref: `memory-maturation/${input.runtime}/${maturation.maturation_id}`,
        actor_ref: principal.actor_ref,
        evidence_refs: [evidence.source_consolidation_ref, ...evidence.observations.map((observation) => observation.observation_ref)],
      },
      content_ref: maturationContentRef,
      observed_at: now,
      intake_profile_ref: "structured_memory_claim",
      intake_runner_contract_version: "registered_intake_profile.v1",
      semantic_profile_fingerprint: `memory_maturation:${input.runtime}:${evidence.source_consolidation_id}`,
    };
    const maturationObservation: Observation = {
      id: `obs_${maturationIdPart}`,
      kind: "observation",
      layer: "runtime",
      authoritative_home: "runtime",
      created_at: now,
      updated_at: now,
      visibility_state: { privacy_scope: "owner_private" },
      provenance: maturationSource.provenance,
      summary: JSON.stringify({ event_type: "memory_maturation", maturation }),
      epistemic_state: maturation.diagnostics.length === 0 ? "observed" : "disputed",
      observed_at: now,
      runtime_instance_ref: null,
      runtime_session_ref: null,
      conversation_thread_ref: null,
    };
    await materializeMemoryMaturationBatch({
      rootDir: input.rootDir,
      stableId: maturationIdPart,
      now,
      raw_files: [{ relative_path: maturationContentRef, payload: { evidence_package: evidence, maturation } }],
      records: [maturationSource, maturationObservation],
    });
    applied.record_refs.push(maturationSource.id, maturationObservation.id);

    const historicalPromotion = await promoteMemoryCanonCandidates({
      rootDir: input.rootDir,
      runtime: input.runtime,
      write: true,
      limit: 100,
      now,
      authenticated_principal: principal,
    });
    if (historicalPromotion.applied) {
      applied.record_refs.push(...historicalPromotion.applied.record_refs);
      applied.canonical_record_refs.push(...historicalPromotion.applied.canonical_record_refs);
      applied.queued_review_refs.push(...historicalPromotion.applied.queued_review_refs);
      applied.diagnostic_refs.push(...historicalPromotion.applied.diagnostic_refs);
    }

    return {
      schema_version: 1,
      status: "applied",
      maturation,
      evidence_package: evidence,
      applied,
    };
  });
}
