import {
  listProjectionRuntimeViews,
  loadLatestProjectionRuntimeView,
  loadProjectionRuntimeView,
  type ProjectionRuntimeFilter,
  type ProjectionRuntimeSummary,
  type ProjectionRuntimeView,
} from "../../core/dist/index.js";

export type OpenClawProjectionRuntimeSummary = ProjectionRuntimeSummary;
export type OpenClawProjectionRuntimeView = ProjectionRuntimeView;

export async function listOpenClawProjectionRuntimeViews(rootDir: string): Promise<OpenClawProjectionRuntimeSummary[]> {
  return listProjectionRuntimeViews(rootDir, "openclaw");
}

export async function loadOpenClawProjectionRuntimeView(input: {
  rootDir: string;
  manifest_id: string;
}): Promise<OpenClawProjectionRuntimeView> {
  return loadProjectionRuntimeView({
    ...input,
    adapter: "openclaw",
  });
}

export async function loadLatestOpenClawProjectionRuntimeView(
  rootDir: string,
  filter?: ProjectionRuntimeFilter,
): Promise<OpenClawProjectionRuntimeView | undefined> {
  return loadLatestProjectionRuntimeView(rootDir, "openclaw", filter);
}
