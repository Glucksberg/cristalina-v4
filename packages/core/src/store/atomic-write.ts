import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export interface AtomicWriteHooks {
  rename?: typeof rename;
  rm?: typeof rm;
}

export function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function syncDirectory(dirPath: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  const handle = await open(dirPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function atomicWriteText(filePath: string, content: string, hooks: AtomicWriteHooks = {}): Promise<void> {
  const parentDir = dirname(filePath);
  const tempPath = join(parentDir, `.${basename(filePath)}.tmp-${randomUUID()}`);
  const renameFile = hooks.rename ?? rename;
  const removeFile = hooks.rm ?? rm;

  await mkdir(parentDir, { recursive: true });
  const handle = await open(tempPath, "w");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await renameFile(tempPath, filePath);
    await syncDirectory(parentDir);
  } catch (error) {
    try {
      await removeFile(tempPath, { force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Atomic write failed and temp cleanup failed for ${filePath}`,
      );
    }
    throw error;
  }
}
