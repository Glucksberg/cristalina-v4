import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { hermesInstallOneLiner, installRuntime, loadInstallationRegistry, openClawInstallOneLiner } from "./installers.js";

test("OpenClaw installer writes operational metadata outside truth layers", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-openclaw-install-"));
  const configPath = join(root, "config.json");
  const metadataPath = join(root, ".cristalina-v4", "runtime-openclaw.json");

  const result = await installRuntime({
    runtime: "openclaw",
    configPath,
    metadataPath,
    nonInteractive: true,
    runtimeRoot: join(root, "openclaw"),
  });

  assert.equal(result.runtime, "openclaw");
  assert.equal(result.status, "installed");
  assert.equal(result.metadata_path, metadataPath);
  assert.equal(result.hook_path, join(root, "openclaw", ".cristalina-v4", "hooks", "openclaw-cristalina-hook.json"));
  assert.equal(result.diagnostics.length, 1);

  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
    runtime: string;
    event_contract: string;
    authority_note: string;
    bridge_command: string;
    hook_path: string;
  };
  assert.equal(metadata.runtime, "openclaw");
  assert.equal(metadata.event_contract, "cristalina.runtime_bridge_event.v1");
  assert.match(metadata.authority_note, /does not grant owner authority/);
  assert.match(metadata.bridge_command, /cristalina bridge event/);
  assert.equal(metadata.hook_path, result.hook_path);

  const hook = JSON.parse(await readFile(result.hook_path, "utf8")) as {
    runtime: string;
    hook_contract: string;
    event_path_env: string;
    bridge_command_argv: string[];
  };
  assert.equal(hook.runtime, "openclaw");
  assert.equal(hook.hook_contract, "cristalina.runtime_hook.v1");
  assert.equal(hook.event_path_env, "CRISTALINA_EVENT_PATH");
  assert.deepEqual(hook.bridge_command_argv.slice(2, 6), ["bridge", "event", "--config", configPath]);
  assert.equal(hook.bridge_command_argv[0], process.execPath);
  assert.match(await readFile(result.hook_script_path, "utf8"), /CRISTALINA_EVENT_PATH/);
  assert.match(await readFile(result.hook_script_path, "utf8"), new RegExp(process.execPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("OpenClaw one-liner documents the public installer shape", () => {
  assert.equal(
    openClawInstallOneLiner("https://example.invalid/install-openclaw.sh"),
    "curl -fsSL https://example.invalid/install-openclaw.sh | sh",
  );
});

test("Hermes installer installs Cristalina as the native memory provider by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-hermes-install-"));
  const configPath = join(root, "config.json");
  const metadataPath = join(root, ".cristalina-v4", "runtime-hermes.json");
  const runtimeRoot = join(root, "hermes");
  const hermesConfigPath = join(runtimeRoot, "config.yaml");
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(hermesConfigPath, "model:\n  provider: test\nhooks: {}\n");

  const result = await installRuntime({
    runtime: "hermes",
    configPath,
    metadataPath,
    nonInteractive: true,
    runtimeRoot,
  });

  assert.equal(result.runtime, "hermes");
  assert.equal(result.status, "installed");
  assert.equal(result.metadata_path, metadataPath);

  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
    runtime: string;
    event_contract: string;
    bridge_command: string;
    projection_command: string;
    integration_mode: string;
    provider_path: string;
    provider_manifest_path: string;
    provider_entrypoint_path: string;
    provider_config_path: string;
    session_reset_tips_path: string;
    memory_consolidation_metadata_path: string;
    memory_consolidation_script_path: string;
    memory_consolidation_cron_script_path: string;
    memory_consolidation_cron_jobs_path: string;
    memory_consolidation_cron_job_id: string;
    memory_consolidation_interval_minutes: number;
    memory_consolidation_schedule_expr: string;
    memory_consolidation_schedule_display: string;
    memory_maturation_metadata_path: string;
    memory_maturation_script_path: string;
    memory_maturation_cron_script_path: string;
    memory_maturation_cron_job_id: string;
    memory_maturation_schedule_expr: string;
    memory_maturation_schedule_display: string;
    memory_cycle_metadata_path: string;
    memory_cycle_cron_script_path: string;
    memory_cycle_cron_job_id: string;
    memory_cycle_schedule_expr: string;
    memory_cycle_schedule_display: string;
    plugin_enable_hint: string;
  };
  assert.equal(metadata.runtime, "hermes");
  assert.equal(metadata.event_contract, "cristalina.runtime_bridge_event.v1");
  assert.match(metadata.bridge_command, /cristalina bridge event/);
  assert.match(metadata.projection_command, /cristalina projection list/);
  assert.equal(metadata.integration_mode, "provider");
  assert.equal(metadata.provider_path, join(root, "hermes", "plugins", "cristalina"));
  assert.equal(metadata.provider_manifest_path, join(metadata.provider_path, "plugin.yaml"));
  assert.equal(metadata.provider_entrypoint_path, join(metadata.provider_path, "__init__.py"));
  assert.equal(metadata.provider_config_path, join(root, "hermes", ".cristalina-v4", "provider-hermes.json"));
  assert.equal(metadata.session_reset_tips_path, join(root, "hermes", "session-reset-tips.d", "cristalina.json"));
  assert.equal(metadata.memory_consolidation_metadata_path, join(root, "hermes", ".cristalina-v4", "memory-consolidation-hermes.json"));
  assert.equal(metadata.memory_consolidation_script_path, join(root, "hermes", "scripts", "cristalina-memory-consolidation.sh"));
  assert.equal(metadata.memory_consolidation_cron_script_path, join(root, "hermes", "scripts", "cristalina-memory-consolidation.py"));
  assert.equal(metadata.memory_consolidation_cron_jobs_path, join(root, "hermes", "cron", "jobs.json"));
  assert.equal(metadata.memory_consolidation_interval_minutes, 1440);
  assert.equal(metadata.memory_consolidation_schedule_expr, "0 3 * * *");
  assert.equal(metadata.memory_consolidation_schedule_display, "daily at 03:00");
  assert.equal(metadata.memory_maturation_metadata_path, join(root, "hermes", ".cristalina-v4", "memory-maturation-hermes.json"));
  assert.equal(metadata.memory_maturation_script_path, join(root, "hermes", "scripts", "cristalina-memory-maturation.sh"));
  assert.equal(metadata.memory_maturation_cron_script_path, join(root, "hermes", "scripts", "cristalina-memory-maturation.py"));
  assert.equal(metadata.memory_maturation_schedule_expr, "0 3 * * *");
  assert.equal(metadata.memory_maturation_schedule_display, "phase inside nightly memory cycle");
  assert.equal(metadata.memory_cycle_metadata_path, join(root, "hermes", ".cristalina-v4", "memory-cycle-hermes.json"));
  assert.equal(metadata.memory_cycle_cron_script_path, join(root, "hermes", "scripts", "cristalina-memory-cycle.py"));
  assert.equal(metadata.memory_consolidation_cron_job_id, metadata.memory_cycle_cron_job_id);
  assert.equal(metadata.memory_maturation_cron_job_id, metadata.memory_cycle_cron_job_id);
  assert.equal(metadata.memory_cycle_schedule_expr, "0 3 * * *");
  assert.equal(metadata.memory_cycle_schedule_display, "daily at 03:00");
  assert.match(metadata.plugin_enable_hint, /memory\.provider/);
  assert.match(await readFile(result.hook_path, "utf8"), /cristalina.runtime_hook.v1/);
  assert.equal(result.provider_path, metadata.provider_path);
  assert.equal(result.provider_manifest_path, metadata.provider_manifest_path);
  assert.equal(result.provider_entrypoint_path, metadata.provider_entrypoint_path);
  assert.equal(result.provider_config_path, metadata.provider_config_path);
  assert.equal(result.session_reset_tips_path, metadata.session_reset_tips_path);
  assert.equal(result.memory_consolidation_metadata_path, metadata.memory_consolidation_metadata_path);
  assert.equal(result.memory_consolidation_script_path, metadata.memory_consolidation_script_path);
  assert.equal(result.memory_consolidation_cron_script_path, metadata.memory_consolidation_cron_script_path);
  assert.equal(result.memory_consolidation_cron_jobs_path, metadata.memory_consolidation_cron_jobs_path);
  assert.equal(result.memory_consolidation_cron_job_id, metadata.memory_consolidation_cron_job_id);
  assert.equal(result.memory_consolidation_interval_minutes, 1440);
  assert.equal(result.memory_consolidation_schedule_expr, "0 3 * * *");
  assert.equal(result.memory_consolidation_schedule_display, "daily at 03:00");
  assert.equal(result.memory_maturation_metadata_path, metadata.memory_maturation_metadata_path);
  assert.equal(result.memory_maturation_script_path, metadata.memory_maturation_script_path);
  assert.equal(result.memory_maturation_cron_script_path, metadata.memory_maturation_cron_script_path);
  assert.equal(result.memory_maturation_cron_job_id, metadata.memory_maturation_cron_job_id);
  assert.equal(result.memory_maturation_schedule_expr, "0 3 * * *");
  assert.equal(result.memory_maturation_schedule_display, "phase inside nightly memory cycle");
  assert.equal(result.memory_cycle_metadata_path, metadata.memory_cycle_metadata_path);
  assert.equal(result.memory_cycle_cron_script_path, metadata.memory_cycle_cron_script_path);
  assert.equal(result.memory_cycle_cron_job_id, metadata.memory_cycle_cron_job_id);
  assert.equal(result.memory_cycle_schedule_expr, "0 3 * * *");
  assert.equal(result.memory_cycle_schedule_display, "daily at 03:00");
  assert.match(result.plugin_enable_hint!, /memory\.provider/);
  assert.ok(result.diagnostics.some((entry) => entry.includes("memory.provider")));
  const registry = await loadInstallationRegistry(configPath);
  assert.equal(registry?.installations.length, 1);
  assert.equal(registry?.installations[0]?.runtime, "hermes");
  assert.equal(registry?.installations[0]?.runtime_root, join(root, "hermes"));
  assert.equal(registry?.installations[0]?.integration_mode, "provider");

  const providerManifest = await readFile(metadata.provider_manifest_path, "utf8");
  assert.match(providerManifest, /name: cristalina/);
  assert.match(providerManifest, /type: memory_provider/);

  const providerEntrypoint = await readFile(metadata.provider_entrypoint_path, "utf8");
  assert.match(providerEntrypoint, /class CristalinaMemoryProvider\(MemoryProvider\)/);
  assert.match(providerEntrypoint, /ctx.register_memory_provider\(CristalinaMemoryProvider\(\)\)/);
  assert.match(providerEntrypoint, /def _resolve_hermes_root/);
  assert.match(providerEntrypoint, /def prefetch/);
  assert.match(providerEntrypoint, /def sync_turn/);
  assert.match(providerEntrypoint, /cristalina_archive_search/);
  assert.match(providerEntrypoint, /evt_hermes_provider_/);

  const providerConfig = JSON.parse(await readFile(metadata.provider_config_path, "utf8")) as {
    provider: string;
    integration_mode: string;
    cli_path: string;
    config_path: string;
    session_reset_tips: {
      enabled: boolean;
      path: string;
      label: string;
      tips: string[];
    };
    memory_consolidation: {
      enabled: boolean;
      interval_minutes: number;
      schedule_kind: string;
      schedule_expr: string;
      schedule_display: string;
      auto_promote: boolean;
      script_path: string;
      cron_script_path: string;
      hermes_cron_jobs_path: string;
      hermes_cron_job_id: string;
      command: string;
    };
    memory_maturation: {
      enabled: boolean;
      schedule_kind: string;
      schedule_expr: string;
      schedule_display: string;
      script_path: string;
      cron_script_path: string;
      hermes_cron_jobs_path: string;
      hermes_cron_job_id: string;
      command: string;
      auto_ratify_non_owner_claims: boolean;
    };
    memory_cycle: {
      enabled: boolean;
      schedule_kind: string;
      schedule_expr: string;
      schedule_display: string;
      cron_script_path: string;
      hermes_cron_jobs_path: string;
      hermes_cron_job_id: string;
      phases: string[];
      candidate_promotion_command: string;
    };
  };
  assert.equal(providerConfig.provider, "cristalina");
  assert.equal(providerConfig.integration_mode, "provider");
  assert.equal(providerConfig.config_path, configPath);
  assert.ok(providerConfig.cli_path.endsWith("index.js"));
  assert.equal(providerConfig.session_reset_tips.enabled, true);
  assert.equal(providerConfig.session_reset_tips.path, metadata.session_reset_tips_path);
  assert.equal(providerConfig.session_reset_tips.label, "Cristalina Tip");
  assert.ok(providerConfig.session_reset_tips.tips.some((tip) => tip.includes("Runtime observations are evidence")));
  const sessionResetTips = JSON.parse(await readFile(metadata.session_reset_tips_path, "utf8")) as {
    source: string;
    enabled: boolean;
    label: string;
    tips: string[];
    authority_note: string;
  };
  assert.equal(sessionResetTips.source, "cristalina");
  assert.equal(sessionResetTips.enabled, true);
  assert.equal(sessionResetTips.label, "Cristalina Tip");
  assert.ok(sessionResetTips.tips.some((tip) => tip.includes("cristalina_memory_status")));
  assert.match(sessionResetTips.authority_note, /do not create Cristalina memory/);
  assert.equal(providerConfig.memory_consolidation.enabled, true);
  assert.equal(providerConfig.memory_consolidation.interval_minutes, 1440);
  assert.equal(providerConfig.memory_consolidation.schedule_kind, "cron");
  assert.equal(providerConfig.memory_consolidation.schedule_expr, "0 3 * * *");
  assert.equal(providerConfig.memory_consolidation.schedule_display, "daily at 03:00");
  assert.equal(providerConfig.memory_consolidation.auto_promote, false);
  assert.equal(providerConfig.memory_consolidation.script_path, metadata.memory_consolidation_script_path);
  assert.equal(providerConfig.memory_consolidation.cron_script_path, metadata.memory_consolidation_cron_script_path);
  assert.equal(providerConfig.memory_consolidation.hermes_cron_jobs_path, metadata.memory_consolidation_cron_jobs_path);
  assert.equal(providerConfig.memory_consolidation.hermes_cron_job_id, metadata.memory_consolidation_cron_job_id);
  assert.match(providerConfig.memory_consolidation.command, /memory consolidation --runtime hermes --write/);
  assert.equal(providerConfig.memory_maturation.enabled, true);
  assert.equal(providerConfig.memory_maturation.schedule_kind, "manual_or_cycle");
  assert.equal(providerConfig.memory_maturation.schedule_expr, "0 3 * * *");
  assert.equal(providerConfig.memory_maturation.schedule_display, "phase inside nightly memory cycle");
  assert.equal(providerConfig.memory_maturation.auto_ratify_non_owner_claims, true);
  assert.equal(providerConfig.memory_maturation.script_path, metadata.memory_maturation_script_path);
  assert.equal(providerConfig.memory_maturation.cron_script_path, metadata.memory_maturation_cron_script_path);
  assert.equal(providerConfig.memory_maturation.hermes_cron_jobs_path, metadata.memory_consolidation_cron_jobs_path);
  assert.equal(providerConfig.memory_maturation.hermes_cron_job_id, metadata.memory_maturation_cron_job_id);
  assert.match(providerConfig.memory_maturation.command, /memory mature --runtime hermes --write/);
  assert.equal(providerConfig.memory_cycle.enabled, true);
  assert.equal(providerConfig.memory_cycle.schedule_kind, "cron");
  assert.equal(providerConfig.memory_cycle.schedule_expr, "0 3 * * *");
  assert.equal(providerConfig.memory_cycle.schedule_display, "daily at 03:00");
  assert.equal(providerConfig.memory_cycle.cron_script_path, metadata.memory_cycle_cron_script_path);
  assert.equal(providerConfig.memory_cycle.hermes_cron_jobs_path, metadata.memory_consolidation_cron_jobs_path);
  assert.equal(providerConfig.memory_cycle.hermes_cron_job_id, metadata.memory_cycle_cron_job_id);
  assert.equal(providerConfig.memory_consolidation.hermes_cron_job_id, metadata.memory_cycle_cron_job_id);
  assert.equal(providerConfig.memory_maturation.hermes_cron_job_id, metadata.memory_cycle_cron_job_id);
  assert.deepEqual(providerConfig.memory_cycle.phases, ["memory_consolidation", "memory_maturation", "memory_candidate_promotion"]);
  assert.match(providerConfig.memory_cycle.candidate_promotion_command, /memory promote-candidates --runtime hermes --write/);

  const memoryConsolidationMetadata = JSON.parse(await readFile(metadata.memory_consolidation_metadata_path, "utf8")) as {
    enabled: boolean;
    mode: string;
    interval_minutes: number;
    schedule_kind: string;
    schedule_expr: string;
    schedule_display: string;
    auto_promote: boolean;
    command: string;
  };
  assert.equal(memoryConsolidationMetadata.enabled, true);
  assert.equal(memoryConsolidationMetadata.mode, "conservative");
  assert.equal(memoryConsolidationMetadata.interval_minutes, 1440);
  assert.equal(memoryConsolidationMetadata.schedule_kind, "cron");
  assert.equal(memoryConsolidationMetadata.schedule_expr, "0 3 * * *");
  assert.equal(memoryConsolidationMetadata.schedule_display, "daily at 03:00");
  assert.equal(memoryConsolidationMetadata.auto_promote, false);
  assert.match(memoryConsolidationMetadata.command, /memory consolidation --runtime hermes --write/);
  assert.match(await readFile(metadata.memory_consolidation_script_path, "utf8"), /memory consolidation --runtime 'hermes' --write/);
  const memoryConsolidationCronScript = await readFile(metadata.memory_consolidation_cron_script_path, "utf8");
  assert.match(memoryConsolidationCronScript, /"memory","consolidation"/);
  assert.match(memoryConsolidationCronScript, /if completed\.returncode != 0 and completed\.stdout:/);
  const memoryMaturationMetadata = JSON.parse(await readFile(metadata.memory_maturation_metadata_path, "utf8")) as {
    enabled: boolean;
    mode: string;
    schedule_kind: string;
    schedule_expr: string;
    schedule_display: string;
    command: string;
    llm_runtime_policy: string;
    remote_llm_opt_in: string;
    remote_full_summary_default: boolean;
  };
  assert.equal(memoryMaturationMetadata.enabled, true);
  assert.equal(memoryMaturationMetadata.mode, "llm_structured_claims");
  assert.equal(memoryMaturationMetadata.schedule_kind, "manual_or_cycle");
  assert.equal(memoryMaturationMetadata.schedule_expr, "0 3 * * *");
  assert.equal(memoryMaturationMetadata.schedule_display, "phase inside nightly memory cycle");
  assert.equal(memoryMaturationMetadata.llm_runtime_policy, "uses_hermes_runtime_model_harness");
  assert.equal(memoryMaturationMetadata.remote_llm_opt_in, "runtime_harness_execution");
  assert.equal(memoryMaturationMetadata.remote_full_summary_default, true);
  assert.match(memoryMaturationMetadata.command, /memory mature --runtime hermes --write/);
  const memoryMaturationScript = await readFile(metadata.memory_maturation_script_path, "utf8");
  assert.match(memoryMaturationScript, /CRISTALINA_MEMORY_MATURATION_LLM_OUTPUT/);
  assert.match(memoryMaturationScript, /--llm-output "\$CRISTALINA_MEMORY_MATURATION_LLM_OUTPUT"/);
  const memoryMaturationCronScript = await readFile(metadata.memory_maturation_cron_script_path, "utf8");
  assert.match(memoryMaturationCronScript, /"memory","mature"/);
  assert.match(memoryMaturationCronScript, /"--evidence-output"/);
  assert.match(memoryMaturationCronScript, /apply_command/);
  assert.doesNotMatch(memoryMaturationCronScript, /CRISTALINA_MEMORY_MATURATION_RUNTIME_MANAGED/);
  const memoryCycleMetadata = JSON.parse(await readFile(metadata.memory_cycle_metadata_path, "utf8")) as {
    enabled: boolean;
    schedule_kind: string;
    schedule_expr: string;
    schedule_display: string;
    phases: string[];
    candidate_promotion_command: string;
  };
  assert.equal(memoryCycleMetadata.enabled, true);
  assert.equal(memoryCycleMetadata.schedule_kind, "cron");
  assert.equal(memoryCycleMetadata.schedule_expr, "0 3 * * *");
  assert.equal(memoryCycleMetadata.schedule_display, "daily at 03:00");
  assert.deepEqual(memoryCycleMetadata.phases, ["memory_consolidation", "memory_maturation", "memory_candidate_promotion"]);
  assert.match(memoryCycleMetadata.candidate_promotion_command, /memory promote-candidates --runtime hermes --write/);
  const memoryCycleCronScript = await readFile(metadata.memory_cycle_cron_script_path, "utf8");
  assert.match(memoryCycleCronScript, /consolidation_cmd/);
  assert.match(memoryCycleCronScript, /prepare_cmd/);
  assert.match(memoryCycleCronScript, /apply_command/);
  assert.match(memoryCycleCronScript, /--apply/);
  assert.match(memoryCycleCronScript, /report\.md/);
  assert.match(memoryCycleCronScript, /candidate_promotion_cmd/);
  const cronJobs = JSON.parse(await readFile(metadata.memory_consolidation_cron_jobs_path, "utf8")) as {
    jobs: Array<{ id: string; name: string; schedule: { kind: string; expr?: string; display?: string }; script: string; deliver: string }>;
  };
  assert.ok(cronJobs.jobs.some((job) =>
    job.id === metadata.memory_cycle_cron_job_id &&
    job.name === "cristalina-nightly-memory-cycle" &&
    job.schedule.kind === "cron" &&
    job.schedule.expr === "0 3 * * *" &&
    job.schedule.display === "daily at 03:00" &&
    job.script === "cristalina-memory-cycle.py" &&
    job.deliver === "local"));
  assert.ok(!cronJobs.jobs.some((job) => job.name === "cristalina-nightly-memory-consolidation"));
  assert.ok(!cronJobs.jobs.some((job) => job.name === "cristalina-nightly-memory-maturation"));

  const hermesConfig = await readFile(hermesConfigPath, "utf8");
  assert.match(hermesConfig, /memory:\n  provider: cristalina/);
  assert.doesNotMatch(hermesConfig, /cristalina-bridge/);
});

