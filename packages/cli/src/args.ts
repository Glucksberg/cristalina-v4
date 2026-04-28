export type CristalinaCommand =
  | { name: "help" }
  | { name: "init"; storeRoot?: string }
  | { name: "config"; configPath?: string }
  | { name: "doctor"; configPath?: string; storeRoot?: string }
  | { name: "status"; configPath?: string; storeRoot?: string }
  | { name: "smoke"; target: "dual-runtime" }
  | { name: "bridge"; action: "start"; configPath?: string }
  | { name: "projection"; action: "list" | "refresh"; configPath?: string; storeRoot?: string }
  | { name: "reviews"; action: "list" | "apply"; configPath?: string; storeRoot?: string }
  | { name: "install"; target: "openclaw" | "hermes"; configPath?: string };

export class CommandUsageError extends Error {
  readonly exitCode = 2;
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new CommandUsageError(`${name} requires a value`);
  }
  return value;
}

function rejectUnknownOptions(args: string[], allowed: Set<string>): void {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!;
    if (!value.startsWith("--")) continue;
    if (!allowed.has(value)) {
      throw new CommandUsageError(`Unknown option ${value}`);
    }
    index += 1;
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
    rejectUnknownOptions([subcommand, ...rest].filter((value): value is string => Boolean(value)), new Set(["--config"]));
    return { name: "config", configPath: readOption(argv, "--config") };
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
    if (subcommand !== "start") {
      throw new CommandUsageError("bridge requires action start");
    }
    rejectUnknownOptions(rest, new Set(["--config"]));
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
    "  config [--config PATH]",
    "  doctor [--config PATH] [--store-root PATH]",
    "  status [--config PATH] [--store-root PATH]",
    "  smoke dual-runtime",
    "  bridge start [--config PATH]",
    "  projection list [--config PATH] [--store-root PATH]",
    "  projection refresh [--config PATH] [--store-root PATH]",
    "  reviews list [--config PATH] [--store-root PATH]",
    "  reviews apply [--config PATH] [--store-root PATH]",
    "  install openclaw [--config PATH]",
    "  install hermes [--config PATH]",
    "",
  ].join("\n");
}
