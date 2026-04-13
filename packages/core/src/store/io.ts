import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import type { CanonicalMemoryObject, CoreRecord } from "../types.js";
import { STORAGE_LAYOUT } from "../storage.js";
import { assertCoreRecord, assertStoreManifest } from "../validation.js";
import { createStoreManifest, parseStoreManifestYaml, serializeStoreManifestYaml, type StoreManifest } from "./manifest.js";

const CANON_KIND_DIRECTORIES = {
  fact: STORAGE_LAYOUT.canon.facts,
  belief: STORAGE_LAYOUT.canon.beliefs,
  preference: STORAGE_LAYOUT.canon.preferences,
  constraint: STORAGE_LAYOUT.canon.constraints,
  goal: STORAGE_LAYOUT.canon.goals,
  value: STORAGE_LAYOUT.canon.values,
  identity_trait: STORAGE_LAYOUT.canon.identityTraits,
} as const;

function extensionlessRecordPath(record: CoreRecord): string {
  switch (record.kind) {
    case "source_record":
      return join(STORAGE_LAYOUT.raw.sources, record.id);
    case "observation":
      return join(STORAGE_LAYOUT.runtime.observations, record.id);
    case "actor_identity":
      return join(STORAGE_LAYOUT.canon.identity, record.id);
    case "runtime_instance":
      return join(STORAGE_LAYOUT.runtime.instances, record.id);
    case "runtime_session":
      return join(STORAGE_LAYOUT.runtime.sessions, record.id);
    case "runtime_memory_block":
      return join(STORAGE_LAYOUT.runtime.blocks, record.id);
    case "conversation_thread":
      return join(STORAGE_LAYOUT.runtime.threads, record.id);
    case "episode":
      return join(STORAGE_LAYOUT.world.episodes, record.id);
    case "entity":
      return join(STORAGE_LAYOUT.world.entities, record.id);
    case "relation":
      return join(STORAGE_LAYOUT.world.relations, record.id);
    case "proposal":
      return join(STORAGE_LAYOUT.governance.proposals, record.id);
    case "curation_packet":
      return join(STORAGE_LAYOUT.governance.curation, record.id);
    case "ratification":
      return join(STORAGE_LAYOUT.governance.ratifications, record.id);
    case "contradiction":
      return join(STORAGE_LAYOUT.world.contradictions, record.id);
    case "ontology_definition":
      return join(STORAGE_LAYOUT.world.ontology, record.id);
    case "policy_snapshot":
      return join(STORAGE_LAYOUT.governance.policySnapshots, record.id);
    case "wiki_page":
      return join(STORAGE_LAYOUT.wiki.pages, record.id);
    case "wiki_claim":
      return join(STORAGE_LAYOUT.wiki.claims, record.id);
    case "projection_artifact":
      return join(record.adapter === "openclaw" ? STORAGE_LAYOUT.derived.openclaw : STORAGE_LAYOUT.derived.hermes, record.id);
    case "projection_manifest":
      return join(STORAGE_LAYOUT.derived.manifests, record.id);
    case "diagnostic":
      return join(STORAGE_LAYOUT.audits.diagnostics, record.id);
    case "disposition_record":
      return join(STORAGE_LAYOUT.governance.dispositions, record.id);
    default:
      if (record.layer === "world") return join(STORAGE_LAYOUT.world.claims, record.id);
      if (record.layer === "canon" && record.kind in CANON_KIND_DIRECTORIES) {
        const canonDirectory = CANON_KIND_DIRECTORIES[record.kind as keyof typeof CANON_KIND_DIRECTORIES];
        return join(canonDirectory, record.id);
      }
      throw new Error("No storage mapping for record");
  }
}

function resolveWithinRoot(rootDir: string, relativePath: string): string {
  const rootPath = resolve(rootDir);
  const targetPath = resolve(rootPath, relativePath);
  const relativePathFromRoot = relative(rootPath, targetPath);

  if (
    relativePathFromRoot === "" ||
    relativePathFromRoot.startsWith("..") ||
    isAbsolute(relativePathFromRoot)
  ) {
    throw new Error(`Resolved path escapes store root: ${relativePath}`);
  }

  return targetPath;
}

function recordFilePath(rootDir: string, record: CoreRecord): string {
  return resolveWithinRoot(rootDir, `${extensionlessRecordPath(record)}.json`);
}

