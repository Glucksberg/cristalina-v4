import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  prepareMemoryMaturationEvidence,
  runMemoryMaturation,
  type AuthenticatedPrincipal,
  type MemoryMaturationEvidencePackage,
} from "@cristalina-v4/core";

import type { CristalinaConfig } from "./config.js";
import { resolveStoreRoot } from "./config.js";

type RuntimeName = "openclaw" | "hermes";

export interface RunCliMemoryMaturationInput {
  config: CristalinaConfig;
  storeRootOverride?: string;
  runtime: RuntimeName;
  write?: boolean;
  maxItems?: number;
  llmOutputPath?: string;
}

export interface PrepareCliMemoryMaturationEvidenceInput {
  config: CristalinaConfig;
  storeRootOverride?: string;
  runtime: RuntimeName;
  maxItems?: number;
  outputPath: string;
}

function principalFromConfig(config: CristalinaConfig): AuthenticatedPrincipal {
  const principal = config.authenticated_principal;
  if ((principal?.kind === "owner" || principal?.kind === "participant") && principal.actor_ref?.trim()) {
    return { kind: principal.kind, actor_ref: principal.actor_ref };
  }
  if (principal?.kind === "system" && principal.actor_ref?.trim() && principal.system_scope?.trim()) {
    return { kind: "system", actor_ref: principal.actor_ref, system_scope: principal.system_scope };
  }
  return {
    kind: "system",
    actor_ref: "system:cristalina-memory-maturation",
    system_scope: "cristalina-memory-maturation",
  };
}

function buildPrompt(evidence: MemoryMaturationEvidencePackage): string {
  return [
    "You are Cristalina's source-neutral semantic maturation compiler.",
    "Return strict JSON only with a top-level candidates array.",
    "Each candidate must contain: statement, memory_kind, epistemic_state, semantic_slot, subject_authority_role, confidence, risk, support_refs, recommended_dispositions, rationale.",
    "Use only existing Cristalina values:",
    "memory_kind: fact, belief, preference, constraint, goal, procedure, value, identity_trait.",
    "epistemic_state: observed, inferred, hypothesized, confirmed, disputed.",
    "subject_authority_role: owner, agent, participant, external.",
    "confidence/risk: low, medium, high.",
    "recommended_dispositions: evidence_only, runtime_only, world_update, wiki_update, proposal_for_canon, queued_review, diagnostic_only.",
    "Do not create source-specific routes. Do not propose Cristalina code self-modification as product behavior.",
    "Use only support_refs that appear in the evidence package.",
    "",
    JSON.stringify(evidence, null, 2),
  ].join("\n");
}

export async function prepareCliMemoryMaturationEvidence(input: PrepareCliMemoryMaturationEvidenceInput) {
  const storeRoot = resolveStoreRoot(input.config, input.storeRootOverride);
  if (!storeRoot) {
    throw new Error("memory mature requires config.store_root");
  }
  const evidence = await prepareMemoryMaturationEvidence({
    rootDir: storeRoot,
    runtime: input.runtime,
    maxItems: input.maxItems,
  });
  const payload = {
    evidence,
    prompt: buildPrompt(evidence),
  };
  await mkdir(dirname(input.outputPath), { recursive: true });
  await writeFile(input.outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export async function runCliMemoryMaturation(input: RunCliMemoryMaturationInput) {
  const storeRoot = resolveStoreRoot(input.config, input.storeRootOverride);
  if (!storeRoot) {
    throw new Error("memory mature requires config.store_root");
  }
  const evidence = await prepareMemoryMaturationEvidence({
    rootDir: storeRoot,
    runtime: input.runtime,
    maxItems: input.maxItems,
  });
  if (!input.llmOutputPath) {
    throw new Error("memory mature requires --llm-output; installed Hermes jobs must use the Hermes runtime model harness to produce the JSON candidates");
  }
  const llmOutput = JSON.parse(await readFile(input.llmOutputPath, "utf8")) as unknown;

  return runMemoryMaturation({
    rootDir: storeRoot,
    runtime: input.runtime,
    llmOutput,
    write: input.write,
    maxItems: input.maxItems,
    authenticated_principal: principalFromConfig(input.config),
  });
}
