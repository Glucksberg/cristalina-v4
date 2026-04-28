import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type CristalinaSessionThreadStrategy = "reuse_current" | "new_per_runtime_launch" | "prompt_per_launch";
export type CristalinaProjectionConsistencyPreference = "allow_mixed_state" | "require_checkpoint_consistent";
export type CristalinaReviewBehavior = "list_only" | "prompt_in_cli" | "expose_to_runtime_projection";
export type CristalinaCheckpointResumeBehavior = "off" | "record_checkpoints" | "compile_session_packs";
export type CristalinaDiagnosticsVerbosity = "normal" | "verbose";

export interface CristalinaRuntimeBindingConfig {
  runtime_instance_ref?: string;
  default_session_ref?: string;
  default_thread_ref?: string;
}

export interface CristalinaConfig {
  schema_version?: 1;
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
  session_thread_strategy?: CristalinaSessionThreadStrategy;
  projection_consistency?: CristalinaProjectionConsistencyPreference;
  review_behavior?: CristalinaReviewBehavior;
  checkpoint_resume?: CristalinaCheckpointResumeBehavior;
  diagnostics_verbosity?: CristalinaDiagnosticsVerbosity;
  hooks?: {
    openclaw?: {
      install_metadata_path?: string;
      runtime_hook_path?: string;
    };
    hermes?: {
      install_metadata_path?: string;
      runtime_hook_path?: string;
    };
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

export function defaultProjectConfigPath(cwd = process.cwd()): string {
  return join(cwd, ".cristalina-v4", "config.json");
}

export function buildDefaultCristalinaConfig(input: {
  storeRoot?: string;
  ownerIdentityRef?: string;
  agentIdentityRef?: string;
  operatorRef?: string;
  principalKind?: "owner" | "participant" | "system";
  principalActorRef?: string;
  openclawRuntimeRef?: string;
  hermesRuntimeRef?: string;
} = {}): CristalinaConfig {
  const ownerIdentityRef = input.ownerIdentityRef ?? "actor_owner_local_001";
  const agentIdentityRef = input.agentIdentityRef ?? "actor_agent_local_001";
  const principalKind = input.principalKind ?? "owner";
  const principalActorRef = input.principalActorRef ?? (principalKind === "owner" ? ownerIdentityRef : input.operatorRef ?? "actor_operator_local_001");

  return {
    schema_version: 1,
    store_root: input.storeRoot ?? ".cristalina-v4",
    operator_ref: input.operatorRef ?? principalActorRef,
    owner_identity_ref: ownerIdentityRef,
    agent_identity_ref: agentIdentityRef,
    authenticated_principal: {
      kind: principalKind,
      actor_ref: principalActorRef,
      ...(principalKind === "system" ? { system_scope: "cristalina-local-config" } : {}),
    },
    runtimes: {
      openclaw: {
        runtime_instance_ref: input.openclawRuntimeRef ?? "runtime_openclaw_local_001",
      },
      hermes: {
        runtime_instance_ref: input.hermesRuntimeRef ?? "runtime_hermes_local_001",
      },
    },
    session_thread_strategy: "prompt_per_launch",
    projection_consistency: "allow_mixed_state",
    review_behavior: "list_only",
    checkpoint_resume: "record_checkpoints",
    diagnostics_verbosity: "normal",
    hooks: {
      openclaw: {
        install_metadata_path: ".cristalina-v4/runtime-openclaw.json",
      },
      hermes: {
        install_metadata_path: ".cristalina-v4/runtime-hermes.json",
      },
    },
  };
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

  if (source.schema_version === undefined) {
    diagnostics.push("schema_version is missing; assuming legacy config shape");
  } else if (source.schema_version !== 1) {
    diagnostics.push("schema_version must be 1");
  } else {
    config.schema_version = 1;
  }

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

  const enumFields = {
    session_thread_strategy: ["reuse_current", "new_per_runtime_launch", "prompt_per_launch"],
    projection_consistency: ["allow_mixed_state", "require_checkpoint_consistent"],
    review_behavior: ["list_only", "prompt_in_cli", "expose_to_runtime_projection"],
    checkpoint_resume: ["off", "record_checkpoints", "compile_session_packs"],
    diagnostics_verbosity: ["normal", "verbose"],
  } as const;

  for (const [key, allowed] of Object.entries(enumFields)) {
    const entry = source[key];
    if (entry === undefined) continue;
    if (typeof entry !== "string" || !allowed.includes(entry as never)) {
      diagnostics.push(`${key} must be one of ${allowed.join(", ")}`);
      continue;
    }
    (config as Record<string, unknown>)[key] = entry;
  }

  if (source.hooks !== undefined) {
    const hooks = source.hooks;
    if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) {
      diagnostics.push("hooks must be an object");
    } else {
      config.hooks = {};
      for (const runtime of ["openclaw", "hermes"] as const) {
        const entry = (hooks as Record<string, unknown>)[runtime];
        if (entry === undefined) continue;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          diagnostics.push(`hooks.${runtime} must be an object`);
          continue;
        }
        const record = entry as Record<string, unknown>;
        config.hooks[runtime] = {
          ...(typeof record.install_metadata_path === "string" ? { install_metadata_path: record.install_metadata_path } : {}),
          ...(typeof record.runtime_hook_path === "string" ? { runtime_hook_path: record.runtime_hook_path } : {}),
        };
      }
    }
  }

  return config;
}

export async function saveCristalinaConfig(path: string, config: CristalinaConfig): Promise<string> {
  const resolved = resolve(path);
  const diagnostics: string[] = [];
  validateConfigObject(config, diagnostics);
  const blocking = diagnostics.filter((entry) => !entry.includes("assuming legacy config shape"));
  if (blocking.length > 0) {
    throw new Error(`Cannot save invalid Cristalina config: ${blocking.join("; ")}`);
  }

  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(config, null, 2)}\n`);
  return resolved;
}
