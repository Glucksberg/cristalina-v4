import { createHash } from "node:crypto";
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
  session_reset_tips_path?: string;
  memory_consolidation_metadata_path?: string;
  memory_consolidation_script_path?: string;
  memory_consolidation_cron_script_path?: string;
  memory_consolidation_cron_jobs_path?: string;
  memory_consolidation_cron_job_id?: string;
  memory_consolidation_interval_minutes?: number;
  memory_consolidation_schedule_expr?: string;
  memory_consolidation_schedule_display?: string;
  memory_maturation_metadata_path?: string;
  memory_maturation_script_path?: string;
  memory_maturation_cron_script_path?: string;
  memory_maturation_cron_job_id?: string;
  memory_maturation_schedule_expr?: string;
  memory_maturation_schedule_display?: string;
  memory_cycle_metadata_path?: string;
  memory_cycle_cron_script_path?: string;
  memory_cycle_cron_job_id?: string;
  memory_cycle_schedule_expr?: string;
  memory_cycle_schedule_display?: string;
  integration_mode?: "provider" | "bridge" | "both";
  uninstall_hint: string;
  diagnostics: string[];
}

export interface CristalinaInstallationRegistryEntry {
  runtime: "openclaw" | "hermes";
  runtime_root: string | null;
  config_path: string;
  metadata_path: string;
  integration_mode: "provider" | "bridge" | "both";
  installed_at: string;
}

export interface CristalinaInstallationRegistry {
  schema_version: 1;
  updated_at: string;
  installations: CristalinaInstallationRegistryEntry[];
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

export function installationRegistryPath(configPath: string): string {
  return join(dirname(resolve(configPath)), "installations.json");
}

export async function loadInstallationRegistry(configPath: string): Promise<CristalinaInstallationRegistry | null> {
  try {
    const parsed = JSON.parse(await readFile(installationRegistryPath(configPath), "utf8")) as Partial<CristalinaInstallationRegistry>;
    if (parsed.schema_version !== 1 || !Array.isArray(parsed.installations)) return null;
    return {
      schema_version: 1,
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : new Date(0).toISOString(),
      installations: parsed.installations.filter((entry): entry is CristalinaInstallationRegistryEntry =>
        entry !== null &&
        typeof entry === "object" &&
        (entry.runtime === "openclaw" || entry.runtime === "hermes") &&
        (entry.runtime_root === null || typeof entry.runtime_root === "string") &&
        typeof entry.config_path === "string" &&
        typeof entry.metadata_path === "string" &&
        (entry.integration_mode === "provider" || entry.integration_mode === "bridge" || entry.integration_mode === "both") &&
        typeof entry.installed_at === "string",
      ),
    };
  } catch {
    return null;
  }
}

async function recordInstallation(input: CristalinaInstallationRegistryEntry): Promise<void> {
  const now = new Date().toISOString();
  const registryPath = installationRegistryPath(input.config_path);
  const existing = await loadInstallationRegistry(input.config_path);
  const installations = (existing?.installations ?? []).filter((entry) => entry.runtime !== input.runtime);
  installations.push(input);
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, `${JSON.stringify({
    schema_version: 1,
    updated_at: now,
    installations,
  } satisfies CristalinaInstallationRegistry, null, 2)}\n`);
}

function stableHermesNamedCronJobId(input: { runtimeRoot: string; configPath: string; name: string }): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 12);
}

