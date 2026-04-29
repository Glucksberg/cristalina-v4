import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";

import { loadCristalinaConfig, resolveStoreRoot } from "./config.js";

type RuntimeName = "openclaw" | "hermes";

export interface RuntimePreflightInput {
  configPath?: string;
  openclawRoot?: string;
  hermesRoot?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

export interface RuntimePreflightCommandStatus {
  command: string;
  path: string | null;
  found: boolean;
}

export interface RuntimePreflightRootStatus {
  runtime: RuntimeName;
  path: string | null;
  exists: boolean;
  hook_descriptor_path: string | null;
  hook_script_path: string | null;
  install_command: string | null;
  missing_reason: string | null;
}

export interface RuntimePreflightReport {
  schema_version: 1;
  status: "ready_for_hook_install" | "blocked";
  config: {
    path: string | null;
    valid: boolean;
    store_root: string | null;
    diagnostics: string[];
  };
  commands: {
    node: RuntimePreflightCommandStatus;
    pnpm: RuntimePreflightCommandStatus;
    openclaw: RuntimePreflightCommandStatus;
    hermes: RuntimePreflightCommandStatus;
    cristalina: RuntimePreflightCommandStatus;
  };
  runtime_roots: {
    openclaw: RuntimePreflightRootStatus;
    hermes: RuntimePreflightRootStatus;
  };
  fixture_contract: {
    event_contract: "cristalina.runtime_bridge_event.v1";
    event_path_env: "CRISTALINA_EVENT_PATH";
    examples: string[];
  };
  next_actions: string[];
}

async function pathExists(path: string): Promise<boolean> {
  await access(path).then(() => undefined);
  return true;
}

async function executableExists(path: string): Promise<boolean> {
  await access(path, constants.X_OK).then(() => undefined);
  return true;
}

async function findExecutable(command: string, env: NodeJS.ProcessEnv): Promise<RuntimePreflightCommandStatus> {
  const paths = (env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const entry of paths) {
    const candidate = join(entry, command);
    if (await executableExists(candidate).catch(() => false)) {
      return { command, path: candidate, found: true };
    }
  }
  return { command, path: null, found: false };
}

async function runtimeRootStatus(input: {
  runtime: RuntimeName;
  root?: string;
  configPath?: string;
  cwd: string;
}): Promise<RuntimePreflightRootStatus> {
  const path = input.root ? resolve(input.cwd, input.root) : null;
  const exists = path ? await pathExists(path).catch(() => false) : false;
  return {
    runtime: input.runtime,
    path,
    exists,
    hook_descriptor_path: path ? join(path, ".cristalina-v4", "hooks", `${input.runtime}-cristalina-hook.json`) : null,
    hook_script_path: path ? join(path, ".cristalina-v4", "hooks", "cristalina-bridge-event.sh") : null,
    install_command: path
      ? `pnpm cristalina install ${input.runtime} --non-interactive --runtime-root ${path}${input.configPath ? ` --config ${resolve(input.cwd, input.configPath)}` : ""}`
      : null,
    missing_reason: path
      ? exists ? null : "runtime root path does not exist yet"
      : `provide --${input.runtime}-root or CRISTALINA_${input.runtime.toUpperCase()}_ROOT`,
  };
}

export async function runRuntimePreflight(input: RuntimePreflightInput = {}): Promise<RuntimePreflightReport> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const loaded = await loadCristalinaConfig({ configPath: input.configPath, cwd });
  const storeRoot = resolveStoreRoot(loaded.config, undefined, cwd);
  const installConfigPath = input.configPath ?? loaded.path ?? undefined;
  const openclawRoot = input.openclawRoot ?? env.CRISTALINA_OPENCLAW_ROOT;
  const hermesRoot = input.hermesRoot ?? env.CRISTALINA_HERMES_ROOT;
  const [node, pnpm, openclaw, hermes, cristalina, openclawRootStatus, hermesRootStatus] = await Promise.all([
    findExecutable("node", env),
    findExecutable("pnpm", env),
    findExecutable("openclaw", env),
    findExecutable("hermes", env),
    findExecutable("cristalina", env),
    runtimeRootStatus({ runtime: "openclaw", root: openclawRoot, configPath: installConfigPath, cwd }),
    runtimeRootStatus({ runtime: "hermes", root: hermesRoot, configPath: installConfigPath, cwd }),
  ]);

  const nextActions: string[] = [];
  if (loaded.diagnostics.length > 0) {
    nextActions.push("create or select a Cristalina config with `cristalina config --init --non-interactive --config <path>`");
  }
  if (!pnpm.found) {
    nextActions.push("install pnpm or run from an environment where pnpm is available");
  }
  for (const root of [openclawRootStatus, hermesRootStatus]) {
    if (!root.path) {
      nextActions.push(`provide ${root.runtime} runtime root with --${root.runtime}-root or CRISTALINA_${root.runtime.toUpperCase()}_ROOT`);
    } else if (!root.exists) {
      nextActions.push(`create or select existing ${root.runtime} runtime root: ${root.path}`);
    } else if (root.install_command) {
      nextActions.push(root.install_command);
    }
  }
  if (!openclaw.found) {
    nextActions.push("OpenClaw command was not found on PATH; this is acceptable for root-only hook install, but live runtime tests still need an OpenClaw session to emit events");
  }
  if (!hermes.found) {
    nextActions.push("Hermes command was not found on PATH; this is acceptable for root-only hook install, but live runtime tests still need a Hermes session to emit events");
  }

  const ready = loaded.diagnostics.length === 0 &&
    pnpm.found &&
    Boolean(openclawRootStatus.path && openclawRootStatus.exists) &&
    Boolean(hermesRootStatus.path && hermesRootStatus.exists);

  return {
    schema_version: 1,
    status: ready ? "ready_for_hook_install" : "blocked",
    config: {
      path: loaded.path,
      valid: loaded.diagnostics.length === 0,
      store_root: storeRoot,
      diagnostics: loaded.diagnostics,
    },
    commands: {
      node,
      pnpm,
      openclaw,
      hermes,
      cristalina,
    },
    runtime_roots: {
      openclaw: openclawRootStatus,
      hermes: hermesRootStatus,
    },
    fixture_contract: {
      event_contract: "cristalina.runtime_bridge_event.v1",
      event_path_env: "CRISTALINA_EVENT_PATH",
      examples: [
        "examples/runtime-wiring/events/openclaw-preference.json",
        "examples/runtime-wiring/events/hermes-preference.json",
        "examples/runtime-wiring/events/hermes-diagnostic.json",
      ],
    },
    next_actions: nextActions,
  };
}
