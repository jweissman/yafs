import { AbsolutePath } from "../core/AbsolutePath";
import { CommandContext } from "./CommandContext";

export function commandPath(
  context: CommandContext,
  args: string[],
  name: string,
): AbsolutePath {
  return context.resolve(context.required(name, args, 0));
}