function isoNextLocalTime(hour: number, minute: number): string {
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

type HermesCronDeliveryOrigin = {
  platform: string;
  chat_id: string;
  chat_name: string | null;
  thread_id: string | null;
};

function isHermesCronDeliveryOrigin(value: unknown): value is HermesCronDeliveryOrigin {
  if (!value || typeof value !== "object") return false;
  const origin = value as Record<string, unknown>;
  return typeof origin.platform === "string" &&
    origin.platform.length > 0 &&
    typeof origin.chat_id === "string" &&
    origin.chat_id.length > 0 &&
    (origin.chat_name === null || typeof origin.chat_name === "string") &&
    (origin.thread_id === null || typeof origin.thread_id === "string");
}

async function inferHermesCronDeliveryOrigin(runtimeRoot: string): Promise<HermesCronDeliveryOrigin | null> {
  try {
    const parsed = JSON.parse(await readFile(join(runtimeRoot, "channel_directory.json"), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const platforms = (parsed as { platforms?: unknown }).platforms;
    if (!platforms || typeof platforms !== "object") return null;

    const origins: HermesCronDeliveryOrigin[] = [];
    for (const [platform, entries] of Object.entries(platforms as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const channel = entry as Record<string, unknown>;
        if (typeof channel.id !== "string" || channel.id.length === 0) continue;
        origins.push({
          platform,
          chat_id: channel.id,
          chat_name: typeof channel.name === "string" ? channel.name : null,
          thread_id: typeof channel.thread_id === "string" ? channel.thread_id : null,
        });
      }
    }
    return origins.length === 1 ? origins[0]! : null;
  } catch {
    return null;
  }
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
  sessionResetTipsPath: string | null;
  memoryConsolidationMetadataPath: string | null;
  memoryConsolidationScriptPath: string | null;
  memoryConsolidationCronScriptPath: string | null;
  memoryConsolidationCronJobsPath: string | null;
  memoryMaturationMetadataPath: string | null;
  memoryMaturationScriptPath: string | null;
  memoryMaturationCronScriptPath: string | null;
  memoryCycleMetadataPath: string | null;
  memoryCycleCronScriptPath: string | null;
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
      sessionResetTipsPath: null,
      memoryConsolidationMetadataPath: null,
      memoryConsolidationScriptPath: null,
      memoryConsolidationCronScriptPath: null,
      memoryConsolidationCronJobsPath: null,
      memoryMaturationMetadataPath: null,
      memoryMaturationScriptPath: null,
      memoryMaturationCronScriptPath: null,
      memoryCycleMetadataPath: null,
      memoryCycleCronScriptPath: null,
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
    sessionResetTipsPath: resolve(runtimeRoot, "session-reset-tips.d", "cristalina.json"),
    memoryConsolidationMetadataPath: resolve(runtimeRoot, ".cristalina-v4", "memory-consolidation-hermes.json"),
    memoryConsolidationScriptPath: resolve(runtimeRoot, "scripts", "cristalina-memory-consolidation.sh"),
    memoryConsolidationCronScriptPath: resolve(runtimeRoot, "scripts", "cristalina-memory-consolidation.py"),
    memoryConsolidationCronJobsPath: resolve(runtimeRoot, "cron", "jobs.json"),
    memoryMaturationMetadataPath: resolve(runtimeRoot, ".cristalina-v4", "memory-maturation-hermes.json"),
    memoryMaturationScriptPath: resolve(runtimeRoot, "scripts", "cristalina-memory-maturation.sh"),
    memoryMaturationCronScriptPath: resolve(runtimeRoot, "scripts", "cristalina-memory-maturation.py"),
    memoryCycleMetadataPath: resolve(runtimeRoot, ".cristalina-v4", "memory-cycle-hermes.json"),
    memoryCycleCronScriptPath: resolve(runtimeRoot, "scripts", "cristalina-memory-cycle.py"),
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

async function upsertHermesMemoryCycleCron(input: {
  runtimeRoot: string | undefined;
  jobsPath: string | null;
  cronScriptPath: string | null;
  configPath: string;
  scheduleExpr: string;
  scheduleDisplay: string;
  scheduleHour: number;
  scheduleMinute: number;
}): Promise<{ jobId?: string; diagnostics: string[] }> {
  if (!input.runtimeRoot || !input.jobsPath || !input.cronScriptPath) {
    return { diagnostics: [] };
  }

  const now = new Date().toISOString();
  const jobName = "cristalina-nightly-memory-cycle";
  const jobId = stableHermesNamedCronJobId({
    runtimeRoot: resolve(input.runtimeRoot),
    configPath: resolve(input.configPath),
    name: jobName,
  });
  const schedule = {
    kind: "cron",
    expr: input.scheduleExpr,
    display: input.scheduleDisplay,
  };
  const scriptName = basename(input.cronScriptPath);
  const prompt = [
    "Nightly Cristalina memory cycle.",
    "The pre-run script first writes deterministic memory consolidation, then prepares a Cristalina maturation evidence package.",
    "Always leave an operational report for the cycle; do not answer [SILENT] on successful runs.",
    "If the script returns status=nothing_to_mature, report the cycle_id, consolidation summary, skipped backlog count, and report_path concisely.",
    "If it returns status=evidence_prepared, read evidence_path, use the embedded prompt to write strict JSON with a top-level candidates array to llm_output_path, then run apply_command exactly.",
    "The apply_command writes apply-result.json and report.md; after it finishes, summarize report_markdown if present, otherwise report the returned JSON concisely.",
    "If any phase fails, report the failing phase concisely. Do not create cron jobs, call external LLM APIs directly, or edit Cristalina code.",
  ].join(" ");

  let jobs: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(await readFile(input.jobsPath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { jobs?: unknown }).jobs)) {
      throw new Error("Hermes cron jobs file must contain a jobs array");
    }
    jobs = (parsed as { jobs: Record<string, unknown>[] }).jobs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const oldJobNames = new Set(["cristalina-nightly-memory-consolidation", "cristalina-nightly-memory-maturation"]);
  const removedOldJobs = jobs.filter((job) => typeof job.name === "string" && oldJobNames.has(job.name)).length;
  jobs = jobs.filter((job) => !(typeof job.name === "string" && oldJobNames.has(job.name)));

  const existingIndex = jobs.findIndex((job) => job.id === jobId || job.name === jobName);
  const existing = existingIndex >= 0 ? jobs[existingIndex] : undefined;
  const existingRepeat = existing?.repeat && typeof existing.repeat === "object"
    ? existing.repeat as { completed?: unknown }
    : {};
  const existingSchedule = existing?.schedule && typeof existing.schedule === "object"
    ? existing.schedule as Record<string, unknown>
    : null;
  const existingScheduleMatches = existingSchedule?.kind === schedule.kind &&
    existingSchedule.expr === schedule.expr;
  const nextRunAt = existingScheduleMatches && typeof existing?.next_run_at === "string" && existing.next_run_at
    ? existing.next_run_at
    : isoNextLocalTime(input.scheduleHour, input.scheduleMinute);
  const deliveryOrigin = isHermesCronDeliveryOrigin(existing?.origin)
    ? existing.origin
    : await inferHermesCronDeliveryOrigin(input.runtimeRoot);
  const deliver = deliveryOrigin ? "origin" : "local";
  const enabledToolsets = deliveryOrigin ? ["terminal", "messaging"] : ["terminal"];
  const job = {
    id: jobId,
    name: jobName,
    prompt,
    skills: [],
    skill: null,
    model: null,
    provider: null,
    base_url: null,
    script: scriptName,
    context_from: null,
    schedule,
    schedule_display: schedule.display,
    repeat: {
      times: null,
      completed: typeof existingRepeat.completed === "number" ? existingRepeat.completed : 0,
    },
    enabled: true,
    state: "scheduled",
    paused_at: null,
    paused_reason: null,
    created_at: typeof existing?.created_at === "string" ? existing.created_at : now,
    next_run_at: nextRunAt,
    last_run_at: typeof existing?.last_run_at === "string" ? existing.last_run_at : null,
    last_status: typeof existing?.last_status === "string" ? existing.last_status : null,
    last_error: typeof existing?.last_error === "string" ? existing.last_error : null,
    last_delivery_error: typeof existing?.last_delivery_error === "string" ? existing.last_delivery_error : null,
    deliver,
    origin: deliveryOrigin,
    enabled_toolsets: enabledToolsets,
    workdir: null,
  };

  if (existingIndex >= 0) {
    jobs[existingIndex] = job;
  } else {
    jobs.push(job);
  }

  await mkdir(dirname(input.jobsPath), { recursive: true });
  await writeFile(input.jobsPath, `${JSON.stringify({ jobs, updated_at: now }, null, 2)}\n`);
  return {
    jobId,
    diagnostics: [
      existingIndex >= 0
        ? `Hermes cron job ${jobName} was updated in ${input.jobsPath}.`
        : `Hermes cron job ${jobName} was created in ${input.jobsPath}.`,
      ...(removedOldJobs > 0
        ? [`Removed ${removedOldJobs} legacy split memory cron job(s); ${jobName} now orchestrates consolidation and maturation.`]
        : []),
      deliveryOrigin
        ? `Hermes cron job ${jobName} will deliver nightly reports to ${deliveryOrigin.platform}:${deliveryOrigin.chat_id}.`
        : `Hermes cron job ${jobName} has no unique channel origin; nightly reports will be stored locally in cron output.`,
    ],
  };
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
  const memoryConsolidationIntervalMinutes = 1440;
  const memoryConsolidationScheduleExpr = "0 3 * * *";
  const memoryConsolidationScheduleDisplay = "daily at 03:00";
  const memoryConsolidationMaxRecentEvents = 200;
  const memoryConsolidationCommand = `cristalina memory consolidation --runtime ${input.runtime} --write --config ${loaded.configPath}`;
  const memoryCycleScheduleExpr = "0 3 * * *";
  const memoryCycleScheduleDisplay = "daily at 03:00";
  const memoryCycleScheduleHour = 3;
  const memoryCycleScheduleMinute = 0;
  const memoryMaturationScheduleExpr = memoryCycleScheduleExpr;
  const memoryMaturationScheduleDisplay = "phase inside nightly memory cycle";
  const memoryMaturationMaxItems = 40;
  const memoryMaturationCommand = `cristalina memory mature --runtime ${input.runtime} --write --config ${loaded.configPath}`;
  const memoryCandidatePromotionCommand = `cristalina memory promote-candidates --runtime ${input.runtime} --write --config ${loaded.configPath}`;
  const memoryConsolidationCronJobId = input.runtime === "hermes" && input.runtimeRoot
    ? stableHermesNamedCronJobId({ runtimeRoot: resolve(input.runtimeRoot), configPath: resolve(loaded.configPath), name: "cristalina-nightly-memory-cycle" })
    : undefined;
  const memoryMaturationCronJobId = input.runtime === "hermes" && input.runtimeRoot
    ? stableHermesNamedCronJobId({ runtimeRoot: resolve(input.runtimeRoot), configPath: resolve(loaded.configPath), name: "cristalina-nightly-memory-cycle" })
    : undefined;
  const memoryCycleCronJobId = input.runtime === "hermes" && input.runtimeRoot
    ? stableHermesNamedCronJobId({ runtimeRoot: resolve(input.runtimeRoot), configPath: resolve(loaded.configPath), name: "cristalina-nightly-memory-cycle" })
    : undefined;
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
        session_reset_tips: pluginPaths.sessionResetTipsPath
          ? {
              enabled: true,
              path: pluginPaths.sessionResetTipsPath,
              label: "Cristalina Tip",
              gateway_followup_fallback: true,
              followup_delay_seconds: 0.75,
              tips: [
                "Runtime observations are evidence, not owner authority; use governed Cristalina refs for durable decisions.",
                "Run cristalina_memory_status when you need owner reviews, diagnostics, projections, or nightly memory-cycle health.",
              ],
            }
          : undefined,
        memory_consolidation: pluginPaths.memoryConsolidationScriptPath
          ? {
              enabled: true,
              mode: "conservative",
              interval_minutes: memoryConsolidationIntervalMinutes,
              schedule_kind: "cron",
              schedule_expr: memoryConsolidationScheduleExpr,
              schedule_display: memoryConsolidationScheduleDisplay,
              script_path: pluginPaths.memoryConsolidationScriptPath,
              cron_script_path: pluginPaths.memoryConsolidationCronScriptPath,
              hermes_cron_jobs_path: pluginPaths.memoryConsolidationCronJobsPath,
              hermes_cron_job_id: memoryConsolidationCronJobId,
              command: `${memoryConsolidationCommand} --max-recent-events ${memoryConsolidationMaxRecentEvents}`,
              auto_promote: false,
            }
          : undefined,
        memory_maturation: pluginPaths.memoryMaturationScriptPath
          ? {
              enabled: true,
              schedule_kind: "manual_or_cycle",
              schedule_expr: memoryMaturationScheduleExpr,
              schedule_display: "phase inside nightly memory cycle",
              max_items: memoryMaturationMaxItems,
              script_path: pluginPaths.memoryMaturationScriptPath,
              cron_script_path: pluginPaths.memoryMaturationCronScriptPath,
              hermes_cron_jobs_path: pluginPaths.memoryConsolidationCronJobsPath,
              hermes_cron_job_id: memoryMaturationCronJobId,
              command: `${memoryMaturationCommand} --max-items ${memoryMaturationMaxItems}`,
              llm_runtime_policy: "uses_hermes_runtime_model_harness",
              remote_llm_opt_in: "runtime_harness_execution",
              remote_full_summary_default: true,
              auto_ratify_non_owner_claims: true,
            }
          : undefined,
        memory_cycle: pluginPaths.memoryCycleCronScriptPath
          ? {
              enabled: true,
              schedule_kind: "cron",
              schedule_expr: memoryCycleScheduleExpr,
              schedule_display: memoryCycleScheduleDisplay,
              cron_script_path: pluginPaths.memoryCycleCronScriptPath,
              hermes_cron_jobs_path: pluginPaths.memoryConsolidationCronJobsPath,
              hermes_cron_job_id: memoryCycleCronJobId,
              phases: ["memory_consolidation", "memory_maturation", "memory_candidate_promotion"],
              candidate_promotion_command: memoryCandidatePromotionCommand,
            }
          : undefined,
        authority_note: "Provider payloads are evidence and derived context only; owner authority remains in Cristalina consolidation flows.",
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
    memory_consolidation_command: memoryConsolidationCommand,
    memory_maturation_command: memoryMaturationCommand,
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
          session_reset_tips_path: pluginPaths.sessionResetTipsPath,
          memory_consolidation_metadata_path: pluginPaths.memoryConsolidationMetadataPath,
          memory_consolidation_script_path: pluginPaths.memoryConsolidationScriptPath,
          memory_consolidation_cron_script_path: pluginPaths.memoryConsolidationCronScriptPath,
          memory_consolidation_cron_jobs_path: pluginPaths.memoryConsolidationCronJobsPath,
          memory_consolidation_cron_job_id: memoryConsolidationCronJobId,
          memory_consolidation_interval_minutes: memoryConsolidationIntervalMinutes,
          memory_consolidation_schedule_expr: memoryConsolidationScheduleExpr,
          memory_consolidation_schedule_display: memoryConsolidationScheduleDisplay,
          memory_maturation_metadata_path: pluginPaths.memoryMaturationMetadataPath,
          memory_maturation_script_path: pluginPaths.memoryMaturationScriptPath,
          memory_maturation_cron_script_path: pluginPaths.memoryMaturationCronScriptPath,
          memory_maturation_cron_job_id: memoryMaturationCronJobId,
          memory_maturation_schedule_expr: memoryMaturationScheduleExpr,
          memory_maturation_schedule_display: memoryMaturationScheduleDisplay,
          memory_cycle_metadata_path: pluginPaths.memoryCycleMetadataPath ?? undefined,
          memory_cycle_cron_script_path: pluginPaths.memoryCycleCronScriptPath ?? undefined,
          memory_cycle_cron_job_id: memoryCycleCronJobId,
          memory_cycle_schedule_expr: memoryCycleScheduleExpr,
          memory_cycle_schedule_display: memoryCycleScheduleDisplay,
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
    memory_consolidation_command: memoryConsolidationCommand,
    memory_maturation_command: memoryMaturationCommand,
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
  const memoryConsolidationMetadata = pluginPaths.memoryConsolidationScriptPath
    ? {
        schema_version: 1,
        runtime: input.runtime,
        consolidation_contract: "cristalina.memory_consolidation.v1",
        installed_at: metadata.installed_at,
        enabled: true,
        mode: "conservative",
        interval_minutes: memoryConsolidationIntervalMinutes,
        schedule_kind: "cron",
        schedule_expr: memoryConsolidationScheduleExpr,
        schedule_display: memoryConsolidationScheduleDisplay,
        max_recent_events: memoryConsolidationMaxRecentEvents,
        auto_promote: false,
        runtime_root: input.runtimeRoot ?? null,
        config_path: loaded.configPath,
        store_root: storeRoot,
        runtime_instance_ref: runtimeRef,
        script_path: pluginPaths.memoryConsolidationScriptPath,
        cron_script_path: pluginPaths.memoryConsolidationCronScriptPath,
        hermes_cron_jobs_path: pluginPaths.memoryConsolidationCronJobsPath,
        hermes_cron_job_id: memoryConsolidationCronJobId,
        command: `${memoryConsolidationCommand} --max-recent-events ${memoryConsolidationMaxRecentEvents}`,
        authority_note: "Nightly memory consolidation classifies accumulated evidence but never promotes wiki, canon, world truth, or owner authority by itself.",
      }
    : null;
  const memoryMaturationMetadata = pluginPaths.memoryMaturationScriptPath
    ? {
        schema_version: 1,
        runtime: input.runtime,
        maturation_contract: "cristalina.memory_maturation.v1",
        installed_at: metadata.installed_at,
        enabled: true,
        mode: "llm_structured_claims",
        schedule_kind: "manual_or_cycle",
        schedule_expr: memoryMaturationScheduleExpr,
        schedule_display: "phase inside nightly memory cycle",
        max_items: memoryMaturationMaxItems,
        runtime_root: input.runtimeRoot ?? null,
        config_path: loaded.configPath,
        store_root: storeRoot,
        runtime_instance_ref: runtimeRef,
        script_path: pluginPaths.memoryMaturationScriptPath,
        cron_script_path: pluginPaths.memoryMaturationCronScriptPath,
        hermes_cron_jobs_path: pluginPaths.memoryConsolidationCronJobsPath,
        hermes_cron_job_id: memoryMaturationCronJobId,
        command: `${memoryMaturationCommand} --max-items ${memoryMaturationMaxItems}`,
        llm_runtime_policy: "uses_hermes_runtime_model_harness",
        remote_llm_opt_in: "runtime_harness_execution",
        remote_full_summary_default: true,
        authority_note: "Nightly memory maturation proposes structured claims; Cristalina validates authority and governance before promotion.",
      }
    : null;
  const memoryCycleMetadata = pluginPaths.memoryCycleCronScriptPath
    ? {
        schema_version: 1,
        runtime: input.runtime,
        cycle_contract: "cristalina.memory_cycle.v1",
        installed_at: metadata.installed_at,
        enabled: true,
        schedule_kind: "cron",
        schedule_expr: memoryCycleScheduleExpr,
        schedule_display: memoryCycleScheduleDisplay,
        max_recent_events: memoryConsolidationMaxRecentEvents,
        max_maturation_items: memoryMaturationMaxItems,
        runtime_root: input.runtimeRoot ?? null,
        config_path: loaded.configPath,
        store_root: storeRoot,
        runtime_instance_ref: runtimeRef,
        cron_script_path: pluginPaths.memoryCycleCronScriptPath,
        hermes_cron_jobs_path: pluginPaths.memoryConsolidationCronJobsPath,
        hermes_cron_job_id: memoryCycleCronJobId,
        phases: ["memory_consolidation", "memory_maturation", "memory_candidate_promotion"],
        candidate_promotion_command: memoryCandidatePromotionCommand,
        authority_note: "Nightly memory cycle orchestrates deterministic consolidation, Hermes-harness semantic maturation, and deterministic candidate promotion; Cristalina still validates authority and governance before canon writes.",
      }
    : null;
  const sessionResetTips = pluginPaths.sessionResetTipsPath
    ? {
        schema_version: 1,
        source: "cristalina",
        enabled: true,
        label: "Cristalina Tip",
        gateway_followup_fallback: true,
        followup_delay_seconds: 0.75,
        tips: [
          "Runtime observations are evidence, not owner authority; use governed Cristalina refs for durable decisions.",
          "Run cristalina_memory_status when you need owner reviews, diagnostics, projections, or nightly memory-cycle health.",
        ],
        authority_note: "These are operator-facing usage tips only; they do not create Cristalina memory or owner authority.",
      }
    : null;
  const memoryConsolidationScript = pluginPaths.memoryConsolidationScriptPath
    ? [
        "#!/bin/sh",
        "set -eu",
        `MAX_RECENT_EVENTS="\${CRISTALINA_MEMORY_CONSOLIDATION_MAX_RECENT_EVENTS:-${memoryConsolidationMaxRecentEvents}}"`,
        `exec ${shellQuote(process.execPath)} ${shellQuote(cliPath)} memory consolidation --runtime ${shellQuote(input.runtime)} --write --config ${shellQuote(loaded.configPath)} --max-recent-events "$MAX_RECENT_EVENTS"`,
        "",
      ].join("\n")
    : null;
  const memoryMaturationScript = pluginPaths.memoryMaturationScriptPath
    ? [
        "#!/bin/sh",
        "set -eu",
        `MAX_ITEMS="\${CRISTALINA_MEMORY_MATURATION_MAX_ITEMS:-${memoryMaturationMaxItems}}"`,
        "if [ \"${CRISTALINA_MEMORY_MATURATION_LLM_OUTPUT:-}\" = \"\" ]; then",
        "  echo \"CRISTALINA_MEMORY_MATURATION_LLM_OUTPUT is required; installed Hermes cron jobs should produce it with the runtime model harness\" >&2",
        "  exit 2",
        "fi",
        `exec ${shellQuote(process.execPath)} ${shellQuote(cliPath)} memory mature --runtime ${shellQuote(input.runtime)} --write --config ${shellQuote(loaded.configPath)} --max-items "$MAX_ITEMS" --llm-output "$CRISTALINA_MEMORY_MATURATION_LLM_OUTPUT"`,
        "",
      ].join("\n")
    : null;
  const memoryConsolidationCronScript = pluginPaths.memoryConsolidationCronScriptPath
    ? [
        "#!/usr/bin/env python3",
        "import json",
        "import os",
        "import subprocess",
        "import sys",
        "",
        `max_recent_events = os.environ.get('CRISTALINA_MEMORY_CONSOLIDATION_MAX_RECENT_EVENTS', '${memoryConsolidationMaxRecentEvents}')`,
        "timeout = int(os.environ.get('CRISTALINA_MEMORY_CONSOLIDATION_TIMEOUT_SECONDS', '120'))",
        `cmd = ${JSON.stringify([process.execPath, cliPath, "memory", "consolidation", "--runtime", input.runtime, "--write", "--config", loaded.configPath, "--max-recent-events"])} + [max_recent_events]`,
        "completed = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)",
        "payload = {",
        "    'status': 'ok' if completed.returncode == 0 else 'error',",
        "    'command': cmd,",
        "    'returncode': completed.returncode,",
        "}",
        "if completed.returncode != 0 and completed.stdout:",
        "    payload['stdout_tail'] = completed.stdout[-4000:]",
        "if completed.stderr:",
        "    payload['stderr_tail'] = completed.stderr[-4000:]",
        "if completed.returncode == 0:",
        "    payload['wakeAgent'] = False",
        "print(json.dumps(payload, ensure_ascii=True))",
        "sys.exit(completed.returncode)",
        "",
      ].join("\n")
    : null;
  const memoryMaturationCronScript = pluginPaths.memoryMaturationCronScriptPath
    ? [
        "#!/usr/bin/env python3",
        "from datetime import datetime, timezone",
        "import json",
        "import os",
        "import subprocess",
        "import sys",
        "",
        `max_items = os.environ.get('CRISTALINA_MEMORY_MATURATION_MAX_ITEMS', '${memoryMaturationMaxItems}')`,
        "timeout = int(os.environ.get('CRISTALINA_MEMORY_MATURATION_PREPARE_TIMEOUT_SECONDS', '60'))",
        `runtime_root = ${JSON.stringify(input.runtimeRoot ?? "")}`,
        "run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')",
        "run_dir = os.path.join(runtime_root, '.cristalina-v4', 'maturation-runs', run_id)",
        "os.makedirs(run_dir, exist_ok=True)",
        "evidence_path = os.path.join(run_dir, 'evidence.json')",
        "llm_output_path = os.path.join(run_dir, 'llm-output.json')",
        `prepare_cmd = ${JSON.stringify([process.execPath, cliPath, "memory", "mature", "--runtime", input.runtime, "--config", loaded.configPath, "--max-items"])} + [max_items, "--evidence-output", evidence_path]`,
        `apply_command = ${JSON.stringify([process.execPath, cliPath, "memory", "mature", "--runtime", input.runtime, "--write", "--config", loaded.configPath, "--max-items"])} + [max_items, "--llm-output", llm_output_path]`,
        "completed = subprocess.run(prepare_cmd, capture_output=True, text=True, timeout=timeout)",
        "payload = {",
        "    'status': 'ok' if completed.returncode == 0 else 'error',",
        "    'command': prepare_cmd,",
        "    'returncode': completed.returncode,",
        "    'evidence_path': evidence_path,",
        "    'llm_output_path': llm_output_path,",
        "    'apply_command': apply_command,",
        "}",
        "if completed.stdout:",
        "    payload['stdout_tail'] = completed.stdout[-4000:]",
        "if completed.stderr:",
        "    payload['stderr_tail'] = completed.stderr[-4000:]",
        "if completed.returncode == 0:",
        "    try:",
        "        prepared = json.loads(completed.stdout)",
        "        payload.update(prepared)",
        "        payload['status'] = prepared.get('status', 'evidence_prepared')",
        "        if int(prepared.get('selected_items') or 0) == 0:",
        "            payload['wakeAgent'] = False",
        "    except Exception as exc:",
        "        payload['status'] = 'error'",
        "        payload['returncode'] = 1",
        "        payload['stderr_tail'] = f'Could not parse evidence preparation output: {exc}'",
        "print(json.dumps(payload, ensure_ascii=True))",
        "sys.exit(0 if payload.get('status') != 'error' else 1)",
        "",
      ].join("\n")
    : null;
  const memoryCycleCronScript = pluginPaths.memoryCycleCronScriptPath
    ? [
        "#!/usr/bin/env python3",
        "from datetime import datetime, timezone",
        "import json",
        "import os",
        "import subprocess",
        "import sys",
        "",
        "def read_json(path):",
        "    try:",
        "        with open(path, 'r', encoding='utf-8') as handle:",
        "            return json.load(handle)",
        "    except Exception:",
        "        return None",
        "",
        "def write_json(path, payload):",
        "    with open(path, 'w', encoding='utf-8') as handle:",
        "        json.dump(payload, handle, ensure_ascii=True, indent=2)",
        "        handle.write('\\n')",
        "",
        "def parse_stdout_json(text):",
        "    if not text:",
        "        return None",
        "    try:",
        "        return json.loads(text)",
        "    except Exception:",
        "        return None",
        "",
        "def count_list(value):",
        "    return len(value) if isinstance(value, list) else None",
        "",
        "def nested(payload, *keys):",
        "    value = payload",
        "    for key in keys:",
        "        if not isinstance(value, dict):",
        "            return None",
        "        value = value.get(key)",
        "    return value",
        "",
        "def command_result(cmd, timeout):",
        "    completed = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)",
        "    parsed = parse_stdout_json(completed.stdout)",
        "    return {",
        "        'returncode': completed.returncode,",
        "        'stdout_tail': completed.stdout[-4000:] if completed.stdout else None,",
        "        'stderr_tail': completed.stderr[-4000:] if completed.stderr else None,",
        "        'json': parsed,",
        "    }",
        "",
        "def compact_consolidation(result):",
        "    parsed = result.get('json') if isinstance(result, dict) else None",
        "    consolidation = nested(parsed or {}, 'consolidation')",
        "    bridge = nested(parsed or {}, 'bridge_result')",
        "    return {",
        "        'returncode': result.get('returncode') if isinstance(result, dict) else None,",
        "        'consolidation_id': nested(consolidation or {}, 'consolidation_id'),",
        "        'recent_observations': nested(consolidation or {}, 'counts', 'recent_observations_consolidated'),",
        "        'prior_consolidations_excluded': nested(consolidation or {}, 'counts', 'prior_memory_consolidations_excluded'),",
        "        'route_counts': nested(consolidation or {}, 'suggested_route_counts'),",
        "        'record_refs': nested(bridge or {}, 'record_refs') or [],",
        "        'diagnostics': nested(parsed or {}, 'diagnostics') or nested(bridge or {}, 'diagnostics') or [],",
        "    }",
        "",
        "def compact_apply(result):",
        "    parsed = result.get('json') if isinstance(result, dict) else None",
        "    maturation = nested(parsed or {}, 'maturation')",
        "    applied = nested(parsed or {}, 'applied')",
        "    return {",
        "        'returncode': result.get('returncode') if isinstance(result, dict) else None,",
        "        'maturation_id': nested(maturation or {}, 'maturation_id'),",
        "        'candidate_count': count_list(nested(maturation or {}, 'candidates')),",
        "        'diagnostics': nested(maturation or {}, 'diagnostics') or [],",
        "        'record_refs': nested(applied or {}, 'record_refs') or [],",
        "    }",
        "",
        "def compact_promotion(result):",
        "    parsed = result.get('json') if isinstance(result, dict) else None",
        "    return {",
        "        'returncode': result.get('returncode') if isinstance(result, dict) else None,",
        "        'applied': nested(parsed or {}, 'applied'),",
        "        'promoted_count': count_list(nested(parsed or {}, 'promoted')),",
        "        'skipped_count': count_list(nested(parsed or {}, 'skipped')),",
        "        'owner_review_count': count_list(nested(parsed or {}, 'owner_review')),",
        "        'diagnostics': nested(parsed or {}, 'diagnostics') or [],",
        "    }",
        "",
        "def build_report(payload):",
        "    consolidation = payload.get('consolidation_summary') or {}",
        "    apply = payload.get('apply_summary') or {}",
        "    promotion = payload.get('candidate_promotion_summary') or {}",
        "    owner = payload.get('owner_decisions_summary') or {}",
        "    status = payload.get('status_summary') or {}",
        "    lines = [",
        "        f\"Cristalina nightly memory report - {payload.get('cycle_id', 'unknown')}\",",
        "        \"\",",
        "        f\"- status: {payload.get('status', 'unknown')}\",",
        "        f\"- consolidation: {consolidation.get('recent_observations', 'n/a')} observations, id {consolidation.get('consolidation_id', 'n/a')}\",",
        "        f\"- maturation: selected {payload.get('selected_items', 'n/a')}, skipped {payload.get('skipped_already_matured', 'n/a')}, candidates {apply.get('candidate_count', 'n/a')}\",",
        "        f\"- apply diagnostics: {len(apply.get('diagnostics') or [])}; records written: {len(apply.get('record_refs') or [])}\",",
        "        f\"- candidate promotion: promoted {promotion.get('promoted_count', 'n/a')}, skipped {promotion.get('skipped_count', 'n/a')}, owner review {promotion.get('owner_review_count', 'n/a')}\",",
        "        f\"- owner decisions pending: {owner.get('owner_decision_count', 'n/a')}; pending reviews hermes/openclaw: {status.get('pending_hermes', 'n/a')}/{status.get('pending_openclaw', 'n/a')}\",",
        "        \"\",",
        "        \"Files:\",",
        "        f\"- evidence: {payload.get('evidence_path', 'n/a')}\",",
        "        f\"- llm output: {payload.get('llm_output_path', 'n/a')}\",",
        "        f\"- apply result: {payload.get('apply_result_path', 'n/a')}\",",
        "        f\"- report: {payload.get('report_path', 'n/a')}\",",
        "    ]",
        "    diagnostics = list(consolidation.get('diagnostics') or []) + list(apply.get('diagnostics') or []) + list(promotion.get('diagnostics') or [])",
        "    if diagnostics:",
        "        lines.extend([\"\", \"Diagnostics:\"])",
        "        lines.extend(f\"- {item}\" for item in diagnostics[:8])",
        "    return '\\n'.join(lines) + '\\n'",
        "",
        `max_recent_events = os.environ.get('CRISTALINA_MEMORY_CONSOLIDATION_MAX_RECENT_EVENTS', '${memoryConsolidationMaxRecentEvents}')`,
        `max_items = os.environ.get('CRISTALINA_MEMORY_MATURATION_MAX_ITEMS', '${memoryMaturationMaxItems}')`,
        "consolidation_timeout = int(os.environ.get('CRISTALINA_MEMORY_CONSOLIDATION_TIMEOUT_SECONDS', '120'))",
        "maturation_prepare_timeout = int(os.environ.get('CRISTALINA_MEMORY_MATURATION_PREPARE_TIMEOUT_SECONDS', '60'))",
        "apply_timeout = int(os.environ.get('CRISTALINA_MEMORY_MATURATION_APPLY_TIMEOUT_SECONDS', '180'))",
        "report_timeout = int(os.environ.get('CRISTALINA_MEMORY_CYCLE_REPORT_TIMEOUT_SECONDS', '60'))",
        `runtime_root = ${JSON.stringify(input.runtimeRoot ?? "")}`,
        "script_path = os.path.abspath(__file__)",
        `config_path = ${JSON.stringify(loaded.configPath)}`,
        `cli_command_base = ${JSON.stringify([process.execPath, cliPath])}`,
        "if len(sys.argv) >= 3 and sys.argv[1] == '--apply':",
        "    run_dir = sys.argv[2]",
        "    payload_path = os.path.join(run_dir, 'cycle-payload.json')",
        "    payload = read_json(payload_path) or {'status': 'apply_payload_missing', 'cycle_id': os.path.basename(run_dir)}",
        "    llm_output_path = payload.get('llm_output_path') or os.path.join(run_dir, 'llm-output.json')",
        "    apply_result_path = os.path.join(run_dir, 'apply-result.json')",
        "    report_path = os.path.join(run_dir, 'report.md')",
        "    apply_cli_command = payload.get('apply_cli_command') or (cli_command_base + ['memory', 'mature', '--runtime', payload.get('runtime', 'hermes'), '--write', '--config', config_path, '--max-items', str(payload.get('max_items', max_items)), '--llm-output', llm_output_path])",
        "    apply_result = command_result(apply_cli_command, apply_timeout)",
        "    write_json(apply_result_path, apply_result)",
        "    payload['apply_result_path'] = apply_result_path",
        "    payload['apply_returncode'] = apply_result.get('returncode')",
        "    payload['apply_summary'] = compact_apply(apply_result)",
        "    owner_cmd = payload.get('owner_decisions_command')",
        "    if owner_cmd:",
        "        owner_result = command_result(owner_cmd, report_timeout)",
        "        write_json(os.path.join(run_dir, 'owner-decisions-result.json'), owner_result)",
        "        owner_json = owner_result.get('json') or {}",
        "        payload['owner_decisions_summary'] = {'owner_decision_count': count_list(owner_json.get('owner_decisions')), 'resolved_owner_decision_count': count_list(owner_json.get('resolved_owner_decisions'))}",
        "    status_cmd = payload.get('status_command')",
        "    if status_cmd:",
        "        status_result = command_result(status_cmd, report_timeout)",
        "        write_json(os.path.join(run_dir, 'status-result.json'), status_result)",
        "        status_json = status_result.get('json') or {}",
        "        pending = status_json.get('pending_owner_reviews') if isinstance(status_json, dict) else {}",
        "        payload['status_summary'] = {'pending_hermes': nested(pending or {}, 'hermes'), 'pending_openclaw': nested(pending or {}, 'openclaw')}",
        "    payload['status'] = 'applied' if apply_result.get('returncode') == 0 else 'apply_error'",
        "    payload['report_path'] = report_path",
        "    report = build_report(payload)",
        "    with open(report_path, 'w', encoding='utf-8') as handle:",
        "        handle.write(report)",
        "    write_json(payload_path, payload)",
        "    print(json.dumps({'status': payload['status'], 'cycle_id': payload.get('cycle_id'), 'report_path': report_path, 'report_markdown': report, 'apply_returncode': apply_result.get('returncode')}, ensure_ascii=True))",
        "    sys.exit(0 if apply_result.get('returncode') == 0 else apply_result.get('returncode') or 1)",
        "",
        "run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')",
        "run_dir = os.path.join(runtime_root, '.cristalina-v4', 'maturation-runs', run_id)",
        "os.makedirs(run_dir, exist_ok=True)",
        "evidence_path = os.path.join(run_dir, 'evidence.json')",
        "llm_output_path = os.path.join(run_dir, 'llm-output.json')",
        "payload_path = os.path.join(run_dir, 'cycle-payload.json')",
        "report_path = os.path.join(run_dir, 'report.md')",
        `consolidation_cmd = ${JSON.stringify([process.execPath, cliPath, "memory", "consolidation", "--runtime", input.runtime, "--write", "--config", loaded.configPath, "--max-recent-events"])} + [max_recent_events]`,
        `prepare_cmd = ${JSON.stringify([process.execPath, cliPath, "memory", "mature", "--runtime", input.runtime, "--config", loaded.configPath, "--max-items"])} + [max_items, "--evidence-output", evidence_path]`,
        `apply_cli_command = ${JSON.stringify([process.execPath, cliPath, "memory", "mature", "--runtime", input.runtime, "--write", "--config", loaded.configPath, "--max-items"])} + [max_items, "--llm-output", llm_output_path]`,
        "apply_command = [sys.executable, script_path, '--apply', run_dir]",
        `candidate_promotion_cmd = ${JSON.stringify([process.execPath, cliPath, "memory", "promote-candidates", "--runtime", input.runtime, "--write", "--config", loaded.configPath, "--limit", "100"])}`,
        `status_cmd = ${JSON.stringify([process.execPath, cliPath, "status", "--config", loaded.configPath])}`,
        `owner_decisions_cmd = ${JSON.stringify([process.execPath, cliPath, "reviews", "list", "--owner-decisions", "--config", loaded.configPath])}`,
        "payload = {",
        "    'status': 'started',",
        `    'runtime': ${JSON.stringify(input.runtime)},`,
        "    'cycle_id': run_id,",
        "    'max_items': max_items,",
        "    'consolidation_command': consolidation_cmd,",
        "    'prepare_command': prepare_cmd,",
        "    'evidence_path': evidence_path,",
        "    'llm_output_path': llm_output_path,",
        "    'apply_command': apply_command,",
        "    'apply_cli_command': apply_cli_command,",
        "    'candidate_promotion_command': candidate_promotion_cmd,",
        "    'status_command': status_cmd,",
        "    'owner_decisions_command': owner_decisions_cmd,",
        "    'payload_path': payload_path,",
        "    'report_path': report_path,",
        "}",
        "consolidation = subprocess.run(consolidation_cmd, capture_output=True, text=True, timeout=consolidation_timeout)",
        "payload['consolidation_returncode'] = consolidation.returncode",
        "if consolidation.stdout:",
        "    payload['consolidation_stdout_tail'] = consolidation.stdout[-4000:]",
        "if consolidation.stderr:",
        "    payload['consolidation_stderr_tail'] = consolidation.stderr[-4000:]",
        "if consolidation.returncode != 0:",
        "    payload['status'] = 'consolidation_error'",
        "    write_json(payload_path, payload)",
        "    print(json.dumps(payload, ensure_ascii=True))",
        "    sys.exit(consolidation.returncode)",
        "consolidation_result = {'returncode': consolidation.returncode, 'stdout_tail': consolidation.stdout[-4000:] if consolidation.stdout else None, 'stderr_tail': consolidation.stderr[-4000:] if consolidation.stderr else None, 'json': parse_stdout_json(consolidation.stdout)}",
        "write_json(os.path.join(run_dir, 'consolidation-result.json'), consolidation_result)",
        "payload['consolidation_summary'] = compact_consolidation(consolidation_result)",
        "prepared = subprocess.run(prepare_cmd, capture_output=True, text=True, timeout=maturation_prepare_timeout)",
        "payload['maturation_prepare_returncode'] = prepared.returncode",
        "if prepared.stdout:",
        "    payload['maturation_prepare_stdout_tail'] = prepared.stdout[-4000:]",
        "if prepared.stderr:",
        "    payload['maturation_prepare_stderr_tail'] = prepared.stderr[-4000:]",
        "if prepared.returncode != 0:",
        "    payload['status'] = 'maturation_prepare_error'",
        "    write_json(payload_path, payload)",
        "    print(json.dumps(payload, ensure_ascii=True))",
        "    sys.exit(prepared.returncode)",
        "try:",
        "    prepared_payload = json.loads(prepared.stdout)",
        "    payload.update(prepared_payload)",
        "except Exception as exc:",
        "    payload['status'] = 'maturation_prepare_error'",
        "    payload['maturation_prepare_stderr_tail'] = f'Could not parse evidence preparation output: {exc}'",
        "    write_json(payload_path, payload)",
        "    print(json.dumps(payload, ensure_ascii=True))",
        "    sys.exit(1)",
        "payload['status'] = prepared_payload.get('status', 'evidence_prepared')",
        "evidence_payload = read_json(evidence_path) or {}",
        "evidence = evidence_payload.get('evidence') if isinstance(evidence_payload, dict) else None",
        "payload['skipped_already_matured'] = count_list((evidence or {}).get('skipped_already_matured_observation_refs'))",
        "if int(prepared_payload.get('selected_items') or 0) == 0:",
        "    payload['status'] = 'nothing_to_mature'",
        "promotion = subprocess.run(candidate_promotion_cmd, capture_output=True, text=True, timeout=60)",
        "payload['candidate_promotion_returncode'] = promotion.returncode",
        "if promotion.stdout:",
        "    payload['candidate_promotion_stdout_tail'] = promotion.stdout[-4000:]",
        "if promotion.stderr:",
        "    payload['candidate_promotion_stderr_tail'] = promotion.stderr[-4000:]",
        "if promotion.returncode != 0:",
        "    payload['status'] = 'candidate_promotion_error'",
        "    write_json(payload_path, payload)",
        "    print(json.dumps(payload, ensure_ascii=True))",
        "    sys.exit(promotion.returncode)",
        "promotion_result = {'returncode': promotion.returncode, 'stdout_tail': promotion.stdout[-4000:] if promotion.stdout else None, 'stderr_tail': promotion.stderr[-4000:] if promotion.stderr else None, 'json': parse_stdout_json(promotion.stdout)}",
        "write_json(os.path.join(run_dir, 'candidate-promotion-result.json'), promotion_result)",
        "payload['candidate_promotion_summary'] = compact_promotion(promotion_result)",
        "if payload.get('status') == 'nothing_to_mature':",
        "    payload['report_path'] = report_path",
        "    report = build_report(payload)",
        "    with open(report_path, 'w', encoding='utf-8') as handle:",
        "        handle.write(report)",
        "    payload['report_markdown'] = report",
        "write_json(payload_path, payload)",
        "print(json.dumps(payload, ensure_ascii=True))",
        "sys.exit(0)",
        "",
      ].join("\n")
    : null;

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
      if (pluginPaths.sessionResetTipsPath && sessionResetTips) {
        await mkdir(dirname(pluginPaths.sessionResetTipsPath), { recursive: true });
        await writeFile(pluginPaths.sessionResetTipsPath, `${JSON.stringify(sessionResetTips, null, 2)}\n`);
      }
      if (pluginPaths.memoryConsolidationMetadataPath && pluginPaths.memoryConsolidationScriptPath && memoryConsolidationMetadata && memoryConsolidationScript) {
        await mkdir(dirname(pluginPaths.memoryConsolidationMetadataPath), { recursive: true });
        await mkdir(dirname(pluginPaths.memoryConsolidationScriptPath), { recursive: true });
        await writeFile(pluginPaths.memoryConsolidationMetadataPath, `${JSON.stringify(memoryConsolidationMetadata, null, 2)}\n`);
        await writeFile(pluginPaths.memoryConsolidationScriptPath, memoryConsolidationScript, { mode: 0o755 });
        await chmod(pluginPaths.memoryConsolidationScriptPath, 0o755);
      }
      if (pluginPaths.memoryConsolidationCronScriptPath && memoryConsolidationCronScript) {
        await mkdir(dirname(pluginPaths.memoryConsolidationCronScriptPath), { recursive: true });
        await writeFile(pluginPaths.memoryConsolidationCronScriptPath, memoryConsolidationCronScript, { mode: 0o755 });
        await chmod(pluginPaths.memoryConsolidationCronScriptPath, 0o755);
      }
      if (pluginPaths.memoryMaturationMetadataPath && pluginPaths.memoryMaturationScriptPath && memoryMaturationMetadata && memoryMaturationScript) {
        await mkdir(dirname(pluginPaths.memoryMaturationMetadataPath), { recursive: true });
        await mkdir(dirname(pluginPaths.memoryMaturationScriptPath), { recursive: true });
        await writeFile(pluginPaths.memoryMaturationMetadataPath, `${JSON.stringify(memoryMaturationMetadata, null, 2)}\n`);
        await writeFile(pluginPaths.memoryMaturationScriptPath, memoryMaturationScript, { mode: 0o755 });
        await chmod(pluginPaths.memoryMaturationScriptPath, 0o755);
      }
      if (pluginPaths.memoryMaturationCronScriptPath && memoryMaturationCronScript) {
        await mkdir(dirname(pluginPaths.memoryMaturationCronScriptPath), { recursive: true });
        await writeFile(pluginPaths.memoryMaturationCronScriptPath, memoryMaturationCronScript, { mode: 0o755 });
        await chmod(pluginPaths.memoryMaturationCronScriptPath, 0o755);
      }
      if (pluginPaths.memoryCycleMetadataPath && memoryCycleMetadata) {
        await mkdir(dirname(pluginPaths.memoryCycleMetadataPath), { recursive: true });
        await writeFile(pluginPaths.memoryCycleMetadataPath, `${JSON.stringify(memoryCycleMetadata, null, 2)}\n`);
      }
      if (pluginPaths.memoryCycleCronScriptPath && memoryCycleCronScript) {
        await mkdir(dirname(pluginPaths.memoryCycleCronScriptPath), { recursive: true });
        await writeFile(pluginPaths.memoryCycleCronScriptPath, memoryCycleCronScript, { mode: 0o755 });
        await chmod(pluginPaths.memoryCycleCronScriptPath, 0o755);
        const cron = await upsertHermesMemoryCycleCron({
          runtimeRoot: input.runtimeRoot,
          jobsPath: pluginPaths.memoryConsolidationCronJobsPath,
          cronScriptPath: pluginPaths.memoryCycleCronScriptPath,
          configPath: loaded.configPath,
          scheduleExpr: memoryCycleScheduleExpr,
          scheduleDisplay: memoryCycleScheduleDisplay,
          scheduleHour: memoryCycleScheduleHour,
          scheduleMinute: memoryCycleScheduleMinute,
        });
        diagnostics.push(...cron.diagnostics);
      }
      diagnostics.push(...(await configureHermesProvider(pluginPaths.pluginConfigPath, integrationMode)));
    }
  }

  await recordInstallation({
    runtime: input.runtime,
    runtime_root: input.runtimeRoot ? resolve(input.runtimeRoot) : null,
    config_path: loaded.configPath,
    metadata_path: metadataPath,
    integration_mode: integrationMode,
    installed_at: metadata.installed_at,
  });

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
          session_reset_tips_path: pluginPaths.sessionResetTipsPath ?? undefined,
          memory_consolidation_metadata_path: pluginPaths.memoryConsolidationMetadataPath ?? undefined,
          memory_consolidation_script_path: pluginPaths.memoryConsolidationScriptPath ?? undefined,
          memory_consolidation_cron_script_path: pluginPaths.memoryConsolidationCronScriptPath ?? undefined,
          memory_consolidation_cron_jobs_path: pluginPaths.memoryConsolidationCronJobsPath ?? undefined,
          memory_consolidation_cron_job_id: memoryConsolidationCronJobId,
          memory_consolidation_interval_minutes: memoryConsolidationIntervalMinutes,
          memory_consolidation_schedule_expr: memoryConsolidationScheduleExpr,
          memory_consolidation_schedule_display: memoryConsolidationScheduleDisplay,
          memory_maturation_metadata_path: pluginPaths.memoryMaturationMetadataPath ?? undefined,
          memory_maturation_script_path: pluginPaths.memoryMaturationScriptPath ?? undefined,
          memory_maturation_cron_script_path: pluginPaths.memoryMaturationCronScriptPath ?? undefined,
          memory_maturation_cron_job_id: memoryMaturationCronJobId,
          memory_maturation_schedule_expr: memoryMaturationScheduleExpr,
          memory_maturation_schedule_display: memoryMaturationScheduleDisplay,
          memory_cycle_metadata_path: pluginPaths.memoryCycleMetadataPath ?? undefined,
          memory_cycle_cron_script_path: pluginPaths.memoryCycleCronScriptPath ?? undefined,
          memory_cycle_cron_job_id: memoryCycleCronJobId,
          memory_cycle_schedule_expr: memoryCycleScheduleExpr,
          memory_cycle_schedule_display: memoryCycleScheduleDisplay,
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
    "authority_note: Event payloads are evidence only; owner authority remains in Cristalina consolidation flows.",
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
    "import asyncio",
    "import hashlib",
    "import json",
    "import logging",
    "import os",
    "import subprocess",
    "import threading",
    "import time",
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
    "_RESET_TIP_SENT: Dict[str, float] = {}",
    "",
    "",
    "def _reset_command_from_event(event: Any) -> str:",
    "    try:",
    "        command = event.get_command()",
    "        if command:",
    "            return str(command).lower()",
    "    except Exception:",
    "        pass",
    "    text = str(getattr(event, 'text', '') or '').strip()",
    "    if not text.startswith('/'):",
    "        return ''",
    "    return text.split(maxsplit=1)[0][1:].split('@', 1)[0].lower()",
    "",
    "",
    "def _session_reset_tip_line() -> str:",
    "    cfg = _load_config()",
    "    reset_tips = cfg.get('session_reset_tips')",
    "    if not isinstance(reset_tips, dict) or not reset_tips.get('enabled', True):",
    "        return ''",
    "    tips = reset_tips.get('tips')",
    "    if not isinstance(tips, list) or not tips:",
    "        return ''",
    "    tip = str(tips[0]).strip()",
    "    if not tip:",
    "        return ''",
    "    label = str(reset_tips.get('label') or 'Cristalina Tip').strip() or 'Cristalina Tip'",
    "    return f'\\u2726 {label}: {tip}'",
    "",
    "",
    "def _hermes_inline_session_reset_tips_supported() -> bool:",
    "    try:",
    "        from hermes_cli.tips import get_session_reset_tip_lines",
    "        lines = get_session_reset_tip_lines()",
    "        return any(isinstance(line, str) and 'Cristalina Tip:' in line for line in lines)",
    "    except Exception:",
    "        return False",
    "",
    "",
    "def _reset_tip_dedupe_key(event: Any) -> str:",
    "    source = getattr(event, 'source', None)",
    "    platform = getattr(getattr(source, 'platform', ''), 'value', getattr(source, 'platform', ''))",
    "    chat_id = getattr(source, 'chat_id', '')",
    "    message_id = getattr(event, 'message_id', '') or getattr(event, 'update_id', '')",
    "    text = str(getattr(event, 'text', '') or '').strip()",
    "    return f'{platform}:{chat_id}:{message_id}:{text}'",
    "",
    "",
    "def _claim_reset_tip_delivery(event: Any) -> bool:",
    "    now = time.monotonic()",
    "    for key, seen_at in list(_RESET_TIP_SENT.items()):",
    "        if now - seen_at > 60:",
    "            _RESET_TIP_SENT.pop(key, None)",
    "    key = _reset_tip_dedupe_key(event)",
    "    if _RESET_TIP_SENT.get(key):",
    "        return False",
    "    _RESET_TIP_SENT[key] = now",
    "    return True",
    "",
    "",
    "async def _deliver_reset_tip_after_gateway_reply(gateway: Any, event: Any, message: str) -> None:",
    "    cfg = _load_config()",
    "    reset_tips = cfg.get('session_reset_tips') if isinstance(cfg.get('session_reset_tips'), dict) else {}",
    "    delay = float(reset_tips.get('followup_delay_seconds') or 0.75)",
    "    if delay > 0:",
    "        await asyncio.sleep(delay)",
    "    source = getattr(event, 'source', None)",
    "    if source is None:",
    "        return",
    "    adapter = getattr(gateway, 'adapters', {}).get(getattr(source, 'platform', None))",
    "    if adapter is None:",
    "        return",
    "    chat_id = getattr(source, 'chat_id', None)",
    "    if chat_id is None:",
    "        return",
    "    metadata = {'thread_id': getattr(source, 'thread_id', None)} if getattr(source, 'thread_id', None) else None",
    "    try:",
    "        await adapter.send(chat_id, message, metadata=metadata)",
    "    except Exception as exc:",
    "        logger.debug('Cristalina reset tip fallback delivery failed: %s', exc)",
    "",
    "",
    "def emit_cristalina_session_reset_tip(event: Any = None, gateway: Any = None, **kwargs: Any) -> None:",
    "    if event is None or gateway is None:",
    "        return None",
    "    if _reset_command_from_event(event) not in {'new', 'reset'}:",
    "        return None",
    "    cfg = _load_config()",
    "    reset_tips = cfg.get('session_reset_tips') if isinstance(cfg.get('session_reset_tips'), dict) else {}",
    "    if not reset_tips.get('gateway_followup_fallback', True):",
    "        return None",
    "    if _hermes_inline_session_reset_tips_supported():",
    "        return None",
    "    message = _session_reset_tip_line()",
    "    if not message or not _claim_reset_tip_delivery(event):",
    "        return None",
    "    try:",
    "        loop = asyncio.get_running_loop()",
    "        loop.create_task(_deliver_reset_tip_after_gateway_reply(gateway, event, message))",
    "    except RuntimeError:",
    "        def _run() -> None:",
    "            try:",
    "                asyncio.run(_deliver_reset_tip_after_gateway_reply(gateway, event, message))",
    "            except Exception as exc:",
    "                logger.debug('Cristalina reset tip fallback delivery failed: %s', exc)",
    "        threading.Thread(target=_run, daemon=True).start()",
    "    return None",
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
    "            'Do not infer owner authority from runtime evidence; owner ratification remains inside Cristalina consolidation flows.'",
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
    "            owner_decisions = self._run_cli(['reviews', 'list', '--owner-decisions', '--config', config], float(self._config.get('prefetch_timeout_seconds') or 2.5))",
    "            return json.dumps({'status': status, 'diagnostics': diagnostics, 'owner_decisions': owner_decisions}, ensure_ascii=False)",
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
    "    if hasattr(ctx, 'register_hook'):",
    "        try:",
    "            ctx.register_hook('pre_gateway_dispatch', emit_cristalina_session_reset_tip)",
    "        except Exception as exc:",
    "            logger.debug('Cristalina reset tip fallback hook unavailable: %s', exc)",
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
