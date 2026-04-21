import { mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { appendAuditChange, appendValidationLog } from "../audit/log.js";
import { resolveProjectionArtifactPath } from "../adapter-sdk/projection-path.js";
import type { ProjectionReadContext } from "../adapter-sdk/projection.js";
import { compileMemoryBrowserProjection, type MemoryBrowserProjectionResult } from "../projection-engine/memory-browser.js";
import { STORAGE_LAYOUT } from "../storage.js";
import { atomicWriteText, isMissingFileError } from "../store/atomic-write.js";
import {
  coreRecordPath,
  initializeStore,
  loadActorIdentities,
  loadCanonicalRecords,
  loadConversationThreads,
  loadContradictionResolutions,
  loadCurationPackets,
  loadDiagnostics,
  loadDispositionRecords,
  loadProjectionArtifacts,
  loadProjectionManifests,
  loadProposals,
  loadRatificationRecords,
  loadRuntimeInstances,
  loadRuntimeSessions,
  loadSourceRecords,
  loadWikiClaims,
  loadWikiMaintenanceRuns,
  loadWikiPages,
  loadWorldClaims,
  loadWorldContradictions,
  loadWorldEntities,
  loadWorldEpisodes,
  loadWorldRelations,
  readCoreRecord,
  writeCoreRecord,
} from "../store/io.js";
import type {
  AuthenticatedPrincipal,
  CoreRecord,
  Diagnostic,
  Proposal,
  Reference,
  SourceRecord,
  VisibilityState,
  WikiClaim,
  WikiGraphEdge,
  WikiMaintenanceEvent,
  WikiMaintenanceRun,
  WikiPage,
} from "../types.js";
import { ValidationError, validateCoreRecord, type ValidationIssue } from "../validation.js";
import { assertStoreRelativeWikiPagePath } from "../wiki/path.js";

export interface WikiMaintenanceIds {
  run: string;
  source_page?: string;
  topic_page?: string;
  query_page?: string;
  synthesis_page?: string;
  claim?: string;
  diagnostic?: string;
  diagnostics?: string[];
  browser_json_artifact: string;
  browser_html_artifact: string;
  browser_manifest: string;
}

export interface WikiMaintenanceInput {
  rootDir: string;
  now: string;
  actor: string;
  authenticated_principal: AuthenticatedPrincipal;
  memory_browser_read_context?: ProjectionReadContext;
  event: WikiMaintenanceEvent;
  ids: WikiMaintenanceIds;
  source_record?: SourceRecord;
  source_summary?: string;
  visibility_state?: VisibilityState;
  topic?: {
    title: string;
    summary: string;
    path?: string;
  };
  claim?: {
    statement: string;
    source_refs?: string[];
    support_refs?: string[];
    confidence_score?: number;
    quality_score?: number;
    candidate_for_promotion?: boolean;
    supersedes_ref?: string | null;
  };
  query_capture?: {
    title?: string;
    question: string;
    answer: string;
    upstream_refs: string[];
  };
  session_crystallization?: {
    title: string;
    summary: string;
    upstream_refs: string[];
  };
  lint?: {
    required_concepts?: string[];
    stale_before?: string;
  };
  retention_reviewed_refs?: string[];
  validation_scope?: string;
}

export interface WikiMaintenanceResult {
  reused: boolean;
  run: WikiMaintenanceRun;
  pages: WikiPage[];
  claims: WikiClaim[];
  diagnostics: Diagnostic[];
  memory_browser: MemoryBrowserProjectionResult;
  validation_issues: ValidationIssue[];
}

export interface WikiClaimProposalCandidateInput {
  now: string;
  proposal_id: string;
  claim: WikiClaim;
  upstream_records: CoreRecord[];
  candidate_kind?: "fact" | "belief" | "preference" | "constraint" | "goal" | "procedure" | "value" | "identity_trait";
  semantic_slot?: string;
  reason?: string;
  visibility_state?: VisibilityState;
}

interface PlannedWikiMarkdown {
  page: WikiPage;
  body: string;
}

function resolveStorePath(rootDir: string, relativePath: string): string {
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

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "wiki-page";
}

function defaultVisibility(input: WikiMaintenanceInput): VisibilityState {
  return input.visibility_state ?? input.source_record?.visibility_state ?? { privacy_scope: "project_private" };
}

function provenance(input: WikiMaintenanceInput, sourceRef: string, evidenceRefs: string[] = []) {
  return {
    source_type: "wiki_maintenance",
    source_ref: sourceRef,
    evidence_refs: unique(evidenceRefs),
    actor_ref: input.actor,
  };
}

function assertAuthenticatedPrincipal(input: WikiMaintenanceInput): void {
  if (!input.authenticated_principal?.actor_ref?.trim()) {
    throw new Error("Wiki maintenance requires an authenticated_principal with actor_ref");
  }
  if (input.authenticated_principal.actor_ref !== input.actor) {
    throw new Error(`Authenticated principal actor_ref ${input.authenticated_principal.actor_ref} must match actor ${input.actor}`);
  }
  if (input.authenticated_principal.kind === "system" && !input.authenticated_principal.system_scope?.trim()) {
    throw new Error("Authenticated system principal requires a non-empty system_scope");
  }
}

function reference(record: { id: string; kind: string; layer: string }): Reference {
  return { id: record.id, kind: record.kind, layer: record.layer as Reference["layer"] };
}

function buildPage(input: {
  base: WikiMaintenanceInput;
  id: string;
  page_kind: WikiPage["page_kind"];
  title: string;
  path?: string;
  source_refs?: string[];
  canonical_refs?: string[];
  world_refs?: string[];
  wiki_claim_refs?: string[];
  outgoing_links?: string[];
  upstream_refs?: string[];
  index_summary?: string;
  existing?: WikiPage;
}): WikiPage {
  const path = input.path ?? input.existing?.path ?? `wiki/pages/${slugify(input.title)}.md`;
  assertStoreRelativeWikiPagePath(path);
  return {
    id: input.existing?.id ?? input.id,
    kind: "wiki_page",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: input.existing?.created_at ?? input.base.now,
    updated_at: input.base.now,
    visibility_state: input.existing?.visibility_state ?? defaultVisibility(input.base),
    provenance: provenance(input.base, input.upstream_refs?.[0] ?? input.base.ids.run, input.upstream_refs),
    upstream_refs: unique([...(input.existing?.upstream_refs ?? []), ...(input.upstream_refs ?? [])]),
    page_kind: input.page_kind,
    title: input.title,
    path,
    source_refs: unique([...(input.existing?.source_refs ?? []), ...(input.source_refs ?? [])]),
    canonical_refs: unique([...(input.existing?.canonical_refs ?? []), ...(input.canonical_refs ?? [])]),
    world_refs: unique([...(input.existing?.world_refs ?? []), ...(input.world_refs ?? [])]),
    wiki_claim_refs: unique([...(input.existing?.wiki_claim_refs ?? []), ...(input.wiki_claim_refs ?? [])]),
    outgoing_links: unique([...(input.existing?.outgoing_links ?? []), ...(input.outgoing_links ?? [])]),
    incoming_links: input.existing?.incoming_links ?? [],
    index_summary: input.index_summary ?? input.existing?.index_summary,
    quality_score: input.existing?.quality_score ?? 0.8,
    retention_priority: input.existing?.retention_priority ?? "normal",
    staleness_state: "current",
  };
}

function renderMarkdown(page: WikiPage, body: string): string {
  return `# ${page.title}

${body}

---

Kind: ${page.page_kind}
Status: ${page.staleness_state ?? "current"}
Quality: ${page.quality_score ?? "unknown"}
Editorial: wiki pages are not canonical authority.
`;
}

async function writeMarkdown(rootDir: string, page: WikiPage, body: string): Promise<void> {
  const filePath = resolveStorePath(rootDir, page.path);
  await mkdir(dirname(filePath), { recursive: true });
  await atomicWriteText(filePath, renderMarkdown(page, body));
}

function findExistingPage(existingPages: WikiPage[], id: string | undefined, title: string, path?: string): WikiPage | undefined {
  return existingPages.find((page) => page.id === id) ??
    existingPages.find((page) => path !== undefined && page.path === path) ??
    existingPages.find((page) => page.title.trim().toLowerCase() === title.trim().toLowerCase());
}

function buildClaim(input: {
  base: WikiMaintenanceInput;
  id: string;
  page_ref: string;
  claim: NonNullable<WikiMaintenanceInput["claim"]>;
  existing?: WikiClaim;
}): WikiClaim {
  const source_refs = unique([
    ...(input.existing?.source_refs ?? []),
    ...(input.claim.source_refs ?? []),
    ...(input.base.source_record ? [input.base.source_record.id] : []),
  ]);
  const support_refs = unique([
    ...(input.existing?.support_refs ?? []),
    ...(input.claim.support_refs ?? []),
    ...source_refs,
  ]);
  return {
    id: input.existing?.id ?? input.id,
    kind: "wiki_claim",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: input.existing?.created_at ?? input.base.now,
    updated_at: input.base.now,
    visibility_state: input.existing?.visibility_state ?? defaultVisibility(input.base),
    provenance: provenance(input.base, input.base.ids.run, support_refs),
    upstream_refs: unique([...(input.existing?.upstream_refs ?? []), ...support_refs]),
    statement: input.claim.statement,
    page_ref: input.page_ref,
    claim_status: input.claim.candidate_for_promotion ? "candidate_for_promotion" : "editorial",
    source_refs,
    support_refs,
    confidence_score: input.claim.confidence_score ?? input.existing?.confidence_score ?? 0.7,
    support_count: support_refs.length,
    last_confirmed_at: support_refs.length > 0 ? input.base.now : null,
    last_seen_at: input.base.now,
    staleness_state: "current",
    supersedes_ref: input.claim.supersedes_ref ?? input.existing?.supersedes_ref ?? null,
    superseded_by_ref: input.existing?.superseded_by_ref ?? null,
    retention_priority: input.existing?.retention_priority ?? "normal",
    quality_score: input.claim.quality_score ?? input.existing?.quality_score ?? 0.75,
  };
}

function diagnostic(input: {
  base: WikiMaintenanceInput;
  id: string;
  code: string;
  severity: Diagnostic["severity"];
  message: string;
  related_refs: string[];
}): Diagnostic {
  return {
    id: input.id,
    kind: "diagnostic",
    layer: "audits",
    authoritative_home: "governance",
    created_at: input.base.now,
    updated_at: input.base.now,
    visibility_state: defaultVisibility(input.base),
    provenance: provenance(input.base, input.base.ids.run, input.related_refs),
    code: input.code,
    severity: input.severity,
    message: input.message,
    related_refs: unique(input.related_refs),
  };
}

function diagnosticId(input: WikiMaintenanceInput, index: number): string {
  return input.ids.diagnostics?.[index] ?? (index === 0 && input.ids.diagnostic ? input.ids.diagnostic : `${input.ids.run}_diagnostic_${String(index + 1).padStart(2, "0")}`);
}

function buildLintDiagnostics(input: WikiMaintenanceInput, pages: WikiPage[], claims: WikiClaim[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const pageIds = new Set(pages.map((page) => page.id));
  const titleCounts = pages.reduce<Map<string, WikiPage[]>>((counts, page) => {
    const key = page.title.trim().toLowerCase();
    counts.set(key, [...(counts.get(key) ?? []), page]);
    return counts;
  }, new Map());

  for (const page of pages) {
    const isOrphan = page.page_kind !== "index" && page.page_kind !== "log" &&
      page.source_refs.length === 0 &&
      page.canonical_refs.length === 0 &&
      page.world_refs.length === 0 &&
      (page.wiki_claim_refs ?? []).length === 0 &&
      (page.outgoing_links ?? []).length === 0 &&
      (page.incoming_links ?? []).length === 0;
    if (isOrphan) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_orphan_page",
        severity: "warning",
        message: `Wiki page ${page.id} has no upstream or graph links.`,
        related_refs: [page.id],
      }));
    }

    const brokenLinks = (page.outgoing_links ?? []).filter((link) => !pageIds.has(link));
    if (brokenLinks.length > 0) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_broken_link",
        severity: "warning",
        message: `Wiki page ${page.id} links to missing pages: ${brokenLinks.join(", ")}.`,
        related_refs: [page.id, ...brokenLinks],
      }));
    }

    if (input.lint?.stale_before && typeof page.updated_at === "string" && page.updated_at < input.lint.stale_before) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_stale_page",
        severity: "info",
        message: `Wiki page ${page.id} has not been refreshed since ${page.updated_at}.`,
        related_refs: [page.id],
      }));
    }
  }

  for (const [, duplicates] of titleCounts) {
    if (duplicates.length > 1) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_duplicate_title",
        severity: "warning",
        message: `Wiki pages share title "${duplicates[0]?.title ?? ""}".`,
        related_refs: duplicates.map((page) => page.id),
      }));
    }
  }

  for (const claim of claims) {
    if (claim.source_refs.length === 0 && (claim.support_refs ?? []).length === 0) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_unsupported_claim",
        severity: "error",
        message: `Wiki claim ${claim.id} has no upstream support refs.`,
        related_refs: [claim.id, claim.page_ref],
      }));
    }

    if (input.lint?.stale_before && typeof claim.last_seen_at === "string" && claim.last_seen_at < input.lint.stale_before) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_stale_claim",
        severity: "info",
        message: `Wiki claim ${claim.id} has not been seen since ${claim.last_seen_at}.`,
        related_refs: [claim.id],
      }));
    }
  }

  for (const concept of input.lint?.required_concepts ?? []) {
    if (!pages.some((page) => page.title.trim().toLowerCase() === concept.trim().toLowerCase())) {
      diagnostics.push(diagnostic({
        base: input,
        id: diagnosticId(input, diagnostics.length),
        code: "wiki_missing_concept_page",
        severity: "warning",
        message: `Required concept page is missing: ${concept}.`,
        related_refs: [],
      }));
    }
  }

  return diagnostics;
}

