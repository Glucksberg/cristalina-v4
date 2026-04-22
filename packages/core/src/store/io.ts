import { access, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";

import { CANONICAL_CLAIM_KINDS } from "../types.js";
import type {
  ActorIdentity,
  CanonicalMemoryObject,
  CurationPacket,
  ContradictionResolution,
  Contradiction,
  CoreRecord,
  Diagnostic,
  DispositionRecord,
  Entity,
  Episode,
  Proposal,
  RatificationRecord,
  Relation,
  RuntimeInstance,
  RuntimeSession,
  SourceRecord,
  ConversationThread,
  ProjectionManifest,
  ProjectionArtifact,
  EmbeddingRecord,
  WikiClaim,
  WikiMaintenanceRun,
  WikiPage,
  WorldClaim,
  SymbolAnchor,
  VectorArtifact,
  VectorChunk,
} from "../types.js";
import { STORAGE_LAYOUT } from "../storage.js";
import { assertCoreRecord, assertStoreManifest, assertSymbolAnchor, assertVectorArtifact } from "../validation.js";
import { atomicWriteText, isMissingFileError } from "./atomic-write.js";
import { createStoreManifest, parseStoreManifestYaml, serializeStoreManifestYaml, type StoreManifest } from "./manifest.js";

const CANON_KIND_DIRECTORIES = {
  fact: STORAGE_LAYOUT.canon.facts,
  belief: STORAGE_LAYOUT.canon.beliefs,
  preference: STORAGE_LAYOUT.canon.preferences,
  constraint: STORAGE_LAYOUT.canon.constraints,
  goal: STORAGE_LAYOUT.canon.goals,
  procedure: STORAGE_LAYOUT.canon.procedures,
  value: STORAGE_LAYOUT.canon.values,
  identity_trait: STORAGE_LAYOUT.canon.identityTraits,
} as const;

const CANONICAL_CLAIM_KIND_SET = new Set(
  CANONICAL_CLAIM_KINDS,
);

function isCanonicalMemoryRecord(record: CoreRecord): record is CanonicalMemoryObject {
  return (
    record.layer === "canon" &&
    CANONICAL_CLAIM_KIND_SET.has(record.kind as CanonicalMemoryObject["kind"]) &&
    "statement" in record &&
    typeof record.statement === "string" &&
    "governance_state" in record &&
    typeof record.governance_state === "string"
  );
}

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
    case "contradiction_resolution":
      return join(STORAGE_LAYOUT.governance.contradictionResolutions, record.id);
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
    case "wiki_maintenance_run":
      return join(STORAGE_LAYOUT.wiki.runs, record.id);
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

function extensionlessSymbolAnchorPath(anchor: SymbolAnchor): string {
  return join(STORAGE_LAYOUT.derived.symbols, anchor.id.replaceAll("/", "__").replaceAll(":", "_"));
}

function extensionlessVectorArtifactPath(artifact: VectorArtifact): string {
  switch (artifact.kind) {
    case "vector_corpus":
      return join(STORAGE_LAYOUT.derived.vector.corpora, artifact.id);
    case "vector_chunk":
      return join(STORAGE_LAYOUT.derived.vector.chunks, artifact.id);
    case "embedding_model_manifest":
      return join(STORAGE_LAYOUT.derived.vector.models, artifact.id);
    case "embedding_record":
      return join(STORAGE_LAYOUT.derived.vector.embeddings, artifact.id);
    case "embedding_batch_run":
      return join(STORAGE_LAYOUT.derived.vector.embeddingBatches, artifact.id);
    case "vector_index_manifest":
      return join(STORAGE_LAYOUT.derived.vector.manifests, artifact.id);
    case "vector_search_run":
      return join(STORAGE_LAYOUT.derived.vector.searchRuns, artifact.id);
    case "retrieval_audit":
      return join(STORAGE_LAYOUT.derived.vector.retrievalAudits, artifact.id);
    case "retrieval_eval_run":
      return join(STORAGE_LAYOUT.derived.vector.retrievalEvalRuns, artifact.id);
    case "vector_maintenance_run":
      return join(STORAGE_LAYOUT.derived.vector.maintenanceRuns, artifact.id);
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

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function recordFilePath(rootDir: string, record: CoreRecord): string {
  return resolveWithinRoot(rootDir, `${extensionlessRecordPath(record)}.json`);
}

function symbolAnchorFilePath(rootDir: string, anchor: SymbolAnchor): string {
  return resolveWithinRoot(rootDir, `${extensionlessSymbolAnchorPath(anchor)}.json`);
}

function vectorArtifactFilePath(rootDir: string, artifact: VectorArtifact): string {
  return resolveWithinRoot(rootDir, `${extensionlessVectorArtifactPath(artifact)}.json`);
}

function vectorBlobPath(rootDir: string, relativePath: string): string {
  const filePath = resolveWithinRoot(rootDir, relativePath);
  const relativePathFromVectorRoot = relative(STORAGE_LAYOUT.derived.vector.root, relativePath);
  if (
    relativePathFromVectorRoot === "" ||
    relativePathFromVectorRoot.startsWith("..") ||
    isAbsolute(relativePathFromVectorRoot)
  ) {
    throw new Error(`Vector blob path escapes derived vector storage: ${relativePath}`);
  }
  return filePath;
}

async function ensureParent(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function initializeStore(rootDir: string, now = new Date().toISOString()): Promise<StoreManifest> {
  const manifestPath = resolveWithinRoot(rootDir, STORAGE_LAYOUT.manifest);
  const existingManifest = await access(manifestPath)
    .then(async () => readManifest(rootDir))
    .catch((error) => {
      if (isMissingFileError(error)) return undefined;
      throw error;
    });
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
    STORAGE_LAYOUT.canon.procedures,
    STORAGE_LAYOUT.canon.identityTraits,
    STORAGE_LAYOUT.canon.identity,
    STORAGE_LAYOUT.wiki.root,
    STORAGE_LAYOUT.wiki.pages,
    STORAGE_LAYOUT.wiki.claims,
    STORAGE_LAYOUT.wiki.runs,
    STORAGE_LAYOUT.governance.root,
    STORAGE_LAYOUT.governance.proposals,
    STORAGE_LAYOUT.governance.dispositions,
    STORAGE_LAYOUT.governance.contradictionResolutions,
    STORAGE_LAYOUT.governance.curation,
    STORAGE_LAYOUT.governance.ratifications,
    STORAGE_LAYOUT.governance.policy,
    STORAGE_LAYOUT.governance.policySnapshots,
    STORAGE_LAYOUT.derived.root,
    STORAGE_LAYOUT.derived.openclaw,
    STORAGE_LAYOUT.derived.hermes,
    STORAGE_LAYOUT.derived.manifests,
    STORAGE_LAYOUT.derived.symbols,
    STORAGE_LAYOUT.derived.vector.root,
    STORAGE_LAYOUT.derived.vector.corpora,
    STORAGE_LAYOUT.derived.vector.chunks,
    STORAGE_LAYOUT.derived.vector.embeddings,
    STORAGE_LAYOUT.derived.vector.embeddingBatches,
    STORAGE_LAYOUT.derived.vector.indexes,
    STORAGE_LAYOUT.derived.vector.manifests,
    STORAGE_LAYOUT.derived.vector.models,
    STORAGE_LAYOUT.derived.vector.searchRuns,
    STORAGE_LAYOUT.derived.vector.evals,
    STORAGE_LAYOUT.derived.vector.retrievalAudits,
    STORAGE_LAYOUT.derived.vector.retrievalEvalRuns,
    STORAGE_LAYOUT.derived.vector.maintenanceRuns,
    STORAGE_LAYOUT.audits.root,
    STORAGE_LAYOUT.audits.snapshots,
    STORAGE_LAYOUT.audits.diagnostics,
  ];

  await Promise.all(directories.map((directory) => mkdir(join(rootDir, directory), { recursive: true })));

  await writeManifest(rootDir, manifest);
  await atomicWriteText(join(rootDir, STORAGE_LAYOUT.wiki.index), "# Index\n");
  await atomicWriteText(join(rootDir, STORAGE_LAYOUT.wiki.log), "# Log\n");
  await atomicWriteText(join(rootDir, STORAGE_LAYOUT.audits.changes), "");
  await atomicWriteText(join(rootDir, STORAGE_LAYOUT.audits.validation), "");

  return manifest;
}

export async function writeManifest(rootDir: string, manifest: StoreManifest): Promise<void> {
  assertStoreManifest(manifest);
  const filePath = resolveWithinRoot(rootDir, STORAGE_LAYOUT.manifest);
  await ensureParent(filePath);
  await atomicWriteText(filePath, serializeStoreManifestYaml(manifest));
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
  await atomicWriteText(filePath, `${JSON.stringify(record, null, 2)}\n`);
  return filePath;
}

export async function writeSymbolAnchor(rootDir: string, anchor: SymbolAnchor): Promise<string> {
  assertSymbolAnchor(anchor);
  const filePath = symbolAnchorFilePath(rootDir, anchor);
  await ensureParent(filePath);
  await atomicWriteText(filePath, `${JSON.stringify(anchor, null, 2)}\n`);
  return filePath;
}

export async function writeVectorArtifact(rootDir: string, artifact: VectorArtifact): Promise<string> {
  assertVectorArtifact(artifact);
  const filePath = vectorArtifactFilePath(rootDir, artifact);
  await ensureParent(filePath);
  await atomicWriteText(filePath, `${JSON.stringify(artifact, null, 2)}\n`);
  return filePath;
}

export async function writeVectorChunkText(rootDir: string, chunk: VectorChunk, text: string): Promise<string> {
  assertVectorArtifact(chunk);
  if (chunk.chunk_text_ref.checksum !== sha256(text)) {
    throw new Error(`Vector chunk text checksum mismatch for ${chunk.id}`);
  }
  const filePath = vectorBlobPath(rootDir, chunk.chunk_text_ref.path);
  await ensureParent(filePath);
  await atomicWriteText(filePath, text);
  return filePath;
}

export async function writeEmbeddingVector(rootDir: string, embedding: EmbeddingRecord, vector: number[]): Promise<string> {
  assertVectorArtifact(embedding);
  if (embedding.vector_ref.dimensions !== undefined && embedding.vector_ref.dimensions !== vector.length) {
    throw new Error(`Embedding vector dimension mismatch for ${embedding.id}`);
  }
  if (embedding.vector_checksum !== sha256(JSON.stringify(vector))) {
    throw new Error(`Embedding vector checksum mismatch for ${embedding.id}`);
  }
  const filePath = vectorBlobPath(rootDir, embedding.vector_ref.path);
  await ensureParent(filePath);
  await atomicWriteText(filePath, `${JSON.stringify(vector)}\n`);
  return filePath;
}

export async function readCoreRecord<T extends CoreRecord = CoreRecord>(filePath: string): Promise<T> {
  const source = await readFile(filePath, "utf8");
  const parsed = JSON.parse(source) as unknown;
  assertCoreRecord(parsed);
  return parsed as T;
}

export async function readSymbolAnchor(filePath: string): Promise<SymbolAnchor> {
  const source = await readFile(filePath, "utf8");
  const parsed = JSON.parse(source) as unknown;
  assertSymbolAnchor(parsed);
  return parsed;
}

export async function readVectorArtifact<T extends VectorArtifact = VectorArtifact>(filePath: string): Promise<T> {
  const source = await readFile(filePath, "utf8");
  const parsed = JSON.parse(source) as unknown;
  assertVectorArtifact(parsed);
  return parsed as T;
}

export async function readVectorChunkText(rootDir: string, chunk: VectorChunk): Promise<string> {
  assertVectorArtifact(chunk);
  const filePath = vectorBlobPath(rootDir, chunk.chunk_text_ref.path);
  const text = await readFile(filePath, "utf8");
  if (chunk.chunk_text_ref.checksum !== sha256(text)) {
    throw new Error(`Vector chunk text checksum mismatch for ${chunk.id}`);
  }
  return text;
}

export async function readEmbeddingVector(rootDir: string, embedding: EmbeddingRecord): Promise<number[]> {
  assertVectorArtifact(embedding);
  const filePath = vectorBlobPath(rootDir, embedding.vector_ref.path);
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "number")) {
    throw new Error(`Invalid embedding vector blob for ${embedding.id}`);
  }
  if (embedding.vector_ref.dimensions !== undefined && embedding.vector_ref.dimensions !== parsed.length) {
    throw new Error(`Embedding vector dimension mismatch for ${embedding.id}`);
  }
  if (embedding.vector_checksum !== sha256(JSON.stringify(parsed))) {
    throw new Error(`Embedding vector checksum mismatch for ${embedding.id}`);
  }
  return parsed;
}

export function coreRecordPath(rootDir: string, record: CoreRecord): string {
  return recordFilePath(rootDir, record);
}

export function symbolAnchorPath(rootDir: string, anchor: SymbolAnchor): string {
  assertSymbolAnchor(anchor);
  return symbolAnchorFilePath(rootDir, anchor);
}

export function vectorArtifactPath(rootDir: string, artifact: VectorArtifact): string {
  assertVectorArtifact(artifact);
  return vectorArtifactFilePath(rootDir, artifact);
}

async function collectJsonFiles(rootDir: string, relativeDir: string): Promise<string[]> {
  const absoluteDir = resolveWithinRoot(rootDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true }).catch((error) => {
    if (isMissingFileError(error)) return [];
    throw error;
  });
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

async function loadLayerRecords(rootDir: string, relativeDir: string): Promise<CoreRecord[]> {
  const files = await collectJsonFiles(rootDir, relativeDir);
  return Promise.all(files.map((file) => readCoreRecord<CoreRecord>(join(rootDir, file))));
}

async function loadSymbolAnchorRecords(rootDir: string, relativeDir: string): Promise<SymbolAnchor[]> {
  const files = await collectJsonFiles(rootDir, relativeDir);
  return Promise.all(files.map((file) => readSymbolAnchor(join(rootDir, file))));
}

async function loadVectorArtifactRecords(rootDir: string, relativeDir: string): Promise<VectorArtifact[]> {
  const files = await collectJsonFiles(rootDir, relativeDir);
  return Promise.all(files.map((file) => readVectorArtifact(join(rootDir, file))));
}

export async function loadSymbolAnchors(rootDir: string): Promise<SymbolAnchor[]> {
  return loadSymbolAnchorRecords(rootDir, STORAGE_LAYOUT.derived.symbols);
}

export async function loadVectorArtifacts(rootDir: string): Promise<VectorArtifact[]> {
  const directories = [
    STORAGE_LAYOUT.derived.vector.corpora,
    STORAGE_LAYOUT.derived.vector.chunks,
    STORAGE_LAYOUT.derived.vector.embeddings,
    STORAGE_LAYOUT.derived.vector.embeddingBatches,
    STORAGE_LAYOUT.derived.vector.models,
    STORAGE_LAYOUT.derived.vector.manifests,
    STORAGE_LAYOUT.derived.vector.searchRuns,
    STORAGE_LAYOUT.derived.vector.retrievalAudits,
    STORAGE_LAYOUT.derived.vector.retrievalEvalRuns,
    STORAGE_LAYOUT.derived.vector.maintenanceRuns,
  ];
  return (await Promise.all(directories.map((directory) => loadVectorArtifactRecords(rootDir, directory)))).flat();
}

export async function loadCanonicalRecords(rootDir: string): Promise<CanonicalMemoryObject[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.canon.root);
  return records.filter(isCanonicalMemoryRecord);
}

