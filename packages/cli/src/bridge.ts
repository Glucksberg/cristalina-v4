import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  createStoreManifest,
  parseStoreManifestYaml,
  serializeStoreManifestYaml,
  STORAGE_LAYOUT,
  summarizeMemoryCanonCandidates,
  ValidationError,
  type MemoryCanonCandidateReport,
  type ProjectionRuntimeSummary,
} from "@cristalina-v4/core";
import {
  listOpenClawConversationPreferenceOwnerRatificationQueue,
  listOpenClawProjectionRuntimeViews,
} from "@cristalina-v4/openclaw-adapter";
import {
  listHermesConversationPreferenceOwnerRatificationQueue,
  listHermesProjectionRuntimeViews,
} from "@cristalina-v4/hermes-adapter";

import type { CristalinaConfig } from "./config.js";

export interface RuntimeBridgeStatus {
  store_root: string | null;
  store_manifest_found: boolean;
  config_valid: boolean;
  diagnostics: string[];
  health: RuntimeBridgeHealth;
  review_surfaces: RuntimeBridgeReviewSurfaces;
  projections: {
    openclaw: ProjectionRuntimeSummary[];
    hermes: ProjectionRuntimeSummary[];
  };
  owner_decisions: RuntimeBridgeOwnerDecisionSummary;
  pending_owner_reviews: {
    openclaw: number;
    hermes: number;
  };
}

export interface RuntimeBridgeOwnerDecisionSummary {
  backlog: number | null;
  in_review: number | null;
  blocking: number | null;
  by_stage: {
    backlog: number | null;
    in_review: number | null;
    blocking: number | null;
    unavailable: number;
  };
  by_kind: {
    active_owner_review_queue: number | null;
    memory_candidate_promotion: number | null;
  };
  note: string;
}

export type RuntimeBridgeHealthState = "ok" | "attention" | "fail";

export interface RuntimeBridgeHealthCheck {
  status: RuntimeBridgeHealthState;
  checked_at: string;
  source: string;
  diagnostics: string[];
  metrics?: Record<string, number | null>;
  note?: string;
}

export interface RuntimeBridgeHealth {
  overall: RuntimeBridgeHealthState;
  checked_at: string;
  config: RuntimeBridgeHealthCheck;
  store: RuntimeBridgeHealthCheck;
  projections: RuntimeBridgeHealthCheck;
  owner_reviews: RuntimeBridgeHealthCheck;
  memory_candidates: RuntimeBridgeHealthCheck;
}

const DEFAULT_STATUS_SUBCHECK_TIMEOUT_MS = 1000;
const OWNER_DECISION_SUMMARY_NOTE = "Unified owner decision surface: backlog includes batchable memory-candidate promotion decisions plus active review items; blocking counts only runtime-blocking owner reviews.";

interface RuntimeBridgeReviewSurfaces {
  owner_decision_items: {
    record_kind: "owner_review_item_collection";
    authority_layer: "runtime_status";
    authority_scope: "owner_decision";
    review_stage: "unified";
    total_pending_count: number | null;
    active_review_count: number | null;
    backlog_count: number | null;
    blocking_count: number | null;
    unavailable_count: number;
    counts_toward_pending_owner_reviews: true;
    counts_toward_blocking_owner_reviews: false;
    note: string;
  };
  owner_review_queues: {
    record_kind: "owner_review_queue";
    authority_layer: "runtime_status";
    authority_scope: "operational";
    operational_queue_state: "not_queued" | "queued" | "unavailable";
    counts_toward_pending_owner_reviews: true;
    openclaw_count: number | null;
    hermes_count: number | null;
    total_count: number | null;
    note: string;
  };
  memory_candidates: {
    record_kind: "memory_candidate";
    authority_layer: "derived";
    authority_scope: "candidate_governance";
    owner_review_status: "not_required" | "required_not_queued" | "unavailable";
    operational_queue_state: "not_queued" | "unavailable";
    counts_toward_pending_owner_reviews: false;
    queue_ref: null;
    openclaw_requires_owner_review_count: number | null;
    hermes_requires_owner_review_count: number | null;
    total_requires_owner_review_count: number | null;
    note: string;
  };
}

