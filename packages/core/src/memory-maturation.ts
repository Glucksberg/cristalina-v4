import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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
  type CurationPacket,
  type Diagnostic,
  type DispositionOutcome,
  type DispositionRecord,
  type EpistemicState,
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
}

export interface MemoryMaturationEvidencePackage {
  schema_version: 1;
  maturation_contract: "cristalina.memory_maturation.v1";
  runtime: RuntimeKind;
  source_consolidation_ref: string;
  source_consolidation_id: string;
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

const CLAIM_KIND_SET = new Set<string>(CANONICAL_CLAIM_KINDS);
const EPISTEMIC_STATE_SET = new Set<string>(EPISTEMIC_STATES);
const AUTHORITY_ROLE_SET = new Set<string>(SUBJECT_AUTHORITY_ROLES);
const DISPOSITION_SET = new Set<string>(DISPOSITION_OUTCOMES);

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
  const selectedItems = latest.consolidation.items
    .filter((item) => item.suggested_route !== "dedupe_or_archive" && item.suggested_route !== "keep_runtime")
    .slice(0, limit);
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
  return diagnostics;
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
}): MemoryMaturation {
  const now = input.now ?? new Date().toISOString();
  const output = asRecord(input.llmOutput);
  const rawCandidates = Array.isArray(output?.candidates) ? output.candidates : [];
  const allowedRefs = new Set(input.evidence.observations.map((observation) => observation.observation_ref));
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
      candidates.push(normalizeCandidate(candidate, index));
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
    candidate.confidence === "high" &&
    candidate.risk !== "high"
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

  await writeRawJson(rootDir, rawContentRef, { maturation, candidate });

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
  await writeCoreRecord(rootDir, source);
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
  await writeCoreRecord(rootDir, observation);
  recordRefs.push(observation.id);

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
    await writeCoreRecord(rootDir, worldClaim);
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
    await writeCoreRecord(rootDir, wikiPage);
    await writeCoreRecord(rootDir, wikiClaim);
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
    await writeCoreRecord(rootDir, proposal);
    await writeCoreRecord(rootDir, ratification);
    recordRefs.push(proposal.id, ratification.id);

    if (evaluation.diagnostic) {
      await writeCoreRecord(rootDir, evaluation.diagnostic);
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
        await writeCoreRecord(rootDir, record);
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
      await writeCoreRecord(rootDir, queue);
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
    await writeCoreRecord(rootDir, diagnostic);
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
  await writeCoreRecord(rootDir, disposition);
  recordRefs.push(disposition.id);

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
  const maturation = compileMemoryMaturation({
    evidence,
    llmOutput: input.llmOutput,
    now,
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

  const maturationContentRef = `raw/sources/${safeIdPart(maturation.maturation_id)}.json`;
  await writeRawJson(input.rootDir, maturationContentRef, { evidence_package: evidence, maturation });
  const maturationSource: SourceRecord = {
    id: `src_${safeIdPart(maturation.maturation_id)}`,
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
    id: `obs_${safeIdPart(maturation.maturation_id)}`,
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
  await writeCoreRecord(input.rootDir, maturationSource);
  await writeCoreRecord(input.rootDir, maturationObservation);
  applied.record_refs.push(maturationSource.id, maturationObservation.id);

  return {
    schema_version: 1,
    status: "applied",
    maturation,
    evidence_package: evidence,
    applied,
  };
}
