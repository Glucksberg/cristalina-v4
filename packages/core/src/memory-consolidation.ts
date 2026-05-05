import { createHash } from "node:crypto";

import {
  loadCanonicalRecords,
  loadCurationPackets,
  loadDispositionRecords,
  loadProposals,
  loadRuntimeObservations,
  loadSourceRecords,
  loadWikiClaims,
  loadWikiMaintenanceRuns,
  loadWikiPages,
  loadWorldClaims,
} from "./store/io.js";
import type { Observation, RuntimeKind } from "./types.js";

export type MemoryConsolidationSuggestedRoute =
  | "keep_runtime"
  | "dedupe_or_archive"
  | "candidate_operator_review"
  | "candidate_research_synthesis"
  | "candidate_governed_proposal_later";

export interface MemoryConsolidationInput {
  rootDir: string;
  now?: string;
  runtime: RuntimeKind;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
  max_recent_events?: number;
}

export interface MemoryConsolidationItem {
  observation_ref: string;
  observed_at: string;
  runtime_session_ref: string | null;
  conversation_thread_ref: string | null;
  source_type: string | null;
  event_type: string | null;
  source_ref: string | null;
  summary_preview: string;
  suggested_route: MemoryConsolidationSuggestedRoute;
  reason_codes: string[];
}

export interface MemoryConsolidationDuplicateCluster {
  kind: "url";
  value: string;
  count: number;
  observation_refs: string[];
}

export interface MemoryConsolidation {
  schema_version: 1;
  consolidation_contract: "cristalina.memory_consolidation.v1";
  consolidation_id: string;
  created_at: string;
  runtime: RuntimeKind;
  mode: "conservative";
  input_scope: {
    runtime_instance_ref: string | null;
    runtime_session_ref: string | null;
    conversation_thread_ref: string | null;
    max_recent_events: number;
  };
  counts: {
    raw_sources: number;
    runtime_observations: number;
    dispositions: number;
    proposals: number;
    curation_packets: number;
    wiki_pages: number;
    wiki_claims: number;
    wiki_runs: number;
    canon_records: number;
    world_claims: number;
    scoped_observations: number;
    recent_observations_consolidated: number;
    prior_memory_consolidations_excluded: number;
  };
  event_type_counts: Record<string, number>;
  source_type_counts: Record<string, number>;
  suggested_route_counts: Record<MemoryConsolidationSuggestedRoute, number>;
  duplicate_clusters: MemoryConsolidationDuplicateCluster[];
  items: MemoryConsolidationItem[];
  recommendations: string[];
  authority_note: string;
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce<Record<T, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {} as Record<T, number>);
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) {
    return 200;
  }
  return Math.max(1, Math.min(Math.floor(value!), 500));
}

function stableConsolidationId(input: {
  now: string;
  runtime: RuntimeKind;
  observation_refs: string[];
}): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16);
  return `memory_consolidation_${input.runtime}_${digest}`;
}

function parseSummary(summary: string): { event_type: string | null; message: string; source_ref: string | null } {
  try {
    const parsed = JSON.parse(summary) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      return {
        event_type: typeof record.event_type === "string" ? record.event_type : null,
        message: typeof record.message === "string" ? record.message : summary,
        source_ref: typeof record.source_ref === "string" ? record.source_ref : null,
      };
    }
  } catch {
    // Plain text summaries are valid runtime observations.
  }
  return { event_type: null, message: summary, source_ref: null };
}