test("Hermes installer delivers nightly memory cycle reports to a unique channel origin", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-hermes-delivery-"));
  const configPath = join(root, "config.json");
  const metadataPath = join(root, ".cristalina-v4", "runtime-hermes.json");
  const runtimeRoot = join(root, "hermes");
  const hermesConfigPath = join(runtimeRoot, "config.yaml");
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(hermesConfigPath, "model:\n  provider: test\nhooks: {}\n");
  await writeFile(join(runtimeRoot, "channel_directory.json"), `${JSON.stringify({
    updated_at: "2026-05-18T00:00:00.000Z",
    platforms: {
      telegram: [
        {
          id: "942906261",
          name: "Markus Glucksberg",
          type: "dm",
          thread_id: null,
        },
      ],
      discord: [],
    },
  }, null, 2)}\n`);

  const result = await installRuntime({
    runtime: "hermes",
    configPath,
    metadataPath,
    nonInteractive: true,
    runtimeRoot,
  });

  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
    memory_consolidation_cron_jobs_path: string;
    memory_cycle_cron_job_id: string;
  };
  const cronJobs = JSON.parse(await readFile(metadata.memory_consolidation_cron_jobs_path, "utf8")) as {
    jobs: Array<{
      id: string;
      name: string;
      deliver: string;
      origin: null | { platform: string; chat_id: string; chat_name: string | null; thread_id: string | null };
      enabled_toolsets: string[];
    }>;
  };
  const job = cronJobs.jobs.find((entry) => entry.id === metadata.memory_cycle_cron_job_id);
  assert.equal(job?.name, "cristalina-nightly-memory-cycle");
  assert.equal(job?.deliver, "origin");
  assert.deepEqual(job?.origin, {
    platform: "telegram",
    chat_id: "942906261",
    chat_name: "Markus Glucksberg",
    thread_id: null,
  });
  assert.deepEqual(job?.enabled_toolsets, ["terminal", "messaging"]);
  assert.ok(result.diagnostics.some((entry) => entry.includes("will deliver nightly reports to telegram:942906261")));
});

