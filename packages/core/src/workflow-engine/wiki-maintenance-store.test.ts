import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compileMemoryBrowserProjection } from "../projection-engine/memory-browser.js";
import { executeCanonicalProposalWorkflow } from "./pipeline.js";
import {
  buildWikiClaimProposalCandidate,
  runWikiMaintenanceToStore,
  type WikiMaintenanceInput,
} from "./wiki-maintenance-store.js";
import {
  loadCanonicalRecords,
  loadDiagnostics,
  loadProjectionArtifacts,
  loadProjectionManifests,
  loadProposals,
  loadWikiClaims,
  loadWikiMaintenanceRuns,
  loadWikiPages,
  loadWorldClaims,
  writeCoreRecord,
} from "../store/io.js";
import type { CanonicalMemoryObject, SourceRecord, WikiClaim, WikiPage } from "../types.js";

const now = "2026-04-21T12:00:00.000Z";

function systemPrincipal(actor_ref = "system:wiki-maintenance-test") {
  return {
    kind: "system" as const,
    actor_ref,
    system_scope: actor_ref.replace(/^system:/, "") || actor_ref,
  };
}

function sourceRecord(id = "src_wiki_001"): SourceRecord {
  return {
    id,
    kind: "source_record",
    layer: "raw",
    authoritative_home: "raw",
    created_at: now,
    updated_at: now,
    visibility_state: {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "conversation",
      source_ref: `session/wiki#${id}`,
    },
    content_ref: `raw/sources/${id}.json`,
  };
}

function baseInput(rootDir: string, event: WikiMaintenanceInput["event"], ids?: Partial<WikiMaintenanceInput["ids"]>): WikiMaintenanceInput {
  return {
    rootDir,
    now,
    actor: "system:wiki-maintenance-test",
    authenticated_principal: systemPrincipal(),
    event,
    ids: {
      run: `wiki_run_${event}`,
      browser_json_artifact: `artifact_${event}_json`,
      browser_html_artifact: `artifact_${event}_html`,
      browser_manifest: `manifest_${event}`,
      ...ids,
    },
  };
}

test("source_ingested refreshes wiki pages, claim lifecycle metadata, audit, and memory browser artifacts", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-wiki-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const result = await runWikiMaintenanceToStore({
    ...baseInput(rootDir, "source_ingested", {
      run: "wiki_run_source_001",
      source_page: "wiki_page_source_001",
      topic_page: "wiki_page_topic_001",
      claim: "wiki_claim_001",
      browser_json_artifact: "artifact_memory_browser_json_001",
      browser_html_artifact: "artifact_memory_browser_html_001",
      browser_manifest: "manifest_memory_browser_001",
    }),
    source_record: sourceRecord(),
    source_summary: "The session introduced a durable wiki layer.",
    topic: {
      title: "Wiki Layer",
      summary: "Wiki pages collect editorial synthesis while canon keeps authority.",
    },
    claim: {
      statement: "Wiki memory is editorial unless promoted through governance.",
      candidate_for_promotion: true,
      support_refs: ["src_wiki_001"],
      confidence_score: 0.86,
      quality_score: 0.9,
    },
  });

  assert.equal(result.run.status, "completed");
  assert.equal((await loadWikiMaintenanceRuns(rootDir)).length, 1);
  const pages = await loadWikiPages(rootDir);
  const claims = await loadWikiClaims(rootDir);
  assert.equal(pages.length, 2);
  assert.equal(claims.length, 1);
  assert.equal(claims[0]?.claim_status, "candidate_for_promotion");
  assert.deepEqual(claims[0]?.support_refs, ["src_wiki_001"]);
  assert.equal(claims[0]?.support_count, 1);
  assert.equal(claims[0]?.staleness_state, "current");
  assert.equal(pages.find((page) => page.id === "wiki_page_topic_001")?.wiki_claim_refs?.[0], "wiki_claim_001");

  const index = await readFile(join(rootDir, "wiki/index.md"), "utf8");
  const log = await readFile(join(rootDir, "wiki/log.md"), "utf8");
  assert.match(index, /Wiki Layer/);
  assert.match(log, /source_ingested/);

  const artifacts = await loadProjectionArtifacts(rootDir);
  const manifests = await loadProjectionManifests(rootDir);
  assert.equal(artifacts.length, 2);
  assert.equal(manifests[0]?.projection_profile, "memory_browser");
  assert.equal(result.memory_browser.manifest.audience, "memory_browser");
  assert.match(result.memory_browser.html, /Wiki material is editorial memory/);
  assert.equal((result.memory_browser.snapshot as { read_only: boolean }).read_only, true);
});