export async function loadCanonicalRecordById(rootDir: string, recordId: string): Promise<CanonicalMemoryObject | undefined> {
  const records = await loadCanonicalRecords(rootDir);
  return records.find((record) => record.id === recordId);
}

export async function loadSourceRecords(rootDir: string): Promise<SourceRecord[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.raw.sources);
  return records.filter((record): record is SourceRecord => record.kind === "source_record");
}

export async function loadWorldClaims(rootDir: string): Promise<WorldClaim[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.world.claims);
  return records.filter((record): record is WorldClaim => record.layer === "world" && "statement" in record && "support_refs" in record);
}

export async function loadWorldEpisodes(rootDir: string): Promise<Episode[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.world.episodes);
  return records.filter((record): record is Episode => record.kind === "episode");
}

export async function loadWorldEntities(rootDir: string): Promise<Entity[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.world.entities);
  return records.filter((record): record is Entity => record.kind === "entity");
}

export async function loadWorldRelations(rootDir: string): Promise<Relation[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.world.relations);
  return records.filter((record): record is Relation => record.kind === "relation");
}

export async function loadWorldContradictions(rootDir: string): Promise<Contradiction[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.world.contradictions);
  return records.filter((record): record is Contradiction => record.kind === "contradiction");
}

export async function loadContradictionResolutions(rootDir: string): Promise<ContradictionResolution[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.governance.contradictionResolutions);
  return records.filter((record): record is ContradictionResolution => record.kind === "contradiction_resolution");
}

