import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createHermesProjectionFixture,
} from "../../core/dist/test-support/projection-fixtures.js";

import {
  listHermesProjectionRuntimeViews,
  loadHermesProjectionRuntimeView,
  loadLatestHermesProjectionRuntimeView,
} from "./runtime-projection.js";

test("Hermes adapter lists and loads pending projection reviews", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-hermes-adapter-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const fixture = await createHermesProjectionFixture(rootDir, {
    now: "2026-04-16T03:00:00.000Z",
    status: "pending",
    manifest_id: "pmf_hermes_adapter_test_001",
    diagnostic_id: "diag_hermes_adapter_test_001",
    review_id: "cur_hermes_adapter_test_001",
    proposal_ref: "prop_hermes_adapter_test_001",
    markdown_heading: "Hermes Runtime Memory",
    diagnostic_message: "Hermes adapter test review is pending owner authority.",
    provenance_source_ref: "tests/hermes-adapter/runtime-projection",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "2026-04-16.group-interaction",
    owner_identity_ref: "actor_owner_hermes_adapter_test_001",
    runtime_instance_ref: "runtime_hermes_adapter_test_001",
    runtime_session_ref: "session_hermes_adapter_test_001",
    conversation_thread_ref: "thread_hermes_adapter_test_001",
    markdown_artifact_id: "part_hermes_adapter_test_001",
    canon_artifact_id: "part_hermes_adapter_test_002",
  });
  const summaries = await listHermesProjectionRuntimeViews(rootDir);

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]!.manifest_id, fixture.manifest.id);
  assert.equal(summaries[0]!.diagnostic_count, 1);
  assert.equal(summaries[0]!.review_count, 1);
  assert.equal(summaries[0]!.pending_review_count, 1);

  const latest = await loadLatestHermesProjectionRuntimeView(rootDir);
  assert.ok(latest);
  assert.equal(latest!.manifest.id, fixture.manifest.id);
  assert.equal(latest!.pending_reviews.length, 1);
  assert.equal(latest!.closed_reviews.length, 0);
  assert.equal(latest!.reviews[0]!.status, "pending");
  assert.match(latest!.markdown, /## Review Queue/);
  assert.match(latest!.markdown, /\[review:cur_hermes_adapter_test_001\]/);
});

test("Hermes adapter resolves markdown artifacts and closed review state from the manifest", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "cristalina-hermes-adapter-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const fixture = await createHermesProjectionFixture(rootDir, {
    now: "2026-04-16T03:00:00.000Z",
    status: "answered",
    manifest_id: "pmf_hermes_adapter_test_001",
    diagnostic_id: "diag_hermes_adapter_test_001",
    review_id: "cur_hermes_adapter_test_001",
    proposal_ref: "prop_hermes_adapter_test_001",
    markdown_heading: "Hermes Runtime Memory",
    diagnostic_message: "Hermes adapter test review is pending owner authority.",
    provenance_source_ref: "tests/hermes-adapter/runtime-projection",
    projection_profile: "hermes/runtime-bootstrap",
    read_policy_version: "2026-04-16.group-interaction",
    owner_identity_ref: "actor_owner_hermes_adapter_test_001",
    runtime_instance_ref: "runtime_hermes_adapter_test_001",
    runtime_session_ref: "session_hermes_adapter_test_001",
    conversation_thread_ref: "thread_hermes_adapter_test_001",
    markdown_artifact_id: "part_hermes_adapter_test_001",
    canon_artifact_id: "part_hermes_adapter_test_002",
  });
  const view = await loadHermesProjectionRuntimeView({
    rootDir,
    manifest_id: fixture.manifest.id,
  });

  const storedMarkdown = await readFile(join(rootDir, fixture.markdownRelativePath), "utf8");
  assert.equal(view.markdown, storedMarkdown);
  assert.equal(view.pending_reviews.length, 0);
  assert.equal(view.closed_reviews.length, 1);
  assert.equal(view.closed_reviews[0]!.status, "answered");
  assert.equal(view.diagnostics[0]!.id, "diag_hermes_adapter_test_001");
  assert.match(view.markdown, /\(owner_ratification; answered\)/);
});