test("source_ingested updates an existing topic page instead of creating an isolated duplicate", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-wiki-refresh-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await runWikiMaintenanceToStore({
    ...baseInput(rootDir, "source_ingested", {
      run: "wiki_run_refresh_001",
      topic_page: "wiki_page_shared_topic",
      browser_json_artifact: "artifact_refresh_json_001",
      browser_html_artifact: "artifact_refresh_html_001",
      browser_manifest: "manifest_refresh_001",
    }),
    source_record: sourceRecord("src_refresh_001"),
    topic: {
      title: "Operational Memory",
      summary: "Initial operational memory note.",
    },
  });

  await runWikiMaintenanceToStore({
    ...baseInput(rootDir, "source_ingested", {
      run: "wiki_run_refresh_002",
      topic_page: "wiki_page_shared_topic",
      browser_json_artifact: "artifact_refresh_json_002",
      browser_html_artifact: "artifact_refresh_html_002",
      browser_manifest: "manifest_refresh_002",
    }),
    source_record: sourceRecord("src_refresh_002"),
    topic: {
      title: "Operational Memory",
      summary: "Refreshed operational memory note.",
    },
  });

  const pages = await loadWikiPages(rootDir);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0]?.source_refs, ["src_refresh_001", "src_refresh_002"]);
  const markdown = await readFile(join(rootDir, "wiki/pages/operational-memory.md"), "utf8");
  assert.match(markdown, /Refreshed operational memory note/);
});

test("query capture and lint stay editorial and produce diagnostics without canon or world writes", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-wiki-lint-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  await runWikiMaintenanceToStore({
    ...baseInput(rootDir, "query_captured", {
      run: "wiki_run_query_001",
      query_page: "wiki_page_query_001",
      browser_json_artifact: "artifact_query_json_001",
      browser_html_artifact: "artifact_query_html_001",
      browser_manifest: "manifest_query_001",
    }),
    query_capture: {
      question: "What is canon?",
      answer: "Canon is ratified memory, not wiki prose.",
      upstream_refs: ["src_query_001"],
    },
  });
  await writeCoreRecord(rootDir, {
    id: "wiki_page_orphan_001",
    kind: "wiki_page",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    visibility_state: { privacy_scope: "project_private" },
    provenance: { source_type: "fixture", source_ref: "fixture:orphan" },
    page_kind: "topic",
    title: "Duplicate",
    path: "wiki/pages/duplicate-a.md",
    source_refs: [],
    canonical_refs: [],
    world_refs: [],
    outgoing_links: ["missing_page"],
  } satisfies WikiPage);
  await writeCoreRecord(rootDir, {
    id: "wiki_page_orphan_002",
    kind: "wiki_page",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    visibility_state: { privacy_scope: "project_private" },
    provenance: { source_type: "fixture", source_ref: "fixture:duplicate" },
    page_kind: "topic",
    title: "Duplicate",
    path: "wiki/pages/duplicate-b.md",
    source_refs: [],
    canonical_refs: [],
    world_refs: [],
  } satisfies WikiPage);
  await writeCoreRecord(rootDir, {
    id: "wiki_claim_unsupported_001",
    kind: "wiki_claim",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    visibility_state: { privacy_scope: "project_private" },
    provenance: { source_type: "fixture", source_ref: "fixture:claim" },
    statement: "Unsupported prose should not promote itself.",
    page_ref: "wiki_page_orphan_001",
    claim_status: "editorial",
    source_refs: [],
    last_seen_at: "2026-01-01T00:00:00.000Z",
  } satisfies WikiClaim);

  const lint = await runWikiMaintenanceToStore({
    ...baseInput(rootDir, "lint_run", {
      run: "wiki_run_lint_001",
      diagnostics: [
        "diag_lint_orphan",
        "diag_lint_broken",
        "diag_lint_stale_page",
        "diag_lint_orphan_2",
        "diag_lint_stale_page_2",
        "diag_lint_duplicate",
        "diag_lint_unsupported",
        "diag_lint_stale_claim",
        "diag_lint_missing",
      ],
      browser_json_artifact: "artifact_lint_json_001",
      browser_html_artifact: "artifact_lint_html_001",
      browser_manifest: "manifest_lint_001",
    }),
    lint: {
      required_concepts: ["Wiki Layer"],
      stale_before: "2026-04-01T00:00:00.000Z",
    },
  });

  const codes = new Set(lint.diagnostics.map((diagnostic) => diagnostic.code));
  assert.ok(codes.has("wiki_orphan_page"));
  assert.ok(codes.has("wiki_broken_link"));
  assert.ok(codes.has("wiki_duplicate_title"));
  assert.ok(codes.has("wiki_unsupported_claim"));
  assert.ok(codes.has("wiki_missing_concept_page"));
  assert.ok(codes.has("wiki_stale_page"));
  assert.ok(codes.has("wiki_stale_claim"));
  assert.equal((await loadDiagnostics(rootDir)).length, lint.diagnostics.length);
  assert.equal((await loadCanonicalRecords(rootDir)).length, 0);
  assert.equal((await loadWorldClaims(rootDir)).length, 0);
  assert.equal((await loadProposals(rootDir)).length, 0);
  assert.match(lint.memory_browser.json, /wiki_editorial_claim_not_authority/);
});