function preview(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function routeObservation(input: {
  observation: Observation;
  parsed: ReturnType<typeof parseSummary>;
  duplicate_url_count: number;
}): { route: MemoryConsolidationSuggestedRoute; reason_codes: string[] } {
  const text = input.parsed.message.toLowerCase();
  const foldedText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const reason_codes: string[] = [];

  if (input.duplicate_url_count > 1) {
    reason_codes.push("repeated_url_seen");
    return { route: "dedupe_or_archive", reason_codes };
  }

  if (
    /\b(owner|markus|prefers?|preference|decidiu|decisao|quero|nao quero|salva|save this)\b/i.test(foldedText)
  ) {
    reason_codes.push("operator_or_preference_language");
    return { route: "candidate_operator_review", reason_codes };
  }

  if (
    /\b(memory consolidation|research|study|synthesis|x\/twitter|twitter|memoria|memory|agent memory|retrieval|rag|governance)\b/i.test(foldedText)
  ) {
    reason_codes.push("research_or_memory_topic");
    return { route: "candidate_research_synthesis", reason_codes };
  }

  if (text.includes("proposal") || text.includes("wiki") || text.includes("canon")) {
    reason_codes.push("mentions_governed_memory_surface");
    return { route: "candidate_governed_proposal_later", reason_codes };
  }

  reason_codes.push("no_promotion_signal");
  return { route: "keep_runtime", reason_codes };
}

function extractUrls(value: string): string[] {
  const matches = value.match(/https?:\/\/(?:x|twitter)\.com\/[^\s|)"]+/g) ?? [];
  return matches.map((entry) => entry.replace(/[.,;:]+$/, ""));
}

function compareObservationTime(left: Observation, right: Observation): number {
  const leftTime = Date.parse(left.observed_at ?? left.created_at);
  const rightTime = Date.parse(right.observed_at ?? right.created_at);
  return rightTime - leftTime || right.id.localeCompare(left.id);
}

function filterScope(observation: Observation, input: MemoryConsolidationInput): boolean {
  if (input.runtime_instance_ref && observation.runtime_instance_ref !== input.runtime_instance_ref) return false;
  if (input.runtime_session_ref && observation.runtime_session_ref !== input.runtime_session_ref) return false;
  if (input.conversation_thread_ref && observation.conversation_thread_ref !== input.conversation_thread_ref) return false;
  return true;
}

export async function compileMemoryConsolidation(input: MemoryConsolidationInput): Promise<MemoryConsolidation> {
  const now = input.now ?? new Date().toISOString();
  const maxRecentEvents = normalizeLimit(input.max_recent_events);
  const [
    sources,
    observations,
    dispositions,
    proposals,
    curationPackets,
    wikiPages,
    wikiClaims,
    wikiRuns,
    canonRecords,
    worldClaims,
  ] = await Promise.all([
    loadSourceRecords(input.rootDir),
    loadRuntimeObservations(input.rootDir),
    loadDispositionRecords(input.rootDir),
    loadProposals(input.rootDir),
    loadCurationPackets(input.rootDir),
    loadWikiPages(input.rootDir),
    loadWikiClaims(input.rootDir),
    loadWikiMaintenanceRuns(input.rootDir),
    loadCanonicalRecords(input.rootDir),
    loadWorldClaims(input.rootDir),
  ]);

  const scopedObservations = observations.filter((observation) => filterScope(observation, input));
  const parsedByObservation = new Map(scopedObservations.map((observation) => [observation.id, parseSummary(observation.summary)]));
  const priorMemoryConsolidationCount = scopedObservations.filter((observation) =>
    parsedByObservation.get(observation.id)?.event_type === "memory_consolidation").length;
  const consolidatableObservations = scopedObservations
    .filter((observation) => parsedByObservation.get(observation.id)?.event_type !== "memory_consolidation")
    .sort(compareObservationTime)
    .slice(0, maxRecentEvents);

  const urlRefs = new Map<string, string[]>();
  for (const observation of consolidatableObservations) {
    const parsed = parsedByObservation.get(observation.id)!;
    for (const url of extractUrls(parsed.message)) {
      const refs = urlRefs.get(url) ?? [];
      refs.push(observation.id);
      urlRefs.set(url, refs);
    }
  }
  const duplicateClusters = [...urlRefs.entries()]
    .filter(([, refs]) => refs.length > 1)
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .slice(0, 20)
    .map(([value, refs]): MemoryConsolidationDuplicateCluster => ({
      kind: "url",
      value,
      count: refs.length,
      observation_refs: refs,
    }));
  const duplicateUrlCount = new Map<string, number>();
  for (const cluster of duplicateClusters) {
    for (const ref of cluster.observation_refs) {
      duplicateUrlCount.set(ref, Math.max(duplicateUrlCount.get(ref) ?? 0, cluster.count));
    }
  }

  const items = consolidatableObservations.map((observation): MemoryConsolidationItem => {
    const parsed = parsedByObservation.get(observation.id)!;
    const sourceType = observation.provenance.source_type ?? null;
    const route = routeObservation({
      observation,
      parsed,
      duplicate_url_count: duplicateUrlCount.get(observation.id) ?? 0,
    });
    return {
      observation_ref: observation.id,
      observed_at: observation.observed_at ?? observation.created_at,
      runtime_session_ref: observation.runtime_session_ref ?? null,
      conversation_thread_ref: observation.conversation_thread_ref ?? null,
      source_type: sourceType,
      event_type: parsed.event_type,
      source_ref: parsed.source_ref ?? observation.provenance.source_ref ?? null,
      summary_preview: preview(parsed.message),
      suggested_route: route.route,
      reason_codes: route.reason_codes,
    };
  });

  const routeCounts = countBy(items.map((item) => item.suggested_route));
  const recommendations = [
    items.length === 0 ? "No recent runtime observations were available for memory consolidation." : "",
    duplicateClusters.length > 0 ? "Review duplicate clusters before adding new retrieval or promotion surfaces." : "",
    routeCounts.candidate_operator_review ? "Candidate operator/preference items should become explicit review proposals only through authority-aware flows." : "",
    routeCounts.candidate_research_synthesis ? "Research signals are ready for synthesis, not automatic canon promotion." : "",
  ].filter(Boolean);

  return {
    schema_version: 1,
    consolidation_contract: "cristalina.memory_consolidation.v1",
    consolidation_id: stableConsolidationId({
      now,
      runtime: input.runtime,
      observation_refs: items.map((item) => item.observation_ref),
    }),
    created_at: now,
    runtime: input.runtime,
    mode: "conservative",
    input_scope: {
      runtime_instance_ref: input.runtime_instance_ref ?? null,
      runtime_session_ref: input.runtime_session_ref ?? null,
      conversation_thread_ref: input.conversation_thread_ref ?? null,
      max_recent_events: maxRecentEvents,
    },
    counts: {
      raw_sources: sources.length,
      runtime_observations: observations.length,
      dispositions: dispositions.length,
      proposals: proposals.length,
      curation_packets: curationPackets.length,
      wiki_pages: wikiPages.length,
      wiki_claims: wikiClaims.length,
      wiki_runs: wikiRuns.length,
      canon_records: canonRecords.length,
      world_claims: worldClaims.length,
      scoped_observations: scopedObservations.length,
      recent_observations_consolidated: items.length,
      prior_memory_consolidations_excluded: priorMemoryConsolidationCount,
    },
    event_type_counts: countBy(items.map((item) => item.event_type ?? "unknown")),
    source_type_counts: countBy(items.map((item) => item.source_type ?? "unknown")),
    suggested_route_counts: {
      keep_runtime: routeCounts.keep_runtime ?? 0,
      dedupe_or_archive: routeCounts.dedupe_or_archive ?? 0,
      candidate_operator_review: routeCounts.candidate_operator_review ?? 0,
      candidate_research_synthesis: routeCounts.candidate_research_synthesis ?? 0,
      candidate_governed_proposal_later: routeCounts.candidate_governed_proposal_later ?? 0,
    },
    duplicate_clusters: duplicateClusters,
    items,
    recommendations,
    authority_note: "This nightly memory consolidation is a conservative semantic pass. It classifies evidence but does not promote wiki, canon, world truth, or owner authority.",
  };
}
