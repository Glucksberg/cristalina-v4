#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: process.env,
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

const separatorIndex = process.argv.indexOf("--");
const command = separatorIndex >= 0 ? process.argv[separatorIndex + 1] : undefined;
const args = separatorIndex >= 0 ? process.argv.slice(separatorIndex + 2) : [];

if (!command) {
  console.error("usage: node scripts/with-runtime-dists.mjs -- <command> [...args]");
  process.exit(2);
}

await run("pnpm", ["--filter", "@cristalina-v4/openclaw-adapter", "build"], { cwd: REPO_ROOT });
await run("pnpm", ["--filter", "@cristalina-v4/hermes-adapter", "build"], { cwd: REPO_ROOT });
await run(command, args);
