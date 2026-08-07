import { VERSION } from "../core/version";
import type { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";

class HelpCommand {
  readonly name = "help";
  readonly synopsis = "help";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext) {
    return context.help();
  }
}
class VersionCommand {
  readonly name = "version";
  readonly synopsis = "version";
  readonly access = "read";
  constructor() {}
  execute() {
    return `yafs ${VERSION}`;
  }
}
class WhoamiCommand {
  readonly name = "whoami";
  readonly synopsis = "whoami";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext) {
    return context.user();
  }
}
class DateCommand {
  readonly name = "date";
  readonly synopsis = "date";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext) {
    return context.clock.now().toISOString();
  }
}
class TrueCommand {
  readonly name = "true";
  readonly synopsis = "true";
  readonly access = "read";
  constructor() {}
  execute() {
    return "";
  }
}
class FalseCommand {
  readonly name = "false";
  readonly synopsis = "false";
  readonly access = "read";
  constructor() {}
  execute(): string {
    throw new Error("false");
  }
}
class EchoCommand {
  readonly name = "echo";
  readonly synopsis = "echo [WORD...]";
  readonly access = "read";
  constructor() {}
  execute(_context: CommandContext, args: string[]) {
    return args.join(" ");
  }
}
class PrintfCommand {
  readonly name = "printf";
  readonly synopsis = "printf [WORD...]";
  readonly access = "read";
  constructor() {}
  execute(_context: CommandContext, args: string[]) {
    return args.join("");
  }
}
class PwdCommand {
  readonly name = "pwd";
  readonly synopsis = "pwd";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext) {
    return context.pwd();
  }
}
class CdCommand {
  readonly name = "cd";
  readonly synopsis = "cd PATH";
  readonly access = "session";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    context.cd(context.required(this.name, args, 0));
    return "";
  }
}

export function sessionCommands(): BuiltinCommand[] {
  return [...infoCommands(), ...shellCommands()];
}

function infoCommands(): BuiltinCommand[] {
  return [
    new HelpCommand(),
    new VersionCommand(),
    new WhoamiCommand(),
    new DateCommand(),
  ];
}

function shellCommands(): BuiltinCommand[] {
  return [
    new TrueCommand(),
    new FalseCommand(),
    new EchoCommand(),
    new PrintfCommand(),
    new PwdCommand(),
    new CdCommand(),
  ];
}
