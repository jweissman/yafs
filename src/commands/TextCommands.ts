import { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";
import { grep } from "../operations/WorkspaceGrep";

class GrepCommand implements BuiltinCommand {
  readonly name = "grep";
  readonly synopsis = "grep [-n] PATTERN PATH...";
  readonly access = "read" as const;
  execute(context: CommandContext, args: string[]) {
    const query = this.arguments(args);
    return grep(context, query.pattern, query.paths)
      .map((match) => `${this.prefix(query, match.line - 1)}${match.text}`)
      .join("\n");
  }
  private arguments(args: string[]) {
    const numbered = args[0] === "-n";
    const values = numbered ? args.slice(1) : args;
    if (values.length < 2) {
      throw new Error("grep requires a pattern and path");
    }
    return { numbered, pattern: values[0], paths: values.slice(1) };
  }
  private prefix(query: { numbered: boolean }, index: number) {
    return query.numbered ? `${index + 1}:` : "";
  }
}

class HeadCommand implements BuiltinCommand {
  readonly name = "head";
  readonly synopsis = "head -n COUNT PATH";
  readonly access = "read" as const;
  execute(context: CommandContext, args: string[]) {
    return this.selected(context, args).slice(0, this.count(args)).join("\n");
  }
  private selected(context: CommandContext, args: string[]) {
    return lines(context.read(context.resolve(this.path(args))));
  }
  private count(args: string[]) {
    return count(args, this.name);
  }
  private path(args: string[]) {
    return path(args, this.name);
  }
}

class TailCommand implements BuiltinCommand {
  readonly name = "tail";
  readonly synopsis = "tail -n COUNT PATH";
  readonly access = "read" as const;
  execute(context: CommandContext, args: string[]) {
    return this.selected(context, args).slice(-this.count(args)).join("\n");
  }
  private selected(context: CommandContext, args: string[]) {
    return lines(context.read(context.resolve(this.path(args))));
  }
  private count(args: string[]) {
    return count(args, this.name);
  }
  private path(args: string[]) {
    return path(args, this.name);
  }
}

class WcCommand implements BuiltinCommand {
  readonly name = "wc";
  readonly synopsis = "wc -l PATH";
  readonly access = "read" as const;
  execute(context: CommandContext, args: string[]) {
    return String(this.value(context, args));
  }
  private value(context: CommandContext, args: string[]) {
    return lines(context.read(context.resolve(path(args, this.name)))).length;
  }
}

function lines(value: string) {
  return value === "" ? [] : value.split("\n");
}

function count(args: string[], command: string) {
  if (args[0] !== "-n" || !/^\d+$/.test(args[1] || "")) {
    throw new Error(`${command} requires -n COUNT PATH`);
  }
  return Number(args[1]);
}

function path(args: string[], command: string) {
  const value = args.at(-1);
  if (!value) {
    throw new Error(`${command} requires a path`);
  }
  return value;
}

export function textCommands(): BuiltinCommand[] {
  return [
    new GrepCommand(),
    new HeadCommand(),
    new TailCommand(),
    new WcCommand(),
  ];
}
