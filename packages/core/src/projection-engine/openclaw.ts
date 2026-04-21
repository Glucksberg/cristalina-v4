import {
  DEFAULT_PROJECTION_READ_POLICY_VERSION,
  filterProjectionRecords,
  partitionProjectionClaimsForRuntime,
  createProjectionArtifact,
  createProjectionManifest,
} from "../adapter-sdk/projection.js";
import type {
  ActorIdentity,
  CanonicalMemoryObject,
  ContradictionResolution,
  Contradiction,
  ConversationThread,
  CurationPacket,
  Diagnostic,
  Entity,
  Episode,
  ProjectionArtifact,
  ProjectionManifest,
  ProjectionRetrievalTrace,
  RetrievalCandidate,
  RetrievalResult,
  Relation,
  RuntimeKind,
  RuntimeInstance,
  RuntimeSession,
  VisibilityState,
  WikiClaim,
  WikiPage,
  WorldClaim,
} from "../types.js";

type ProjectionAdapterKind = Exclude<RuntimeKind, "generic">;

export function defaultRuntimeBootstrapProjectionPath(
  adapter: ProjectionAdapterKind,
  manifestId: string,
): string {
  return `derived/${adapter}/${manifestId}/bootstrap-memory.md`;
}

export function defaultOpenClawBootstrapProjectionPath(manifestId: string): string {
  return defaultRuntimeBootstrapProjectionPath("openclaw", manifestId);
}

export function defaultHermesBootstrapProjectionPath(manifestId: string): string {
  return defaultRuntimeBootstrapProjectionPath("hermes", manifestId);
}

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

