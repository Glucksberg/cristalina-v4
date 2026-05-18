import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createProjectionArtifact,
  createProjectionManifest,
  DEFAULT_PROJECTION_READ_POLICY_VERSION,
  filterProjectionRecords,
  type ProjectionReadContext,
} from "../adapter-sdk/projection.js";
import {
  loadActorIdentities,
  loadCanonicalRecords,
  loadConversationThreads,
  loadDiagnostics,
  loadRuntimeInstances,
  loadRuntimeObservations,
  loadRuntimeSessions,
  loadWikiClaims,
  loadWikiPages,
  loadWorldClaims,
  loadWorldEntities,
  loadWorldEpisodes,
  writeCoreRecord,
} from "../store/io.js";
import type {
  ActorIdentity,
  CanonicalMemoryObject,
  ConversationThread,
  Diagnostic,
  Entity,
  Episode,
  ProjectionArtifact,
  ProjectionManifest,
  RuntimeInstance,
  Observation,
  RuntimeSession,
  VisibilityState,
  WikiClaim,
  WikiPage,
  WorldClaim,
} from "../types.js";

export const HERMES_RECOGNITION_PROJECTION_PROFILE = "hermes_recognition_v1";
export const HERMES_RECOGNITION_COMPILER_VERSION = "hermes.recognition.v1";

export interface HermesRecognitionEntry {
  target_ref: string;
  target_kind: string;
  source_layer: string;
  label: string;
  aliases: string[];
  recognition_hint: string;
  authority_label: string;
  upstream_refs: string[];
  updated_at: string;
  semantic_slot?: string;
  epistemic_state?: string;
  governance_state?: string;
  temporal_status?: string;
}

export interface HermesHydrationCard {
  target_ref: string;
  title: string;
  summary: string;
  source_layers: string[];
  upstream_refs: string[];
  diagnostics: string[];
  semantic_slot?: string;
  epistemic_state?: string;
  governance_state?: string;
  temporal_status?: string;
}

export interface HermesRecognitionSnapshot {
  schema_version: 1;
  projection_profile: typeof HERMES_RECOGNITION_PROJECTION_PROFILE;
  compiler_version: typeof HERMES_RECOGNITION_COMPILER_VERSION;
  read_policy_version: string;
  runtime: "hermes";
  generated_at: string;
  recognition_index: HermesRecognitionEntry[];
  hydration_cards: HermesHydrationCard[];
  archive_entrypoints: Array<{
    name: string;
    command: string;
    note: string;
  }>;
  suppressed_records: Array<{
    id: string;
    kind: string;
    reason_code: string;
  }>;
}

export interface HermesRecognitionProjectionInput {
  now: string;
  visibility_state: VisibilityState;
  read_context?: ProjectionReadContext;
  ids: {
    json_artifact: string;
    context_artifact: string;
    manifest: string;
  };
  actor_identities?: ActorIdentity[];
  runtime_instances?: RuntimeInstance[];
  runtime_observations?: Observation[];
  runtime_sessions?: RuntimeSession[];
  conversation_threads?: ConversationThread[];
  entities?: Entity[];
  episodes?: Episode[];
  canonical_records?: CanonicalMemoryObject[];
  world_claims?: WorldClaim[];
  wiki_pages?: WikiPage[];
  wiki_claims?: WikiClaim[];
  diagnostics?: Diagnostic[];
}

export interface HermesRecognitionProjectionResult {
  snapshot: HermesRecognitionSnapshot;
  context: string;
  json: string;
  artifacts: [ProjectionArtifact, ProjectionArtifact];
  manifest: ProjectionManifest;
}

export interface StoredHermesRecognitionProjectionResult extends HermesRecognitionProjectionResult {
  json_relative_path: string;
  context_relative_path: string;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function uniqueSuppressedRecords(records: HermesRecognitionSnapshot["suppressed_records"]): HermesRecognitionSnapshot["suppressed_records"] {
  const seen = new Set<string>();
  const result: HermesRecognitionSnapshot["suppressed_records"] = [];
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    result.push(record);
  }
  return result;
}

