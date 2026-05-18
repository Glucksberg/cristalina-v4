import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildDefaultCristalinaConfig } from "./config.js";
import { collectRuntimeBridgeStatus, initializeCristalinaStore } from "./bridge.js";

test("runtime bridge status degrades slow subchecks into health attention", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-bridge-health-timeout-"));
  const storeRoot = join(root, "store");
  await initializeCristalinaStore(storeRoot);

  const started = Date.now();
  const status = await collectRuntimeBridgeStatus({
    config: buildDefaultCristalinaConfig({ storeRoot }),
    configDiagnostics: [],
    storeRoot,
    subcheckTimeoutMs: 5,
    collectors: {
      openclawProjections: async () => [],
      hermesProjections: async () => [],
      openclawReviews: async () => [],
      hermesReviews: () => new Promise(() => undefined),
      openclawMemoryCandidates: async () => emptyCandidateReport("openclaw"),
      hermesMemoryCandidates: async () => emptyCandidateReport("hermes"),
    },
  });

  assert.ok(Date.now() - started < 1000);
  assert.equal(status.pending_owner_reviews.hermes, 0);
  assert.equal(status.health.owner_reviews.status, "attention");
  assert.match(status.health.owner_reviews.diagnostics[0] ?? "", /timed out after 5ms/);
  assert.equal(status.review_surfaces.owner_review_queues.operational_queue_state, "unavailable");
  assert.equal(status.review_surfaces.owner_review_queues.openclaw_count, null);
  assert.equal(status.review_surfaces.owner_review_queues.hermes_count, null);
  assert.equal(status.review_surfaces.owner_review_queues.total_count, null);
  assert.equal(status.review_surfaces.memory_candidates.owner_review_status, "not_required");
  assert.equal(status.health.projections.status, "ok");
  assert.equal(status.health.overall, "attention");
});

test("runtime bridge status marks slow memory candidate review surface as unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-bridge-health-candidate-timeout-"));
  const storeRoot = join(root, "store");
  await initializeCristalinaStore(storeRoot);

  const started = Date.now();
  const status = await collectRuntimeBridgeStatus({
    config: buildDefaultCristalinaConfig({ storeRoot }),
    configDiagnostics: [],
    storeRoot,
    subcheckTimeoutMs: 5,
    collectors: {
      openclawProjections: async () => [],
      hermesProjections: async () => [],
      openclawReviews: async () => [],
      hermesReviews: async () => [],
      openclawMemoryCandidates: async () => emptyCandidateReport("openclaw"),
      hermesMemoryCandidates: () => new Promise(() => undefined),
    },
  });

  assert.ok(Date.now() - started < 1000);
  assert.equal(status.health.memory_candidates.status, "attention");
  assert.match(status.health.memory_candidates.diagnostics[0] ?? "", /timed out after 5ms/);
  assert.equal(status.review_surfaces.owner_review_queues.operational_queue_state, "not_queued");
  assert.equal(status.review_surfaces.owner_review_queues.total_count, 0);
  assert.equal(status.review_surfaces.memory_candidates.owner_review_status, "unavailable");
  assert.equal(status.review_surfaces.memory_candidates.openclaw_requires_owner_review_count, null);
  assert.equal(status.review_surfaces.memory_candidates.hermes_requires_owner_review_count, null);
  assert.equal(status.review_surfaces.memory_candidates.total_requires_owner_review_count, null);
  assert.equal(status.health.overall, "attention");
});

test("runtime bridge status reports missing runtime bindings in config health", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristalina-bridge-health-config-"));
  const storeRoot = join(root, "store");
  await initializeCristalinaStore(storeRoot);

  const status = await collectRuntimeBridgeStatus({
    config: {
      ...buildDefaultCristalinaConfig({ storeRoot }),
      runtimes: {
        openclaw: {},
      },
    },
    configDiagnostics: [],
    storeRoot,
    subcheckTimeoutMs: 5,
    collectors: {
      openclawProjections: async () => [],
      hermesProjections: async () => [],
      openclawReviews: async () => [],
      hermesReviews: async () => [],
      openclawMemoryCandidates: async () => emptyCandidateReport("openclaw"),
      hermesMemoryCandidates: async () => emptyCandidateReport("hermes"),
    },
  });

  assert.equal(status.config_valid, false);
  assert.equal(status.health.config.status, "fail");
  assert.ok(status.health.config.diagnostics.some((entry) => entry.includes("OpenClaw runtime binding")));
  assert.ok(status.health.config.diagnostics.some((entry) => entry.includes("Hermes runtime binding")));
  assert.equal(status.health.overall, "fail");
});

function emptyCandidateReport(runtime: "openclaw" | "hermes") {
  return {
    schema_version: 1 as const,
    runtime,
    generated_at: "2026-05-18T00:00:00.000Z",
    totals: {
      semantic_slots: 0,
      auto_canon_ready: 0,
      already_canon: 0,
      needs_more_support: 0,
      owner_review: 0,
    },
    review_surface: {
      active_owner_review_queue_count: null,
      candidate_requires_owner_review_count: 0,
      counts_toward_pending_owner_reviews: false as const,
      note: "No candidate review requirements.",
    },
    candidates: [],
  };
}