async function updateWikiIndexAndLog(rootDir: string, input: WikiMaintenanceInput, pages: WikiPage[], claims: WikiClaim[], diagnostics: Diagnostic[]): Promise<void> {
  const allPages = await loadWikiPages(rootDir);
  const mergedPages = [...allPages.filter((page) => !pages.some((written) => written.id === page.id)), ...pages]
    .sort((a, b) => a.title.localeCompare(b.title));
  const index = [
    "# Index",
    "",
    ...mergedPages.map((page) => `- [${page.title}](${page.path.replace(/^wiki\//, "")}) (${page.page_kind}; ${page.staleness_state ?? "current"})`),
    "",
  ].join("\n");
  const logPath = resolveStorePath(rootDir, STORAGE_LAYOUT.wiki.log);
  const existingLog = await readFile(logPath, "utf8").catch((error) => {
    if (isMissingFileError(error)) return "# Log\n";
    throw error;
  });
  const logEntry = [
    `- ${input.now} ${input.event} ${input.ids.run}`,
    `  - pages: ${pages.map((page) => page.id).join(", ") || "none"}`,
    `  - claims: ${claims.map((claim) => claim.id).join(", ") || "none"}`,
    `  - diagnostics: ${diagnostics.map((item) => item.id).join(", ") || "none"}`,
  ].join("\n");
  await atomicWriteText(resolveStorePath(rootDir, STORAGE_LAYOUT.wiki.index), index);
  await atomicWriteText(logPath, `${existingLog.trimEnd()}\n${logEntry}\n`);
}

