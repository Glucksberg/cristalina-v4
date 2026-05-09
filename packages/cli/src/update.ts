import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { loadCristalinaConfig } from "./config.js";
import { installRuntime, loadInstallationRegistry, type RuntimeInstallResult } from "./installers.js";

const execFileAsync = promisify(execFile);

export interface RunCristalinaUpdateInput {
  repoRoot: string;
  configPath?: string;
  runtime?: "openclaw" | "hermes";
  runtimeRoot?: string;
  integrationMode?: "provider" | "bridge" | "both";
  skipSourceUpdate?: boolean;
  skipBuild?: boolean;
  skipInstall?: boolean;
}

export interface RunCristalinaUpdateResult {
  schema_version: 1;
  status: "updated";
  repo_root: string;
  config_path: string | null;
  source_update: {
    skipped: boolean;
    git_pull?: string;
    pnpm_install?: string;
    build?: string;
  };
  installations: RuntimeInstallResult[];
  diagnostics: string[];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command: string, args: string[], cwd: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 1024 * 1024 * 8,
  });
  return `${stdout}${stderr}`.trim();
}

async function repoHasGitRoot(repoRoot: string): Promise<boolean> {
  return pathExists(resolve(repoRoot, ".git"));
}

async function assertGitClean(repoRoot: string): Promise<void> {
  const status = await runCommand("git", ["status", "--porcelain"], repoRoot);
  if (status.trim()) {
    throw new Error("cristalina update requires a clean checkout before pulling upstream changes");
  }
}

async function resolveConfigPath(configPath: string | undefined): Promise<string | null> {
  const loaded = await loadCristalinaConfig({ configPath });
  return loaded.path;
}

function targetInstallations(input: {
  configPath: string;
  runtime?: "openclaw" | "hermes";
  runtimeRoot?: string;
  integrationMode?: "provider" | "bridge" | "both";
  registry: Awaited<ReturnType<typeof loadInstallationRegistry>>;
}): Array<{
  runtime: "openclaw" | "hermes";
  runtimeRoot?: string;
  integrationMode?: "provider" | "bridge" | "both";
}> {
  if (input.runtime) {
    const registered = input.registry?.installations.find((entry) => entry.runtime === input.runtime);
    const runtimeRoot = input.runtimeRoot ?? registered?.runtime_root ?? undefined;
    if (input.runtime === "hermes" && !runtimeRoot) {
      throw new Error("cristalina update --runtime hermes requires --runtime-root for the first update, or a previous installation registry");
    }
    return [{
      runtime: input.runtime,
      runtimeRoot,
      integrationMode: input.integrationMode ?? registered?.integration_mode,
    }];
  }

  const registered = input.registry?.installations ?? [];
  if (registered.length === 0) {
    throw new Error("cristalina update could not find an installation registry; pass --runtime and --runtime-root once to register the installation");
  }
  return registered.map((entry) => ({
    runtime: entry.runtime,
    runtimeRoot: entry.runtime_root ?? undefined,
    integrationMode: input.integrationMode ?? entry.integration_mode,
  }));
}

export async function runCristalinaUpdate(input: RunCristalinaUpdateInput): Promise<RunCristalinaUpdateResult> {
  const repoRoot = resolve(input.repoRoot);
  const diagnostics: string[] = [];
  const sourceUpdate: RunCristalinaUpdateResult["source_update"] = { skipped: Boolean(input.skipSourceUpdate) };

  if (!input.skipSourceUpdate) {
    if (await repoHasGitRoot(repoRoot)) {
      await assertGitClean(repoRoot);
      sourceUpdate.git_pull = await runCommand("git", ["pull", "--ff-only"], repoRoot);
    } else {
      diagnostics.push("No .git directory found; skipped upstream git pull.");
      sourceUpdate.skipped = true;
    }
    sourceUpdate.pnpm_install = await runCommand("pnpm", ["install"], repoRoot);
  }

  if (!input.skipBuild) {
    sourceUpdate.build = await runCommand("pnpm", ["--filter", "@cristalina-v4/cli", "build"], repoRoot);
  }

  const configPath = await resolveConfigPath(input.configPath);
  const installations: RuntimeInstallResult[] = [];
  if (!input.skipInstall) {
    if (!configPath) {
      throw new Error("cristalina update requires an existing config; run install first or pass --config");
    }
    const registry = await loadInstallationRegistry(configPath);
    for (const target of targetInstallations({
      configPath,
      runtime: input.runtime,
      runtimeRoot: input.runtimeRoot,
      integrationMode: input.integrationMode,
      registry,
    })) {
      installations.push(await installRuntime({
        runtime: target.runtime,
        configPath,
        nonInteractive: true,
        runtimeRoot: target.runtimeRoot,
        integrationMode: target.integrationMode,
      }));
    }
  } else if (input.configPath) {
    diagnostics.push(`Skipped runtime reinstall for config ${resolve(input.configPath)}`);
  }

  return {
    schema_version: 1,
    status: "updated",
    repo_root: repoRoot,
    config_path: configPath,
    source_update: sourceUpdate,
    installations,
    diagnostics,
  };
}
