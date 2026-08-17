import { CommandContext } from "../../commands/CommandContext";

interface RequestFlags {
  context?: string;
  chatId?: string;
}

export function agentRequest(
  context: CommandContext,
  args: string[],
  command: string,
) {
  context.required(command, args, 2);
  const message = args[args.length - 1];
  return { message, ...flags(context, args.slice(2, -1)) };
}

function flags(context: CommandContext, rest: string[]): RequestFlags {
  const result: RequestFlags = {};
  for (let index = 0; index < rest.length; index += 2) {
    Object.assign(result, flagPatch(context, rest[index], rest[index + 1]));
  }
  return result;
}

function flagPatch(context: CommandContext, flag: string, value: string) {
  return flag === "--chat"
    ? { chatId: value }
    : { context: contextValue(context, flag, value) };
}

function contextValue(context: CommandContext, flag: string, value: string) {
  if (flag !== "--context") {
    throw new Error(`Unknown agent send flag: ${flag}`);
  }
  return context.read(context.resolve(value));
}
