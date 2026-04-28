import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import {
  compileSessionPackToStore,
  createWorkingMemoryCheckpointToStore,
  recordSessionResumeReceiptToStore,
  type AuthenticatedPrincipal,
  type ProjectionRuntimeView,
} from "@cristalina-v4/core";
import {
  loadLatestOpenClawProjectionRuntimeView,
  listOpenClawConversationPreferenceOwnerRatificationQueue,
  ratifyOpenClawQueuedConversationPreference,
  writeOpenClawAdapterDriftDiagnosticToStore,
  writeOpenClawConversationPreferenceToStore,
  writeOpenClawNonCanonicalIntakeToStore,
  writeOpenClawProjectionFeedbackToStore,
  type OpenClawAdapterDriftDiagnosticInput,
  type OpenClawConversationPreferenceWriteInput,
  type OpenClawNonCanonicalIntakeInput,
} from "@cristalina-v4/openclaw-adapter";
import {
  loadLatestHermesProjectionRuntimeView,
  listHermesConversationPreferenceOwnerRatificationQueue,
  ratifyHermesQueuedConversationPreference,
  writeHermesAdapterDriftDiagnosticToStore,
  writeHermesConversationPreferenceToStore,
  writeHermesNonCanonicalIntakeToStore,
  writeHermesProjectionFeedbackToStore,
  type HermesAdapterDriftDiagnosticInput,
  type HermesConversationPreferenceWriteInput,
  type HermesNonCanonicalIntakeInput,
} from "@cristalina-v4/hermes-adapter";

import type { CristalinaConfig } from "./config.js";
import { resolveStoreRoot } from "./config.js";

type RuntimeName = "openclaw" | "hermes";
type PreferenceInput = OpenClawConversationPreferenceWriteInput | HermesConversationPreferenceWriteInput;
type NonCanonicalInput = OpenClawNonCanonicalIntakeInput | HermesNonCanonicalIntakeInput;

export type RuntimeBridgeEvent =
  | RuntimeMessageObservedEvent
  | RuntimeConversationPreferenceSignalEvent
  | RuntimeProjectionFeedbackEvent
  | RuntimeDiagnosticEvent
  | RuntimeReviewActionRequestedEvent
  | RuntimeCheckpointRequestedEvent
  | RuntimeProjectionRefreshRequestedEvent
  | RuntimeSessionResumeRequestedEvent;

export interface RuntimeBridgeEventBase {
  event_id: string;
  event_type: RuntimeBridgeEvent["event_type"];
  runtime: RuntimeName;
  occurred_at: string;
  actor_ref: string;
  authenticated_principal: AuthenticatedPrincipal;
  runtime_instance_ref?: string;
  runtime_session_ref?: string;
  conversation_thread_ref?: string;
  source_ref?: string;
  speaker_ref?: string;
  message_refs?: string[];
}

export interface RuntimeMessageObservedEvent extends Omit<RuntimeBridgeEventBase, "event_type"> {
  event_type: "message_observed";
  message: string;
}

export interface RuntimeConversationPreferenceSignalEvent extends Omit<RuntimeBridgeEventBase, "event_type"> {
  event_type: "conversation_preference_signal";
  statement: string;
  message: string;
  preference_topic_label?: string;
}

export interface RuntimeProjectionFeedbackEvent extends Omit<RuntimeBridgeEventBase, "event_type"> {
  event_type: "projection_feedback";
  statement: string;
  message: string;
  preference_topic_label?: string;
}

export interface RuntimeDiagnosticEvent extends Omit<RuntimeBridgeEventBase, "event_type"> {
  event_type: "runtime_diagnostic";
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
}

export interface RuntimeReviewActionRequestedEvent extends Omit<RuntimeBridgeEventBase, "event_type"> {
  event_type: "review_action_requested";
  queue_kind: "owner_ratification";
  action: "ratify";
  queue_id: string;
}

export interface RuntimeCheckpointRequestedEvent extends Omit<RuntimeBridgeEventBase, "event_type"> {
  event_type: "checkpoint_requested";
}

export interface RuntimeProjectionRefreshRequestedEvent extends Omit<RuntimeBridgeEventBase, "event_type"> {
  event_type: "projection_refresh_requested";
}

export interface RuntimeSessionResumeRequestedEvent extends Omit<RuntimeBridgeEventBase, "event_type"> {
  event_type: "session_resume_requested";
  checkpoint_id?: string;
}