test("Hermes bridge mode still enables bridge plugin across common config yaml shapes", async () => {
  const cases = [
    "plugins:\n  enabled: []\n",
    "plugins:\n  enabled: [foo]\n",
    "plugins:\n  enabled:\n  - foo\n",
    "plugins: { enabled: [] }\n",
  ];

  for (const source of cases) {
    const root = await mkdtemp(join(tmpdir(), "cristalina-hermes-config-shape-"));
    const runtimeRoot = join(root, "hermes");
    const hermesConfigPath = join(runtimeRoot, "config.yaml");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(hermesConfigPath, source);

    await installRuntime({
      runtime: "hermes",
      configPath: join(root, "config.json"),
      nonInteractive: true,
      runtimeRoot,
      integrationMode: "bridge",
    });

    const updated = await readFile(hermesConfigPath, "utf8");
    assert.match(updated, /^plugins:\n/m);
    assert.match(updated, /^  enabled:\n/m);
    assert.match(updated, /^  - cristalina-bridge$/m);
    assert.equal([...updated.matchAll(/^  enabled:/gm)].length, 1);
  }
});

test("Hermes provider mode disables existing bridge plugin while preserving other plugins", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-hermes-provider-config-"));
  const runtimeRoot = join(root, "hermes");
  const hermesConfigPath = join(runtimeRoot, "config.yaml");
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(hermesConfigPath, "plugins:\n  enabled:\n  - foo\n  - cristalina-bridge\nmemory:\n  provider: ''\n");

  await installRuntime({
    runtime: "hermes",
    configPath: join(root, "config.json"),
    nonInteractive: true,
    runtimeRoot,
  });

  const updated = await readFile(hermesConfigPath, "utf8");
  assert.match(updated, /^memory:\n  provider: cristalina$/m);
  assert.match(updated, /^  - foo$/m);
  assert.doesNotMatch(updated, /cristalina-bridge/);
});