async function compileAndWriteMemoryBrowser(rootDir: string, input: WikiMaintenanceInput): Promise<MemoryBrowserProjectionResult> {
  const projection = compileMemoryBrowserProjection({
    now: input.now,
    visibility_state: defaultVisibility(input),
    read_context: input.memory_browser_read_context,
    ids: {
      json_artifact: input.ids.browser_json_artifact,
      html_artifact: input.ids.browser_html_artifact,
      manifest: input.ids.browser_manifest,
    },
    source_records: await loadSourceRecords(rootDir),
    actor_identities: await loadActorIdentities(rootDir),
    runtime_instances: await loadRuntimeInstances(rootDir),
    runtime_sessions: await loadRuntimeSessions(rootDir),
    conversation_threads: await loadConversationThreads(rootDir),
    canonical_records: await loadCanonicalRecords(rootDir),
    world_claims: await loadWorldClaims(rootDir),
    episodes: await loadWorldEpisodes(rootDir),
    entities: await loadWorldEntities(rootDir),
    relations: await loadWorldRelations(rootDir),
    contradictions: await loadWorldContradictions(rootDir),
    contradiction_resolutions: await loadContradictionResolutions(rootDir),
    wiki_pages: await loadWikiPages(rootDir),
    wiki_claims: await loadWikiClaims(rootDir),
    wiki_maintenance_runs: await loadWikiMaintenanceRuns(rootDir),
    proposals: await loadProposals(rootDir),
    curation_packets: await loadCurationPackets(rootDir),
    ratification_records: await loadRatificationRecords(rootDir),
    disposition_records: await loadDispositionRecords(rootDir),
    diagnostics: await loadDiagnostics(rootDir),
    projection_artifacts: await loadProjectionArtifacts(rootDir),
    projection_manifests: await loadProjectionManifests(rootDir),
  });

  await atomicWriteText(resolveProjectionArtifactPath(rootDir, projection.artifacts[0]!.path), projection.json);
  await atomicWriteText(resolveProjectionArtifactPath(rootDir, projection.artifacts[1]!.path), projection.html);
  for (const artifact of projection.artifacts) {
    await writeCoreRecord(rootDir, artifact);
  }
  await writeCoreRecord(rootDir, projection.manifest);
  return projection;
}

