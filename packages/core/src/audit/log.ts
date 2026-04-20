import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { STORAGE_LAYOUT } from "../storage.js";
import { atomicWriteText, isMissingFileError } from "../store/atomic-write.js";
import type { CoreRecord } from "../types.js";
import type { ValidationIssue } from "../validation.js";

export interface AuditChangeEntry {
  entry_id?: string;
  at: string;
  operation: string;
  record_id: string;
  record_kind: string;
  record_layer: string;
  detail: string;
  related_refs?: string[];
}

export interface ValidationLogEntry {
  entry_id?: string;
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

function hasJsonLineEntry(source: string, entryId: string): boolean {
  if (source.length === 0) {
    return false;
  }

  for (const line of source.split("\n")) {
    if (!line) continue;
    const parsed = JSON.parse(line) as { entry_id?: unknown };
    if (parsed.entry_id === entryId) {
      return true;
    }
  }

  return false;
}

const APPEND_LOCK_TIMEOUT_MS = 5_000;
const APPEND_LOCK_STALE_MS = 30_000;
const APPEND_LOCK_POLL_MS = 10;

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function appendLockPath(filePath: string): string {
  return `${filePath}.lock`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function appendLockIsStale(lockPath: string, nowMs: number): Promise<boolean> {
  const lockStat = await stat(lockPath).catch((error) => {
    if (isMissingFileError(error)) return undefined;
    throw error;
  });
  if (!lockStat) {
    return false;
  }
  return nowMs - lockStat.mtimeMs > APPEND_LOCK_STALE_MS;
}

async function acquireAppendLock(filePath: string): Promise<() => Promise<void>> {
  const lockPath = appendLockPath(filePath);
  const deadline = Date.now() + APPEND_LOCK_TIMEOUT_MS;

  while (true) {
    try {
      await mkdir(lockPath, { recursive: false });
      return async () => {
        await rm(lockPath, { recursive: true, force: true });
      };
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      const nowMs = Date.now();
      if (await appendLockIsStale(lockPath, nowMs)) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }

      if (nowMs >= deadline) {
        throw new Error(`Timed out acquiring append lock for ${filePath}`);
      }

      await sleep(APPEND_LOCK_POLL_MS);
    }
  }
}

async function withAppendLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(filePath), { recursive: true });
  const release = await acquireAppendLock(filePath);

  try {
    return await fn();
  } finally {
    await release();
  }
}

async function appendJsonLine(filePath: string, value: { entry_id?: string }): Promise<void> {
  await withAppendLock(filePath, async () => {
    const payload = `${JSON.stringify(value)}\n`;
    const source = await readFile(filePath, "utf8").catch((error) => {
      if (isMissingFileError(error)) return "";
      throw error;
    });
    if (value.entry_id && hasJsonLineEntry(source, value.entry_id)) {
      return;
    }
    await atomicWriteText(filePath, `${source}${payload}`);
  });
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
  await atomicWriteText(filePath, `${JSON.stringify(snapshot, null, 2)}\n`);
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
      await atomicWriteText(filePath, `${JSON.stringify(record, null, 2)}\n`);

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
