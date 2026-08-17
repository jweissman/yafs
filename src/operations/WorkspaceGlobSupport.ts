import { AbsolutePath } from "../core/AbsolutePath";
import { CommandContext } from "../commands/CommandContext";

export function safeList(
  context: CommandContext,
  base: AbsolutePath,
): string[] {
  try {
    return context.list(base);
  } catch {
    return [];
  }
}

export function child(base: AbsolutePath, name: string): AbsolutePath {
  return base === "/" ? `/${name}` : `${base}/${name}`;
}
