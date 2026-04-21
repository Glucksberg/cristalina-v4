import {
  createProjectionArtifact,
  createProjectionManifest,
  DEFAULT_PROJECTION_READ_POLICY_VERSION,
  filterProjectionRecords,
  type ProjectionReadContext,
} from "../adapter-sdk/projection.js";
import type {
  ActorIdentity,
  CanonicalMemoryObject,
  Contradiction,
  ContradictionResolution,
  CurationPacket,
  Diagnostic,
  DispositionRecord,
  Entity,
  Episode,
  ProjectionArtifact,
  ProjectionManifest,
  Proposal,
  RatificationRecord,
  Relation,
  RuntimeInstance,
  RuntimeSession,
  SourceRecord,
  ConversationThread,
  VisibilityState,
  WikiClaim,
  WikiMaintenanceRun,
  WikiPage,
  WorldClaim,
} from "../types.js";

export interface MemoryBrowserProjectionInput {
  now: string;
  visibility_state: VisibilityState;
  read_context?: ProjectionReadContext;
  ids: {
    json_artifact: string;
    html_artifact: string;
    manifest: string;
  };
  source_records: SourceRecord[];
  actor_identities?: ActorIdentity[];
  runtime_instances?: RuntimeInstance[];
  runtime_sessions?: RuntimeSession[];
  conversation_threads?: ConversationThread[];
  canonical_records: CanonicalMemoryObject[];
  world_claims: WorldClaim[];
  episodes?: Episode[];
  entities?: Entity[];
  relations?: Relation[];
  contradictions?: Contradiction[];
  contradiction_resolutions?: ContradictionResolution[];
  wiki_pages: WikiPage[];
  wiki_claims: WikiClaim[];
  wiki_maintenance_runs?: WikiMaintenanceRun[];
  proposals?: Proposal[];
  curation_packets?: CurationPacket[];
  ratification_records?: RatificationRecord[];
  disposition_records?: DispositionRecord[];
  diagnostics?: Diagnostic[];
  projection_artifacts?: ProjectionArtifact[];
  projection_manifests?: ProjectionManifest[];
}

export interface MemoryBrowserProjectionResult {
  snapshot: Record<string, unknown>;
  json: string;
  html: string;
  artifacts: ProjectionArtifact[];
  manifest: ProjectionManifest;
}

function countBy<T extends { kind: string }>(records: T[]): Record<string, number> {
  return records.reduce<Record<string, number>>((counts, record) => {
    counts[record.kind] = (counts[record.kind] ?? 0) + 1;
    return counts;
  }, {});
}

function refs(records: Array<{ id: string }>): string[] {
  return records.map((record) => record.id);
}

