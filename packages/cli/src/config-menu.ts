import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  buildDefaultCristalinaConfig,
  defaultProjectConfigPath,
  saveCristalinaConfig,
  type CristalinaConfig,
} from "./config.js";

export interface ConfigMenuInput {
  configPath?: string;
  nonInteractive?: boolean;
  storeRoot?: string;
  ownerIdentityRef?: string;
  agentIdentityRef?: string;
  operatorRef?: string;
  principalKind?: "owner" | "participant" | "system";
  principalActorRef?: string;
  openclawRuntimeRef?: string;
  hermesRuntimeRef?: string;
}

export interface ConfigMenuResult {
  path: string;
  config: CristalinaConfig;
}

async function ask(question: string, defaultValue: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} (${defaultValue}): `);
    return answer.trim() || defaultValue;
  } finally {
    rl.close();
  }
}

export async function runConfigMenu(inputOptions: ConfigMenuInput = {}): Promise<ConfigMenuResult> {
  const configPath = inputOptions.configPath ?? defaultProjectConfigPath();
  const defaults = buildDefaultCristalinaConfig(inputOptions);

  if (inputOptions.nonInteractive || !process.stdin.isTTY) {
    const path = await saveCristalinaConfig(configPath, defaults);
    return { path, config: defaults };
  }

  const storeRoot = await ask("Store root", defaults.store_root!);
  const ownerIdentityRef = await ask("Owner identity ref", defaults.owner_identity_ref!);
  const agentIdentityRef = await ask("Agent identity ref", defaults.agent_identity_ref!);
  const operatorRef = await ask("Operator ref", defaults.operator_ref!);
  const openclawRuntimeRef = await ask("OpenClaw runtime instance ref", defaults.runtimes!.openclaw!.runtime_instance_ref!);
  const hermesRuntimeRef = await ask("Hermes runtime instance ref", defaults.runtimes!.hermes!.runtime_instance_ref!);

  const config = buildDefaultCristalinaConfig({
    ...inputOptions,
    storeRoot,
    ownerIdentityRef,
    agentIdentityRef,
    operatorRef,
    principalKind: inputOptions.principalKind ?? "owner",
    principalActorRef: inputOptions.principalActorRef ?? ownerIdentityRef,
    openclawRuntimeRef,
    hermesRuntimeRef,
  });
  const path = await saveCristalinaConfig(configPath, config);
  return { path, config };
}
