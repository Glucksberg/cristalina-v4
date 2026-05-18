import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  createStoreManifest,
  parseStoreManifestYaml,
  serializeStoreManifestYaml,
  STORAGE_LAYOUT,
  type ProjectionRuntimeSummary,
} from "@cristalina-v4/core";
import {
  listOpenClawConversationPreferenceOwnerRatificationQueue,
  listOpenClawProjectionRuntimeViews,
} from "@cristalina-v4/openclaw-adapter";
import {
  listHermesConversationPreferenceOwnerRatificationQueue,
  listHermesProjectionRuntimeViews,
} from "@cristalina-v4/hermes-adapter";

import type { CristalinaConfig } from "./config.js";

export interface RuntimeBridgeStatus {
  store_root: string | null;
  store_manifest_found: boolean;
  config_valid: boolean;
  diagnostics: string[];
  health: RuntimeBridgeHealth;
  projections: {
    openclaw: ProjectionRuntimeSummary[];
    hermes: ProjectionRuntimeSummary[];
  };
  pending_owner_reviews: {
    openclaw: number;
    hermes: number;
  };
}

export type RuntimeBridgeHealthState = "ok" | "attention" | "fail";

export interface RuntimeBridgeHealthCheck {
  status: RuntimeBridgeHealthState;
  checked_at: string;
  source: string;
  diagnostics: string[];
  metrics?: Record<string, number | null>;
  note?: string;
}

export interface RuntimeBridgeHealth {
  overall: RuntimeBridgeHealthState;
  checked_at: string;
  config: RuntimeBridgeHealthCheck;
  store: RuntimeBridgeHealthCheck;
  projections: RuntimeBridgeHealthCheck;
  owner_reviews: RuntimeBridgeHealthCheck;
}

async function exists(path: string): Promise<boolean> {
  await access(path).then(() => undefined);
  return true;
}

