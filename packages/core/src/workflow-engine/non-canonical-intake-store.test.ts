import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compileOpenClawBootstrapProjection } from "../projection-engine/openclaw.js";
import {
  loadCanonicalRecords,
  loadConversationThreads,
  loadDispositionRecords,
  loadDiagnostics,
  loadProposals,
  loadRatificationRecords,
  loadRuntimeInstances,
  loadRuntimeSessions,
  loadWikiPages,
  loadWikiClaims,
  loadWorldClaims,
} from "../store/io.js";
import type { NonCanonicalIntakeInput } from "./non-canonical-intake-store.js";
import { writeNonCanonicalIntakeToStore } from "./non-canonical-intake-store.js";

function systemPrincipal(actor_ref = "system:non-canonical-test") {
  return {
    kind: "system" as const,
    actor_ref,
    system_scope: actor_ref.replace(/^system:/, "") || actor_ref,
  };
}

function buildInput(rootDir: string, mode: NonCanonicalIntakeInput["mode"]): NonCanonicalIntakeInput {
  return {
    rootDir,
    now: "2026-04-21T00:00:00.000Z",
    actor: "system:non-canonical-test",
    authenticated_principal: systemPrincipal(),
    mode,
    ids: {
      source: `src_noncanonical_${mode}_001`,
      observation: `obs_noncanonical_${mode}_001`,
      disposition: `disp_noncanonical_${mode}_001`,
      diagnostic: `diag_noncanonical_${mode}_001`,
    },
    source: {
      source_ref: `non-canonical/${mode}/001`,
      content_ref: `raw/sources/non-canonical-${mode}-001.json`,
      source_type: "non_canonical_fixture",
      payload: {
        note: `Fixture for ${mode}`,
      },
    },
    diagnostic: {
      code: "non_canonical_fixture",
      severity: "info",
      message: `Fixture diagnostic for ${mode}`,
    },
    validation_scope: `test:non-canonical:${mode}`,
  };
}

async function assertNoCanonProposalWorldOrWiki(rootDir: string): Promise<void> {
  assert.equal((await loadCanonicalRecords(rootDir)).length, 0);
  assert.equal((await loadProposals(rootDir)).length, 0);
  assert.equal((await loadRatificationRecords(rootDir)).length, 0);
  assert.equal((await loadWorldClaims(rootDir)).length, 0);
  assert.equal((await loadWikiPages(rootDir)).length, 0);
  assert.equal((await loadWikiClaims(rootDir)).length, 0);
}

test("evidence_only intake writes raw source and disposition without world or canon promotion", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-noncanonical-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const result = await writeNonCanonicalIntakeToStore(buildInput(rootDir, "evidence_only"));

  assert.equal(result.reused, false);
  assert.deepEqual(result.records.disposition_record.outcomes, ["evidence_only"]);
  assert.deepEqual(result.records.disposition_record.target_layers, ["governance"]);
  assert.equal(result.records.observation, undefined);
  assert.equal(result.records.diagnostic, undefined);
  assert.equal((await loadDispositionRecords(rootDir)).length, 1);
  await assertNoCanonProposalWorldOrWiki(rootDir);
});

test("runtime_only intake writes runtime observation without canon proposal", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-noncanonical-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir, "runtime_only");
  input.source.runtime_ref = "runtime_noncanonical_001";
  input.source.session_ref = "session_noncanonical_001";
  input.source.thread_ref = "thread_noncanonical_001";
  input.source.runtime = "openclaw";
  input.source.agent_identity_ref = "actor_agent_noncanonical_001";
  input.source.message_refs = ["msg_noncanonical_001"];
  const result = await writeNonCanonicalIntakeToStore(input);

  assert.deepEqual(result.records.disposition_record.outcomes, ["runtime_only"]);
  assert.deepEqual(result.records.disposition_record.target_layers, ["runtime"]);
  assert.equal(result.records.runtime_instance?.id, "runtime_noncanonical_001");
  assert.equal(result.records.runtime_session?.runtime_instance_ref, "runtime_noncanonical_001");
  assert.equal(result.records.conversation_thread?.runtime_session_ref, "session_noncanonical_001");
  assert.equal(result.records.observation?.runtime_instance_ref, "runtime_noncanonical_001");
  assert.equal(result.records.disposition_record.proposal_refs, undefined);
  assert.equal((await loadRuntimeInstances(rootDir)).length, 1);
  assert.equal((await loadRuntimeSessions(rootDir)).length, 1);
  assert.equal((await loadConversationThreads(rootDir)).length, 1);
  await assertNoCanonProposalWorldOrWiki(rootDir);
});

