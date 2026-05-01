import { randomUUID } from "node:crypto";

import {
  compileSessionPackToStore,
  recordSessionResumeReceiptToStore,
  type AuthenticatedPrincipal,
  type ProjectionManifest,
  type SessionResumeReceipt,
} from "@cristalina-v4/core";

import { loadCristalinaConfig, resolveStoreRoot, type CristalinaConfig } from "./config.js";
import { handleRuntimeBridgeEvent } from "./runtime-events.js";

export interface SessionHandoffVerifyInput {
  configPath?: string;
  checkpointId?: string;
  createCheckpoint?: boolean;
}

export interface SessionHandoffVerifyReport {
  schema_version: 1;
  status: "verified" | "blocked";
  store_root: string | null;
  config_path: string | null;
  source_runtime: "openclaw";
  target_runtime: "hermes";
  checkpoint_ref: string | null;
  session_pack_manifest: ProjectionManifest | null;
  resume_receipt: SessionResumeReceipt | null;
  diagnostics: string[];
}

function principalFromConfig(config: CristalinaConfig): AuthenticatedPrincipal {
  const principal = config.authenticated_principal;
  if ((principal?.kind === "owner" || principal?.kind === "participant") && principal.actor_ref) {
    return { kind: principal.kind, actor_ref: principal.actor_ref };
  }
  if (principal?.kind === "system" && principal.actor_ref && principal.system_scope) {
    return { kind: "system", actor_ref: principal.actor_ref, system_scope: principal.system_scope };
  }
  return {
    kind: "system",
    actor_ref: "system:cristalina-session-handoff-verify",
    system_scope: "cristalina-session-handoff-verify",
  };
}

async function createOpenClawCheckpoint(config: CristalinaConfig, principal: AuthenticatedPrincipal): Promise<string> {
  const result = await handleRuntimeBridgeEvent(config, {
    event_id: `cli_handoff_openclaw_checkpoint_${randomUUID()}`,
    event_type: "checkpoint_requested",
    runtime: "openclaw",
    occurred_at: new Date().toISOString(),
    actor_ref: principal.actor_ref ?? "system:cristalina-session-handoff-verify",
    authenticated_principal: principal,
    runtime_instance_ref: config.runtimes?.openclaw?.runtime_instance_ref,
    runtime_session_ref: config.runtimes?.openclaw?.default_session_ref ?? "session_cli_openclaw_handoff",
    conversation_thread_ref: config.runtimes?.openclaw?.default_thread_ref ?? "thread_cli_openclaw_handoff",
  });
  const checkpointRef = result.record_refs[0];
  if (!checkpointRef) {
    throw new Error("OpenClaw checkpoint verification did not create a checkpoint ref");
  }
  return checkpointRef;
}

function verifyHandoffContract(input: {
  openclawRuntimeRef?: string;
  checkpointRef: string;
  manifest: ProjectionManifest;
  receipt: SessionResumeReceipt;
}): string[] {
  const diagnostics: string[] = [];
  if (input.manifest.adapter !== "hermes") {
    diagnostics.push(`session pack adapter must be hermes, got ${input.manifest.adapter}`);
  }
  if (input.manifest.projection_profile !== "session_resume_v2") {
    diagnostics.push(`session pack projection_profile must be session_resume_v2, got ${input.manifest.projection_profile}`);
  }
  if (input.manifest.snapshot_strategy !== "checkpoint_consistent") {
    diagnostics.push(`session pack snapshot_strategy must be checkpoint_consistent, got ${input.manifest.snapshot_strategy}`);
  }
  if (input.manifest.source_checkpoint_ref !== input.checkpointRef) {
    diagnostics.push(`session pack source_checkpoint_ref ${input.manifest.source_checkpoint_ref ?? "(missing)"} does not match ${input.checkpointRef}`);
  }
  if (input.openclawRuntimeRef && input.manifest.runtime_instance_ref !== input.openclawRuntimeRef) {
    diagnostics.push(`session pack runtime_instance_ref ${input.manifest.runtime_instance_ref ?? "(missing)"} does not match OpenClaw runtime ${input.openclawRuntimeRef}`);
  }
  if (input.manifest.artifact_refs.length === 0) {
    diagnostics.push("session pack must include at least one artifact ref");
  }
  if (input.receipt.adapter !== "hermes") {
    diagnostics.push(`resume receipt adapter must be hermes, got ${input.receipt.adapter}`);
  }
  if (input.receipt.receipt_status !== "consumed") {
    diagnostics.push(`resume receipt status must be consumed, got ${input.receipt.receipt_status}`);
  }
  if (input.receipt.projection_manifest_ref !== input.manifest.id) {
    diagnostics.push(`resume receipt projection_manifest_ref ${input.receipt.projection_manifest_ref} does not match ${input.manifest.id}`);
  }
  if (input.receipt.checkpoint_ref !== input.checkpointRef) {
    diagnostics.push(`resume receipt checkpoint_ref ${input.receipt.checkpoint_ref} does not match ${input.checkpointRef}`);
  }
  if (input.receipt.projection_artifact_refs.length === 0) {
    diagnostics.push("resume receipt must include projection artifact refs");
  }
  return diagnostics;
}