export async function loadProposals(rootDir: string): Promise<Proposal[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.governance.proposals);
  return records.filter((record): record is Proposal => record.kind === "proposal");
}

export async function loadDispositionRecords(rootDir: string): Promise<DispositionRecord[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.governance.dispositions);
  return records.filter((record): record is DispositionRecord => record.kind === "disposition_record");
}

export async function loadCurationPackets(rootDir: string): Promise<CurationPacket[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.governance.curation);
  return records.filter((record): record is CurationPacket => record.kind === "curation_packet");
}

export async function loadRatificationRecords(rootDir: string): Promise<RatificationRecord[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.governance.ratifications);
  return records.filter((record): record is RatificationRecord => record.kind === "ratification");
}

export async function loadWikiPages(rootDir: string): Promise<WikiPage[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.wiki.pages);
  return records.filter((record): record is WikiPage => record.kind === "wiki_page");
}

export async function loadWikiClaims(rootDir: string): Promise<WikiClaim[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.wiki.claims);
  return records.filter((record): record is WikiClaim => record.kind === "wiki_claim");
}

export async function loadWikiMaintenanceRuns(rootDir: string): Promise<WikiMaintenanceRun[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.wiki.runs);
  return records.filter((record): record is WikiMaintenanceRun => record.kind === "wiki_maintenance_run");
}