test("diagnostic_only intake writes diagnostic and audit-linked disposition without canon proposal", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-noncanonical-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const result = await writeNonCanonicalIntakeToStore(buildInput(rootDir, "diagnostic_only"));

  assert.deepEqual(result.records.disposition_record.outcomes, ["diagnostic_only"]);
  assert.deepEqual(result.records.disposition_record.target_layers, ["audits"]);
  assert.deepEqual(result.records.disposition_record.diagnostic_refs, [result.records.diagnostic?.id]);
  assert.equal((await loadDiagnostics(rootDir)).length, 1);
  assert.match(await readFile(join(rootDir, "audits/changes.log"), "utf8"), /non_canonical_intake/);
  await assertNoCanonProposalWorldOrWiki(rootDir);
});

test("non-canonical runtime and diagnostics project only through declared read context", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-noncanonical-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const runtimeInput = buildInput(rootDir, "runtime_only");
  runtimeInput.source.runtime = "openclaw";
  runtimeInput.source.runtime_ref = "runtime_noncanonical_project_001";
  runtimeInput.source.session_ref = "session_noncanonical_project_001";
  runtimeInput.source.thread_ref = "thread_noncanonical_project_001";
  runtimeInput.source.message_refs = ["msg_noncanonical_project_001"];
  const runtimeResult = await writeNonCanonicalIntakeToStore(runtimeInput);

  const runtimeProjection = compileOpenClawBootstrapProjection({
    now: runtimeInput.now,
    visibility_state: runtimeResult.records.source_record.visibility_state,
    projection_path: "derived/openclaw/noncanonical-runtime.md",
    canonical_records: [],
    world_claims: [],
    wiki_pages: [],
    wiki_claims: [],
    runtime_identity: {
      runtime_instance: runtimeResult.records.runtime_instance,
      runtime_session: runtimeResult.records.runtime_session,
      conversation_thread: runtimeResult.records.conversation_thread,
    },
    identity_context: {
      runtime_instance_ref: "runtime_noncanonical_project_001",
      runtime_session_ref: "session_noncanonical_project_001",
      conversation_thread_ref: "thread_noncanonical_project_001",
    },
    ids: {
      canon_artifact: "part_openclaw_canon_noncanonical_runtime_001",
      world_artifact: "part_openclaw_world_noncanonical_runtime_001",
      wiki_artifact: "part_openclaw_wiki_noncanonical_runtime_001",
      manifest: "pmf_openclaw_noncanonical_runtime_001",
    },
  });

  assert.match(runtimeProjection.markdown, /\[runtime:runtime_noncanonical_project_001\]/);
  assert.match(runtimeProjection.markdown, /\[thread:thread_noncanonical_project_001\]/);
  assert.deepEqual(runtimeProjection.manifest.suppressed_records, []);

  const blockedRuntimeProjection = compileOpenClawBootstrapProjection({
    now: runtimeInput.now,
    visibility_state: runtimeResult.records.source_record.visibility_state,
    projection_path: "derived/openclaw/noncanonical-runtime-blocked.md",
    canonical_records: [],
    world_claims: [],
    wiki_pages: [],
    wiki_claims: [],
    runtime_identity: {
      runtime_instance: runtimeResult.records.runtime_instance,
      runtime_session: runtimeResult.records.runtime_session,
      conversation_thread: runtimeResult.records.conversation_thread,
    },
    ids: {
      canon_artifact: "part_openclaw_canon_noncanonical_runtime_blocked_001",
      world_artifact: "part_openclaw_world_noncanonical_runtime_blocked_001",
      wiki_artifact: "part_openclaw_wiki_noncanonical_runtime_blocked_001",
      manifest: "pmf_openclaw_noncanonical_runtime_blocked_001",
    },
  });

  assert.doesNotMatch(blockedRuntimeProjection.markdown, /\[runtime:runtime_noncanonical_project_001\]/);
  assert.ok(
    blockedRuntimeProjection.manifest.suppressed_records?.some(
      (record) => record.id === "runtime_noncanonical_project_001" && record.reason_code === "owner_private_requires_projection_context",
    ),
  );

  const diagnosticResult = await writeNonCanonicalIntakeToStore(buildInput(rootDir, "diagnostic_only"));
  const diagnosticProjection = compileOpenClawBootstrapProjection({
    now: runtimeInput.now,
    visibility_state: diagnosticResult.records.source_record.visibility_state,
    projection_path: "derived/openclaw/noncanonical-diagnostic.md",
    canonical_records: [],
    world_claims: [],
    wiki_pages: [],
    wiki_claims: [],
    diagnostics: [diagnosticResult.records.diagnostic!],
    identity_context: {
      actor_identity_ref: runtimeInput.actor,
    },
    ids: {
      canon_artifact: "part_openclaw_canon_noncanonical_diag_001",
      world_artifact: "part_openclaw_world_noncanonical_diag_001",
      wiki_artifact: "part_openclaw_wiki_noncanonical_diag_001",
      manifest: "pmf_openclaw_noncanonical_diag_001",
    },
  });

  assert.deepEqual(diagnosticProjection.manifest.diagnostic_refs, [diagnosticResult.records.diagnostic?.id]);
  assert.match(diagnosticProjection.markdown, /\[diag:diag_noncanonical_diagnostic_only_001\]/);

  const blockedDiagnosticProjection = compileOpenClawBootstrapProjection({
    now: runtimeInput.now,
    visibility_state: diagnosticResult.records.source_record.visibility_state,
    projection_path: "derived/openclaw/noncanonical-diagnostic-blocked.md",
    canonical_records: [],
    world_claims: [],
    wiki_pages: [],
    wiki_claims: [],
    diagnostics: [diagnosticResult.records.diagnostic!],
    ids: {
      canon_artifact: "part_openclaw_canon_noncanonical_diag_blocked_001",
      world_artifact: "part_openclaw_world_noncanonical_diag_blocked_001",
      wiki_artifact: "part_openclaw_wiki_noncanonical_diag_blocked_001",
      manifest: "pmf_openclaw_noncanonical_diag_blocked_001",
    },
  });

  assert.doesNotMatch(blockedDiagnosticProjection.markdown, /\[diag:diag_noncanonical_diagnostic_only_001\]/);
  assert.ok(
    blockedDiagnosticProjection.manifest.suppressed_records?.some(
      (record) => record.id === diagnosticResult.records.diagnostic?.id && record.reason_code === "owner_private_requires_identity_context",
    ),
  );
});

