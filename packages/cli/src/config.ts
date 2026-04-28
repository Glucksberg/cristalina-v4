import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface CristalinaRuntimeBindingConfig {
  runtime_instance_ref?: string;
  default_session_ref?: string;
  default_thread_ref?: string;
}

export interface CristalinaConfig {
  store_root?: string;
  operator_ref?: string;
  owner_identity_ref?: string;
  agent_identity_ref?: string;
  authenticated_principal?: {
    kind: "owner" | "participant" | "system";
    actor_ref?: string;
    system_scope?: string;
  };
  runtimes?: {
    openclaw?: CristalinaRuntimeBindingConfig;
    hermes?: CristalinaRuntimeBindingConfig;
  };
}

export interface LoadedCristalinaConfig {
  path: string | null;
  config: CristalinaConfig;
  diagnostics: string[];
}

async function pathExists(path: string): Promise<boolean> {
  await access(path).then(() => undefined);
  return true;
}

export function candidateConfigPaths(cwd = process.cwd(), home = homedir()): string[] {
  return [
    join(cwd, ".cristalina-v4", "config.json"),
    join(home, ".cristalina-v4", "config.json"),
  ];
}

export async function loadCristalinaConfig(input: {
  configPath?: string;
  cwd?: string;
  home?: string;
} = {}): Promise<LoadedCristalinaConfig> {
  const diagnostics: string[] = [];
  const candidates = input.configPath
    ? [resolve(input.cwd ?? process.cwd(), input.configPath)]
    : candidateConfigPaths(input.cwd, input.home);

  for (const path of candidates) {
    const exists = await pathExists(path).catch(() => false);
    if (!exists) continue;

    const source = await readFile(path, "utf8");
    const parsed = JSON.parse(source) as unknown;
    const config = validateConfigObject(parsed, diagnostics);
    return { path, config, diagnostics };
  }

  diagnostics.push(`No Cristalina config found at ${candidates.join(" or ")}`);
  return { path: null, config: {}, diagnostics };
}

export function resolveStoreRoot(config: CristalinaConfig, override?: string, cwd = process.cwd()): string | null {
  const candidate = override ?? config.store_root;
  return candidate ? resolve(cwd, candidate) : null;
}

export function validateConfigObject(value: unknown, diagnostics: string[] = []): CristalinaConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    diagnostics.push("Config must be a JSON object");
    return {};
  }

  const source = value as Record<string, unknown>;
  const config: CristalinaConfig = {};

  for (const key of ["store_root", "operator_ref", "owner_identity_ref", "agent_identity_ref"] as const) {
    const entry = source[key];
    if (entry === undefined) continue;
    if (typeof entry !== "string" || entry.trim().length === 0) {
      diagnostics.push(`${key} must be a non-empty string`);
      continue;
    }
    config[key] = entry;
  }

  if (source.authenticated_principal !== undefined) {
    const principal = source.authenticated_principal;
    if (!principal || typeof principal !== "object" || Array.isArray(principal)) {
      diagnostics.push("authenticated_principal must be an object");
    } else {
      const record = principal as Record<string, unknown>;
      if (record.kind !== "owner" && record.kind !== "participant" && record.kind !== "system") {
        diagnostics.push("authenticated_principal.kind must be owner, participant, or system");
      } else {
        config.authenticated_principal = {
          kind: record.kind,
          ...(typeof record.actor_ref === "string" ? { actor_ref: record.actor_ref } : {}),
          ...(typeof record.system_scope === "string" ? { system_scope: record.system_scope } : {}),
        };
      }
    }
  }

  if (source.runtimes !== undefined) {
    const runtimes = source.runtimes;
    if (!runtimes || typeof runtimes !== "object" || Array.isArray(runtimes)) {
      diagnostics.push("runtimes must be an object");
    } else {
      config.runtimes = {};
      for (const runtime of ["openclaw", "hermes"] as const) {
        const entry = (runtimes as Record<string, unknown>)[runtime];
        if (entry === undefined) continue;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          diagnostics.push(`runtimes.${runtime} must be an object`);
          continue;
        }
        const record = entry as Record<string, unknown>;
        config.runtimes[runtime] = {
          ...(typeof record.runtime_instance_ref === "string" ? { runtime_instance_ref: record.runtime_instance_ref } : {}),
          ...(typeof record.default_session_ref === "string" ? { default_session_ref: record.default_session_ref } : {}),
          ...(typeof record.default_thread_ref === "string" ? { default_thread_ref: record.default_thread_ref } : {}),
        };
      }
    }
  }

  return config;
}
