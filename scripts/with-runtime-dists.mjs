#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const LOCK_ROOT = join(REPO_ROOT, "node_modules", ".cache", "cristalina");
const LOCK_DIR = join(LOCK_ROOT, "core-dist.lock");
const LOCK_HELD_ENV = "CRISTALINA_CORE_DIST_LOCK_HELD";
const LOCK_STALE_MS = 10 * 60 * 1000;
const LOCK_TIMEOUT_MS = 2 * 60 * 1000;
const LOCK_POLL_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

async function acquireLock() {
  await mkdir(LOCK_ROOT, { recursive: true });
  const startedAt = Date.now();

  while (true) {
    try {
      await mkdir(LOCK_DIR);
      await writeFile(
        join(LOCK_DIR, "owner.json"),
        `${JSON.stringify({
          pid: process.pid,
          started_at: new Date().toISOString(),
          cwd: process.cwd(),
          scope: "runtime-dists",
        }, null, 2)}\n`,
      );
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }

      const lockStat = await stat(LOCK_DIR).catch(() => null);
      if (lockStat && Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
        await rm(LOCK_DIR, { recursive: true, force: true });
        continue;
      }

      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for ${LOCK_DIR}`);
      }

      await sleep(LOCK_POLL_MS);
    }
  }
}

const separatorIndex = process.argv.indexOf("--");
const command = separatorIndex >= 0 ? process.argv[separatorIndex + 1] : undefined;
const args = separatorIndex >= 0 ? process.argv.slice(separatorIndex + 2) : [];

if (!command) {
  console.error("usage: node scripts/with-runtime-dists.mjs -- <command> [...args]");
  process.exit(2);
}

await acquireLock();

try {
  const lockedEnv = {
    ...process.env,
    [LOCK_HELD_ENV]: "1",
  };
  await run("pnpm", ["--filter", "@cristalina-v4/openclaw-adapter", "build"], { cwd: REPO_ROOT, env: lockedEnv });
  await run("pnpm", ["--filter", "@cristalina-v4/hermes-adapter", "build"], { cwd: REPO_ROOT, env: lockedEnv });
  await run(command, args, { env: lockedEnv });
} finally {
  await rm(LOCK_DIR, { recursive: true, force: true });
}
