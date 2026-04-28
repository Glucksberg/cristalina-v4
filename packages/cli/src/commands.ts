import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCristalinaCommand, helpText, CommandUsageError, type CristalinaCommand } from "./args.js";
import {
  compileSessionPackToStore,
  inspectCristalinaStore,
  listStoreDiagnostics,
  listStoreProjectionManifests,
  loadLatestSessionPackManifest,
  planCristalinaStoreRecovery,
  recordSessionResumeReceiptToStore,
  type AuthenticatedPrincipal,
} from "@cristalina-v4/core";
import { loadCristalinaConfig, resolveStoreRoot, type CristalinaConfig } from "./config.js";
import { runConfigMenu } from "./config-menu.js";
import { collectRuntimeBridgeStatus, formatStatus, initializeCristalinaStore } from "./bridge.js";
import {
  ratifyOpenClawQueuedConversationPreference,
} from "@cristalina-v4/openclaw-adapter";
import {
  ratifyHermesQueuedConversationPreference,
} from "@cristalina-v4/hermes-adapter";
import { handleRuntimeBridgeEventFile } from "./runtime-events.js";
import { handleRuntimeBridgeEvent } from "./runtime-events.js";
import { installRuntime } from "./installers.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runNodeScript(scriptPath: string): Promise<CommandResult> {
  return new Promise((resolveCommand) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolveCommand({ exitCode: 1, stdout, stderr: `${stderr}${error.message}\n` });
    });
    child.on("exit", (code) => {
      resolveCommand({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

async function loadStatus(command: Extract<CristalinaCommand, { name: "doctor" | "status" | "projection" | "reviews" | "diagnostics" | "store" }>) {
  const loaded = await loadCristalinaConfig({ configPath: command.configPath });
  const storeRoot = resolveStoreRoot(loaded.config, command.storeRoot);
  return collectRuntimeBridgeStatus({
    config: loaded.config,
    configDiagnostics: loaded.diagnostics,
    storeRoot,
  });
}

async function loadRequiredConfig(configPath: string | undefined, storeRootOverride?: string): Promise<{ config: CristalinaConfig; storeRoot: string }> {
  const loaded = await loadCristalinaConfig({ configPath });
  if (loaded.diagnostics.length > 0) {
    throw new Error(loaded.diagnostics.join("; "));
  }
  const storeRoot = resolveStoreRoot(loaded.config, storeRootOverride);
  if (!storeRoot) {
    throw new Error("Config store_root is required");
  }
  return { config: loaded.config, storeRoot };
}

function commandPrincipal(config: CristalinaConfig): AuthenticatedPrincipal {
  const principal = config.authenticated_principal;
  if ((principal?.kind === "owner" || principal?.kind === "participant") && principal.actor_ref) {
    return { kind: principal.kind, actor_ref: principal.actor_ref };
  }
  if (principal?.kind === "system" && principal.actor_ref && principal.system_scope) {
    return { kind: "system", actor_ref: principal.actor_ref, system_scope: principal.system_scope };
  }
  return {
    kind: "system",
    actor_ref: "system:cristalina-cli",
    system_scope: "cristalina-cli",
  };
}

export async function executeCristalinaCommand(command: CristalinaCommand): Promise<CommandResult> {
  if (command.name === "help") {
    return { exitCode: 0, stdout: helpText(), stderr: "" };
  }

  if (command.name === "init") {
    const storeRoot = await initializeCristalinaStore(command.storeRoot ?? ".cristalina-v4");
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ store_root: storeRoot, manifest: join(storeRoot, "manifest.yaml") }, null, 2)}\n`,
      stderr: "",
    };
  }

  if (command.name === "config") {
    if (command.init || command.nonInteractive) {
      const configured = await runConfigMenu({
        configPath: command.configPath,
        nonInteractive: command.nonInteractive,
        storeRoot: command.storeRoot,
        ownerIdentityRef: command.ownerIdentityRef,
        agentIdentityRef: command.agentIdentityRef,
        operatorRef: command.operatorRef,
        principalKind: command.principalKind,
        principalActorRef: command.principalActorRef,
        openclawRuntimeRef: command.openclawRuntimeRef,
        hermesRuntimeRef: command.hermesRuntimeRef,
      });
      return {
        exitCode: 0,
        stdout: `${JSON.stringify(configured, null, 2)}\n`,
        stderr: "",
      };
    }

    const loaded = await loadCristalinaConfig({ configPath: command.configPath });
    return {
      exitCode: loaded.diagnostics.length === 0 ? 0 : 1,
      stdout: `${JSON.stringify(loaded, null, 2)}\n`,
      stderr: "",
    };
  }

  if (command.name === "doctor") {
    const status = await loadStatus(command);
    return {
      exitCode: status.config_valid && status.store_manifest_found ? 0 : 1,
      stdout: formatStatus(status),
      stderr: "",
    };
  }

  if (command.name === "status") {
    const status = await loadStatus(command);
    return { exitCode: 0, stdout: formatStatus(status), stderr: "" };
  }

  if (command.name === "smoke") {
    return runNodeScript(join(
      REPO_ROOT,
      "scripts",
      command.target === "dual-runtime" ? "smoke-dual-runtime.mjs" : "smoke-runtime-wiring.mjs",
    ));
  }

  if (command.name === "bridge") {
    if (command.action === "event") {
      const loaded = await loadCristalinaConfig({ configPath: command.configPath });
      if (loaded.diagnostics.length > 0) {
        return {
          exitCode: 1,
          stdout: `${JSON.stringify({ diagnostics: loaded.diagnostics }, null, 2)}\n`,
          stderr: "",
        };
      }
      const result = await handleRuntimeBridgeEventFile(loaded.config, command.eventPath);
      return {
        exitCode: result.status === "deferred" ? 1 : 0,
        stdout: `${JSON.stringify(result, null, 2)}\n`,
        stderr: "",
      };
    }

    return {
      exitCode: 0,
      stdout: `${JSON.stringify({
        bridge: command.action,
        status: "not_started",
        reason: "Step 2 defines the command boundary; the daemon starts in the runtime-neutral event bridge step.",
      }, null, 2)}\n`,
      stderr: "",
    };
  }

  if (command.name === "checkpoint") {
    const { config } = await loadRequiredConfig(command.configPath);
    const principal = commandPrincipal(config);
    const result = await handleRuntimeBridgeEvent(config, {
      event_id: `cli_checkpoint_${command.runtime}_${randomUUID()}`,
      event_type: "checkpoint_requested",
      runtime: command.runtime,
      occurred_at: new Date().toISOString(),
      actor_ref: principal.actor_ref ?? "system:cristalina-cli",
      authenticated_principal: principal,
      runtime_instance_ref: config.runtimes?.[command.runtime]?.runtime_instance_ref,
      runtime_session_ref: config.runtimes?.[command.runtime]?.default_session_ref ?? `session_cli_${command.runtime}`,
      conversation_thread_ref: config.runtimes?.[command.runtime]?.default_thread_ref ?? `thread_cli_${command.runtime}`,
    });
    return { exitCode: 0, stdout: `${JSON.stringify(result, null, 2)}\n`, stderr: "" };
  }

  if (command.name === "session-pack") {
    const { config, storeRoot } = await loadRequiredConfig(command.configPath);
    const principal = commandPrincipal(config);
    if (command.action === "compile") {
      const stored = await compileSessionPackToStore({
        rootDir: storeRoot,
        now: new Date().toISOString(),
        adapter: command.runtime,
        checkpoint_id: command.checkpointId,
      });
      return {
        exitCode: 0,
        stdout: `${JSON.stringify({ manifest: stored.pack.manifest.id, artifact_refs: stored.pack.manifest.artifact_refs }, null, 2)}\n`,
        stderr: "",
      };
    }
    if (command.action === "latest") {
      const manifest = await loadLatestSessionPackManifest(storeRoot, command.runtime);
      return {
        exitCode: manifest ? 0 : 1,
        stdout: `${JSON.stringify({ manifest }, null, 2)}\n`,
        stderr: "",
      };
    }
    const receipt = await recordSessionResumeReceiptToStore({
      rootDir: storeRoot,
      now: new Date().toISOString(),
      receipt_status: command.action === "consume" ? "consumed" : "applied",
      adapter: command.runtime,
      checkpoint_id: command.checkpointId,
      authenticated_principal: principal,
    });
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ receipt }, null, 2)}\n`,
      stderr: "",
    };
  }

  if (command.name === "projection") {
    const status = await loadStatus(command);
    if (command.action === "show") {
      const storeRoot = status.store_root;
      const manifests = storeRoot ? await listStoreProjectionManifests(storeRoot) : [];
      const manifest = manifests.find((entry) => entry.id === command.manifestId);
      return {
        exitCode: manifest ? 0 : 1,
        stdout: `${JSON.stringify({ manifest, diagnostics: manifest ? [] : [`Projection manifest ${command.manifestId ?? "(missing)"} not found`] }, null, 2)}\n`,
        stderr: "",
      };
    }
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({
        action: command.action,
        projections: status.projections,
        diagnostics: command.action === "refresh"
          ? ["Projection refresh inspected current projection state; recompilation remains owned by write workflows."]
          : status.diagnostics,
      }, null, 2)}\n`,
      stderr: "",
    };
  }

  if (command.name === "reviews") {
    const status = await loadStatus(command);
    if (command.action === "apply") {
      if (!command.runtime || !command.queueId) {
        return {
          exitCode: 2,
          stdout: "",
          stderr: "reviews apply requires --runtime and --queue-id\n",
        };
      }
      const loaded = await loadRequiredConfig(command.configPath, command.storeRoot);
      const principal = commandPrincipal(loaded.config);
      const input = {
        rootDir: loaded.storeRoot,
        queue_id: command.queueId,
        now: new Date().toISOString(),
        actor: principal.actor_ref,
        authenticated_principal: principal,
        validation_scope: `cli:reviews:apply:${command.runtime}`,
      };
      const result = command.runtime === "openclaw"
        ? await ratifyOpenClawQueuedConversationPreference(input)
        : await ratifyHermesQueuedConversationPreference(input);
      return {
        exitCode: 0,
        stdout: `${JSON.stringify({
          queue_id: command.queueId,
          runtime: command.runtime,
          status: result.records.owner_ratification_queue?.status,
          projection_manifest_ref: result.records.projection_manifest.id,
        }, null, 2)}\n`,
        stderr: "",
      };
    }
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({
        action: command.action,
        pending_owner_reviews: status.pending_owner_reviews,
        diagnostics: status.diagnostics,
      }, null, 2)}\n`,
      stderr: "",
    };
  }

  if (command.name === "diagnostics") {
    const status = await loadStatus(command);
    const diagnostics = status.store_root ? await listStoreDiagnostics(status.store_root) : [];
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ diagnostics, status_diagnostics: status.diagnostics }, null, 2)}\n`,
      stderr: "",
    };
  }

  if (command.name === "store") {
    const status = await loadStatus(command);
    if (!status.store_root) {
      return { exitCode: 1, stdout: formatStatus(status), stderr: "" };
    }
    const result = command.action === "inspect"
      ? await inspectCristalinaStore(status.store_root)
      : await planCristalinaStoreRecovery(status.store_root);
    return {
      exitCode: 0,
      stdout: `${JSON.stringify(result, null, 2)}\n`,
      stderr: "",
    };
  }

  if (command.name === "install") {
    const result = await installRuntime({
      runtime: command.target,
      configPath: command.configPath,
      nonInteractive: command.nonInteractive,
      metadataPath: command.metadataPath,
      runtimeRoot: command.runtimeRoot,
    });
    return {
      exitCode: 0,
      stdout: `${JSON.stringify(result, null, 2)}\n`,
      stderr: "",
    };
  }

  const exhaustive: never = command;
  return { exitCode: 1, stdout: "", stderr: `Unhandled command ${JSON.stringify(exhaustive)}\n` };
}

export async function runCristalinaCli(argv: string[]): Promise<CommandResult> {
  try {
    return await executeCristalinaCommand(parseCristalinaCommand(argv));
  } catch (error) {
    if (error instanceof CommandUsageError) {
      return { exitCode: error.exitCode, stdout: "", stderr: `${error.message}\n\n${helpText()}` };
    }
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
}