async function exists(path: string): Promise<boolean> {
  await access(path).then(() => undefined);
  return true;
}

function collectLayoutDirectories(value: unknown): string[] {
  if (typeof value === "string") {
    return value.includes(".") ? [] : [value];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap((entry) => collectLayoutDirectories(entry));
}

export async function initializeCristalinaStore(storeRoot: string, now = new Date().toISOString()): Promise<string> {
  const root = resolve(storeRoot);
  const manifest = createStoreManifest({
    store_id: `store_${Buffer.from(root).toString("hex").slice(0, 24) || "local"}`,
    now,
  });

  await mkdir(root, { recursive: true });
  const directories = new Set([
    ...Object.values(manifest.roots),
    ...collectLayoutDirectories(STORAGE_LAYOUT),
  ]);
  for (const directory of directories) {
    await mkdir(join(root, directory), { recursive: true });
  }
  await writeFile(join(root, "manifest.yaml"), serializeStoreManifestYaml(manifest));
  return root;
}

function healthCheck(input: {
  status: RuntimeBridgeHealthState;
  checkedAt: string;
  source: string;
  diagnostics?: string[];
  metrics?: Record<string, number | null>;
  note?: string;
}): RuntimeBridgeHealthCheck {
  return {
    status: input.status,
    checked_at: input.checkedAt,
    source: input.source,
    diagnostics: input.diagnostics ?? [],
    ...(input.metrics ? { metrics: input.metrics } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
}

function overallHealth(checks: RuntimeBridgeHealthCheck[]): RuntimeBridgeHealthState {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "attention")) return "attention";
  return "ok";
}

function formatStatusError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error instanceof ValidationError && error.issues.length > 0) {
    const details = error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    const suffix = error.issues.length > 3 ? `; +${error.issues.length - 3} more issue(s)` : "";
    return `${error.message}; ${details}${suffix}`;
  }
  return error.message;
}

