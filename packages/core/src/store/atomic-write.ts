import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export async function atomicWriteText(filePath: string, content: string): Promise<void> {
  const parentDir = dirname(filePath);
  const tempPath = join(parentDir, `.${basename(filePath)}.tmp-${randomUUID()}`);

  await mkdir(parentDir, { recursive: true });
  await writeFile(tempPath, content, "utf8");

  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
