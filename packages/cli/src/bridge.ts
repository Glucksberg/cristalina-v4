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
  projections: {
    openclaw: ProjectionRuntimeSummary[];
    hermes: ProjectionRuntimeSummary[];
  };
  pending_owner_reviews: {
    openclaw: number;
    hermes: number;
  };
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
  const diagnostics = [...input.configDiagnostics];
  const storeRoot = input.storeRoot;

  if (!storeRoot) {
    diagnostics.push("No store root configured. Run cristalina init or provide --store-root.");
    return {
      store_root: null,
      store_manifest_found: false,
      config_valid: diagnostics.length === 0,
      diagnostics,
      projections: { openclaw: [], hermes: [] },
      pending_owner_reviews: { openclaw: 0, hermes: 0 },
    };
  }

  const manifest = await loadStoreManifest(storeRoot);
  if (!manifest) {
    diagnostics.push(`Store manifest not found at ${join(storeRoot, "manifest.yaml")}`);
  }

  if (!input.config.runtimes?.openclaw?.runtime_instance_ref) {
    diagnostics.push("OpenClaw runtime binding is missing runtimes.openclaw.runtime_instance_ref");
  }
  if (!input.config.runtimes?.hermes?.runtime_instance_ref) {
    diagnostics.push("Hermes runtime binding is missing runtimes.hermes.runtime_instance_ref");
  }

  const [openclawProjections, hermesProjections, openclawReviews, hermesReviews] = manifest
    ? await Promise.all([
        listOpenClawProjectionRuntimeViews(storeRoot).catch(() => []),
        listHermesProjectionRuntimeViews(storeRoot).catch(() => []),
        listOpenClawConversationPreferenceOwnerRatificationQueue(storeRoot).catch(() => []),
        listHermesConversationPreferenceOwnerRatificationQueue(storeRoot).catch(() => []),
      ])
    : [
        [] as Awaited<ReturnType<typeof listOpenClawProjectionRuntimeViews>>,
        [] as Awaited<ReturnType<typeof listHermesProjectionRuntimeViews>>,
        [] as Awaited<ReturnType<typeof listOpenClawConversationPreferenceOwnerRatificationQueue>>,
        [] as Awaited<ReturnType<typeof listHermesConversationPreferenceOwnerRatificationQueue>>,
      ];

  return {
    store_root: storeRoot,
    store_manifest_found: Boolean(manifest),
    config_valid: diagnostics.length === 0,
    diagnostics,
    projections: {
      openclaw: openclawProjections,
      hermes: hermesProjections,
    },
    pending_owner_reviews: {
      openclaw: openclawReviews.length,
      hermes: hermesReviews.length,
    },
  };
}

export function formatStatus(status: RuntimeBridgeStatus): string {
  return `${JSON.stringify(status, null, 2)}\n`;
}