function reviewSurfaces(input: {
  ownerReviews: {
    openclaw: Awaited<ReturnType<typeof listOpenClawConversationPreferenceOwnerRatificationQueue>>;
    hermes: Awaited<ReturnType<typeof listHermesConversationPreferenceOwnerRatificationQueue>>;
  } | null;
  memoryCandidates: {
    openclaw: MemoryCanonCandidateReport;
    hermes: MemoryCanonCandidateReport;
  } | null;
}): RuntimeBridgeReviewSurfaces {
  const openclawQueueCount = input.ownerReviews?.openclaw.length ?? null;
  const hermesQueueCount = input.ownerReviews?.hermes.length ?? null;
  const totalQueueCount = openclawQueueCount === null || hermesQueueCount === null
    ? null
    : openclawQueueCount + hermesQueueCount;
  const openclawCandidateCount = input.memoryCandidates?.openclaw.review_surface.candidate_requires_owner_review_count ?? null;
  const hermesCandidateCount = input.memoryCandidates?.hermes.review_surface.candidate_requires_owner_review_count ?? null;
  const totalCandidateCount = openclawCandidateCount === null || hermesCandidateCount === null
    ? null
    : openclawCandidateCount + hermesCandidateCount;
  const ownerDecisions = ownerDecisionSummaryFromCounts({
    activeReviewCount: totalQueueCount,
    candidateBacklogCount: totalCandidateCount,
  });
  return {
    owner_decision_items: {
      record_kind: "owner_review_item_collection",
      authority_layer: "runtime_status",
      authority_scope: "owner_decision",
      review_stage: "unified",
      total_pending_count: ownerDecisions.backlog,
      active_review_count: ownerDecisions.in_review,
      backlog_count: ownerDecisions.by_stage.backlog,
      blocking_count: ownerDecisions.blocking,
      unavailable_count: ownerDecisions.by_stage.unavailable,
      counts_toward_pending_owner_reviews: true,
      counts_toward_blocking_owner_reviews: false,
      note: OWNER_DECISION_SUMMARY_NOTE,
    },
    owner_review_queues: {
      record_kind: "owner_review_queue",
      authority_layer: "runtime_status",
      authority_scope: "operational",
      operational_queue_state: input.ownerReviews === null
        ? "unavailable"
        : totalQueueCount !== null && totalQueueCount > 0
          ? "queued"
          : "not_queued",
      counts_toward_pending_owner_reviews: true,
      openclaw_count: openclawQueueCount,
      hermes_count: hermesQueueCount,
      total_count: totalQueueCount,
      note: "This is the active operational owner-review queue counted by pending_owner_reviews.",
    },
    memory_candidates: {
      record_kind: "memory_candidate",
      authority_layer: "derived",
      authority_scope: "candidate_governance",
      owner_review_status: input.memoryCandidates === null
        ? "unavailable"
        : totalCandidateCount && totalCandidateCount > 0
          ? "required_not_queued"
          : "not_required",
      operational_queue_state: input.memoryCandidates === null ? "unavailable" : "not_queued",
      counts_toward_pending_owner_reviews: false,
      queue_ref: null,
      openclaw_requires_owner_review_count: openclawCandidateCount,
      hermes_requires_owner_review_count: hermesCandidateCount,
      total_requires_owner_review_count: totalCandidateCount,
      note: "These candidates may require owner review before promotion, but they are not active queue entries and do not count toward pending_owner_reviews unless materialized with a queue_ref.",
    },
  };
}

function ownerDecisionSummaryFromCounts(input: {
  activeReviewCount: number | null;
  candidateBacklogCount: number | null;
}): RuntimeBridgeOwnerDecisionSummary {
  const unavailable = (input.activeReviewCount === null ? 1 : 0) + (input.candidateBacklogCount === null ? 1 : 0);
  const backlog = input.activeReviewCount === null || input.candidateBacklogCount === null
    ? null
    : input.activeReviewCount + input.candidateBacklogCount;
  return {
    backlog,
    in_review: input.activeReviewCount,
    blocking: input.activeReviewCount === null ? null : 0,
    by_stage: {
      backlog: input.candidateBacklogCount,
      in_review: input.activeReviewCount,
      blocking: input.activeReviewCount === null ? null : 0,
      unavailable,
    },
    by_kind: {
      active_owner_review_queue: input.activeReviewCount,
      memory_candidate_promotion: input.candidateBacklogCount,
    },
    note: OWNER_DECISION_SUMMARY_NOTE,
  };
}