export async function loadDiagnostics(rootDir: string): Promise<Diagnostic[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.audits.diagnostics);
  return records.filter((record): record is Diagnostic => record.kind === "diagnostic");
}

export async function loadProjectionManifests(rootDir: string): Promise<ProjectionManifest[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.derived.manifests);
  return records.filter((record): record is ProjectionManifest => record.kind === "projection_manifest");
}

export async function loadProjectionArtifacts(rootDir: string, adapter?: ProjectionArtifact["adapter"]): Promise<ProjectionArtifact[]> {
  const directories = adapter
    ? [adapter === "openclaw" ? STORAGE_LAYOUT.derived.openclaw : STORAGE_LAYOUT.derived.hermes]
    : [STORAGE_LAYOUT.derived.openclaw, STORAGE_LAYOUT.derived.hermes];
  const records = (await Promise.all(directories.map((directory) => loadLayerRecords(rootDir, directory)))).flat();
  return records.filter(
    (record): record is ProjectionArtifact =>
      record.kind === "projection_artifact" &&
      (adapter === undefined || record.adapter === adapter),
  );
}

export async function loadActorIdentities(rootDir: string): Promise<ActorIdentity[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.canon.identity);
  return records.filter((record): record is ActorIdentity => record.kind === "actor_identity");
}

export async function loadRuntimeInstances(rootDir: string): Promise<RuntimeInstance[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.runtime.instances);
  return records.filter((record): record is RuntimeInstance => record.kind === "runtime_instance");
}

export async function loadRuntimeSessions(rootDir: string): Promise<RuntimeSession[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.runtime.sessions);
  return records.filter((record): record is RuntimeSession => record.kind === "runtime_session");
}

export async function loadConversationThreads(rootDir: string): Promise<ConversationThread[]> {
  const records = await loadLayerRecords(rootDir, STORAGE_LAYOUT.runtime.threads);
  return records.filter((record): record is ConversationThread => record.kind === "conversation_thread");
}
