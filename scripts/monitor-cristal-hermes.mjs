#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_HERMES_ROOT = "/mnt/c/Users/Markus/desktop/projetos/hermes-cristalina-sandbox/home";
const DEFAULT_CRISTALINA_ROOT = "/mnt/c/Users/Markus/desktop/projetos/cristalina-v4-runtime";

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const hermesRoot = resolve(argValue("--hermes-root", process.env.HERMES_ROOT ?? DEFAULT_HERMES_ROOT));
const cristalinaRoot = resolve(argValue("--cristalina-root", process.env.CRISTALINA_ROOT ?? DEFAULT_CRISTALINA_ROOT));
const configPath = resolve(argValue("--config", process.env.CRISTALINA_CONFIG ?? join(cristalinaRoot, ".cristalina-v4", "config.json")));
const outDir = resolve(argValue("--out-dir", process.env.CRISTAL_MONITOR_DIR ?? join(process.cwd(), ".cristalina-v4", "test-monitor")));
const intervalMs = Number(argValue("--interval-ms", process.env.CRISTAL_MONITOR_INTERVAL_MS ?? "5000"));
const eventLimit = Number(argValue("--events", "12"));
const watch = hasFlag("--watch");

const cliPath = join(cristalinaRoot, "packages", "cli", "dist", "index.js");
const hermesConfigPath = join(hermesRoot, "config.yaml");
const hermesEventsDir = join(hermesRoot, ".cristalina-v4", "events");
const hermesPluginPath = join(hermesRoot, "plugins", "cristalina-bridge", "__init__.py");
const hermesPluginManifestPath = join(hermesRoot, "plugins", "cristalina-bridge", "plugin.yaml");
const hermesProviderPath = join(hermesRoot, "plugins", "cristalina", "__init__.py");
const hermesProviderManifestPath = join(hermesRoot, "plugins", "cristalina", "plugin.yaml");
const hermesProviderConfigPath = join(hermesRoot, ".cristalina-v4", "provider-hermes.json");
const hermesHookScriptPath = join(hermesRoot, ".cristalina-v4", "hooks", "cristalina-bridge-event.sh");
const hermesMemoryConsolidationMetadataPath = join(hermesRoot, ".cristalina-v4", "memory-consolidation-hermes.json");
const hermesMemoryConsolidationScriptPath = join(hermesRoot, "scripts", "cristalina-memory-consolidation.sh");
const hermesMemoryConsolidationCronScriptPath = join(hermesRoot, "scripts", "cristalina-memory-consolidation.py");
const hermesCronJobsPath = join(hermesRoot, "cron", "jobs.json");
const cristalResearchHeartbeatsDir = join(hermesRoot, "scratch", "cristal-heartbeats");
const aiPulseDir = join(hermesRoot, "scratch", "ai-pulse");

function safeRead(path, maxChars = 200000) {
  try {
    const source = readFileSync(path, "utf8");
    return source.length > maxChars ? source.slice(-maxChars) : source;
  } catch (error) {
    return null;
  }
}

function tryJson(source) {
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function pathState(path) {
  try {
    const stat = statSync(path);
    return {
      exists: true,
      path,
      kind: stat.isDirectory() ? "dir" : "file",
      size: stat.size,
      mtime: stat.mtime.toISOString(),
    };
  } catch {
    return { exists: false, path };
  }
}

function runJson(name, args, timeoutMs = 15000) {
  if (!existsSync(cliPath) || !existsSync(configPath)) {
    return {
      ok: false,
      skipped: true,
      reason: "Cristalina CLI dist or config is missing",
      command: ["node", cliPath, ...args],
    };
  }

  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: cristalinaRoot,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    command: ["node", cliPath, ...args],
    json: tryJson(result.stdout),
    stdout_tail: result.stdout?.slice(-8000) ?? "",
    stderr_tail: result.stderr?.slice(-8000) ?? "",
    error: result.error ? String(result.error.message ?? result.error) : null,
    name,
  };
}

