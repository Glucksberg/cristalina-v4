import type { AuthenticatedPrincipal, MemoryConsolidation } from "@cristalina-v4/core";
import { compileMemoryConsolidation } from "@cristalina-v4/core";

import type { CristalinaConfig } from "./config.js";
import { resolveStoreRoot } from "./config.js";
import { handleRuntimeBridgeEvent, type RuntimeBridgeEventResult, type RuntimeMemoryConsolidationEvent } from "./runtime-events.js";

type RuntimeName = "openclaw" | "hermes";

export interface RunMemoryConsolidationInput {
  config: CristalinaConfig;
  storeRootOverride?: string;
  runtime: RuntimeName;
  write?: boolean;
  maxRecentEvents?: number;
  runtimeInstanceRef?: string;
  runtimeSessionRef?: string;
  conversationThreadRef?: string;
  now?: string;
}

export interface RunMemoryConsolidationResult {
  schema_version: 1;
  status: "compiled" | "applied";
  consolidation_contract: "cristalina.memory_consolidation.v1";
  event_contract: "cristalina.runtime_bridge_event.v1";
  consolidation: MemoryConsolidation;
  event: RuntimeMemoryConsolidationEvent;
  bridge_result?: RuntimeBridgeEventResult;
  diagnostics: string[];
}

function principalFromConfig(config: CristalinaConfig): AuthenticatedPrincipal {
  const principal = config.authenticated_principal;
  if ((principal?.kind === "owner" || principal?.kind === "participant") && principal.actor_ref?.trim()) {
    return { kind: principal.kind, actor_ref: principal.actor_ref };
  }
  if (principal?.kind === "system" && principal.actor_ref?.trim() && principal.system_scope?.trim()) {
    return { kind: "system", actor_ref: principal.actor_ref, system_scope: principal.system_scope };
  }
  return {
    kind: "system",
    actor_ref: "system:cristalina-memory-consolidation",
    system_scope: "cristalina-memory-consolidation",
  };
}

function formatMemoryConsolidationMessage(consolidation: MemoryConsolidation): string {
  const routeCounts = consolidation.suggested_route_counts;
  return [
    `Cristalina nightly memory consolidation ${consolidation.consolidation_id} consolidated ${consolidation.counts.recent_observations_consolidated} recent runtime observations.`,
    `Store shape: raw=${consolidation.counts.raw_sources}, runtime=${consolidation.counts.runtime_observations}, proposals=${consolidation.counts.proposals}, wiki=${consolidation.counts.wiki_pages}, canon=${consolidation.counts.canon_records}.`,
    `Suggested routes: keep_runtime=${routeCounts.keep_runtime}, research_synthesis=${routeCounts.candidate_research_synthesis}, operator_review=${routeCounts.candidate_operator_review}, dedupe_or_archive=${routeCounts.dedupe_or_archive}, proposal_later=${routeCounts.candidate_governed_proposal_later}.`,
    consolidation.duplicate_clusters.length > 0
      ? `Duplicate clusters detected: ${consolidation.duplicate_clusters.length}.`
      : "Duplicate clusters detected: 0.",
    "No wiki, canon, world truth, or owner authority is promoted by this memory consolidation.",
  ].join("\n");
}

function buildMemoryConsolidationEvent(input: {
  config: CristalinaConfig;
  runtime: RuntimeName;
  consolidation: MemoryConsolidation;
  runtimeInstanceRef?: string;
  runtimeSessionRef?: string;
  conversationThreadRef?: string;
}): RuntimeMemoryConsolidationEvent {
  const principal = principalFromConfig(input.config);
  const runtimeConfig = input.config.runtimes?.[input.runtime];
  const runtimeInstanceRef = input.runtimeInstanceRef ?? runtimeConfig?.runtime_instance_ref;
  const runtimeSessionRef = input.runtimeSessionRef ?? runtimeConfig?.default_session_ref ?? `session_${input.runtime}_memory_consolidation`;
  const conversationThreadRef = input.conversationThreadRef ?? runtimeConfig?.default_thread_ref ?? `thread_${input.runtime}_memory_consolidation`;
  return {
    event_id: input.consolidation.consolidation_id,
    event_type: "memory_consolidation",
    runtime: input.runtime,
    occurred_at: input.consolidation.created_at,
    actor_ref: principal.actor_ref,
    authenticated_principal: principal,
    ...(runtimeInstanceRef ? { runtime_instance_ref: runtimeInstanceRef } : {}),
    runtime_session_ref: runtimeSessionRef,
    conversation_thread_ref: conversationThreadRef,
    source_ref: `memory-consolidation/${input.runtime}/${input.consolidation.consolidation_id}`,
    speaker_ref: principal.actor_ref,
    message_refs: [`msg_${input.consolidation.consolidation_id}`],
    message: formatMemoryConsolidationMessage(input.consolidation),
    consolidation: input.consolidation,
  };
}

export async function runMemoryConsolidation(input: RunMemoryConsolidationInput): Promise<RunMemoryConsolidationResult> {
  const storeRoot = resolveStoreRoot(input.config, input.storeRootOverride);
  if (!storeRoot) {
    throw new Error("memory consolidation requires config.store_root");
  }
  const runtimeConfig = input.config.runtimes?.[input.runtime];
  const runtimeInstanceRef = input.runtimeInstanceRef ?? runtimeConfig?.runtime_instance_ref;
  const consolidation = await compileMemoryConsolidation({
    rootDir: storeRoot,
    now: input.now,
    runtime: input.runtime,
    runtime_instance_ref: runtimeInstanceRef,
    runtime_session_ref: input.runtimeSessionRef,
    conversation_thread_ref: input.conversationThreadRef,
    max_recent_events: input.maxRecentEvents,
  });
  const event = buildMemoryConsolidationEvent({
    config: input.config,
    runtime: input.runtime,
    consolidation,
    runtimeInstanceRef,
    runtimeSessionRef: input.runtimeSessionRef,
    conversationThreadRef: input.conversationThreadRef,
  });
  const bridgeResult = input.write ? await handleRuntimeBridgeEvent(input.config, event) : undefined;
  return {
    schema_version: 1,
    status: bridgeResult ? "applied" : "compiled",
    consolidation_contract: "cristalina.memory_consolidation.v1",
    event_contract: "cristalina.runtime_bridge_event.v1",
    consolidation,
    event,
    ...(bridgeResult ? { bridge_result: bridgeResult } : {}),
    diagnostics: bridgeResult?.diagnostics ?? [],
  };
}

