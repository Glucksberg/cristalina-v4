import { listStoreProjectionManifests, type ProjectionManifest, type ProjectionRuntimeSummary } from "@cristalina-v4/core";

import { collectRuntimeBridgeStatus } from "./bridge.js";
import { loadCristalinaConfig, resolveStoreRoot } from "./config.js";

type RuntimeName = "openclaw" | "hermes";

export interface ProjectionVerifyInput {
  configPath?: string;
  storeRoot?: string;
}

interface RuntimeProjectionCompatibility {
  runtime: RuntimeName;
  status: "compatible" | "missing" | "incompatible";
  summary: ProjectionRuntimeSummary | null;
  manifest: ProjectionManifest | null;
  diagnostics: string[];
}

export interface ProjectionVerifyReport {
  schema_version: 1;
  status: "verified" | "blocked";
  store_root: string | null;
  config_path: string | null;
  runtimes: {
    openclaw: RuntimeProjectionCompatibility;
    hermes: RuntimeProjectionCompatibility;
  };
  diagnostics: string[];
}

function latestProjection(summaries: ProjectionRuntimeSummary[]): ProjectionRuntimeSummary | null {
  return summaries[0] ?? null;
}

function verifyRuntime(input: {
  runtime: RuntimeName;
  expectedRuntimeInstanceRef?: string;
  summary: ProjectionRuntimeSummary | null;
  manifests: ProjectionManifest[];
}): RuntimeProjectionCompatibility {
  const diagnostics: string[] = [];
  if (!input.summary) {
    return {
      runtime: input.runtime,
      status: "missing",
      summary: null,
      manifest: null,
      diagnostics: [`No ${input.runtime} runtime projection is available`],
    };
  }

  const manifest = input.manifests.find((entry) => entry.id === input.summary!.manifest_id) ?? null;
  if (!manifest) {
    diagnostics.push(`Projection manifest ${input.summary.manifest_id} was listed but cannot be loaded`);
  } else {
    if (manifest.adapter !== input.runtime) {
      diagnostics.push(`Projection manifest ${manifest.id} adapter ${manifest.adapter} does not match ${input.runtime}`);
    }
    if (manifest.projection_profile !== "bootstrap") {
      diagnostics.push(`Projection manifest ${manifest.id} projection_profile must be bootstrap`);
    }
    if (manifest.audience !== "runtime") {
      diagnostics.push(`Projection manifest ${manifest.id} audience must be runtime`);
    }
    if (!manifest.read_policy_version) {
      diagnostics.push(`Projection manifest ${manifest.id} is missing read_policy_version`);
    }
    if (!manifest.compiler_version) {
      diagnostics.push(`Projection manifest ${manifest.id} is missing compiler_version`);
    }
    if (!manifest.context_refs || manifest.context_refs.length === 0) {
      diagnostics.push(`Projection manifest ${manifest.id} is missing context_refs`);
    }
    if (input.expectedRuntimeInstanceRef && manifest.runtime_instance_ref !== input.expectedRuntimeInstanceRef) {
      diagnostics.push(`Projection manifest ${manifest.id} runtime_instance_ref ${manifest.runtime_instance_ref ?? "(missing)"} does not match config ${input.expectedRuntimeInstanceRef}`);
    }
  }

  return {
    runtime: input.runtime,
    status: diagnostics.length === 0 ? "compatible" : "incompatible",
    summary: input.summary,
    manifest,
    diagnostics,
  };
}

export async function verifyRuntimeProjections(input: ProjectionVerifyInput = {}): Promise<ProjectionVerifyReport> {
  const loaded = await loadCristalinaConfig({ configPath: input.configPath });
  const storeRoot = resolveStoreRoot(loaded.config, input.storeRoot);
  const status = await collectRuntimeBridgeStatus({
    config: loaded.config,
    configDiagnostics: loaded.diagnostics,
    storeRoot,
  });
  const manifests = storeRoot && status.store_manifest_found
    ? await listStoreProjectionManifests(storeRoot).catch(() => [] as ProjectionManifest[])
    : [];
  const openclaw = verifyRuntime({
    runtime: "openclaw",
    expectedRuntimeInstanceRef: loaded.config.runtimes?.openclaw?.runtime_instance_ref,
    summary: latestProjection(status.projections.openclaw),
    manifests,
  });
  const hermes = verifyRuntime({
    runtime: "hermes",
    expectedRuntimeInstanceRef: loaded.config.runtimes?.hermes?.runtime_instance_ref,
    summary: latestProjection(status.projections.hermes),
    manifests,
  });
  const diagnostics = [
    ...status.diagnostics,
    ...openclaw.diagnostics.map((entry) => `openclaw: ${entry}`),
    ...hermes.diagnostics.map((entry) => `hermes: ${entry}`),
  ];

  return {
    schema_version: 1,
    status: diagnostics.length === 0 && openclaw.status === "compatible" && hermes.status === "compatible"
      ? "verified"
      : "blocked",
    store_root: storeRoot,
    config_path: loaded.path,
    runtimes: {
      openclaw,
      hermes,
    },
    diagnostics,
  };
}
