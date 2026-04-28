#!/usr/bin/env node

import { runCristalinaCli } from "./commands.js";

const argv = process.argv.slice(2);
if (argv[0] === "--") {
  argv.shift();
}

const result = await runCristalinaCli(argv);

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

process.exitCode = result.exitCode;