export interface RuntimeBridgeEventResult {
  event_id: string;
  event_type: RuntimeBridgeEvent["event_type"];
  runtime: RuntimeName;
  status: "applied" | "deferred" | "diagnostic_recorded";
  record_refs: string[];
  projection_manifest_ref?: string;
  pending_owner_review_count: number;
  diagnostics: string[];
}

interface ResolvedRuntimeEventContext {
  storeRoot: string;
  ownerIdentityRef: string;
  agentIdentityRef: string;
  runtimeInstanceRef: string;
  runtimeSessionRef: string;
  conversationThreadRef: string;
}

function safeIdPart(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "event";
  if (normalized.length <= 64) {
    return normalized;
  }
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `${normalized.slice(0, 51)}_${digest}`;
}

function id(prefix: string, event: RuntimeBridgeEvent, suffix?: string): string {
  return [prefix, safeIdPart(event.runtime), safeIdPart(event.event_id), suffix ? safeIdPart(suffix) : undefined]
    .filter((part): part is string => Boolean(part))
    .join("_");
}

function sourceRef(event: RuntimeBridgeEvent): string {
  return event.source_ref ?? `runtime/${event.runtime}/events/${event.event_id}`;
}

function resolveContext(config: CristalinaConfig, event: RuntimeBridgeEvent): ResolvedRuntimeEventContext {
  const storeRoot = resolveStoreRoot(config);
  if (!storeRoot) {
    throw new Error("Runtime bridge event requires config.store_root");
  }
  if (!config.owner_identity_ref) {
    throw new Error("Runtime bridge event requires config.owner_identity_ref");
  }
  if (!config.agent_identity_ref) {
    throw new Error("Runtime bridge event requires config.agent_identity_ref");
  }

  const binding = config.runtimes?.[event.runtime];
  const runtimeInstanceRef = event.runtime_instance_ref ?? binding?.runtime_instance_ref;
  if (!runtimeInstanceRef) {
    throw new Error(`Runtime bridge event requires ${event.runtime} runtime_instance_ref`);
  }

  return {
    storeRoot,
    ownerIdentityRef: config.owner_identity_ref,
    agentIdentityRef: config.agent_identity_ref,
    runtimeInstanceRef,
    runtimeSessionRef: event.runtime_session_ref ?? binding?.default_session_ref ?? `session_${safeIdPart(event.runtime)}_${safeIdPart(event.event_id)}`,
    conversationThreadRef: event.conversation_thread_ref ?? binding?.default_thread_ref ?? `thread_${safeIdPart(event.runtime)}_${safeIdPart(event.event_id)}`,
  };
}

function hasRuntimeDrift(config: CristalinaConfig, event: RuntimeBridgeEvent): boolean {
  const configured = config.runtimes?.[event.runtime]?.runtime_instance_ref;
  return Boolean(configured && event.runtime_instance_ref && configured !== event.runtime_instance_ref);
}

