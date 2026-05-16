export type CristalinaCommand =
  | { name: "help" }
  | { name: "init"; storeRoot?: string }
  | {
      name: "config";
      configPath?: string;
      init?: boolean;
      nonInteractive?: boolean;
      storeRoot?: string;
      ownerIdentityRef?: string;
      agentIdentityRef?: string;
      operatorRef?: string;
      principalKind?: "owner" | "participant" | "system";
      principalActorRef?: string;
      openclawRuntimeRef?: string;
      hermesRuntimeRef?: string;
    }
  | { name: "doctor"; configPath?: string; storeRoot?: string }
  | { name: "status"; configPath?: string; storeRoot?: string }
  | {
      name: "update";
      configPath?: string;
      runtime?: "openclaw" | "hermes";
      runtimeRoot?: string;
      integrationMode?: "provider" | "bridge" | "both";
      skipSourceUpdate?: boolean;
      skipBuild?: boolean;
      skipInstall?: boolean;
    }
  | { name: "smoke"; target: "dual-runtime" | "runtime-wiring" }
  | { name: "runtime"; action: "preflight"; configPath?: string; openclawRoot?: string; hermesRoot?: string }
  | { name: "runtime"; action: "hook-map"; runtime: "openclaw" | "hermes"; runtimeRoot: string; targetConfigPath?: string; mapPath?: string }
  | {
      name: "runtime";
      action: "event-template";
      configPath?: string;
      runtime: "openclaw" | "hermes";
      eventType: "message_observed" | "conversation_preference_signal" | "runtime_diagnostic" | "checkpoint_requested";
      outputPath: string;
      statement?: string;
      message?: string;
    }
  | { name: "runtime"; action: "event-check"; configPath?: string; eventPath: string }
  | { name: "runtime"; action: "event-verify"; configPath?: string; openclawEventPath: string; hermesEventPath: string }
  | { name: "bridge"; action: "start"; configPath?: string }
  | { name: "bridge"; action: "event"; configPath?: string; eventPath: string }
  | {
      name: "memory";
      action: "consolidation";
      configPath?: string;
      storeRoot?: string;
      runtime: "openclaw" | "hermes";
      write?: boolean;
      maxRecentEvents?: number;
      runtimeInstanceRef?: string;
      runtimeSessionRef?: string;
      conversationThreadRef?: string;
    }
  | {
      name: "memory";
      action: "mature";
      configPath?: string;
      storeRoot?: string;
      runtime: "openclaw" | "hermes";
      write?: boolean;
      maxItems?: number;
      llmOutputPath?: string;
      evidenceOutputPath?: string;
    }
  | {
      name: "memory";
      action: "candidates";
      configPath?: string;
      storeRoot?: string;
      runtime: "openclaw" | "hermes";
      limit?: number;
    }
  | {
      name: "memory";
      action: "promote-candidates";
      configPath?: string;
      storeRoot?: string;
      runtime: "openclaw" | "hermes";
      limit?: number;
      write?: boolean;
    }
  | { name: "checkpoint"; action: "create"; configPath?: string; runtime: "openclaw" | "hermes" }
  | { name: "session-pack"; action: "compile" | "latest" | "consume" | "apply"; configPath?: string; runtime: "openclaw" | "hermes"; checkpointId?: string }
  | { name: "session-pack"; action: "verify-handoff"; configPath?: string; checkpointId?: string; createCheckpoint?: boolean }
  | {
      name: "projection";
      action: "list" | "show" | "refresh" | "verify" | "recognition";
      configPath?: string;
      storeRoot?: string;
      manifestId?: string;
      query?: string;
      format?: "json" | "context";
      write?: boolean;
      runtimeInstanceRef?: string;
      runtimeSessionRef?: string;
      conversationThreadRef?: string;
    }
  | {
      name: "reviews";
      action: "list" | "apply" | "decide";
      configPath?: string;
      storeRoot?: string;
      runtime?: "openclaw" | "hermes";
      queueId?: string;
      ownerDecisions?: boolean;
      proposalRef?: string;
      decisionAction?: "ratify" | "subsume" | "keep_maturing" | "reject" | "move_to_wiki";
      reason?: string;
      targetCanonRef?: string;
      wikiPage?: string;
      dryRun?: boolean;
      actor?: string;
    }
  | { name: "diagnostics"; action: "list"; configPath?: string; storeRoot?: string }
  | { name: "store"; action: "inspect" | "recover"; configPath?: string; storeRoot?: string }
  | {
      name: "install";
      target: "openclaw" | "hermes";
      configPath?: string;
      nonInteractive?: boolean;
      metadataPath?: string;
      runtimeRoot?: string;
      integrationMode?: "provider" | "bridge" | "both";
    };