async function collectSubcheck<T>(input: {
  source: string;
  checkedAt: string;
  fallback: T;
  run: () => Promise<T>;
  metrics: (value: T) => Record<string, number | null>;
  note?: string;
  timeoutMs?: number;
}): Promise<{ value: T; health: RuntimeBridgeHealthCheck }> {
  try {
    const timeoutMs = Math.max(1, Math.floor(input.timeoutMs ?? DEFAULT_STATUS_SUBCHECK_TIMEOUT_MS));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const value = await Promise.race([
      input.run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    return {
      value,
      health: healthCheck({
        status: "ok",
        checkedAt: input.checkedAt,
        source: input.source,
        metrics: input.metrics(value),
        note: input.note,
      }),
    };
  } catch (error) {
    const message = formatStatusError(error);
    return {
      value: input.fallback,
      health: healthCheck({
        status: "attention",
        checkedAt: input.checkedAt,
        source: input.source,
        diagnostics: [`${input.source} failed: ${message}`],
        metrics: input.metrics(input.fallback),
        note: input.note,
      }),
    };
  }
}

export async function loadStoreManifest(storeRoot: string): Promise<ReturnType<typeof parseStoreManifestYaml> | null> {
  const path = join(storeRoot, "manifest.yaml");
  const found = await exists(path).catch(() => false);
  if (!found) return null;
  return parseStoreManifestYaml(await readFile(path, "utf8"));
}

export async function collectRuntimeBridgeStatus(input: {
  config: CristalinaConfig;
  configDiagnostics: string[];
  storeRoot: string | null;
  includeMemoryCandidateReviewSurface?: boolean;
  subcheckTimeoutMs?: number;
  collectors?: {
    openclawProjections?: (storeRoot: string) => Promise<Awaited<ReturnType<typeof listOpenClawProjectionRuntimeViews>>>;
    hermesProjections?: (storeRoot: string) => Promise<Awaited<ReturnType<typeof listHermesProjectionRuntimeViews>>>;
    openclawReviews?: (storeRoot: string) => Promise<Awaited<ReturnType<typeof listOpenClawConversationPreferenceOwnerRatificationQueue>>>;
    hermesReviews?: (storeRoot: string) => Promise<Awaited<ReturnType<typeof listHermesConversationPreferenceOwnerRatificationQueue>>>;
    openclawMemoryCandidates?: (storeRoot: string) => Promise<MemoryCanonCandidateReport>;
    hermesMemoryCandidates?: (storeRoot: string) => Promise<MemoryCanonCandidateReport>;
  };
}): Promise<RuntimeBridgeStatus> {
  const checkedAt = new Date().toISOString();
  const diagnostics = [...input.configDiagnostics];
  const storeRoot = input.storeRoot;
  const includeMemoryCandidateReviewSurface = input.includeMemoryCandidateReviewSurface === true;
  if (!input.config.runtimes?.openclaw?.runtime_instance_ref) {
    diagnostics.push("OpenClaw runtime binding is missing runtimes.openclaw.runtime_instance_ref");
  }
  if (!input.config.runtimes?.hermes?.runtime_instance_ref) {
    diagnostics.push("Hermes runtime binding is missing runtimes.hermes.runtime_instance_ref");
  }
  const configHealth = healthCheck({
    status: diagnostics.length === 0 ? "ok" : "fail",
    checkedAt,
    source: "config",
    diagnostics,
  });

  if (!storeRoot) {
    diagnostics.push("No store root configured. Run cristalina init or provide --store-root.");
    const storeHealth = healthCheck({
      status: "fail",
      checkedAt,
      source: "store_manifest",
      diagnostics: ["No store root configured. Run cristalina init or provide --store-root."],
    });
    const projectionHealth = healthCheck({
      status: "attention",
      checkedAt,
      source: "projection_runtime_views",
      diagnostics: ["Projection views were not checked because no store root is configured."],
      metrics: { openclaw: 0, hermes: 0 },
    });
    const ownerReviewsHealth = healthCheck({
      status: "attention",
      checkedAt,
      source: "owner_review_queues",
      diagnostics: ["Owner review queues were not checked because no store root is configured."],
      metrics: { openclaw: 0, hermes: 0 },
      note: "Counts active queue entries only for the active owner-review queue; memory candidates are summarized with it in owner_decisions for the unified backlog/in-review/blocking summary.",
    });
    const memoryCandidatesHealth = healthCheck({
      status: "attention",
      checkedAt,
      source: "memory_candidate_review_surface",
      diagnostics: ["Memory candidate review surfaces were not checked because no store root is configured."],
      metrics: { openclaw_requires_owner_review: null, hermes_requires_owner_review: null },
      note: "Candidate review requirements are included in the owner_decisions backlog, but are not active queue entries until materialized with a queue_ref.",
    });
    return {
      store_root: null,
      store_manifest_found: false,
      config_valid: diagnostics.length === 0,
      diagnostics,
      health: {
        overall: overallHealth([configHealth, storeHealth, projectionHealth, ownerReviewsHealth, memoryCandidatesHealth]),
        checked_at: checkedAt,
        config: configHealth,
        store: storeHealth,
        projections: projectionHealth,
        owner_reviews: ownerReviewsHealth,
        memory_candidates: memoryCandidatesHealth,
      },
      review_surfaces: reviewSurfaces({ ownerReviews: null, memoryCandidates: null }),
      projections: { openclaw: [], hermes: [] },
      owner_decisions: ownerDecisionSummaryFromCounts({ activeReviewCount: null, candidateBacklogCount: null }),
      pending_owner_reviews: { openclaw: 0, hermes: 0 },
    };
  }

  const manifest = await loadStoreManifest(storeRoot);
  if (!manifest) {
    diagnostics.push(`Store manifest not found at ${join(storeRoot, "manifest.yaml")}`);
  }
  const storeHealth = healthCheck({
    status: manifest ? "ok" : "fail",
    checkedAt,
    source: "store_manifest",
    diagnostics: manifest ? [] : [`Store manifest not found at ${join(storeRoot, "manifest.yaml")}`],
    metrics: { manifest_found: manifest ? 1 : 0 },
  });

  const projectionFallback = {
    openclaw: [] as Awaited<ReturnType<typeof listOpenClawProjectionRuntimeViews>>,
    hermes: [] as Awaited<ReturnType<typeof listHermesProjectionRuntimeViews>>,
  };
  const reviewsFallback = {
    openclaw: [] as Awaited<ReturnType<typeof listOpenClawConversationPreferenceOwnerRatificationQueue>>,
    hermes: [] as Awaited<ReturnType<typeof listHermesConversationPreferenceOwnerRatificationQueue>>,
  };
  const candidateFallback = null as {
    openclaw: MemoryCanonCandidateReport;
    hermes: MemoryCanonCandidateReport;
  } | null;
  const projectionSubcheck = manifest
    ? await collectSubcheck({
        source: "projection_runtime_views",
        checkedAt,
        fallback: projectionFallback,
        run: async () => {
          const [openclaw, hermes] = await Promise.all([
            (input.collectors?.openclawProjections ?? listOpenClawProjectionRuntimeViews)(storeRoot),
            (input.collectors?.hermesProjections ?? listHermesProjectionRuntimeViews)(storeRoot),
          ]);
          return { openclaw, hermes };
        },
        metrics: (value) => ({ openclaw: value.openclaw.length, hermes: value.hermes.length }),
        timeoutMs: input.subcheckTimeoutMs,
      })
    : {
        value: projectionFallback,
        health: healthCheck({
          status: "attention",
          checkedAt,
          source: "projection_runtime_views",
          diagnostics: ["Projection views were not checked because the store manifest is missing."],
          metrics: { openclaw: 0, hermes: 0 },
        }),
      };
  const reviewsSubcheck = manifest
    ? await collectSubcheck({
        source: "owner_review_queues",
        checkedAt,
        fallback: reviewsFallback,
        run: async () => {
          const [openclaw, hermes] = await Promise.all([
            (input.collectors?.openclawReviews ?? listOpenClawConversationPreferenceOwnerRatificationQueue)(storeRoot),
            (input.collectors?.hermesReviews ?? listHermesConversationPreferenceOwnerRatificationQueue)(storeRoot),
          ]);
          return { openclaw, hermes };
        },
        metrics: (value) => ({ openclaw: value.openclaw.length, hermes: value.hermes.length }),
        note: "Counts active queue entries only for the active owner-review queue; memory candidates are summarized with it in owner_decisions for the unified backlog/in-review/blocking summary.",
        timeoutMs: input.subcheckTimeoutMs,
      })
    : {
        value: reviewsFallback,
        health: healthCheck({
          status: "attention",
          checkedAt,
          source: "owner_review_queues",
          diagnostics: ["Owner review queues were not checked because the store manifest is missing."],
          metrics: { openclaw: 0, hermes: 0 },
          note: "Counts active queue entries only for the active owner-review queue; memory candidates are summarized with it in owner_decisions for the unified backlog/in-review/blocking summary.",
        }),
      };
  const candidateSubcheck = manifest && includeMemoryCandidateReviewSurface
    ? await collectSubcheck({
        source: "memory_candidate_review_surface",
        checkedAt,
        fallback: candidateFallback,
        run: async () => {
          const [openclaw, hermes] = await Promise.all([
            input.collectors?.openclawMemoryCandidates
              ? input.collectors.openclawMemoryCandidates(storeRoot)
              : summarizeMemoryCanonCandidates({ rootDir: storeRoot, runtime: "openclaw", limit: 1 }),
            input.collectors?.hermesMemoryCandidates
              ? input.collectors.hermesMemoryCandidates(storeRoot)
              : summarizeMemoryCanonCandidates({ rootDir: storeRoot, runtime: "hermes", limit: 1 }),
          ]);
          return { openclaw, hermes };
        },
        metrics: (value) => ({
          openclaw_requires_owner_review: value?.openclaw.review_surface.candidate_requires_owner_review_count ?? null,
          hermes_requires_owner_review: value?.hermes.review_surface.candidate_requires_owner_review_count ?? null,
        }),
        note: "Reports memory candidates that would require owner review before promotion; these contribute to the owner decision backlog but are not active queue entries.",
        timeoutMs: input.subcheckTimeoutMs,
      })
    : {
        value: candidateFallback,
        health: healthCheck({
          status: manifest ? "ok" : "attention",
          checkedAt,
          source: "memory_candidate_review_surface",
          diagnostics: manifest ? [] : ["Memory candidate review surfaces were not checked because the store manifest is missing."],
          metrics: { openclaw_requires_owner_review: null, hermes_requires_owner_review: null },
          note: manifest
            ? "Memory candidate review surface was not requested by this command."
            : "Candidate review requirements are included in the owner_decisions backlog when available, but are not active queue entries until materialized with a queue_ref.",
        }),
      };
  diagnostics.push(
    ...projectionSubcheck.health.diagnostics,
    ...reviewsSubcheck.health.diagnostics,
    ...candidateSubcheck.health.diagnostics,
  );
  const healthChecks = [configHealth, storeHealth, projectionSubcheck.health, reviewsSubcheck.health, candidateSubcheck.health];
  const reviewSurfaceSummary = reviewSurfaces({
    ownerReviews: reviewsSubcheck.health.status === "ok" ? reviewsSubcheck.value : null,
    memoryCandidates: candidateSubcheck.health.status === "ok" ? candidateSubcheck.value : null,
  });

  return {
    store_root: storeRoot,
    store_manifest_found: Boolean(manifest),
    config_valid: diagnostics.length === 0,
    diagnostics,
    health: {
      overall: overallHealth(healthChecks),
      checked_at: checkedAt,
      config: configHealth,
      store: storeHealth,
      projections: projectionSubcheck.health,
      owner_reviews: reviewsSubcheck.health,
      memory_candidates: candidateSubcheck.health,
    },
    review_surfaces: reviewSurfaceSummary,
    projections: {
      openclaw: projectionSubcheck.value.openclaw,
      hermes: projectionSubcheck.value.hermes,
    },
    owner_decisions: ownerDecisionSummaryFromCounts({
      activeReviewCount: reviewSurfaceSummary.owner_decision_items.active_review_count,
      candidateBacklogCount: reviewSurfaceSummary.owner_decision_items.backlog_count,
    }),
    pending_owner_reviews: {
      openclaw: reviewsSubcheck.value.openclaw.length,
      hermes: reviewsSubcheck.value.hermes.length,
    },
  };
}

export function formatStatus(status: RuntimeBridgeStatus): string {
  return `${JSON.stringify(status, null, 2)}\n`;
}
