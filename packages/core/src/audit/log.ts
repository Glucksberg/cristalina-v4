import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { STORAGE_LAYOUT } from "../storage.js";
import type { CoreRecord } from "../types.js";
import type { ValidationIssue } from "../validation.js";

export interface AuditChangeEntry {
  at: string;
  operation: string;
  record_id: string;
  record_kind: string;
  record_layer: string;
  detail: string;
  related_refs?: string[];
}

export interface ValidationLogEntry {
  at: string;
  scope: string;
  issues: ValidationIssue[];
}

export interface SnapshotManifest {
  snapshot_id: string;
  created_at: string;
  reason: string;
  record_refs: string[];
  record_entries?: SnapshotRecordEntry[];
}

export interface SnapshotRecordEntry {
  sequence: number;
  record_id: string;
  record_kind: string;
  record_layer: string;
  path: string;
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  const payload = `${JSON.stringify(value)}\n`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, payload, { encoding: "utf8", flag: "a" });
}

export async function appendAuditChange(rootDir: string, entry: AuditChangeEntry): Promise<void> {
  await appendJsonLine(join(rootDir, STORAGE_LAYOUT.audits.changes), entry);
}

export async function appendValidationLog(rootDir: string, entry: ValidationLogEntry): Promise<void> {
  await appendJsonLine(join(rootDir, STORAGE_LAYOUT.audits.validation), entry);
}

export async function writeSnapshotManifest(rootDir: string, snapshot: SnapshotManifest): Promise<string> {
  const filePath = join(rootDir, STORAGE_LAYOUT.audits.snapshots, `${snapshot.snapshot_id}.json`);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return filePath;
}

function sanitizeSnapshotSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_");
}

export async function writeSnapshotRecordCopies(
  rootDir: string,
  snapshotId: string,
  records: CoreRecord[],
): Promise<SnapshotRecordEntry[]> {
  const snapshotDir = join(rootDir, STORAGE_LAYOUT.audits.snapshots, snapshotId, "records");
  await mkdir(snapshotDir, { recursive: true });

  return Promise.all(
    records.map(async (record, index) => {
      const filename = `${String(index + 1).padStart(4, "0")}-${sanitizeSnapshotSegment(record.id)}.json`;
      const filePath = join(snapshotDir, filename);
      await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

      return {
        sequence: index + 1,
        record_id: record.id,
        record_kind: record.kind,
        record_layer: record.layer,
        path: filePath,
      };
    }),
  );
}
