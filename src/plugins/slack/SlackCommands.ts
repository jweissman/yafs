import { AbsolutePath } from "../../core/AbsolutePath";
import { BuiltinCommand } from "../../commands/BuiltinCommand";
import { CommandContext } from "../../commands/CommandContext";

class SlackCommand {
  readonly name = "slack";
  readonly synopsis = "slack send PLUGIN_ID MESSAGE";
  readonly access = "mutate";

  constructor() {}

  execute(context: CommandContext, args: string[]) {
    if (args[0] !== "send") {
      throw new Error("slack expects send");
    }
    return this.send(context, args);
  }

  private send(context: CommandContext, args: string[]) {
    const pluginId = context.required(this.name, args, 1);
    const message = context.required(this.name, args, 2);
    const path = context.slackPlugin(pluginId);
    context.write(`${path}/ctl` as AbsolutePath, JSON.stringify({ message }));
    return `accepted: ${pluginId}`;
  }
}

export function slackCommands(): BuiltinCommand[] {
  return [new SlackCommand()];
}