function renderContradictionResolutionSection(records: ContradictionResolution[]): string[] {
  if (records.length === 0) return ["- (none)"];
  return records.map((record) => `- [contradiction-resolution:${record.id}] (${record.status}) ${record.strategy} for ${record.contradiction_ref}`);
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

function renderReviewQueueSection(records: CurationPacket[]): string[] {
  const pending = records.filter((record) => record.status === "pending");
  if (pending.length === 0) return ["- (none)"];
  return pending.map((record) => {
    const proposalRef = record.proposal_refs[0] ?? "unknown";
    return `- [review:${record.id}] (${record.review_kind ?? "review"}; ${record.status}) proposal=${proposalRef}`;
  });
}

function renderReviewTraceSection(records: CurationPacket[]): string[] {
  const trace = records.filter((record) => record.status !== "pending");
  if (trace.length === 0) return ["- (none)"];
  return trace.map((record) => {
    const proposalRef = record.proposal_refs[0] ?? "unknown";
    return `- [review:${record.id}] (${record.review_kind ?? "review"}; ${record.status}) proposal=${proposalRef}`;
  });
}

function renderRetrievalCandidateLine(state: "included" | "suppressed", candidate: RetrievalCandidate): string {
  const reasons = state === "included"
    ? candidate.why_retrieved.join(", ")
    : candidate.suppression_reasons?.join(", ") ?? "unspecified";
  return `- [${state}:${candidate.id}] ${candidate.layer}/${candidate.authority} ref=${candidate.ref.id} reasons=${reasons}`;
}

function renderRetrievalSection(results: RetrievalResult[]): string[] {
  if (results.length === 0) return ["- (none)"];

  const lines: string[] = [];
  for (const result of results) {
    lines.push(`- result query=${result.query_ref} recipe=${result.recipe_ref} trace=${result.trace_ref ?? "none"}`);
    for (const candidate of result.included_candidates) {
      lines.push(renderRetrievalCandidateLine("included", candidate));
    }
    for (const candidate of result.suppressed_candidates) {
      lines.push(renderRetrievalCandidateLine("suppressed", candidate));
    }
  }
  return lines;
}

function summarizeRetrievalTraces(results: RetrievalResult[]): ProjectionRetrievalTrace[] {
  return results.map((result) => ({
    ...(result.trace_ref ? { trace_ref: result.trace_ref } : {}),
    query_ref: result.query_ref,
    recipe_ref: result.recipe_ref,
    included_candidate_refs: result.included_candidates.map((candidate) => candidate.id),
    suppressed_candidate_refs: result.suppressed_candidates.map((candidate) => candidate.id),
    suppression_reasons: [
      ...new Set(result.suppressed_candidates.flatMap((candidate) => candidate.suppression_reasons ?? [])),
    ],
  }));
}

export interface OpenClawBootstrapCompilationInput {
  adapter?: ProjectionAdapterKind;
  now: string;
  visibility_state: VisibilityState;
  projection_path: string;
  canonical_records: CanonicalMemoryObject[];
  world_claims: WorldClaim[];
  episodes?: Episode[];
  entities?: Entity[];
  relations?: Relation[];
  contradictions?: Contradiction[];
  contradiction_resolutions?: ContradictionResolution[];
  wiki_pages: WikiPage[];
  wiki_claims: WikiClaim[];
  curation_packets?: CurationPacket[];
  diagnostics?: Diagnostic[];
  retrieval_results?: RetrievalResult[];
  runtime_identity?: {
    actor_identity?: ActorIdentity;
    owner_identity?: ActorIdentity;
    runtime_instance?: RuntimeInstance;
    runtime_session?: RuntimeSession;
    conversation_thread?: ConversationThread;
  };
  identity_context?: {
    actor_identity_ref?: string | null;
    owner_identity_ref?: string | null;
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
  const adapter = input.adapter ?? "openclaw";
  const projectionContext = {
    adapter,
    audience: "runtime",
    actor_identity_ref: input.identity_context?.actor_identity_ref ?? null,
    owner_identity_ref: input.identity_context?.owner_identity_ref ?? null,
    runtime_instance_ref: input.identity_context?.runtime_instance_ref ?? null,
    runtime_session_ref: input.identity_context?.runtime_session_ref ?? null,
    conversation_thread_ref: input.identity_context?.conversation_thread_ref ?? null,
  };

  const actorIdentityFilter = input.runtime_identity?.actor_identity
    ? filterProjectionRecords([input.runtime_identity.actor_identity], projectionContext)
    : undefined;
  const ownerIdentityFilter = input.runtime_identity?.owner_identity
    ? filterProjectionRecords([input.runtime_identity.owner_identity], projectionContext)
    : undefined;
  const runtimeInstanceFilter = input.runtime_identity?.runtime_instance
    ? filterProjectionRecords([input.runtime_identity.runtime_instance], projectionContext)
    : undefined;
  const runtimeSessionFilter = input.runtime_identity?.runtime_session
    ? filterProjectionRecords([input.runtime_identity.runtime_session], projectionContext)
    : undefined;
  const conversationThreadFilter = input.runtime_identity?.conversation_thread
    ? filterProjectionRecords([input.runtime_identity.conversation_thread], projectionContext)
    : undefined;

  const actor_identity = actorIdentityFilter?.included[0];
  const owner_identity = ownerIdentityFilter?.included[0];
  const runtime_instance = runtimeInstanceFilter?.included[0];
  const runtime_session = runtimeSessionFilter?.included[0];
  const conversation_thread = conversationThreadFilter?.included[0];

  const episodesFilter = filterProjectionRecords(input.episodes ?? [], projectionContext);
  const entitiesFilter = filterProjectionRecords(input.entities ?? [], projectionContext);
  const relationsFilter = filterProjectionRecords(input.relations ?? [], projectionContext);
  const worldClaimsFilter = filterProjectionRecords(input.world_claims, projectionContext);
  const contradictionsFilter = filterProjectionRecords(input.contradictions ?? [], projectionContext);
  const contradictionResolutionsFilter = filterProjectionRecords(input.contradiction_resolutions ?? [], projectionContext);
  const wikiPagesFilter = filterProjectionRecords(input.wiki_pages, projectionContext);
  const wikiClaimsFilter = filterProjectionRecords(input.wiki_claims, projectionContext);
  const diagnosticsFilter = filterProjectionRecords(input.diagnostics ?? [], projectionContext);
  const curationPacketsFilter = filterProjectionRecords(input.curation_packets ?? [], projectionContext);
  const canonicalFilter = filterProjectionRecords(input.canonical_records, projectionContext);

  const runtimeSuppressed = [
    ...(actorIdentityFilter?.suppressed ?? []),
    ...(ownerIdentityFilter?.suppressed ?? []),
    ...(runtimeInstanceFilter?.suppressed ?? []),
    ...(runtimeSessionFilter?.suppressed ?? []),
    ...(conversationThreadFilter?.suppressed ?? []),
  ];

  const episodes = episodesFilter.included;
  const entities = entitiesFilter.included;
  const relations = relationsFilter.included;
  const contradictions = contradictionsFilter.included;
  const contradiction_resolutions = contradictionResolutionsFilter.included;
  const world_claims = worldClaimsFilter.included;
  const wiki_pages = wikiPagesFilter.included;
  const wiki_claims = wikiClaimsFilter.included;
  const diagnostics = diagnosticsFilter.included;
  const curation_packets = curationPacketsFilter.included;
  const canonical_records = canonicalFilter.included.filter((record) => record.governance_state === "ratified");

  const suppressed_refs = [
    ...runtimeSuppressed,
    ...episodesFilter.suppressed,
    ...entitiesFilter.suppressed,
    ...relationsFilter.suppressed,
    ...worldClaimsFilter.suppressed,
    ...contradictionsFilter.suppressed,
    ...contradictionResolutionsFilter.suppressed,
    ...wikiPagesFilter.suppressed,
    ...wikiClaimsFilter.suppressed,
    ...curationPacketsFilter.suppressed,
    ...diagnosticsFilter.suppressed,
    ...canonicalFilter.suppressed,
  ];
  const suppressed_records = suppressed_refs;
  const suppressed_ref_ids = suppressed_records.map((entry) => entry.id);

  const worldClaimPartitions = partitionProjectionClaimsForRuntime(world_claims, projectionContext);
  const active_world_claims = worldClaimPartitions.active;
  const traced_world_claims = worldClaimPartitions.trace;

  const runtime_refs = [
    actor_identity?.id ?? input.identity_context?.actor_identity_ref ?? null,
    owner_identity?.id ?? input.identity_context?.owner_identity_ref ?? null,
    runtime_instance?.id ?? input.identity_context?.runtime_instance_ref ?? null,
    runtime_session?.id ?? input.identity_context?.runtime_session_ref ?? null,
    conversation_thread?.id ?? input.identity_context?.conversation_thread_ref ?? null,
  ].filter((value): value is string => typeof value === "string");
  const canon_refs = canonical_records.map((record) => record.id);
  const world_refs = world_claims.map((record) => record.id);
  const episode_refs = episodes.map((record) => record.id);
  const entity_refs = entities.map((record) => record.id);
  const relation_refs = relations.map((record) => record.id);
  const contradiction_refs = contradictions.map((record) => record.id);
  const contradiction_resolution_refs = contradiction_resolutions.map((record) => record.id);
  const wiki_page_refs = wiki_pages.map((record) => record.id);
  const wiki_claim_refs = wiki_claims.map((record) => record.id);
  const diagnostic_refs = diagnostics.map((record) => record.id);
  const review_refs = curation_packets.map((record) => record.id);
  const retrieval_results = input.retrieval_results ?? [];
  const retrieval_traces = summarizeRetrievalTraces(retrieval_results);
  const retrieval_trace_refs = uniqueRefs(retrieval_traces.flatMap((trace) => trace.trace_ref ? [trace.trace_ref] : []));
  const included_retrieval_candidate_refs = uniqueRefs(retrieval_traces.map((trace) => trace.included_candidate_refs).flat());
  const suppressed_retrieval_candidate_refs = uniqueRefs(retrieval_traces.map((trace) => trace.suppressed_candidate_refs).flat());
  const retrieval_upstream_refs = uniqueRefs(
    retrieval_results.map((result) => result.query_ref),
    retrieval_results.map((result) => result.recipe_ref),
    retrieval_trace_refs,
    retrieval_results.flatMap((result) => [
      ...result.included_candidates.map((candidate) => candidate.ref.id),
      ...result.suppressed_candidates.map((candidate) => candidate.ref.id),
    ]),
  );
  const all_runtime_refs = [
    input.runtime_identity?.actor_identity?.id ?? input.identity_context?.actor_identity_ref ?? null,
    input.runtime_identity?.owner_identity?.id ?? input.identity_context?.owner_identity_ref ?? null,
    input.runtime_identity?.runtime_instance?.id ?? input.identity_context?.runtime_instance_ref ?? null,
    input.runtime_identity?.runtime_session?.id ?? input.identity_context?.runtime_session_ref ?? null,
    input.runtime_identity?.conversation_thread?.id ?? input.identity_context?.conversation_thread_ref ?? null,
  ].filter((value): value is string => typeof value === "string");
  const all_canon_refs = input.canonical_records
    .filter((record) => record.governance_state === "ratified")
    .map((record) => record.id);
  const all_world_refs = input.world_claims.map((record) => record.id);
  const all_episode_refs = (input.episodes ?? []).map((record) => record.id);
  const all_entity_refs = (input.entities ?? []).map((record) => record.id);
  const all_relation_refs = (input.relations ?? []).map((record) => record.id);
  const all_contradiction_refs = (input.contradictions ?? []).map((record) => record.id);
  const all_contradiction_resolution_refs = (input.contradiction_resolutions ?? []).map((record) => record.id);
  const all_wiki_page_refs = input.wiki_pages.map((record) => record.id);
  const all_wiki_claim_refs = input.wiki_claims.map((record) => record.id);
  const all_diagnostic_refs = (input.diagnostics ?? []).map((record) => record.id);
  const all_review_refs = (input.curation_packets ?? []).map((record) => record.id);

  const artifacts: ProjectionArtifact[] = [
    createProjectionArtifact({
      id: input.ids.canon_artifact,
      adapter,
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
      adapter,
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
      adapter,
      artifact_kind: "layer_fragment",
      path: `${input.projection_path}#wiki`,
      source_layer: "wiki",
      authoritative_home: "wiki",
      upstream_refs: uniqueRefs(wiki_page_refs, wiki_claim_refs),
      now: input.now,
      visibility_state: input.visibility_state,
    }),
  ];

  const runtime_identity = actor_identity || owner_identity || runtime_instance || runtime_session || conversation_thread
    ? {
        actor_identity,
        owner_identity,
        runtime_instance,
        runtime_session,
        conversation_thread,
      }
    : undefined;

  const projectionTitle = adapter === "hermes" ? "Hermes Bootstrap Memory" : "OpenClaw Bootstrap Memory";

  const markdown = [
    `# ${projectionTitle}`,
    "",
    `Compiled at: ${input.now}`,
    "",
    "## Runtime",
    ...renderRuntimeSection(runtime_identity),
    "",
    "## Canon",
    ...renderCanonSection(canonical_records),
    "",
    "## World Claims",
    ...renderWorldSection(active_world_claims),
    "",
    "## World Trace",
    ...renderWorldSection(traced_world_claims),
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
    "## Contradiction Resolutions",
    ...renderContradictionResolutionSection(contradiction_resolutions),
    "",
    "## Wiki",
    ...renderWikiSection(wiki_pages, wiki_claims),
    "",
    "## Diagnostics",
    ...renderDiagnosticsSection(diagnostics),
    "",
    "## Review Queue",
    ...renderReviewQueueSection(curation_packets),
    "",
    "## Review Trace",
    ...renderReviewTraceSection(curation_packets),
    "",
    "## Retrieval",
    ...renderRetrievalSection(retrieval_results),
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
      contradiction_resolution_refs,
      wiki_page_refs,
      wiki_claim_refs,
      review_refs,
      diagnostic_refs,
      retrieval_upstream_refs,
    ).map((ref) => `- ${ref}`),
    "",
  ].join("\n");

  const manifest = createProjectionManifest({
    id: input.ids.manifest,
    adapter,
    projection_profile: "bootstrap",
    audience: "runtime",
    read_policy_version: DEFAULT_PROJECTION_READ_POLICY_VERSION,
    actor_identity_ref: input.identity_context?.actor_identity_ref ?? null,
    owner_identity_ref: input.identity_context?.owner_identity_ref ?? null,
    runtime_instance_ref: input.identity_context?.runtime_instance_ref ?? null,
    runtime_session_ref: input.identity_context?.runtime_session_ref ?? null,
    conversation_thread_ref: input.identity_context?.conversation_thread_ref ?? null,
    context_refs: runtime_refs,
    suppressed_refs: suppressed_ref_ids,
    suppressed_records,
    retrieval_trace_refs: retrieval_trace_refs.length > 0 ? retrieval_trace_refs : undefined,
    included_retrieval_candidate_refs: included_retrieval_candidate_refs.length > 0 ? included_retrieval_candidate_refs : undefined,
    suppressed_retrieval_candidate_refs: suppressed_retrieval_candidate_refs.length > 0 ? suppressed_retrieval_candidate_refs : undefined,
    retrieval_traces: retrieval_traces.length > 0 ? retrieval_traces : undefined,
    diagnostic_refs: diagnostic_refs.length > 0 ? diagnostic_refs : undefined,
    review_refs: review_refs.length > 0 ? review_refs : undefined,
    artifact_refs: artifacts.map((artifact) => artifact.id),
    upstream_refs: uniqueRefs(
      all_runtime_refs,
      all_canon_refs,
      all_world_refs,
      all_episode_refs,
      all_entity_refs,
      all_relation_refs,
      all_contradiction_refs,
      all_contradiction_resolution_refs,
      all_wiki_page_refs,
      all_wiki_claim_refs,
      all_review_refs,
      all_diagnostic_refs,
      retrieval_upstream_refs,
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
