import { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";
import { grep } from "../operations/WorkspaceGrep";

export class GrepCommand implements BuiltinCommand {
  readonly name = "grep";
  readonly synopsis = "grep [-n] PATTERN PATH...";
  readonly access = "read" as const;
  constructor() {}
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
