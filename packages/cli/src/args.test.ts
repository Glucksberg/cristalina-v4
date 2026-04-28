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
});

test("CLI parser rejects unknown commands and options", () => {
  assert.throws(() => parseCristalinaCommand(["unknown"]), CommandUsageError);
  assert.throws(() => parseCristalinaCommand(["status", "--bad"]), CommandUsageError);
  assert.throws(() => parseCristalinaCommand(["smoke", "other"]), CommandUsageError);
});
