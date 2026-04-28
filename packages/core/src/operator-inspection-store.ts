import type { Diagnostic, ProjectionManifest } from "./types.js";
import {
  loadDiagnostics,
  loadProjectionManifests,
  loadSessionResumeReceipts,
  loadWorkingMemoryCheckpoints,
} from "./store/io.js";

export interface StoreInspectionSummary {
  projection_manifest_count: number;
  diagnostic_count: number;
  working_memory_checkpoint_count: number;
  session_resume_receipt_count: number;
}

export async function listStoreDiagnostics(rootDir: string): Promise<Diagnostic[]> {
  return loadDiagnostics(rootDir);
}

export async function listStoreProjectionManifests(rootDir: string): Promise<ProjectionManifest[]> {
  return loadProjectionManifests(rootDir);
}

export async function inspectCristalinaStore(rootDir: string): Promise<StoreInspectionSummary> {
  const [projectionManifests, diagnostics, checkpoints, receipts] = await Promise.all([
    loadProjectionManifests(rootDir),
    loadDiagnostics(rootDir),
    loadWorkingMemoryCheckpoints(rootDir),
    loadSessionResumeReceipts(rootDir),
  ]);
  return {
    projection_manifest_count: projectionManifests.length,
    diagnostic_count: diagnostics.length,
    working_memory_checkpoint_count: checkpoints.length,
    session_resume_receipt_count: receipts.length,
  };
}

export async function planCristalinaStoreRecovery(rootDir: string): Promise<{
  store_root: string;
  status: "no_recovery_action_executed";
  note: string;
}> {
  return {
    store_root: rootDir,
    status: "no_recovery_action_executed",
    note: "Recovery planning is inspect-only from the CLI surface; write-path recovery remains owned by core workflows.",
  };
}