test("Hermes provider mode normalizes inline plugin and memory config without duplicate keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-hermes-provider-inline-config-"));
  const runtimeRoot = join(root, "hermes");
  const hermesConfigPath = join(runtimeRoot, "config.yaml");
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(hermesConfigPath, "plugins: { enabled: [foo, cristalina-bridge] }\nmemory: { provider: honcho, ttl: 30 }\n");

  await installRuntime({
    runtime: "hermes",
    configPath: join(root, "config.json"),
    nonInteractive: true,
    runtimeRoot,
  });

  const updated = await readFile(hermesConfigPath, "utf8");
  assert.equal([...updated.matchAll(/^plugins:/gm)].length, 1);
  assert.equal([...updated.matchAll(/^memory:/gm)].length, 1);
  assert.match(updated, /^plugins:\n  enabled:\n  - foo$/m);
  assert.match(updated, /^memory:\n  provider: cristalina\n  ttl: 30$/m);
  assert.doesNotMatch(updated, /cristalina-bridge/);
});

test("Hermes one-liner documents the public installer shape", () => {
  assert.equal(
    hermesInstallOneLiner("https://example.invalid/install-hermes.sh"),
    "curl -fsSL https://example.invalid/install-hermes.sh | sh",
  );
});

test("installer defaults metadata under runtimeRoot when metadata path is not explicit", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-runtime-root-install-"));
  const runtimeRoot = join(root, "openclaw-runtime");
  const configPath = join(root, "config.json");

  const result = await installRuntime({
    runtime: "openclaw",
    configPath,
    runtimeRoot,
    nonInteractive: true,
  });

  assert.equal(result.metadata_path, join(runtimeRoot, ".cristalina-v4", "runtime-openclaw.json"));
  assert.equal(result.hook_path, join(runtimeRoot, ".cristalina-v4", "hooks", "openclaw-cristalina-hook.json"));
  const metadata = JSON.parse(await readFile(result.metadata_path, "utf8")) as {
    runtime_root: string;
    hook_script_path: string;
  };
  assert.equal(metadata.runtime_root, runtimeRoot);
  assert.equal(metadata.hook_script_path, result.hook_script_path);
});

