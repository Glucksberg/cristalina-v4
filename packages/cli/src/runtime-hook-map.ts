import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

type RuntimeName = "openclaw" | "hermes";

export interface RuntimeHookMapInput {
  runtime: RuntimeName;
  runtimeRoot: string;
  targetConfigPath?: string;
  mapPath?: string;
  cwd?: string;
}

export interface RuntimeHookMapReport {
  schema_version: 1;
  runtime: RuntimeName;
  status: "mapped" | "ready_for_target" | "blocked";
  runtime_root: string;
  hook_descriptor_path: string;
  hook_descriptor_found: boolean;
  hook_script_path: string;
  hook_script_executable: boolean;
  target_config_path: string | null;
  map_path: string;
  mapping_written: boolean;
  runtime_config_patch: {
    schema_version: 1;
    runtime: RuntimeName;
    hook_contract: string | null;
    event_contract: string | null;
    descriptor_path: string;
    script_path: string;
    event_path_env: string;
    invocation: {
      command: string;
      env: Record<string, string>;
    };
    target_config_path: string | null;
    authority_note: string;
  } | null;
  diagnostics: string[];
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

function stringField(source: unknown, field: string): string | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const value = (source as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

export async function mapRuntimeHook(input: RuntimeHookMapInput): Promise<RuntimeHookMapReport> {
  const cwd = input.cwd ?? process.cwd();
  const runtimeRoot = resolve(cwd, input.runtimeRoot);
  const hookDescriptorPath = join(runtimeRoot, ".cristalina-v4", "hooks", `${input.runtime}-cristalina-hook.json`);
  const hookScriptPath = join(runtimeRoot, ".cristalina-v4", "hooks", "cristalina-bridge-event.sh");
  const targetConfigPath = input.targetConfigPath ? resolve(cwd, input.targetConfigPath) : null;
  const mapPath = input.mapPath
    ? resolve(cwd, input.mapPath)
    : join(runtimeRoot, ".cristalina-v4", "hooks", `${input.runtime}-cristalina-hook-map.json`);
  const diagnostics: string[] = [];
  const nextActions: string[] = [];

  const rootFound = await pathExists(runtimeRoot).catch(() => false);
  if (!rootFound) {
    diagnostics.push(`Runtime root does not exist: ${runtimeRoot}`);
    nextActions.push(`select an existing ${input.runtime} runtime root with --runtime-root PATH`);
  }

  const hookDescriptorFound = await pathExists(hookDescriptorPath).catch(() => false);
  if (!hookDescriptorFound) {
    diagnostics.push(`Hook descriptor was not found: ${hookDescriptorPath}`);
    nextActions.push(`run \`cristalina install ${input.runtime} --runtime-root ${runtimeRoot}\` before mapping runtime config`);
  }

  const hookScriptExecutable = await executableExists(hookScriptPath).catch(() => false);
  if (!hookScriptExecutable) {
    diagnostics.push(`Hook script is missing or not executable: ${hookScriptPath}`);
    nextActions.push(`rerun \`cristalina install ${input.runtime} --runtime-root ${runtimeRoot}\` to repair the hook script`);
  }

  if (!targetConfigPath) {
    nextActions.push(`provide --target-config PATH once the real ${input.runtime} config file is known`);
  }

  let descriptor: unknown = null;
  let descriptorParsed = false;
  if (hookDescriptorFound) {
    try {
      descriptor = JSON.parse(await readFile(hookDescriptorPath, "utf8")) as unknown;
      descriptorParsed = true;
    } catch (error) {
      diagnostics.push(`Hook descriptor is not valid JSON: ${(error as Error).message}`);
    }
  }

  const hookContract = stringField(descriptor, "hook_contract");
  const eventContract = stringField(descriptor, "event_contract");
  const eventPathEnv = stringField(descriptor, "event_path_env") ?? "CRISTALINA_EVENT_PATH";
  const descriptorRuntime = stringField(descriptor, "runtime");
  if (descriptorParsed && descriptorRuntime !== input.runtime) {
    diagnostics.push(`Hook descriptor runtime must be ${input.runtime}`);
  }
  if (descriptorParsed && hookContract !== "cristalina.runtime_hook.v1") {
    diagnostics.push("Hook descriptor must declare hook_contract cristalina.runtime_hook.v1");
  }
  if (descriptorParsed && eventContract !== "cristalina.runtime_bridge_event.v1") {
    diagnostics.push("Hook descriptor must declare event_contract cristalina.runtime_bridge_event.v1");
  }

  const canWriteMap = hookDescriptorFound && hookScriptExecutable && diagnostics.length === 0;
  const runtimeConfigPatch = canWriteMap
    ? {
        schema_version: 1 as const,
        runtime: input.runtime,
        hook_contract: hookContract,
        event_contract: eventContract,
        descriptor_path: hookDescriptorPath,
        script_path: hookScriptPath,
        event_path_env: eventPathEnv,
        invocation: {
          command: hookScriptPath,
          env: {
            [eventPathEnv]: "<runtime-produced-event.json>",
          },
        },
        target_config_path: targetConfigPath,
        authority_note: "This hook mapping is operational config only; it does not grant owner authority or define memory truth.",
      }
    : null;

  let mappingWritten = false;
  if (runtimeConfigPatch) {
    await mkdir(dirname(mapPath), { recursive: true });
    await writeFile(mapPath, `${JSON.stringify(runtimeConfigPatch, null, 2)}\n`);
    mappingWritten = true;
  }

  const status = diagnostics.length > 0
    ? "blocked"
    : targetConfigPath ? "mapped" : "ready_for_target";

  return {
    schema_version: 1,
    runtime: input.runtime,
    status,
    runtime_root: runtimeRoot,
    hook_descriptor_path: hookDescriptorPath,
    hook_descriptor_found: hookDescriptorFound,
    hook_script_path: hookScriptPath,
    hook_script_executable: hookScriptExecutable,
    target_config_path: targetConfigPath,
    map_path: mapPath,
    mapping_written: mappingWritten,
    runtime_config_patch: runtimeConfigPatch,
    diagnostics,
    next_actions: status === "mapped"
      ? [
          `register ${hookScriptPath} in ${targetConfigPath}`,
          `ensure ${input.runtime} sets ${eventPathEnv} to an event JSON file matching cristalina.runtime_bridge_event.v1 before invoking the script`,
          "run a live runtime event and verify it with `cristalina status --config <path>`",
        ]
      : nextActions,
  };
}
