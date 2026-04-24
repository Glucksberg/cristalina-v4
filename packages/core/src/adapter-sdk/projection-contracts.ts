import type { ProjectionArtifact, ProjectionManifest, RuntimeKind } from "../types.js";
import { resolveProjectionArtifactPath, stripProjectionArtifactFragment } from "./projection-path.js";

type ProjectionAdapterKind = Exclude<RuntimeKind, "generic">;

interface ProjectionMarkdownResolutionCandidate {
  artifact: ProjectionArtifact;
  basePath: string;
}

export function resolveProjectionMarkdownPath(input: {
  rootDir: string;
  manifest: ProjectionManifest;
  artifacts: ProjectionArtifact[];
}): string {
  const artifactIds = new Set(input.manifest.artifact_refs);
  const manifestArtifacts = input.artifacts.filter((record) => artifactIds.has(record.id));
  const markdownCandidates = manifestArtifacts
    .map((artifact): ProjectionMarkdownResolutionCandidate | undefined => {
      const basePath = stripProjectionArtifactFragment(artifact.path);
      if (!basePath.endsWith(".md")) {
        return undefined;
      }
      return {
        artifact,
        basePath,
      };
    })
    .filter((candidate): candidate is ProjectionMarkdownResolutionCandidate => candidate !== undefined);
  const directMarkdownCandidates = markdownCandidates.filter(
    ({ artifact }) => artifact.artifact_kind.includes("markdown") || !artifact.path.includes("#"),
  );
  const selectedCandidates = directMarkdownCandidates.length > 0 ? directMarkdownCandidates : markdownCandidates;
  const markdownBasePaths = [...new Set(selectedCandidates.map((candidate) => candidate.basePath))];

  if (markdownBasePaths.length === 0) {
    throw new Error(`Projection manifest ${input.manifest.id} does not reference a markdown artifact`);
  }
  if (markdownBasePaths.length > 1) {
    throw new Error(`Projection manifest ${input.manifest.id} references multiple markdown artifacts`);
  }

  return resolveProjectionArtifactPath(input.rootDir, markdownBasePaths[0]!);
}

export function projectionManifestMatchesContract(input: {
  manifest: ProjectionManifest;
  adapter?: ProjectionAdapterKind;
  manifest_id?: string;
  projection_profile?: string;
  audience?: string;
  compiler_version?: string;
  read_policy_version?: string;
  snapshot_strategy?: ProjectionManifest["snapshot_strategy"];
  artifact_refs?: string[];
  require_boundary_metadata?: boolean;
}): boolean {
  const {
    manifest,
    adapter,
    manifest_id,
    projection_profile,
    audience,
    compiler_version,
    read_policy_version,
    snapshot_strategy,
    artifact_refs,
    require_boundary_metadata,
  } = input;

  if (manifest_id !== undefined && manifest.id !== manifest_id) return false;
  if (adapter !== undefined && manifest.adapter !== adapter) return false;
  if (projection_profile !== undefined && manifest.projection_profile !== projection_profile) return false;
  if (audience !== undefined && manifest.audience !== audience) return false;
  if (compiler_version !== undefined && manifest.compiler_version !== compiler_version) return false;
  if (read_policy_version !== undefined && manifest.read_policy_version !== read_policy_version) return false;
  if (snapshot_strategy !== undefined && manifest.snapshot_strategy !== snapshot_strategy) return false;
  if (artifact_refs !== undefined && JSON.stringify(manifest.artifact_refs) !== JSON.stringify(artifact_refs)) return false;
  if (
    require_boundary_metadata &&
    (typeof manifest.boundary_note !== "string" || manifest.boundary_note.length === 0 || !manifest.observed_layer_updates)
  ) {
    return false;
  }

  return true;
}

export function assertRuntimeBootstrapProjectionContract(input: {
  rootDir: string;
  markdown_relative_path: string;
  manifest: ProjectionManifest;
  artifacts: ProjectionArtifact[];
  adapter: ProjectionAdapterKind;
  manifest_id: string;
  artifact_ids: [string, string, string];
  compiler_version: string;
  read_policy_version: string;
}): void {
  const expectedArtifactPaths = new Map<string, string>([
    [input.artifact_ids[0], `${input.markdown_relative_path}#canon`],
    [input.artifact_ids[1], `${input.markdown_relative_path}#world`],
    [input.artifact_ids[2], `${input.markdown_relative_path}#wiki`],
  ]);
  const mismatches: string[] = [];

  if (!projectionManifestMatchesContract({
    manifest: input.manifest,
    adapter: input.adapter,
    manifest_id: input.manifest_id,
    projection_profile: "bootstrap",
    audience: "runtime",
    compiler_version: input.compiler_version,
    read_policy_version: input.read_policy_version,
    snapshot_strategy: "mixed_state_tolerant",
    artifact_refs: input.artifact_ids,
    require_boundary_metadata: true,
  })) {
    if (input.manifest.id !== input.manifest_id) mismatches.push("manifest.id");
    if (input.manifest.adapter !== input.adapter) mismatches.push("manifest.adapter");
    if (input.manifest.projection_profile !== "bootstrap") mismatches.push("manifest.projection_profile");
    if (input.manifest.audience !== "runtime") mismatches.push("manifest.audience");
    if (input.manifest.compiler_version !== input.compiler_version) mismatches.push("manifest.compiler_version");
    if (input.manifest.read_policy_version !== input.read_policy_version) mismatches.push("manifest.read_policy_version");
    if (input.manifest.snapshot_strategy !== "mixed_state_tolerant") mismatches.push("manifest.snapshot_strategy");
    if (typeof input.manifest.boundary_note !== "string" || input.manifest.boundary_note.length === 0) {
      mismatches.push("manifest.boundary_note");
    }
    if (!input.manifest.observed_layer_updates) {
      mismatches.push("manifest.observed_layer_updates");
    }
    if (JSON.stringify(input.manifest.artifact_refs) !== JSON.stringify(input.artifact_ids)) {
      mismatches.push("manifest.artifact_refs");
    }
  }

  if (input.artifacts.length !== input.artifact_ids.length) {
    mismatches.push("artifacts.length");
  }

  const artifactIds = new Set(input.artifacts.map((artifact) => artifact.id));
  for (const artifactId of input.artifact_ids) {
    if (!artifactIds.has(artifactId)) {
      mismatches.push(`artifact:${artifactId}:missing`);
    }
  }

  for (const artifact of input.artifacts) {
    const expectedPath = expectedArtifactPaths.get(artifact.id);
    if (!expectedPath) {
      mismatches.push(`artifact:${artifact.id}:unexpected`);
      continue;
    }
    if (artifact.adapter !== input.adapter) mismatches.push(`artifact:${artifact.id}:adapter`);
    if (artifact.artifact_kind !== "layer_fragment") mismatches.push(`artifact:${artifact.id}:artifact_kind`);
    if (artifact.path !== expectedPath) mismatches.push(`artifact:${artifact.id}:path`);
  }

  if (mismatches.length > 0) {
    throw new Error(`Stored runtime bootstrap projection failed contract checks: ${mismatches.join(", ")}`);
  }
}