function compactText(value: string, limit = 240): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > limit ? `${compacted.slice(0, limit - 1).trimEnd()}...` : compacted;
}

function updatedAt(record: { created_at: string; updated_at?: string | null }): string {
  return record.updated_at ?? record.created_at;
}

function observationLabel(summary: string): string {
  try {
    const parsed = JSON.parse(summary) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    // Runtime observations may be plain summaries or structured event JSON.
  }
  return summary;
}

function episodeRecognitionHint(record: Episode): string {
  const base = record.projection_hint ?? `Episode with ${record.observation_refs.length} observation refs.`;
  const parts = [
    base,
    record.episode_type ? `type=${record.episode_type}` : "",
    record.lifecycle_state ? `lifecycle=${record.lifecycle_state}` : "",
    record.scope_tags && record.scope_tags.length > 0 ? `scope=${record.scope_tags.join(",")}` : "",
  ].filter((part) => part.length > 0);
  return parts.join(" ");
}

function episodeAliases(record: Episode): string[] {
  return [
    ...(record.entity_refs ?? []).map((ref) => ref.id),
    ...(record.scope_tags ?? []),
    ...(record.linked_governance_slots ?? []),
    record.supersession?.from ?? "",
    record.supersession?.to ?? "",
  ].filter((value) => value.length > 0);
}

function entry(input: {
  target_ref: string;
  target_kind: string;
  source_layer: string;
  label: string;
  aliases?: string[];
  recognition_hint: string;
  authority_label: string;
  upstream_refs?: string[];
  updated_at: string;
  semantic_slot?: string;
  epistemic_state?: string;
  governance_state?: string;
  temporal_status?: string;
}): HermesRecognitionEntry {
  return {
    target_ref: input.target_ref,
    target_kind: input.target_kind,
    source_layer: input.source_layer,
    label: compactText(input.label, 120),
    aliases: unique(input.aliases ?? []),
    recognition_hint: compactText(input.recognition_hint),
    authority_label: input.authority_label,
    upstream_refs: unique(input.upstream_refs ?? [input.target_ref]),
    updated_at: input.updated_at,
    ...(input.semantic_slot ? { semantic_slot: input.semantic_slot } : {}),
    ...(input.epistemic_state ? { epistemic_state: input.epistemic_state } : {}),
    ...(input.governance_state ? { governance_state: input.governance_state } : {}),
    ...(input.temporal_status ? { temporal_status: input.temporal_status } : {}),
  };
}

function auditMetadata(item: {
  semantic_slot?: string;
  epistemic_state?: string;
  governance_state?: string;
  temporal_status?: string;
}): string[] {
  return [
    item.semantic_slot ? `semantic_slot=${item.semantic_slot}` : "",
    item.epistemic_state ? `epistemic_state=${item.epistemic_state}` : "",
    item.governance_state ? `governance_state=${item.governance_state}` : "",
    item.temporal_status ? `temporal_status=${item.temporal_status}` : "",
  ].filter((value) => value.length > 0);
}

function renderContext(snapshot: HermesRecognitionSnapshot, query?: string): string {
  const selected = selectRecognitionEntries(snapshot, query, 8);
  const cards = new Map(snapshot.hydration_cards.map((card) => [card.target_ref, card]));
  const lines = [
    "## Cristalina Memory",
    "",
    "Cristalina is active as the governed memory provider. Use this context as derived memory, not as owner authority.",
    "",
    "### Recognition",
  ];

  if (selected.length === 0) {
    lines.push("- No matching recognition entries are currently projected.");
  } else {
    for (const item of selected) {
      lines.push(`- [${item.source_layer}:${item.target_ref}] ${item.label} (${item.authority_label})`);
      lines.push(`  ${item.recognition_hint}`);
      const metadata = auditMetadata(item);
      if (metadata.length > 0) {
        lines.push(`  Audit: ${metadata.join("; ")}`);
      }
      const card = cards.get(item.target_ref);
      if (card) {
        lines.push(`  Hydration: ${card.summary}`);
      }
    }
  }

  lines.push("", "### Archive Descent");
  for (const entrypoint of snapshot.archive_entrypoints) {
    lines.push(`- ${entrypoint.name}: ${entrypoint.note}`);
  }

  return `${lines.join("\n")}\n`;
}