test("source import fixture uses raw imports as a real evidence payload", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-noncanonical-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir, "evidence_only");
  input.source.source_type = "structured_import";
  input.source.source_ref = "import/customer-001";
  input.source.content_ref = "raw/imports/customer-001.json";
  input.source.payload = {
    customer_id: "customer-001",
    note: "Imported evidence, not canon.",
  };

  const result = await writeNonCanonicalIntakeToStore(input);
  const payload = await readFile(result.paths.raw_payload, "utf8");

  assert.equal(result.records.source_record.content_ref, "raw/imports/customer-001.json");
  assert.match(payload, /customer-001/);
  await assertNoCanonProposalWorldOrWiki(rootDir);
});

test("attachment references stay bounded to raw attachments and do not become truth", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-noncanonical-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir, "evidence_only");
  input.source.attachment_refs = ["raw/attachments/customer-note.pdf"];

  const result = await writeNonCanonicalIntakeToStore(input);
  const payload = await readFile(result.paths.raw_payload, "utf8");

  assert.deepEqual(result.records.source_record.provenance.evidence_refs, ["raw/attachments/customer-note.pdf"]);
  assert.match(payload, /raw\/attachments\/customer-note\.pdf/);
  await assertNoCanonProposalWorldOrWiki(rootDir);

  await assert.rejects(
    () =>
      writeNonCanonicalIntakeToStore({
        ...input,
        ids: {
          ...input.ids,
          source: "src_bad_attachment_ref_001",
          disposition: "disp_bad_attachment_ref_001",
        },
        source: {
          ...input.source,
          attachment_refs: ["raw/attachments/../../canon/preferences/mem.json"],
        },
      }),
    /Attachment refs must stay within raw\/attachments/,
  );
});

test("non-canonical intake rejects collisions between raw payload and authoritative records", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-noncanonical-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir, "evidence_only");
  input.source.content_ref = `raw/sources/${input.ids.source}.json`;

  await assert.rejects(
    () => writeNonCanonicalIntakeToStore(input),
    /paths collide: raw_payload and source_record/,
  );
});

test("non-canonical intake rejects reuse when payload or authenticated authority changes", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-noncanonical-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir, "evidence_only");
  await writeNonCanonicalIntakeToStore(input);

  await assert.rejects(
    () =>
      writeNonCanonicalIntakeToStore({
        ...input,
        source: {
          ...input.source,
          payload: {
            note: "Changed evidence should not be hidden by reuse.",
          },
        },
      }),
    /does not match input: raw_payload/,
  );

  await assert.rejects(
    () =>
      writeNonCanonicalIntakeToStore({
        ...input,
        actor: "agent:non-canonical-test",
        authenticated_principal: {
          kind: "agent",
          actor_ref: "agent:non-canonical-test",
        },
      }),
    /does not match input: raw_payload/,
  );
});

test("non-canonical intake rejects partial materialization when raw payload is missing", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-noncanonical-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir, "evidence_only");
  const first = await writeNonCanonicalIntakeToStore(input);
  await rm(first.paths.raw_payload, { force: true });

  await assert.rejects(
    () => writeNonCanonicalIntakeToStore(input),
    /partially materialized/,
  );
});
