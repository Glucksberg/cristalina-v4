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
  assert.deepEqual(parseCristalinaCommand(["smoke", "runtime-wiring"]), {
    name: "smoke",
    target: "runtime-wiring",
  });
  assert.deepEqual(parseCristalinaCommand(["runtime", "preflight", "--config", "config.json", "--openclaw-root", "openclaw", "--hermes-root", "hermes"]), {
    name: "runtime",
    action: "preflight",
    configPath: "config.json",
    openclawRoot: "openclaw",
    hermesRoot: "hermes",
  });
  assert.deepEqual(parseCristalinaCommand(["runtime", "hook-map", "--runtime", "openclaw", "--runtime-root", "openclaw", "--target-config", "openclaw/config.json"]), {
    name: "runtime",
    action: "hook-map",
    runtime: "openclaw",
    runtimeRoot: "openclaw",
    targetConfigPath: "openclaw/config.json",
    mapPath: undefined,
  });
  assert.deepEqual(parseCristalinaCommand(["runtime", "event-template", "--config", "config.json", "--runtime", "hermes", "--event-type", "conversation_preference_signal", "--output", "event.json"]), {
    name: "runtime",
    action: "event-template",
    configPath: "config.json",
    runtime: "hermes",
    eventType: "conversation_preference_signal",
    outputPath: "event.json",
    statement: undefined,
    message: undefined,
  });
  assert.deepEqual(parseCristalinaCommand(["runtime", "event-check", "--config", "config.json", "--event", "event.json"]), {
    name: "runtime",
    action: "event-check",
    configPath: "config.json",
    eventPath: "event.json",
  });
  assert.deepEqual(parseCristalinaCommand(["runtime", "event-verify", "--config", "config.json", "--openclaw-event", "openclaw.json", "--hermes-event", "hermes.json"]), {
    name: "runtime",
    action: "event-verify",
    configPath: "config.json",
    openclawEventPath: "openclaw.json",
    hermesEventPath: "hermes.json",
  });
  assert.deepEqual(parseCristalinaCommand(["install", "openclaw"]), {
    name: "install",
    target: "openclaw",
    configPath: undefined,
    nonInteractive: false,
    metadataPath: undefined,
    runtimeRoot: undefined,
    integrationMode: undefined,
  });
  assert.deepEqual(parseCristalinaCommand(["install", "hermes", "--integration-mode", "provider"]), {
    name: "install",
    target: "hermes",
    configPath: undefined,
    nonInteractive: false,
    metadataPath: undefined,
    runtimeRoot: undefined,
    integrationMode: "provider",
  });
  assert.deepEqual(parseCristalinaCommand([
    "projection",
    "recognition",
    "--query",
    "Cristal",
    "--format",
    "context",
    "--runtime-session-ref",
    "session_001",
    "--conversation-thread-ref",
    "thread_001",
  ]), {
    name: "projection",
    action: "recognition",
    configPath: undefined,
    storeRoot: undefined,
    manifestId: undefined,
    query: "Cristal",
    format: "context",
    write: false,
    runtimeSessionRef: "session_001",
    conversationThreadRef: "thread_001",
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
    checkpointId: undefined,
  });
  assert.deepEqual(parseCristalinaCommand(["session-pack", "compile", "--runtime", "hermes", "--checkpoint-id", "wmc_001"]), {
    name: "session-pack",
    action: "compile",
    configPath: undefined,
    runtime: "hermes",
    checkpointId: "wmc_001",
  });
  assert.deepEqual(parseCristalinaCommand(["session-pack", "verify-handoff", "--config", "config.json", "--checkpoint-id", "wmc_001"]), {
    name: "session-pack",
    action: "verify-handoff",
    configPath: "config.json",
    checkpointId: "wmc_001",
    createCheckpoint: false,
  });
  assert.deepEqual(parseCristalinaCommand(["session-pack", "verify-handoff", "--config", "config.json", "--create-checkpoint"]), {
    name: "session-pack",
    action: "verify-handoff",
    configPath: "config.json",
    checkpointId: undefined,
    createCheckpoint: true,
  });
  assert.deepEqual(parseCristalinaCommand(["diagnostics", "list"]), {
    name: "diagnostics",
    action: "list",
    configPath: undefined,
    storeRoot: undefined,
  });
  assert.deepEqual(parseCristalinaCommand(["projection", "verify", "--config", "config.json", "--store-root", "tmp/store"]), {
    name: "projection",
    action: "verify",
    configPath: "config.json",
    storeRoot: "tmp/store",
    manifestId: undefined,
    query: undefined,
    format: undefined,
    write: false,
  });
  assert.deepEqual(parseCristalinaCommand(["projection", "recognition", "--query", "Fluck memory", "--format", "context", "--write"]), {
    name: "projection",
    action: "recognition",
    configPath: undefined,
    storeRoot: undefined,
    manifestId: undefined,
    query: "Fluck memory",
    format: "context",
    write: true,
  });
  assert.deepEqual(parseCristalinaCommand(["store", "inspect"]), {
    name: "store",
    action: "inspect",
    configPath: undefined,
    storeRoot: undefined,
  });
});

test("CLI parser rejects unknown commands and options", () => {
  assert.throws(() => parseCristalinaCommand(["unknown"]), CommandUsageError);
  assert.throws(() => parseCristalinaCommand(["status", "--bad"]), CommandUsageError);
  assert.throws(() => parseCristalinaCommand(["smoke", "other"]), CommandUsageError);
  assert.throws(() => parseCristalinaCommand(["install", "hermes", "--integration-mode", "invalid"]), CommandUsageError);
  assert.throws(() => parseCristalinaCommand(["projection", "recognition", "--format", "invalid"]), CommandUsageError);
});
