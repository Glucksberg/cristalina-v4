import {
  listProjectionRuntimeViews,
  loadLatestProjectionRuntimeView,
  loadProjectionRuntimeView,
  type ProjectionRuntimeFilter,
  type ProjectionRuntimeSummary,
  type ProjectionRuntimeView,
} from "../../core/dist/index.js";

export type HermesProjectionRuntimeSummary = ProjectionRuntimeSummary;
export type HermesProjectionRuntimeView = ProjectionRuntimeView;

export async function listHermesProjectionRuntimeViews(rootDir: string): Promise<HermesProjectionRuntimeSummary[]> {
  return listProjectionRuntimeViews(rootDir, "hermes");
}

export async function loadHermesProjectionRuntimeView(input: {
  rootDir: string;
  manifest_id: string;
}): Promise<HermesProjectionRuntimeView> {
  return loadProjectionRuntimeView({
    ...input,
    adapter: "hermes",
  });
}

export async function loadLatestHermesProjectionRuntimeView(
  rootDir: string,
  filter?: ProjectionRuntimeFilter,
): Promise<HermesProjectionRuntimeView | undefined> {
  return loadLatestProjectionRuntimeView(rootDir, "hermes", filter);
}
