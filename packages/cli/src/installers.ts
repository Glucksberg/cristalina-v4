import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { loadCristalinaConfig, resolveStoreRoot, type CristalinaConfig } from "./config.js";
import { runConfigMenu } from "./config-menu.js";
import { initializeCristalinaStore, loadStoreManifest } from "./bridge.js";

export interface RuntimeInstallInput {
  runtime: "openclaw" | "hermes";
  configPath?: string;
  nonInteractive?: boolean;
  metadataPath?: string;
  runtimeRoot?: string;
}

export interface RuntimeInstallResult {
  runtime: "openclaw" | "hermes";
  status: "installed";
  config_path: string;
  store_root: string;
  metadata_path: string;
  hook_path: string;
  hook_script_path: string;
  runtime_root: string | null;
  bridge_command: string;
  projection_command: string;
  session_pack_command: string;
  uninstall_hint: string;
  diagnostics: string[];
}

function defaultMetadataPath(config: CristalinaConfig, runtime: "openclaw" | "hermes"): string {
  return config.hooks?.[runtime]?.install_metadata_path ?? `.cristalina-v4/runtime-${runtime}.json`;
}

function defaultHookPath(config: CristalinaConfig, runtime: "openclaw" | "hermes"): string {
  return config.hooks?.[runtime]?.runtime_hook_path ?? `.cristalina-v4/hooks/${runtime}-cristalina-hook.json`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function runtimeInstanceRef(config: CristalinaConfig, runtime: "openclaw" | "hermes"): string {
  const ref = config.runtimes?.[runtime]?.runtime_instance_ref;
  if (!ref) {
    throw new Error(`Cannot install ${runtime}: config.runtimes.${runtime}.runtime_instance_ref is missing`);
  }
  return ref;
}

function resolveMetadataPath(input: RuntimeInstallInput, config: CristalinaConfig): string {
  if (input.metadataPath) {
    return resolve(input.metadataPath);
  }
  const relativeMetadataPath = defaultMetadataPath(config, input.runtime);
  return input.runtimeRoot
    ? resolve(input.runtimeRoot, relativeMetadataPath)
    : resolve(relativeMetadataPath);
}

function resolveHookPath(input: RuntimeInstallInput, config: CristalinaConfig): string {
  const relativeHookPath = defaultHookPath(config, input.runtime);
  return input.runtimeRoot
    ? resolve(input.runtimeRoot, relativeHookPath)
    : resolve(relativeHookPath);
}

async function loadOrCreateConfig(input: RuntimeInstallInput): Promise<{
  config: CristalinaConfig;
  configPath: string;
  diagnostics: string[];
}> {
  const loaded = await loadCristalinaConfig({ configPath: input.configPath });
  if (loaded.path) {
    return {
      config: loaded.config,
      configPath: loaded.path,
      diagnostics: loaded.diagnostics,
    };
  }

  const created = await runConfigMenu({
    configPath: input.configPath,
    nonInteractive: input.nonInteractive ?? true,
    storeRoot: input.configPath ? join(dirname(resolve(input.configPath)), ".cristalina-v4") : undefined,
  });
  return {
    config: created.config,
    configPath: created.path,
    diagnostics: ["Config was missing; created a local default config for installation."],
  };
}

export async function installRuntime(input: RuntimeInstallInput): Promise<RuntimeInstallResult> {
  const loaded = await loadOrCreateConfig(input);
  const storeRoot = resolveStoreRoot(loaded.config);
  if (!storeRoot) {
    throw new Error(`Cannot install ${input.runtime}: config.store_root is missing`);
  }

  if (!(await loadStoreManifest(storeRoot))) {
    await initializeCristalinaStore(storeRoot);
  }

  const metadataPath = resolveMetadataPath(input, loaded.config);
  const hookPath = resolveHookPath(input, loaded.config);
  const hookScriptPath = resolve(dirname(hookPath), "cristalina-bridge-event.sh");
  const runtimeRef = runtimeInstanceRef(loaded.config, input.runtime);
  const bridgeCommand = `cristalina bridge event --config ${loaded.configPath} --event <event.json>`;
  const projectionCommand = `cristalina projection list --config ${loaded.configPath}`;
  const sessionPackCommand = `cristalina session-pack latest --runtime ${input.runtime} --config ${loaded.configPath}`;
  const metadata = {
    schema_version: 1,
    runtime: input.runtime,
    installed_at: new Date().toISOString(),
    config_path: loaded.configPath,
    store_root: storeRoot,
    runtime_root: input.runtimeRoot ?? null,
    runtime_instance_ref: runtimeRef,
    hook_path: hookPath,
    hook_script_path: hookScriptPath,
    bridge_command: bridgeCommand,
    projection_command: projectionCommand,
    session_pack_command: sessionPackCommand,
    event_contract: "cristalina.runtime_bridge_event.v1",
    authority_note: "Installer metadata is operational state and does not grant owner authority.",
    disable_hint: `Remove this metadata file or remove the ${input.runtime} hook that calls cristalina bridge event.`,
  };
  const hook = {
    schema_version: 1,
    runtime: input.runtime,
    hook_contract: "cristalina.runtime_hook.v1",
    event_contract: metadata.event_contract,
    installed_at: metadata.installed_at,
    config_path: loaded.configPath,
    store_root: storeRoot,
    runtime_root: input.runtimeRoot ?? null,
    runtime_instance_ref: runtimeRef,
    event_path_env: "CRISTALINA_EVENT_PATH",
    bridge_command: bridgeCommand,
    bridge_command_argv: ["cristalina", "bridge", "event", "--config", loaded.configPath, "--event", "$CRISTALINA_EVENT_PATH"],
    projection_command: projectionCommand,
    session_pack_command: sessionPackCommand,
    hook_script_path: hookScriptPath,
    authority_note: metadata.authority_note,
  };
  const hookScript = [
    "#!/bin/sh",
    "set -eu",
    "if [ \"${CRISTALINA_EVENT_PATH:-}\" = \"\" ]; then",
    `  echo "CRISTALINA_EVENT_PATH is required for ${input.runtime} Cristalina bridge hook" >&2`,
    "  exit 2",
    "fi",
    `exec cristalina bridge event --config ${shellQuote(loaded.configPath)} --event "$CRISTALINA_EVENT_PATH"`,
    "",
  ].join("\n");

  await mkdir(dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  await mkdir(dirname(hookPath), { recursive: true });
  await writeFile(hookPath, `${JSON.stringify(hook, null, 2)}\n`);
  await writeFile(hookScriptPath, hookScript, { mode: 0o755 });

  return {
    runtime: input.runtime,
    status: "installed",
    config_path: loaded.configPath,
    store_root: storeRoot,
    metadata_path: metadataPath,
    hook_path: hookPath,
    hook_script_path: hookScriptPath,
    runtime_root: input.runtimeRoot ?? null,
    bridge_command: bridgeCommand,
    projection_command: projectionCommand,
    session_pack_command: sessionPackCommand,
    uninstall_hint: metadata.disable_hint,
    diagnostics: loaded.diagnostics,
  };
}

export function openClawInstallOneLiner(url = "https://.../install-openclaw.sh"): string {
  return `curl -fsSL ${url} | sh`;
}

export function hermesInstallOneLiner(url = "https://.../install-hermes.sh"): string {
  return `curl -fsSL ${url} | sh`;
}
