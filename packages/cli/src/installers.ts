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
  runtime_root: string | null;
  bridge_command: string;
  projection_command: string;
  uninstall_hint: string;
  diagnostics: string[];
}

function defaultMetadataPath(config: CristalinaConfig, runtime: "openclaw" | "hermes"): string {
  return config.hooks?.[runtime]?.install_metadata_path ?? `.cristalina-v4/runtime-${runtime}.json`;
}

function runtimeInstanceRef(config: CristalinaConfig, runtime: "openclaw" | "hermes"): string {
  const ref = config.runtimes?.[runtime]?.runtime_instance_ref;
  if (!ref) {
    throw new Error(`Cannot install ${runtime}: config.runtimes.${runtime}.runtime_instance_ref is missing`);
  }
  return ref;
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

  const metadataPath = resolve(input.metadataPath ?? defaultMetadataPath(loaded.config, input.runtime));
  const runtimeRef = runtimeInstanceRef(loaded.config, input.runtime);
  const bridgeCommand = `cristalina bridge event --config ${loaded.configPath} --event <event.json>`;
  const projectionCommand = `cristalina projection list --config ${loaded.configPath}`;
  const metadata = {
    schema_version: 1,
    runtime: input.runtime,
    installed_at: new Date().toISOString(),
    config_path: loaded.configPath,
    store_root: storeRoot,
    runtime_root: input.runtimeRoot ?? null,
    runtime_instance_ref: runtimeRef,
    bridge_command: bridgeCommand,
    projection_command: projectionCommand,
    event_contract: "cristalina.runtime_bridge_event.v1",
    authority_note: "Installer metadata is operational state and does not grant owner authority.",
    disable_hint: `Remove this metadata file or remove the ${input.runtime} hook that calls cristalina bridge event.`,
  };

  await mkdir(dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  return {
    runtime: input.runtime,
    status: "installed",
    config_path: loaded.configPath,
    store_root: storeRoot,
    metadata_path: metadataPath,
    runtime_root: input.runtimeRoot ?? null,
    bridge_command: bridgeCommand,
    projection_command: projectionCommand,
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
