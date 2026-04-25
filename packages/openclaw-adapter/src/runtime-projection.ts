import {
  listProjectionRuntimeViews,
  loadLatestProjectionRuntimeView,
  loadProjectionRuntimeView,
  type ProjectionRuntimeSelectionFilter,
  type ProjectionRuntimeSummary,
  type ProjectionRuntimeView,
} from "@cristalina-v4/core";

export type OpenClawProjectionRuntimeSummary = ProjectionRuntimeSummary;
export type OpenClawProjectionRuntimeView = ProjectionRuntimeView;

export async function listOpenClawProjectionRuntimeViews(rootDir: string): Promise<OpenClawProjectionRuntimeSummary[]> {
  return listProjectionRuntimeViews(rootDir, "openclaw");
}

export async function loadOpenClawProjectionRuntimeView(input: {
  rootDir: string;
  manifest_id: string;
  consistency_requirement: ProjectionRuntimeSelectionFilter["consistency_requirement"];
}): Promise<OpenClawProjectionRuntimeView> {
  return loadProjectionRuntimeView({
    ...input,
    adapter: "openclaw",
  });
}

export async function loadLatestOpenClawProjectionRuntimeView(
  rootDir: string,
  filter: ProjectionRuntimeSelectionFilter,
): Promise<OpenClawProjectionRuntimeView | undefined> {
  return loadLatestProjectionRuntimeView(rootDir, "openclaw", filter);
}
