import assert from "node:assert/strict";
import test from "node:test";

import { CommandUsageError, parseCristalinaCommand } from "./args.js";

test("CLI parser recognizes the planned command surface", () => {
  assert.deepEqual(parseCristalinaCommand(["--help"]), { name: "help" });
  assert.deepEqual(parseCristalinaCommand(["init", "--store-root", "tmp/store"]), {
    name: "init",
    storeRoot: "tmp/store",
  });
  assert.deepEqual(parseCristalinaCommand(["doctor", "--config", "config.json", "--store-root", "tmp/store"]), {
    name: "doctor",
    configPath: "config.json",
    storeRoot: "tmp/store",
  });
  assert.deepEqual(parseCristalinaCommand(["smoke", "dual-runtime"]), {
    name: "smoke",
    target: "dual-runtime",
  });
  assert.deepEqual(parseCristalinaCommand(["install", "openclaw"]), {
    name: "install",
    target: "openclaw",
    configPath: undefined,
    nonInteractive: false,
    metadataPath: undefined,
    runtimeRoot: undefined,
  });
  assert.deepEqual(parseCristalinaCommand(["checkpoint", "create", "--runtime", "openclaw"]), {
    name: "checkpoint",
    action: "create",
    configPath: undefined,
    runtime: "openclaw",
  });
  assert.deepEqual(parseCristalinaCommand(["session-pack", "latest", "--runtime", "hermes"]), {
    name: "session-pack",
    action: "latest",
    configPath: undefined,
    runtime: "hermes",
  });
});

test("CLI parser rejects unknown commands and options", () => {
  assert.throws(() => parseCristalinaCommand(["unknown"]), CommandUsageError);
  assert.throws(() => parseCristalinaCommand(["status", "--bad"]), CommandUsageError);
  assert.throws(() => parseCristalinaCommand(["smoke", "other"]), CommandUsageError);
});