function listRecentEvents() {
  if (!existsSync(hermesEventsDir)) return [];
  return readdirSync(hermesEventsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const path = join(hermesEventsDir, name);
      const stat = statSync(path);
      const parsed = tryJson(safeRead(path));
      const bridgeLogPath = path.replace(/\.json$/, ".bridge.log");
      const bridgeLog = existsSync(bridgeLogPath) ? safeRead(bridgeLogPath, 20000) : null;
      return {
        name,
        path,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        event_id: parsed?.event_id ?? null,
        event_type: parsed?.event_type ?? null,
        runtime: parsed?.runtime ?? null,
        runtime_instance_ref: parsed?.runtime_instance_ref ?? null,
        runtime_session_ref: parsed?.runtime_session_ref ?? null,
        conversation_thread_ref: parsed?.conversation_thread_ref ?? null,
        occurred_at: parsed?.occurred_at ?? null,
        message_preview: typeof parsed?.message === "string" ? parsed.message.slice(0, 280) : null,
        has_speaker_ref: typeof parsed?.speaker_ref === "string",
        bridge_log_path: existsSync(bridgeLogPath) ? bridgeLogPath : null,
        bridge_log_size: existsSync(bridgeLogPath) ? statSync(bridgeLogPath).size : 0,
        bridge_log_tail: bridgeLog ? bridgeLog.slice(-3000) : null,
      };
    })
    .sort((a, b) => a.mtime.localeCompare(b.mtime))
    .slice(-eventLimit);
}

function pluginEnabled() {
  const config = safeRead(hermesConfigPath, 100000);
  if (!config) return false;
  return /^plugins:\s*$/m.test(config) && /^\s*-\s*cristalina-bridge\s*$/m.test(config);
}

function memoryProviderConfigured() {
  const config = safeRead(hermesConfigPath, 100000);
  if (!config) return false;
  return /^memory:\s*$/m.test(config) && /^  provider:\s*['"]?cristalina['"]?\s*$/m.test(config);
}

function providerConfig() {
  return tryJson(safeRead(hermesProviderConfigPath, 100000));
}

function listJsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(dir, name));
}

function countFiles(dir) {
  return listJsonFiles(dir).length;
}

function countStoreDir(relativeDir) {
  const dir = join(cristalinaRoot, ".cristalina-v4", relativeDir);
  return countFiles(dir);
}

