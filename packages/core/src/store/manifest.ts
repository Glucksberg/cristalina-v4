import type { Layer } from "../types.js";
import { LAYER_ROOTS } from "../storage.js";

export interface StoreManifest {
  format: "cristalina-v4-store";
  version: 1;
  layout_version: 1;
  store_id: string;
  created_at: string;
  updated_at: string;
  roots: Record<Layer, string>;
}

export function createStoreManifest(input: {
  store_id: string;
  now: string;
}): StoreManifest {
  return {
    format: "cristalina-v4-store",
    version: 1,
    layout_version: 1,
    store_id: input.store_id,
    created_at: input.now,
    updated_at: input.now,
    roots: { ...LAYER_ROOTS },
  };
}

export function serializeStoreManifestYaml(manifest: StoreManifest): string {
  const rootEntries = Object.entries(manifest.roots)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join("\n");

  return [
    `format: ${manifest.format}`,
    `version: ${manifest.version}`,
    `layout_version: ${manifest.layout_version}`,
    `store_id: ${manifest.store_id}`,
    `created_at: ${manifest.created_at}`,
    `updated_at: ${manifest.updated_at}`,
    "roots:",
    rootEntries,
    "",
  ].join("\n");
}

export function parseStoreManifestYaml(source: string): StoreManifest {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  const topLevel = new Map<string, string>();
  const roots = new Map<string, string>();
  let readingRoots = false;

  for (const line of lines) {
    if (line === "roots:") {
      readingRoots = true;
      continue;
    }

    if (readingRoots && line.startsWith("  ")) {
      const [key, ...rest] = line.trim().split(":");
      roots.set(key.trim(), rest.join(":").trim());
      continue;
    }

    readingRoots = false;
    const [key, ...rest] = line.split(":");
    topLevel.set(key.trim(), rest.join(":").trim());
  }

  return {
    format: (topLevel.get("format") ?? "") as StoreManifest["format"],
    version: Number(topLevel.get("version")) as StoreManifest["version"],
    layout_version: Number(topLevel.get("layout_version")) as StoreManifest["layout_version"],
    store_id: topLevel.get("store_id") ?? "",
    created_at: topLevel.get("created_at") ?? "",
    updated_at: topLevel.get("updated_at") ?? "",
    roots: {
      raw: roots.get("raw") ?? "",
      runtime: roots.get("runtime") ?? "",
      world: roots.get("world") ?? "",
      canon: roots.get("canon") ?? "",
      wiki: roots.get("wiki") ?? "",
      governance: roots.get("governance") ?? "",
      derived: roots.get("derived") ?? "",
      audits: roots.get("audits") ?? "",
    },
  };
}