function matchesQuery(entry: HermesRecognitionEntry, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const haystack = [
    entry.label,
    entry.recognition_hint,
    entry.target_ref,
    entry.target_kind,
    entry.source_layer,
    entry.semantic_slot ?? "",
    entry.epistemic_state ?? "",
    entry.governance_state ?? "",
    entry.temporal_status ?? "",
    ...entry.aliases,
  ].join(" ").toLowerCase();
  return normalizedQuery
    .split(/\s+/)
    .filter((part) => part.length >= 3)
    .some((part) => haystack.includes(part));
}

export function selectRecognitionEntries(
  snapshot: HermesRecognitionSnapshot,
  query?: string,
  limit = 8,
): HermesRecognitionEntry[] {
  const normalizedQuery = query?.toLowerCase().trim() ?? "";
  const matched = snapshot.recognition_index.filter((item) => matchesQuery(item, normalizedQuery));
  return matched
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .slice(0, limit);
}

export function formatHermesRecognitionContext(snapshot: HermesRecognitionSnapshot, query?: string): string {
  return renderContext(snapshot, query);
}

export function compileHermesRecognitionProjection(
  input: HermesRecognitionProjectionInput,
): HermesRecognitionProjectionResult {
  const readContext = input.read_context ?? {
    adapter: "hermes",
    audience: "memory_provider",
  };
  const actorFilter = filterProjectionRecords(input.actor_identities ?? [], readContext);
  const runtimeInstanceFilter = filterProjectionRecords(input.runtime_instances ?? [], readContext);
  const observationFilter = filterProjectionRecords(input.runtime_observations ?? [], readContext);
  const runtimeSessionFilter = filterProjectionRecords(input.runtime_sessions ?? [], readContext);
  const threadFilter = filterProjectionRecords(input.conversation_threads ?? [], readContext);
  const entityFilter = filterProjectionRecords(input.entities ?? [], readContext);
  const episodeFilter = filterProjectionRecords(input.episodes ?? [], readContext);
  const canonicalFilter = filterProjectionRecords(input.canonical_records ?? [], readContext);
  const worldFilter = filterProjectionRecords(input.world_claims ?? [], readContext);
  const wikiPageFilter = filterProjectionRecords(input.wiki_pages ?? [], readContext);
  const wikiClaimFilter = filterProjectionRecords(input.wiki_claims ?? [], readContext);
  const diagnosticFilter = filterProjectionRecords(input.diagnostics ?? [], readContext);

  const recognition_index = [
    ...actorFilter.included.map((record) => entry({
      target_ref: record.id,
      target_kind: record.kind,
      source_layer: record.layer,
      label: record.label,
      aliases: record.aliases,
      recognition_hint: `Actor identity: ${record.label}.`,
      authority_label: "canon identity",
      updated_at: updatedAt(record),
    })),
    ...entityFilter.included.map((record) => entry({
      target_ref: record.id,
      target_kind: record.kind,
      source_layer: record.layer,
      label: record.label,
      recognition_hint: `World entity (${record.entity_kind}, ${record.status}).`,
      authority_label: "world structure",
      updated_at: updatedAt(record),
    })),
    ...canonicalFilter.included.map((record) => entry({
      target_ref: record.id,
      target_kind: record.kind,
      source_layer: record.layer,
      label: record.statement,
      recognition_hint: `${record.kind} is ${record.governance_state}; temporal status ${record.temporal_state?.temporal_status ?? "unresolved"}.`,
      authority_label: `canon/${record.governance_state}`,
      updated_at: updatedAt(record),
      semantic_slot: record.semantic_slot,
      epistemic_state: record.epistemic_state,
      governance_state: record.governance_state,
      ...(record.temporal_state?.temporal_status ? { temporal_status: record.temporal_state.temporal_status } : {}),
    })),
    ...worldFilter.included.map((record) => entry({
      target_ref: record.id,
      target_kind: record.kind,
      source_layer: record.layer,
      label: record.statement,
      recognition_hint: `${record.kind} is ${record.epistemic_state}; temporal status ${record.temporal_state?.temporal_status ?? "unresolved"}.`,
      authority_label: `world/${record.epistemic_state}`,
      upstream_refs: record.support_refs,
      updated_at: updatedAt(record),
      semantic_slot: record.semantic_slot,
      epistemic_state: record.epistemic_state,
      ...(record.governance_state ? { governance_state: record.governance_state } : {}),
      ...(record.temporal_state?.temporal_status ? { temporal_status: record.temporal_state.temporal_status } : {}),
    })),
    ...observationFilter.included.map((record) => entry({
      target_ref: record.id,
      target_kind: record.kind,
      source_layer: record.layer,
      label: observationLabel(record.summary),
      recognition_hint: `Runtime observation (${record.epistemic_state}) from Hermes session ${record.runtime_session_ref ?? "unknown"}.`,
      authority_label: `runtime/${record.epistemic_state}`,
      upstream_refs: [record.provenance.source_ref, ...(record.provenance.evidence_refs ?? [])],
      updated_at: updatedAt(record),
    })),
    ...wikiPageFilter.included.map((record) => entry({
      target_ref: record.id,
      target_kind: record.kind,
      source_layer: record.layer,
      label: record.title,
      aliases: [record.path],
      recognition_hint: record.index_summary ?? `Wiki ${record.page_kind} page.`,
      authority_label: "wiki/editorial",
      upstream_refs: [...record.source_refs, ...record.canonical_refs, ...record.world_refs, ...(record.wiki_claim_refs ?? [])],
      updated_at: updatedAt(record),
    })),
    ...wikiClaimFilter.included.map((record) => entry({
      target_ref: record.id,
      target_kind: record.kind,
      source_layer: record.layer,
      label: record.statement,
      recognition_hint: `Wiki claim is ${record.claim_status}.`,
      authority_label: `wiki/${record.claim_status}`,
      upstream_refs: [...record.source_refs, ...(record.support_refs ?? [])],
      updated_at: updatedAt(record),
    })),
    ...episodeFilter.included.map((record) => entry({
      target_ref: record.id,
      target_kind: record.kind,
      source_layer: record.layer,
      label: record.summary,
      aliases: episodeAliases(record),
      recognition_hint: episodeRecognitionHint(record),
      authority_label: record.episode_type ? `world/episode/${record.episode_type}` : "world/episode",
      upstream_refs: record.observation_refs,
      updated_at: updatedAt(record),
      ...(record.semantic_slot ? { semantic_slot: record.semantic_slot } : {}),
    })),
    ...runtimeSessionFilter.included.map((record) => entry({
      target_ref: record.id,
      target_kind: record.kind,
      source_layer: record.layer,
      label: record.summary ?? record.objective ?? record.id,
      recognition_hint: `Hermes runtime session is ${record.status}.`,
      authority_label: "runtime/session",
      upstream_refs: [record.runtime_instance_ref],
      updated_at: updatedAt(record),
    })),
    ...threadFilter.included.map((record) => entry({
      target_ref: record.id,
      target_kind: record.kind,
      source_layer: record.layer,
      label: record.summary ?? record.id,
      recognition_hint: `Conversation thread with ${record.message_refs.length} message refs.`,
      authority_label: "runtime/thread",
      upstream_refs: [record.runtime_instance_ref, record.runtime_session_ref, ...record.message_refs],
      updated_at: updatedAt(record),
    })),
  ].sort((left, right) => right.updated_at.localeCompare(left.updated_at));

  const hydration_cards = recognition_index.map((item) => ({
    target_ref: item.target_ref,
    title: item.label,
    summary: item.recognition_hint,
    source_layers: [item.source_layer],
    upstream_refs: item.upstream_refs,
    diagnostics: diagnosticFilter.included
      .filter((diagnostic) => diagnostic.related_refs.some((ref) => item.upstream_refs.includes(ref) || ref === item.target_ref))
      .map((diagnostic) => diagnostic.id),
    ...(item.semantic_slot ? { semantic_slot: item.semantic_slot } : {}),
    ...(item.epistemic_state ? { epistemic_state: item.epistemic_state } : {}),
    ...(item.governance_state ? { governance_state: item.governance_state } : {}),
    ...(item.temporal_status ? { temporal_status: item.temporal_status } : {}),
  }));

  const suppressed_records = uniqueSuppressedRecords([
    ...actorFilter.suppressed,
    ...runtimeInstanceFilter.suppressed,
    ...observationFilter.suppressed,
    ...runtimeSessionFilter.suppressed,
    ...threadFilter.suppressed,
    ...entityFilter.suppressed,
    ...episodeFilter.suppressed,
    ...canonicalFilter.suppressed,
    ...worldFilter.suppressed,
    ...wikiPageFilter.suppressed,
    ...wikiClaimFilter.suppressed,
    ...diagnosticFilter.suppressed,
  ]);
  const upstreamRefs = unique([
    ...recognition_index.flatMap((item) => [item.target_ref, ...item.upstream_refs]),
    ...hydration_cards.flatMap((card) => card.diagnostics),
    readContext.runtime_instance_ref ?? "",
    readContext.runtime_session_ref ?? "",
    readContext.conversation_thread_ref ?? "",
  ]);
  const jsonPath = `derived/hermes/${input.ids.manifest}/recognition-profile.json`;
  const contextPath = `derived/hermes/${input.ids.manifest}/recognition-context.md`;
  const snapshot: HermesRecognitionSnapshot = {
    schema_version: 1,
    projection_profile: HERMES_RECOGNITION_PROJECTION_PROFILE,
    compiler_version: HERMES_RECOGNITION_COMPILER_VERSION,
    read_policy_version: DEFAULT_PROJECTION_READ_POLICY_VERSION,
    runtime: "hermes",
    generated_at: input.now,
    recognition_index,
    hydration_cards,
    archive_entrypoints: [
      {
        name: "cristalina_archive_search",
        command: "cristalina projection recognition --runtime hermes --query <query>",
        note: "Use for archive descent when recognition and hydration are insufficient.",
      },
    ],
    suppressed_records,
  };
  const context = renderContext(snapshot);
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  const jsonArtifact = createProjectionArtifact({
    id: input.ids.json_artifact,
    adapter: "hermes",
    artifact_kind: "recognition_profile_json",
    path: jsonPath,
    source_layer: "derived",
    authoritative_home: "governance",
    upstream_refs: upstreamRefs.length > 0 ? upstreamRefs : ["store_manifest"],
    now: input.now,
    visibility_state: input.visibility_state,
  });
  const contextArtifact = createProjectionArtifact({
    id: input.ids.context_artifact,
    adapter: "hermes",
    artifact_kind: "recognition_context_markdown",
    path: contextPath,
    source_layer: "derived",
    authoritative_home: "governance",
    upstream_refs: upstreamRefs.length > 0 ? upstreamRefs : ["store_manifest"],
    now: input.now,
    visibility_state: input.visibility_state,
  });
  const manifest = createProjectionManifest({
    id: input.ids.manifest,
    adapter: "hermes",
    projection_profile: HERMES_RECOGNITION_PROJECTION_PROFILE,
    audience: "memory_provider",
    read_policy_version: DEFAULT_PROJECTION_READ_POLICY_VERSION,
    compiler_version: HERMES_RECOGNITION_COMPILER_VERSION,
    actor_identity_ref: readContext.actor_identity_ref ?? null,
    owner_identity_ref: readContext.owner_identity_ref ?? null,
    runtime_instance_ref: readContext.runtime_instance_ref ?? null,
    runtime_session_ref: readContext.runtime_session_ref ?? null,
    conversation_thread_ref: readContext.conversation_thread_ref ?? null,
    snapshot_strategy: "mixed_state_tolerant",
    context_refs: unique([
      readContext.actor_identity_ref ?? "",
      readContext.owner_identity_ref ?? "",
      readContext.runtime_instance_ref ?? "",
      readContext.runtime_session_ref ?? "",
      readContext.conversation_thread_ref ?? "",
    ]),
    suppressed_refs: suppressed_records.map((record) => record.id),
    suppressed_records,
    diagnostic_refs: diagnosticFilter.included.map((record) => record.id),
    artifact_refs: [jsonArtifact.id, contextArtifact.id],
    upstream_refs: upstreamRefs.length > 0 ? upstreamRefs : ["store_manifest"],
    now: input.now,
    visibility_state: input.visibility_state,
  });

  return {
    snapshot,
    context,
    json,
    artifacts: [jsonArtifact, contextArtifact],
    manifest,
  };
}

