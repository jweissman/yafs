import { BuiltinCommand } from './BuiltinCommand'
import { CommandContext } from './CommandContext'

class AgentCommand {
  readonly name = 'agent'; readonly synopsis = 'agent send PERSONA [--context PATH] MESSAGE | status RUN | cancel PERSONA RUN'
  readonly access = 'mutate'

  execute(context: CommandContext, args: string[]) {
    return agentAction(this, context, args)
  }

  send(context: CommandContext, args: string[]) {
    const persona = context.required(this.name, args, 1); const request = this.request(context, args)
    context.write(this.ctl(context, persona), JSON.stringify(request))
    return `accepted: ${persona}`
  }

  private request(context: CommandContext, args: string[]) {
    if (args[2] !== '--context') return { message: context.required(this.name, args, 2) }
    const path = context.required(this.name, args, 3); const message = context.required(this.name, args, 4)
    return { message, context: context.read(context.resolve(path)) }
  }

  status(context: CommandContext, args: string[]) {
    return context.read(context.resolve(`${context.required(this.name, args, 1)}/status.json`))
  }

  private ctl(context: CommandContext, persona: string) { return context.resolve(`${persona}/ctl`) }

  cancel(context: CommandContext, args: string[]) {
    const persona = context.required(this.name, args, 1); const run = context.required(this.name, args, 2)
    context.write(this.ctl(context, persona), JSON.stringify({ cancel: run })); return `cancelling: ${run}`
  }
}

export function agentCommands(): BuiltinCommand[] { return [new AgentCommand()] }

function agentAction(command: AgentCommand, context: CommandContext, args: string[]) {
  const action = agentActions(command)[args[0]]
  if (action) return action(context, args)
  throw new Error('agent expects send, status, or cancel')
}

function agentActions(command: AgentCommand) {
  return { send: command.send.bind(command), status: command.status.bind(command),
    cancel: command.cancel.bind(command) }
}