export class CommandUsageError extends Error {
  readonly exitCode = 2;
}

type OptionKind = "flag" | "value";

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new CommandUsageError(`${name} requires a value`);
  }
  return value;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function rejectUnknownOptions(args: string[], allowed: Map<string, OptionKind> | Set<string>): void {
  const allowedMap = allowed instanceof Set
    ? new Map([...allowed].map((entry) => [entry, "value" as const]))
    : allowed;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!;
    if (!value.startsWith("--")) continue;
    const kind = allowedMap.get(value);
    if (!kind) {
      throw new CommandUsageError(`Unknown option ${value}`);
    }
    if (kind === "value") {
      index += 1;
    }
  }
}

export function parseCristalinaCommand(argv: string[]): CristalinaCommand {
  const [command, subcommand, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { name: "help" };
  }

  if (command === "init") {
    rejectUnknownOptions([subcommand, ...rest].filter((value): value is string => Boolean(value)), new Set(["--store-root"]));
    return { name: "init", storeRoot: readOption(argv, "--store-root") };
  }

  if (command === "config") {
    const optionArgs = [subcommand, ...rest].filter((value): value is string => Boolean(value));
    rejectUnknownOptions(optionArgs, new Map([
      ["--config", "value"],
      ["--init", "flag"],
      ["--non-interactive", "flag"],
      ["--store-root", "value"],
      ["--owner", "value"],
      ["--agent", "value"],
      ["--operator", "value"],
      ["--principal-kind", "value"],
      ["--principal-actor", "value"],
      ["--openclaw-runtime", "value"],
      ["--hermes-runtime", "value"],
    ]));
    const principalKind = readOption(argv, "--principal-kind");
    if (
      principalKind !== undefined &&
      principalKind !== "owner" &&
      principalKind !== "participant" &&
      principalKind !== "system"
    ) {
      throw new CommandUsageError("--principal-kind must be owner, participant, or system");
    }
    return {
      name: "config",
      configPath: readOption(argv, "--config"),
      init: hasFlag(argv, "--init"),
      nonInteractive: hasFlag(argv, "--non-interactive"),
      storeRoot: readOption(argv, "--store-root"),
      ownerIdentityRef: readOption(argv, "--owner"),
      agentIdentityRef: readOption(argv, "--agent"),
      operatorRef: readOption(argv, "--operator"),
      principalKind,
      principalActorRef: readOption(argv, "--principal-actor"),
      openclawRuntimeRef: readOption(argv, "--openclaw-runtime"),
      hermesRuntimeRef: readOption(argv, "--hermes-runtime"),
    };
  }

  if (command === "doctor" || command === "status") {
    rejectUnknownOptions([subcommand, ...rest].filter((value): value is string => Boolean(value)), new Set(["--config", "--store-root"]));
    return {
      name: command,
      configPath: readOption(argv, "--config"),
      storeRoot: readOption(argv, "--store-root"),
    };
  }

  if (command === "update") {
    rejectUnknownOptions([subcommand, ...rest].filter((value): value is string => Boolean(value)), new Map([
      ["--config", "value"],
      ["--runtime", "value"],
      ["--runtime-root", "value"],
      ["--integration-mode", "value"],
      ["--skip-source-update", "flag"],
      ["--skip-build", "flag"],
      ["--skip-install", "flag"],
    ]));
    const runtime = readOption(argv, "--runtime");
    if (runtime !== undefined && runtime !== "openclaw" && runtime !== "hermes") {
      throw new CommandUsageError("--runtime must be openclaw or hermes");
    }
    const integrationMode = readOption(argv, "--integration-mode");
    if (
      integrationMode !== undefined &&
      integrationMode !== "provider" &&
      integrationMode !== "bridge" &&
      integrationMode !== "both"
    ) {
      throw new CommandUsageError("--integration-mode must be provider, bridge, or both");
    }
    return {
      name: "update",
      configPath: readOption(argv, "--config"),
      runtime,
      runtimeRoot: readOption(argv, "--runtime-root"),
      integrationMode,
      skipSourceUpdate: hasFlag(argv, "--skip-source-update"),
      skipBuild: hasFlag(argv, "--skip-build"),
      skipInstall: hasFlag(argv, "--skip-install"),
    };
  }

  if (command === "smoke") {
    if (subcommand !== "dual-runtime" && subcommand !== "runtime-wiring") {
      throw new CommandUsageError("smoke requires target dual-runtime or runtime-wiring");
    }
    rejectUnknownOptions(rest, new Set());
    return { name: "smoke", target: subcommand };
  }

  if (command === "runtime") {
    if (subcommand !== "preflight" && subcommand !== "hook-map" && subcommand !== "event-template" && subcommand !== "event-check" && subcommand !== "event-verify") {
      throw new CommandUsageError("runtime requires action preflight, hook-map, event-template, event-check, or event-verify");
    }
    if (subcommand === "hook-map") {
      rejectUnknownOptions(rest, new Map([
        ["--runtime", "value"],
        ["--runtime-root", "value"],
        ["--target-config", "value"],
        ["--map", "value"],
      ]));
      const runtime = readOption(argv, "--runtime");
      if (runtime !== "openclaw" && runtime !== "hermes") {
        throw new CommandUsageError("runtime hook-map requires --runtime openclaw or hermes");
      }
      const runtimeRoot = readOption(argv, "--runtime-root");
      if (!runtimeRoot) {
        throw new CommandUsageError("runtime hook-map requires --runtime-root PATH");
      }
      return {
        name: "runtime",
        action: "hook-map",
        runtime,
        runtimeRoot,
        targetConfigPath: readOption(argv, "--target-config"),
        mapPath: readOption(argv, "--map"),
      };
    }
    if (subcommand === "event-template") {
      rejectUnknownOptions(rest, new Map([
        ["--config", "value"],
        ["--runtime", "value"],
        ["--event-type", "value"],
        ["--output", "value"],
        ["--statement", "value"],
        ["--message", "value"],
      ]));
      const runtime = readOption(argv, "--runtime");
      if (runtime !== "openclaw" && runtime !== "hermes") {
        throw new CommandUsageError("runtime event-template requires --runtime openclaw or hermes");
      }
      const eventType = readOption(argv, "--event-type");
      if (
        eventType !== "message_observed" &&
        eventType !== "conversation_preference_signal" &&
        eventType !== "runtime_diagnostic" &&
        eventType !== "checkpoint_requested"
      ) {
        throw new CommandUsageError("runtime event-template requires --event-type message_observed, conversation_preference_signal, runtime_diagnostic, or checkpoint_requested");
      }
      const outputPath = readOption(argv, "--output");
      if (!outputPath) {
        throw new CommandUsageError("runtime event-template requires --output PATH");
      }
      return {
        name: "runtime",
        action: "event-template",
        configPath: readOption(argv, "--config"),
        runtime,
        eventType,
        outputPath,
        statement: readOption(argv, "--statement"),
        message: readOption(argv, "--message"),
      };
    }
    if (subcommand === "event-check") {
      rejectUnknownOptions(rest, new Map([
        ["--config", "value"],
        ["--event", "value"],
      ]));
      const eventPath = readOption(argv, "--event");
      if (!eventPath) {
        throw new CommandUsageError("runtime event-check requires --event PATH");
      }
      return {
        name: "runtime",
        action: "event-check",
        configPath: readOption(argv, "--config"),
        eventPath,
      };
    }
    if (subcommand === "event-verify") {
      rejectUnknownOptions(rest, new Map([
        ["--config", "value"],
        ["--openclaw-event", "value"],
        ["--hermes-event", "value"],
      ]));
      const openclawEventPath = readOption(argv, "--openclaw-event");
      const hermesEventPath = readOption(argv, "--hermes-event");
      if (!openclawEventPath || !hermesEventPath) {
        throw new CommandUsageError("runtime event-verify requires --openclaw-event PATH and --hermes-event PATH");
      }
      return {
        name: "runtime",
        action: "event-verify",
        configPath: readOption(argv, "--config"),
        openclawEventPath,
        hermesEventPath,
      };
    }
    rejectUnknownOptions(rest, new Map([
      ["--config", "value"],
      ["--openclaw-root", "value"],
      ["--hermes-root", "value"],
    ]));
    return {
      name: "runtime",
      action: "preflight",
      configPath: readOption(argv, "--config"),
      openclawRoot: readOption(argv, "--openclaw-root"),
      hermesRoot: readOption(argv, "--hermes-root"),
    };
  }

  if (command === "bridge") {
    if (subcommand !== "start" && subcommand !== "event") {
      throw new CommandUsageError("bridge requires action start or event");
    }
    rejectUnknownOptions(rest, new Map([
      ["--config", "value"],
      ["--event", "value"],
    ]));
    if (subcommand === "event") {
      const eventPath = readOption(argv, "--event");
      if (!eventPath) {
        throw new CommandUsageError("bridge event requires --event PATH");
      }
      return { name: "bridge", action: "event", configPath: readOption(argv, "--config"), eventPath };
    }
    return { name: "bridge", action: "start", configPath: readOption(argv, "--config") };
  }

  if (command === "memory") {
    if (subcommand !== "consolidation" && subcommand !== "mature" && subcommand !== "candidates" && subcommand !== "promote-candidates") {
      throw new CommandUsageError("memory requires action consolidation, mature, candidates, or promote-candidates");
    }
    const commonOptions = new Map<string, OptionKind>([
      ["--config", "value"],
      ["--store-root", "value"],
      ["--runtime", "value"],
      ["--write", "flag"],
    ]);
    if (subcommand === "mature") {
      rejectUnknownOptions(rest, new Map([
        ...commonOptions,
        ["--max-items", "value"],
        ["--llm-output", "value"],
        ["--evidence-output", "value"],
      ]));
      const runtime = readOption(argv, "--runtime") ?? "hermes";
      if (runtime !== "openclaw" && runtime !== "hermes") {
        throw new CommandUsageError("memory mature requires --runtime openclaw or hermes");
      }
      const maxItemsRaw = readOption(argv, "--max-items");
      const maxItems = maxItemsRaw === undefined ? undefined : Number(maxItemsRaw);
      if (maxItems !== undefined && (!Number.isInteger(maxItems) || maxItems < 1)) {
        throw new CommandUsageError("--max-items must be a positive integer");
      }
      return {
        name: "memory",
        action: "mature",
        configPath: readOption(argv, "--config"),
        storeRoot: readOption(argv, "--store-root"),
        runtime,
        write: hasFlag(argv, "--write"),
        maxItems,
        llmOutputPath: readOption(argv, "--llm-output"),
        evidenceOutputPath: readOption(argv, "--evidence-output"),
      };
    }
    if (subcommand === "candidates") {
      rejectUnknownOptions(rest, new Map([
        ...commonOptions,
        ["--limit", "value"],
      ]));
      const runtime = readOption(argv, "--runtime") ?? "hermes";
      if (runtime !== "openclaw" && runtime !== "hermes") {
        throw new CommandUsageError("memory candidates requires --runtime openclaw or hermes");
      }
      const limitRaw = readOption(argv, "--limit");
      const limit = limitRaw === undefined ? undefined : Number(limitRaw);
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        throw new CommandUsageError("--limit must be a positive integer");
      }
      return {
        name: "memory",
        action: "candidates",
        configPath: readOption(argv, "--config"),
        storeRoot: readOption(argv, "--store-root"),
        runtime,
        limit,
      };
    }
    if (subcommand === "promote-candidates") {
      rejectUnknownOptions(rest, new Map([
        ...commonOptions,
        ["--limit", "value"],
        ["--write", "flag"],
      ]));
      const runtime = readOption(argv, "--runtime") ?? "hermes";
      if (runtime !== "openclaw" && runtime !== "hermes") {
        throw new CommandUsageError("memory promote-candidates requires --runtime openclaw or hermes");
      }
      const limitRaw = readOption(argv, "--limit");
      const limit = limitRaw === undefined ? undefined : Number(limitRaw);
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        throw new CommandUsageError("--limit must be a positive integer");
      }
      return {
        name: "memory",
        action: "promote-candidates",
        configPath: readOption(argv, "--config"),
        storeRoot: readOption(argv, "--store-root"),
        runtime,
        limit,
        write: hasFlag(argv, "--write"),
      };
    }
    rejectUnknownOptions(rest, new Map([
      ...commonOptions,
      ["--max-recent-events", "value"],
      ["--runtime-instance-ref", "value"],
      ["--runtime-session-ref", "value"],
      ["--conversation-thread-ref", "value"],
    ]));
    const runtime = readOption(argv, "--runtime") ?? "hermes";
    if (runtime !== "openclaw" && runtime !== "hermes") {
      throw new CommandUsageError("memory consolidation requires --runtime openclaw or hermes");
    }
    const maxRecentEventsRaw = readOption(argv, "--max-recent-events");
    const maxRecentEvents = maxRecentEventsRaw === undefined ? undefined : Number(maxRecentEventsRaw);
    if (maxRecentEvents !== undefined && (!Number.isInteger(maxRecentEvents) || maxRecentEvents < 1)) {
      throw new CommandUsageError("--max-recent-events must be a positive integer");
    }
    return {
      name: "memory",
      action: "consolidation",
      configPath: readOption(argv, "--config"),
      storeRoot: readOption(argv, "--store-root"),
      runtime,
      write: hasFlag(argv, "--write"),
      maxRecentEvents,
      runtimeInstanceRef: readOption(argv, "--runtime-instance-ref"),
      runtimeSessionRef: readOption(argv, "--runtime-session-ref"),
      conversationThreadRef: readOption(argv, "--conversation-thread-ref"),
    };
  }

  if (command === "checkpoint") {
    if (subcommand !== "create") {
      throw new CommandUsageError("checkpoint requires action create");
    }
    rejectUnknownOptions(rest, new Map([
      ["--config", "value"],
      ["--runtime", "value"],
    ]));
    const runtime = readOption(argv, "--runtime");
    if (runtime !== "openclaw" && runtime !== "hermes") {
      throw new CommandUsageError("checkpoint create requires --runtime openclaw or hermes");
    }
    return { name: "checkpoint", action: "create", configPath: readOption(argv, "--config"), runtime };
  }

  if (command === "session-pack") {
    if (subcommand !== "compile" && subcommand !== "latest" && subcommand !== "consume" && subcommand !== "apply" && subcommand !== "verify-handoff") {
      throw new CommandUsageError("session-pack requires action compile, latest, consume, apply, or verify-handoff");
    }
    if (subcommand === "verify-handoff") {
      rejectUnknownOptions(rest, new Map([
        ["--config", "value"],
        ["--checkpoint-id", "value"],
        ["--create-checkpoint", "flag"],
      ]));
      return {
        name: "session-pack",
        action: "verify-handoff",
        configPath: readOption(argv, "--config"),
        checkpointId: readOption(argv, "--checkpoint-id"),
        createCheckpoint: hasFlag(argv, "--create-checkpoint"),
      };
    }
    rejectUnknownOptions(rest, new Map([
      ["--config", "value"],
      ["--runtime", "value"],
      ["--checkpoint-id", "value"],
    ]));
    const runtime = readOption(argv, "--runtime");
    if (runtime !== "openclaw" && runtime !== "hermes") {
      throw new CommandUsageError("session-pack requires --runtime openclaw or hermes");
    }
    return { name: "session-pack", action: subcommand, configPath: readOption(argv, "--config"), runtime, checkpointId: readOption(argv, "--checkpoint-id") };
  }

  if (command === "projection") {
    if (subcommand !== "list" && subcommand !== "show" && subcommand !== "refresh" && subcommand !== "verify" && subcommand !== "recognition") {
      throw new CommandUsageError("projection requires action list, show, refresh, verify, or recognition");
    }
    rejectUnknownOptions(rest, new Map([
      ["--config", "value"],
      ["--store-root", "value"],
      ["--manifest", "value"],
      ["--query", "value"],
      ["--format", "value"],
      ["--write", "flag"],
      ["--runtime-instance-ref", "value"],
      ["--runtime-session-ref", "value"],
      ["--conversation-thread-ref", "value"],
    ]));
    const format = readOption(argv, "--format");
    if (format !== undefined && format !== "json" && format !== "context") {
      throw new CommandUsageError("--format must be json or context");
    }
    const runtimeInstanceRef = readOption(argv, "--runtime-instance-ref");
    const runtimeSessionRef = readOption(argv, "--runtime-session-ref");
    const conversationThreadRef = readOption(argv, "--conversation-thread-ref");
    return {
      name: "projection",
      action: subcommand,
      configPath: readOption(argv, "--config"),
      storeRoot: readOption(argv, "--store-root"),
      manifestId: readOption(argv, "--manifest"),
      query: readOption(argv, "--query"),
      format,
      write: hasFlag(argv, "--write"),
      ...(subcommand === "recognition" && runtimeInstanceRef !== undefined ? { runtimeInstanceRef } : {}),
      ...(subcommand === "recognition" && runtimeSessionRef !== undefined ? { runtimeSessionRef } : {}),
      ...(subcommand === "recognition" && conversationThreadRef !== undefined ? { conversationThreadRef } : {}),
    };
  }

  if (command === "reviews") {
    if (subcommand !== "list" && subcommand !== "apply" && subcommand !== "decide") {
      throw new CommandUsageError("reviews requires action list, apply, or decide");
    }
    rejectUnknownOptions(rest, new Map([
      ["--config", "value"],
      ["--store-root", "value"],
      ["--runtime", "value"],
      ["--queue-id", "value"],
      ["--owner-decisions", "flag"],
      ["--proposal", "value"],
      ["--action", "value"],
      ["--reason", "value"],
      ["--target-canon", "value"],
      ["--wiki-page", "value"],
      ["--dry-run", "flag"],
      ["--actor", "value"],
    ]));
    const runtime = readOption(argv, "--runtime");
    if (runtime !== undefined && runtime !== "openclaw" && runtime !== "hermes") {
      throw new CommandUsageError("--runtime must be openclaw or hermes");
    }
    const decisionAction = readOption(argv, "--action");
    if (
      decisionAction !== undefined &&
      decisionAction !== "ratify" &&
      decisionAction !== "subsume" &&
      decisionAction !== "keep_maturing" &&
      decisionAction !== "reject" &&
      decisionAction !== "move_to_wiki"
    ) {
      throw new CommandUsageError("--action must be ratify, subsume, keep_maturing, reject, or move_to_wiki");
    }
    return {
      name: "reviews",
      action: subcommand,
      configPath: readOption(argv, "--config"),
      storeRoot: readOption(argv, "--store-root"),
      runtime,
      queueId: readOption(argv, "--queue-id"),
      ownerDecisions: hasFlag(argv, "--owner-decisions"),
      proposalRef: readOption(argv, "--proposal"),
      decisionAction,
      reason: readOption(argv, "--reason"),
      targetCanonRef: readOption(argv, "--target-canon"),
      wikiPage: readOption(argv, "--wiki-page"),
      dryRun: hasFlag(argv, "--dry-run"),
      actor: readOption(argv, "--actor"),
    };
  }

  if (command === "diagnostics") {
    if (subcommand !== "list") {
      throw new CommandUsageError("diagnostics requires action list");
    }
    rejectUnknownOptions(rest, new Set(["--config", "--store-root"]));
    return { name: "diagnostics", action: "list", configPath: readOption(argv, "--config"), storeRoot: readOption(argv, "--store-root") };
  }

  if (command === "store") {
    if (subcommand !== "inspect" && subcommand !== "recover") {
      throw new CommandUsageError("store requires action inspect or recover");
    }
    rejectUnknownOptions(rest, new Set(["--config", "--store-root"]));
    return { name: "store", action: subcommand, configPath: readOption(argv, "--config"), storeRoot: readOption(argv, "--store-root") };
  }

  if (command === "install") {
    if (subcommand !== "openclaw" && subcommand !== "hermes") {
      throw new CommandUsageError("install requires target openclaw or hermes");
    }
    rejectUnknownOptions(rest, new Map([
      ["--config", "value"],
      ["--non-interactive", "flag"],
      ["--metadata", "value"],
      ["--runtime-root", "value"],
      ["--integration-mode", "value"],
    ]));
    const integrationMode = readOption(argv, "--integration-mode");
    if (
      integrationMode !== undefined &&
      integrationMode !== "provider" &&
      integrationMode !== "bridge" &&
      integrationMode !== "both"
    ) {
      throw new CommandUsageError("--integration-mode must be provider, bridge, or both");
    }
    return {
      name: "install",
      target: subcommand,
      configPath: readOption(argv, "--config"),
      nonInteractive: hasFlag(argv, "--non-interactive"),
      metadataPath: readOption(argv, "--metadata"),
      runtimeRoot: readOption(argv, "--runtime-root"),
      integrationMode,
    };
  }

  throw new CommandUsageError(`Unknown command ${command}`);
}

