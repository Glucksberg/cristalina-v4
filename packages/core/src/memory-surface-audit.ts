import { open, readdir, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import type { CoreRecord, RuntimeKind } from "./types.js";
import {
  loadCanonicalRecords,
  loadCurationPackets,
  loadDiagnostics,
  loadDispositionRecords,
  loadProposals,
  loadProjectionManifests,
  loadRatificationRecords,
  loadRuntimeObservations,
  loadRuntimeSessions,
  loadSourceRecords,
  loadWikiClaims,
  loadWikiMaintenanceRuns,
  loadWikiPages,
  loadWorldClaims,
  loadWorldEntities,
  loadWorldEpisodes,
  loadWorldRelations,
} from "./store/io.js";

export type MemorySurfaceAuthority =
  | "raw_evidence"
  | "runtime_evidence"
  | "world_memory"
  | "wiki_editorial"
  | "canon_ratified"
  | "governance_state"
  | "projection_state"
  | "diagnostic"
  | "external_runtime_surface";

export type MemorySurfaceChangeKind =
  | "created_in_window"
  | "updated_in_window"
  | "observed_in_window"
  | "external_file_touched_in_window"
  | "reactivated_or_projected_in_window"
  | "matched_outside_window";

export interface MemorySurfaceAuditInput {
  rootDir: string;
  runtime?: Exclude<RuntimeKind, "generic">;
  since?: string;
  until?: string;
  timezone?: string;
  query?: string;
  hermesRoot?: string;
  includeRuntimeSurfaces?: boolean;
}

export interface MemorySurfaceAuditEntry {
  surface:
    | "cristalina_raw_source"
    | "cristalina_runtime_observation"
    | "cristalina_runtime_session"
    | "cristalina_world_claim"
    | "cristalina_world_episode"
    | "cristalina_world_entity"
    | "cristalina_world_relation"
    | "cristalina_wiki_page"
    | "cristalina_wiki_claim"
    | "cristalina_wiki_maintenance_run"
    | "cristalina_canon_memory"
    | "cristalina_governance_proposal"
    | "cristalina_governance_curation_packet"
    | "cristalina_governance_ratification"
    | "cristalina_governance_disposition"
    | "cristalina_projection_manifest"
    | "cristalina_diagnostic"
    | "hermes_skill_file"
    | "hermes_session_file";
  authority: MemorySurfaceAuthority;
  change_kind: MemorySurfaceChangeKind;
  ref: string;
  layer?: string;
  kind?: string;
  title?: string;
  summary?: string;
  path?: string;
  created_at?: string | null;
  updated_at?: string | null;
  observed_at?: string | null;
  filesystem_mtime?: string | null;
  semantic_slot?: string | null;
  status?: string | null;
  source_runtime?: RuntimeKind | null;
  provenance?: Record<string, unknown>;
  limitations?: string[];
}

export interface MemorySurfaceAuditReport {
  schema_version: 1;
  generated_at: string;
  store_root: string;
  runtime: Exclude<RuntimeKind, "generic"> | null;
  window: {
    since: string | null;
    until: string | null;
    timezone: string | null;
  };
  query: string | null;
  entries: MemorySurfaceAuditEntry[];
  counts: {
    total: number;
    by_surface: Record<string, number>;
    by_authority: Record<string, number>;
    by_change_kind: Record<string, number>;
  };
  limitations: string[];
}

interface IndexedRecord {
  surface: MemorySurfaceAuditEntry["surface"];
  authority: MemorySurfaceAuthority;
  record: CoreRecord;
}

interface HermesSurfaceCollection {
  entries: MemorySurfaceAuditEntry[];
  limitations: string[];
}

interface ExternalFileCollection {
  files: string[];
  limitations: string[];
}

interface ExternalFileRead {
  text: string;
  limitations: string[];
}

interface ExternalEntryResult {
  entry?: MemorySurfaceAuditEntry;
  limitations: string[];
}

const EXTERNAL_FILE_SCAN_LIMIT = 1000;
const EXTERNAL_FILE_PREVIEW_BYTES = 64 * 1024;
const EXTERNAL_FILE_READ_CONCURRENCY = 32;

function countBy(entries: MemorySurfaceAuditEntry[], key: keyof Pick<MemorySurfaceAuditEntry, "surface" | "authority" | "change_kind">): Record<string, number> {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    const value = String(entry[key]);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function inWindow(value: string | null | undefined, since?: string, until?: string): boolean {
  if (!value) return false;
  if (since && value < since) return false;
  if (until && value >= until) return false;
  return true;
}

function textMatches(values: unknown[], query?: string): boolean {
  if (!query?.trim()) return true;
  const needle = query.trim().toLowerCase();
  return values.some((value) => String(value ?? "").toLowerCase().includes(needle));
}

function looseRecord(record: CoreRecord): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

function recordStatus(record: CoreRecord): string | null {
  const source = looseRecord(record);
  for (const key of ["governance_state", "epistemic_state", "temporal_state", "status", "claim_status", "lifecycle_state", "decision"]) {
    const value = source[key];
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "temporal_status" in value) {
      return String((value as { temporal_status?: unknown }).temporal_status ?? "");
    }
  }
  return null;
}

function recordSummary(record: CoreRecord): string | undefined {
  const source = looseRecord(record);
  for (const key of ["statement", "summary", "message", "title", "reason"]) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function recordTitle(record: CoreRecord): string | undefined {
  const source = looseRecord(record);
  const title = source.title ?? source.label ?? source.id;
  return typeof title === "string" ? title : undefined;
}

function recordSemanticSlot(record: CoreRecord): string | null {
  const value = looseRecord(record).semantic_slot;
  return typeof value === "string" ? value : null;
}

function recordRuntime(record: CoreRecord): RuntimeKind | null {
  const direct = looseRecord(record).runtime;
  if (direct === "openclaw" || direct === "hermes" || direct === "generic") return direct;
  const provenanceRuntime = record.provenance.runtime_ref;
  if (typeof provenanceRuntime === "string") {
    if (provenanceRuntime.includes("hermes")) return "hermes";
    if (provenanceRuntime.includes("openclaw")) return "openclaw";
  }
  return null;
}

function recordChangeKind(record: CoreRecord, since?: string, until?: string): MemorySurfaceChangeKind {
  const observedAt = looseRecord(record).observed_at;
  if (typeof observedAt === "string" && inWindow(observedAt, since, until)) return "observed_in_window";
  if (inWindow(record.created_at, since, until)) return "created_in_window";
  if (inWindow(record.updated_at, since, until)) return "updated_in_window";
  return "matched_outside_window";
}

function shouldIncludeRecord(record: CoreRecord, input: MemorySurfaceAuditInput): boolean {
  const runtime = recordRuntime(record);
  if (input.runtime && runtime && runtime !== input.runtime) return false;
  const status = recordStatus(record);
  const summary = recordSummary(record);
  const title = recordTitle(record);
  const semanticSlot = recordSemanticSlot(record);
  if (!textMatches([record.id, record.kind, record.layer, title, summary, semanticSlot, status], input.query)) {
    return false;
  }
  if (!input.since && !input.until) return true;
  const observedAt = looseRecord(record).observed_at;
  return (
    inWindow(record.created_at, input.since, input.until) ||
    inWindow(record.updated_at, input.since, input.until) ||
    (typeof observedAt === "string" && inWindow(observedAt, input.since, input.until))
  );
}

function recordToEntry(indexed: IndexedRecord, input: MemorySurfaceAuditInput): MemorySurfaceAuditEntry {
  const record = indexed.record;
  const observedAt = looseRecord(record).observed_at;
  const sourcePath = looseRecord(record).path;
  return {
    surface: indexed.surface,
    authority: indexed.authority,
    change_kind: indexed.surface === "cristalina_projection_manifest" && inWindow(record.updated_at ?? record.created_at, input.since, input.until)
      ? "reactivated_or_projected_in_window"
      : recordChangeKind(record, input.since, input.until),
    ref: record.id,
    layer: record.layer,
    kind: record.kind,
    title: recordTitle(record),
    summary: recordSummary(record),
    path: typeof sourcePath === "string" ? sourcePath : undefined,
    created_at: record.created_at,
    updated_at: record.updated_at ?? null,
    observed_at: typeof observedAt === "string" ? observedAt : null,
    semantic_slot: recordSemanticSlot(record),
    status: recordStatus(record),
    source_runtime: recordRuntime(record),
    provenance: record.provenance as unknown as Record<string, unknown>,
  };
}

function indexedRecord(surface: IndexedRecord["surface"], authority: MemorySurfaceAuthority, record: CoreRecord): IndexedRecord {
  return { surface, authority, record };
}

async function collectCristalinaEntries(input: MemorySurfaceAuditInput): Promise<MemorySurfaceAuditEntry[]> {
  const [
    sources,
    observations,
    runtimeSessions,
    worldClaims,
    episodes,
    entities,
    relations,
    wikiPages,
    wikiClaims,
    wikiRuns,
    canon,
    proposals,
    curationPackets,
    ratifications,
    dispositions,
    projectionManifests,
    diagnostics,
  ] = await Promise.all([
    loadSourceRecords(input.rootDir),
    loadRuntimeObservations(input.rootDir),
    loadRuntimeSessions(input.rootDir),
    loadWorldClaims(input.rootDir),
    loadWorldEpisodes(input.rootDir),
    loadWorldEntities(input.rootDir),
    loadWorldRelations(input.rootDir),
    loadWikiPages(input.rootDir),
    loadWikiClaims(input.rootDir),
    loadWikiMaintenanceRuns(input.rootDir),
    loadCanonicalRecords(input.rootDir),
    loadProposals(input.rootDir),
    loadCurationPackets(input.rootDir),
    loadRatificationRecords(input.rootDir),
    loadDispositionRecords(input.rootDir),
    loadProjectionManifests(input.rootDir),
    loadDiagnostics(input.rootDir),
  ]);

  const indexed: IndexedRecord[] = [
    ...sources.map((record) => indexedRecord("cristalina_raw_source", "raw_evidence", record)),
    ...observations.map((record) => indexedRecord("cristalina_runtime_observation", "runtime_evidence", record)),
    ...runtimeSessions.map((record) => indexedRecord("cristalina_runtime_session", "runtime_evidence", record)),
    ...worldClaims.map((record) => indexedRecord("cristalina_world_claim", "world_memory", record)),
    ...episodes.map((record) => indexedRecord("cristalina_world_episode", "world_memory", record)),
    ...entities.map((record) => indexedRecord("cristalina_world_entity", "world_memory", record)),
    ...relations.map((record) => indexedRecord("cristalina_world_relation", "world_memory", record)),
    ...wikiPages.map((record) => indexedRecord("cristalina_wiki_page", "wiki_editorial", record)),
    ...wikiClaims.map((record) => indexedRecord("cristalina_wiki_claim", "wiki_editorial", record)),
    ...wikiRuns.map((record) => indexedRecord("cristalina_wiki_maintenance_run", "wiki_editorial", record)),
    ...canon.map((record) => indexedRecord("cristalina_canon_memory", "canon_ratified", record)),
    ...proposals.map((record) => indexedRecord("cristalina_governance_proposal", "governance_state", record)),
    ...curationPackets.map((record) => indexedRecord("cristalina_governance_curation_packet", "governance_state", record)),
    ...ratifications.map((record) => indexedRecord("cristalina_governance_ratification", "governance_state", record)),
    ...dispositions.map((record) => indexedRecord("cristalina_governance_disposition", "governance_state", record)),
    ...projectionManifests.map((record) => indexedRecord("cristalina_projection_manifest", "projection_state", record)),
    ...diagnostics.map((record) => indexedRecord("cristalina_diagnostic", "diagnostic", record)),
  ];

  return indexed
    .filter(({ record }) => shouldIncludeRecord(record, input))
    .map((entry) => recordToEntry(entry, input));
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

async function collectFiles(rootDir: string, filename?: string, files: string[] = [], limitations: string[] = []): Promise<ExternalFileCollection> {
  if (files.length >= EXTERNAL_FILE_SCAN_LIMIT) {
    pushUnique(limitations, `External runtime surface scan stopped after ${EXTERNAL_FILE_SCAN_LIMIT} files.`);
    return { files, limitations };
  }
  const entries = await readdir(rootDir, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    limitations.push(`Could not read external runtime directory ${rootDir}: ${(error as Error).message}`);
    return [];
  });
  for (const entry of entries) {
    if (files.length >= EXTERNAL_FILE_SCAN_LIMIT) {
      pushUnique(limitations, `External runtime surface scan stopped after ${EXTERNAL_FILE_SCAN_LIMIT} files.`);
      break;
    }
    const path = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(path, filename, files, limitations);
    } else if (!filename || entry.name === filename) {
      files.push(path);
    }
  }
  return { files, limitations };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function externalFileChangeKind(mtime: string, since?: string, until?: string): MemorySurfaceChangeKind {
  return inWindow(mtime, since, until) ? "external_file_touched_in_window" : "matched_outside_window";
}

async function readExternalFilePrefix(filePath: string, size: number): Promise<ExternalFileRead> {
  const limitations: string[] = [];
  const byteLength = Math.min(size, EXTERNAL_FILE_PREVIEW_BYTES);
  const buffer = Buffer.alloc(byteLength);
  let handle;
  try {
    handle = await open(filePath, "r");
    const read = await handle.read(buffer, 0, byteLength, 0);
    if (size > EXTERNAL_FILE_PREVIEW_BYTES) {
      limitations.push(`External file ${filePath} was truncated to ${EXTERNAL_FILE_PREVIEW_BYTES} bytes for audit matching.`);
    }
    return {
      text: buffer.subarray(0, read.bytesRead).toString("utf8"),
      limitations,
    };
  } catch (error) {
    return {
      text: "",
      limitations: [`Could not read external file ${filePath}: ${(error as Error).message}`],
    };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function skillEntry(filePath: string, hermesRoot: string, input: MemorySurfaceAuditInput): Promise<ExternalEntryResult> {
  const fileStat = await stat(filePath).catch((error) => {
    throw new Error(`Could not stat external file ${filePath}: ${(error as Error).message}`);
  });
  const mtime = fileStat.mtime.toISOString();
  if ((input.since || input.until) && !inWindow(mtime, input.since, input.until)) return { limitations: [] };
  const read = await readExternalFilePrefix(filePath, fileStat.size);
  const source = read.text;
  const title = source.split("\n").find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() || basename(filePath);
  if (!textMatches([filePath, title, source], input.query)) return { limitations: read.limitations };
  const path = relative(hermesRoot, filePath);
  return {
    entry: {
      surface: "hermes_skill_file",
      authority: "external_runtime_surface",
      change_kind: externalFileChangeKind(mtime, input.since, input.until),
      ref: `hermes_skill:${path}`,
      title,
      path,
      filesystem_mtime: mtime,
      limitations: [
        "Filesystem mtime is external evidence, not semantic creation time.",
        "Hermes skills are procedural runtime artifacts, not Cristalina canon.",
        ...read.limitations,
      ],
    },
    limitations: [
      ...read.limitations,
    ],
  };
}

async function sessionEntry(filePath: string, hermesRoot: string, input: MemorySurfaceAuditInput): Promise<ExternalEntryResult> {
  const fileStat = await stat(filePath).catch((error) => {
    throw new Error(`Could not stat external file ${filePath}: ${(error as Error).message}`);
  });
  const mtime = fileStat.mtime.toISOString();
  if ((input.since || input.until) && !inWindow(mtime, input.since, input.until)) return { limitations: [] };
  const read = await readExternalFilePrefix(filePath, fileStat.size);
  const source = read.text;
  const title = basename(filePath);
  if (!textMatches([filePath, title, source], input.query)) return { limitations: read.limitations };
  const path = relative(hermesRoot, filePath);
  return {
    entry: {
      surface: "hermes_session_file",
      authority: "external_runtime_surface",
      change_kind: externalFileChangeKind(mtime, input.since, input.until),
      ref: `hermes_session:${path}`,
      title,
      path,
      filesystem_mtime: mtime,
      limitations: [
        "Filesystem mtime is external evidence, not a governed memory timestamp.",
        "Hermes session history is transcript evidence, not owner authority or canon.",
        ...read.limitations,
      ],
    },
    limitations: [
      ...read.limitations,
    ],
  };
}

async function collectHermesSurfaceEntries(input: MemorySurfaceAuditInput): Promise<HermesSurfaceCollection> {
  if (!input.includeRuntimeSurfaces || !input.hermesRoot) return { entries: [], limitations: [] };
  if (input.runtime === "openclaw") {
    return {
      entries: [],
      limitations: ["Hermes external runtime surfaces were skipped because the audit runtime filter is openclaw."],
    };
  }
  const hermesRoot = resolve(input.hermesRoot);
  const [skillCollection, sessionCollection] = await Promise.all([
    collectFiles(join(hermesRoot, "skills"), "SKILL.md"),
    collectFiles(join(hermesRoot, "sessions")),
  ]);
  const files = [
    ...skillCollection.files.map((filePath) => ({ filePath, surface: "skill" as const })),
    ...sessionCollection.files
      .filter((filePath) => /\.(json|jsonl|md|txt)$/i.test(filePath))
      .map((filePath) => ({ filePath, surface: "session" as const })),
  ];
  const results = await mapWithConcurrency(files, EXTERNAL_FILE_READ_CONCURRENCY, async ({ filePath, surface }) => {
    if (surface === "skill") {
      try {
        return await skillEntry(filePath, hermesRoot, input);
      } catch (error) {
        return { limitations: [(error as Error).message] };
      }
    }
    try {
      return await sessionEntry(filePath, hermesRoot, input);
    } catch (error) {
      return { limitations: [(error as Error).message] };
    }
  });
  return {
    entries: results.map((result) => result.entry).filter((entry): entry is MemorySurfaceAuditEntry => entry !== undefined),
    limitations: [
      ...skillCollection.limitations,
      ...sessionCollection.limitations,
      ...results.flatMap((result) => result.limitations),
    ],
  };
}

export async function auditMemorySurfaces(input: MemorySurfaceAuditInput): Promise<MemorySurfaceAuditReport> {
  const hermesSurfaces = await collectHermesSurfaceEntries(input);
  const entries = [
    ...(await collectCristalinaEntries(input)),
    ...hermesSurfaces.entries,
  ].sort((left, right) => {
    const leftTime = left.observed_at ?? left.updated_at ?? left.created_at ?? left.filesystem_mtime ?? "";
    const rightTime = right.observed_at ?? right.updated_at ?? right.created_at ?? right.filesystem_mtime ?? "";
    return rightTime.localeCompare(leftTime) || left.ref.localeCompare(right.ref);
  });

  const limitations = [
    "This report is read-only and does not promote, ratify, delete, or rewrite memory.",
    "Runtime/session/skill surfaces are evidence only unless represented by governed Cristalina records.",
  ];
  if (input.includeRuntimeSurfaces && input.hermesRoot) {
    limitations.push("Hermes external surfaces are discovered from files; semantic created_at may be unavailable.");
  }
  limitations.push(...hermesSurfaces.limitations);

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    store_root: input.rootDir,
    runtime: input.runtime ?? null,
    window: {
      since: input.since ?? null,
      until: input.until ?? null,
      timezone: input.timezone ?? null,
    },
    query: input.query ?? null,
    entries,
    counts: {
      total: entries.length,
      by_surface: countBy(entries, "surface"),
      by_authority: countBy(entries, "authority"),
      by_change_kind: countBy(entries, "change_kind"),
    },
    limitations,
  };
}