test("supported wiki claim proposal passes through governance while prose-only candidates are rejected", () => {
  const claim: WikiClaim = {
    id: "wiki_claim_supported_001",
    kind: "wiki_claim",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "project_private" },
    provenance: { source_type: "wiki_maintenance", source_ref: "wiki_run_source_001" },
    statement: "A memory browser is read-only.",
    page_ref: "wiki_page_topic_001",
    claim_status: "candidate_for_promotion",
    source_refs: ["src_wiki_001"],
    support_refs: ["src_wiki_001"],
  };
  const proposal = buildWikiClaimProposalCandidate({
    now,
    proposal_id: "prop_wiki_claim_001",
    claim,
    upstream_records: [sourceRecord("src_wiki_001")],
    semantic_slot: "fact:cristalina:memory-browser-read-only",
  });
  const workflow = executeCanonicalProposalWorkflow({
    proposal,
    now,
    actor: "system:wiki-maintenance-test",
    authenticated_principal: systemPrincipal(),
    ratification_id: "rat_wiki_claim_001",
    diagnostic_id: "diag_wiki_claim_001",
    canonical_id: "canon_wiki_claim_001",
  });

  assert.equal(workflow.accepted, true);
  assert.equal(workflow.created_record?.kind, "fact");
  assert.equal(workflow.created_record?.governance_state, "ratified");
  assert.equal(workflow.ratification_record.authenticated_principal?.kind, "system");

  assert.throws(
    () => buildWikiClaimProposalCandidate({
      now,
      proposal_id: "prop_wiki_claim_unsupported",
      claim: {
        ...claim,
        id: "wiki_claim_unsupported_for_proposal",
        source_refs: [],
        support_refs: [],
      },
      upstream_records: [],
    }),
    /require upstream support refs/,
  );

  assert.throws(
    () => buildWikiClaimProposalCandidate({
      now,
      proposal_id: "prop_wiki_claim_wiki_only",
      claim: {
        ...claim,
        id: "wiki_claim_wiki_only",
        source_refs: [],
        support_refs: ["wiki_page_topic_001"],
      },
      upstream_records: [{
        id: "wiki_page_topic_001",
        kind: "wiki_page",
        layer: "wiki",
        authoritative_home: "wiki",
        created_at: now,
        visibility_state: { privacy_scope: "project_private" },
        provenance: { source_type: "fixture", source_ref: "fixture:wiki-page" },
        page_kind: "topic",
        title: "Wiki Layer",
        path: "wiki/pages/wiki-layer.md",
        source_refs: [],
        canonical_refs: [],
        world_refs: [],
      } satisfies WikiPage],
    }),
    /must dereference eligible upstream/,
  );

  assert.throws(
    () => buildWikiClaimProposalCandidate({
      now,
      proposal_id: "prop_wiki_claim_missing_ref",
      claim: {
        ...claim,
        id: "wiki_claim_missing_ref",
        source_refs: [],
        support_refs: ["missing_source"],
      },
      upstream_records: [],
    }),
    /must dereference eligible upstream/,
  );
});

