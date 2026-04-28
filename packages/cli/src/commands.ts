import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCristalinaCommand, helpText, CommandUsageError, type CristalinaCommand } from "./args.js";
import { loadCristalinaConfig, resolveStoreRoot } from "./config.js";
import { collectRuntimeBridgeStatus, formatStatus, initializeCristalinaStore } from "./bridge.js";

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

async function loadStatus(command: Extract<CristalinaCommand, { name: "doctor" | "status" | "projection" | "reviews" }>) {
  const loaded = await loadCristalinaConfig({ configPath: command.configPath });
  const storeRoot = resolveStoreRoot(loaded.config, command.storeRoot);
  return collectRuntimeBridgeStatus({
    config: loaded.config,
    configDiagnostics: loaded.diagnostics,
    storeRoot,
  });
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
    return runNodeScript(join(REPO_ROOT, "scripts", "smoke-dual-runtime.mjs"));
  }

  if (command.name === "bridge") {
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

  if (command.name === "projection") {
    const status = await loadStatus(command);
    return {
      exitCode: command.action === "list" ? 0 : 1,
      stdout: `${JSON.stringify({
        action: command.action,
        projections: status.projections,
        diagnostics: command.action === "refresh"
          ? ["Projection refresh is reserved for the seamless operation step."]
          : status.diagnostics,
      }, null, 2)}\n`,
      stderr: "",
    };
  }

  if (command.name === "reviews") {
    const status = await loadStatus(command);
    return {
      exitCode: command.action === "list" ? 0 : 1,
      stdout: `${JSON.stringify({
        action: command.action,
        pending_owner_reviews: status.pending_owner_reviews,
        diagnostics: command.action === "apply"
          ? ["Review apply requires an explicit queue id and authenticated principal; this is reserved for the operator step."]
          : status.diagnostics,
      }, null, 2)}\n`,
      stderr: "",
    };
  }

  if (command.name === "install") {
    return {
      exitCode: 1,
      stdout: `${JSON.stringify({
        target: command.target,
        status: "not_installed",
        reason: "Installer scripts are implemented in the runtime-specific installer steps.",
      }, null, 2)}\n`,
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
