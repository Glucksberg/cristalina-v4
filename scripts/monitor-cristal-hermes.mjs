#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
const serve = hasFlag("--serve");
const port = Number(argValue("--port", process.env.FAROL_PORT ?? "4347"));

const cliPath = join(cristalinaRoot, "packages", "cli", "dist", "index.js");
const defaultFarolBoardPath = fileURLToPath(new URL("../docs/FAROL-TEST-BOARD.json", import.meta.url));
const farolBoardPath = resolve(argValue("--board", process.env.FAROL_BOARD ?? defaultFarolBoardPath));
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
const hermesMemoryMaturationMetadataPath = join(hermesRoot, ".cristalina-v4", "memory-maturation-hermes.json");
const hermesMemoryCycleMetadataPath = join(hermesRoot, ".cristalina-v4", "memory-cycle-hermes.json");
const hermesMemoryCycleScriptPath = join(hermesRoot, "scripts", "cristalina-memory-cycle.py");
const hermesMemoryMaturationRunsDir = join(hermesRoot, ".cristalina-v4", "maturation-runs");
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

function scanMaturationRuns() {
  if (!existsSync(hermesMemoryMaturationRunsDir)) {
    return { count: 0, latest: null };
  }
  const runs = readdirSync(hermesMemoryMaturationRunsDir)
    .map((name) => {
      const dir = join(hermesMemoryMaturationRunsDir, name);
      if (!statSync(dir).isDirectory()) return null;
      const evidencePath = join(dir, "evidence.json");
      const llmOutputPath = join(dir, "llm-output.json");
      const evidence = tryJson(safeRead(evidencePath, 2000000));
      const evidencePayload = evidence?.evidence ?? evidence;
      const llmOutput = tryJson(safeRead(llmOutputPath, 1000000));
      return {
        run_id: name,
        evidence_path: existsSync(evidencePath) ? evidencePath : null,
        llm_output_path: existsSync(llmOutputPath) ? llmOutputPath : null,
        selected_items: evidencePayload?.selected_items?.length ?? null,
        skipped_already_matured: evidencePayload?.skipped_already_matured_observation_refs?.length ?? null,
        llm_candidates: llmOutput?.candidates?.length ?? null,
        mtime: statSync(dir).mtime.toISOString(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.mtime.localeCompare(right.mtime));
  return {
    count: runs.length,
    latest: runs.at(-1) ?? null,
  };
}

function loadFarolBoard() {
  return tryJson(safeRead(farolBoardPath, 1000000)) ?? {
    schema_version: 1,
    updated_at: null,
    title: "Farol Live Test Board",
    summary: `No board file found at ${farolBoardPath}`,
    fronts: [],
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

function makeSnapshot(options = {}) {
  const now = new Date();
  const hermesEvents = listRecentEvents();
  const latestEvent = hermesEvents.at(-1);
  const hermesCronJobs = tryJson(safeRead(hermesCronJobsPath, 1000000))?.jobs ?? [];
  const memoryConsolidationCronJob = hermesCronJobs.find((job) => job?.name === "cristalina-nightly-memory-consolidation") ?? null;
  const memoryCycleCronJob = hermesCronJobs.find((job) => job?.name === "cristalina-nightly-memory-cycle") ?? null;
  const snapshot = {
    schema_version: 1,
    captured_at: now.toISOString(),
    roots: {
      hermes_root: hermesRoot,
      cristalina_root: cristalinaRoot,
      cristalina_config: configPath,
      output_dir: outDir,
      farol_board: farolBoardPath,
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
      hermes_memory_maturation_metadata: pathState(hermesMemoryMaturationMetadataPath),
      hermes_memory_cycle_metadata: pathState(hermesMemoryCycleMetadataPath),
      hermes_memory_cycle_script: pathState(hermesMemoryCycleScriptPath),
      hermes_memory_maturation_runs: pathState(hermesMemoryMaturationRunsDir),
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
      cron_job_installed: Boolean(memoryConsolidationCronJob),
      cron_job: memoryConsolidationCronJob,
    },
    memory_cycle: {
      metadata: tryJson(safeRead(hermesMemoryCycleMetadataPath, 100000)),
      maturation_metadata: tryJson(safeRead(hermesMemoryMaturationMetadataPath, 100000)),
      script_installed: existsSync(hermesMemoryCycleScriptPath),
      cron_job_installed: Boolean(memoryCycleCronJob),
      cron_job: memoryCycleCronJob,
      runs: scanMaturationRuns(),
    },
    hermes_events: hermesEvents,
    cristalina: {
      status: runJson("status", ["status", "--config", configPath]),
      recognition: runJson("projection recognition", recognitionArgsFor(latestEvent)),
      projections: runJson("projection list", ["projection", "list", "--config", configPath]),
      diagnostics: runJson("diagnostics list", ["diagnostics", "list", "--config", configPath]),
      reviews: runJson("reviews list hermes", ["reviews", "list", "--runtime", "hermes", "--config", configPath]),
      owner_decisions: runJson("reviews list owner decisions", ["reviews", "list", "--owner-decisions", "--config", configPath]),
      memory_candidates: runJson("memory candidates hermes", ["memory", "candidates", "--runtime", "hermes", "--config", configPath]),
      memory_candidate_promotion: runJson("memory promote-candidates hermes", ["memory", "promote-candidates", "--runtime", "hermes", "--config", configPath]),
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
    memory_cycle_runs: snapshot.memory_cycle.runs.count,
    memory_auto_canon_ready: snapshot.cristalina.memory_candidates.json?.totals?.auto_canon_ready ?? null,
    memory_candidate_promotion_selected: snapshot.cristalina.memory_candidate_promotion.json?.selected?.length ?? null,
    memory_owner_review_questions: snapshot.cristalina.memory_candidate_promotion.json?.owner_review?.length ?? null,
    owner_decisions: snapshot.cristalina.owner_decisions.json?.owner_decisions?.length ?? null,
    wiki_pages: snapshot.cristalina.maturation.store_counts.wiki_pages,
    canon_records: snapshot.cristalina.maturation.store_counts.canon_records,
  })}\n`);

  const latest = snapshot.hermes_events.at(-1);
  const summary = {
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
      schedule: snapshot.memory_consolidation.cron_job?.schedule ?? null,
      next_run_at: snapshot.memory_consolidation.cron_job?.next_run_at ?? null,
      consolidations_seen: snapshot.cristalina.maturation.memory_consolidations.count,
    },
    nightly_memory_cycle: {
      installed: snapshot.memory_cycle.script_installed,
      cron_installed: snapshot.memory_cycle.cron_job_installed,
      enabled: snapshot.memory_cycle.metadata?.enabled ?? null,
      schedule: snapshot.memory_cycle.cron_job?.schedule ?? null,
      next_run_at: snapshot.memory_cycle.cron_job?.next_run_at ?? null,
      last_run_at: snapshot.memory_cycle.cron_job?.last_run_at ?? null,
      last_status: snapshot.memory_cycle.cron_job?.last_status ?? null,
      phases: snapshot.memory_cycle.metadata?.phases ?? null,
      candidate_promotion_command: snapshot.memory_cycle.metadata?.candidate_promotion_command ?? null,
      runs_seen: snapshot.memory_cycle.runs.count,
      latest_run: snapshot.memory_cycle.runs.latest,
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
    owner_decisions: snapshot.cristalina.owner_decisions.json?.owner_decisions?.length ?? null,
    diagnostics_count: snapshot.cristalina.diagnostics.json?.diagnostics?.length ?? null,
    maturation: {
      runtime_observations: snapshot.cristalina.maturation.store_counts.runtime_observations,
      proposals: snapshot.cristalina.maturation.store_counts.proposals,
      wiki_pages: snapshot.cristalina.maturation.store_counts.wiki_pages,
      canon_records: snapshot.cristalina.maturation.store_counts.canon_records,
      auto_canon_ready: snapshot.cristalina.memory_candidates.json?.totals?.auto_canon_ready ?? null,
      already_canon_slots: snapshot.cristalina.memory_candidates.json?.totals?.already_canon ?? null,
      candidate_promotion_selected: snapshot.cristalina.memory_candidate_promotion.json?.selected?.length ?? null,
      candidate_promotion_actions: snapshot.cristalina.memory_candidate_promotion.json?.selected ?? null,
      owner_review_questions: snapshot.cristalina.memory_candidate_promotion.json?.owner_review ?? null,
      ai_pulse_files: snapshot.cristalina.maturation.ai_pulse.file_count,
      research_heartbeat_count: snapshot.cristalina.maturation.research_heartbeats.state?.count ?? null,
    },
  };

  if (!options.silent) {
    console.log(JSON.stringify(summary, null, 2));
  }
  return { snapshot, summary, snapshot_path: snapshotPath };
}

function jsonResponse(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function htmlResponse(response, html) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

function notFound(response) {
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found\n");
}

function dashboardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Farol - Cristalina Live Tests</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f7f4;
      --panel: #ffffff;
      --ink: #202321;
      --muted: #69716d;
      --line: #dfe4df;
      --ok: #1f7a4d;
      --warn: #a06500;
      --bad: #b42318;
      --accent: #265f73;
      --soft: #eef4f2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    header {
      padding: 18px 24px 12px;
      border-bottom: 1px solid var(--line);
      background: #fbfbf8;
      position: sticky;
      top: 0;
      z-index: 3;
    }
    h1, h2, h3 { margin: 0; font-weight: 650; letter-spacing: 0; }
    h1 { font-size: 22px; }
    h2 { font-size: 16px; }
    h3 { font-size: 14px; }
    .sub { color: var(--muted); font-size: 13px; margin-top: 5px; }
    main { padding: 18px 24px 32px; max-width: 1440px; margin: 0 auto; }
    .grid { display: grid; gap: 14px; }
    .overview { grid-template-columns: repeat(6, minmax(140px, 1fr)); }
    .cols { grid-template-columns: minmax(360px, 1.2fr) minmax(360px, 1fr); align-items: start; }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      min-width: 0;
    }
    .metric .label { color: var(--muted); font-size: 12px; }
    .metric .value { font-size: 24px; margin-top: 5px; font-weight: 700; }
    .metric .detail { color: var(--muted); font-size: 12px; margin-top: 4px; overflow-wrap: anywhere; }
    .status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 8px; border-radius: 999px; background: var(--soft); color: var(--accent); font-weight: 650; }
    .status.ok { color: var(--ok); background: #edf8f1; }
    .status.warn { color: var(--warn); background: #fff6df; }
    .status.bad { color: var(--bad); background: #fff0ed; }
    .section-title { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin: 22px 0 10px; }
    .fronts { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    .front { display: grid; gap: 10px; }
    .front-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .front p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
    ul { margin: 7px 0 0; padding-left: 18px; }
    li { margin: 5px 0; font-size: 13px; line-height: 1.4; }
    .small { font-size: 12px; color: var(--muted); }
    .table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .table th, .table td { text-align: left; border-bottom: 1px solid var(--line); padding: 8px 6px; vertical-align: top; }
    .table th { color: var(--muted); font-weight: 650; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; background: #f0f2ef; padding: 1px 4px; border-radius: 4px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; font-size: 12px; line-height: 1.4; color: #26302b; }
    .events { max-height: 420px; overflow: auto; }
    .muted { color: var(--muted); }
    .error { color: var(--bad); }
    @media (max-width: 1000px) {
      .overview, .cols { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
      header, main { padding-left: 14px; padding-right: 14px; }
      .overview, .cols { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Farol</h1>
    <div class="sub">Cristalina/Hermes live test monitor. Read-only. Auto-refresh every 10s.</div>
  </header>
  <main>
    <div id="load-error" class="panel error" hidden></div>
    <section class="grid overview" id="overview"></section>

    <div class="section-title">
      <h2>Test Fronts</h2>
      <span class="small" id="board-updated"></span>
    </div>
    <section class="grid fronts" id="fronts"></section>

    <section class="grid cols">
      <div>
        <div class="section-title"><h2>Owner Decisions</h2><span class="small" id="owner-count"></span></div>
        <div class="panel" id="owner-decisions"></div>
      </div>
      <div>
        <div class="section-title"><h2>Nightly Cycle</h2><span class="small" id="cycle-updated"></span></div>
        <div class="panel" id="nightly"></div>
      </div>
    </section>

    <section class="grid cols">
      <div>
        <div class="section-title"><h2>Recent Events</h2><span class="small" id="events-count"></span></div>
        <div class="panel events" id="events"></div>
      </div>
      <div>
        <div class="section-title"><h2>Raw Snapshot</h2><span class="small">for debugging Farol</span></div>
        <div class="panel"><pre id="raw"></pre></div>
      </div>
    </section>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);

    function asArray(value) {
      return Array.isArray(value) ? value : [];
    }

    function safe(value, fallback = "n/a") {
      return value === undefined || value === null || value === "" ? fallback : value;
    }

    function statusClass(value) {
      if (value === true || value === "ok" || value === "active" || value === "watching") return "ok";
      if (value === false || value === "error" || value === "failed") return "bad";
      return "warn";
    }

    function metric(label, value, detail) {
      return '<div class="panel metric"><div class="label">' + label + '</div><div class="value">' + safe(value) + '</div><div class="detail">' + safe(detail, "") + '</div></div>';
    }

    function list(items) {
      const values = asArray(items);
      if (!values.length) return '<div class="small">None recorded.</div>';
      return '<ul>' + values.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>';
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function renderFronts(board) {
      $('board-updated').textContent = board.updated_at ? 'updated ' + board.updated_at : '';
      $('fronts').innerHTML = asArray(board.fronts).map((front) => {
        return '<article class="panel front">' +
          '<div class="front-head"><h3>' + escapeHtml(front.name) + '</h3><span class="status ' + statusClass(front.status) + '">' + escapeHtml(front.status) + '</span></div>' +
          '<p>' + escapeHtml(front.goal) + '</p>' +
          '<div><h3>Next Questions</h3>' + list(front.next_questions) + '</div>' +
          '<div><h3>Next Code Changes</h3>' + list(front.next_code_changes) + '</div>' +
          '<div><h3>Next Tests</h3>' + list(front.next_tests) + '</div>' +
        '</article>';
      }).join('');
    }

    function renderOverview(snapshot) {
      const c = snapshot.cristalina || {};
      const maturation = c.maturation || {};
      const counts = maturation.store_counts || {};
      const owner = c.owner_decisions?.json?.owner_decisions?.length ?? 0;
      const recognition = c.recognition?.json?.snapshot?.recognition_index?.length ?? null;
      const diag = c.diagnostics?.json?.diagnostics?.length ?? null;
      const cycle = snapshot.memory_cycle || {};
      $('overview').innerHTML = [
        metric('Provider', snapshot.provider?.configured_as_memory_provider ? 'on' : 'off', snapshot.provider?.entrypoint_has_prefetch ? 'prefetch active' : 'prefetch missing'),
        metric('Status', c.status?.ok ? 'ok' : 'check', snapshot.captured_at),
        metric('Owner Decisions', owner, 'deferred proposal decisions'),
        metric('Recognition', recognition, 'projected entries'),
        metric('Canon / Wiki', safe(counts.canon_records) + ' / ' + safe(counts.wiki_pages), 'records / pages'),
        metric('Nightly', cycle.cron_job?.last_status ?? 'n/a', cycle.cron_job?.last_run_at ?? cycle.cron_job?.next_run_at),
      ].join('');
    }

    function renderOwner(snapshot) {
      const decisions = asArray(snapshot.cristalina?.owner_decisions?.json?.owner_decisions);
      $('owner-count').textContent = decisions.length + ' item(s)';
      if (!decisions.length) {
        $('owner-decisions').innerHTML = '<div class="small">No owner decisions surfaced.</div>';
        return;
      }
      $('owner-decisions').innerHTML = '<table class="table"><thead><tr><th>Slot</th><th>Status</th><th>Question</th></tr></thead><tbody>' +
        decisions.slice(0, 20).map((item) => '<tr><td><code>' + escapeHtml(item.semantic_slot) + '</code><div class="small">' + escapeHtml(item.claim_ref) + '</div></td><td>' + escapeHtml(item.epistemic_state) + '<div class="small">' + escapeHtml(item.curation_status) + '</div></td><td>' + escapeHtml(item.question) + '</td></tr>').join('') +
        '</tbody></table>';
    }

    function renderNightly(snapshot) {
      const cycle = snapshot.memory_cycle || {};
      const latest = cycle.runs?.latest || {};
      const candidates = snapshot.cristalina?.memory_candidates?.json?.totals || {};
      $('cycle-updated').textContent = snapshot.captured_at || '';
      $('nightly').innerHTML =
        '<table class="table"><tbody>' +
        '<tr><th>cron status</th><td>' + escapeHtml(cycle.cron_job?.last_status ?? 'n/a') + '</td></tr>' +
        '<tr><th>last run</th><td>' + escapeHtml(cycle.cron_job?.last_run_at ?? 'n/a') + '</td></tr>' +
        '<tr><th>next run</th><td>' + escapeHtml(cycle.cron_job?.next_run_at ?? 'n/a') + '</td></tr>' +
        '<tr><th>latest maturation run</th><td><code>' + escapeHtml(latest.run_id ?? 'n/a') + '</code></td></tr>' +
        '<tr><th>selected / skipped</th><td>' + escapeHtml(latest.selected_items ?? 'n/a') + ' / ' + escapeHtml(latest.skipped_already_matured ?? 'n/a') + '</td></tr>' +
        '<tr><th>auto ready / owner review</th><td>' + escapeHtml(candidates.auto_canon_ready ?? 'n/a') + ' / ' + escapeHtml(candidates.owner_review ?? 'n/a') + '</td></tr>' +
        '</tbody></table>';
    }

    function renderEvents(snapshot) {
      const events = asArray(snapshot.hermes_events);
      $('events-count').textContent = events.length + ' recent';
      if (!events.length) {
        $('events').innerHTML = '<div class="small">No recent events found.</div>';
        return;
      }
      $('events').innerHTML = '<table class="table"><thead><tr><th>Time</th><th>Type</th><th>Preview</th></tr></thead><tbody>' +
        events.slice().reverse().map((event) => '<tr><td>' + escapeHtml(event.occurred_at ?? event.mtime) + '</td><td><code>' + escapeHtml(event.event_type) + '</code></td><td>' + escapeHtml(event.message_preview ?? event.event_id) + '</td></tr>').join('') +
        '</tbody></table>';
    }

    function renderLoading() {
      $('overview').innerHTML = [
        metric('Provider', 'loading', 'waiting for Farol snapshot'),
        metric('Status', 'loading', 'waiting for Farol snapshot'),
        metric('Owner Decisions', 'loading', 'waiting for Farol snapshot'),
        metric('Recognition', 'loading', 'waiting for Farol snapshot'),
        metric('Canon / Wiki', 'loading', 'waiting for Farol snapshot'),
        metric('Nightly', 'loading', 'waiting for Farol snapshot'),
      ].join('');
      $('owner-decisions').innerHTML = '<div class="small">Loading owner decisions...</div>';
      $('nightly').innerHTML = '<div class="small">Loading nightly cycle...</div>';
      $('events').innerHTML = '<div class="small">Loading recent events...</div>';
      $('raw').textContent = 'Loading Farol snapshot...';
    }

    let refreshInFlight = false;

    async function refresh() {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        const boardResponse = await fetch('/api/board', { cache: 'no-store' });
        const board = await boardResponse.json();
        renderFronts(board);

        const snapshotResponse = await fetch('/api/snapshot', { cache: 'no-store' });
        const snapshotPayload = await snapshotResponse.json();
        const snapshot = snapshotPayload.snapshot;
        renderOverview(snapshot);
        renderOwner(snapshot);
        renderNightly(snapshot);
        renderEvents(snapshot);
        $('raw').textContent = JSON.stringify(snapshotPayload.summary, null, 2);
        $('load-error').hidden = true;
      } catch (error) {
        $('load-error').hidden = false;
        $('load-error').textContent = 'Farol refresh failed: ' + (error?.message || error);
      } finally {
        refreshInFlight = false;
      }
    }

    renderLoading();
    refresh();
    setInterval(refresh, 10000);
  </script>
</body>
</html>`;
}

function startServer() {
  const listenPort = Number.isFinite(port) && port > 0 ? port : 4347;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname === "/") {
      htmlResponse(response, dashboardHtml());
      return;
    }
    if (url.pathname === "/api/snapshot") {
      try {
        jsonResponse(response, 200, makeSnapshot({ silent: true }));
      } catch (error) {
        jsonResponse(response, 500, { error: String(error?.message ?? error) });
      }
      return;
    }
    if (url.pathname === "/api/board") {
      jsonResponse(response, 200, loadFarolBoard());
      return;
    }
    notFound(response);
  });
  server.listen(listenPort, "127.0.0.1", () => {
    console.log(`Farol UI listening on http://127.0.0.1:${listenPort}`);
  });
}

if (serve) {
  startServer();
} else if (!watch) {
  makeSnapshot();
} else {
  makeSnapshot();
  setInterval(makeSnapshot, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 5000);
}