function assertNoValidationIssues(issues: ValidationIssue[], scope: string): void {
  if (issues.length > 0) {
    throw new ValidationError(`Invalid ${scope}`, issues);
  }
}

function assertRecordMatches<T>(label: string, expected: T, actual: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Existing wiki maintenance run does not match input: ${label}`);
  }
}

async function assertReusedWikiMaintenanceMatchesInput(input: {
  rootDir: string;
  source_record?: SourceRecord;
  run: WikiMaintenanceRun;
  pages: WikiPage[];
  claims: WikiClaim[];
  diagnostics: Diagnostic[];
  markdowns: PlannedWikiMarkdown[];
}): Promise<void> {
  assertRecordMatches("run", input.run, await readCoreRecord<WikiMaintenanceRun>(coreRecordPath(input.rootDir, input.run)));
  if (input.source_record) {
    assertRecordMatches("source_record", input.source_record, await readCoreRecord<SourceRecord>(coreRecordPath(input.rootDir, input.source_record)));
  }
  for (const page of input.pages) {
    assertRecordMatches("wiki_page", page, await readCoreRecord<WikiPage>(coreRecordPath(input.rootDir, page)));
  }
  for (const claim of input.claims) {
    assertRecordMatches("wiki_claim", claim, await readCoreRecord<WikiClaim>(coreRecordPath(input.rootDir, claim)));
  }
  for (const diagnosticRecord of input.diagnostics) {
    assertRecordMatches("diagnostic", diagnosticRecord, await readCoreRecord<Diagnostic>(coreRecordPath(input.rootDir, diagnosticRecord)));
  }
  for (const markdown of input.markdowns) {
    const existing = await readFile(resolveStorePath(input.rootDir, markdown.page.path), "utf8");
    const expected = renderMarkdown(markdown.page, markdown.body);
    if (existing !== expected) {
      throw new Error(`Existing wiki maintenance run does not match input: markdown:${markdown.page.id}`);
    }
  }
}

function isEligibleProposalEvidenceRecord(record: CoreRecord): boolean {
  return record.layer === "raw" || record.layer === "world" || record.layer === "canon" || record.layer === "governance";
}

export function buildWikiClaimProposalCandidate(input: WikiClaimProposalCandidateInput): Proposal {
  const supportRefs = unique([...(input.claim.support_refs ?? []), ...input.claim.source_refs]);
  if (supportRefs.length === 0) {
    throw new Error("Wiki claim proposal candidates require upstream support refs.");
  }
  const eligibleRecords = new Map(
    input.upstream_records
      .filter(isEligibleProposalEvidenceRecord)
      .map((record) => [record.id, record]),
  );
  const missingOrIneligibleRefs = supportRefs.filter((ref) => !eligibleRecords.has(ref));
  if (missingOrIneligibleRefs.length > 0) {
    throw new Error(`Wiki claim proposal candidates must dereference eligible upstream source/world/canon/governance records: ${missingOrIneligibleRefs.join(", ")}`);
  }
  const candidateKind = input.candidate_kind ?? "fact";
  return {
    id: input.proposal_id,
    kind: "proposal",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: input.visibility_state ?? input.claim.visibility_state,
    provenance: {
      source_type: "wiki_claim",
      source_ref: input.claim.id,
      evidence_refs: supportRefs,
    },
    operation: "create",
    candidate_kind: candidateKind,
    target_layer: "canon",
    target_ref: null,
    candidate_payload: {
      kind: candidateKind,
      statement: input.claim.statement,
      semantic_slot: input.semantic_slot ?? `wiki:${input.claim.id}`,
      epistemic_state: "confirmed",
      temporal_state: {
        temporal_status: "active",
        valid_from: input.now,
        valid_to: null,
      },
      support_refs: supportRefs,
    },
    reason: input.reason ?? `Promote supported wiki claim ${input.claim.id} through governance.`,
    evidence_refs: supportRefs,
    subject_authority_role: "external",
    promotion_requirement: "none",
    governance_state: "proposed",
  };
}

export async function runWikiMaintenanceToStore(input: WikiMaintenanceInput): Promise<WikiMaintenanceResult> {
  assertAuthenticatedPrincipal(input);
  await initializeStore(input.rootDir, input.now);
  const existingPages = await loadWikiPages(input.rootDir);
  const existingClaims = await loadWikiClaims(input.rootDir);
  const pages: WikiPage[] = [];
  const claims: WikiClaim[] = [];
  const graph_edges: WikiGraphEdge[] = [];
  const markdowns: PlannedWikiMarkdown[] = [];
  let diagnostics: Diagnostic[] = [];

  if (input.event === "source_ingested" || input.event === "page_refreshed") {
    const sourceRefs = input.source_record ? [input.source_record.id] : [];
    if (input.source_record && input.ids.source_page) {
      const sourcePage = buildPage({
        base: input,
        id: input.ids.source_page,
        page_kind: "source",
        title: input.topic?.title ? `${input.topic.title} source` : input.source_record.id,
        source_refs: sourceRefs,
        upstream_refs: sourceRefs,
        index_summary: input.source_summary,
        existing: findExistingPage(existingPages, input.ids.source_page, input.source_record.id),
      });
      pages.push(sourcePage);
      markdowns.push({
        page: sourcePage,
        body: input.source_summary ?? `Source record: ${input.source_record.id}`,
      });
    }

    if (input.topic) {
      const topicPage = buildPage({
        base: input,
        id: input.ids.topic_page ?? `wiki_topic_${slugify(input.topic.title)}`,
        page_kind: "topic",
        title: input.topic.title,
        path: input.topic.path,
        source_refs: sourceRefs,
        upstream_refs: sourceRefs,
        index_summary: input.topic.summary,
        existing: findExistingPage(existingPages, input.ids.topic_page, input.topic.title, input.topic.path),
      });
      pages.push(topicPage);
      markdowns.push({
        page: topicPage,
        body: input.topic.summary,
      });
      if (input.source_record) {
        graph_edges.push({
          edge_type: "summarizes",
          from_ref: reference(topicPage),
          to_ref: reference(input.source_record),
          upstream_refs: sourceRefs,
        });
      }
    }
  }

  if (input.event === "query_captured" && input.query_capture) {
    const title = input.query_capture.title ?? input.query_capture.question;
    const queryPage = buildPage({
      base: input,
      id: input.ids.query_page ?? `wiki_query_${slugify(title)}`,
      page_kind: "query_answer",
      title,
      source_refs: input.query_capture.upstream_refs,
      upstream_refs: input.query_capture.upstream_refs,
      index_summary: input.query_capture.answer,
      existing: findExistingPage(existingPages, input.ids.query_page, title),
    });
    pages.push(queryPage);
    markdowns.push({
      page: queryPage,
      body: `Question: ${input.query_capture.question}\n\n${input.query_capture.answer}`,
    });
  }

  if (input.event === "session_crystallized" && input.session_crystallization) {
    const synthesisPage = buildPage({
      base: input,
      id: input.ids.synthesis_page ?? `wiki_synthesis_${slugify(input.session_crystallization.title)}`,
      page_kind: "synthesis",
      title: input.session_crystallization.title,
      source_refs: input.session_crystallization.upstream_refs,
      upstream_refs: input.session_crystallization.upstream_refs,
      index_summary: input.session_crystallization.summary,
      existing: findExistingPage(existingPages, input.ids.synthesis_page, input.session_crystallization.title),
    });
    pages.push(synthesisPage);
    markdowns.push({
      page: synthesisPage,
      body: input.session_crystallization.summary,
    });
  }

  const claimPageRef = pages.find((page) => page.page_kind === "topic")?.id ??
    pages[0]?.id ??
    input.claim?.supersedes_ref ??
    existingPages[0]?.id;
  if (input.claim && input.ids.claim && claimPageRef) {
    const newClaim = buildClaim({
      base: input,
      id: input.ids.claim,
      page_ref: claimPageRef,
      claim: input.claim,
      existing: existingClaims.find((claim) => claim.id === input.ids.claim),
    });
    claims.push(newClaim);
    const page = pages.find((candidate) => candidate.id === claimPageRef);
    if (page && !(page.wiki_claim_refs ?? []).includes(newClaim.id)) {
      page.wiki_claim_refs = unique([...(page.wiki_claim_refs ?? []), newClaim.id]);
    }

    for (const sourceRef of newClaim.support_refs ?? newClaim.source_refs) {
      graph_edges.push({
        edge_type: "supports",
        from_ref: reference(newClaim),
        to_ref: { id: sourceRef },
        upstream_refs: [sourceRef],
      });
    }
  }

  if (input.event === "claim_superseded" && input.claim?.supersedes_ref && input.ids.claim) {
    const oldClaim = existingClaims.find((claim) => claim.id === input.claim?.supersedes_ref);
    if (oldClaim) {
      claims.push({
        ...oldClaim,
        updated_at: input.now,
        claim_status: "superseded",
        staleness_state: "superseded",
        superseded_by_ref: input.ids.claim,
        upstream_refs: unique([...(oldClaim.upstream_refs ?? []), input.ids.claim, input.ids.run]),
      });
      graph_edges.push({
        edge_type: "supersedes",
        from_ref: { id: input.ids.claim, kind: "wiki_claim", layer: "wiki" },
        to_ref: reference(oldClaim),
        upstream_refs: [oldClaim.id, input.ids.claim],
      });
    }
  }

  if (input.event === "lint_run") {
    diagnostics = buildLintDiagnostics(input, existingPages, existingClaims);
  }

  const inputRefs = unique([
    ...(input.source_record ? [input.source_record.id] : []),
    ...pages.flatMap((page) => page.source_refs),
    ...claims.flatMap((claim) => claim.support_refs ?? claim.source_refs),
    ...(input.query_capture?.upstream_refs ?? []),
    ...(input.session_crystallization?.upstream_refs ?? []),
    ...(input.retention_reviewed_refs ?? []),
  ]);
  const run: WikiMaintenanceRun = {
    id: input.ids.run,
    kind: "wiki_maintenance_run",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: defaultVisibility(input),
    provenance: provenance(input, input.ids.run, inputRefs),
    event: input.event,
    status: diagnostics.some((item) => item.severity === "error" || item.severity === "warning") ? "completed_with_diagnostics" : "completed",
    input_refs: inputRefs,
    page_refs: unique(pages.map((page) => page.id)),
    claim_refs: unique(claims.map((claim) => claim.id)),
    diagnostic_refs: diagnostics.map((item) => item.id),
    graph_edges,
    quality_score: claims[0]?.quality_score ?? pages[0]?.quality_score,
    retention_reviewed_refs: input.retention_reviewed_refs,
  };

  const records: CoreRecord[] = [
    ...pages,
    ...claims,
    ...diagnostics,
    run,
  ];
  const validation_issues = records.flatMap((record) => validateCoreRecord(record));
  assertNoValidationIssues(validation_issues, "wiki maintenance");

  const reused = await readFile(coreRecordPath(input.rootDir, run), "utf8")
    .then(() => true)
    .catch((error) => {
      if (isMissingFileError(error)) return false;
      throw error;
    });

  if (reused) {
    await assertReusedWikiMaintenanceMatchesInput({
      rootDir: input.rootDir,
      source_record: input.source_record,
      run,
      pages,
      claims,
      diagnostics,
      markdowns,
    });
  }

  if (!reused) {
    if (input.source_record) {
      await writeCoreRecord(input.rootDir, input.source_record);
    }
    for (const record of records) {
      await writeCoreRecord(input.rootDir, record);
    }
    for (const markdown of markdowns) {
      await writeMarkdown(input.rootDir, markdown.page, markdown.body);
    }
    await updateWikiIndexAndLog(input.rootDir, input, pages, claims, diagnostics);
    await appendValidationLog(input.rootDir, {
      entry_id: `validation:${run.id}:wiki-maintenance`,
      at: input.now,
      scope: input.validation_scope ?? `workflow:wiki:${input.event}`,
      issues: validation_issues,
    });
    await appendAuditChange(input.rootDir, {
      entry_id: `audit:${run.id}:wiki_maintenance`,
      at: input.now,
      operation: input.event,
      record_id: run.id,
      record_kind: run.kind,
      record_layer: run.layer,
      detail: `Completed wiki maintenance event ${input.event}.`,
      related_refs: unique([...run.page_refs, ...run.claim_refs, ...run.diagnostic_refs, ...run.input_refs]),
    });
  }

  const memory_browser = await compileAndWriteMemoryBrowser(input.rootDir, input);
  const storedRun = reused ? await readCoreRecord<WikiMaintenanceRun>(coreRecordPath(input.rootDir, run)) : run;
  return {
    reused,
    run: storedRun,
    pages,
    claims,
    diagnostics,
    memory_browser,
    validation_issues,
  };
}
