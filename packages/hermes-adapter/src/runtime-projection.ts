import {
  listProjectionRuntimeViews,
  loadLatestProjectionRuntimeView,
  loadProjectionRuntimeView,
  type ProjectionRuntimeSelectionFilter,
  type ProjectionRuntimeSummary,
  type ProjectionRuntimeView,
} from "@cristalina-v4/core";

export type HermesProjectionRuntimeSummary = ProjectionRuntimeSummary;
export type HermesProjectionRuntimeView = ProjectionRuntimeView;

export async function listHermesProjectionRuntimeViews(rootDir: string): Promise<HermesProjectionRuntimeSummary[]> {
  return listProjectionRuntimeViews(rootDir, "hermes");
}

export async function loadHermesProjectionRuntimeView(input: {
  rootDir: string;
  manifest_id: string;
  consistency_requirement: ProjectionRuntimeSelectionFilter["consistency_requirement"];
}): Promise<HermesProjectionRuntimeView> {
  return loadProjectionRuntimeView({
    ...input,
    adapter: "hermes",
  });
}

export async function loadLatestHermesProjectionRuntimeView(
  rootDir: string,
  filter: ProjectionRuntimeSelectionFilter,
): Promise<HermesProjectionRuntimeView | undefined> {
  return loadLatestProjectionRuntimeView(rootDir, "hermes", filter);
}
