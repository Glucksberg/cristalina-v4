import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { CristalinaConfig } from "./config.js";
import { loadCristalinaConfig, resolveStoreRoot } from "./config.js";
import { handleRuntimeBridgeEventFile, type RuntimeBridgeEvent, type RuntimeBridgeEventResult } from "./runtime-events.js";

type RuntimeName = "openclaw" | "hermes";
type TemplateEventType = "message_observed" | "conversation_preference_signal" | "runtime_diagnostic" | "checkpoint_requested";

export interface RuntimeEventTemplateInput {
  configPath?: string;
  runtime: RuntimeName;
  eventType: TemplateEventType;
  outputPath: string;
  statement?: string;
  message?: string;
  cwd?: string;
  now?: string;
}

export interface RuntimeEventCheckInput {
  configPath?: string;
  eventPath: string;
  cwd?: string;
}

export interface RuntimeEventVerifyInput {
  configPath?: string;
  openclawEventPath: string;
  hermesEventPath: string;
  cwd?: string;
}

export interface RuntimeEventValidationOptions {
  allowRuntimeInstanceDrift?: boolean;
}

export interface RuntimeEventValidationReport {
  schema_version: 1;
  status: "valid" | "invalid";
  event_contract: "cristalina.runtime_bridge_event.v1";
  runtime: RuntimeName | null;
  event_type: string | null;
  event_id: string | null;
  config_path: string | null;
  store_root: string | null;
  diagnostics: string[];
}

export interface RuntimeEventTemplateReport {
  schema_version: 1;
  status: "written";
  event_contract: "cristalina.runtime_bridge_event.v1";
  event_path: string;
  event: RuntimeBridgeEvent;
  validation: RuntimeEventValidationReport;
}

export interface RuntimeEventVerifyReport {
  schema_version: 1;
  status: "verified" | "blocked";
  event_contract: "cristalina.runtime_bridge_event.v1";
  config_path: string | null;
  store_root: string | null;
  validations: {
    openclaw: RuntimeEventValidationReport;
    hermes: RuntimeEventValidationReport;
  };
  bridge_results: {
    openclaw: RuntimeBridgeEventResult | null;
    hermes: RuntimeBridgeEventResult | null;
  };
  diagnostics: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(record: Record<string, unknown>, key: string, diagnostics: string[]): string | null {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    diagnostics.push(`${key} must be a non-empty string`);
    return null;
  }
  return value;
}

function optionalStringField(record: Record<string, unknown>, key: string, diagnostics: string[]): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    diagnostics.push(`${key} must be a non-empty string when present`);
    return undefined;
  }
  return value;
}

function validateAuthenticatedPrincipal(value: unknown, diagnostics: string[]): string | null {
  if (!isRecord(value)) {
    diagnostics.push("authenticated_principal must be an object");
    return null;
  }
  if (value.kind !== "owner" && value.kind !== "participant" && value.kind !== "system") {
    diagnostics.push("authenticated_principal.kind must be owner, participant, or system");
  }
  if (typeof value.actor_ref !== "string" || value.actor_ref.trim().length === 0) {
    diagnostics.push("authenticated_principal.actor_ref must be a non-empty string");
  }
  if (value.kind === "system" && (typeof value.system_scope !== "string" || value.system_scope.trim().length === 0)) {
    diagnostics.push("authenticated_principal.system_scope is required for system principals");
  }
  return typeof value.actor_ref === "string" && value.actor_ref.trim().length > 0 ? value.actor_ref : null;
}