function text(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderList(title: string, items: Array<{ id: string; label: string; meta?: string }>): string {
  const rows = items.length
    ? items.map((item) => `<li><code>${text(item.id)}</code> ${text(item.label)}${item.meta ? ` <small>${text(item.meta)}</small>` : ""}</li>`).join("\n")
    : "<li><em>empty</em></li>";
  return `<section><h2>${text(title)}</h2><ul>${rows}</ul></section>`;
}

function artifactPath(manifestId: string, filename: string): string {
  return `derived/openclaw/${manifestId}/${filename}`;
}

export function compileMemoryBrowserProjection(input: MemoryBrowserProjectionInput): MemoryBrowserProjectionResult {
  const projectionContext = input.read_context ?? {
    adapter: "openclaw" as const,
    audience: "memory_browser",
  };
  const sourceFilter = filterProjectionRecords(input.source_records, projectionContext);
  const actorIdentityFilter = filterProjectionRecords(input.actor_identities ?? [], projectionContext);
  const runtimeInstanceFilter = filterProjectionRecords(input.runtime_instances ?? [], projectionContext);
  const runtimeSessionFilter = filterProjectionRecords(input.runtime_sessions ?? [], projectionContext);
  const conversationThreadFilter = filterProjectionRecords(input.conversation_threads ?? [], projectionContext);
  const canonicalFilter = filterProjectionRecords(input.canonical_records, projectionContext);
  const worldClaimsFilter = filterProjectionRecords(input.world_claims, projectionContext);
  const episodesFilter = filterProjectionRecords(input.episodes ?? [], projectionContext);
  const entitiesFilter = filterProjectionRecords(input.entities ?? [], projectionContext);
  const relationsFilter = filterProjectionRecords(input.relations ?? [], projectionContext);
  const contradictionsFilter = filterProjectionRecords(input.contradictions ?? [], projectionContext);
  const contradictionResolutionsFilter = filterProjectionRecords(input.contradiction_resolutions ?? [], projectionContext);
  const wikiPagesFilter = filterProjectionRecords(input.wiki_pages, projectionContext);
  const wikiClaimsFilter = filterProjectionRecords(input.wiki_claims, projectionContext);
  const wikiRunsFilter = filterProjectionRecords(input.wiki_maintenance_runs ?? [], projectionContext);
  const proposalsFilter = filterProjectionRecords(input.proposals ?? [], projectionContext);
  const curationPacketsFilter = filterProjectionRecords(input.curation_packets ?? [], projectionContext);
  const ratificationRecordsFilter = filterProjectionRecords(input.ratification_records ?? [], projectionContext);
  const dispositionRecordsFilter = filterProjectionRecords(input.disposition_records ?? [], projectionContext);
  const diagnosticsFilter = filterProjectionRecords(input.diagnostics ?? [], projectionContext);
  const projectionArtifactsFilter = filterProjectionRecords(input.projection_artifacts ?? [], projectionContext);
  const projectionManifestsFilter = filterProjectionRecords(input.projection_manifests ?? [], projectionContext);
  const runtimeRecords = [
    ...runtimeInstanceFilter.included,
    ...runtimeSessionFilter.included,
    ...conversationThreadFilter.included,
  ];
  const worldRecords = [
    ...worldClaimsFilter.included,
    ...episodesFilter.included,
    ...entitiesFilter.included,
    ...relationsFilter.included,
    ...contradictionsFilter.included,
  ];
  const governanceRecords = [
    ...proposalsFilter.included,
    ...curationPacketsFilter.included,
    ...ratificationRecordsFilter.included,
    ...dispositionRecordsFilter.included,
    ...contradictionResolutionsFilter.included,
  ];
  const wikiRecords = [
    ...wikiPagesFilter.included,
    ...wikiClaimsFilter.included,
    ...wikiRunsFilter.included,
  ];
  const derivedRecords = [
    ...projectionArtifactsFilter.included,
    ...projectionManifestsFilter.included,
  ];
  const auditRecords = diagnosticsFilter.included;
  const read_policy_suppressed_records = [
    ...sourceFilter.suppressed,
    ...actorIdentityFilter.suppressed,
    ...runtimeInstanceFilter.suppressed,
    ...runtimeSessionFilter.suppressed,
    ...conversationThreadFilter.suppressed,
    ...canonicalFilter.suppressed,
    ...worldClaimsFilter.suppressed,
    ...episodesFilter.suppressed,
    ...entitiesFilter.suppressed,
    ...relationsFilter.suppressed,
    ...contradictionsFilter.suppressed,
    ...contradictionResolutionsFilter.suppressed,
    ...wikiPagesFilter.suppressed,
    ...wikiClaimsFilter.suppressed,
    ...wikiRunsFilter.suppressed,
    ...proposalsFilter.suppressed,
    ...curationPacketsFilter.suppressed,
    ...ratificationRecordsFilter.suppressed,
    ...dispositionRecordsFilter.suppressed,
    ...diagnosticsFilter.suppressed,
    ...projectionArtifactsFilter.suppressed,
    ...projectionManifestsFilter.suppressed,
  ];
  const editorial_suppressed_records = wikiClaimsFilter.included
    .filter((claim) => claim.claim_status !== "candidate_for_promotion")
    .map((claim) => ({
      id: claim.id,
      kind: claim.kind,
      reason_code: "wiki_editorial_claim_not_authority",
    }));
  const suppressed_records = [
    ...read_policy_suppressed_records,
    ...editorial_suppressed_records,
  ];

  const snapshot = {
    projection_profile: "memory_browser",
    generated_at: input.now,
    read_only: true,
    authority_model: {
      wiki: "editorial memory; not canonical authority",
      browser: "derived read-only projection; never a write path",
      canon: "ratified authority remains in canon records",
      governance: "proposal and ratification records remain the only canon promotion path",
    },
    counts: {
      raw: sourceFilter.included.length,
      runtime: runtimeRecords.length,
      world: worldRecords.length,
      canon: canonicalFilter.included.length,
      wiki: wikiRecords.length,
      governance: governanceRecords.length,
      derived: derivedRecords.length,
      audits: auditRecords.length,
    },
    by_kind: {
      raw: countBy(sourceFilter.included),
      runtime: countBy(runtimeRecords),
      world: countBy(worldRecords),
      canon: countBy(canonicalFilter.included),
      wiki: countBy(wikiRecords),
      governance: countBy(governanceRecords),
      derived: countBy(derivedRecords),
      audits: countBy(auditRecords),
    },
    wiki: {
      pages: wikiPagesFilter.included.map((page) => ({
        id: page.id,
        title: page.title,
        page_kind: page.page_kind,
        path: page.path,
        quality_score: page.quality_score ?? null,
        retention_priority: page.retention_priority ?? null,
        staleness_state: page.staleness_state ?? null,
        source_refs: page.source_refs,
        canonical_refs: page.canonical_refs,
        world_refs: page.world_refs,
        wiki_claim_refs: page.wiki_claim_refs ?? [],
      })),
      claims: wikiClaimsFilter.included.map((claim) => ({
        id: claim.id,
        statement: claim.statement,
        page_ref: claim.page_ref,
        claim_status: claim.claim_status,
        confidence_score: claim.confidence_score ?? null,
        support_count: claim.support_count ?? claim.support_refs?.length ?? 0,
        staleness_state: claim.staleness_state ?? null,
        supersedes_ref: claim.supersedes_ref ?? null,
        superseded_by_ref: claim.superseded_by_ref ?? null,
        source_refs: claim.source_refs,
        support_refs: claim.support_refs ?? [],
      })),
      maintenance_runs: wikiRunsFilter.included.map((run) => ({
        id: run.id,
        event: run.event,
        status: run.status,
        page_refs: run.page_refs,
        claim_refs: run.claim_refs,
        diagnostic_refs: run.diagnostic_refs,
        graph_edges: run.graph_edges,
      })),
    },
    diagnostics: auditRecords.map((diagnostic) => ({
      id: diagnostic.id,
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      related_refs: diagnostic.related_refs,
    })),
    projection_suppression: {
      suppressed_records,
    },
  };

  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cristalina Memory Browser</title>
<style>
body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:2rem;line-height:1.45;color:#1f2933;background:#f7f8fa}
main{max-width:1100px;margin:0 auto}
section{border-top:1px solid #d7dde5;padding:1rem 0}
code{background:#e8edf3;padding:.1rem .25rem;border-radius:4px}
small{color:#52606d}
.counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.5rem}
.counts div{background:white;border:1px solid #d7dde5;border-radius:6px;padding:.75rem}
</style>
</head>
<body>
<main>
<h1>Cristalina Memory Browser</h1>
<p>Read-only projection. Wiki material is editorial memory, not canonical authority.</p>
<section><h2>Layer Counts</h2><div class="counts">${Object.entries(snapshot.counts)
    .map(([layer, count]) => `<div><strong>${text(layer)}</strong><br>${text(count)}</div>`)
    .join("")}</div></section>
${renderList("Wiki Pages", wikiPagesFilter.included.map((page) => ({ id: page.id, label: page.title, meta: `${page.page_kind}; ${page.staleness_state ?? "current"}` })))}
${renderList("Wiki Claims", wikiClaimsFilter.included.map((claim) => ({ id: claim.id, label: claim.statement, meta: claim.claim_status })))}
${renderList("Canon", canonicalFilter.included.map((record) => ({ id: record.id, label: record.statement, meta: record.governance_state })))}
${renderList("Governance", governanceRecords.map((record) => ({ id: record.id, label: record.kind })))}
${renderList("Diagnostics", auditRecords.map((record) => ({ id: record.id, label: record.message, meta: record.severity })))}
</main>
</body>
</html>
`;

  const upstream_refs = [
    ...refs(sourceFilter.included),
    ...refs(actorIdentityFilter.included),
    ...refs(runtimeRecords),
    ...refs(worldRecords),
    ...refs(canonicalFilter.included),
    ...refs(wikiRecords),
    ...refs(governanceRecords),
    ...refs(auditRecords),
    ...refs(derivedRecords),
  ];
  const artifacts = [
    createProjectionArtifact({
      id: input.ids.json_artifact,
      adapter: "openclaw",
      artifact_kind: "memory_browser_json",
      path: artifactPath(input.ids.manifest, "memory-browser.json.txt"),
      source_layer: "derived",
      authoritative_home: "wiki",
      upstream_refs,
      now: input.now,
      visibility_state: input.visibility_state,
    }),
    createProjectionArtifact({
      id: input.ids.html_artifact,
      adapter: "openclaw",
      artifact_kind: "memory_browser_html",
      path: artifactPath(input.ids.manifest, "index.html"),
      source_layer: "derived",
      authoritative_home: "wiki",
      upstream_refs,
      now: input.now,
      visibility_state: input.visibility_state,
    }),
  ];
  const manifest = createProjectionManifest({
    id: input.ids.manifest,
    adapter: "openclaw",
    projection_profile: "memory_browser",
    audience: "memory_browser",
    read_policy_version: DEFAULT_PROJECTION_READ_POLICY_VERSION,
    context_refs: [],
    suppressed_refs: suppressed_records.map((record) => record.id),
    suppressed_records,
    diagnostic_refs: auditRecords.map((diagnostic) => diagnostic.id),
    artifact_refs: artifacts.map((artifact) => artifact.id),
    upstream_refs,
    now: input.now,
    visibility_state: input.visibility_state,
  });

  return {
    snapshot,
    json,
    html,
    artifacts,
    manifest,
  };
}