export function helpText(): string {
  return [
    "cristalina <command>",
    "",
    "Commands:",
    "  init [--store-root PATH]",
    "  config [--config PATH] [--init] [--non-interactive]",
    "  doctor [--config PATH] [--store-root PATH]",
    "  status [--config PATH] [--store-root PATH]",
    "  update [--config PATH] [--runtime openclaw|hermes] [--runtime-root PATH] [--integration-mode provider|bridge|both]",
    "  smoke dual-runtime",
    "  smoke runtime-wiring",
    "  runtime preflight [--config PATH] [--openclaw-root PATH] [--hermes-root PATH]",
    "  runtime hook-map --runtime openclaw|hermes --runtime-root PATH [--target-config PATH] [--map PATH]",
    "  runtime event-template --runtime openclaw|hermes --event-type TYPE --output PATH [--config PATH]",
    "  runtime event-check --event PATH [--config PATH]",
    "  runtime event-verify --openclaw-event PATH --hermes-event PATH [--config PATH]",
    "  bridge start [--config PATH]",
    "  bridge event --event PATH [--config PATH]",
    "  memory consolidation [--runtime openclaw|hermes] [--write] [--max-recent-events N] [--config PATH] [--store-root PATH]",
    "  memory mature [--runtime openclaw|hermes] [--write] [--max-items N] [--evidence-output PATH] [--llm-output PATH] [--config PATH] [--store-root PATH]",
    "  memory candidates [--runtime openclaw|hermes] [--limit N] [--config PATH] [--store-root PATH]",
    "  memory promote-candidates [--runtime openclaw|hermes] [--write] [--limit N] [--config PATH] [--store-root PATH]",
    "  checkpoint create --runtime openclaw|hermes [--config PATH]",
    "  session-pack compile --runtime openclaw|hermes [--checkpoint-id ID] [--config PATH]",
    "  session-pack latest --runtime openclaw|hermes [--config PATH]",
    "  session-pack consume --runtime openclaw|hermes [--checkpoint-id ID] [--config PATH]",
    "  session-pack apply --runtime openclaw|hermes [--checkpoint-id ID] [--config PATH]",
    "  session-pack verify-handoff (--checkpoint-id ID|--create-checkpoint) [--config PATH]",
    "  projection list [--config PATH] [--store-root PATH]",
    "  projection show --manifest ID [--config PATH] [--store-root PATH]",
    "  projection refresh [--config PATH] [--store-root PATH]",
    "  projection recognition [--query TEXT] [--format json|context] [--runtime-session-ref ID] [--conversation-thread-ref ID] [--write] [--config PATH] [--store-root PATH]",
    "  projection verify [--config PATH] [--store-root PATH]",
    "  reviews list [--owner-decisions] [--config PATH] [--store-root PATH]",
    "  reviews apply --runtime openclaw|hermes --queue-id ID [--config PATH] [--store-root PATH]",
    "  reviews decide --proposal ID --action ratify|subsume|keep_maturing|move_to_wiki|reject [--target-canon ID] [--wiki-page auto|ID] [--reason TEXT] [--dry-run] [--config PATH] [--store-root PATH]",
    "  diagnostics list [--config PATH] [--store-root PATH]",
    "  store inspect [--config PATH] [--store-root PATH]",
    "  store recover [--config PATH] [--store-root PATH]",
    "  install openclaw [--config PATH] [--non-interactive]",
    "  install hermes [--config PATH] [--non-interactive] [--integration-mode provider|bridge|both]",
    "",
  ].join("\n");
}