export function validateRuntimeBridgeEventContract(
  value: unknown,
  config: CristalinaConfig,
  configPath: string | null,
  cwd = process.cwd(),
  options: RuntimeEventValidationOptions = {},
): RuntimeEventValidationReport {
  const diagnostics: string[] = [];
  const storeRoot = resolveStoreRoot(config, undefined, cwd);

  if (!storeRoot) {
    diagnostics.push("config.store_root is required to process runtime bridge events");
  }
  if (!config.owner_identity_ref) {
    diagnostics.push("config.owner_identity_ref is required to process runtime bridge events");
  }
  if (!config.agent_identity_ref) {
    diagnostics.push("config.agent_identity_ref is required to process runtime bridge events");
  }

  if (!isRecord(value)) {
    return {
      schema_version: 1,
      status: "invalid",
      event_contract: "cristalina.runtime_bridge_event.v1",
      runtime: null,
      event_type: null,
      event_id: null,
      config_path: configPath,
      store_root: storeRoot,
      diagnostics: ["runtime bridge event must be a JSON object", ...diagnostics],
    };
  }

  const eventId = stringField(value, "event_id", diagnostics);
  const eventType = stringField(value, "event_type", diagnostics);
  const runtime = stringField(value, "runtime", diagnostics);
  const occurredAt = stringField(value, "occurred_at", diagnostics);
  const actorRef = stringField(value, "actor_ref", diagnostics);
  const declaredPrincipalActorRef = validateAuthenticatedPrincipal(value.authenticated_principal, diagnostics);
  if (actorRef && declaredPrincipalActorRef && actorRef !== declaredPrincipalActorRef) {
    diagnostics.push("event actor_ref must match declared authenticated_principal.actor_ref");
  }
  optionalStringField(value, "runtime_instance_ref", diagnostics);
  optionalStringField(value, "runtime_session_ref", diagnostics);
  optionalStringField(value, "conversation_thread_ref", diagnostics);
  optionalStringField(value, "source_ref", diagnostics);
  optionalStringField(value, "speaker_ref", diagnostics);

  if (runtime !== "openclaw" && runtime !== "hermes") {
    diagnostics.push("runtime must be openclaw or hermes");
  } else if (!config.runtimes?.[runtime]?.runtime_instance_ref && typeof value.runtime_instance_ref !== "string") {
    diagnostics.push(`runtime_instance_ref is required when config.runtimes.${runtime}.runtime_instance_ref is missing`);
  } else if (
    typeof value.runtime_instance_ref === "string" &&
    config.runtimes?.[runtime]?.runtime_instance_ref &&
    value.runtime_instance_ref !== config.runtimes[runtime]?.runtime_instance_ref &&
    !options.allowRuntimeInstanceDrift
  ) {
    diagnostics.push(`runtime_instance_ref ${value.runtime_instance_ref} does not match config.runtimes.${runtime}.runtime_instance_ref`);
  }

  if (occurredAt && Number.isNaN(Date.parse(occurredAt))) {
    diagnostics.push("occurred_at must be an ISO-compatible timestamp");
  }

  if (value.message_refs !== undefined && (!Array.isArray(value.message_refs) || value.message_refs.some((entry) => typeof entry !== "string" || entry.trim().length === 0))) {
    diagnostics.push("message_refs must be an array of non-empty strings when present");
  }

  if (
    eventType !== "message_observed" &&
    eventType !== "conversation_preference_signal" &&
    eventType !== "projection_feedback" &&
    eventType !== "runtime_diagnostic" &&
    eventType !== "review_action_requested" &&
    eventType !== "checkpoint_requested" &&
    eventType !== "projection_refresh_requested" &&
    eventType !== "session_resume_requested"
  ) {
    diagnostics.push("event_type is not supported by cristalina.runtime_bridge_event.v1");
  }

  if (eventType === "message_observed") {
    stringField(value, "message", diagnostics);
  }
  if (eventType === "conversation_preference_signal" || eventType === "projection_feedback") {
    stringField(value, "statement", diagnostics);
    stringField(value, "message", diagnostics);
    optionalStringField(value, "preference_topic_label", diagnostics);
  }
  if (eventType === "runtime_diagnostic") {
    stringField(value, "code", diagnostics);
    const severity = stringField(value, "severity", diagnostics);
    if (severity !== "info" && severity !== "warning" && severity !== "error") {
      diagnostics.push("severity must be info, warning, or error");
    }
    stringField(value, "message", diagnostics);
  }
  if (eventType === "review_action_requested") {
    if (value.queue_kind !== "owner_ratification") {
      diagnostics.push("queue_kind must be owner_ratification");
    }
    if (value.action !== "ratify") {
      diagnostics.push("action must be ratify");
    }
    stringField(value, "queue_id", diagnostics);
  }
  if (eventType === "session_resume_requested") {
    optionalStringField(value, "checkpoint_id", diagnostics);
  }

  return {
    schema_version: 1,
    status: diagnostics.length === 0 ? "valid" : "invalid",
    event_contract: "cristalina.runtime_bridge_event.v1",
    runtime: runtime === "openclaw" || runtime === "hermes" ? runtime : null,
    event_type: eventType,
    event_id: eventId,
    config_path: configPath,
    store_root: storeRoot,
    diagnostics,
  };
}