function buildPreferenceInput(
  event: RuntimeConversationPreferenceSignalEvent | RuntimeProjectionFeedbackEvent,
  context: ResolvedRuntimeEventContext,
): PreferenceInput {
  const topic = event.preference_topic_label ?? "Runtime Bridge Preferences";
  return {
    rootDir: context.storeRoot,
    now: event.occurred_at,
    actor: event.actor_ref,
    statement: event.statement,
    authenticated_principal: event.authenticated_principal,
    identity_context: {
      runtime: event.runtime,
      ids: {
        agent_identity: context.agentIdentityRef,
        owner_identity: context.ownerIdentityRef,
        runtime_instance: context.runtimeInstanceRef,
        runtime_session: context.runtimeSessionRef,
        conversation_thread: context.conversationThreadRef,
      },
      agent_label: "Cristalina Runtime Bridge Agent",
      owner_label: "Cristalina Runtime Bridge Owner",
      session_objective: "Process runtime bridge events through Cristalina",
      session_summary: `${event.runtime} runtime bridge session`,
      thread_summary: `${event.runtime} runtime bridge thread`,
      message_refs: event.message_refs ?? [`msg_${safeIdPart(event.event_id)}`],
    },
    source: {
      id: id("src", event),
      source_ref: sourceRef(event),
      content_ref: `raw/sources/${safeIdPart(event.runtime)}-${safeIdPart(event.event_id)}.json`,
      message: event.message,
      ...(event.speaker_ref ? { speaker_ref: event.speaker_ref } : {}),
    },
    ids: {
      observation: id("obs", event),
      episode: id("ep", event),
      subject_entity: id("ent_subject", event),
      preference_entity: id("ent_preference", event),
      preference_relation: id("rel_preference", event),
      world_claim: id("wcl", event),
      contradiction: id("contra", event),
      contradiction_resolution: id("cres", event),
      wiki_page: id("wpg", event),
      wiki_claim: id("wclm", event),
      proposal: id("prop", event),
      disposition: id("disp", event),
      ratification: id("rat", event),
      diagnostic: id("diag", event),
      canonical: id("mem", event),
      canon_artifact: id("part_canon", event),
      world_artifact: id("part_world", event),
      wiki_artifact: id("part_wiki", event),
      projection_manifest: id("pmf", event),
    },
    semantic_profile: {
      subject_entity_kind: "owner",
      subject_authority_role: "owner",
      subject_label: "Cristalina Owner",
      wiki_title: topic,
      wiki_path: `wiki/pages/${safeIdPart(topic)}.md`,
      preference_topic_label: topic,
      relation_type: "expressed_preference",
      proposal_reason: "Runtime bridge event reported an owner-scoped preference.",
    },
    validation_scope: `runtime-bridge:${event.event_type}:${event.runtime}`,
  };
}

function buildNonCanonicalInput(
  event: RuntimeMessageObservedEvent | RuntimeDiagnosticEvent,
  context: ResolvedRuntimeEventContext,
  mode: NonCanonicalInput["mode"],
  diagnostic?: NonNullable<NonCanonicalInput["diagnostic"]>,
): NonCanonicalInput {
  return {
    rootDir: context.storeRoot,
    now: event.occurred_at,
    actor: event.actor_ref,
    authenticated_principal: event.authenticated_principal,
    mode,
    ids: {
      source: id("src", event),
      runtime_instance: context.runtimeInstanceRef,
      runtime_session: context.runtimeSessionRef,
      conversation_thread: context.conversationThreadRef,
      observation: id("obs", event),
      disposition: id("disp", event),
      ...(diagnostic ? { diagnostic: id("diag", event) } : {}),
    },
    source: {
      source_ref: sourceRef(event),
      content_ref: `raw/sources/${safeIdPart(event.runtime)}-${safeIdPart(event.event_id)}.json`,
      source_type: event.event_type,
      payload: event,
      runtime_ref: context.runtimeInstanceRef,
      session_ref: context.runtimeSessionRef,
      thread_ref: context.conversationThreadRef,
      agent_identity_ref: context.agentIdentityRef,
      owner_identity_ref: context.ownerIdentityRef,
      session_objective: "Process runtime bridge events through Cristalina",
      session_summary: `${event.runtime} runtime bridge session`,
      thread_summary: `${event.runtime} runtime bridge thread`,
      message_refs: event.message_refs ?? [`msg_${safeIdPart(event.event_id)}`],
    },
    ...(diagnostic ? { diagnostic } : {}),
    validation_scope: `runtime-bridge:${event.event_type}:${event.runtime}`,
  };
}

async function loadLatestProjection(runtime: RuntimeName, storeRoot: string): Promise<ProjectionRuntimeView | null> {
  const filter = { consistency_requirement: "allow_mixed_state" as const };
  return runtime === "openclaw"
    ? (await loadLatestOpenClawProjectionRuntimeView(storeRoot, filter).catch(() => null)) ?? null
    : (await loadLatestHermesProjectionRuntimeView(storeRoot, filter).catch(() => null)) ?? null;
}

async function pendingOwnerReviewCount(runtime: RuntimeName, storeRoot: string): Promise<number> {
  const queue = runtime === "openclaw"
    ? await listOpenClawConversationPreferenceOwnerRatificationQueue(storeRoot)
    : await listHermesConversationPreferenceOwnerRatificationQueue(storeRoot);
  return queue.length;
}

