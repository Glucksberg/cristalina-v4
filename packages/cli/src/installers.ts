import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCristalinaConfig, resolveStoreRoot, type CristalinaConfig } from "./config.js";
import { runConfigMenu } from "./config-menu.js";
import { initializeCristalinaStore, loadStoreManifest } from "./bridge.js";

export interface RuntimeInstallInput {
  runtime: "openclaw" | "hermes";
  configPath?: string;
  nonInteractive?: boolean;
  metadataPath?: string;
  runtimeRoot?: string;
  integrationMode?: "provider" | "bridge" | "both";
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
  plugin_path?: string;
  plugin_manifest_path?: string;
  plugin_entrypoint_path?: string;
  plugin_config_path?: string;
  plugin_enable_hint?: string;
  provider_path?: string;
  provider_manifest_path?: string;
  provider_entrypoint_path?: string;
  provider_config_path?: string;
  integration_mode?: "provider" | "bridge" | "both";
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

function cliEntrypointPath(): string {
  return fileURLToPath(new URL("index.js", import.meta.url));
}

function hermesPluginPaths(runtimeRoot: string | undefined): {
  pluginPath: string | null;
  pluginManifestPath: string | null;
  pluginEntrypointPath: string | null;
  pluginConfigPath: string | null;
  providerPath: string | null;
  providerManifestPath: string | null;
  providerEntrypointPath: string | null;
  providerConfigPath: string | null;
} {
  if (!runtimeRoot) {
    return {
      pluginPath: null,
      pluginManifestPath: null,
      pluginEntrypointPath: null,
      pluginConfigPath: null,
      providerPath: null,
      providerManifestPath: null,
      providerEntrypointPath: null,
      providerConfigPath: null,
    };
  }
  const pluginPath = resolve(runtimeRoot, "plugins", "cristalina-bridge");
  const providerPath = resolve(runtimeRoot, "plugins", "cristalina");
  return {
    pluginPath,
    pluginManifestPath: join(pluginPath, "plugin.yaml"),
    pluginEntrypointPath: join(pluginPath, "__init__.py"),
    pluginConfigPath: resolve(runtimeRoot, "config.yaml"),
    providerPath,
    providerManifestPath: join(providerPath, "plugin.yaml"),
    providerEntrypointPath: join(providerPath, "__init__.py"),
    providerConfigPath: resolve(runtimeRoot, ".cristalina-v4", "provider-hermes.json"),
  };
}

function hermesPluginIsListed(line: string, pluginName: string): boolean {
  const escaped = pluginName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*-\\s*['"]?${escaped}['"]?\\s*(?:#.*)?$`).test(line);
}

function nextTopLevelKey(lines: string[], start: number): number {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[^\s#][^:]*:\s*/.test(lines[index])) {
      return index;
    }
  }
  return lines.length;
}

function nextPluginSubKey(lines: string[], start: number, end: number): number {
  for (let index = start + 1; index < end; index += 1) {
    if (/^  [^\s-][^:]*:\s*/.test(lines[index])) {
      return index;
    }
  }
  return end;
}

function pluginListContains(lines: string[], keyIndex: number, blockEnd: number, pluginName: string): boolean {
  const end = nextPluginSubKey(lines, keyIndex, blockEnd);
  const inline = /^  enabled:\s*\[(.*)\]\s*(?:#.*)?$/.exec(lines[keyIndex]);
  if (inline) {
    return parseInlineYamlList(inline[1] ?? "").includes(pluginName);
  }
  return lines.slice(keyIndex + 1, end).some((line) => hermesPluginIsListed(line, pluginName));
}

function removePluginFromList(lines: string[], keyIndex: number, blockEnd: number, pluginName: string): boolean {
  let changed = false;
  let index = keyIndex + 1;
  while (index < blockEnd && !/^  [^\s-][^:]*:\s*/.test(lines[index])) {
    if (hermesPluginIsListed(lines[index], pluginName)) {
      lines.splice(index, 1);
      blockEnd -= 1;
      changed = true;
      continue;
    }
    index += 1;
  }
  return changed;
}

function parseInlineYamlList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function parseInlineYamlMap(value: string): Array<[string, string]> {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator === -1) {
        return null;
      }
      return [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()] as [string, string];
    })
    .filter((entry): entry is [string, string] => entry !== null && entry[0].length > 0);
}

function formatYamlList(key: string, values: string[]): string[] {
  return [`  ${key}:`, ...values.map((value) => `  - ${value}`)];
}

function formatYamlMap(key: string, entries: Array<[string, string]>): string[] {
  return [`${key}:`, ...entries.map(([entryKey, value]) => `  ${entryKey}: ${value}`)];
}

