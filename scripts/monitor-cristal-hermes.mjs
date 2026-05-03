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
const hermesHookScriptPath = join(hermesRoot, ".cristalina-v4", "hooks", "cristalina-bridge-event.sh");

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

function makeSnapshot() {
  const now = new Date();
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
      hermes_hook_script: pathState(hermesHookScriptPath),
      cristalina_config: pathState(configPath),
      cristalina_cli: pathState(cliPath),
    },
    plugin: {
      enabled_in_config: pluginEnabled(),
      entrypoint_uses_background_dispatch: Boolean(safeRead(hermesPluginPath, 100000)?.includes("subprocess.Popen")),
      entrypoint_omits_null_speaker_ref: !Boolean(safeRead(hermesPluginPath, 100000)?.includes("'speaker_ref': _get")),
    },
    hermes_events: listRecentEvents(),
    cristalina: {
      status: runJson("status", ["status", "--config", configPath]),
      projections: runJson("projection list", ["projection", "list", "--config", configPath]),
      diagnostics: runJson("diagnostics list", ["diagnostics", "list", "--config", configPath]),
      reviews: runJson("reviews list hermes", ["reviews", "list", "--runtime", "hermes", "--config", configPath]),
      store: runJson("store inspect", ["store", "inspect", "--config", configPath]),
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
    status_ok: snapshot.cristalina.status.ok,
    diagnostics_count: snapshot.cristalina.diagnostics.json?.diagnostics?.length ?? null,
  })}\n`);

  const latest = snapshot.hermes_events.at(-1);
  console.log(JSON.stringify({
    snapshot: snapshotPath,
    captured_at: snapshot.captured_at,
    plugin_enabled: snapshot.plugin.enabled_in_config,
    background_dispatch: snapshot.plugin.entrypoint_uses_background_dispatch,
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
  }, null, 2));
}

if (!watch) {
  makeSnapshot();
} else {
  makeSnapshot();
  setInterval(makeSnapshot, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 5000);
}