async function recordRuntimeDriftDiagnostic(
  config: CristalinaConfig,
  event: RuntimeBridgeEvent,
): Promise<RuntimeBridgeEventResult> {
  const context = resolveContext(config, {
    ...event,
    runtime_instance_ref: config.runtimes?.[event.runtime]?.runtime_instance_ref,
  });
  const diagnosticEvent: RuntimeDiagnosticEvent = {
    ...event,
    event_type: "runtime_diagnostic",
    code: "runtime_context_drift",
    severity: "warning",
    message: `${event.runtime} event ${event.event_id} declared runtime_instance_ref ${event.runtime_instance_ref} but config expects ${context.runtimeInstanceRef}`,
  };
  const input = buildNonCanonicalInput(diagnosticEvent, context, "diagnostic_only", {
    code: "runtime_context_drift",
    severity: "warning",
    message: diagnosticEvent.message,
  });

  const result = event.runtime === "openclaw"
    ? await writeOpenClawAdapterDriftDiagnosticToStore(input as OpenClawAdapterDriftDiagnosticInput)
    : await writeHermesAdapterDriftDiagnosticToStore(input as HermesAdapterDriftDiagnosticInput);

  return {
    event_id: event.event_id,
    event_type: event.event_type,
    runtime: event.runtime,
    status: "diagnostic_recorded",
    record_refs: [result.records.source_record.id, result.records.diagnostic?.id].filter((value): value is string => Boolean(value)),
    pending_owner_review_count: await pendingOwnerReviewCount(event.runtime, context.storeRoot),
    diagnostics: [diagnosticEvent.message],
  };
}

