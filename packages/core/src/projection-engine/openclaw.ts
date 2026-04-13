import { createProjectionArtifact, createProjectionManifest } from "../adapter-sdk/projection.js";
import type {
  CanonicalMemoryObject,
  Diagnostic,
  ProjectionArtifact,
  ProjectionManifest,
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
  wiki_pages: WikiPage[];
  wiki_claims: WikiClaim[];
  diagnostics?: Diagnostic[];
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
  const canon_refs = input.canonical_records.map((record) => record.id);
  const world_refs = input.world_claims.map((record) => record.id);
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
      upstream_refs: world_refs,
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
    "## Canon",
    ...renderCanonSection(input.canonical_records),
    "",
    "## World",
    ...renderWorldSection(input.world_claims),
    "",
    "## Wiki",
    ...renderWikiSection(input.wiki_pages, input.wiki_claims),
    "",
    "## Diagnostics",
    ...renderDiagnosticsSection(input.diagnostics ?? []),
    "",
    "## Provenance",
    ...uniqueRefs(canon_refs, world_refs, wiki_page_refs, wiki_claim_refs, diagnostic_refs).map((ref) => `- ${ref}`),
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
    upstream_refs: uniqueRefs(canon_refs, world_refs, wiki_page_refs, wiki_claim_refs, diagnostic_refs),
    now: input.now,
    visibility_state: input.visibility_state,
  });

  return {
    markdown,
    artifacts,
    manifest,
  };
}