function normalizeInlinePluginsMap(line: string): string[] | null {
  const match = /^plugins:\s*\{\s*enabled:\s*\[(.*)\]\s*\}\s*(?:#.*)?$/.exec(line);
  if (!match) {
    return null;
  }
  return ["plugins:", ...formatYamlList("enabled", parseInlineYamlList(match[1] ?? ""))];
}

function addHermesPluginToConfigYaml(source: string, pluginName: string): { text: string; changed: boolean } {
  const lines = source.split(/\r?\n/);
  const hadTrailingNewline = lines.length > 0 && lines[lines.length - 1] === "";
  if (hadTrailingNewline) {
    lines.pop();
  }

  let pluginsIndex = lines.findIndex((line) => /^plugins:\s*(?:#.*)?$/.test(line));
  const inlineEmptyPluginsIndex = lines.findIndex((line) => /^plugins:\s*\{\s*\}\s*(?:#.*)?$/.test(line));
  if (pluginsIndex === -1 && inlineEmptyPluginsIndex !== -1) {
    lines.splice(inlineEmptyPluginsIndex, 1, "plugins:");
    pluginsIndex = inlineEmptyPluginsIndex;
  }
  if (pluginsIndex === -1) {
    const inlinePluginsIndex = lines.findIndex((line) => normalizeInlinePluginsMap(line) !== null);
    if (inlinePluginsIndex !== -1) {
      lines.splice(inlinePluginsIndex, 1, ...normalizeInlinePluginsMap(lines[inlinePluginsIndex])!);
      pluginsIndex = inlinePluginsIndex;
    }
  }
  let changed = false;

  if (pluginsIndex === -1) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
      lines.push("");
    }
    lines.push("plugins:", "  enabled:", `  - ${pluginName}`);
    return { text: `${lines.join("\n")}\n`, changed: true };
  }

  let pluginsEnd = nextTopLevelKey(lines, pluginsIndex);
  const disabledIndex = lines.findIndex((line, index) => index > pluginsIndex && index < pluginsEnd && /^  disabled:\s*(?:#.*)?$/.test(line));
  if (disabledIndex !== -1) {
    changed = removePluginFromList(lines, disabledIndex, pluginsEnd, pluginName) || changed;
    pluginsEnd = nextTopLevelKey(lines, pluginsIndex);
  }

  const enabledIndex = lines.findIndex((line, index) => index > pluginsIndex && index < pluginsEnd && /^  enabled:\s*(?:#.*)?$/.test(line));
  const inlineEnabledIndex = lines.findIndex((line, index) => index > pluginsIndex && index < pluginsEnd && /^  enabled:\s*\[.*\]\s*(?:#.*)?$/.test(line));
  if (inlineEnabledIndex !== -1) {
    const match = /^  enabled:\s*\[(.*)\]\s*(?:#.*)?$/.exec(lines[inlineEnabledIndex]);
    const enabled = [...new Set([...parseInlineYamlList(match?.[1] ?? ""), pluginName])];
    lines.splice(inlineEnabledIndex, 1, ...formatYamlList("enabled", enabled));
    return { text: `${lines.join("\n")}\n`, changed: true };
  }

  if (enabledIndex !== -1 && pluginListContains(lines, enabledIndex, pluginsEnd, pluginName)) {
    return { text: `${lines.join("\n")}${changed || hadTrailingNewline ? "\n" : ""}`, changed };
  }

  if (enabledIndex === -1) {
    lines.splice(pluginsIndex + 1, 0, "  enabled:", `  - ${pluginName}`);
    return { text: `${lines.join("\n")}\n`, changed: true };
  }

  lines.splice(enabledIndex + 1, 0, `  - ${pluginName}`);
  return { text: `${lines.join("\n")}\n`, changed: true };
}

function removeHermesPluginFromConfigYaml(source: string, pluginName: string): { text: string; changed: boolean } {
  const lines = source.split(/\r?\n/);
  const hadTrailingNewline = lines.length > 0 && lines[lines.length - 1] === "";
  if (hadTrailingNewline) {
    lines.pop();
  }
  let pluginsIndex = lines.findIndex((line) => /^plugins:\s*(?:#.*)?$/.test(line));
  const inlinePluginsIndex = lines.findIndex((line) => normalizeInlinePluginsMap(line) !== null);
  if (pluginsIndex === -1 && inlinePluginsIndex !== -1) {
    lines.splice(inlinePluginsIndex, 1, ...normalizeInlinePluginsMap(lines[inlinePluginsIndex])!);
    pluginsIndex = inlinePluginsIndex;
  }
  if (pluginsIndex === -1) {
    return { text: source, changed: false };
  }
  const pluginsEnd = nextTopLevelKey(lines, pluginsIndex);
  const enabledIndex = lines.findIndex((line, index) => index > pluginsIndex && index < pluginsEnd && /^  enabled:\s*(?:#.*)?$/.test(line));
  const inlineEnabledIndex = lines.findIndex((line, index) => index > pluginsIndex && index < pluginsEnd && /^  enabled:\s*\[.*\]\s*(?:#.*)?$/.test(line));
  if (inlineEnabledIndex !== -1) {
    const match = /^  enabled:\s*\[(.*)\]\s*(?:#.*)?$/.exec(lines[inlineEnabledIndex]);
    const enabled = parseInlineYamlList(match?.[1] ?? "").filter((entry) => entry !== pluginName);
    lines.splice(inlineEnabledIndex, 1, ...formatYamlList("enabled", enabled));
    return { text: `${lines.join("\n")}\n`, changed: true };
  }
  if (enabledIndex === -1) {
    return { text: source, changed: false };
  }
  const changed = removePluginFromList(lines, enabledIndex, pluginsEnd, pluginName);
  return { text: `${lines.join("\n")}${changed || hadTrailingNewline ? "\n" : ""}`, changed };
}

function setHermesMemoryProviderInConfigYaml(source: string, providerName: string): { text: string; changed: boolean } {
  const lines = source.split(/\r?\n/);
  const hadTrailingNewline = lines.length > 0 && lines[lines.length - 1] === "";
  if (hadTrailingNewline) {
    lines.pop();
  }
  let changed = false;
  let memoryIndex = lines.findIndex((line) => /^memory:\s*(?:#.*)?$/.test(line));
  const inlineMemoryIndex = lines.findIndex((line) => /^memory:\s*\{.*\}\s*(?:#.*)?$/.test(line));
  if (memoryIndex === -1 && inlineMemoryIndex !== -1) {
    const match = /^memory:\s*\{(.*)\}\s*(?:#.*)?$/.exec(lines[inlineMemoryIndex]);
    const entries = parseInlineYamlMap(match?.[1] ?? "").filter(([key]) => key !== "provider");
    lines.splice(inlineMemoryIndex, 1, ...formatYamlMap("memory", [["provider", providerName], ...entries]));
    memoryIndex = inlineMemoryIndex;
    changed = true;
  }
  if (memoryIndex === -1) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
      lines.push("");
    }
    lines.push("memory:", `  provider: ${providerName}`);
    return { text: `${lines.join("\n")}\n`, changed: true };
  }
  const memoryEnd = nextTopLevelKey(lines, memoryIndex);
  const providerIndex = lines.findIndex((line, index) => index > memoryIndex && index < memoryEnd && /^  provider:\s*/.test(line));
  if (providerIndex === -1) {
    lines.splice(memoryIndex + 1, 0, `  provider: ${providerName}`);
    changed = true;
  } else if (!new RegExp(`^  provider:\\s*['"]?${providerName}['"]?\\s*(?:#.*)?$`).test(lines[providerIndex])) {
    lines[providerIndex] = `  provider: ${providerName}`;
    changed = true;
  }
  return { text: `${lines.join("\n")}${changed || hadTrailingNewline ? "\n" : ""}`, changed };
}

async function enableHermesBridgePlugin(configPath: string | null): Promise<string[]> {
  if (!configPath) {
    return [];
  }
  let source: string;
  try {
    source = await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [`Hermes config.yaml not found at ${configPath}; run hermes plugins enable cristalina-bridge or add it to plugins.enabled before restarting Hermes.`];
    }
    throw error;
  }

  const updated = addHermesPluginToConfigYaml(source, "cristalina-bridge");
  if (!updated.changed) {
    return [`Hermes plugin cristalina-bridge is already listed in ${configPath}.`];
  }
  await writeFile(configPath, updated.text);
  return [`Hermes plugin cristalina-bridge was added to plugins.enabled in ${configPath}.`];
}

async function configureHermesProvider(configPath: string | null, integrationMode: "provider" | "bridge" | "both"): Promise<string[]> {
  if (!configPath || integrationMode === "bridge") {
    return [];
  }
  let source: string;
  try {
    source = await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [`Hermes config.yaml not found at ${configPath}; set memory.provider to cristalina before restarting Hermes.`];
    }
    throw error;
  }

  const withProvider = setHermesMemoryProviderInConfigYaml(source, "cristalina");
  const withoutBridge = integrationMode === "provider"
    ? removeHermesPluginFromConfigYaml(withProvider.text, "cristalina-bridge")
    : { text: withProvider.text, changed: false };
  if (withProvider.changed || withoutBridge.changed) {
    await writeFile(configPath, withoutBridge.text);
  }
  return [
    withProvider.changed
      ? `Hermes memory.provider was set to cristalina in ${configPath}.`
      : `Hermes memory.provider is already cristalina in ${configPath}.`,
    ...(withoutBridge.changed
      ? [`Hermes plugin cristalina-bridge was removed from plugins.enabled because integration-mode=provider.`]
      : []),
  ];
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

function defaultStoreRootForConfigPath(configPath: string | undefined): string | undefined {
  if (!configPath) {
    return undefined;
  }
  const configDir = dirname(resolve(configPath));
  return basename(configDir) === ".cristalina-v4" ? configDir : join(configDir, ".cristalina-v4");
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
    storeRoot: defaultStoreRootForConfigPath(input.configPath),
  });
  return {
    config: created.config,
    configPath: created.path,
    diagnostics: ["Config was missing; created a local default config for installation."],
  };
}

export async function installRuntime(input: RuntimeInstallInput): Promise<RuntimeInstallResult> {
  const loaded = await loadOrCreateConfig(input);
  const diagnostics = [...loaded.diagnostics];
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
  const pluginPaths = input.runtime === "hermes" ? hermesPluginPaths(input.runtimeRoot) : hermesPluginPaths(undefined);
  const integrationMode = input.runtime === "hermes" ? input.integrationMode ?? "provider" : "bridge";
  const cliPath = cliEntrypointPath();
  const runtimeRef = runtimeInstanceRef(loaded.config, input.runtime);
  const bridgeCommand = `cristalina bridge event --config ${loaded.configPath} --event <event.json>`;
  const hookBridgeCommand = `${shellQuote(process.execPath)} ${shellQuote(cliPath)} bridge event --config ${shellQuote(loaded.configPath)} --event <event.json>`;
  const projectionCommand = `cristalina projection list --config ${loaded.configPath}`;
  const sessionPackCommand = `cristalina session-pack latest --runtime ${input.runtime} --config ${loaded.configPath}`;
  const pluginEnableHint = pluginPaths.pluginPath
    ? integrationMode === "bridge"
      ? "Installer adds cristalina-bridge to Hermes plugins.enabled when config.yaml is present; restart Hermes so post_llm_call hooks are registered."
      : "Installer sets Hermes memory.provider to cristalina; restart Hermes so the native memory provider is loaded."
    : undefined;
  const providerConfig = pluginPaths.providerConfigPath
    ? {
        schema_version: 1,
        provider: "cristalina",
        integration_mode: integrationMode,
        installed_at: new Date().toISOString(),
        config_path: loaded.configPath,
        store_root: storeRoot,
        runtime_root: input.runtimeRoot ?? null,
        runtime_instance_ref: runtimeRef,
        node_path: process.execPath,
        cli_path: cliPath,
        event_contract: "cristalina.runtime_bridge_event.v1",
        recognition_projection_profile: "hermes_recognition_v1",
        prefetch_timeout_seconds: 2.5,
        sync_timeout_seconds: 5,
        bridge_fallback_hook: hookScriptPath,
        authority_note: "Provider payloads are evidence and derived context only; owner authority remains in Cristalina review flows.",
      }
    : null;
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
    integration_mode: integrationMode,
    plugin_enable_hint: pluginEnableHint,
    ...((integrationMode === "bridge" || integrationMode === "both") && pluginPaths.pluginPath
      ? {
          plugin_path: pluginPaths.pluginPath,
          plugin_manifest_path: pluginPaths.pluginManifestPath,
          plugin_entrypoint_path: pluginPaths.pluginEntrypointPath,
          plugin_config_path: pluginPaths.pluginConfigPath,
          plugin_enable_hint: pluginEnableHint,
        }
      : {}),
    ...((integrationMode === "provider" || integrationMode === "both") && pluginPaths.providerPath
      ? {
          provider_path: pluginPaths.providerPath,
          provider_manifest_path: pluginPaths.providerManifestPath,
          provider_entrypoint_path: pluginPaths.providerEntrypointPath,
          provider_config_path: pluginPaths.providerConfigPath,
        }
      : {}),
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
    bridge_command: hookBridgeCommand,
    bridge_command_argv: [process.execPath, cliPath, "bridge", "event", "--config", loaded.configPath, "--event", "$CRISTALINA_EVENT_PATH"],
    projection_command: projectionCommand,
    session_pack_command: sessionPackCommand,
    hook_script_path: hookScriptPath,
    integration_mode: integrationMode,
    plugin_enable_hint: pluginEnableHint,
    ...((integrationMode === "bridge" || integrationMode === "both") && pluginPaths.pluginPath
      ? {
          plugin_path: pluginPaths.pluginPath,
          plugin_manifest_path: pluginPaths.pluginManifestPath,
          plugin_entrypoint_path: pluginPaths.pluginEntrypointPath,
          plugin_config_path: pluginPaths.pluginConfigPath,
          plugin_enable_hint: pluginEnableHint,
        }
      : {}),
    authority_note: metadata.authority_note,
  };
  const hookScript = [
    "#!/bin/sh",
    "set -eu",
    "if [ \"${CRISTALINA_EVENT_PATH:-}\" = \"\" ]; then",
    `  echo "CRISTALINA_EVENT_PATH is required for ${input.runtime} Cristalina bridge hook" >&2`,
    "  exit 2",
    "fi",
    `exec ${shellQuote(process.execPath)} ${shellQuote(cliPath)} bridge event --config ${shellQuote(loaded.configPath)} --event "$CRISTALINA_EVENT_PATH"`,
    "",
  ].join("\n");

  await mkdir(dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  await mkdir(dirname(hookPath), { recursive: true });
  await writeFile(hookPath, `${JSON.stringify(hook, null, 2)}\n`);
  await writeFile(hookScriptPath, hookScript, { mode: 0o755 });
  await chmod(hookScriptPath, 0o755);
  if (input.runtime === "hermes" && pluginPaths.pluginPath && pluginPaths.pluginManifestPath && pluginPaths.pluginEntrypointPath) {
    if (integrationMode === "bridge" || integrationMode === "both") {
      const pluginManifest = buildHermesBridgePluginManifest();
      const pluginEntrypoint = buildHermesBridgePluginEntrypoint();
      await mkdir(pluginPaths.pluginPath, { recursive: true });
      await writeFile(pluginPaths.pluginManifestPath, pluginManifest);
      await writeFile(pluginPaths.pluginEntrypointPath, pluginEntrypoint);
      diagnostics.push(...(await enableHermesBridgePlugin(pluginPaths.pluginConfigPath)));
    }
    if (
      (integrationMode === "provider" || integrationMode === "both") &&
      pluginPaths.providerPath &&
      pluginPaths.providerManifestPath &&
      pluginPaths.providerEntrypointPath &&
      pluginPaths.providerConfigPath &&
      providerConfig
    ) {
      await mkdir(pluginPaths.providerPath, { recursive: true });
      await mkdir(dirname(pluginPaths.providerConfigPath), { recursive: true });
      await writeFile(pluginPaths.providerManifestPath, buildHermesMemoryProviderManifest());
      await writeFile(pluginPaths.providerEntrypointPath, buildHermesMemoryProviderEntrypoint());
      await writeFile(pluginPaths.providerConfigPath, `${JSON.stringify(providerConfig, null, 2)}\n`);
      diagnostics.push(...(await configureHermesProvider(pluginPaths.pluginConfigPath, integrationMode)));
    }
  }

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
    integration_mode: integrationMode,
    plugin_enable_hint: pluginEnableHint,
    ...((integrationMode === "bridge" || integrationMode === "both") && pluginPaths.pluginPath
      ? {
          plugin_path: pluginPaths.pluginPath,
          plugin_manifest_path: pluginPaths.pluginManifestPath ?? undefined,
          plugin_entrypoint_path: pluginPaths.pluginEntrypointPath ?? undefined,
          plugin_config_path: pluginPaths.pluginConfigPath ?? undefined,
          plugin_enable_hint: pluginEnableHint,
        }
      : {}),
    ...((integrationMode === "provider" || integrationMode === "both") && pluginPaths.providerPath
      ? {
          provider_path: pluginPaths.providerPath,
          provider_manifest_path: pluginPaths.providerManifestPath ?? undefined,
          provider_entrypoint_path: pluginPaths.providerEntrypointPath ?? undefined,
          provider_config_path: pluginPaths.providerConfigPath ?? undefined,
        }
      : {}),
    uninstall_hint: metadata.disable_hint,
    diagnostics,
  };
}

function buildHermesBridgePluginManifest(): string {
  return [
    "name: cristalina-bridge",
    "version: 0.1.0",
    "description: Emit Hermes turn events into the Cristalina v4 governed memory bridge.",
    "provides_hooks:",
    "  - post_llm_call",
    "authority_note: Event payloads are evidence only; owner authority remains in Cristalina review flows.",
    "",
  ].join("\n");
}

function buildHermesBridgePluginEntrypoint(): string {
  return [
    "\"\"\"Hermes general hook plugin for the Cristalina v4 runtime bridge.",
    "",
    "This plugin intentionally emits evidence events only. It does not implement",
    "a Hermes-native memory provider and does not grant owner authority.",
    "\"\"\"",
    "",
    "from __future__ import annotations",
    "",
    "import json",
    "import os",
    "import subprocess",
    "from datetime import datetime, timezone",
    "from pathlib import Path",
    "from typing import Any",
    "",
    "",
    "PLUGIN_DIR = Path(__file__).resolve().parent",
    "HERMES_ROOT = PLUGIN_DIR.parent.parent",
    "CRISTALINA_DIR = HERMES_ROOT / '.cristalina-v4'",
    "EVENT_DIR = CRISTALINA_DIR / 'events'",
    "HOOK_SCRIPT = CRISTALINA_DIR / 'hooks' / 'cristalina-bridge-event.sh'",
    "METADATA_PATH = CRISTALINA_DIR / 'runtime-hermes.json'",
    "",
    "",
    "def _get(value: Any, *names: str, default: Any = None) -> Any:",
    "    for name in names:",
    "        if isinstance(value, dict) and name in value:",
    "            return value[name]",
    "        if hasattr(value, name):",
    "            return getattr(value, name)",
    "    return default",
    "",
    "",
    "def _text(value: Any) -> str:",
    "    if value is None:",
    "        return ''",
    "    if isinstance(value, str):",
    "        return value",
    "    try:",
    "        return json.dumps(value, ensure_ascii=False, sort_keys=True)",
    "    except TypeError:",
    "        return str(value)",
    "",
    "",
    "def _safe_id(value: str) -> str:",
    "    cleaned = ''.join(ch.lower() if ch.isalnum() else '_' for ch in value).strip('_')",
    "    return cleaned[:96] or 'event'",
    "",
    "",
    "def _now() -> str:",
    "    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')",
    "",
    "",
    "def _metadata() -> dict[str, Any]:",
    "    try:",
    "        return json.loads(METADATA_PATH.read_text(encoding='utf-8'))",
    "    except FileNotFoundError:",
    "        return {}",
    "",
    "",
    "def _build_event(payload: Any) -> dict[str, Any]:",
    "    metadata = _metadata()",
    "    occurred_at = _get(payload, 'occurred_at', 'timestamp', default=_now())",
    "    session_ref = _get(payload, 'session_id', 'session_ref', 'runtime_session_ref', default='session_hermes_auto_001')",
    "    thread_ref = _get(payload, 'thread_id', 'conversation_id', 'conversation_thread_ref', default=session_ref)",
    "    user_message = _get(payload, 'user_message', 'prompt', 'input', default='')",
    "    assistant_response = _get(payload, 'assistant_response', 'response', 'output', default='')",
    "    message = '\\n\\n'.join(part for part in [_text(user_message), _text(assistant_response)] if part) or _text(payload)",
    "    event_seed = f'{session_ref}:{thread_ref}:{occurred_at}:{message[:64]}'",
    "    event_id = 'evt_hermes_auto_' + _safe_id(event_seed)",
    "    runtime_ref = metadata.get('runtime_instance_ref') or 'runtime_hermes_local_001'",
    "    speaker_ref = _get(payload, 'speaker_ref', 'actor_ref', default=None)",
    "    event = {",
    "        'event_id': event_id,",
    "        'event_type': 'message_observed',",
    "        'runtime': 'hermes',",
    "        'occurred_at': occurred_at,",
    "        'actor_ref': 'system:hermes-cristalina-bridge',",
    "        'authenticated_principal': {",
    "            'kind': 'system',",
    "            'actor_ref': 'system:hermes-cristalina-bridge',",
    "            'system_scope': 'hermes-cristalina-bridge',",
    "        },",
    "        'runtime_instance_ref': runtime_ref,",
    "        'runtime_session_ref': str(session_ref),",
    "        'conversation_thread_ref': str(thread_ref),",
    "        'source_ref': f'runtime/hermes/auto/{event_id}',",
    "        'message_refs': [f'msg_{event_id}'],",
    "        'message': message,",
    "    }",
    "    if isinstance(speaker_ref, str) and speaker_ref.strip():",
    "        event['speaker_ref'] = speaker_ref.strip()",
    "    return event",
    "",
    "",
    "def emit_cristalina_event(payload: Any = None, **kwargs: Any) -> dict[str, Any]:",
    "    data = payload if payload is not None else kwargs",
    "    event = _build_event(data)",
    "    EVENT_DIR.mkdir(parents=True, exist_ok=True)",
    "    event_path = EVENT_DIR / f\"{event['event_id']}.json\"",
    "    event_path.write_text(json.dumps(event, indent=2, ensure_ascii=False) + '\\n', encoding='utf-8')",
    "    env = os.environ.copy()",
    "    env['CRISTALINA_EVENT_PATH'] = str(event_path)",
    "    bridge_log_path = EVENT_DIR / f\"{event['event_id']}.bridge.log\"",
    "    with bridge_log_path.open('ab') as bridge_log:",
    "        process = subprocess.Popen(",
    "            [str(HOOK_SCRIPT)],",
    "            env=env,",
    "            stdin=subprocess.DEVNULL,",
    "            stdout=bridge_log,",
    "            stderr=subprocess.STDOUT,",
    "            start_new_session=True,",
    "        )",
    "    return {",
    "        'event_path': str(event_path),",
    "        'bridge_log_path': str(bridge_log_path),",
    "        'bridge_pid': process.pid,",
    "    }",
    "",
    "",
    "def register(ctx: Any) -> None:",
    "    if hasattr(ctx, 'register_hook'):",
    "        ctx.register_hook('post_llm_call', emit_cristalina_event)",
    "        return",
    "    hooks = getattr(ctx, 'hooks', None)",
    "    if isinstance(hooks, dict):",
    "        hooks.setdefault('post_llm_call', []).append(emit_cristalina_event)",
    "        return",
    "    raise RuntimeError('Hermes plugin context does not expose register_hook or hooks dict')",
    "",
  ].join("\n");
}

function buildHermesMemoryProviderManifest(): string {
  return [
    "name: cristalina",
    "version: 0.1.0",
    "description: Native Hermes memory provider backed by Cristalina v4 governed memory.",
    "type: memory_provider",
    "provider_class: CristalinaMemoryProvider",
    "authority_note: Prefetch context is derived memory; sync payloads are evidence only.",
    "",
  ].join("\n");
}

function buildHermesMemoryProviderEntrypoint(): string {
  return [
    "\"\"\"Hermes native memory provider for Cristalina v4.",
    "",
    "The provider consumes Cristalina recognition/hydration projections before",
    "LLM calls and emits completed turns as evidence after responses. It never",
    "grants owner authority and never writes canonical truth directly.",
    "\"\"\"",
    "",
    "from __future__ import annotations",
    "",
    "import hashlib",
    "import json",
    "import logging",
    "import os",
    "import subprocess",
    "import threading",
    "from datetime import datetime, timezone",
    "from pathlib import Path",
    "from typing import Any, Dict, List",
    "",
    "from agent.memory_provider import MemoryProvider",
    "",
    "logger = logging.getLogger(__name__)",
    "",
    "PLUGIN_DIR = Path(__file__).resolve().parent",
    "",
    "",
    "def _resolve_hermes_root() -> Path:",
    "    env_home = os.environ.get('HERMES_HOME')",
    "    if env_home:",
    "        return Path(env_home)",
    "    for candidate in [PLUGIN_DIR, *PLUGIN_DIR.parents]:",
    "        if (candidate / '.cristalina-v4' / 'provider-hermes.json').exists():",
    "            return candidate",
    "    return PLUGIN_DIR.parent.parent",
    "",
    "",
    "HERMES_ROOT = _resolve_hermes_root()",
    "CRISTALINA_DIR = HERMES_ROOT / '.cristalina-v4'",
    "PROVIDER_CONFIG_PATH = CRISTALINA_DIR / 'provider-hermes.json'",
    "EVENT_DIR = CRISTALINA_DIR / 'events'",
    "",
    "",
    "def _now() -> str:",
    "    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')",
    "",
    "",
    "def _load_config() -> Dict[str, Any]:",
    "    try:",
    "        return json.loads(PROVIDER_CONFIG_PATH.read_text(encoding='utf-8'))",
    "    except FileNotFoundError:",
    "        return {}",
    "    except Exception as exc:",
    "        logger.warning('Could not read Cristalina provider config: %s', exc)",
    "        return {}",
    "",
    "",
    "def _text(value: Any) -> str:",
    "    if value is None:",
    "        return ''",
    "    if isinstance(value, str):",
    "        return value",
    "    try:",
    "        return json.dumps(value, ensure_ascii=False, sort_keys=True)",
    "    except TypeError:",
    "        return str(value)",
    "",
    "",
    "class CristalinaMemoryProvider(MemoryProvider):",
    "    def __init__(self) -> None:",
    "        self._config: Dict[str, Any] = {}",
    "        self._session_id = ''",
    "        self._platform = ''",
    "        self._turn_number = 0",
    "        self._prefetch_lock = threading.Lock()",
    "        self._prefetch_result = ''",
    "        self._prefetch_thread: threading.Thread | None = None",
    "        self._sync_threads: list[threading.Thread] = []",
    "",
    "    @property",
    "    def name(self) -> str:",
    "        return 'cristalina'",
    "",
    "    def is_available(self) -> bool:",
    "        cfg = _load_config()",
    "        cli = Path(str(cfg.get('cli_path', '')))",
    "        config = Path(str(cfg.get('config_path', '')))",
    "        return bool(cfg) and cli.exists() and config.exists()",
    "",
    "    def initialize(self, session_id: str, **kwargs: Any) -> None:",
    "        self._config = _load_config()",
    "        self._session_id = session_id",
    "        self._platform = str(kwargs.get('platform') or '')",
    "",
    "    def system_prompt_block(self) -> str:",
    "        return (",
    "            '# Cristalina Memory\\n'",
    "            'Active as the native governed memory provider. Use prefetched Cristalina context silently as derived memory. '",
    "            'Do not infer owner authority from runtime evidence; owner ratification remains inside Cristalina review flows.'",
    "        )",
    "",
    "    def _command(self, *args: str) -> list[str]:",
    "        node = str(self._config.get('node_path') or os.environ.get('NODE_PATH') or 'node')",
    "        cli = str(self._config.get('cli_path') or '')",
    "        return [node, cli, *args]",
    "",
    "    def _run_cli(self, args: list[str], timeout: float) -> str:",
    "        cli = str(self._config.get('cli_path') or '')",
    "        config = str(self._config.get('config_path') or '')",
    "        if not cli or not config:",
    "            return ''",
    "        result = subprocess.run(",
    "            self._command(*args),",
    "            stdin=subprocess.DEVNULL,",
    "            stdout=subprocess.PIPE,",
    "            stderr=subprocess.PIPE,",
    "            text=True,",
    "            timeout=timeout,",
    "            check=False,",
    "        )",
    "        if result.returncode != 0:",
    "            logger.warning('Cristalina CLI command failed: %s', result.stderr[-1000:])",
    "            return ''",
    "        return result.stdout",
    "",
    "    def _compile_context(self, query: str, session_id: str = '') -> str:",
    "        timeout = float(self._config.get('prefetch_timeout_seconds') or 2.5)",
    "        config = str(self._config.get('config_path') or '')",
    "        args = ['projection', 'recognition', '--config', config, '--format', 'context']",
    "        active_session = session_id or self._session_id",
    "        runtime_ref = str(self._config.get('runtime_instance_ref') or '')",
    "        if runtime_ref:",
    "            args.extend(['--runtime-instance-ref', runtime_ref])",
    "        if active_session:",
    "            args.extend(['--runtime-session-ref', active_session, '--conversation-thread-ref', active_session])",
    "        if query:",
    "            args.extend(['--query', query])",
    "        return self._run_cli(args, timeout)",
    "",
    "    def prefetch(self, query: str, *, session_id: str = '') -> str:",
    "        if self._prefetch_thread and self._prefetch_thread.is_alive():",
    "            self._prefetch_thread.join(timeout=0.2)",
    "        with self._prefetch_lock:",
    "            result = self._prefetch_result",
    "            self._prefetch_result = ''",
    "        if result:",
    "            return result",
    "        return self._compile_context(query, session_id)",
    "",
    "    def queue_prefetch(self, query: str, *, session_id: str = '') -> None:",
    "        if self._prefetch_thread and self._prefetch_thread.is_alive():",
    "            return",
    "",
    "        def _run() -> None:",
    "            try:",
    "                result = self._compile_context(query, session_id)",
    "                with self._prefetch_lock:",
    "                    self._prefetch_result = result",
    "            except Exception as exc:",
    "                logger.warning('Cristalina queue_prefetch failed: %s', exc)",
    "",
    "        self._prefetch_thread = threading.Thread(target=_run, daemon=True)",
    "        self._prefetch_thread.start()",
    "",
    "    def on_turn_start(self, turn_number: int, message: str, **kwargs: Any) -> None:",
    "        self._turn_number = turn_number",
    "",
    "    def _event_id(self, session_id: str, user_content: str, assistant_content: str) -> str:",
    "        seed = f'{session_id}\\n{self._turn_number}\\n{user_content}\\n{assistant_content}'.encode('utf-8')",
    "        return 'evt_hermes_provider_' + hashlib.sha256(seed).hexdigest()[:32]",
    "",
    "    def _write_event(self, user_content: str, assistant_content: str, session_id: str) -> Path:",
    "        EVENT_DIR.mkdir(parents=True, exist_ok=True)",
    "        event_id = self._event_id(session_id, user_content, assistant_content)",
    "        event = {",
    "            'event_id': event_id,",
    "            'event_type': 'message_observed',",
    "            'runtime': 'hermes',",
    "            'occurred_at': _now(),",
    "            'actor_ref': 'system:hermes-cristalina-provider',",
    "            'authenticated_principal': {",
    "                'kind': 'system',",
    "                'actor_ref': 'system:hermes-cristalina-provider',",
    "                'system_scope': 'hermes-cristalina-provider',",
    "            },",
    "            'runtime_instance_ref': self._config.get('runtime_instance_ref') or 'runtime_hermes_local_001',",
    "            'runtime_session_ref': session_id or self._session_id or 'session_hermes_provider_001',",
    "            'conversation_thread_ref': session_id or self._session_id or 'thread_hermes_provider_001',",
    "            'source_ref': f'runtime/hermes/provider/{event_id}',",
    "            'message_refs': [f'msg_{event_id}'],",
    "            'message': '\\n\\n'.join(part for part in [_text(user_content), _text(assistant_content)] if part),",
    "        }",
    "        event_path = EVENT_DIR / f'{event_id}.json'",
    "        event_path.write_text(json.dumps(event, indent=2, ensure_ascii=False) + '\\n', encoding='utf-8')",
    "        return event_path",
    "",
    "    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = '') -> None:",
    "        active_session = session_id or self._session_id",
    "",
    "        def _run() -> None:",
    "            try:",
    "                event_path = self._write_event(user_content, assistant_content, active_session)",
    "                config = str(self._config.get('config_path') or '')",
    "                timeout = float(self._config.get('sync_timeout_seconds') or 5)",
    "                log_path = event_path.with_suffix('.provider.log')",
    "                with log_path.open('ab') as log:",
    "                    subprocess.run(",
    "                        self._command('bridge', 'event', '--config', config, '--event', str(event_path)),",
    "                        stdin=subprocess.DEVNULL,",
    "                        stdout=log,",
    "                        stderr=subprocess.STDOUT,",
    "                        timeout=timeout,",
    "                        check=False,",
    "                    )",
    "            except Exception as exc:",
    "                logger.warning('Cristalina sync_turn failed: %s', exc)",
    "",
    "        thread = threading.Thread(target=_run, daemon=True)",
    "        self._sync_threads.append(thread)",
    "        thread.start()",
    "",
    "    def on_session_switch(self, new_session_id: str, *, parent_session_id: str = '', reset: bool = False, **kwargs: Any) -> None:",
    "        self._session_id = new_session_id",
    "        if reset:",
    "            self._turn_number = 0",
    "            with self._prefetch_lock:",
    "                self._prefetch_result = ''",
    "",
    "    def on_pre_compress(self, messages: List[Dict[str, Any]]) -> str:",
    "        return self._compile_context('session compression continuity', self._session_id)",
    "",
    "    def get_tool_schemas(self) -> List[Dict[str, Any]]:",
    "        return [",
    "            {",
    "                'name': 'cristalina_archive_search',",
    "                'description': 'Deepen Cristalina memory context when prefetched recognition and hydration are insufficient. Returns derived context with refs, not owner authority.',",
    "                'parameters': {",
    "                    'type': 'object',",
    "                    'properties': {",
    "                        'query': {'type': 'string', 'description': 'Memory question or entity/topic to hydrate.'},",
    "                    },",
    "                    'required': ['query'],",
    "                },",
    "            },",
    "            {",
    "                'name': 'cristalina_memory_status',",
    "                'description': 'Inspect Cristalina governed memory status and diagnostics.',",
    "                'parameters': {'type': 'object', 'properties': {}, 'required': []},",
    "            },",
    "        ]",
    "",
    "    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs: Any) -> str:",
    "        config = str(self._config.get('config_path') or '')",
    "        if tool_name == 'cristalina_archive_search':",
    "            query = str(args.get('query') or '')",
    "            return json.dumps({'context': self._compile_context(query, self._session_id)}, ensure_ascii=False)",
    "        if tool_name == 'cristalina_memory_status':",
    "            status = self._run_cli(['status', '--config', config], float(self._config.get('prefetch_timeout_seconds') or 2.5))",
    "            diagnostics = self._run_cli(['diagnostics', 'list', '--config', config], float(self._config.get('prefetch_timeout_seconds') or 2.5))",
    "            return json.dumps({'status': status, 'diagnostics': diagnostics}, ensure_ascii=False)",
    "        raise NotImplementedError(f'Cristalina provider does not handle {tool_name}')",
    "",
    "    def shutdown(self) -> None:",
    "        timeout = min(float(self._config.get('sync_timeout_seconds') or 5), 5.0)",
    "        for thread in list(self._sync_threads):",
    "            if thread.is_alive():",
    "                thread.join(timeout=timeout)",
    "",
    "",
    "def register(ctx: Any) -> None:",
    "    ctx.register_memory_provider(CristalinaMemoryProvider())",
    "",
  ].join("\n");
}

export function openClawInstallOneLiner(url = "https://.../install-openclaw.sh"): string {
  return `curl -fsSL ${url} | sh`;
}

export function hermesInstallOneLiner(url = "https://.../install-hermes.sh"): string {
  return `curl -fsSL ${url} | sh`;
}
