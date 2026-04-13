import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadCanonicalRecords } from "../store/io.js";
import { writeConversationPreferenceFlowToStore, type ConversationPreferenceStoreInput } from "./conversation-preference-store.js";

function buildInput(rootDir: string): ConversationPreferenceStoreInput {
  return {
    rootDir,
    now: "2026-04-12T00:00:00.000Z",
    actor: "system:test",
    statement: "The user prefers concise answers unless they explicitly ask for depth.",
    source: {
      id: "src_test_001",
      source_ref: "runtime/session-test#turn-001",
      content_ref: "raw/sources/conversation-turn-test-001.json",
      runtime: "openclaw",
      message: "The user says they prefer concise answers unless they explicitly ask for depth.",
    },
    ids: {
      observation: "obs_test_001",
      world_claim: "wcl_test_001",
      wiki_page: "wpg_test_001",
      wiki_claim: "wclm_test_001",
      proposal: "prop_test_001",
      disposition: "disp_test_001",
      ratification: "rat_test_001",
      diagnostic: "diag_test_001",
      canonical: "mem_test_001",
      canon_artifact: "part_openclaw_canon_test_001",
      world_artifact: "part_openclaw_world_test_001",
      wiki_artifact: "part_openclaw_wiki_test_001",
      projection_manifest: "pmf_openclaw_test_001",
    },
    validation_scope: "test:conversation-preference",
  };
}

test("writeConversationPreferenceFlowToStore materializes and reuses the same flow", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-core-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = buildInput(rootDir);
  const first = await writeConversationPreferenceFlowToStore(input);

  assert.equal(first.reused, false);
  assert.equal(first.validation_issues.length, 0);
  assert.equal(first.records.canonical_record.id, input.ids.canonical);
  assert.equal(first.records.canonical_record.governance_state, "ratified");

  const canonicalRecords = await loadCanonicalRecords(rootDir);
  assert.equal(canonicalRecords.length, 1);
  assert.equal(canonicalRecords[0]?.id, input.ids.canonical);

  const wikiMarkdown = await readFile(first.paths.wiki_page_markdown, "utf8");
  assert.match(wikiMarkdown, /User Interaction Preferences/);
  assert.match(wikiMarkdown, /The user prefers concise answers unless they explicitly ask for depth\./);

  const projectionMarkdown = await readFile(first.paths.projection_markdown, "utf8");
  assert.match(projectionMarkdown, /\[canon:mem_test_001\]/);

  const auditLogBefore = await readFile(join(rootDir, "audits/changes.log"), "utf8");
  const second = await writeConversationPreferenceFlowToStore(input);
  const auditLogAfter = await readFile(join(rootDir, "audits/changes.log"), "utf8");

  assert.equal(second.reused, true);
  assert.equal(second.records.canonical_record.id, first.records.canonical_record.id);
  assert.equal(auditLogAfter, auditLogBefore);
});