function principalFromConfig(config: CristalinaConfig): RuntimeBridgeEvent["authenticated_principal"] {
  const principal = config.authenticated_principal;
  if ((principal?.kind === "owner" || principal?.kind === "participant") && principal.actor_ref) {
    return { kind: principal.kind, actor_ref: principal.actor_ref };
  }
  if (principal?.kind === "system" && principal.actor_ref && principal.system_scope) {
    return { kind: "system", actor_ref: principal.actor_ref, system_scope: principal.system_scope };
  }
  return {
    kind: "system",
    actor_ref: "system:cristalina-runtime-event-template",
    system_scope: "cristalina-runtime-event-template",
  };
}

function buildTemplateEvent(config: CristalinaConfig, input: RuntimeEventTemplateInput, now: string): RuntimeBridgeEvent {
  const principal = principalFromConfig(config);
  const actorRef = principal.actor_ref ?? config.owner_identity_ref ?? `system:${input.runtime}-runtime`;
  const binding = config.runtimes?.[input.runtime];
  const eventId = `evt_${input.runtime}_${input.eventType}_${randomUUID().replaceAll("-", "_")}`;
  const base = {
    event_id: eventId,
    event_type: input.eventType,
    runtime: input.runtime,
    occurred_at: now,
    actor_ref: actorRef,
    authenticated_principal: principal,
    runtime_instance_ref: binding?.runtime_instance_ref,
    runtime_session_ref: binding?.default_session_ref ?? `session_${input.runtime}_live_001`,
    conversation_thread_ref: binding?.default_thread_ref ?? `thread_${input.runtime}_live_001`,
    source_ref: `runtime/${input.runtime}/events/${eventId}`,
    speaker_ref: actorRef,
    message_refs: [`msg_${eventId}`],
  };

  if (input.eventType === "conversation_preference_signal") {
    return {
      ...base,
      event_type: "conversation_preference_signal",
      statement: input.statement ?? `Cristalina should accept ${input.runtime} runtime bridge events through the shared contract.`,
      message: input.message ?? `${input.runtime} emitted a conversation preference signal for Cristalina runtime wiring.`,
      preference_topic_label: "Runtime Bridge Event Contract",
    };
  }
  if (input.eventType === "runtime_diagnostic") {
    return {
      ...base,
      event_type: "runtime_diagnostic",
      code: "runtime_event_template",
      severity: "info",
      message: input.message ?? `${input.runtime} emitted a diagnostic event for Cristalina runtime wiring.`,
    };
  }
  if (input.eventType === "message_observed") {
    return {
      ...base,
      event_type: "message_observed",
      message: input.message ?? `${input.runtime} observed a message for Cristalina runtime wiring.`,
    };
  }
  return {
    ...base,
    event_type: "checkpoint_requested",
  };
}

export async function writeRuntimeBridgeEventTemplate(input: RuntimeEventTemplateInput): Promise<RuntimeEventTemplateReport> {
  const cwd = input.cwd ?? process.cwd();
  const loaded = await loadCristalinaConfig({ configPath: input.configPath, cwd });
  if (loaded.diagnostics.length > 0) {
    throw new Error(loaded.diagnostics.join("; "));
  }
  const eventPath = resolve(cwd, input.outputPath);
  const now = input.now ?? new Date().toISOString();
  const event = buildTemplateEvent(loaded.config, input, now);
  const validation = validateRuntimeBridgeEventContract(event, loaded.config, loaded.path, cwd);
  if (validation.status !== "valid") {
    throw new Error(`Generated runtime bridge event is invalid: ${validation.diagnostics.join("; ")}`);
  }
  await mkdir(dirname(eventPath), { recursive: true });
  await writeFile(eventPath, `${JSON.stringify(event, null, 2)}\n`);
  return {
    schema_version: 1,
    status: "written",
    event_contract: "cristalina.runtime_bridge_event.v1",
    event_path: eventPath,
    event,
    validation,
  };
}

