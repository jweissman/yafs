import { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";
import { grep, GrepResult } from "../operations/WorkspaceGrep";

const FLAGS = new Set(["-n", "-i", "-v", "-c", "-l"]);

export class GrepCommand implements BuiltinCommand {
  readonly name = "grep";
  readonly synopsis = "grep [-n] [-i] [-v] [-c] [-l] PATTERN PATH...";
  readonly access = "read" as const;
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    const query = this.arguments(args);
    const backing = this.singleGitBacking(context, query.paths);
    return backing
      ? this.gitExecute(context, query, backing)
      : render(query, this.vfsResult(context, query));
  }

  private vfsResult(context: CommandContext, query: Query) {
    return grep(context, query.pattern, query.paths, {
      ignoreCase: query.flags.has("-i"),
      invert: query.flags.has("-v"),
      countOnly: query.flags.has("-c"),
      filesOnly: query.flags.has("-l"),
    });
  }

  private singleGitBacking(context: CommandContext, paths: string[]) {
    return paths.length === 1
      ? context.gitBacking(context.resolve(paths[0]))
      : undefined;
  }

  private async gitExecute(
    context: CommandContext,
    query: Query,
    backing: NonNullable<ReturnType<CommandContext["gitBacking"]>>,
  ) {
    const options = gitOptions(query);
    const result = await context.gitGrep(backing, query.pattern, options);
    return render(query, result);
  }

  private arguments(args: string[]): Query {
    const { flags, rest } = takeFlags(args);
    if (rest.length < 2) {
      throw new Error("grep requires a pattern and path");
    }
    return { flags, pattern: rest[0], paths: rest.slice(1) };
  }
}

interface Query {
  flags: Set<string>;
  pattern: string;
  paths: string[];
}

function gitOptions(query: Query) {
  return { ignoreCase: query.flags.has("-i"), invert: query.flags.has("-v") };
}

function takeFlags(args: string[]) {
  const flags = new Set<string>();
  let index = 0;
  while (index < args.length && FLAGS.has(args[index])) {
    flags.add(args[index]);
    index += 1;
  }
  return { flags, rest: args.slice(index) };
}

function render(query: { flags: Set<string> }, result: GrepResult): string {
  if (query.flags.has("-c")) {
    return String(result.count);
  }
  if (query.flags.has("-l")) {
    return result.files.join("\n");
  }
  return renderMatches(query.flags.has("-n"), result);
}

function renderMatches(numbered: boolean, result: GrepResult): string {
  return result.matches
    .map((match) => `${numbered ? `${String(match.line)}:` : ""}${match.text}`)
    .join("\n");
}