function collectLayoutDirectories(value: unknown): string[] {
  if (typeof value === "string") {
    return value.includes(".") ? [] : [value];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap((entry) => collectLayoutDirectories(entry));
}

export async function initializeCristalinaStore(storeRoot: string, now = new Date().toISOString()): Promise<string> {
  const root = resolve(storeRoot);
  const manifest = createStoreManifest({
    store_id: `store_${Buffer.from(root).toString("hex").slice(0, 24) || "local"}`,
    now,
  });

  await mkdir(root, { recursive: true });
  const directories = new Set([
    ...Object.values(manifest.roots),
    ...collectLayoutDirectories(STORAGE_LAYOUT),
  ]);
  for (const directory of directories) {
    await mkdir(join(root, directory), { recursive: true });
  }
  await writeFile(join(root, "manifest.yaml"), serializeStoreManifestYaml(manifest));
  return root;
}

function healthCheck(input: {
  status: RuntimeBridgeHealthState;
  checkedAt: string;
  source: string;
  diagnostics?: string[];
  metrics?: Record<string, number | null>;
  note?: string;
}): RuntimeBridgeHealthCheck {
  return {
    status: input.status,
    checked_at: input.checkedAt,
    source: input.source,
    diagnostics: input.diagnostics ?? [],
    ...(input.metrics ? { metrics: input.metrics } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
}

function overallHealth(checks: RuntimeBridgeHealthCheck[]): RuntimeBridgeHealthState {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "attention")) return "attention";
  return "ok";
}

async function collectSubcheck<T>(input: {
  source: string;
  checkedAt: string;
  fallback: T;
  run: () => Promise<T>;
  metrics: (value: T) => Record<string, number | null>;
  note?: string;
}): Promise<{ value: T; health: RuntimeBridgeHealthCheck }> {
  try {
    const value = await input.run();
    return {
      value,
      health: healthCheck({
        status: "ok",
        checkedAt: input.checkedAt,
        source: input.source,
        metrics: input.metrics(value),
        note: input.note,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      value: input.fallback,
      health: healthCheck({
        status: "attention",
        checkedAt: input.checkedAt,
        source: input.source,
        diagnostics: [`${input.source} failed: ${message}`],
        metrics: input.metrics(input.fallback),
        note: input.note,
      }),
    };
  }
}

export async function loadStoreManifest(storeRoot: string): Promise<ReturnType<typeof parseStoreManifestYaml> | null> {
  const path = join(storeRoot, "manifest.yaml");
  const found = await exists(path).catch(() => false);
  if (!found) return null;
  return parseStoreManifestYaml(await readFile(path, "utf8"));
}

export async function collectRuntimeBridgeStatus(input: {
  config: CristalinaConfig;
  configDiagnostics: string[];
  storeRoot: string | null;
}): Promise<RuntimeBridgeStatus> {
  const checkedAt = new Date().toISOString();
  const diagnostics = [...input.configDiagnostics];
  const storeRoot = input.storeRoot;
  const configHealth = healthCheck({
    status: input.configDiagnostics.length === 0 ? "ok" : "fail",
    checkedAt,
    source: "config",
    diagnostics: input.configDiagnostics,
  });

  if (!storeRoot) {
    diagnostics.push("No store root configured. Run cristalina init or provide --store-root.");
    const storeHealth = healthCheck({
      status: "fail",
      checkedAt,
      source: "store_manifest",
      diagnostics: ["No store root configured. Run cristalina init or provide --store-root."],
    });
    const projectionHealth = healthCheck({
      status: "attention",
      checkedAt,
      source: "projection_runtime_views",
      diagnostics: ["Projection views were not checked because no store root is configured."],
      metrics: { openclaw: 0, hermes: 0 },
    });
    const ownerReviewsHealth = healthCheck({
      status: "attention",
      checkedAt,
      source: "owner_review_queues",
      diagnostics: ["Owner review queues were not checked because no store root is configured."],
      metrics: { openclaw: 0, hermes: 0 },
      note: "Counts active queue entries only; memory candidates that require review are reported by memory candidates.",
    });
    return {
      store_root: null,
      store_manifest_found: false,
      config_valid: diagnostics.length === 0,
      diagnostics,
      health: {
        overall: overallHealth([configHealth, storeHealth, projectionHealth, ownerReviewsHealth]),
        checked_at: checkedAt,
        config: configHealth,
        store: storeHealth,
        projections: projectionHealth,
        owner_reviews: ownerReviewsHealth,
      },
      projections: { openclaw: [], hermes: [] },
      pending_owner_reviews: { openclaw: 0, hermes: 0 },
    };
  }

  const manifest = await loadStoreManifest(storeRoot);
  if (!manifest) {
    diagnostics.push(`Store manifest not found at ${join(storeRoot, "manifest.yaml")}`);
  }
  const storeHealth = healthCheck({
    status: manifest ? "ok" : "fail",
    checkedAt,
    source: "store_manifest",
    diagnostics: manifest ? [] : [`Store manifest not found at ${join(storeRoot, "manifest.yaml")}`],
    metrics: { manifest_found: manifest ? 1 : 0 },
  });

  if (!input.config.runtimes?.openclaw?.runtime_instance_ref) {
    diagnostics.push("OpenClaw runtime binding is missing runtimes.openclaw.runtime_instance_ref");
  }
  if (!input.config.runtimes?.hermes?.runtime_instance_ref) {
    diagnostics.push("Hermes runtime binding is missing runtimes.hermes.runtime_instance_ref");
  }

  const projectionFallback = {
    openclaw: [] as Awaited<ReturnType<typeof listOpenClawProjectionRuntimeViews>>,
    hermes: [] as Awaited<ReturnType<typeof listHermesProjectionRuntimeViews>>,
  };
  const reviewsFallback = {
    openclaw: [] as Awaited<ReturnType<typeof listOpenClawConversationPreferenceOwnerRatificationQueue>>,
    hermes: [] as Awaited<ReturnType<typeof listHermesConversationPreferenceOwnerRatificationQueue>>,
  };
  const projectionSubcheck = manifest
    ? await collectSubcheck({
        source: "projection_runtime_views",
        checkedAt,
        fallback: projectionFallback,
        run: async () => {
          const [openclaw, hermes] = await Promise.all([
            listOpenClawProjectionRuntimeViews(storeRoot),
            listHermesProjectionRuntimeViews(storeRoot),
          ]);
          return { openclaw, hermes };
        },
        metrics: (value) => ({ openclaw: value.openclaw.length, hermes: value.hermes.length }),
      })
    : {
        value: projectionFallback,
        health: healthCheck({
          status: "attention",
          checkedAt,
          source: "projection_runtime_views",
          diagnostics: ["Projection views were not checked because the store manifest is missing."],
          metrics: { openclaw: 0, hermes: 0 },
        }),
      };
  const reviewsSubcheck = manifest
    ? await collectSubcheck({
        source: "owner_review_queues",
        checkedAt,
        fallback: reviewsFallback,
        run: async () => {
          const [openclaw, hermes] = await Promise.all([
            listOpenClawConversationPreferenceOwnerRatificationQueue(storeRoot),
            listHermesConversationPreferenceOwnerRatificationQueue(storeRoot),
          ]);
          return { openclaw, hermes };
        },
        metrics: (value) => ({ openclaw: value.openclaw.length, hermes: value.hermes.length }),
        note: "Counts active queue entries only; memory candidates that require review are reported by memory candidates.",
      })
    : {
        value: reviewsFallback,
        health: healthCheck({
          status: "attention",
          checkedAt,
          source: "owner_review_queues",
          diagnostics: ["Owner review queues were not checked because the store manifest is missing."],
          metrics: { openclaw: 0, hermes: 0 },
          note: "Counts active queue entries only; memory candidates that require review are reported by memory candidates.",
        }),
      };
  diagnostics.push(...projectionSubcheck.health.diagnostics, ...reviewsSubcheck.health.diagnostics);
  const healthChecks = [configHealth, storeHealth, projectionSubcheck.health, reviewsSubcheck.health];

  return {
    store_root: storeRoot,
    store_manifest_found: Boolean(manifest),
    config_valid: diagnostics.length === 0,
    diagnostics,
    health: {
      overall: overallHealth(healthChecks),
      checked_at: checkedAt,
      config: configHealth,
      store: storeHealth,
      projections: projectionSubcheck.health,
      owner_reviews: reviewsSubcheck.health,
    },
    projections: {
      openclaw: projectionSubcheck.value.openclaw,
      hermes: projectionSubcheck.value.hermes,
    },
    pending_owner_reviews: {
      openclaw: reviewsSubcheck.value.openclaw.length,
      hermes: reviewsSubcheck.value.hermes.length,
    },
  };
}

export function formatStatus(status: RuntimeBridgeStatus): string {
  return `${JSON.stringify(status, null, 2)}\n`;
}