export async function checkRuntimeBridgeEventFile(input: RuntimeEventCheckInput): Promise<RuntimeEventValidationReport> {
  const cwd = input.cwd ?? process.cwd();
  const loaded = await loadCristalinaConfig({ configPath: input.configPath, cwd });
  const diagnostics = [...loaded.diagnostics];
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(await readFile(resolve(cwd, input.eventPath), "utf8")) as unknown;
  } catch (error) {
    diagnostics.push(`Cannot read runtime bridge event file: ${(error as Error).message}`);
  }
  const report = validateRuntimeBridgeEventContract(parsed, loaded.config, loaded.path, cwd);
  return {
    ...report,
    status: diagnostics.length === 0 && report.status === "valid" ? "valid" : "invalid",
    diagnostics: [...diagnostics, ...report.diagnostics],
  };
}

async function readRuntimeEventFile(path: string): Promise<{ parsed: unknown; diagnostics: string[] }> {
  try {
    return {
      parsed: JSON.parse(await readFile(path, "utf8")) as unknown,
      diagnostics: [],
    };
  } catch (error) {
    return {
      parsed: null,
      diagnostics: [`Cannot read runtime bridge event file: ${(error as Error).message}`],
    };
  }
}

function mergeValidationDiagnostics(report: RuntimeEventValidationReport, diagnostics: string[]): RuntimeEventValidationReport {
  return {
    ...report,
    status: diagnostics.length === 0 && report.status === "valid" ? "valid" : "invalid",
    diagnostics: [...diagnostics, ...report.diagnostics],
  };
}

export async function verifyRuntimeBridgeEventPair(input: RuntimeEventVerifyInput): Promise<RuntimeEventVerifyReport> {
  const cwd = input.cwd ?? process.cwd();
  const loaded = await loadCristalinaConfig({ configPath: input.configPath, cwd });
  const configDiagnostics = [...loaded.diagnostics];
  const storeRoot = resolveStoreRoot(loaded.config, undefined, cwd);
  const openclawEventPath = resolve(cwd, input.openclawEventPath);
  const hermesEventPath = resolve(cwd, input.hermesEventPath);
  const [openclawRead, hermesRead] = await Promise.all([
    readRuntimeEventFile(openclawEventPath),
    readRuntimeEventFile(hermesEventPath),
  ]);
  const openclawValidation = mergeValidationDiagnostics(
    validateRuntimeBridgeEventContract(openclawRead.parsed, loaded.config, loaded.path, cwd),
    [...configDiagnostics, ...openclawRead.diagnostics],
  );
  const hermesValidation = mergeValidationDiagnostics(
    validateRuntimeBridgeEventContract(hermesRead.parsed, loaded.config, loaded.path, cwd),
    [...configDiagnostics, ...hermesRead.diagnostics],
  );
  const diagnostics: string[] = [
    ...openclawValidation.diagnostics.map((entry) => `openclaw: ${entry}`),
    ...hermesValidation.diagnostics.map((entry) => `hermes: ${entry}`),
  ];

  if (openclawValidation.runtime !== "openclaw") {
    diagnostics.push("openclaw event file must declare runtime openclaw");
  }
  if (hermesValidation.runtime !== "hermes") {
    diagnostics.push("hermes event file must declare runtime hermes");
  }

  let openclawResult: RuntimeBridgeEventResult | null = null;
  let hermesResult: RuntimeBridgeEventResult | null = null;
  if (diagnostics.length === 0 && openclawValidation.status === "valid" && hermesValidation.status === "valid") {
    try {
      openclawResult = await handleRuntimeBridgeEventFile(loaded.config, openclawEventPath);
    } catch (error) {
      diagnostics.push(`openclaw bridge event failed: ${(error as Error).message}`);
    }
    try {
      hermesResult = await handleRuntimeBridgeEventFile(loaded.config, hermesEventPath);
    } catch (error) {
      diagnostics.push(`hermes bridge event failed: ${(error as Error).message}`);
    }
    if (openclawResult && openclawResult.record_refs.length === 0) {
      diagnostics.push("openclaw bridge event produced no durable record refs");
    }
    if (hermesResult && hermesResult.record_refs.length === 0) {
      diagnostics.push("hermes bridge event produced no durable record refs");
    }
  }

  return {
    schema_version: 1,
    status: diagnostics.length === 0 ? "verified" : "blocked",
    event_contract: "cristalina.runtime_bridge_event.v1",
    config_path: loaded.path,
    store_root: storeRoot,
    validations: {
      openclaw: openclawValidation,
      hermes: hermesValidation,
    },
    bridge_results: {
      openclaw: openclawResult,
      hermes: hermesResult,
    },
    diagnostics,
  };
}
