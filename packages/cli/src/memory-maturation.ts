import { readFile } from "node:fs/promises";

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

function envFlag(name: string): boolean {
  const value = process.env[name];
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
}

function evidenceForRemoteLlm(evidence: MemoryMaturationEvidencePackage): MemoryMaturationEvidencePackage {
  if (envFlag("CRISTALINA_MEMORY_MATURATION_ALLOW_FULL_SUMMARY")) {
    return evidence;
  }
  return {
    ...evidence,
    observations: evidence.observations.map((observation) => ({
      ...observation,
      full_summary: "[redacted for remote LLM request; use summary_preview and support_refs]",
    })),
    instructions: [
      ...evidence.instructions,
      "Remote LLM payload is redacted by default; use summary_preview and support_refs instead of full private transcripts.",
    ],
  };
}

function extractJsonObject(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as unknown;
    }
    throw new Error("LLM response did not contain a JSON object");
  }
}

async function requestLlmOutput(evidence: MemoryMaturationEvidencePackage): Promise<unknown> {
  if (!envFlag("CRISTALINA_MEMORY_MATURATION_RUNTIME_MANAGED")) {
    throw new Error("memory mature remote LLM calls require runtime-managed execution; use the installed runtime job or --llm-output for offline/local review");
  }
  const apiKey = process.env.CRISTALINA_MEMORY_MATURATION_API_KEY ??
    process.env.CRISTALINA_LLM_API_KEY ??
    process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.CRISTALINA_MEMORY_MATURATION_BASE_URL ??
    process.env.CRISTALINA_LLM_BASE_URL ??
    "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.CRISTALINA_MEMORY_MATURATION_MODEL ??
    process.env.CRISTALINA_LLM_MODEL ??
    "gpt-4.1-mini";

  if (!apiKey) {
    throw new Error("memory mature requires CRISTALINA_MEMORY_MATURATION_API_KEY, CRISTALINA_LLM_API_KEY, OPENAI_API_KEY, or --llm-output");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return strict JSON only. You propose structured memory candidates; Cristalina validates and governs them.",
        },
        {
          role: "user",
          content: buildPrompt(evidenceForRemoteLlm(evidence)),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`memory maturation LLM request failed ${response.status}: ${body.slice(0, 1000)}`);
  }
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("memory maturation LLM response did not include choices[0].message.content");
  }
  return extractJsonObject(content);
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
  const llmOutput = input.llmOutputPath
    ? JSON.parse(await readFile(input.llmOutputPath, "utf8")) as unknown
    : await requestLlmOutput(evidence);

  return runMemoryMaturation({
    rootDir: storeRoot,
    runtime: input.runtime,
    llmOutput,
    write: input.write,
    maxItems: input.maxItems,
    authenticated_principal: principalFromConfig(input.config),
  });
}
