import { createProjectionArtifact, createProjectionManifest } from "../adapter-sdk/projection.js";
import type {
  ActorIdentity,
  CanonicalMemoryObject,
  Contradiction,
  ConversationThread,
  Diagnostic,
  Entity,
  Episode,
  ProjectionArtifact,
  ProjectionManifest,
  Relation,
  RuntimeInstance,
  RuntimeSession,
  VisibilityState,
  WikiClaim,
  WikiPage,
  WorldClaim,
} from "../types.js";

function uniqueRefs(...groups: string[][]): string[] {
  return [...new Set(groups.flat())];
}

function renderCanonSection(records: CanonicalMemoryObject[]): string[] {
  if (records.length === 0) return ["- (none)"];
  return records.map((record) => {
    const temporal = record.temporal_state?.temporal_status ?? "unresolved";
    return `- [canon:${record.id}] (${record.governance_state}; ${temporal}) ${record.statement}`;
  });
}

function renderWorldSection(records: WorldClaim[]): string[] {
  if (records.length === 0) return ["- (none)"];
  return records.map((record) => {
    const temporal = record.temporal_state?.temporal_status ?? "unresolved";
    return `- [world:${record.id}] (${record.epistemic_state}; ${temporal}) ${record.statement}`;
  });
}

function renderRuntimeSection(input: OpenClawBootstrapCompilationInput["runtime_identity"]): string[] {
  if (!input) return ["- (none)"];

  const lines: string[] = [];
  if (input.actor_identity) {
    lines.push(`- [actor:${input.actor_identity.id}] ${input.actor_identity.label}`);
  }
  if (input.owner_identity) {
    lines.push(`- [owner:${input.owner_identity.id}] ${input.owner_identity.label}`);
  }
  if (input.runtime_instance) {
    lines.push(`- [runtime:${input.runtime_instance.id}] ${input.runtime_instance.runtime} (${input.runtime_instance.status})`);
  }
  if (input.runtime_session) {
    lines.push(`- [session:${input.runtime_session.id}] ${input.runtime_session.status}`);
  }
  if (input.conversation_thread) {
    lines.push(`- [thread:${input.conversation_thread.id}] messages=${input.conversation_thread.message_refs.length}`);
  }

  return lines.length > 0 ? lines : ["- (none)"];
}

function renderEpisodeSection(records: Episode[]): string[] {
  if (records.length === 0) return ["- (none)"];
  return records.map((record) => `- [episode:${record.id}] ${record.summary}`);
}

function renderEntitySection(records: Entity[]): string[] {
  if (records.length === 0) return ["- (none)"];
  return records.map((record) => `- [entity:${record.id}] (${record.entity_kind}) ${record.label}`);
}

function renderRelationSection(records: Relation[]): string[] {
  if (records.length === 0) return ["- (none)"];
  return records.map((record) => `- [relation:${record.id}] ${record.subject_ref.id} -${record.relation_type}-> ${record.object_ref.id}`);
}

function renderContradictionSection(records: Contradiction[]): string[] {
  if (records.length === 0) return ["- (none)"];
  return records.map((record) => `- [contradiction:${record.id}] (${record.status}) ${record.left_ref.id} <> ${record.right_ref.id}`);
}

function renderWikiSection(pages: WikiPage[], claims: WikiClaim[]): string[] {
  const lines: string[] = [];
  if (pages.length === 0 && claims.length === 0) return ["- (none)"];
  for (const page of pages) {
    lines.push(`- [wiki:${page.id}] ${page.title}`);
  }
  for (const claim of claims) {
    lines.push(`- [wiki-claim:${claim.id}] (${claim.claim_status}) ${claim.statement}`);
  }
  return lines;
}

function renderDiagnosticsSection(records: Diagnostic[]): string[] {
  if (records.length === 0) return ["- (none)"];
  return records.map((record) => `- [diag:${record.id}] (${record.severity}) ${record.code}: ${record.message}`);
}

export interface OpenClawBootstrapCompilationInput {
  now: string;
  visibility_state: VisibilityState;
  projection_path: string;
  canonical_records: CanonicalMemoryObject[];
  world_claims: WorldClaim[];
  episodes?: Episode[];
  entities?: Entity[];
  relations?: Relation[];
  contradictions?: Contradiction[];
  wiki_pages: WikiPage[];
  wiki_claims: WikiClaim[];
  diagnostics?: Diagnostic[];
  runtime_identity?: {
    actor_identity?: ActorIdentity;
    owner_identity?: ActorIdentity;
    runtime_instance?: RuntimeInstance;
    runtime_session?: RuntimeSession;
    conversation_thread?: ConversationThread;
  };
  identity_context?: {
    actor_identity_ref?: string | null;
    runtime_instance_ref?: string | null;
    runtime_session_ref?: string | null;
    conversation_thread_ref?: string | null;
  };
  ids: {
    canon_artifact: string;
    world_artifact: string;
    wiki_artifact: string;
    manifest: string;
  };
}