export async function verifyOpenClawToHermesHandoff(input: SessionHandoffVerifyInput = {}): Promise<SessionHandoffVerifyReport> {
  const loaded = await loadCristalinaConfig({ configPath: input.configPath });
  const diagnostics = [...loaded.diagnostics];
  const storeRoot = resolveStoreRoot(loaded.config);
  if (!storeRoot) {
    diagnostics.push("config.store_root is required for session handoff verification");
  }
  if (!loaded.config.runtimes?.openclaw?.runtime_instance_ref) {
    diagnostics.push("OpenClaw runtime binding is missing runtimes.openclaw.runtime_instance_ref");
  }
  if (!loaded.config.runtimes?.hermes?.runtime_instance_ref) {
    diagnostics.push("Hermes runtime binding is missing runtimes.hermes.runtime_instance_ref");
  }
  if (!input.checkpointId && !input.createCheckpoint) {
    diagnostics.push("session handoff verification requires --checkpoint-id or explicit --create-checkpoint");
  }
  if (diagnostics.length > 0 || !storeRoot) {
    return {
      schema_version: 1,
      status: "blocked",
      store_root: storeRoot,
      config_path: loaded.path,
      source_runtime: "openclaw",
      target_runtime: "hermes",
      checkpoint_ref: input.checkpointId ?? null,
      session_pack_manifest: null,
      resume_receipt: null,
      diagnostics,
    };
  }

  const principal = principalFromConfig(loaded.config);
  let checkpointRef = input.checkpointId ?? null;
  let manifest: ProjectionManifest | null = null;
  let receipt: SessionResumeReceipt | null = null;

  try {
    checkpointRef = checkpointRef ?? await createOpenClawCheckpoint(loaded.config, principal);
    const stored = await compileSessionPackToStore({
      rootDir: storeRoot,
      now: new Date().toISOString(),
      adapter: "hermes",
      checkpoint_id: checkpointRef,
    });
    manifest = stored.pack.manifest;
    receipt = await recordSessionResumeReceiptToStore({
      rootDir: storeRoot,
      now: new Date().toISOString(),
      receipt_status: "consumed",
      adapter: "hermes",
      manifest_id: manifest.id,
      checkpoint_id: checkpointRef,
      authenticated_principal: principal,
    });
    diagnostics.push(...verifyHandoffContract({
      openclawRuntimeRef: loaded.config.runtimes?.openclaw?.runtime_instance_ref,
      checkpointRef,
      manifest,
      receipt,
    }));
  } catch (error) {
    diagnostics.push((error as Error).message);
  }

  return {
    schema_version: 1,
    status: diagnostics.length === 0 ? "verified" : "blocked",
    store_root: storeRoot,
    config_path: loaded.path,
    source_runtime: "openclaw",
    target_runtime: "hermes",
    checkpoint_ref: checkpointRef,
    session_pack_manifest: manifest,
    resume_receipt: receipt,
    diagnostics,
  };
}