function parseObservationSummary(value) {
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function scanMaturation() {
  const storeRoot = join(cristalinaRoot, ".cristalina-v4");
  const observationDir = join(storeRoot, "runtime", "observations");
  const dispositionDir = join(storeRoot, "governance", "dispositions");
  const eventTypeCounts = {};
  const sourceTypeCounts = {};
  const dispositionOutcomeCounts = {};
  const memoryConsolidationObservations = [];
  for (const file of listJsonFiles(observationDir)) {
    const observation = tryJson(safeRead(file, 1000000));
    const parsed = parseObservationSummary(observation?.summary);
    const eventType = parsed?.event_type ?? "unknown";
    const sourceType = observation?.provenance?.source_type ?? "unknown";
    increment(eventTypeCounts, eventType);
    increment(sourceTypeCounts, sourceType);
    if (eventType === "memory_consolidation") {
      memoryConsolidationObservations.push({
        id: observation?.id ?? basename(file),
        observed_at: observation?.observed_at ?? observation?.created_at ?? null,
        preview: typeof parsed?.message === "string" ? parsed.message.slice(0, 260) : null,
      });
    }
  }
  for (const file of listJsonFiles(dispositionDir)) {
    const disposition = tryJson(safeRead(file, 200000));
    for (const outcome of disposition?.outcomes ?? []) {
      increment(dispositionOutcomeCounts, outcome);
    }
  }
  memoryConsolidationObservations.sort((left, right) => String(left.observed_at ?? "").localeCompare(String(right.observed_at ?? "")));
  const researchHeartbeatState = tryJson(safeRead(join(cristalResearchHeartbeatsDir, "state.json"), 200000));
  return {
    store_counts: {
      raw_sources: countStoreDir("raw/sources"),
      runtime_observations: countStoreDir("runtime/observations"),
      dispositions: countStoreDir("governance/dispositions"),
      proposals: countStoreDir("governance/proposals"),
      curation_packets: countStoreDir("governance/curation"),
      ratifications: countStoreDir("governance/ratifications"),
      wiki_pages: countStoreDir("wiki/pages"),
      wiki_claims: countStoreDir("wiki/claims"),
      wiki_runs: countStoreDir("wiki/runs"),
      canon_records: [
        "canon/facts",
        "canon/beliefs",
        "canon/preferences",
        "canon/constraints",
        "canon/goals",
        "canon/procedures",
        "canon/values",
        "canon/identity-traits",
        "canon/identity",
      ].reduce((sum, dir) => sum + countStoreDir(dir), 0),
      world_claims: countStoreDir("world/claims"),
      derived_manifests: countStoreDir("derived/manifests"),
    },
    event_type_counts: eventTypeCounts,
    source_type_counts: sourceTypeCounts,
    disposition_outcome_counts: dispositionOutcomeCounts,
    memory_consolidations: {
      count: memoryConsolidationObservations.length,
      latest: memoryConsolidationObservations.at(-1) ?? null,
    },
    research_heartbeats: {
      file_count: countFiles(cristalResearchHeartbeatsDir),
      state: researchHeartbeatState,
    },
    ai_pulse: {
      file_count: countFiles(aiPulseDir),
      latest_file: listJsonFiles(aiPulseDir).sort().at(-1) ?? null,
    },
  };
}

function recognitionArgsFor(latestEvent) {
  const args = ["projection", "recognition", "--config", configPath, "--format", "json"];
  const provider = providerConfig();
  const runtimeInstanceRef = latestEvent?.runtime_instance_ref ?? provider?.runtime_instance_ref;
  const runtimeSessionRef = latestEvent?.runtime_session_ref;
  const conversationThreadRef = latestEvent?.conversation_thread_ref ?? runtimeSessionRef;
  if (runtimeInstanceRef) args.push("--runtime-instance-ref", runtimeInstanceRef);
  if (runtimeSessionRef) args.push("--runtime-session-ref", runtimeSessionRef);
  if (conversationThreadRef) args.push("--conversation-thread-ref", conversationThreadRef);
  return args;
}

function makeSnapshot() {
  const now = new Date();
  const hermesEvents = listRecentEvents();
  const latestEvent = hermesEvents.at(-1);
  const snapshot = {
    schema_version: 1,
    captured_at: now.toISOString(),
    roots: {
      hermes_root: hermesRoot,
      cristalina_root: cristalinaRoot,
      cristalina_config: configPath,
      output_dir: outDir,
    },
    files: {
      hermes_config: pathState(hermesConfigPath),
      hermes_events_dir: pathState(hermesEventsDir),
      hermes_plugin_manifest: pathState(hermesPluginManifestPath),
      hermes_plugin_entrypoint: pathState(hermesPluginPath),
      hermes_provider_manifest: pathState(hermesProviderManifestPath),
      hermes_provider_entrypoint: pathState(hermesProviderPath),
      hermes_provider_config: pathState(hermesProviderConfigPath),
      hermes_memory_consolidation_metadata: pathState(hermesMemoryConsolidationMetadataPath),
      hermes_memory_consolidation_script: pathState(hermesMemoryConsolidationScriptPath),
      hermes_memory_consolidation_cron_script: pathState(hermesMemoryConsolidationCronScriptPath),
      hermes_cron_jobs: pathState(hermesCronJobsPath),
      hermes_hook_script: pathState(hermesHookScriptPath),
      cristalina_config: pathState(configPath),
      cristalina_cli: pathState(cliPath),
    },
    plugin: {
      enabled_in_config: pluginEnabled(),
      entrypoint_uses_background_dispatch: Boolean(safeRead(hermesPluginPath, 100000)?.includes("subprocess.Popen")),
      entrypoint_omits_null_speaker_ref: !Boolean(safeRead(hermesPluginPath, 100000)?.includes("'speaker_ref': _get")),
    },
    provider: {
      configured_as_memory_provider: memoryProviderConfigured(),
      config: providerConfig(),
      entrypoint_registers_memory_provider: Boolean(safeRead(hermesProviderPath, 100000)?.includes("register_memory_provider")),
      entrypoint_has_prefetch: Boolean(safeRead(hermesProviderPath, 100000)?.includes("def prefetch")),
      entrypoint_has_sync_turn: Boolean(safeRead(hermesProviderPath, 100000)?.includes("def sync_turn")),
    },
    memory_consolidation: {
      metadata: tryJson(safeRead(hermesMemoryConsolidationMetadataPath, 100000)),
      script_installed: existsSync(hermesMemoryConsolidationScriptPath),
      cron_script_installed: existsSync(hermesMemoryConsolidationCronScriptPath),
      cron_job_installed: Boolean((tryJson(safeRead(hermesCronJobsPath, 1000000))?.jobs ?? [])
        .some((job) => job?.name === "cristalina-nightly-memory-consolidation")),
    },
    hermes_events: hermesEvents,
    cristalina: {
      status: runJson("status", ["status", "--config", configPath]),
      recognition: runJson("projection recognition", recognitionArgsFor(latestEvent)),
      projections: runJson("projection list", ["projection", "list", "--config", configPath]),
      diagnostics: runJson("diagnostics list", ["diagnostics", "list", "--config", configPath]),
      reviews: runJson("reviews list hermes", ["reviews", "list", "--runtime", "hermes", "--config", configPath]),
      store: runJson("store inspect", ["store", "inspect", "--config", configPath]),
      maturation: scanMaturation(),
    },
  };

  mkdirSync(outDir, { recursive: true });
  const stamp = now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const snapshotPath = join(outDir, `${stamp}.json`);
  writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  appendFileSync(join(outDir, "snapshots.jsonl"), `${JSON.stringify({
    captured_at: snapshot.captured_at,
    snapshot_path: snapshotPath,
    events_seen: snapshot.hermes_events.length,
    latest_event: snapshot.hermes_events.at(-1)?.event_id ?? null,
    plugin_enabled: snapshot.plugin.enabled_in_config,
    provider_enabled: snapshot.provider.configured_as_memory_provider,
    status_ok: snapshot.cristalina.status.ok,
    recognition_entries: snapshot.cristalina.recognition.json?.snapshot?.recognition_index?.length ?? null,
    diagnostics_count: snapshot.cristalina.diagnostics.json?.diagnostics?.length ?? null,
    memory_consolidations: snapshot.cristalina.maturation.memory_consolidations.count,
    wiki_pages: snapshot.cristalina.maturation.store_counts.wiki_pages,
    canon_records: snapshot.cristalina.maturation.store_counts.canon_records,
  })}\n`);

  const latest = snapshot.hermes_events.at(-1);
  console.log(JSON.stringify({
    snapshot: snapshotPath,
    captured_at: snapshot.captured_at,
    plugin_enabled: snapshot.plugin.enabled_in_config,
    provider_enabled: snapshot.provider.configured_as_memory_provider,
    background_dispatch: snapshot.plugin.entrypoint_uses_background_dispatch,
    provider_prefetch: snapshot.provider.entrypoint_has_prefetch,
    nightly_memory_consolidation: {
      installed: snapshot.memory_consolidation.script_installed,
      cron_installed: snapshot.memory_consolidation.cron_job_installed,
      enabled: snapshot.memory_consolidation.metadata?.enabled ?? null,
      interval_minutes: snapshot.memory_consolidation.metadata?.interval_minutes ?? null,
      consolidations_seen: snapshot.cristalina.maturation.memory_consolidations.count,
    },
    recognition_entries: snapshot.cristalina.recognition.json?.snapshot?.recognition_index?.length ?? null,
    events_seen: snapshot.hermes_events.length,
    latest_event: latest ? {
      event_id: latest.event_id,
      occurred_at: latest.occurred_at,
      message_preview: latest.message_preview,
      bridge_log_size: latest.bridge_log_size,
    } : null,
    cristalina_status_ok: snapshot.cristalina.status.ok,
    pending_owner_reviews: snapshot.cristalina.status.json?.pending_owner_reviews ?? null,
    diagnostics_count: snapshot.cristalina.diagnostics.json?.diagnostics?.length ?? null,
    maturation: {
      runtime_observations: snapshot.cristalina.maturation.store_counts.runtime_observations,
      proposals: snapshot.cristalina.maturation.store_counts.proposals,
      wiki_pages: snapshot.cristalina.maturation.store_counts.wiki_pages,
      canon_records: snapshot.cristalina.maturation.store_counts.canon_records,
      ai_pulse_files: snapshot.cristalina.maturation.ai_pulse.file_count,
      research_heartbeat_count: snapshot.cristalina.maturation.research_heartbeats.state?.count ?? null,
    },
  }, null, 2));
}

if (!watch) {
  makeSnapshot();
} else {
  makeSnapshot();
  setInterval(makeSnapshot, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 5000);
}