export interface OpenClawBootstrapCompilation {
  markdown: string;
  artifacts: ProjectionArtifact[];
  manifest: ProjectionManifest;
}

export function compileOpenClawBootstrapProjection(input: OpenClawBootstrapCompilationInput): OpenClawBootstrapCompilation {
  const episodes = input.episodes ?? [];
  const entities = input.entities ?? [];
  const relations = input.relations ?? [];
  const contradictions = input.contradictions ?? [];
  const runtime_refs = [
    input.runtime_identity?.actor_identity?.id,
    input.runtime_identity?.owner_identity?.id,
    input.runtime_identity?.runtime_instance?.id,
    input.runtime_identity?.runtime_session?.id,
    input.runtime_identity?.conversation_thread?.id,
  ].filter((value): value is string => typeof value === "string");
  const canon_refs = input.canonical_records.map((record) => record.id);
  const world_refs = input.world_claims.map((record) => record.id);
  const episode_refs = episodes.map((record) => record.id);
  const entity_refs = entities.map((record) => record.id);
  const relation_refs = relations.map((record) => record.id);
  const contradiction_refs = contradictions.map((record) => record.id);
  const wiki_page_refs = input.wiki_pages.map((record) => record.id);
  const wiki_claim_refs = input.wiki_claims.map((record) => record.id);
  const diagnostic_refs = (input.diagnostics ?? []).map((record) => record.id);

  const artifacts: ProjectionArtifact[] = [
    createProjectionArtifact({
      id: input.ids.canon_artifact,
      adapter: "openclaw",
      artifact_kind: "layer_fragment",
      path: `${input.projection_path}#canon`,
      source_layer: "canon",
      authoritative_home: "canon",
      upstream_refs: canon_refs,
      now: input.now,
      visibility_state: input.visibility_state,
    }),
    createProjectionArtifact({
      id: input.ids.world_artifact,
      adapter: "openclaw",
      artifact_kind: "layer_fragment",
      path: `${input.projection_path}#world`,
      source_layer: "world",
      authoritative_home: "world",
      upstream_refs: uniqueRefs(world_refs, episode_refs, entity_refs, relation_refs, contradiction_refs),
      now: input.now,
      visibility_state: input.visibility_state,
    }),
    createProjectionArtifact({
      id: input.ids.wiki_artifact,
      adapter: "openclaw",
      artifact_kind: "layer_fragment",
      path: `${input.projection_path}#wiki`,
      source_layer: "wiki",
      authoritative_home: "wiki",
      upstream_refs: uniqueRefs(wiki_page_refs, wiki_claim_refs),
      now: input.now,
      visibility_state: input.visibility_state,
    }),
  ];

  const markdown = [
    "# OpenClaw Bootstrap Memory",
    "",
    `Compiled at: ${input.now}`,
    "",
    "## Runtime",
    ...renderRuntimeSection(input.runtime_identity),
    "",
    "## Canon",
    ...renderCanonSection(input.canonical_records),
    "",
    "## World Claims",
    ...renderWorldSection(input.world_claims),
    "",
    "## Episodes",
    ...renderEpisodeSection(episodes),
    "",
    "## Entities",
    ...renderEntitySection(entities),
    "",
    "## Relations",
    ...renderRelationSection(relations),
    "",
    "## Contradictions",
    ...renderContradictionSection(contradictions),
    "",
    "## Wiki",
    ...renderWikiSection(input.wiki_pages, input.wiki_claims),
    "",
    "## Diagnostics",
    ...renderDiagnosticsSection(input.diagnostics ?? []),
    "",
    "## Provenance",
    ...uniqueRefs(
      runtime_refs,
      canon_refs,
      world_refs,
      episode_refs,
      entity_refs,
      relation_refs,
      contradiction_refs,
      wiki_page_refs,
      wiki_claim_refs,
      diagnostic_refs,
    ).map((ref) => `- ${ref}`),
    "",
  ].join("\n");

  const manifest = createProjectionManifest({
    id: input.ids.manifest,
    adapter: "openclaw",
    projection_profile: "bootstrap",
    audience: "runtime",
    actor_identity_ref: input.identity_context?.actor_identity_ref ?? null,
    runtime_instance_ref: input.identity_context?.runtime_instance_ref ?? null,
    runtime_session_ref: input.identity_context?.runtime_session_ref ?? null,
    conversation_thread_ref: input.identity_context?.conversation_thread_ref ?? null,
    diagnostic_refs: diagnostic_refs.length > 0 ? diagnostic_refs : undefined,
    artifact_refs: artifacts.map((artifact) => artifact.id),
    upstream_refs: uniqueRefs(
      runtime_refs,
      canon_refs,
      world_refs,
      episode_refs,
      entity_refs,
      relation_refs,
      contradiction_refs,
      wiki_page_refs,
      wiki_claim_refs,
      diagnostic_refs,
    ),
    now: input.now,
    visibility_state: input.visibility_state,
  });

  return {
    markdown,
    artifacts,
    manifest,
  };
}
