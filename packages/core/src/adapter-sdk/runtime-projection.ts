import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  CurationPacket,
  Diagnostic,
  ProjectionArtifact,
  ProjectionManifest,
  RuntimeKind,
} from "../types.js";
import {
  loadCurationPackets,
  loadDiagnostics,
  loadProjectionArtifacts,
  loadProjectionManifests,
} from "../store/io.js";
import { resolveProjectionArtifactPath, stripProjectionArtifactFragment } from "./projection-path.js";

type ProjectionAdapterKind = Exclude<RuntimeKind, "generic">;

export interface ProjectionRuntimeSummary {
  manifest_id: string;
  compiled_at: string;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
  diagnostic_count: number;
  review_count: number;
  pending_review_count: number;
}

export interface ProjectionRuntimeView {
  manifest: ProjectionManifest;
  markdown: string;
  diagnostics: Diagnostic[];
  reviews: CurationPacket[];
  pending_reviews: CurationPacket[];
  closed_reviews: CurationPacket[];
}

function compareProjectionTimestamps(left: ProjectionManifest, right: ProjectionManifest): number {
  const leftTimestamp = Date.parse(left.updated_at ?? left.created_at);
  const rightTimestamp = Date.parse(right.updated_at ?? right.created_at);
  return rightTimestamp - leftTimestamp;
}

export function resolveProjectionMarkdownPath(input: {
  rootDir: string;
  manifest: ProjectionManifest;
  artifacts: ProjectionArtifact[];
}): string {
  const artifactIds = new Set(input.manifest.artifact_refs);
  const manifestArtifacts = input.artifacts.filter((record) => artifactIds.has(record.id));
  const markdownArtifact = manifestArtifacts.find((record) => {
    const basePath = stripProjectionArtifactFragment(record.path);
    return basePath.endsWith(".md");
  });

  if (!markdownArtifact) {
    throw new Error(`Projection manifest ${input.manifest.id} does not reference a markdown artifact`);
  }

  return resolveProjectionArtifactPath(input.rootDir, markdownArtifact.path);
}

export async function listProjectionRuntimeViews(
  rootDir: string,
  adapter: ProjectionAdapterKind,
): Promise<ProjectionRuntimeSummary[]> {
  const storeRoot = resolve(rootDir);
  const [manifests, diagnostics, reviews] = await Promise.all([
    loadProjectionManifests(storeRoot),
    loadDiagnostics(storeRoot),
    loadCurationPackets(storeRoot),
  ]);

  return manifests
    .filter((manifest) => manifest.adapter === adapter)
    .sort(compareProjectionTimestamps)
    .map((manifest) => {
      const diagnosticIds = new Set(manifest.diagnostic_refs ?? []);
      const reviewIds = new Set(manifest.review_refs ?? []);
      const matchingReviews = reviews.filter((record) => reviewIds.has(record.id));

      return {
        manifest_id: manifest.id,
        compiled_at: manifest.updated_at ?? manifest.created_at,
        runtime_instance_ref: manifest.runtime_instance_ref ?? null,
        runtime_session_ref: manifest.runtime_session_ref ?? null,
        conversation_thread_ref: manifest.conversation_thread_ref ?? null,
        diagnostic_count: diagnostics.filter((record) => diagnosticIds.has(record.id)).length,
        review_count: matchingReviews.length,
        pending_review_count: matchingReviews.filter((record) => record.status === "pending").length,
      };
    });
}

export async function loadProjectionRuntimeView(input: {
  rootDir: string;
  manifest_id: string;
  adapter: ProjectionAdapterKind;
}): Promise<ProjectionRuntimeView> {
  const storeRoot = resolve(input.rootDir);
  const manifests = await loadProjectionManifests(storeRoot);
  const manifest = manifests.find((record) => record.id === input.manifest_id && record.adapter === input.adapter);
  if (!manifest) {
    throw new Error(`${input.adapter} projection manifest ${input.manifest_id} does not exist`);
  }

  const [artifacts, diagnostics, reviews] = await Promise.all([
    loadProjectionArtifacts(storeRoot, input.adapter),
    loadDiagnostics(storeRoot),
    loadCurationPackets(storeRoot),
  ]);
  const markdownPath = resolveProjectionMarkdownPath({
    rootDir: storeRoot,
    manifest,
    artifacts,
  });
  const markdown = await readFile(markdownPath, "utf8");
  const diagnosticIds = new Set(manifest.diagnostic_refs ?? []);
  const reviewIds = new Set(manifest.review_refs ?? []);
  const manifestDiagnostics = diagnostics.filter((record) => diagnosticIds.has(record.id));
  const manifestReviews = reviews.filter((record) => reviewIds.has(record.id));

  return {
    manifest,
    markdown,
    diagnostics: manifestDiagnostics,
    reviews: manifestReviews,
    pending_reviews: manifestReviews.filter((record) => record.status === "pending"),
    closed_reviews: manifestReviews.filter((record) => record.status !== "pending"),
  };
}

export async function loadLatestProjectionRuntimeView(
  rootDir: string,
  adapter: ProjectionAdapterKind,
): Promise<ProjectionRuntimeView | undefined> {
  const summaries = await listProjectionRuntimeViews(rootDir, adapter);
  const latest = summaries[0];
  if (!latest) {
    return undefined;
  }

  return loadProjectionRuntimeView({
    rootDir,
    manifest_id: latest.manifest_id,
    adapter,
  });
}
