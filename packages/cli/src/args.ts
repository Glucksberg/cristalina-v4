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
  | { name: "smoke"; target: "dual-runtime" }
  | { name: "bridge"; action: "start"; configPath?: string }
  | { name: "bridge"; action: "event"; configPath?: string; eventPath: string }
  | { name: "projection"; action: "list" | "refresh"; configPath?: string; storeRoot?: string }
  | { name: "reviews"; action: "list" | "apply"; configPath?: string; storeRoot?: string }
  | { name: "install"; target: "openclaw" | "hermes"; configPath?: string };

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

  if (command === "smoke") {
    if (subcommand !== "dual-runtime") {
      throw new CommandUsageError("smoke requires target dual-runtime");
    }
    rejectUnknownOptions(rest, new Set());
    return { name: "smoke", target: "dual-runtime" };
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

  if (command === "projection") {
    if (subcommand !== "list" && subcommand !== "refresh") {
      throw new CommandUsageError("projection requires action list or refresh");
    }
    rejectUnknownOptions(rest, new Set(["--config", "--store-root"]));
    return {
      name: "projection",
      action: subcommand,
      configPath: readOption(argv, "--config"),
      storeRoot: readOption(argv, "--store-root"),
    };
  }

  if (command === "reviews") {
    if (subcommand !== "list" && subcommand !== "apply") {
      throw new CommandUsageError("reviews requires action list or apply");
    }
    rejectUnknownOptions(rest, new Set(["--config", "--store-root"]));
    return {
      name: "reviews",
      action: subcommand,
      configPath: readOption(argv, "--config"),
      storeRoot: readOption(argv, "--store-root"),
    };
  }

  if (command === "install") {
    if (subcommand !== "openclaw" && subcommand !== "hermes") {
      throw new CommandUsageError("install requires target openclaw or hermes");
    }
    rejectUnknownOptions(rest, new Set(["--config"]));
    return { name: "install", target: subcommand, configPath: readOption(argv, "--config") };
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
    "  smoke dual-runtime",
    "  bridge start [--config PATH]",
    "  bridge event --event PATH [--config PATH]",
    "  projection list [--config PATH] [--store-root PATH]",
    "  projection refresh [--config PATH] [--store-root PATH]",
    "  reviews list [--config PATH] [--store-root PATH]",
    "  reviews apply [--config PATH] [--store-root PATH]",
    "  install openclaw [--config PATH]",
    "  install hermes [--config PATH]",
    "",
  ].join("\n");
}