test("installer does not nest store root when config lives under .cristalina-v4", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-config-store-root-"));
  const configDir = join(root, ".cristalina-v4");
  const configPath = join(configDir, "config.json");

  const result = await installRuntime({
    runtime: "hermes",
    configPath,
    runtimeRoot: join(root, "hermes-runtime"),
    nonInteractive: true,
  });

  const config = JSON.parse(await readFile(configPath, "utf8")) as { store_root: string };
  assert.equal(config.store_root, configDir);
  assert.equal(result.store_root, configDir);
});

test("installer repairs executable mode when hook script already exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-hook-mode-repair-"));
  const runtimeRoot = join(root, "openclaw-runtime");
  const hookScriptPath = join(runtimeRoot, ".cristalina-v4", "hooks", "cristalina-bridge-event.sh");
  const configPath = join(root, "config.json");

  await installRuntime({
    runtime: "openclaw",
    configPath,
    runtimeRoot,
    nonInteractive: true,
  });
  await mkdir(dirname(hookScriptPath), { recursive: true });
  await writeFile(hookScriptPath, "#!/bin/sh\nexit 99\n", { mode: 0o644 });
  await chmod(hookScriptPath, 0o644);

  const result = await installRuntime({
    runtime: "openclaw",
    configPath,
    runtimeRoot,
    nonInteractive: true,
  });
  const mode = (await stat(result.hook_script_path)).mode & 0o777;
  assert.equal(mode, 0o755);
  assert.match(await readFile(result.hook_script_path, "utf8"), /bridge event/);
});
