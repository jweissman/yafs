import { randomUUID } from "node:crypto";

import { AbsolutePath } from "../../core/AbsolutePath";
import { BuiltinCommand } from "../../commands/BuiltinCommand";
import { CommandContext } from "../../commands/CommandContext";

type RequestFlags = { context?: string; chatId?: string };

class AgentCommand {
  readonly name = "agent";
  readonly synopsis =
    "agent send PERSONA [--context PATH] [--chat CHATID] MESSAGE | status RUN | cancel PERSONA RUN | personas | target PERSONA";
  readonly access = "mutate";

  constructor() {}

  execute(context: CommandContext, args: string[]) {
    return agentAction(this, context, args);
  }

  send(context: CommandContext, args: string[]) {
    const persona = context.required(this.name, args, 1);
    const path = context.agentPersona(persona);
    const runId = randomUUID();
    const request = { ...this.request(context, args), runId };
    context.write(this.ctl(path), JSON.stringify(request));
    return `accepted: ${persona} -> ${path}/runs/${runId}`;
  }

  private request(context: CommandContext, args: string[]) {
    context.required(this.name, args, 2);
    const message = args[args.length - 1];
    const flags = this.flags(context, args.slice(2, -1));
    return { message, ...flags };
  }

  private flags(context: CommandContext, rest: string[]): RequestFlags {
    const flags: RequestFlags = {};
    for (let i = 0; i < rest.length; i += 2) {
      this.applyFlag(context, flags, rest[i], rest[i + 1]);
    }
    return flags;
  }

  private applyFlag(
    context: CommandContext,
    flags: RequestFlags,
    flag: string,
    value: string,
  ) {
    Object.assign(flags, this.flagPatch(context, flag, value));
  }

  private flagPatch(context: CommandContext, flag: string, value: string) {
    return flag === "--chat"
      ? { chatId: value }
      : { context: this.contextValue(context, flag, value) };
  }

  private contextValue(context: CommandContext, flag: string, value: string) {
    if (flag !== "--context") {
      throw new Error(`Unknown agent send flag: ${flag}`);
    }
    return context.read(context.resolve(value));
  }

  status(context: CommandContext, args: string[]) {
    return context.read(
      context.resolve(`${context.required(this.name, args, 1)}/status.json`),
    );
  }

  private ctl(personaPath: AbsolutePath) {
    return `${personaPath}/ctl` as AbsolutePath;
  }

  cancel(context: CommandContext, args: string[]) {
    const persona = context.required(this.name, args, 1);
    const run = context.required(this.name, args, 2);
    const path = context.agentPersona(persona);
    context.write(this.ctl(path), JSON.stringify({ cancel: run }));
    return `cancelling: ${persona} ${run}`;
  }

  personas(context: CommandContext) {
    return JSON.stringify(context.agentPersonas());
  }

  target(context: CommandContext, args: string[]) {
    const persona = context.required(this.name, args, 1);
    return context.agentPersona(persona);
  }
}

export function agentCommands(): BuiltinCommand[] {
  return [new AgentCommand()];
}

function agentAction(
  command: AgentCommand,
  context: CommandContext,
  args: string[],
) {
  const action = agentActions(command)[args[0]];
  return action ? action(context, args) : unknownAction();
}

function unknownAction(): never {
  throw new Error("agent expects send, status, cancel, personas, or target");
}

function agentActions(command: AgentCommand) {
  return {
    send: command.send.bind(command),
    status: command.status.bind(command),
    cancel: command.cancel.bind(command),
    personas: command.personas.bind(command),
    target: command.target.bind(command),
  };
}