async function ensureParent(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function initializeStore(rootDir: string, now = new Date().toISOString()): Promise<StoreManifest> {
  const manifestPath = resolveWithinRoot(rootDir, STORAGE_LAYOUT.manifest);
  const existingManifest = await access(manifestPath)
    .then(async () => readManifest(rootDir))
    .catch(() => undefined);
  if (existingManifest) {
    return existingManifest;
  }

  const manifest = createStoreManifest({
    store_id: randomUUID(),
    now,
  });

  const directories = [
    STORAGE_LAYOUT.raw.root,
    STORAGE_LAYOUT.raw.sources,
    STORAGE_LAYOUT.raw.attachments,
    STORAGE_LAYOUT.raw.imports,
    STORAGE_LAYOUT.runtime.root,
    STORAGE_LAYOUT.runtime.observations,
    STORAGE_LAYOUT.runtime.instances,
    STORAGE_LAYOUT.runtime.sessions,
    STORAGE_LAYOUT.runtime.threads,
    STORAGE_LAYOUT.runtime.blocks,
    STORAGE_LAYOUT.runtime.workingMemory,
    STORAGE_LAYOUT.world.root,
    STORAGE_LAYOUT.world.entities,
    STORAGE_LAYOUT.world.relations,
    STORAGE_LAYOUT.world.episodes,
    STORAGE_LAYOUT.world.claims,
    STORAGE_LAYOUT.world.contradictions,
    STORAGE_LAYOUT.world.ontology,
    STORAGE_LAYOUT.canon.root,
    STORAGE_LAYOUT.canon.facts,
    STORAGE_LAYOUT.canon.beliefs,
    STORAGE_LAYOUT.canon.preferences,
    STORAGE_LAYOUT.canon.constraints,
    STORAGE_LAYOUT.canon.values,
    STORAGE_LAYOUT.canon.goals,
    STORAGE_LAYOUT.canon.identityTraits,
    STORAGE_LAYOUT.canon.identity,
    STORAGE_LAYOUT.wiki.root,
    STORAGE_LAYOUT.wiki.pages,
    STORAGE_LAYOUT.wiki.claims,
    STORAGE_LAYOUT.governance.root,
    STORAGE_LAYOUT.governance.proposals,
    STORAGE_LAYOUT.governance.dispositions,
    STORAGE_LAYOUT.governance.curation,
    STORAGE_LAYOUT.governance.ratifications,
    STORAGE_LAYOUT.governance.policy,
    STORAGE_LAYOUT.governance.policySnapshots,
    STORAGE_LAYOUT.derived.root,
    STORAGE_LAYOUT.derived.openclaw,
    STORAGE_LAYOUT.derived.hermes,
    STORAGE_LAYOUT.derived.manifests,
    STORAGE_LAYOUT.audits.root,
    STORAGE_LAYOUT.audits.snapshots,
    STORAGE_LAYOUT.audits.diagnostics,
  ];

  await Promise.all(directories.map((directory) => mkdir(join(rootDir, directory), { recursive: true })));

  await writeManifest(rootDir, manifest);
  await writeFile(join(rootDir, STORAGE_LAYOUT.wiki.index), "# Index\n", "utf8");
  await writeFile(join(rootDir, STORAGE_LAYOUT.wiki.log), "# Log\n", "utf8");
  await writeFile(join(rootDir, STORAGE_LAYOUT.audits.changes), "", "utf8");
  await writeFile(join(rootDir, STORAGE_LAYOUT.audits.validation), "", "utf8");

  return manifest;
}

export async function writeManifest(rootDir: string, manifest: StoreManifest): Promise<void> {
  assertStoreManifest(manifest);
  const filePath = resolveWithinRoot(rootDir, STORAGE_LAYOUT.manifest);
  await ensureParent(filePath);
  await writeFile(filePath, serializeStoreManifestYaml(manifest), "utf8");
}

export async function readManifest(rootDir: string): Promise<StoreManifest> {
  const filePath = resolveWithinRoot(rootDir, STORAGE_LAYOUT.manifest);
  const source = await readFile(filePath, "utf8");
  const manifest = parseStoreManifestYaml(source);
  assertStoreManifest(manifest);
  return manifest;
}

export async function writeCoreRecord(rootDir: string, record: CoreRecord): Promise<string> {
  assertCoreRecord(record);
  const filePath = recordFilePath(rootDir, record);
  await ensureParent(filePath);
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return filePath;
}

export async function readCoreRecord<T extends CoreRecord = CoreRecord>(filePath: string): Promise<T> {
  const source = await readFile(filePath, "utf8");
  const parsed = JSON.parse(source) as unknown;
  assertCoreRecord(parsed);
  return parsed as T;
}

export function coreRecordPath(rootDir: string, record: CoreRecord): string {
  return recordFilePath(rootDir, record);
}

async function collectJsonFiles(rootDir: string, relativeDir: string): Promise<string[]> {
  const absoluteDir = resolveWithinRoot(rootDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const nextRelative = join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        return collectJsonFiles(rootDir, nextRelative);
      }
      return nextRelative.endsWith(".json") ? [nextRelative] : [];
    }),
  );

  return nested.flat();
}

export async function loadCanonicalRecords(rootDir: string): Promise<CanonicalMemoryObject[]> {
  const canonFiles = await collectJsonFiles(rootDir, STORAGE_LAYOUT.canon.root);
  const records = await Promise.all(canonFiles.map((file) => readCoreRecord<CoreRecord>(join(rootDir, file))));
  return records.filter((record): record is CanonicalMemoryObject => record.layer === "canon");
}

export async function loadCanonicalRecordById(rootDir: string, recordId: string): Promise<CanonicalMemoryObject | undefined> {
  const records = await loadCanonicalRecords(rootDir);
  return records.find((record) => record.id === recordId);
}