export async function handleRuntimeBridgeEvent(config: CristalinaConfig, event: RuntimeBridgeEvent): Promise<RuntimeBridgeEventResult> {
  if (hasRuntimeDrift(config, event)) {
    return recordRuntimeDriftDiagnostic(config, event);
  }

  const context = resolveContext(config, event);

  if (event.event_type === "conversation_preference_signal" || event.event_type === "projection_feedback") {
    const input = buildPreferenceInput(event, context);
    const result = event.runtime === "openclaw"
      ? event.event_type === "projection_feedback"
        ? await writeOpenClawProjectionFeedbackToStore(input as OpenClawConversationPreferenceWriteInput)
        : await writeOpenClawConversationPreferenceToStore(input as OpenClawConversationPreferenceWriteInput)
      : event.event_type === "projection_feedback"
        ? await writeHermesProjectionFeedbackToStore(input as HermesConversationPreferenceWriteInput)
        : await writeHermesConversationPreferenceToStore(input as HermesConversationPreferenceWriteInput);
    const projection = await loadLatestProjection(event.runtime, context.storeRoot);
    return {
      event_id: event.event_id,
      event_type: event.event_type,
      runtime: event.runtime,
      status: result.records.ratification_record.decision === "deferred" ? "deferred" : "applied",
      record_refs: [
        result.records.source_record.id,
        result.records.intake.observation.id,
        result.records.intake.proposal.id,
        result.records.canonical_record?.id,
      ].filter((value): value is string => Boolean(value)),
      projection_manifest_ref: projection?.manifest.id,
      pending_owner_review_count: await pendingOwnerReviewCount(event.runtime, context.storeRoot),
      diagnostics: result.validation_issues.map((issue) => issue.message),
    };
  }

  if (event.event_type === "message_observed" || event.event_type === "runtime_diagnostic") {
    const diagnostic = event.event_type === "runtime_diagnostic"
      ? { code: event.code, severity: event.severity, message: event.message }
      : undefined;
    const input = buildNonCanonicalInput(
      event,
      context,
      event.event_type === "runtime_diagnostic" ? "diagnostic_only" : "runtime_only",
      diagnostic,
    );
    const result = event.runtime === "openclaw"
      ? await writeOpenClawNonCanonicalIntakeToStore(input as OpenClawNonCanonicalIntakeInput)
      : await writeHermesNonCanonicalIntakeToStore(input as HermesNonCanonicalIntakeInput);
    return {
      event_id: event.event_id,
      event_type: event.event_type,
      runtime: event.runtime,
      status: event.event_type === "runtime_diagnostic" ? "diagnostic_recorded" : "applied",
      record_refs: [result.records.source_record.id, result.records.observation?.id, result.records.diagnostic?.id].filter((value): value is string => Boolean(value)),
      pending_owner_review_count: await pendingOwnerReviewCount(event.runtime, context.storeRoot),
      diagnostics: [],
    };
  }

  if (event.event_type === "review_action_requested") {
    const result = event.runtime === "openclaw"
      ? await ratifyOpenClawQueuedConversationPreference({
          rootDir: context.storeRoot,
          queue_id: event.queue_id,
          now: event.occurred_at,
          actor: event.actor_ref,
          authenticated_principal: event.authenticated_principal,
          validation_scope: `runtime-bridge:${event.event_type}:${event.runtime}`,
        })
      : await ratifyHermesQueuedConversationPreference({
          rootDir: context.storeRoot,
          queue_id: event.queue_id,
          now: event.occurred_at,
          actor: event.actor_ref,
          authenticated_principal: event.authenticated_principal,
          validation_scope: `runtime-bridge:${event.event_type}:${event.runtime}`,
        });
    return {
      event_id: event.event_id,
      event_type: event.event_type,
      runtime: event.runtime,
      status: "applied",
      record_refs: [result.records.owner_ratification_queue?.id, result.records.canonical_record?.id].filter((value): value is string => Boolean(value)),
      projection_manifest_ref: result.records.projection_manifest.id,
      pending_owner_review_count: await pendingOwnerReviewCount(event.runtime, context.storeRoot),
      diagnostics: result.validation_issues.map((issue) => issue.message),
    };
  }

  if (event.event_type === "projection_refresh_requested") {
    const projection = await loadLatestProjection(event.runtime, context.storeRoot);
    return {
      event_id: event.event_id,
      event_type: event.event_type,
      runtime: event.runtime,
      status: projection ? "applied" : "deferred",
      record_refs: [],
      projection_manifest_ref: projection?.manifest.id,
      pending_owner_review_count: await pendingOwnerReviewCount(event.runtime, context.storeRoot),
      diagnostics: projection ? [] : [`No ${event.runtime} runtime projection is available yet`],
    };
  }

  if (event.event_type === "checkpoint_requested") {
    const checkpoint = await createWorkingMemoryCheckpointToStore({
      rootDir: context.storeRoot,
      id: id("wmc", event),
      now: event.occurred_at,
      runtime_instance_ref: context.runtimeInstanceRef,
      runtime_session_ref: context.runtimeSessionRef,
      conversation_thread_ref: context.conversationThreadRef,
      continuity_epoch: `epoch_${safeIdPart(context.runtimeSessionRef)}`,
      generation: 1,
      read_policy_version: "projection-read-v2",
      summary: "Runtime requested a handoff checkpoint through the bridge.",
      authenticated_principal: event.authenticated_principal,
    });
    return {
      event_id: event.event_id,
      event_type: event.event_type,
      runtime: event.runtime,
      status: "applied",
      record_refs: [checkpoint.id],
      pending_owner_review_count: await pendingOwnerReviewCount(event.runtime, context.storeRoot),
      diagnostics: [],
    };
  }

  if (event.event_type === "session_resume_requested") {
    const stored = await compileSessionPackToStore({
      rootDir: context.storeRoot,
      now: event.occurred_at,
      adapter: event.runtime,
      checkpoint_id: event.checkpoint_id,
    });
    const receipt = await recordSessionResumeReceiptToStore({
      rootDir: context.storeRoot,
      now: event.occurred_at,
      receipt_status: "consumed",
      adapter: event.runtime,
      manifest_id: stored.pack.manifest.id,
      checkpoint_id: stored.pack.manifest.source_checkpoint_ref ?? undefined,
      authenticated_principal: event.authenticated_principal,
    });
    return {
      event_id: event.event_id,
      event_type: event.event_type,
      runtime: event.runtime,
      status: "applied",
      record_refs: [stored.pack.manifest.id, ...stored.pack.manifest.artifact_refs, receipt.id],
      projection_manifest_ref: stored.pack.manifest.id,
      pending_owner_review_count: await pendingOwnerReviewCount(event.runtime, context.storeRoot),
      diagnostics: [],
    };
  }

  const exhaustive: never = event;
  throw new Error(`Unhandled runtime bridge event ${(exhaustive as { event_type?: string }).event_type ?? "unknown"}`);
}

export async function handleRuntimeBridgeEventFile(config: CristalinaConfig, path: string): Promise<RuntimeBridgeEventResult> {
  return handleRuntimeBridgeEvent(config, JSON.parse(await readFile(path, "utf8")) as RuntimeBridgeEvent);
}
