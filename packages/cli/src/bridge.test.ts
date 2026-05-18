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
    },
  });

  assert.ok(Date.now() - started < 1000);
  assert.equal(status.pending_owner_reviews.hermes, 0);
  assert.equal(status.health.owner_reviews.status, "attention");
  assert.match(status.health.owner_reviews.diagnostics[0] ?? "", /timed out after 5ms/);
  assert.equal(status.health.projections.status, "ok");
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
    },
  });

  assert.equal(status.config_valid, false);
  assert.equal(status.health.config.status, "fail");
  assert.ok(status.health.config.diagnostics.some((entry) => entry.includes("OpenClaw runtime binding")));
  assert.ok(status.health.config.diagnostics.some((entry) => entry.includes("Hermes runtime binding")));
  assert.equal(status.health.overall, "fail");
});