test("wiki maintenance rejects reuse drift and authenticates actor before writing", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-wiki-reuse-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = {
    ...baseInput(rootDir, "source_ingested", {
      run: "wiki_run_reuse_guard_001",
      source_page: "wiki_page_reuse_source_001",
      topic_page: "wiki_page_reuse_topic_001",
      browser_json_artifact: "artifact_reuse_json_001",
      browser_html_artifact: "artifact_reuse_html_001",
      browser_manifest: "manifest_reuse_001",
    }),
    source_record: sourceRecord("src_reuse_001"),
    source_summary: "Original source summary.",
    topic: {
      title: "Reuse Guard",
      summary: "Original topic summary.",
    },
  } satisfies WikiMaintenanceInput;
  await runWikiMaintenanceToStore(input);
  const markdownPath = join(rootDir, "wiki/pages/reuse-guard.md");
  const originalMarkdown = await readFile(markdownPath, "utf8");

  await assert.rejects(
    () =>
      runWikiMaintenanceToStore({
        ...input,
        source_summary: "Changed source summary.",
        topic: {
          title: "Reuse Guard",
          summary: "Changed topic summary.",
        },
      }),
    /Existing wiki maintenance run does not match input/,
  );
  assert.equal(await readFile(markdownPath, "utf8"), originalMarkdown);

  await assert.rejects(
    () =>
      runWikiMaintenanceToStore({
        ...baseInput(rootDir, "source_ingested", {
          run: "wiki_run_bad_auth_001",
          topic_page: "wiki_page_bad_auth_001",
          browser_json_artifact: "artifact_bad_auth_json_001",
          browser_html_artifact: "artifact_bad_auth_html_001",
          browser_manifest: "manifest_bad_auth_001",
        }),
        actor: "system:wiki-maintenance-test",
        authenticated_principal: systemPrincipal("system:other"),
        topic: {
          title: "Bad Auth",
          summary: "Should not write.",
        },
      }),
    /must match actor/,
  );
});

test("memory browser applies projection read policy before rendering private records", () => {
  const privateCanon: CanonicalMemoryObject = {
    id: "canon_private_001",
    kind: "fact",
    layer: "canon",
    authoritative_home: "canon",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "owner_private" },
    provenance: { source_type: "fixture", source_ref: "fixture:private" },
    statement: "Private canon should not render without matching context.",
    semantic_slot: "fact:private",
    epistemic_state: "confirmed",
    governance_state: "ratified",
  };
  const scopedCanon: CanonicalMemoryObject = {
    ...privateCanon,
    id: "canon_scoped_001",
    provenance: {
      ...privateCanon.provenance,
      actor_ref: "owner:memory-browser",
    },
    statement: "Scoped canon can render with matching owner context.",
    semantic_slot: "fact:scoped",
  };

  const unscoped = compileMemoryBrowserProjection({
    now,
    visibility_state: { privacy_scope: "project_private" },
    ids: {
      json_artifact: "artifact_browser_unscoped_json",
      html_artifact: "artifact_browser_unscoped_html",
      manifest: "manifest_browser_unscoped",
    },
    source_records: [],
    canonical_records: [privateCanon, scopedCanon],
    world_claims: [],
    wiki_pages: [],
    wiki_claims: [],
  });

  assert.doesNotMatch(unscoped.html, /Private canon/);
  assert.doesNotMatch(unscoped.html, /Scoped canon/);
  assert.match(unscoped.json, /owner_private_missing_identity_binding/);
  assert.match(unscoped.json, /owner_private_requires_identity_context/);

  const scoped = compileMemoryBrowserProjection({
    now,
    visibility_state: { privacy_scope: "project_private" },
    read_context: {
      adapter: "openclaw",
      audience: "memory_browser",
      owner_identity_ref: "owner:memory-browser",
    },
    ids: {
      json_artifact: "artifact_browser_scoped_json",
      html_artifact: "artifact_browser_scoped_html",
      manifest: "manifest_browser_scoped",
    },
    source_records: [],
    canonical_records: [privateCanon, scopedCanon],
    world_claims: [],
    wiki_pages: [],
    wiki_claims: [],
  });

  assert.doesNotMatch(scoped.html, /Private canon/);
  assert.match(scoped.html, /Scoped canon can render/);
});