export async function compileHermesRecognitionProjectionFromStore(input: {
  rootDir: string;
  now?: string;
  read_context?: ProjectionReadContext;
  ids?: Partial<HermesRecognitionProjectionInput["ids"]>;
}): Promise<HermesRecognitionProjectionResult> {
  const now = input.now ?? new Date().toISOString();
  const stamp = now.replace(/[^0-9A-Za-z]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  const ids = {
    manifest: input.ids?.manifest ?? `pmf_hermes_recognition_${stamp}`,
    json_artifact: input.ids?.json_artifact ?? `part_hermes_recognition_json_${stamp}`,
    context_artifact: input.ids?.context_artifact ?? `part_hermes_recognition_context_${stamp}`,
  };
  const [
    actor_identities,
    runtime_instances,
    runtime_observations,
    runtime_sessions,
    conversation_threads,
    entities,
    episodes,
    canonical_records,
    world_claims,
    wiki_pages,
    wiki_claims,
    diagnostics,
  ] = await Promise.all([
    loadActorIdentities(input.rootDir),
    loadRuntimeInstances(input.rootDir),
    loadRuntimeObservations(input.rootDir),
    loadRuntimeSessions(input.rootDir),
    loadConversationThreads(input.rootDir),
    loadWorldEntities(input.rootDir),
    loadWorldEpisodes(input.rootDir),
    loadCanonicalRecords(input.rootDir),
    loadWorldClaims(input.rootDir),
    loadWikiPages(input.rootDir),
    loadWikiClaims(input.rootDir),
    loadDiagnostics(input.rootDir),
  ]);

  return compileHermesRecognitionProjection({
    now,
    visibility_state: {
      privacy_scope: "shareable",
    },
    read_context: input.read_context,
    ids,
    actor_identities,
    runtime_instances,
    runtime_observations,
    runtime_sessions,
    conversation_threads,
    entities,
    episodes,
    canonical_records,
    world_claims,
    wiki_pages,
    wiki_claims,
    diagnostics,
  });
}

export async function writeHermesRecognitionProjectionToStore(input: {
  rootDir: string;
  now?: string;
  read_context?: ProjectionReadContext;
  ids?: Partial<HermesRecognitionProjectionInput["ids"]>;
}): Promise<StoredHermesRecognitionProjectionResult> {
  const projection = await compileHermesRecognitionProjectionFromStore(input);
  const jsonRelativePath = projection.artifacts[0].path;
  const contextRelativePath = projection.artifacts[1].path;
  await mkdir(join(input.rootDir, `derived/hermes/${projection.manifest.id}`), { recursive: true });
  await writeFile(join(input.rootDir, jsonRelativePath), projection.json, "utf8");
  await writeFile(join(input.rootDir, contextRelativePath), projection.context, "utf8");
  await Promise.all([
    writeCoreRecord(input.rootDir, projection.artifacts[0]),
    writeCoreRecord(input.rootDir, projection.artifacts[1]),
    writeCoreRecord(input.rootDir, projection.manifest),
  ]);
  return {
    ...projection,
    json_relative_path: jsonRelativePath,
    context_relative_path: contextRelativePath,
  };
}
